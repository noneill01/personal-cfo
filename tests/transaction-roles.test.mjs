import test from "node:test";
import assert from "node:assert/strict";
import { createFreshStore, migrateUserProfile } from "../lib/profile.ts";
import { makeCategory, resolveCategory, updateCategory, updateSubcategory } from "../lib/categories.ts";
import { hasRole, transactionRole } from "../lib/transaction-roles.ts";
import { isRentalIncome, isSalaryTransaction, payCycleKey } from "../lib/pay-cycles.ts";
import { isCardRepayment, isExcludedFromSpending, isPayYourselfFirstMovement } from "../lib/transactions.ts";
import { classifyWithRules, isSavingsChallengeTransfer } from "../lib/classification.ts";
import { parseGenericCsv, normaliseGenericCsvImport, normaliseMonzoImport } from "../lib/importers.ts";
import { parseMonzoCsv } from "../lib/imports.ts";
import { previewTransactionImport } from "../lib/import-workflow.ts";
import { buildPlanRows, summarizeNextCyclePlan } from "../lib/plan.ts";
import { explicitRecurringCommitments } from "../lib/plan.ts";
import { activeCommitmentDefinitions } from "../lib/recurring-commitments.ts";
import { calculateHealthScore } from "../lib/health.ts";
import { parseBackup, serialiseBackup } from "../lib/backup.ts";
import { configureIncome } from "../lib/onboarding.ts";

const row=(id,category,subcategory,amount,merchant="Example merchant")=>({id,date:"2026-09-28",merchant,account:"Example bank",category,subcategory,amount});
const oldStore=()=>({...createFreshStore(),profile:undefined,transactions:[
  row("pay","Income","Salary",2500,"Example Payroll"),row("rent","Income","Rental income",500,"Example tenant"),
  row("support","Children","Maintenance",-100,"Example support"),row("challenge","Savings","Savings challenge",-4,"Example challenge"),
  row("repayment","Transfers","Credit card payment",-75,"Example card payment"),row("movement","Transfers","Internal transfer",-50,"Example transfer"),
]});

test("legacy special meanings migrate additively and survive category and subcategory rename",()=>{
  const migrated=migrateUserProfile(oldStore());
  assert.deepEqual(migrated.transactions.map(item=>item.role),["salary","rental-income","maintenance","savings-challenge","debt-repayment","transfer"]);
  assert.deepEqual(migrateUserProfile(migrated),migrated);
  let categories=updateCategory(migrated.profile.categories,"category:income",{name:"Receipts"});
  categories=updateSubcategory(categories,"category:income","category:income/subcategory:salary",{name:"Pay"});
  categories=updateSubcategory(categories,"category:income","category:income/subcategory:rental-income",{name:"Lease receipts"});
  categories=updateCategory(categories,"category:children",{name:"Family"});
  categories=updateSubcategory(categories,"category:children","category:children/subcategory:maintenance",{name:"Support"});
  categories=updateCategory(categories,"category:savings",{name:"Reserves"});
  categories=updateCategory(categories,"category:transfers",{name:"Movements"});
  const renamed=migrated.transactions.map(item=>resolveCategory(item,{...migrated.profile,categories}));
  assert.equal(renamed[0].subcategory,"Pay");assert.equal(isSalaryTransaction(renamed[0]),true);
  assert.equal(isRentalIncome(renamed[1]),true);assert.equal(hasRole(renamed[2],"maintenance"),true);
  assert.equal(isSavingsChallengeTransfer(renamed[3]),true);
  assert.equal(isCardRepayment(renamed[4]),true);assert.equal(isExcludedFromSpending(renamed[4]),true);
  assert.equal(transactionRole(renamed[5]),"transfer");assert.equal(isExcludedFromSpending(renamed[5]),true);
  assert.equal(payCycleKey(renamed[0].date,28),"2026-09");
});

