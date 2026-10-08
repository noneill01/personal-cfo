import test from "node:test";
import assert from "node:assert/strict";
import { createFreshStore, migrateUserProfile, applyUserProfile } from "../lib/profile.ts";
import { addOnboardingAccount, addOnboardingGoal, commitmentSuggestions, configureIncome, decideCommitment, finishOnboarding, incomeSuggestions, onboardingReview, ONBOARDING_STEPS, setOnboardingBalance, setOnboardingStep, shouldShowOnboarding } from "../lib/onboarding.ts";
import { accountKind, currentAccountBalance, debtBalance } from "../lib/balances.ts";
import { parseBackup, serialiseBackup } from "../lib/backup.ts";
import { financeStoresMatch } from "../lib/storage.ts";
import { addCategory, addSubcategory, updateCategory } from "../lib/categories.ts";
import { genericCsvImporter, monzoImporter, normaliseBarclaycardImport, normaliseGenericCsvImport, normaliseMonzoImport } from "../lib/importers.ts";
import { parseBarclaycardCsv, parseMonzoCsv } from "../lib/imports.ts";
import { previewTransactionImport, commitTransactionImport } from "../lib/import-workflow.ts";
import { isSalaryTransaction, payCycleKey } from "../lib/pay-cycles.ts";
import { activeCommitmentDefinitions, reconcileRecurringCommitments } from "../lib/recurring-commitments.ts";

const row=(id,date,merchant,amount,extra={})=>({id,date,merchant,amount,account:"account-main",category:amount>0?"Income":"Bills",...extra});
const mapping={version:1,id:"synthetic-map",name:"Example CSV",accountId:"account-main",dateColumn:"Date",descriptionColumn:"Payee",amountMode:"single",amountColumn:"Amount",dateFormat:"UK",spendingSign:"negative"};

test("genuine fresh install enters versioned onboarding; legacy and completed stores do not",()=>{
  const fresh=createFreshStore();assert.equal(shouldShowOnboarding(fresh),true);assert.deepEqual(fresh.onboarding,{version:1,status:"not-started",step:"welcome"});
  assert.deepEqual(fresh.profile.accounts,[]);assert.deepEqual(fresh.profile.goals,[]);assert.equal(fresh.profile.incomeSources,undefined);assert.equal(fresh.profile.paySchedule,undefined);
  assert.deepEqual(ONBOARDING_STEPS,["welcome","accounts","import","income","commitments","categories","goals","review"]);
  const migrated=migrateUserProfile({...fresh,profile:undefined,onboarding:undefined});assert.equal(shouldShowOnboarding(migrated),false);
  assert.equal(shouldShowOnboarding(finishOnboarding(fresh)),false);
  assert.equal(shouldShowOnboarding({...fresh,onboarding:undefined}),false);
});

test("progress persists in backup and same store; old backups bypass without starter overwrite",()=>{
  let fresh=setOnboardingStep(createFreshStore(),"income");fresh=addOnboardingAccount(fresh,{id:"account-main",name:"Everyday",kind:"current",balance:450,asOf:"2026-10-01"});
  const restored=parseBackup(serialiseBackup(fresh));assert.deepEqual(restored.onboarding,fresh.onboarding);assert.equal(restored.profile.accounts[0].name,"Everyday");assert.equal(shouldShowOnboarding(restored),true);
  const old={...fresh,onboarding:undefined};const oldRestored=applyUserProfile(migrateUserProfile(parseBackup(serialiseBackup(old))));assert.equal(shouldShowOnboarding(oldRestored),false);assert.deepEqual(oldRestored.profile.accounts,old.profile.accounts);assert.equal(oldRestored.balances[0].value,450);
  assert.equal(financeStoresMatch(fresh,restored),true);
});

