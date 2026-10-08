import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {planningCashPosition,cashBalance,cashAfterCardDebt,cardStatementCanUpdate} from "../lib/balances.ts";
import {buildCashRunway} from "../lib/cash-runway.ts";
import {parseGenericCsv,normaliseGenericCsvImport,normaliseMonzoImport,normaliseBarclaycardImport} from "../lib/importers.ts";
import {parseMonzoCsv,parseBarclaycardCsv} from "../lib/imports.ts";
import {commitTransactionImport} from "../lib/import-workflow.ts";
import {createFreshStore,migrateUserProfile} from "../lib/profile.ts";
import {parseBackup,serialiseBackup} from "../lib/backup.ts";
import {buildPlanRows} from "../lib/plan.ts";
import {transactionAccountId} from "../lib/coverage.ts";
import {detectedDirectDebitDefinitions} from "../lib/recurring-commitments.ts";

const balance=(id,type,value,group="asset")=>({id,name:`Example ${id}`,type,value,group,asOf:"2026-10-02"});
const profile=(accounts)=>({...createFreshStore().profile,accounts:accounts.map(([id,kind,coverage="required"])=>({id,name:`Example ${id}`,kind,coverage}))});
const tx=(id,account,date,amount,category="Groceries")=>({id,account,date,amount,category,merchant:`Example ${id}`});
const runway=(rows,accounts,imports=[],personalTransactions=[])=>buildCashRunway({allTransactions:rows,personalTransactions,start:"2026-09-28",end:"2026-10-27",cashAccounts:accounts,imports,spendingPlan:1000,live:true});

test("generic current account supplies cash runway without a provider name",()=>{
  const rows=[tx("pay","bank-a","2026-09-28",2000,"Income"),tx("shop","bank-a","2026-10-02",-100)];
  const result=runway(rows,[{accountId:"bank-a",balance:2900,balanceThrough:"2026-10-02"}],[],[rows[1]]);
  assert.equal(result.hasAccountActivity,true);
  assert.equal(result.openingBalance,1000);
  assert.equal(result.balanceAtEnd,2900);
});

test("an unanchored CSV balance cannot be presented as reliable cash",()=>{
  const result=runway([tx("shop","bank-a","2026-10-02",-100)],[{accountId:"bank-a",balance:0,balanceThrough:"2026-10-02",balanceKnown:false}]);
  assert.equal(result.hasAccountActivity,true);
  assert.equal(result.hasBalanceAnchor,false);
});

test("multiple current accounts aggregate and internal transfers do not become savings top-ups",()=>{
  const rows=[tx("pay","bank-a","2026-09-28",2000,"Income"),tx("move-out","bank-a","2026-09-29",-200,"Transfers"),tx("move-in","bank-b","2026-09-29",200,"Transfers")];
  const result=runway(rows,[{accountId:"bank-a",balance:1800,balanceThrough:"2026-09-29"},{accountId:"bank-b",balance:200,balanceThrough:"2026-09-29"}]);
  assert.equal(result.openingBalance,0);
  assert.equal(result.balanceAtEnd,2000);
  assert.equal(result.savingsTopUps,0);
});

test("savings and cash ISA are reserves, while investments and property never enter planning cash",()=>{
  const balances=[balance("current","Current account",1000),balance("savings","Cash",500),balance("cash-isa","Cash ISA",300),balance("s-and-s","Stocks & Shares ISA",900),balance("pension","Pension",4000),balance("house","Property",100000),balance("card","Credit card",200,"liability")];
  const result=planningCashPosition(balances,profile([["current","current"],["savings","savings","excluded"],["cash-isa","cash-isa","excluded"],["s-and-s","investment-isa","excluded"],["pension","pension","excluded"],["house","property","excluded"],["card","credit-card"]]));
  assert.deepEqual({current:result.current,reserve:result.reserve,cardDebt:result.cardDebt,afterCardDebt:result.afterCardDebt},{current:1000,reserve:800,cardDebt:200,afterCardDebt:1600});
  assert.equal(cashBalance(balances),1800);
  assert.equal(cashAfterCardDebt(balances),1600);
});

test("an excluded current account does not inflate spendable cash; no savings is valid",()=>{
  const balances=[balance("active","Current account",500),balance("outside","Current account",700)];
  const result=planningCashPosition(balances,profile([["active","current"],["outside","current","excluded"]]));
  assert.equal(result.current,500);
  assert.equal(result.reserve,0);
  assert.deepEqual(result.currentAccounts.map(item=>item.id),["active"]);
});

test("generic card purchases do not move current cash until repayment; debt remains a liability",()=>{
  const balances=[balance("bank","Current account",900),balance("card","Credit card",300,"liability")];
  const rows=[tx("pay","bank","2026-09-28",1000,"Income"),tx("purchase","card","2026-09-29",-300),tx("repayment","bank","2026-10-02",-100,"Transfers")];
  const result=runway(rows,[{accountId:"bank",balance:900,balanceThrough:"2026-10-02"}],[],[rows[1]]);
  assert.equal(result.balanceAtEnd,900);
  assert.equal(result.openingBalance,0);
  assert.equal(planningCashPosition(balances).afterCardDebt,600);
});

