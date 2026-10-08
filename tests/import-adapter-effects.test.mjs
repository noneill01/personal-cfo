import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyImportEffects, mortgageImportEffects, normaliseBarclaycardImport, normaliseGenericCsvImport, normaliseMonzoImport, parseGenericCsv } from "../lib/importers.ts";
import { parseBarclaycardCsv, parseMonzoCsv, parseMortgageStatementCsv } from "../lib/imports.ts";
import { commitTransactionImport, previewTransactionImport } from "../lib/import-workflow.ts";
import { createFreshStore } from "../lib/profile.ts";
import { parseBackup, serialiseBackup } from "../lib/backup.ts";
import { financeStoreDigest } from "../lib/storage.ts";

const date="2026-09-05T12:00:00.000Z";
const current={id:"monzo-current",name:"Example current",group:"asset",type:"Current account",value:1000,asOf:"2026-09-01"};
const card={id:"barclaycard-debt",name:"Example card",group:"liability",type:"Credit card",value:500,asOf:"2026-08-01"};
const base=()=>({...createFreshStore(),balances:[current,card],monzoBalanceTracking:{enabled:true,syncedThrough:"2026-09-01",updatedAt:"2026-09-01"},savingsChallengeTracking:{balance:100,syncedThrough:"2026-09-01",updatedAt:"2026-09-01"},potPosition:{bills:25,savings:75}});
const monzoCsv="Transaction ID,Date,Name,Amount,Category,Type\na,02/09/2026,Cafe,-5.00,Eating out,Card payment\nb,03/09/2026,1p Saving Challenge,-2.00,Savings,Pot transfer\n";

test("Monzo adapter owns tracked balance, challenge and pot effects; reimport stays duplicate-safe",()=>{
  const store=base(),draft=normaliseMonzoImport(parseMonzoCsv(monzoCsv),store.profile);
  const preview=previewTransactionImport(store,draft,date);
  assert.equal(preview.effects.balanceUpdates[0].accountId,"monzo-current");
  assert.equal(preview.effects.balanceUpdates[0].value,993);
  assert.equal(preview.effects.storePatch.savingsChallengeTracking.balance,102);
  assert.deepEqual(preview.effects.storePatch.potPosition,{bills:25,savings:75});
  assert.equal(store.balances[0].value,1000); // preview is non-mutating
  const committed=commitTransactionImport(store,draft,"example-monzo.csv",date);
  assert.equal(committed.store.balances[0].value,993);
  assert.equal(committed.store.monzoBalanceTracking.syncedThrough,"2026-09-03");
  assert.equal(committed.store.savingsChallengeTracking.balance,102);
  assert.equal(committed.record.importerId,"monzo");
  assert.deepEqual(committed.record.balanceUpdates,[{accountId:"monzo-current",from:1000,to:993,asOf:"2026-09-03"}]);
  const duplicate=commitTransactionImport(committed.store,draft,"same-export.csv","2026-09-06T12:00:00.000Z");
  assert.equal(duplicate.record.added,0);assert.equal(duplicate.record.skipped,2);
  assert.equal(duplicate.store.balances[0].value,993);assert.equal(duplicate.store.savingsChallengeTracking.balance,102);
});

test("a rejected Monzo row pauses tracking without applying an incomplete balance delta",()=>{
  const store=base();const parsed=parseMonzoCsv(monzoCsv+"c,not-a-date,Bad,-8.00,Other,Card payment\n");
  const result=commitTransactionImport(store,normaliseMonzoImport(parsed,store.profile),"partial.csv",date);
  assert.equal(result.record.rejected,1);assert.deepEqual(result.record.balanceUpdates,[]);
  assert.equal(result.store.balances[0].value,1000);
  assert.equal(result.store.monzoBalanceTracking.enabled,false);
  assert.equal(result.store.savingsChallengeTracking.balance,100);
  assert.equal(result.store.transactions.length,2);
});

test("Barclaycard adapter supplies statement debt and preserves newer manual balances",()=>{
  const csv="Date,Description,Amount,Statement Balance,Statement Date,Minimum Payment,Due Date,Credit Limit\n02/09/2026,Shop,12.50,620,03/09/2026,12,20/09/2026,1000\n";
  const parsed=parseBarclaycardCsv(csv,"example-card.csv"),store=base();
  const draft=normaliseBarclaycardImport(parsed,"example-card.csv",store.profile);
  assert.equal(draft.transactions[0].amount,-12.5);
  const preview=previewTransactionImport(store,draft,date);
  assert.deepEqual(preview.effects.balanceUpdates,[{accountId:"barclaycard-debt",value:620,asOf:"2026-09-03"}]);
  const result=commitTransactionImport(store,draft,"example-card.csv",date);
  assert.equal(result.store.balances[1].value,620);
  assert.equal(result.store.cardStatement.balance,620);
  assert.deepEqual(result.record.balanceUpdates,[{accountId:"barclaycard-debt",from:500,to:620,asOf:"2026-09-03"}]);
  const newer={...store,balances:[current,{...card,value:700,asOf:"2026-09-04"}]};
  const older=commitTransactionImport(newer,draft,"older-card.csv",date);
  assert.equal(older.store.balances[1].value,700);assert.equal(older.store.cardStatement,undefined);
  assert.deepEqual(older.record.balanceUpdates,[]);
});

