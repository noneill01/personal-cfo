import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {accountFreshness,baselineEligibleCycles,configuredAccountCoverage,cycleCoverageStatus,isCoveredTransaction,participatesInOverview,requiredBalanceFreshness} from "../lib/coverage.ts";
import {currentAccountBalance,cardDebtBalance,assetBalance,debtBalance} from "../lib/balances.ts";
import {normaliseGenericCsvImport,normaliseMonzoImport,normaliseBarclaycardImport,parseGenericCsv} from "../lib/importers.ts";
import {parseMonzoCsv,parseBarclaycardCsv} from "../lib/imports.ts";
import {commitTransactionImport} from "../lib/import-workflow.ts";
import {createFreshStore,migrateUserProfile,USER_PROFILE_VERSION} from "../lib/profile.ts";
import {selectLastCompletedCycle} from "../lib/plan.ts";
import {parseBackup,serialiseBackup} from "../lib/backup.ts";
import {financeStoreDigest} from "../lib/storage.ts";

const key="2026-09",dates={"2026-09":"2026-09-28","2026-10":"2026-10-28"};
const days=["2026-09-28","2026-10-03","2026-10-08","2026-10-13","2026-10-18","2026-10-23","2026-10-27"];
const account=(id,kind,coverage="required")=>({id,name:`Example ${id}`,kind,coverage});
const balance=(id,kind,value=0)=>({id,name:`Example ${id}`,group:kind==="credit-card"||kind==="mortgage"?"liability":"asset",type:{current:"Current account","credit-card":"Credit card",pension:"Pension",property:"Property",investment:"VCT",mortgage:"Mortgage"}[kind],value});
const transaction=(accountId,date,id)=>({id,account:accountId,date,merchant:"Example shop",amount:-1,category:"Groceries",subcategory:"Food"});
const storeFor=(accounts,transactions)=>{const store=createFreshStore();return {...store,profile:{...store.profile,accounts},balances:accounts.map(item=>balance(item.id,item.kind)),transactions};};
const status=store=>cycleCoverageStatus(key,28,dates,configuredAccountCoverage(store),store.imports,store.cardCoverageConfirmations,store.accountCoverageConfirmations);
const fullRows=id=>days.map((date,index)=>transaction(id,date,`${id}-${index}`));

