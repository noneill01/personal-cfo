import { normaliseDate, parseBarclaycardFile, parseCsvRows, parseMonzoCsv, parseMortgageStatementCsv, statementMoney } from "./imports.ts";
import { inferCategory, inferSubcategory, isSavingsChallengeTransfer } from "./classification.ts";
import { cardStatementCanUpdate } from "./balances.ts";
import { baselineMortgagePlanner } from "./mortgage.ts";
import type { CardStatementSummary, CsvImportMapping, MortgageAccountId, MortgageImportDraft, MortgagePlanner, MortgageStatementRecord, ParsedCardFile, Store, Tx, UserProfile } from "./types.ts";

export type ImportDetection = { id: "monzo" | "barclaycard" | "generic-csv"; confidence: "strong" | "saved" | "manual"; mappingId?: string };
export type ImportPreview = { transactions: Tx[]; rejected: number; issues: string[]; headers?: string[]; rows?: number; balance?: {value:number;asOf:string} };
export type Importer<Input, Options, Output> = {
  id: string; name: string;
  detect: (input: Input) => boolean;
  preview: (input: Input, options: Options) => Promise<Output> | Output;
  validate: (output: Output) => string[];
  normalise: (output: Output) => Output;
};

export const monzoImporter: Importer<string, void, ReturnType<typeof parseMonzoCsv>> = {
  id: "monzo", name: "Monzo", detect: text => {
    try { const headers=csvHeaders(text).map(header=>header.toLowerCase()); return headers.includes("transaction id") && headers.includes("name") && headers.some(header=>header.startsWith("amount")); } catch { return false; }
  },
  preview: text => parseMonzoCsv(text), validate: output => output.transactions.length ? [] : ["No valid Monzo transactions found."], normalise: output => output,
};
export const barclaycardImporter: Importer<File, void, ParsedCardFile> = {
  id: "barclaycard", name: "Barclaycard", detect: file => /barclaycard/i.test(file.name),
  preview: file => parseBarclaycardFile(file), validate: output => output.transactions.length ? [] : ["No card transactions found."], normalise: output => output,
};
/** Preserve the existing card statement sign/category behaviour at the adapter edge. */
export function normaliseBarclaycardTransactions(parsed:ParsedCardFile,fileName:string,profile?:UserProfile):Tx[] {
  return parsed.transactions.map((row,index)=>{
    const category=inferCategory(row.merchant,row.sourceCategory,profile?.incomeSources,profile?.merchantCategoryHints,profile?.origin==="fresh"?"generic":"legacy");
    const fingerprint=row.fingerprint??`${fileName}|${row.date}|${row.merchant.trim().toLowerCase()}|${row.amount.toFixed(2)}|${index}`;
    return {id:`barclaycard-${Date.now()}-${index}`,...row,fingerprint,date:row.date,merchant:row.merchant,amount:row.amount,transactionType:row.transactionType,category,subcategory:profile?.origin==="fresh"?undefined:inferSubcategory(category,row.merchant,row.sourceCategory,profile?.incomeSources,profile?.merchantSubcategoryHints),account:"Barclaycard"};
  });
}
export const mortgageImporter: Importer<{ text: string; mortgageId: MortgageAccountId; fileName: string }, void, MortgageImportDraft> = {
  id: "mortgage", name: "Mortgage statement", detect: input => /mortgage/i.test(input.fileName),
  preview: input => parseMortgageStatementCsv(input.text,input.mortgageId,input.fileName),
  validate: output => Number.isFinite(output.balance) ? [] : ["No mortgage balance found."], normalise: output => output,
};