test("accounts support every canonical kind, multiples, no provider and dated balances",()=>{
  let store=createFreshStore();const kinds=["current","savings","cash-isa","investment-isa","investment","credit-card","mortgage","loan","pension","property","other"];
  for(const [index,kind] of kinds.entries())store=addOnboardingAccount(store,{id:`account-${index}`,name:`Example ${index}`,kind,balance:100+index,asOf:"2026-10-01"});
  store=addOnboardingAccount(store,{id:"second-current",name:"Second current",kind:"current"});
  assert.deepEqual(store.balances.slice(0,kinds.length).map(accountKind),kinds);assert.equal(store.profile.accounts.filter(account=>account.kind==="current").length,2);
  assert.equal(store.profile.accounts.some(account=>"provider" in account),false);assert.equal(currentAccountBalance(store.balances),100);assert.ok(debtBalance(store.balances)>0);
  store=setOnboardingBalance(store,"second-current",75,"2026-10-02");assert.equal(store.balances.at(-1).value,75);assert.equal(store.balances.at(-1).asOf,"2026-10-02");
  assert.throws(()=>addOnboardingAccount(store,{id:"bad",name:"Invalid",kind:"savings",balance:-1}),/valid/);
});

test("known provider and generic CSV both retain preview, dedupe, mapping and skip behaviour",async()=>{
  let store=addOnboardingAccount(createFreshStore(),{id:"account-main",name:"Everyday",kind:"current",balance:100,asOf:"2026-09-01"});
  const text="Date,Payee,Amount\n01/09/2026,Example shop,-10\n02/09/2026,Example payroll,1000\n";
  const parsed=genericCsvImporter.normalise(await genericCsvImporter.preview(text,mapping));const draft=normaliseGenericCsvImport(parsed,mapping,store.profile,false);
  const preview=previewTransactionImport(store,draft,"2026-09-03T12:00:00Z");assert.equal(preview.fresh.length,2);
  const first=commitTransactionImport(store,draft,"example.csv","2026-09-03T12:00:00Z");store=first.store;
  assert.equal(store.transactions.length,2);assert.equal(store.imports.length,1);assert.equal(commitTransactionImport(store,draft,"example.csv","2026-09-03T12:00:00Z").record.skipped,2);
  assert.equal(store.profile.accounts.length,1);assert.equal(store.balances[0].value,100);
  const monzo="Transaction ID,Date,Name,Amount,Category,Type\nabc,01/09/2026,Cafe,-5.00,Eating out,Card payment\n";
  assert.equal((await monzoImporter.preview(monzo,undefined)).transactions.length,1);
  assert.equal(setOnboardingStep(store,"income").onboarding.step,"income");
});

test("known-provider imports target fresh generic accounts without legacy IDs",()=>{
  let store=addOnboardingAccount(createFreshStore(),{id:"account-current",name:"Everyday",kind:"current",balance:100,asOf:"2026-09-01"});
  store=addOnboardingAccount(store,{id:"account-card",name:"Credit card",kind:"credit-card",balance:20,asOf:"2026-08-01"});
  const bank=parseMonzoCsv("Transaction ID,Date,Name,Amount,Category,Type\nabc,02/09/2026,Example shop,-5.00,Groceries,Card payment\n");
  const bankDraft=normaliseMonzoImport(bank,store.profile,"account-current");
  assert.equal(bankDraft.accountId,"account-current");
  assert.equal(previewTransactionImport(store,bankDraft,"2026-09-05T12:00:00Z").fresh.length,1);
  store=commitTransactionImport(store,bankDraft,"bank.csv","2026-09-05T12:00:00Z").store;
  assert.equal(store.imports[0].accountId,"account-current");
  const card=parseBarclaycardCsv("Date,Description,Amount,Statement Balance,Statement Date\n03/09/2026,Example merchant,12.50,120,04/09/2026\n","card.csv");
  const cardDraft=normaliseBarclaycardImport(card,"card.csv",store.profile,"account-card");
  const cardPreview=previewTransactionImport(store,cardDraft,"2026-09-05T12:00:00Z");
  assert.deepEqual(cardPreview.effects.balanceUpdates,[{accountId:"account-card",value:120,asOf:"2026-09-04"}]);
  store=commitTransactionImport(store,cardDraft,"card.csv","2026-09-05T12:00:00Z").store;
  assert.equal(store.imports[0].accountId,"account-card");assert.equal(store.balances.find(item=>item.id==="account-card").value,120);
  assert.equal(normaliseMonzoImport(bank).accountId,"monzo-current");
  assert.equal(normaliseBarclaycardImport(card,"card.csv").accountId,"barclaycard-debt");
});