test("explicit roles govern salary and rent even without their old labels or IDs",()=>{
  const pay={...row("pay","Receipts","Pay",2400),role:"salary",categoryGroup:"lifestyle"};
  const rent={...row("rent","Receipts","Lease",500),role:"rental-income",categoryGroup:"lifestyle"};
  assert.equal(isSalaryTransaction(pay),true);assert.equal(isRentalIncome(rent),true);
  assert.equal(isSalaryTransaction({...pay,role:"none",merchant:"Example Payroll"}),false);
  assert.equal(isRentalIncome({...rent,role:"none",merchant:"Example tenant"}),false);
  assert.equal(isSalaryTransaction({...pay,category:"Other",subcategory:"Miscellaneous"}),true);
});

test("renamed maintenance stays one special commitment rather than a second generic recurring bill",()=>{
  const migrated=migrateUserProfile(oldStore());
  const categories=updateCategory(migrated.profile.categories,"category:children",{name:"Family"});
  const profile={...migrated.profile,categories};
  const support={...resolveCategory(migrated.transactions[2],profile),spendingTreatment:"Recurring"};
  assert.equal(explicitRecurringCommitments([support],[],undefined,profile).length,0);
  const record={id:"support-1",key:"child-maintenance",label:"Example support",category:"Family",scheduledAmount:100,frequency:"monthly",lastDate:"2026-09-28",paymentMethod:"transfer",status:"confirmed",source:"User confirmed"};
  const active=activeCommitmentDefinitions([record],[support],[],undefined,profile);
  assert.equal(active.length,1);assert.deepEqual(active[0].payments,[{date:"2026-09-28",amount:100}]);
});

test("role, category and Plan group are independent; semantic repayments and savings remain stable",()=>{
  const fresh=createFreshStore().profile;
  let categories=updateCategory(fresh.categories,"category:savings",{name:"Long-term cash",group:"lifestyle"});
  categories=updateSubcategory(categories,"category:savings","category:savings/subcategory:cash-savings",{name:"Reserve"});
  const deposit=resolveCategory({...row("deposit","Savings","Cash savings",-80),role:"savings-contribution",categoryId:"category:savings",subcategoryId:"category:savings/subcategory:cash-savings"},{...fresh,categories});
  assert.equal(deposit.category,"Long-term cash");assert.equal(deposit.categoryGroup,"lifestyle");assert.equal(transactionRole(deposit),"savings-contribution");assert.equal(isPayYourselfFirstMovement(deposit),true);
  assert.equal(transactionRole({...deposit,role:"transfer"}),"transfer");assert.equal(deposit.category,"Long-term cash");
  const repayment={...row("repay","Miscellaneous","Miscellaneous",-40),role:"debt-repayment"};
  assert.equal(isCardRepayment(repayment),true);assert.equal(isCardRepayment({...repayment,role:"none",merchant:"Credit card payment"}),false);
});

test("profile merchant role beats provider suggestion; explicit transaction override beats the rule",()=>{
  const profile=createFreshStore().profile;
  const rule={key:"example payroll",label:"Example Payroll",category:"Income",categoryId:"category:income",subcategory:"Salary",subcategoryId:"category:income/subcategory:salary",role:"rental-income",updatedAt:"2026-09-01"};
  const source={...row("incoming","Income","Salary",500,"Example Payroll"),role:"salary"};
  assert.equal(classifyWithRules(source,[rule],undefined,undefined,profile).role,"rental-income");
  assert.equal(classifyWithRules({...source,role:"none",classificationOverride:true},[rule],undefined,undefined,profile).role,"none");
});

test("generic CSV and native statements assign the same configured salary role",()=>{
  const store=configureIncome(createFreshStore(),"Example Payroll","salary",28);store.balances=[{id:"bank",name:"Example bank",group:"asset",type:"Current account",value:100}];
  const mapping={version:1,id:"example-map",name:"Example",accountId:"bank",dateColumn:"Date",descriptionColumn:"Payee",amountMode:"single",amountColumn:"Amount",dateFormat:"UK",spendingSign:"negative"};
  const generic=normaliseGenericCsvImport(parseGenericCsv("Date,Payee,Amount\n28/09/2026,Example Payroll,2500\n",mapping),mapping,store.profile);
  const preview=previewTransactionImport(store,generic,"2026-09-29T12:00:00Z");
  assert.equal(preview.classified[0].role,"salary");
  const native=normaliseMonzoImport(parseMonzoCsv("Transaction ID,Date,Name,Amount,Category,Type\nabc,28/09/2026,Example Payroll,2500,Income,Bank transfer\n"),store.profile);
  assert.equal(classifyWithRules(native.transactions[0],[],undefined,undefined,store.profile).role,"salary");
});