test("generic CSV still targets a canonical account and applies an opted-in balance",()=>{
  const mapping={version:1,id:"mapping-a",name:"Example",accountId:"other-current",dateColumn:"Date",descriptionColumn:"Description",amountMode:"single",amountColumn:"Amount",balanceColumn:"Balance",dateFormat:"UK",spendingSign:"negative"};
  const store={...base(),balances:[...base().balances,{id:"other-current",name:"Other current",group:"asset",type:"Current account",value:100,asOf:"2026-09-01"}]};
  const parsed=parseGenericCsv("Date,Description,Amount,Balance\n02/09/2026,Shop,-5,95\n",mapping);
  const draft=normaliseGenericCsvImport(parsed,mapping,store.profile,true);
  const result=commitTransactionImport(store,draft,"other-bank.csv",date);
  assert.equal(result.store.transactions[0].account,"other-current");
  assert.equal(result.store.balances.at(-1).value,95);
  assert.equal(result.record.mappingId,"mapping-a");
  assert.deepEqual(result.record.balanceUpdates,[{accountId:"other-current",from:100,to:95,asOf:"2026-09-02"}]);
});

test("all normalized balance updates validate atomically, including unknown account, invalid money and date",()=>{
  const store=base(),before=JSON.stringify(store);
  const valid={accountId:"monzo-current",value:900,asOf:"2026-09-03"};
  const effects=updates=>({balanceUpdates:updates,preview:[],notices:[],warnings:[]});
  for(const invalid of [{accountId:"missing",value:1,asOf:"2026-09-03"},{accountId:"barclaycard-debt",value:NaN,asOf:"2026-09-03"},{accountId:"barclaycard-debt",value:10,asOf:"2026-02-30"}])assert.throws(()=>applyImportEffects(store,effects([valid,invalid])),/Invalid account balance update/);
  assert.equal(JSON.stringify(store),before);
  const missingAccountDraft={...normaliseMonzoImport(parseMonzoCsv(monzoCsv),store.profile),accountId:"missing"};
  assert.throws(()=>previewTransactionImport(store,missingAccountDraft,date),/missing/);
  assert.equal(JSON.stringify(store),before);
});

test("mortgage adapter owns balance/planner decisions and preserves an older statement as history",()=>{
  const mortgage={id:"mortgage",name:"Home mortgage",group:"liability",type:"Mortgage",value:100000,asOf:"2026-09-01"};
  const store={...base(),balances:[...base().balances,mortgage],mortgagePlanner:{balance:100000,annualRate:4,monthlyPayment:600,monthlyOverpayment:0,annualOverpayment:0,investmentReturn:5}};
  const draft=parseMortgageStatementCsv("Date,Description,Balance\n02/09/2026,Payment,99500\n","mortgage","home.csv");
  const {effects,record}=mortgageImportEffects(store,draft,date);
  assert.deepEqual(effects.balanceUpdates,[{accountId:"mortgage",value:99500,asOf:"2026-09-02"}]);
  assert.equal(effects.storePatch.mortgagePlanner.balance,99500);
  assert.equal(applyImportEffects(store,effects).store.balances.at(-1).value,99500);
  assert.equal(record.importerId,"mortgage");
  const older={...store,mortgageStatements:[{...record,statementDate:"2026-09-03"}]};
  assert.deepEqual(mortgageImportEffects(older,draft,date).effects.balanceUpdates,[]);
});

test("backup and persistence digest retain audit metadata and normalized financial state",()=>{
  const store=base(),draft=normaliseMonzoImport(parseMonzoCsv(monzoCsv),store.profile);
  const result=commitTransactionImport(store,draft,"synthetic.csv",date);
  const restored=parseBackup(serialiseBackup(result.store));
  assert.deepEqual(restored.imports[0],result.record);
  assert.deepEqual(restored.balances,result.store.balances);
  assert.deepEqual(financeStoreDigest(restored),financeStoreDigest(result.store));
});

test("generic transaction workflow contains no provider-specific branching",()=>{
  const workflow=readFileSync(new URL("../lib/import-workflow.ts",import.meta.url),"utf8");
  assert.doesNotMatch(workflow,/Monzo|Barclaycard|Primary Lender|Rental Lender|importerId\s*===/);
});
