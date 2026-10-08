import assert from "node:assert/strict";
import test from "node:test";
import { cashAfterCardDebt, isaBalance, propertyEquity, mortgageDebtBalance, createBalanceSnapshot, migrateBalanceHistory, comparableCash, cashChange, cardStatementCanUpdate } from "../lib/balances.ts";
import { syncGoalsWithBalances } from "../lib/goals.ts";
import { parseMonzoCsv } from "../lib/imports.ts";
import { reviewReadiness, spendingBreakdown, closeoutHasChanged, canUndoImport, unresolvedImports, savingsTotals } from "../lib/review.ts";
import { reconcileImportedTransactions } from "../lib/transactions.ts";
import { financeStoreDigest, financeStoresMatch } from "../lib/storage.ts";
import { migrateTaxStore } from "../lib/tax/index.ts";

const account=(id,type,value,group="asset")=>({id,name:id,type,value,group});
const balances=[account("current","Current account",1000),account("savings","Cash",8000),account("cashisa","Cash ISA",4000),account("isa","Stocks & Shares ISA",2500),account("home","Property",700000),account("mortgage","Mortgage",240000,"liability"),account("card","Credit card",1200,"liability"),account("card2","Credit card",300,"liability")];
const base={transactions:[],balances,goals:[],monthlyBudget:5000,updatedAt:"2026-09-07"};

test("cash, emergency goals and property equity use the same account definitions",()=>{
  assert.equal(cashAfterCardDebt(balances),11500);
  assert.equal(isaBalance(balances),2500);
  assert.equal(mortgageDebtBalance(balances),240000);
  assert.equal(propertyEquity(balances),460000);
  const goal=syncGoalsWithBalances([{id:"ef",current:0,target:15000}],balances)[0];
  assert.equal(goal.current,11500);
  const snapshot=createBalanceSnapshot(balances,"2026-09-07");
  assert.equal(snapshot.cash,goal.current);
  assert.equal(snapshot.cashIsa,4000);
  assert.equal(snapshot.cardDebt,1500);
  assert.equal(snapshot.accountBalances.length,balances.length);
});

test("cash shortfalls remain negative while emergency progress stops at zero",()=>{
  const list=[account("savings","Cash",200),account("card","Credit card",400,"liability")];
  assert.equal(cashAfterCardDebt(list),-200);
  assert.equal(syncGoalsWithBalances([{id:"ef",current:0,target:15000}],list)[0].current,0);
});

test("legacy history is preserved without creating false cash growth",()=>{
  const old={date:"2026-07-22",netWorth:664040.77,cash:8417.56,pension:369421.58,debt:583380.37};
  const original={...base,snapshots:[old]};
  const migrated=migrateBalanceHistory(original);
  assert.equal(migrated.snapshots[0].cash,8417.56);
  assert.equal(migrated.snapshots[0].netWorth,old.netWorth);
  assert.equal(comparableCash(migrated.snapshots[0]),undefined);
  assert.equal(cashChange([...migrated.snapshots,createBalanceSnapshot(balances,"2026-09-07")]),undefined);
  assert.equal(original.snapshots[0].cashBasis,undefined);
  assert.deepEqual(migrateBalanceHistory(migrated),migrated);
  const next=createBalanceSnapshot([...balances,account("extra","Cash",500)],"2026-09-08");
  assert.equal(cashChange([createBalanceSnapshot(balances,"2026-09-07"),next]),500);
});

test("Monzo parsing preserves identical real payments, IDs and categories while reporting invalid rows",()=>{
  const csv='\uFEFFTransaction ID,Date,Name,Amount,Category,Time\na,07/09/2026,Bike shop,-129.50,Shopping,10:00\nb,2026-09-07,Bike shop,-129.50,Shopping,11:00\nc,31/02/2026,Invalid date,-10,Other,12:00\nd,07/09/2026,Broken amount,12oops,Other,13:00\ne,07/09/2026,Euros,"-1.234,56",Shopping,14:00';
  const parsed=parseMonzoCsv(csv);
  assert.equal(parsed.transactions.length,3);
  assert.equal(parsed.rejected,2);
  assert.equal(parsed.issues.length,2);
  assert.equal(parsed.transactions[2].amount,-1234.56);
  assert.equal(parsed.transactions[0].importedCategory,"Shopping");
  assert.notEqual(parsed.transactions[0].sourceId,parsed.transactions[1].sourceId);
  assert.equal(reconcileImportedTransactions(parsed.transactions,parsed.transactions).fresh.length,0);
  assert.throws(()=>parseMonzoCsv('Date,Description,Amount\n07/09/2026,"broken,-5'));
});

test("Monzo debit/credit columns and quoted merchant names are handled",()=>{
  const parsed=parseMonzoCsv('Transaction date,Description,Debit amount,Credit amount\n07/09/2026,"Shop, Belfast",12.50,\n2026-09-08,Refund,,5.25');
  assert.deepEqual(parsed.transactions.map(t=>t.amount),[-12.5,5.25]);
  assert.equal(parsed.transactions[0].merchant,"Shop, Belfast");
});

test("review readiness requires every check for the reviewed cycle",()=>{
  assert.deepEqual(reviewReadiness({coverageComplete:false,missingAccounts:["Example card"],payslipRecorded:false,unreviewed:2}).missing,["Example card coverage or review confirmation","Payslip for this cycle","2 uncategorised transactions"]);
  assert.equal(reviewReadiness({coverageComplete:true,payslipRecorded:true,unreviewed:0}).ready,true);
});