test("income suggestions are non-mutating and confirmation adds source, role and schedule",()=>{
  let store=createFreshStore();store.transactions=[row("a","2026-08-25","Example Payroll",2000),row("b","2026-09-25","Example Payroll",2000),row("c","2026-09-02","Example tenant",600)];
  assert.equal(incomeSuggestions(store.transactions)[0].merchant,"Example Payroll");assert.equal(store.profile.incomeSources,undefined);assert.equal(store.transactions[0].role,undefined);
  store=configureIncome(store,"Example Payroll","salary",25);assert.equal(store.profile.paySchedule.payday,25);assert.equal(store.transactions[0].role,"salary");assert.equal(isSalaryTransaction(store.transactions[0],store.profile.incomeSources),true);assert.equal(payCycleKey("2026-09-26",25),"2026-09");
  store=configureIncome(store,"Example tenant","rental");assert.equal(store.transactions[2].role,"rental-income");assert.equal(store.profile.incomeSources.length,2);
  assert.throws(()=>configureIncome(store,"","salary"),/Enter/);
});

test("explicit and conservatively repeated commitments can be confirmed or rejected",()=>{
  let store=createFreshStore();store.transactions=[row("a","2026-08-01","Membership",-25,{transactionType:"Card payment",spendingTreatment:"Recurring"}),row("b","2026-09-01","Membership",-25,{transactionType:"Card payment"}),row("c","2026-08-03","Corner shop",-12,{transactionType:"Card payment"}),row("d","2026-09-03","Corner shop",-12,{transactionType:"Card payment"})];
  const suggestions=commitmentSuggestions(store);assert.deepEqual(suggestions.map(item=>item.label),["Membership"]);assert.equal(store.recurringCommitments,undefined);
  store=decideCommitment(store,suggestions[0],"confirm");assert.equal(store.recurringCommitments[0].status,"user-overridden");assert.equal(store.recurringCommitments[0].paymentMethod,"card");
  const active=activeCommitmentDefinitions(store.recurringCommitments,store.transactions,[]);assert.equal(active.length,1);
  const detected=[{...suggestions[0],status:"detected",scheduledAmount:30}];assert.equal(reconcileRecurringCommitments(store.recurringCommitments,detected)[0].scheduledAmount,25);assert.equal(reconcileRecurringCommitments(store.recurringCommitments,detected)[0].status,"user-overridden");
  store=decideCommitment(store,suggestions[0],"reject");assert.equal(activeCommitmentDefinitions(store.recurringCommitments,store.transactions,[]).length,0);
});

test("category stable IDs, groups, optional goals and review warnings survive finish",()=>{
  let store=createFreshStore();const original=store.profile.categories.find(item=>item.name==="Bills");
  const renamed=updateCategory(store.profile.categories,original.id,{name:"Regular costs",group:"essential"});
  const added=addCategory(renamed,"Pets","lifestyle");const withSub=addSubcategory(added,added.at(-1).id,"Food");
  store={...store,profile:{...store.profile,categories:withSub}};
  assert.equal(store.profile.categories.find(item=>item.id===original.id).name,"Regular costs");assert.equal(store.profile.categories.find(item=>item.id===original.id).group,"essential");assert.equal(store.profile.categories.at(-1).subcategories[0].name,"Food");
  assert.match(onboardingReview(store).warnings.join(" "),/No current account/);assert.match(onboardingReview(store).warnings.join(" "),/No salary/);
  store=addOnboardingAccount(store,{id:"account-main",name:"Main",kind:"current"});assert.match(onboardingReview(store).warnings.join(" "),/Cash Runway/);
  store=addOnboardingGoal(store,{id:"goal-1",name:"Reserve",target:5000});assert.equal(store.profile.goals[0].target,5000);assert.equal(store.goals[0].target,5000);
  store=addOnboardingGoal(store,{id:"ef",name:"Emergency fund",target:3000});assert.equal(store.goals.find(goal=>goal.id==="ef").current,0);
  const completed=finishOnboarding(store);assert.equal(completed.profile,store.profile);assert.equal(shouldShowOnboarding(completed),false);
  assert.equal(onboardingReview(createFreshStore()).goals,0);
});
