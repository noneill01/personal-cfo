import test from "node:test";
import assert from "node:assert/strict";
import { buildPlanRows, dedupeRecurringCommitments, expectedPlanCommitmentAmount, explicitRecurringCommitments, isPersonalPlanCommitment, selectLastCompletedCycle, summarizeNextCyclePlan } from "../lib/plan.ts";
import { buildCashRunway } from "../lib/cash-runway.ts";

const tx=(overrides={})=>({id:crypto.randomUUID(),date:"2026-09-01",merchant:"Example",category:"Bills",subcategory:"Household",amount:-10,account:"Barclaycard",transactionType:"Card payment",...overrides});

test("planning uses the immediately preceding completed cycle rather than a historic average",()=>{
  const selected=selectLastCompletedCycle("2026-10",["2026-07","2026-08","2026-09","2026-10"],key=>key!=="2026-10");
  assert.equal(selected,"2026-09");
  const rows=buildPlanRows({categories:["Groceries"],lastCycleSpend:{Groceries:380},commitments:[],storedPlan:{}});
  assert.equal(rows[0].lastCycleActual,380);
  assert.equal(rows[0].plannedAmount,380);
});

test("a baseline-excluded transition cycle remains eligible as Last cycle",()=>{
  const baselineExcluded=new Set(["2026-09"]);
  const selected=selectLastCompletedCycle("2026-10",["2026-08","2026-09"],()=>true);
  assert.equal(baselineExcluded.has(selected),true);
  assert.equal(selected,"2026-09");
});

test("Last cycle skips an incomplete immediate predecessor and uses the latest fully covered cycle",()=>{
  const selected=selectLastCompletedCycle("2026-10",["2026-07","2026-08","2026-09"],key=>key!=="2026-09");
  assert.equal(selected,"2026-08");
});

test("personal Housing commitments exclude the Rental property mortgage",()=>{
  const commitments=[
    {key:"primary lender mortgages",label:"Primary Lender",category:"Housing",amount:2405.67,source:"Monthly"},
    {key:"rental lender mortgages",label:"Rental Lender",category:"Housing",amount:660,source:"Monthly"},
    {key:"boiler",label:"Rental property boiler",category:"Rental property",amount:90,source:"Monthly"},
  ].filter(commitment=>isPersonalPlanCommitment(commitment,{rentalCategory:"Rental property",rentalMortgageMerchantKey:"rental lender mortgages"}));
  const [housing]=buildPlanRows({categories:["Housing"],lastCycleSpend:{Housing:2405.67},commitments,storedPlan:{}});
  assert.equal(housing.fixedCommitments,2405.67);
  assert.equal(housing.commitmentDetails.length,1);
});

test("Bills commitments aggregate and commitment detail reconciles to Coming out",()=>{
  const details=[
    {key:"loan",label:"Loan",category:"Bills",amount:174.91,source:"Monthly"},
    {key:"insurance",label:"Insurance",category:"Bills",amount:112.99,source:"Monthly"},
  ];
  const [bills]=buildPlanRows({categories:["Bills"],lastCycleSpend:{Bills:250},commitments:details,storedPlan:{}});
  assert.equal(bills.fixedCommitments,287.9);
  assert.equal(bills.commitmentDetails.reduce((sum,row)=>sum+row.amount,0),bills.fixedCommitments);
});

test("multiple payments for one grouped payee preserve the full monthly commitment",()=>{
  const amount=expectedPlanCommitmentAmount({frequency:"monthly",expected:129.5,scheduledAmount:129.5,lastDate:"2026-09-14",payments:[{date:"2026-09-02",amount:129.5},{date:"2026-09-14",amount:129.5}],planningStart:"2026-09-28",planningEnd:"2026-10-27",lastCycleStart:"2026-08-28",lastCycleEnd:"2026-09-27"});
  assert.equal(amount,259);
});

test("known commitments form the floor while variable essentials seed from last-cycle actuals",()=>{
  const rows=buildPlanRows({categories:["Housing","Groceries"],lastCycleSpend:{Housing:2200,Groceries:372.85},commitments:[{key:"mortgage",label:"Mortgage",category:"Housing",amount:2405.67,source:"Monthly"}],storedPlan:{Housing:2000}});
  assert.equal(rows[0].explicitlyEdited,true);
  assert.equal(rows[0].plannedAmount,2405.67);
  assert.equal(rows[1].plannedAmount,372.85);
});

test("explicit user edits are preserved when they remain above the fixed floor",()=>{
  const [bills]=buildPlanRows({categories:["Bills"],lastCycleSpend:{Bills:900},commitments:[{key:"utilities",label:"Utilities",category:"Bills",amount:800,source:"Monthly"}],storedPlan:{Bills:1250}});
  assert.equal(bills.explicitlyEdited,true);
  assert.equal(bills.plannedAmount,1250);
});

test("plan summary exposes over-allocation",()=>{
  const essentials=buildPlanRows({categories:["Housing"],lastCycleSpend:{Housing:2400},commitments:[{key:"mortgage",label:"Mortgage",category:"Housing",amount:2400,source:"Monthly"}],storedPlan:{}});
  const lifestyle=buildPlanRows({categories:["Travel"],lastCycleSpend:{Travel:900},commitments:[],storedPlan:{}});
  const summary=summarizeNextCyclePlan({planningIncome:3000,essentials,lifestyle,futureTotal:300});
  assert.equal(summary.fixedCommitments,2400);
  assert.equal(summary.unallocated,-600);
});