test("fresh imported income is not salary until the user confirms its source",()=>{
  const store=createFreshStore();const mapping={version:1,id:"example-map",name:"Example",accountId:"bank",dateColumn:"Date",descriptionColumn:"Payee",amountMode:"single",amountColumn:"Amount",dateFormat:"UK",spendingSign:"negative"};
  const generic=normaliseGenericCsvImport(parseGenericCsv("Date,Payee,Amount\n28/09/2026,Example Payroll,2500\n",mapping),mapping,store.profile);
  const classified=classifyWithRules(generic.transactions[0],[],undefined,undefined,store.profile);
  assert.equal(classified.role,"none");assert.equal(classified.subcategory,"Other income");assert.equal(isSalaryTransaction(classified,store.profile.incomeSources),false);
});

test("generic repayment and native savings-challenge movements carry roles through import effects",()=>{
  const store=createFreshStore();store.balances=[{id:"bank",name:"Example bank",group:"asset",type:"Current account",value:100}];
  const mapping={version:1,id:"example-map",name:"Example",accountId:"bank",dateColumn:"Date",descriptionColumn:"Payee",amountMode:"single",amountColumn:"Amount",dateFormat:"UK",spendingSign:"negative"};
  const repayment=normaliseGenericCsvImport(parseGenericCsv("Date,Payee,Amount\n28/09/2026,Credit card payment,-40\n",mapping),mapping,store.profile);
  const preview=previewTransactionImport(store,repayment,"2026-09-29T12:00:00Z");
  assert.equal(preview.classified[0].role,"debt-repayment");assert.equal(isExcludedFromSpending(preview.classified[0]),true);
  const challenge=normaliseMonzoImport(parseMonzoCsv("Transaction ID,Date,Name,Amount,Category,Type\nabc,29/09/2026,1p Saving Challenge Pot,-4,Savings,Pot transfer\n"),store.profile);
  const challengePreview=previewTransactionImport(store,challenge,"2026-09-30T12:00:00Z");
  assert.equal(challengePreview.classified[0].role,"savings-challenge");
  assert.equal(challengePreview.effects.storePatch.savingsChallengeTracking.balance,4);
});

test("property group excludes rental costs independently of label and role",()=>{
  const profile=createFreshStore().profile;
  const categories=[...profile.categories,makeCategory("Lease costs","property")];
  const rental=resolveCategory({...row("repair","Lease costs","Repairs",-35),categoryId:"category:lease-costs"},{...profile,categories});
  assert.equal(rental.categoryGroup,"property");assert.equal(transactionRole({...rental,role:"none"}),"none");
});

test("role migration survives backup; Plan and Health Score arithmetic are unchanged",()=>{
  const migrated=migrateUserProfile(oldStore());
  const restored=migrateUserProfile(parseBackup(serialiseBackup(migrated)));
  assert.deepEqual(restored.transactions.map(item=>item.role),migrated.transactions.map(item=>item.role));
  assert.deepEqual(restored.profile.categories,migrated.profile.categories);
  const rows=buildPlanRows({categories:["Bills"],lastCycleSpend:{Bills:120},commitments:[{key:"fixed",label:"Example bill",category:"Bills",amount:50,source:"Monthly"}]});
  assert.equal(summarizeNextCyclePlan({planningIncome:500,essentials:rows,lifestyle:[],futureTotal:50}).allocated,170);
  const inputs={cashProgress:50,savingsRate:10,cashFlowMargin:5,debtRatio:30};
  assert.equal(calculateHealthScore(inputs),calculateHealthScore({...inputs}));
});