test("spending summary reconciles personal rows and keeps work and transfers separate",()=>{
  const tx=(amount,category,spendingTreatment)=>({id:category,date:"2026-09-07",merchant:category,account:"Monzo",amount,category,spendingTreatment});
  const result=spendingBreakdown([tx(-1000,"Housing","Recurring"),tx(-100,"Groceries","Normal variable"),tx(-500,"Travel","Planned one-off"),tx(-50,"Home","Unplanned one-off"),tx(-300,"Business expenses","Reimbursable business"),tx(-400,"Savings","Transfer / savings"),tx(100,"Income")]);
  assert.equal(result.personal,1650);
  assert.equal(result.recurring+result.variable+result.planned+result.unplanned,result.personal);
  assert.equal(result.business,300);
  assert.equal(result.excluded,400);
});

test("closed-cycle changes include the rental mortgage without a false mismatch",()=>{
  const saved={income:7200,personalSpend:4000,rentalMortgage:600,payYourselfFirst:500};
  assert.equal(closeoutHasChanged(saved,7200,4600,500),false);
  assert.equal(closeoutHasChanged(saved,7200,4650,500),true);
});

test("an undo cannot overwrite subsequent edits",()=>{
  assert.equal(canUndoImport(base,base),true);
  assert.equal(canUndoImport({...base,monthlyBudget:4500},base),false);
  assert.equal(canUndoImport(base,null),false);
});

test("rejected rows keep affected cycles incomplete until corrected coverage arrives",()=>{
  const bad={id:"bad",source:"Monzo",rejected:2,from:"2026-08-26",to:"2026-09-06",importedAt:"2026-09-06T12:00:00"};
  const partial={...bad,id:"partial",rejected:0,from:"2026-09-01",importedAt:"2026-09-07T12:00:00"};
  const fixed={...partial,id:"fixed",from:bad.from};
  assert.equal(unresolvedImports([bad,partial],"2026-08-26","2026-09-25").length,1);
  assert.equal(unresolvedImports([bad,fixed],"2026-08-26","2026-09-25").length,0);
});

test("an older card statement cannot overwrite a manually confirmed balance",()=>{
  const accounts=[{...account("barclaycard-debt","Credit card",1200,"liability"),asOf:"2026-09-07"}];
  assert.equal(cardStatementCanUpdate(accounts,{statementDate:"2026-08-20"},{statementDate:"2026-09-01"}),false);
  assert.equal(cardStatementCanUpdate(accounts,{statementDate:"2026-09-08"},{statementDate:"2026-09-07"}),false);
  assert.equal(cardStatementCanUpdate(accounts,{statementDate:"2026-08-20"},{statementDate:"2026-09-09"}),true);
});

test("zero net savings still records both the deposit and withdrawal and excludes bills pots",()=>{
  const rows=[{category:"Savings",subcategory:"Cash savings",amount:-500},{category:"Savings",subcategory:"Cash savings",amount:500},{category:"Savings",subcategory:"Bills pot",amount:-1000}];
  assert.deepEqual(savingsTotals(rows),{added:500,withdrawn:500,net:0,count:2});
});

test("IndexedDB migration verification covers financial records and totals",()=>{
  const source={transactions:[{id:"tx-1",date:"2026-09-01",merchant:"Test",category:"Other",amount:-12.34,account:"Monzo"}],balances:[account("cash","Cash",100)],goals:[{id:"ef",name:"Emergency",target:1000,current:100,colour:"green"}],snapshots:[{date:"2026-09-01",netWorth:100,cash:100,pension:0,debt:0}],imports:[],payslips:[],mortgageStatements:[],merchantRules:[],cycleCloseouts:[],monthlyBudget:500,updatedAt:"2026-09-01"};
  const copy=structuredClone(source);
  assert.deepEqual(financeStoreDigest(source),financeStoreDigest(copy));
  assert.equal(financeStoresMatch(source,copy),true);
  copy.transactions[0].amount=-12.35;
  assert.equal(financeStoresMatch(source,copy),false);
});

test("IndexedDB migration verification detects a missing transaction",()=>{
  const source={transactions:[{id:"tx-1",date:"2026-09-01",merchant:"One",category:"Other",amount:-10,account:"Monzo"},{id:"tx-2",date:"2026-09-02",merchant:"Two",category:"Other",amount:-20,account:"Monzo"}],balances:[],goals:[],monthlyBudget:500,updatedAt:"2026-09-02"};
  assert.equal(financeStoresMatch(source,{...source,transactions:source.transactions.slice(0,1)}),false);
});

test("tax migration is additive and survives the existing IndexedDB digest",()=>{
  const legacy={transactions:[],balances:[],goals:[],monthlyBudget:500,updatedAt:"2026-09-25"};
  const migrated=migrateTaxStore(legacy);
  assert.deepEqual(migrated.taxDocuments,[]);
  assert.deepEqual(migrated.taxFacts,[]);
  assert.equal(migrated.taxSchemaVersion,2);
  const withTax={...migrated,taxDocuments:[{id:"p60",type:"p60",title:"P60",taxYear:"2026/27",importedAt:"2027-04-06",processingStatus:"manual",fingerprint:"fixture"}],taxFacts:[{id:"tax",taxYear:"2026/27",type:"income-tax-deducted",amount:100,sourceType:"manual",confidence:"medium",status:"active"}]};
  assert.equal(financeStoresMatch(withTax,structuredClone(withTax)),true);
  assert.equal(financeStoresMatch(withTax,{...withTax,taxFacts:[]}),false);
});
