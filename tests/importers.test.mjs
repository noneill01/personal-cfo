import test from "node:test";
import assert from "node:assert/strict";
import { barclaycardImporter, csvHeaders, detectCsvImport, genericCsvImporter, monzoImporter, mortgageImporter, normaliseBarclaycardTransactions, parseGenericCsv } from "../lib/importers.ts";
import { parseBarclaycardCsv, parseMonzoCsv } from "../lib/imports.ts";
import { reconcileImportedTransactions } from "../lib/transactions.ts";
import { classifyWithRules, inferCategory, inferSubcategory } from "../lib/classification.ts";
import { explicitRecurringCommitments } from "../lib/plan.ts";
import { createFreshStore } from "../lib/profile.ts";
import { parseBackup, serialiseBackup } from "../lib/backup.ts";
import { financeStoreDigest } from "../lib/storage.ts";
import { assetBalance, debtBalance, cashBalance, currentAccountBalance, savingsBalance, cardDebtBalance, mortgageDebtBalance, investmentBalance, pensionBalance, propertyAssetBalance } from "../lib/balances.ts";

const mapping={version:1,id:"synthetic-map",name:"Synthetic bank",accountId:"account-abc",dateColumn:"Date",descriptionColumn:"Payee",amountMode:"single",amountColumn:"Amount",dateFormat:"UK",spendingSign:"negative"};
const single="Date,Payee,Amount,Reference,Type,Category,Balance\n01/09/2026,Corner Shop,-12.50,ref-1,Card payment,Groceries,900\n02/09/2026,Example Payroll,2000,ref-2,Credit,Income,2900\n";

test("existing Monzo and Barclaycard parsers retain their canonical output behind adapters", async()=>{
  const monzo="Transaction ID,Date,Name,Amount,Category,Type\nabc,01/09/2026,Cafe,-5.00,Eating out,Card payment\n";
  assert.deepEqual(await monzoImporter.preview(monzo,undefined),parseMonzoCsv(monzo));
  const card="Transaction Date,Transaction Description,Debit Amount,Credit Amount\n01/09/2026,Shop,12.50,\n";
  const file=new File([card],"synthetic-card.csv",{type:"text/csv"});
  assert.deepEqual(await barclaycardImporter.preview(file,undefined),parseBarclaycardCsv(card,file.name));
  const canonical=normaliseBarclaycardTransactions(await barclaycardImporter.preview(file,undefined),file.name);
  assert.equal(canonical[0].account,"Barclaycard");assert.equal(canonical[0].amount,-12.5);assert.ok(canonical[0].fingerprint);
  assert.equal(monzoImporter.detect(monzo),true);
  assert.equal(barclaycardImporter.detect(new File([card],"barclaycard-export.csv")),true);
});

test("generic single amount maps canonical fields, signs, account ID and optional audit fields",()=>{
  const parsed=genericCsvImporter.normalise(parseGenericCsv(single,{...mapping,referenceColumn:"Reference",transactionTypeColumn:"Type",categoryColumn:"Category",balanceColumn:"Balance"}));
  assert.equal(parsed.rejected,0);
  assert.deepEqual(parsed.transactions.map(({date,amount,account,reference,transactionType,importedCategory})=>({date,amount,account,reference,transactionType,importedCategory})),[
    {date:"2026-09-01",amount:-12.5,account:"account-abc",reference:"ref-1",transactionType:"Card payment",importedCategory:"Groceries"},
    {date:"2026-09-02",amount:2000,account:"account-abc",reference:"ref-2",transactionType:"Credit",importedCategory:"Income"},
  ]);
  assert.equal(parsed.transactions[0].originalDescription,"Corner Shop");
  assert.deepEqual(parsed.balance,{value:2900,asOf:"2026-09-02"});
});

test("debit/credit and positive-spending layouts normalise into signed amounts",()=>{
  const debit=parseGenericCsv("Date,Payee,Debit,Credit\n03/09/2026,Bill,45,\n04/09/2026,Refund,,12\n",{...mapping,amountMode:"debit-credit",debitColumn:"Debit",creditColumn:"Credit"});
  assert.deepEqual(debit.transactions.map(row=>row.amount),[-45,12]);
  const positive=parseGenericCsv("Date,Payee,Amount\n03/09/2026,Bill,45\n04/09/2026,Refund,-12\n",{...mapping,spendingSign:"positive"});
  assert.deepEqual(positive.transactions.map(row=>row.amount),[-45,12]);
});

test("custom US and strict ISO dates validate calendar dates",()=>{
  assert.equal(parseGenericCsv("Date,Payee,Amount\n09/13/2026,Shop,-1\n",{...mapping,dateFormat:"US"}).transactions[0].date,"2026-09-13");
  assert.equal(parseGenericCsv("Date,Payee,Amount\n2026-09-13,Shop,-1\n",{...mapping,dateFormat:"ISO"}).transactions[0].date,"2026-09-13");
  assert.throws(()=>parseGenericCsv("Date,Payee,Amount\n13/09/2026,Shop,-1\n",{...mapping,dateFormat:"US"}),/No valid transactions/);
});

