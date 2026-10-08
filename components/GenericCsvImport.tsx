"use client";
import { useState } from "react";
import { csvHeaders, detectCsvImport, parseGenericCsv } from "../lib/importers";
import type { AccountKind, CsvImportMapping } from "../lib/types";

type Props = {
  accounts: {id:string;name:string;kind:AccountKind}[];
  mappings: CsvImportMapping[];
  onGeneric: (file:File,mapping:CsvImportMapping,save:boolean,applyBalance:boolean)=>Promise<void>;
  onMonzo: (file:File,accountId?:string)=>Promise<void>;
  onBarclaycard: (file:File,accountId?:string)=>Promise<void>;
  onCreateAccount: (name:string,kind:AccountKind)=>string;
};
const blankMapping=():CsvImportMapping=>({version:1,id:`mapping-${crypto.randomUUID()}`,name:"My account CSV",accountId:"",dateColumn:"",descriptionColumn:"",amountMode:"single",amountColumn:"",spendingSign:"negative",dateFormat:"UK"});

export default function GenericCsvImport({accounts,mappings,onGeneric,onMonzo,onBarclaycard,onCreateAccount}:Props){
  const [file,setFile]=useState<File|null>(null),[content,setContent]=useState(""),[headers,setHeaders]=useState<string[]>([]);
  const [choice,setChoice]=useState("auto"),[mapping,setMapping]=useState<CsvImportMapping>(blankMapping);
  const [error,setError]=useState(""),[preview,setPreview]=useState<ReturnType<typeof parseGenericCsv>|null>(null);
  const [save,setSave]=useState(true),[applyBalance,setApplyBalance]=useState(false),[accountName,setAccountName]=useState(""),[accountKind,setAccountKind]=useState<AccountKind>("current");
  const [providerAccountId,setProviderAccountId]=useState("");
  const detected=content?detectCsvImport(content,mappings,undefined,file?.name):[];
  const resolved=choice==="auto"&&detected.length===1?detected[0]:null;
  const activeMapping=choice.startsWith("mapping:")?mappings.find(item=>item.id===choice.slice(8))??mapping:resolved?.mappingId?mappings.find(item=>item.id===resolved.mappingId)??mapping:mapping;
  const provider=choice==="auto"?resolved?.id:choice;
  const providerAccounts=accounts.filter(account=>account.kind===(provider==="monzo"?"current":"credit-card"));
  const selectedProviderAccount=providerAccounts.some(account=>account.id===providerAccountId)?providerAccountId:providerAccounts[0]?.id;
  const patch=(value:Partial<CsvImportMapping>)=>{setMapping(current=>({...current,...value}));setPreview(null);setError("")};
  async function chooseFile(next:File){
    setFile(next);setPreview(null);setError("");setChoice("auto");
    try{const text=await next.text();const columns=csvHeaders(text);setContent(text);setHeaders(columns);
      const find=(...names:string[])=>columns.find(column=>names.includes(column.toLowerCase()))??"";
      setMapping({...blankMapping(),accountId:accounts[0]?.id??"",dateColumn:find("date","transaction date","posted date"),descriptionColumn:find("description","merchant","name","payee"),amountColumn:find("amount","value"),debitColumn:find("debit","paid out"),creditColumn:find("credit","paid in")});
    }catch(cause){setContent("");setHeaders([]);setError(cause instanceof Error?cause.message:"Could not read CSV.")}
  }
  function previewRows(){try{setError("");setPreview(parseGenericCsv(content,activeMapping))}catch(cause){setPreview(null);setError(cause instanceof Error?cause.message:"Could not preview CSV.")}}
  const select=(label:string,key:keyof CsvImportMapping,required=false)=><label className="generic-csv-field"><span>{label}</span><select aria-label={label} value={String(activeMapping[key]??"")} onChange={event=>patch({[key]:event.target.value})} disabled={choice.startsWith("mapping:")||Boolean(resolved?.mappingId&&choice==="auto")}><option value="">{required?"Choose column":"Not mapped"}</option>{headers.map(header=><option key={header} value={header}>{header}</option>)}</select></label>;
  return <article className="panel generic-csv-panel">
    <div className="panel-head"><div><h3>Import another bank’s CSV</h3><p>Map the columns once, link an account, then reuse the mapping. Your file stays on this device.</p></div><span className="safe-badge">Preview first</span></div>
    <label className="generic-csv-file"><span>CSV file</span><input type="file" accept=".csv,text/csv" aria-label="Choose a bank CSV" onChange={event=>{const selected=event.target.files?.[0];if(selected)void chooseFile(selected);event.target.value=""}}/></label>
    {file&&headers.length>0&&<>
      <p><strong>{file.name}</strong> · {headers.length} columns found</p>
      <label className="generic-csv-field"><span>Importer</span><select aria-label="Choose importer or saved mapping" value={choice} onChange={event=>{setChoice(event.target.value);setPreview(null);setError("")}}>
        <option value="auto">Automatic{detected.length===1?` · ${detected[0].id}${detected[0].mappingId?" saved mapping":""}`:detected.length>1?" · choose below":" · generic mapper"}</option>
        <option value="generic-csv">Generic CSV · new mapping</option><option value="monzo">Monzo</option><option value="barclaycard">Barclaycard</option>
        {mappings.map(item=><option key={item.id} value={`mapping:${item.id}`}>{item.name}</option>)}
      </select></label>
      {choice==="auto"&&detected.length>1&&<p role="alert">More than one importer matches. Choose one explicitly above.</p>}
      {(provider==="monzo"||provider==="barclaycard")&&<><label className="generic-csv-field"><span>Destination account</span><select aria-label="Destination account for provider import" value={selectedProviderAccount??""} onChange={event=>setProviderAccountId(event.target.value)}><option value="">Choose account</option>{providerAccounts.map(account=><option key={account.id} value={account.id}>{account.name}</option>)}</select></label>{!providerAccounts.length&&<p role="status">Add a {provider==="monzo"?"current":"credit-card"} account before importing this statement.</p>}<button className="primary" disabled={!selectedProviderAccount} onClick={()=>{if(file&&selectedProviderAccount)void(provider==="monzo"?onMonzo(file,selectedProviderAccount):onBarclaycard(file,selectedProviderAccount))}}>Preview with {provider==="monzo"?"Monzo":"Barclaycard"} importer</button></>}
      {(provider==="generic-csv"||choice.startsWith("mapping:")||choice==="auto"&&detected.length===0)&&<>
        <div className="generic-csv-fields">
          <label className="generic-csv-field"><span>Mapping name</span><input aria-label="Mapping name" value={activeMapping.name} onChange={event=>patch({name:event.target.value})} disabled={choice.startsWith("mapping:")||Boolean(resolved?.mappingId&&choice==="auto")}/></label>
          <label className="generic-csv-field"><span>Destination account</span><select aria-label="Destination account" value={activeMapping.accountId} onChange={event=>patch({accountId:event.target.value})} disabled={choice.startsWith("mapping:")||Boolean(resolved?.mappingId&&choice==="auto")}><option value="">Choose account</option>{accounts.map(account=><option key={account.id} value={account.id}>{account.name} · {account.kind}</option>)}</select></label>
          {select("Transaction date", "dateColumn",true)}{select("Description / payee", "descriptionColumn",true)}
          <label className="generic-csv-field"><span>Amount layout</span><select aria-label="Amount layout" value={activeMapping.amountMode} onChange={event=>patch({amountMode:event.target.value as CsvImportMapping["amountMode"]})} disabled={choice.startsWith("mapping:")||Boolean(resolved?.mappingId&&choice==="auto")}><option value="single">One signed amount column</option><option value="debit-credit">Separate debit and credit columns</option></select></label>
          {activeMapping.amountMode==="single"?select("Amount", "amountColumn",true):<>{select("Debit", "debitColumn",true)}{select("Credit", "creditColumn",true)}</>}
          <label className="generic-csv-field"><span>Date format</span><select aria-label="Date format" value={activeMapping.dateFormat??"UK"} onChange={event=>patch({dateFormat:event.target.value as CsvImportMapping["dateFormat"]})} disabled={choice.startsWith("mapping:")||Boolean(resolved?.mappingId&&choice==="auto")}><option value="UK">UK (day/month/year)</option><option value="ISO">ISO (year-month-day)</option><option value="US">US (month/day/year)</option></select></label>
          {activeMapping.amountMode==="single"&&<label className="generic-csv-field"><span>Spending appears as</span><select aria-label="Spending sign" value={activeMapping.spendingSign??"negative"} onChange={event=>patch({spendingSign:event.target.value as CsvImportMapping["spendingSign"]})} disabled={choice.startsWith("mapping:")||Boolean(resolved?.mappingId&&choice==="auto")}><option value="negative">Negative amounts</option><option value="positive">Positive amounts</option></select></label>}
          {select("Reference", "referenceColumn")}{select("Transaction type", "transactionTypeColumn")}{select("Source category", "categoryColumn")}{select("Running balance (audit only)", "balanceColumn")}
        </div>
        {!accounts.length&&<p>No account exists yet. Create one below before importing.</p>}
        <div className="generic-csv-account"><input aria-label="New account name" placeholder="New account name" value={accountName} onChange={event=>setAccountName(event.target.value)}/><select aria-label="New account kind" value={accountKind} onChange={event=>setAccountKind(event.target.value as AccountKind)}><option value="current">Current account</option><option value="savings">Savings</option><option value="credit-card">Credit card</option><option value="investment">Investment</option><option value="other">Other</option></select><button className="ghost" disabled={!accountName.trim()} onClick={()=>{const id=onCreateAccount(accountName.trim(),accountKind);patch({accountId:id});setAccountName("")}}>Add account</button></div>
        <button className="ghost" onClick={previewRows}>Preview mapped rows</button>
        {preview&&<><p role="status">{preview.transactions.length} valid rows · {preview.rejected} rejected. No data has been imported yet.</p>
          <div className="generic-csv-preview"><table><caption>Import preview</caption><thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Account ID</th></tr></thead><tbody>{preview.transactions.slice(0,8).map((row,index)=><tr key={index}><td>{row.date}</td><td>{row.merchant}</td><td>{row.amount.toFixed(2)}</td><td>{row.account}</td></tr>)}</tbody></table></div>
          {preview.issues.length>0&&<details><summary>{preview.issues.length} row issues</summary><ul>{preview.issues.map((issue,index)=><li key={index}>{issue}</li>)}</ul></details>}
          {preview.balance&&<label><input type="checkbox" checked={applyBalance} disabled={preview.rejected>0} onChange={event=>setApplyBalance(event.target.checked)}/> Update this account’s balance to £{preview.balance.value.toFixed(2)} as of {preview.balance.asOf} (only if newer than the saved balance)</label>}
          {!choice.startsWith("mapping:")&&!resolved?.mappingId&&<label><input type="checkbox" checked={save} onChange={event=>setSave(event.target.checked)}/> Save this mapping locally</label>}
          <button className="primary" onClick={()=>{if(file)void onGeneric(file,activeMapping,save&&!choice.startsWith("mapping:")&&!resolved?.mappingId,applyBalance&&Boolean(preview.balance)&&preview.rejected===0)}}>Continue to import review</button>
        </>}
      </>}
    </>}
    {error&&<p role="alert" className="import-error">{error}</p>}
  </article>;
}
