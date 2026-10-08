import assert from "node:assert/strict";
import test from "node:test";
import { parseBackup, serialiseBackup } from "../lib/backup.ts";
import { cashAfterCardDebt, debtBalance } from "../lib/balances.ts";
import { createDemoStore } from "../lib/demo.ts";
import { parseGenericCsv } from "../lib/importers.ts";
import { statementMoney } from "../lib/imports.ts";
import { createFreshStore, migrateUserProfile, USER_PROFILE_VERSION } from "../lib/profile.ts";
import { DEFAULT_REGION, defaultCsvDateFormat, formatDate, formatMoney, isValidCurrency, moneyFormatter, normaliseRegion, regionalFormatters } from "../lib/region.ts";

const mapping={version:1,id:"region-map",name:"Region CSV",accountId:"account-main",dateColumn:"Date",descriptionColumn:"Payee",amountMode:"single",amountColumn:"Amount",spendingSign:"negative"};

test("existing profiles migrate additively to the UK regional baseline",()=>{
  const current=createFreshStore();
  const legacy={...current,profile:{...current.profile,version:USER_PROFILE_VERSION-1,region:undefined},balances:[{id:"cash",name:"Cash",group:"asset",type:"Cash",value:1234.56}],transactions:[{id:"t1",date:"2026-09-01",merchant:"Example",category:"Groceries",amount:-12.34,account:"cash"}]};
  const financialBefore={balances:structuredClone(legacy.balances),transactions:structuredClone(legacy.transactions),goals:structuredClone(legacy.goals),snapshots:structuredClone(legacy.snapshots)};
  const migrated=migrateUserProfile(legacy);
  assert.equal(migrated.profile.version,USER_PROFILE_VERSION);
  assert.deepEqual(migrated.profile.region,DEFAULT_REGION);
  const transactionFacts=migrated.transactions.map(transaction=>Object.fromEntries(Object.entries(transaction).filter(([key])=>!["categoryId","subcategoryId","role"].includes(key))));
  assert.deepEqual({balances:migrated.balances,transactions:transactionFacts,goals:migrated.goals,snapshots:migrated.snapshots},financialBefore);
  assert.deepEqual(migrateUserProfile(migrated),migrated);
});

test("GBP, USD and EUR profiles format money and dates from one regional module",()=>{
  const gb=normaliseRegion({country:"GB",currency:"GBP",locale:"en-GB"});
  const us=normaliseRegion({country:"US",currency:"USD",locale:"en-US"});
  const ie=normaliseRegion({country:"IE",currency:"EUR",locale:"en-IE"});
  assert.match(formatMoney(1234.56,gb,true),/£1,234\.56/);
  assert.match(formatMoney(1234.56,us,true),/\$1,234\.56/);
  assert.match(formatMoney(1234.56,ie,true),/€1,234\.56/);
  assert.equal(formatDate("2026-10-08",gb),"08/10/2026");
  assert.equal(formatDate("2026-10-08",us),"10/8/2026");
});

test("custom currency validation rejects unknown codes and exact money uses ISO minor units",()=>{
  assert.equal(isValidCurrency("ZZZ"),false);
  assert.equal(isValidCurrency("JPY"),true);
  const jpy=normaliseRegion({country:"JP",currency:"JPY",locale:"ja-JP"});
  const options=moneyFormatter(jpy,true).resolvedOptions();
  assert.equal(options.minimumFractionDigits,0);
  assert.equal(options.maximumFractionDigits,0);
  assert.doesNotMatch(formatMoney(1234.56,jpy,true),/[.,]56/);
});

test("regional settings survive backup round-trip",()=>{
  const source=createFreshStore();source.profile={...source.profile,region:{country:"US",currency:"USD",locale:"en-US"}};
  const restored=migrateUserProfile(parseBackup(serialiseBackup(source)));
  assert.deepEqual(restored.profile.region,source.profile.region);
});

test("demo mode respects its region without changing fictional financial facts",()=>{
  const date=new Date("2026-10-08T12:00:00Z");
  const gb=createDemoStore({country:"GB",currency:"GBP",locale:"en-GB"},date);
  const us=createDemoStore({country:"US",currency:"USD",locale:"en-US"},date);
  const ie=createDemoStore({country:"IE",currency:"EUR",locale:"en-IE"},date);
  assert.equal(regionalFormatters(us.profile).money.format(4200),"$4,200");
  assert.match(regionalFormatters(ie.profile).money.format(4200),/€4,200/);
  assert.deepEqual(us.transactions,gb.transactions);assert.deepEqual(us.balances,gb.balances);assert.deepEqual(ie.goals,gb.goals);
  assert.equal(cashAfterCardDebt(us.balances),cashAfterCardDebt(gb.balances));assert.equal(debtBalance(ie.balances),debtBalance(gb.balances));
});

test("Generic CSV regional defaults and explicit UK, US and ISO dates remain provider-neutral",()=>{
  assert.equal(defaultCsvDateFormat(normaliseRegion({country:"US",currency:"USD",locale:"en-US"})),"US");
  assert.equal(defaultCsvDateFormat(normaliseRegion({country:"GB",currency:"GBP",locale:"en-GB"})),"UK");
  assert.equal(parseGenericCsv("Date,Payee,Amount\n09/13/2026,Shop,-1",{...mapping,dateFormat:"US"}).transactions[0].date,"2026-09-13");
  assert.equal(parseGenericCsv("Date,Payee,Amount\n13/09/2026,Shop,-1",{...mapping,dateFormat:"UK"}).transactions[0].date,"2026-09-13");
  assert.equal(parseGenericCsv("Date,Payee,Amount\n2026-09-13,Shop,-1",{...mapping,dateFormat:"ISO"}).transactions[0].date,"2026-09-13");
});

test("money parsing accepts common symbols and European decimals without conversion",()=>{
  assert.equal(statementMoney("$1,234.56"),1234.56);
  assert.equal(statementMoney("€1,234.56"),1234.56);
  assert.equal(statementMoney("€1.234,56"),1234.56);
  assert.equal(statementMoney("£1,234.56"),1234.56);
});
