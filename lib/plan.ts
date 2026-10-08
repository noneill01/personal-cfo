import type { DirectDebitFrequency, Tx } from "./types.ts";
import { inferRecurringFrequency, recurringDatesInRange } from "./recurring.ts";
import { groupCommitmentTransactions } from "./recurring-commitments.ts";
import { categoryGroupFor } from "./categories.ts";
import { hasRole } from "./transaction-roles.ts";
import type { UserProfile } from "./types.ts";

export type PlanCommitmentDetail={key:string;label:string;category:string;amount:number;source:string};
export type PlanCategoryRow={name:string;lastCycleActual:number;fixedCommitments:number;plannedAmount:number;explicitlyEdited:boolean;commitmentDetails:PlanCommitmentDetail[]};
export type RecurringCommitmentDefinition={id?:string;evidenceId?:string;key:string;label:string;category:string;subcategory?:string;reference?:string;description?:string;expected:number;scheduledAmount:number;frequency:DirectDebitFrequency;lastDate:string;source:string;payments:{date:string;amount:number}[]};

export function isPersonalPlanCommitment(commitment:{key:string;category:string}, rental?:{rentalCategory:string;rentalMortgageMerchantKey:string}){
  return commitment.key!==rental?.rentalMortgageMerchantKey&&commitment.category!==rental?.rentalCategory;
}

export function selectLastCompletedCycle(currentCycleKey:string,availableCycleKeys:string[],isComplete:(key:string)=>boolean){
  return [...new Set(availableCycleKeys)].filter(key=>key<currentCycleKey&&isComplete(key)).sort().at(-1)??"";
}

const median=(values:number[])=>{const ordered=[...values].sort((a,b)=>a-b);return ordered.length?ordered[Math.floor(ordered.length/2)]:0};
const recurringSource=(transaction:Tx,frequency:DirectDebitFrequency)=>{
  const label=`${frequency[0].toUpperCase()}${frequency.slice(1)}`;
  if(/card payment/i.test(transaction.transactionType??"")||/barclaycard|credit card/i.test(transaction.account))return `${label} · recurring card payment`;
  if(/transfer/i.test(transaction.transactionType??""))return `${label} · recurring transfer`;
  return `${label} · recurring payment`;
};

/**
 * Turns persisted, explicit Recurring classifications into commitments. A
 * repeated merchant pattern alone is deliberately insufficient evidence.
 */
export function explicitRecurringCommitments(transactions:Tx[],excludedKeys:Iterable<string>=[],rentalCategory?:string,profile?:UserProfile):RecurringCommitmentDefinition[] {
  const excluded=new Set(excludedKeys);
  return groupCommitmentTransactions(transactions.filter(transaction=>transaction.amount<0&&transaction.category!==rentalCategory&&categoryGroupFor(profile,transaction)!=="property"))
  .filter(group=>!excluded.has(group.key)&&group.transactions.some(transaction=>transaction.spendingTreatment==="Recurring"&&!hasRole(transaction,"maintenance")))
  .map(group=>{
    const confirmation=group.transactions.find(transaction=>transaction.spendingTreatment==="Recurring")!;
    const matches=group.transactions;
    const byDate=matches.reduce<Record<string,number>>((result,transaction)=>{result[transaction.date]=(result[transaction.date]??0)-transaction.amount;return result},{});
    const payments=Object.entries(byDate).sort(([a],[b])=>a.localeCompare(b)).map(([date,amount])=>({date,amount}));
    const frequency=inferRecurringFrequency(payments);
    const scheduledAmount=median(payments.slice(-3).map(payment=>payment.amount));
    const frequencyMonths=frequency==="monthly"?1:frequency==="quarterly"?3:frequency==="annual"?12:0;
    const expected=frequency==="weekly"?scheduledAmount*52/12:frequencyMonths?scheduledAmount/frequencyMonths:0;
    return {id:group.id,key:group.key,label:confirmation.merchant,category:confirmation.category,subcategory:group.subcategory,reference:group.reference,description:group.description,expected,scheduledAmount,frequency,lastDate:payments.at(-1)?.date??confirmation.date,source:recurringSource(confirmation,frequency),payments};
  }).filter(commitment=>commitment.expected>0);
}

/** First source wins for the same obligation, not merely the same merchant. */
export function dedupeRecurringCommitments(...groups:RecurringCommitmentDefinition[][]):RecurringCommitmentDefinition[] {
  const merged=new Map<string,RecurringCommitmentDefinition>();
  groups.flat().forEach(commitment=>{const id=commitment.id??`merchant:${commitment.key}`;if(!merged.has(id))merged.set(id,commitment)});
  return [...merged.values()];
}

export function expectedPlanCommitmentAmount({
  frequency,expected,scheduledAmount,lastDate,payments,planningStart,planningEnd,lastCycleStart,lastCycleEnd,
}:{frequency:DirectDebitFrequency;expected:number;scheduledAmount:number;lastDate:string;payments:{date:string;amount:number}[];planningStart:string;planningEnd:string;lastCycleStart:string;lastCycleEnd:string}){
  if(frequency==="irregular")return 0;
  if(frequency==="monthly"){
    const evidenced=payments.filter(payment=>payment.date>=lastCycleStart&&payment.date<=lastCycleEnd).reduce((sum,payment)=>sum+payment.amount,0);
    return evidenced||expected;
  }
  return recurringDatesInRange(lastDate,frequency,planningStart,planningEnd).length*scheduledAmount;
}

export function buildPlanRows({categories,lastCycleSpend,commitments,storedPlan}:{categories:string[];lastCycleSpend:Record<string,number>;commitments:PlanCommitmentDetail[];storedPlan?:Record<string,number>}){
  return categories.map<PlanCategoryRow>(name=>{
    const money=(value:number)=>Math.round((value+Number.EPSILON)*100)/100;
    const commitmentDetails=commitments.filter(commitment=>commitment.category===name&&commitment.amount>0).map(commitment=>({...commitment,amount:money(commitment.amount)}));
    const fixedCommitments=money(commitmentDetails.reduce((sum,commitment)=>sum+commitment.amount,0));
    const lastCycleActual=money(Math.max(0,lastCycleSpend[name]??0));
    const explicitlyEdited=Object.prototype.hasOwnProperty.call(storedPlan??{},name);
    const seededAmount=Math.max(lastCycleActual,fixedCommitments);
    const plannedAmount=money(Math.max(fixedCommitments,explicitlyEdited?Math.max(0,storedPlan![name]):seededAmount));
    return {name,lastCycleActual,fixedCommitments,plannedAmount,explicitlyEdited,commitmentDetails};
  });
}

export function summarizeNextCyclePlan({planningIncome,essentials,lifestyle,futureTotal}:{planningIncome:number;essentials:PlanCategoryRow[];lifestyle:PlanCategoryRow[];futureTotal:number}){
  const money=(value:number)=>Math.round((value+Number.EPSILON)*100)/100;
  const fixedCommitments=money([...essentials,...lifestyle].reduce((sum,row)=>sum+row.fixedCommitments,0));
  const variableEssentials=money(essentials.reduce((sum,row)=>sum+Math.max(0,row.plannedAmount-row.fixedCommitments),0));
  const lifestyleTotal=money(lifestyle.reduce((sum,row)=>sum+Math.max(0,row.plannedAmount-row.fixedCommitments),0));
  const allocated=money(fixedCommitments+variableEssentials+lifestyleTotal+futureTotal);
  return {planningIncome:money(planningIncome),fixedCommitments,variableEssentials,lifestyle:lifestyleTotal,futureYou:money(futureTotal),allocated,unallocated:money(planningIncome-allocated)};
}
