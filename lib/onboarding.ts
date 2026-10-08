import { accountKind } from "./balances.ts";
import { categoryGroupFor } from "./categories.ts";
import { merchantRuleKey } from "./classification.ts";
import { defaultAccountCoverage } from "./profile.ts";
import { groupCommitmentTransactions, paymentMethodFor } from "./recurring-commitments.ts";
import { inferRecurringFrequency } from "./recurring.ts";
import { goalCurrentFromBalances } from "./goals.ts";
import type { AccountKind, Goal, OnboardingStep, RecurringCommitment, Store, Tx } from "./types.ts";

export const ONBOARDING_VERSION = 1;
export const ONBOARDING_STEPS: OnboardingStep[] = ["welcome", "accounts", "import", "income", "commitments", "categories", "goals", "review"];
const legacyType: Record<AccountKind,string> = { current:"Current account", savings:"Cash", "cash-isa":"Cash ISA", "investment-isa":"Stocks & Shares ISA", investment:"Investment", "credit-card":"Credit card", mortgage:"Mortgage", loan:"Loan", pension:"Pension", property:"Property", other:"Other" };
const liability = new Set<AccountKind>(["credit-card", "mortgage", "loan"]);
const today = () => new Date().toISOString().slice(0,10);

/** Absence means an installation/backup predating onboarding, never a fresh start. */
export const shouldShowOnboarding = (store: Store) => store.onboarding?.version === ONBOARDING_VERSION && store.onboarding.status !== "completed";
export function setOnboardingStep(store: Store, step: OnboardingStep): Store {
  return { ...store, onboarding:{version:ONBOARDING_VERSION,status:"in-progress",step} };
}
export function finishOnboarding(store: Store): Store {
  return { ...store, onboarding:{version:ONBOARDING_VERSION,status:"completed",step:"review"} };
}
export function addOnboardingAccount(store: Store, input:{id:string;name:string;kind:AccountKind;balance?:number;asOf?:string;coverage?:"required"|"optional"|"excluded"}): Store {
  if (!store.profile) throw new Error("Profile is unavailable.");
  const name=input.name.trim();
  if(!name || store.profile.accounts.some(account=>account.id===input.id))throw new Error("Enter a unique account name and identifier.");
  if(input.balance!==undefined && (!Number.isFinite(input.balance)||input.balance<0))throw new Error("Enter a valid non-negative balance.");
  const account={id:input.id,name,kind:input.kind,coverage:input.coverage??defaultAccountCoverage(input.kind)};
  return {...store,profile:{...store.profile,accounts:[...store.profile.accounts,account]},balances:[...store.balances,{id:input.id,name,group:liability.has(input.kind)?"liability" as const:"asset" as const,type:legacyType[input.kind],value:input.balance??0,...(input.balance!==undefined?{asOf:input.asOf??today()}:{})}],updatedAt:today()};
}
export function setOnboardingBalance(store:Store,id:string,value:number,asOf:string):Store {
  if(!Number.isFinite(value)||value<0||!/^\d{4}-\d{2}-\d{2}$/.test(asOf))throw new Error("Enter a valid balance and date.");
  return {...store,balances:store.balances.map(balance=>balance.id===id?{...balance,value,asOf}:balance),updatedAt:today()};
}
export type IncomeSuggestion = { key:string;merchant:string;amount:number;count:number;lastDate:string };
export function incomeSuggestions(transactions:Tx[]):IncomeSuggestion[] {
  const groups=new Map<string,Tx[]>();
  for(const row of transactions.filter(row=>row.amount>0&&row.date)){
    const key=merchantRuleKey(row.merchant);if(!key)continue;
    groups.set(key,[...(groups.get(key)??[]),row]);
  }
  return [...groups].flatMap(([key,rows])=>{
    if(new Set(rows.map(row=>row.date.slice(0,7))).size<2)return [];
    const amounts=rows.map(row=>row.amount).sort((a,b)=>a-b);const amount=amounts[Math.floor(amounts.length/2)];
    if(rows.some(row=>Math.abs(row.amount-amount)>Math.max(5,amount*.2)))return [];
    const latest=[...rows].sort((a,b)=>b.date.localeCompare(a.date))[0];
    return [{key,merchant:latest.merchant,amount,count:rows.length,lastDate:latest.date}];
  }).sort((a,b)=>b.amount-a.amount);
}
export function configureIncome(store:Store,alias:string,kind:"salary"|"rental",payday?:number):Store {
  if(!store.profile)throw new Error("Profile is unavailable.");
  const clean=alias.trim().toLowerCase();if(!clean)throw new Error("Enter a payee or income source.");
  if(payday!==undefined&&(!Number.isInteger(payday)||payday<1||payday>31))throw new Error("Payday must be from 1 to 31.");
  const incomeSources=[...(store.profile.incomeSources??[])];
  const index=incomeSources.findIndex(source=>source.kind===kind);
  if(index<0)incomeSources.push({kind,merchantContains:[clean]});
  else incomeSources[index]={...incomeSources[index],merchantContains:[...new Set([...incomeSources[index].merchantContains,clean])]};
  const income=store.profile.categories?.find(item=>item.group==="income"&&item.enabled);
  const sub=income?.subcategories.find(item=>item.role===(kind==="salary"?"salary":"rental-income"))??income?.subcategories.find(item=>item.name.toLowerCase().includes(kind==="salary"?"salary":"rent"));
  const transactions=store.transactions.map(row=>row.amount>0&&!row.classificationOverride&&row.merchant.toLowerCase().includes(clean)?{...row,category:income?.name??"Income",categoryId:income?.id,subcategory:sub?.name??(kind==="salary"?"Salary":"Rental income"),subcategoryId:sub?.id,role:kind==="salary"?"salary" as const:"rental-income" as const}:row);
  const paySchedule=payday===undefined?store.profile.paySchedule:{payday,rules:store.profile.paySchedule?.rules??[]};
  return {...store,transactions,profile:{...store.profile,incomeSources,...(paySchedule?{paySchedule}:{})},...(payday===undefined?{}:{payday,paydayRules:paySchedule?.rules??[]}),updatedAt:today()};
}
export type CommitmentSuggestion = RecurringCommitment & { count:number };
export function commitmentSuggestions(store:Store):CommitmentSuggestion[] {
  const saved=new Map((store.recurringCommitments??[]).map(row=>[row.id,row]));
  return groupCommitmentTransactions(store.transactions).flatMap(group=>{
    const rows=group.transactions.sort((a,b)=>a.date.localeCompare(b.date));
    if(new Set(rows.map(row=>row.date.slice(0,7))).size<2)return [];
    const latest=rows.at(-1)!;if(categoryGroupFor(store.profile,latest)==="property"||latest.role==="transfer"||latest.role==="debt-repayment")return [];
    const amountValues=rows.map(row=>-row.amount).sort((a,b)=>a-b);const amount=amountValues[Math.floor(amountValues.length/2)];
    if(rows.some(row=>Math.abs(-row.amount-amount)>Math.max(5,amount*.15)))return [];
    const explicit=rows.some(row=>row.spendingTreatment==="Recurring"||/direct debit|standing order/i.test(row.transactionType??""));
    if(!explicit&&rows.length<3)return [];
    const existing=saved.get(group.id);
    const suggestion:CommitmentSuggestion={id:group.id,key:group.key,label:latest.merchant,category:latest.category,subcategory:latest.subcategory,reference:group.reference,description:group.description,scheduledAmount:amount,frequency:inferRecurringFrequency(rows.map(row=>({date:row.date,amount:-row.amount}))),lastDate:latest.date,paymentMethod:paymentMethodFor(latest),status:existing?.status??"detected",source:explicit?"Explicit recurring transaction":"Repeated payment pattern",archived:existing?.archived,count:rows.length};
    return [{...suggestion,...existing,count:rows.length}];
  });
}
export function decideCommitment(store:Store,suggestion:CommitmentSuggestion,decision:"confirm"|"reject",amount=suggestion.scheduledAmount):Store {
  if(!Number.isFinite(amount)||amount<=0)throw new Error("Enter a positive commitment amount.");
  const record:RecurringCommitment={...suggestion,scheduledAmount:amount,status:"user-overridden",archived:decision==="reject"};
  return {...store,recurringCommitments:[...(store.recurringCommitments??[]).filter(item=>item.id!==record.id),record],updatedAt:today()};
}
export function addOnboardingGoal(store:Store,input:{id:string;name:string;target:number;current?:number}):Store {
  if(!store.profile)throw new Error("Profile is unavailable.");
  const name=input.name.trim();if(!name||!Number.isFinite(input.target)||input.target<=0)throw new Error("Enter a goal name and positive target.");
  if(store.goals.some(goal=>goal.id===input.id))throw new Error("This goal already exists.");
  const goal:Goal={id:input.id,name,target:input.target,current:input.current??0,colour:"#397ca0"};
  goal.current=input.current??goalCurrentFromBalances(goal,store.balances);
  return {...store,goals:[...store.goals,goal],profile:{...store.profile,goals:[...store.profile.goals,{id:goal.id,name:goal.name,target:goal.target,colour:goal.colour}]},updatedAt:today()};
}
export function onboardingReview(store:Store){
  const current=store.profile?.accounts.some(account=>account.kind==="current")??false;
  const currentBalance=store.balances.some(balance=>accountKind(balance)==="current"&&Boolean(balance.asOf));
  const salary=store.profile?.incomeSources?.some(source=>source.kind==="salary")??false;
  const warnings=[...(!current?["No current account yet — cash views will be limited."]:[]),...(current&&!currentBalance?["Add a dated current-account balance to calculate Cash Runway."]:[]),...(!salary?["No salary source confirmed — pay-cycle views may be limited."]:[]),...(!(store.profile?.paySchedule)?["No payday configured — pay-cycle views may be limited."]:[])];
  return {accounts:store.profile?.accounts.length??0,transactions:store.transactions.length,imports:store.imports?.length??0,incomeSources:store.profile?.incomeSources?.length??0,payday:store.profile?.paySchedule?.payday,commitments:store.recurringCommitments?.filter(item=>item.status!=="detected"&&!item.archived).length??0,categories:store.profile?.categories?.filter(item=>item.enabled).length??0,goals:store.goals.length,warnings};
}