test("one generic current account covers a cycle; no credit account is required",()=>{
  const store=storeFor([account("bank-a","current")],fullRows("bank-a"));
  const result=status(store);
  assert.equal(result.currentComplete,true);assert.equal(result.creditComplete,true);assert.equal(result.complete,true);
  assert.equal(result.creditHistoryStarted,false);
});
test("a generic current and generic credit card must both cover the cycle",()=>{
  const store=storeFor([account("bank-a","current"),account("card-a","credit-card")],[...fullRows("bank-a"),transaction("card-a",days[0],"c-1"),transaction("card-a",days.at(-1),"c-2")]);
  assert.equal(status(store).complete,true);
  assert.equal(status({...store,transactions:store.transactions.slice(0,-1)}).complete,false);
});
test("multiple required current and credit accounts are checked independently",()=>{
  const accounts=[account("bank-a","current"),account("bank-b","current"),account("card-a","credit-card"),account("card-b","credit-card")];
  const rows=[...fullRows("bank-a"),...fullRows("bank-b"),...fullRows("card-a"),...fullRows("card-b")];
  const store=storeFor(accounts,rows);
  assert.equal(status(store).complete,true);
  for(const id of accounts.map(item=>item.id))assert.equal(status({...store,transactions:rows.filter(row=>row.account!==id)}).complete,false,id);
});
test("non-spending accounts and explicitly optional accounts do not block completeness",()=>{
  const accounts=[account("bank-a","current"),account("pension-a","pension","excluded"),account("house-a","property","excluded"),account("fund-a","investment","excluded"),account("card-a","credit-card","optional")];
  const store=storeFor(accounts,fullRows("bank-a"));
  assert.equal(status(store).complete,true);
  assert.deepEqual(configuredAccountCoverage(store).required.map(item=>item.accountId),["bank-a"]);
  const withRows={...store,transactions:[...store.transactions,transaction("fund-a",days[0],"fund-row"),transaction("card-a",days[0],"card-row"),transaction("Manual",days[0],"manual-row")]};
  const coverage=configuredAccountCoverage(withRows);
  assert.equal(participatesInOverview(withRows.transactions.at(-3),coverage),false);
  assert.equal(participatesInOverview(withRows.transactions.at(-2),coverage),true);
  assert.equal(participatesInOverview(withRows.transactions.at(-1),coverage),true);
});
test("generic CSV rows count for current and credit coverage by canonical account ID",()=>{
  const accounts=[account("bank-a","current"),account("card-a","credit-card")];
  let store=storeFor(accounts,[]);
  for(const target of accounts){
    const mapping={version:1,id:`mapping-${target.id}`,name:target.name,accountId:target.id,dateColumn:"Date",descriptionColumn:"Description",amountMode:"single",amountColumn:"Amount",dateFormat:"ISO",spendingSign:"negative"};
    const csv=`Date,Description,Amount\n${days.map(date=>`${date},Example purchase,-1`).join("\n")}\n`;
    const draft=normaliseGenericCsvImport(parseGenericCsv(csv,mapping),mapping,store.profile);
    store=commitTransactionImport(store,draft,`${target.id}.csv`,`2026-10-28T12:00:00.000Z`).store;
  }
  assert.equal(status(store).complete,true);
  assert.equal(configuredAccountCoverage(store).credit[0].count,days.length);
});
test("native provider rows still resolve through legacy account IDs",()=>{
  const accounts=[account("monzo-current","current"),account("barclaycard-debt","credit-card")];
  let store=storeFor(accounts,[]);
  const monzo=`Transaction ID,Date,Name,Amount,Category,Type\n${days.map((date,i)=>`m-${i},${date},Shop,-1,Groceries,Card payment`).join("\n")}\n`;
  store=commitTransactionImport(store,normaliseMonzoImport(parseMonzoCsv(monzo),store.profile),"native-current.csv","2026-10-28T12:00:00.000Z").store;
  const card=`Date,Description,Amount\n${days.map(date=>`${date},Example shop,1`).join("\n")}\n`;
  store=commitTransactionImport(store,normaliseBarclaycardImport(parseBarclaycardCsv(card,"native-card.csv"),"native-card.csv",store.profile),"native-card.csv","2026-10-28T12:00:00.000Z").store;
  assert.equal(status(store).complete,true);
  assert.equal(configuredAccountCoverage(store).current[0].count,days.length);
});
test("rejected batches block only their account and a clean replacement clears them",()=>{
  const store=storeFor([account("bank-a","current"),account("bank-b","current")],[...fullRows("bank-a"),...fullRows("bank-b")]);
  const bad={id:"bad",accountId:"bank-a",fileName:"bad.csv",importedAt:"2026-10-28T10:00:00Z",added:1,skipped:0,rejected:1,from:days[0],to:days.at(-1)};
  assert.equal(status({...store,imports:[bad]}).complete,false);
  assert.equal(status({...store,imports:[{...bad,id:"clean",importedAt:"2026-10-28T11:00:00Z",rejected:0},bad]}).complete,true);
});
test("legacy profile projection and legacy card confirmation preserve coverage, idempotently",()=>{
  const source={...createFreshStore(),profile:undefined,balances:[balance("monzo-current","current",100),balance("barclaycard-debt","credit-card",20)],transactions:[...fullRows("Monzo"),transaction("Barclaycard",days[0],"card-start")],cardCoverageConfirmations:{[key]:{through:days.at(-1),confirmedAt:"2026-10-28T12:00:00Z"}}};
  const migrated=migrateUserProfile(source);
  assert.equal(migrated.profile.version,USER_PROFILE_VERSION);
  assert.deepEqual(migrated.profile.accounts.map(item=>item.coverage),["required","required"]);
  assert.equal(status(migrated).complete,true);
  assert.equal(migrateUserProfile(migrated),migrated);
});
test("version-two profile gains coverage roles and account confirmations survive backup",()=>{
  const old=storeFor([account("bank-a","current"),account("card-a","credit-card")],[...fullRows("bank-a"),transaction("card-a",days[0],"card-start")]);
  old.profile={...old.profile,version:2,accounts:old.profile.accounts.map(account=>Object.fromEntries(Object.entries(account).filter(([key])=>key!=="coverage")))};
  const migrated=migrateUserProfile(old);
  assert.deepEqual(migrated.profile.accounts.map(item=>item.coverage),["required","required"]);
  assert.deepEqual(migrateUserProfile(migrated),migrated);
  const confirmed={...migrated,accountCoverageConfirmations:{[key]:{"card-a":{through:days.at(-1),confirmedAt:"2026-10-28T12:00:00Z"}}}};
  assert.equal(status(confirmed).complete,true);
  const restored=parseBackup(serialiseBackup(confirmed));
  assert.deepEqual(restored.accountCoverageConfirmations,confirmed.accountCoverageConfirmations);
  assert.deepEqual(financeStoreDigest(restored),financeStoreDigest(confirmed));
});
test("last completed cycle and baseline exclusion remain separate decisions",()=>{
  const all=["2026-07","2026-08","2026-09"],complete=key=>key!=="2026-08";
  assert.equal(selectLastCompletedCycle("2026-10",all,complete),"2026-09");
  assert.deepEqual(baselineEligibleCycles(all,"2026-10",complete,{"2026-09":{kind:"Transition",excludeFromBaseline:true}}),["2026-07"]);
  assert.equal(complete("2026-09"),true);
});
test("overview account totals and freshness use kinds and dates, not bank names",()=>{
  const accounts=[account("bank-a","current"),account("bank-b","current"),account("card-a","credit-card")];
  const store=storeFor(accounts,[...fullRows("bank-a"),...fullRows("bank-b"),...fullRows("card-a")]);
  store.balances=[balance("bank-a","current",100),balance("bank-b","current",200),balance("card-a","credit-card",50)];
  assert.equal(currentAccountBalance(store.balances),300);assert.equal(cardDebtBalance(store.balances),50);
  assert.equal(assetBalance(store.balances)-debtBalance(store.balances),250);
  const coverage=configuredAccountCoverage(store);
  assert.equal(store.transactions.every(row=>isCoveredTransaction(row,coverage,store.imports)),true);
  assert.equal(accountFreshness(coverage.current[0],"2026-11-03"),true);
  assert.equal(accountFreshness(coverage.current[0],"2026-11-04"),false);
  assert.equal(accountFreshness(coverage.credit[0],"2026-11-30"),true);
  assert.equal(accountFreshness(coverage.credit[0],"2026-12-02"),false);
  store.balances=store.balances.map(item=>({...item,asOf:"2026-10-27"}));
  assert.equal(requiredBalanceFreshness(coverage,store.balances,"2026-11-15").fresh,true);
  assert.equal(requiredBalanceFreshness(coverage,store.balances,"2026-12-03").fresh,false);
  const coverageSource=readFileSync(new URL("../lib/coverage.ts",import.meta.url),"utf8");
  assert.doesNotMatch(coverageSource,/Monzo|Barclaycard|Rental Lender|Primary Lender/);
});