test("fixed commitments remain the full obligation regardless of planning income",()=>{
  const essentials=buildPlanRows({categories:["Housing","Bills"],lastCycleSpend:{},commitments:[
    {key:"mortgage",label:"Mortgage",category:"Housing",amount:2405.67,source:"Monthly"},
    {key:"loan",label:"Loan",category:"Bills",amount:438.84,source:"Monthly"},
  ],storedPlan:{}});
  const lowIncome=summarizeNextCyclePlan({planningIncome:1000,essentials,lifestyle:[],futureTotal:0});
  const normalIncome=summarizeNextCyclePlan({planningIncome:7200,essentials,lifestyle:[],futureTotal:0});
  assert.equal(lowIncome.fixedCommitments,2844.51);
  assert.equal(normalIncome.fixedCommitments,2844.51);
  assert.equal(lowIncome.unallocated,-1844.51);
});

test("an explicitly recurring monthly card payment is eligible as a fixed commitment",()=>{
  const commitments=explicitRecurringCommitments([
    tx({id:"card-1",date:"2026-08-01",merchant:"Furniture Finance",amount:-80.14}),
    tx({id:"card-2",date:"2026-09-01",merchant:"Furniture Finance",amount:-80.14,spendingTreatment:"Recurring"}),
  ]);
  assert.equal(commitments.length,1);
  assert.equal(commitments[0].expected,80.14);
  assert.equal(commitments[0].source,"Monthly · recurring card payment");
});

test("a Humm-like synthetic sequence is recognised only when explicitly recurring",()=>{
  const commitments=explicitRecurringCommitments([
    tx({id:"h-1",date:"2026-07-01",merchant:"Synthetic Instalment Group",amount:-80.14}),
    tx({id:"h-2",date:"2026-08-01",merchant:"Synthetic Instalment Group",amount:-80.14}),
    tx({id:"h-3",date:"2026-09-01",merchant:"Synthetic Instalment Group",amount:-80.14,spendingTreatment:"Recurring"}),
  ]);
  assert.deepEqual(commitments.map(row=>[row.label,row.expected,row.frequency]),[["Synthetic Instalment Group",80.14,"monthly"]]);
});

test("ordinary repeated card shopping is not inferred as fixed",()=>{
  const commitments=explicitRecurringCommitments([
    tx({id:"shop-1",date:"2026-08-03",merchant:"Corner Shop",amount:-12.5}),
    tx({id:"shop-2",date:"2026-08-11",merchant:"Corner Shop",amount:-18.25}),
    tx({id:"shop-3",date:"2026-08-20",merchant:"Corner Shop",amount:-9.4}),
  ]);
  assert.equal(commitments.length,0);
});

test("Direct Debit commitments continue to survive the unified dedupe path",()=>{
  const directDebit={key:"energy supplier",label:"Energy Supplier",category:"Bills",expected:120,scheduledAmount:120,frequency:"monthly",lastDate:"2026-09-02",source:"Monthly · Monzo Direct Debit",payments:[{date:"2026-09-02",amount:120}]};
  assert.deepEqual(dedupeRecurringCommitments([directDebit]),[directDebit]);
});

test("recurring transfers and the existing maintenance commitment remain supported",()=>{
  const transfer=explicitRecurringCommitments([
    tx({id:"transfer-1",merchant:"Regular Support",category:"Children",subcategory:"Activities",account:"Monzo",transactionType:"Bank transfer",amount:-50,spendingTreatment:"Recurring"}),
  ])[0];
  const maintenance={key:"child-maintenance",label:"Child maintenance",category:"Children",expected:650,scheduledAmount:650,frequency:"monthly",lastDate:"2026-09-03",source:"Monthly · recurring transfer",payments:[{date:"2026-09-03",amount:650}]};
  const result=dedupeRecurringCommitments([transfer],[maintenance]);
  assert.equal(result.length,2);
  assert.equal(transfer.source,"Monthly · recurring transfer");
});

test("a commitment discovered from Direct Debit and explicit signals is counted once",()=>{
  const base={key:"same obligation",label:"Same Obligation",category:"Bills",expected:80.14,scheduledAmount:80.14,frequency:"monthly",lastDate:"2026-09-01",source:"Monthly · Monzo Direct Debit",payments:[{date:"2026-09-01",amount:80.14}]};
  const duplicate={...base,source:"Monthly · recurring card payment"};
  const result=dedupeRecurringCommitments([base],[duplicate]);
  assert.equal(result.length,1);
  assert.equal(result[0].source,"Monthly · Monzo Direct Debit");
});

test("reclassifying existing Bills spend as fixed moves the split without increasing the plan",()=>{
  const before=buildPlanRows({categories:["Bills"],lastCycleSpend:{Bills:500},commitments:[],storedPlan:{}})[0];
  const after=buildPlanRows({categories:["Bills"],lastCycleSpend:{Bills:500},commitments:[{key:"instalment",label:"Instalment",category:"Bills",amount:80.14,source:"Monthly · recurring card payment"}],storedPlan:{}})[0];
  assert.equal(after.plannedAmount,before.plannedAmount);
  assert.equal(after.fixedCommitments,80.14);
  assert.equal(after.plannedAmount-after.fixedCommitments,419.86);
});

test("Cash Runway receives and schedules a recurring-card commitment",()=>{
  const transactions=[tx({id:"monzo-opening",date:"2026-09-28",merchant:"Salary",category:"Income",amount:5000,account:"Monzo",transactionType:"Bank credit"})];
  const runway=buildCashRunway({allTransactions:transactions,personalTransactions:[],start:"2026-09-28",end:"2026-10-27",cashAccounts:[{accountId:"monzo-current",balance:5000,balanceThrough:"2026-10-02"}],spendingPlan:1000,live:false,fixedCommitments:[{key:"instalment",expected:80.14,scheduledAmount:80.14,lastDate:"2026-09-01",frequency:"monthly"}]});
  assert.equal(runway.points.find(point=>point.date==="2026-10-01")?.expectedFixedSpend,80.14);
});