export type NormalisedImportDraft = {
  importerId: "monzo" | "barclaycard" | "generic-csv";
  source: "Monzo" | "Barclaycard" | "Generic CSV";
  accountId: string;
  mappingId?: string;
  transactions: Tx[];
  rejected: number;
  issues: string[];
  providerMetadata?: {cardStatement?:CardStatementSummary;requestedBalance?:{value:number;asOf:string}};
};
export type AccountBalanceUpdate = {accountId:string;value:number;asOf:string};
export type NormalisedImportEffects = {
  balanceUpdates: AccountBalanceUpdate[];
  storePatch?: Partial<Pick<Store,"cardStatement"|"monzoBalanceTracking"|"savingsChallengeTracking"|"potPosition"|"mortgagePlanner">>;
  preview: Array<{title:string;value:string;note:string}>;
  notices: string[];
  warnings: string[];
};
export type ImportEffectContext = {store:Store;draft:NormalisedImportDraft;classified:Tx[];fresh:Tx[];base:Tx[];now:string};
const money=(value:number)=>new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP",minimumFractionDigits:2}).format(value);
const commonClassification=(transactions:Tx[],profile?:UserProfile)=>transactions.map(row=>{
  const category=inferCategory(row.merchant,row.importedCategory,profile?.incomeSources,profile?.merchantCategoryHints,profile?.origin==="fresh"?"generic":"legacy");
  return {...row,category,subcategory:profile?.origin==="fresh"?undefined:inferSubcategory(category,row.merchant,row.importedCategory,profile?.incomeSources,profile?.merchantSubcategoryHints)};
});
export function normaliseMonzoImport(parsed:ReturnType<typeof parseMonzoCsv>,profile?:UserProfile,accountId="monzo-current"):NormalisedImportDraft {
  return {importerId:"monzo",source:"Monzo",accountId,transactions:commonClassification(parsed.transactions,profile),rejected:parsed.rejected,issues:parsed.issues};
}
export function normaliseBarclaycardImport(parsed:ParsedCardFile,fileName:string,profile?:UserProfile,accountId="barclaycard-debt"):NormalisedImportDraft {
  return {importerId:"barclaycard",source:"Barclaycard",accountId,transactions:normaliseBarclaycardTransactions(parsed,fileName,profile),rejected:parsed.rejected,issues:parsed.issues,providerMetadata:{cardStatement:parsed.summary}};
}
export function normaliseGenericCsvImport(parsed:ImportPreview,mapping:CsvImportMapping,profile?:UserProfile,applyBalance=false):NormalisedImportDraft {
  return {importerId:"generic-csv",source:"Generic CSV",accountId:mapping.accountId,mappingId:mapping.id,transactions:commonClassification(parsed.transactions,profile),rejected:parsed.rejected,issues:parsed.issues,providerMetadata:applyBalance&&parsed.rejected===0?{requestedBalance:parsed.balance}:undefined};
}