test("statement freshness uses the selected generic card rather than another card's date",()=>{
  const balances=[{...balance("card-a","Credit card",100,"liability"),asOf:"2026-09-01"},{...balance("card-b","Credit card",200,"liability"),asOf:"2026-10-01"}];
  assert.equal(cardStatementCanUpdate(balances,undefined,{statementDate:"2026-09-15"},"card-a"),true);
  assert.equal(cardStatementCanUpdate(balances,undefined,{statementDate:"2026-09-15"},"card-b"),false);
});

test("generic current-account Direct Debit evidence reaches provider-neutral commitments",()=>{
  const rows=[tx("one","bank-a","2026-08-01",-80,"Bills"),tx("two","bank-a","2026-09-01",-80,"Bills")].map(row=>({...row,merchant:"Example insurer",transactionType:"Direct Debit"}));
  const selected=rows.filter(row=>transactionAccountId(row,[],["bank-a"])==="bank-a");
  const commitments=detectedDirectDebitDefinitions(selected,"2026-09-30");
  assert.equal(commitments.length,1);
  assert.equal(commitments[0].scheduledAmount,80);
});

test("generic CSV imports participate in the same runway and Plan selectors",()=>{
  let store=createFreshStore();
  store={...store,profile:profile([["bank","current"],["card","credit-card"]]),balances:[balance("bank","Current account",900),balance("card","Credit card",100,"liability")]};
  for(const accountId of ["bank","card"]){
    const mapping={version:1,id:`map-${accountId}`,name:"Example mapping",accountId,dateColumn:"Date",descriptionColumn:"Description",amountMode:"single",amountColumn:"Amount",dateFormat:"ISO",spendingSign:"negative"};
    const csv=`Date,Description,Amount\n2026-09-28,Example opening,1000\n2026-10-02,Example purchase,-100\n`;
    store=commitTransactionImport(store,normaliseGenericCsvImport(parseGenericCsv(csv,mapping),mapping,store.profile),`${accountId}.csv`,"2026-10-03T12:00:00Z").store;
  }
  const selected=store.transactions.filter(row=>row.account==="bank");
  const result=runway(store.transactions,[{accountId:"bank",balance:900,balanceThrough:"2026-10-02"}],store.imports,selected.filter(row=>row.amount<0));
  assert.equal(result.openingBalance,0);
  assert.equal(result.balanceAtEnd,900);
  assert.equal(planningCashPosition(store.balances,store.profile).afterCardDebt,800);
  assert.equal(buildPlanRows({categories:["Groceries"],lastCycleSpend:{Groceries:100},commitments:[],storedPlan:{}})[0].plannedAmount,100);
});

test("native provider transactions remain readable through the legacy account bridge",()=>{
  let store=createFreshStore();
  store={...store,profile:profile([["monzo-current","current"],["barclaycard-debt","credit-card"]]),balances:[balance("monzo-current","Current account",900),balance("barclaycard-debt","Credit card",100,"liability")]};
  store=commitTransactionImport(store,normaliseMonzoImport(parseMonzoCsv("Transaction ID,Date,Name,Amount,Category,Type\na,2026-09-28,Example pay,1000,Income,Bank credit\nb,2026-10-02,Example shop,-100,Groceries,Card payment\n"),store.profile),"native-bank.csv","2026-10-03T12:00:00Z").store;
  store=commitTransactionImport(store,normaliseBarclaycardImport(parseBarclaycardCsv("Date,Description,Amount\n2026-10-01,Example shop,100\n","native-card.csv"),"native-card.csv",store.profile),"native-card.csv","2026-10-03T12:00:00Z").store;
  const result=runway(store.transactions,[{accountId:"monzo-current",balance:900,balanceThrough:"2026-10-02"}],store.imports);
  assert.equal(result.openingBalance,0);
  assert.equal(result.balanceAtEnd,900);
  assert.equal(planningCashPosition(store.balances,store.profile).afterCardDebt,800);
});

test("legacy profile migration and backup remain idempotent for cash selection",()=>{
  const source={...createFreshStore(),profile:undefined,balances:[balance("monzo-current","Current account",700),balance("barclaycard-debt","Credit card",200,"liability")]};
  const migrated=migrateUserProfile(source);
  assert.equal(migrateUserProfile(migrated),migrated);
  const restored=parseBackup(serialiseBackup(migrated));
  assert.equal(planningCashPosition(restored.balances,restored.profile).afterCardDebt,500);
  assert.equal(cashAfterCardDebt(source.balances),500);
});

test("core runway and cash selectors have no provider-name checks",()=>{
  for(const path of ["lib/cash-runway.ts","lib/balances.ts","components/PlanCashRunway.tsx"]){
    const source=readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
    assert.doesNotMatch(source,/Monzo|Barclaycard|monzo-current|barclaycard-debt/i,path);
  }
});