test("same import twice skips duplicates while two identical source rows remain distinct",()=>{
  const parsed=parseGenericCsv("Date,Payee,Amount\n01/09/2026,Shop,-12.50\n01/09/2026,Shop,-12.50\n",mapping);
  assert.notEqual(parsed.transactions[0].fingerprint,parsed.transactions[1].fingerprint);
  const first=reconcileImportedTransactions([],parsed.transactions);
  assert.equal(first.fresh.length,2);
  const second=reconcileImportedTransactions(first.fresh,parsed.transactions);
  assert.equal(second.fresh.length,0);assert.equal(second.skipped,2);
  assert.equal(reconcileImportedTransactions([{...parsed.transactions[0],account:"another-account"}],parsed.transactions).fresh.length,2);
});

test("malformed rows are reported, empty/invalid files fail, and existing state remains untouched",()=>{
  const source=createFreshStore();const before=JSON.stringify(source);
  const partial=parseGenericCsv("Date,Payee,Amount\n01/09/2026,Valid,-2\n31/02/2026,Bad,-3\n02/09/2026,Both,-2,extra\n",mapping);
  assert.equal(partial.transactions.length,1);assert.equal(partial.rejected,2);assert.match(partial.issues[0],/invalid date/);assert.match(partial.issues[1],/expected 3 columns/);
  for(const csv of ["", "Date,Date,Amount\n1,2,3", "Date,Payee,Amount\n01/09/2026,Shop,bad", "Date,Payee,Amount\n01/09/2026,Shop,-1,extra", "Date,Payee,Amount\n01/09/2026,Shop,-1\uFFFD"]){assert.throws(()=>parseGenericCsv(csv,mapping));}
  assert.throws(()=>parseGenericCsv("Date,Payee,Amount\n01/09/2026,Shop,-1\n",{...mapping,descriptionColumn:"Merchant"}),/Missing mapped column/);
  assert.throws(()=>parseGenericCsv("Date,Payee,Debit,Credit\n01/09/2026,Shop,2,3\n",{...mapping,amountMode:"debit-credit",debitColumn:"Debit",creditColumn:"Credit"}),/both debit and credit/);
  assert.equal(JSON.stringify(source),before);
});

test("detection honours explicit choice, known adapters, saved mappings and ambiguity",()=>{
  assert.deepEqual(detectCsvImport(single,[mapping]),[{id:"generic-csv",confidence:"saved",mappingId:mapping.id}]);
  assert.deepEqual(detectCsvImport(single,[mapping],"monzo"),[{id:"monzo",confidence:"manual",mappingId:undefined}]);
  const monzo="Transaction ID,Date,Name,Amount\na,01/09/2026,Shop,-1\n";
  assert.deepEqual(detectCsvImport(monzo,[]),[{id:"monzo",confidence:"strong"}]);
  assert.equal(detectCsvImport(monzo,[],undefined,"barclaycard-export.csv").length,2);
  assert.deepEqual(detectCsvImport("Date,Payee,Amount\n01/09/2026,Shop,-1\n",[]),[{id:"generic-csv",confidence:"manual"}]);
  assert.deepEqual(csvHeaders("\uFEFFDate,Payee,Amount\n"),["Date","Payee","Amount"]);
});

test("saved mapping persists in profile/backups without raw rows or changes to financial totals",()=>{
  const source=createFreshStore();const totalsBefore=financeStoreDigest(source);
  source.balances=[{id:"account-abc",name:"Synthetic current",group:"asset",type:"Current account",value:200},{id:"card",name:"Card",group:"liability",type:"Credit card",value:50}];
  const selectors=[assetBalance,debtBalance,cashBalance,currentAccountBalance,savingsBalance,cardDebtBalance,mortgageDebtBalance,investmentBalance,pensionBalance,propertyAssetBalance];
  const before=selectors.map(selector=>selector(source.balances));
  source.profile={...source.profile,accounts:[{id:mapping.accountId,name:"Synthetic current",kind:"current"}],csvMappings:[mapping]};
  const restored=parseBackup(serialiseBackup(source));
  assert.deepEqual(restored.profile.csvMappings,[mapping]);
  assert.equal(JSON.stringify(restored).includes("Corner Shop"),false);
  assert.deepEqual(restored.balances,source.balances);assert.deepEqual(restored.transactions,[]);
  assert.deepEqual(selectors.map(selector=>selector(restored.balances)),before);
  assert.notDeepEqual(financeStoreDigest(source),totalsBefore);
});

test("generic rows use existing classification and recurring commitment evidence",()=>{
  const rows=parseGenericCsv("Date,Payee,Amount\n01/08/2026,Example Subscription,-20\n01/09/2026,Example Subscription,-20\n",mapping).transactions;
  const classified=rows.map(row=>{const category=inferCategory(row.merchant,row.importedCategory);return classifyWithRules({...row,category,subcategory:inferSubcategory(category,row.merchant),spendingTreatment:"Recurring"},[{key:"example subscription",label:"Example Subscription",category:"Bills",subcategory:"Subscriptions",updatedAt:"2026-09-01"}]);});
  assert.equal(classified[0].category,"Bills");
  assert.ok(explicitRecurringCommitments(classified).some(item=>item.label.toLowerCase().includes("example")));
});

test("mortgage adapter preserves parsed balance path",()=>{
  assert.equal(mortgageImporter.id,"mortgage");
  assert.equal(typeof mortgageImporter.preview,"function");
});