function monzoEffects({store,draft,classified,fresh,base,now}:ImportEffectContext):NormalisedImportEffects {
  const tracker=store.monzoBalanceTracking;const syncThrough=classified.map(row=>row.date).filter(Boolean).sort().at(-1)??"";
  const account=store.balances.find(balance=>balance.id===draft.accountId);
  if(tracker?.enabled&&draft.rejected===0&&!account)throw new Error("The tracked current account is missing; nothing was imported.");
  const movements=tracker?.enabled&&draft.rejected===0?fresh.filter(row=>row.account==="Monzo"&&row.date>=tracker.syncedThrough):[];
  const delta=movements.reduce((sum,row)=>sum+row.amount,0);
  const balanceUpdates:AccountBalanceUpdate[]=tracker?.enabled&&draft.rejected===0&&account?[{accountId:draft.accountId,value:Number((account.value+delta).toFixed(2)),asOf:[tracker.syncedThrough,syncThrough].sort().at(-1)!}]:[];
  const challenge=store.savingsChallengeTracking??{balance:0,syncedThrough:"",updatedAt:""};
  const challengeDelta=fresh.filter(row=>row.date>challenge.syncedThrough&&isSavingsChallengeTransfer(row)).reduce((sum,row)=>sum-row.amount,0);
  const challengeAfter=challenge.balance+challengeDelta;
  const challengeTotal=[...fresh,...base].filter(row=>row.date.startsWith("2026-")&&row.amount<0&&isSavingsChallengeTransfer(row)).reduce((sum,row)=>sum-row.amount,0);
  const storePatch:NormalisedImportEffects["storePatch"]={
    potPosition:{bills:store.potPosition?.bills??0,savings:store.potPosition?.savings??0},
    monzoBalanceTracking:draft.rejected>0?{enabled:false,syncedThrough:tracker?.syncedThrough??"",updatedAt:now}:tracker?.enabled?{...tracker,syncedThrough:[tracker.syncedThrough,syncThrough].sort().at(-1)!,updatedAt:now}:store.monzoBalanceTracking,
    savingsChallengeTracking:draft.rejected===0?{balance:challengeAfter,syncedThrough:[challenge.syncedThrough,syncThrough].sort().at(-1)!,updatedAt:now}:store.savingsChallengeTracking,
  };
  return {balanceUpdates,storePatch,warnings:draft.rejected>0?["This cycle remains incomplete until corrected rows are imported. Automatic balance tracking will pause."]:[],preview:[{title:draft.rejected>0?"CURRENT ACCOUNT TRACKING WILL PAUSE":tracker?.enabled?"CURRENT ACCOUNT WILL UPDATE":"CURRENT ACCOUNT STAYS MANUAL",value:draft.rejected>0?"No balance update from an incomplete file":tracker?.enabled&&account?`${money(account.value)} ${delta<0?"−":"+"} ${money(Math.abs(delta))} = ${money(account.value+delta)}`:"Anchor the exact balance after this import",note:draft.rejected>0?"Correct and reimport the rejected rows to resume tracking.":tracker?.enabled?`${movements.length} new movements after ${tracker.syncedThrough}. Pot transfers affect cash but not spending.`:"The CSV has no running-balance field, so an exact starting balance is needed."}],notices:[...(draft.rejected===0?[`challenge contributions ${money(challengeTotal)} · tracked pot ${money(challengeAfter)}`]:[]),...(tracker?.enabled&&draft.rejected===0?[`current account ${delta>=0?"+":""}${money(delta)} from ${movements.length} new movements`]:[])]};
}
function barclaycardEffects({store,draft}:ImportEffectContext):NormalisedImportEffects {
  const summary=draft.providerMetadata?.cardStatement;
  const allowed=Boolean(summary&&cardStatementCanUpdate(store.balances,store.cardStatement,summary,draft.accountId));
  return {balanceUpdates:allowed&&summary?[{accountId:draft.accountId,value:summary.balance,asOf:summary.statementDate}]:[],storePatch:allowed&&summary?{cardStatement:summary}:undefined,warnings:draft.rejected>0?["Correct and reimport rejected rows if you need complete account history."]:[],preview:summary?[{title:allowed?"STATEMENT BALANCE AFTER IMPORT":"OLDER STATEMENT — CURRENT BALANCE PRESERVED",value:money(summary.balance),note:`Statement dated ${summary.statementDate}`}]:[],notices:summary?[`statement balance ${money(summary.balance)} (newer account records are preserved)`]:[]};
}
function genericEffects({store,draft}:ImportEffectContext):NormalisedImportEffects {
  const requested=draft.providerMetadata?.requestedBalance;const account=store.balances.find(balance=>balance.id===draft.accountId);
  if(!account)throw new Error("The selected account is missing; nothing was imported.");
  const allowed=Boolean(requested&&draft.rejected===0&&account&&(!account.asOf||requested.asOf>=account.asOf));
  return {balanceUpdates:allowed&&requested&&account?[{accountId:draft.accountId,value:account.group==="liability"?Math.abs(requested.value):requested.value,asOf:requested.asOf}]:[],warnings:draft.rejected>0?["Correct and reimport rejected rows if you need complete account history."]:[],preview:requested?[{title:allowed?"SELECTED ACCOUNT BALANCE AFTER IMPORT":"OLDER BALANCE — CURRENT VALUE PRESERVED",value:money(requested.value),note:`Account ${draft.accountId} · as of ${requested.asOf}`}]:[],notices:[]};
}
const effectAdapters:Record<NormalisedImportDraft["importerId"],(context:ImportEffectContext)=>NormalisedImportEffects>={monzo:monzoEffects,barclaycard:barclaycardEffects,"generic-csv":genericEffects};
export function resolveImportEffects(context:ImportEffectContext):NormalisedImportEffects {const adapter=effectAdapters[context.draft.importerId];if(!adapter)throw new Error("Unknown importer; nothing was imported.");return adapter(context)}

/** Validate every proposed update before returning a new state; no partial writes. */
export function applyImportEffects(store:Store,effects:NormalisedImportEffects):{store:Store;applied:Array<{accountId:string;from:number;to:number;asOf:string}>} {
  const updates=new Map<string,AccountBalanceUpdate>();
  for(const update of effects.balanceUpdates){
    const balance=store.balances.find(item=>item.id===update.accountId);
    if(!balance||updates.has(update.accountId)||!Number.isFinite(update.value)||!/^\d{4}-\d{2}-\d{2}$/.test(update.asOf)||Number.isNaN(Date.parse(`${update.asOf}T12:00:00Z`))||new Date(`${update.asOf}T12:00:00Z`).toISOString().slice(0,10)!==update.asOf)throw new Error("Invalid account balance update; nothing was imported.");
    updates.set(update.accountId,update);
  }
  const applied=store.balances.filter(balance=>updates.has(balance.id)).map(balance=>{const update=updates.get(balance.id)!;return {accountId:balance.id,from:balance.value,to:update.value,asOf:update.asOf}});
  const balances=store.balances.map(balance=>{const update=updates.get(balance.id);return update?{...balance,value:update.value,asOf:update.asOf}:balance});
  return {store:{...store,...effects.storePatch,balances},applied};
}

export function mortgageImportEffects(store:Store,draft:MortgageImportDraft,now:string):{effects:NormalisedImportEffects;record:MortgageStatementRecord} {
  const existing=store.mortgageStatements??[];const latestDate=existing.filter(record=>record.mortgageId===draft.mortgageId).map(record=>record.statementDate).sort().at(-1)??"";
  const updateCurrent=!latestDate||draft.statementDate>=latestDate;
  const currentPlanner=store.mortgagePlanner??baselineMortgagePlanner;
  const effects:NormalisedImportEffects={balanceUpdates:updateCurrent?[{accountId:draft.mortgageId,value:draft.balance,asOf:draft.statementDate}]:[],storePatch:updateCurrent&&draft.mortgageId==="mortgage"?{mortgagePlanner:{...currentPlanner,balance:draft.balance,annualRate:draft.interestRate??currentPlanner.annualRate} as MortgagePlanner}:undefined,preview:[],notices:[],warnings:draft.warnings};
  const record:MortgageStatementRecord={id:`mortgage-statement-${draft.mortgageId}-${draft.statementDate}-${Date.now()}`,fileName:draft.fileName,mortgageId:draft.mortgageId,importerId:"mortgage",accountId:draft.mortgageId,lender:draft.lender,statementDate:draft.statementDate,balance:draft.balance,previousBalance:draft.previousBalance,rows:draft.rows,importedAt:now,interestPaid:draft.interestPaid,interestRate:draft.interestRate,interestRateDate:draft.interestRateDate,capitalPaid:draft.capitalPaid,payments:draft.payments};
  return {effects,record};
}

export function csvHeaders(text: string): string[] {
  if (text.includes("\uFFFD") || text.includes("\0")) throw new Error("Unsupported CSV encoding. Export a UTF-8 CSV.");
  const rows=parseCsvRows(text.replace(/^\uFEFF/,""));
  if (!rows.length) throw new Error("The CSV file is empty.");
  const headers=rows[0].map(header=>header.trim());
  if (headers.some(header=>!header)) throw new Error("The CSV contains a blank column header.");
  if (new Set(headers.map(header=>header.toLowerCase())).size!==headers.length) throw new Error("The CSV contains duplicate column headers.");
  if (headers.length<2) throw new Error("This does not look like a comma-separated CSV with headers.");
  return headers;
}

export function detectCsvImport(text: string, mappings: CsvImportMapping[], explicit?: "monzo" | "barclaycard" | string, fileName=""): ImportDetection[] {
  if (explicit) return [{id:explicit==="monzo"?"monzo":explicit==="barclaycard"?"barclaycard":"generic-csv",confidence:"manual",mappingId:explicit!=="monzo"&&explicit!=="barclaycard"?explicit:undefined}];
  const headers=csvHeaders(text);
  const strong: ImportDetection[]=[];
  if (monzoImporter.detect(text)) strong.push({id:"monzo",confidence:"strong"});
  if (/barclaycard/i.test(fileName)) strong.push({id:"barclaycard",confidence:"strong"});
  if (strong.length) return strong;
  const matches=mappings.filter(mapping=>mapping.version===1 && requiredColumns(mapping).every(column=>headers.includes(column)));
  return matches.length?matches.map(mapping=>({id:"generic-csv",confidence:"saved",mappingId:mapping.id})):[{id:"generic-csv",confidence:"manual"}];
}

const requiredColumns=(mapping:CsvImportMapping)=>[mapping.dateColumn,mapping.descriptionColumn,...(mapping.amountMode==="single"?[mapping.amountColumn??""]:[mapping.debitColumn??"",mapping.creditColumn??""])];
const validDate=(date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(`${date}T12:00:00Z`))&&new Date(`${date}T12:00:00Z`).toISOString().slice(0,10)===date;
const numeric=(raw:string)=>raw.trim() && /^[+\-£€$\d\s.,()]+$/.test(raw) ? statementMoney(raw) : Number.NaN;
const dateValue=(raw:string,format:CsvImportMapping["dateFormat"])=>{
  if (format==="US") { const match=raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return match?`${match[3]}-${match[1].padStart(2,"0")}-${match[2].padStart(2,"0")}`:""; }
  if (format==="ISO" && !/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return "";
  return normaliseDate(raw);
};

export function parseGenericCsv(text:string,mapping:CsvImportMapping):ImportPreview {
  const headers=csvHeaders(text);const rows=parseCsvRows(text.replace(/^\uFEFF/,""));
  if (!mapping.accountId) throw new Error("Select a destination account.");
  const missing=requiredColumns(mapping).filter(column=>!headers.includes(column));
  if (missing.length) throw new Error(`Missing mapped column${missing.length===1?"":"s"}: ${missing.join(", ")}.`);
  const optional=[mapping.referenceColumn,mapping.transactionTypeColumn,mapping.categoryColumn,mapping.balanceColumn].filter((column):column is string=>Boolean(column));
  const missingOptional=optional.filter(column=>!headers.includes(column));
  if (missingOptional.length) throw new Error(`Missing optional mapped column: ${missingOptional.join(", ")}.`);
  const issues:string[]=[];const transactions:Tx[]=[];const occurrences=new Map<string,number>();let balance:ImportPreview["balance"];
  rows.slice(1).forEach((cells,index)=>{
    if (!cells.some(cell=>cell.trim())) return;
    if (cells.length!==headers.length) { issues.push(`Row ${index+2}: expected ${headers.length} columns, found ${cells.length}.`); return; }
    const row=Object.fromEntries(headers.map((header,i)=>[header,cells[i].trim()]));
    const date=dateValue(row[mapping.dateColumn],mapping.dateFormat);const merchant=row[mapping.descriptionColumn];
    let amount=Number.NaN;
    if (mapping.amountMode==="single") { amount=numeric(row[mapping.amountColumn!]); if(mapping.spendingSign==="positive") amount=-amount; }
    else { const debit=row[mapping.debitColumn!],credit=row[mapping.creditColumn!];
      if (debit&&credit) { issues.push(`Row ${index+2}: both debit and credit are populated.`);return; }
      amount=debit?-Math.abs(numeric(debit)):credit?Math.abs(numeric(credit)):Number.NaN;
    }
    if (!validDate(date)||!merchant||!Number.isFinite(amount)||amount===0) { issues.push(`Row ${index+2}: ${!validDate(date)?"invalid date":!merchant?"missing description":"invalid or zero amount"}.`); return; }
    if(mapping.balanceColumn&&row[mapping.balanceColumn]){const value=numeric(row[mapping.balanceColumn]);if(!Number.isFinite(value)){issues.push(`Row ${index+2}: invalid running balance.`);return}if(!balance||date>=balance.asOf)balance={value,asOf:date};}
    const reference=mapping.referenceColumn?row[mapping.referenceColumn]:"";
    const importedCategory=mapping.categoryColumn?row[mapping.categoryColumn]:"";
    const identity=[mapping.accountId,date,amount.toFixed(2),merchant.toLowerCase().replace(/\s+/g," "),reference.toLowerCase()].join("|");
    const occurrence=(occurrences.get(identity)??0)+1;occurrences.set(identity,occurrence);
    const fingerprint=`generic-v1|${identity}|${occurrence}`;
    transactions.push({id:fingerprint, date,merchant,originalDescription:merchant,reference:reference||undefined,importedCategory:importedCategory||undefined,transactionType:mapping.transactionTypeColumn?row[mapping.transactionTypeColumn]||undefined:undefined,category:importedCategory||"Other",amount,account:mapping.accountId,fingerprint});
  });
  if (!transactions.length) throw new Error(`No valid transactions found.${issues.length?` ${issues.slice(0,3).join(" ")}`:""}`);
  return {transactions,rejected:issues.length,issues,headers,rows:rows.length-1,balance};
}
export const genericCsvImporter: Importer<string,CsvImportMapping,ImportPreview> = {
  id:"generic-csv",name:"Generic CSV",detect:text=>{try{csvHeaders(text);return true}catch{return false}},
  preview:parseGenericCsv,validate:output=>output.transactions.length?[]:["No valid transactions found."],normalise:output=>output,
};
