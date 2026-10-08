"use client";
import { useState } from "react";
import { discoverLocalFinanceStore } from "../lib/backup";
import { INDEXED_DB_MIGRATION_BACKUP_KEY } from "../lib/storage";
import AccountBalances from "./AccountBalances";
import CategorySettings from "./CategorySettings";
import { categoryFor, categoryGroupFor } from "../lib/categories";

import type { AccountKind, CsvImportMapping, DirectDebitFrequency, PayslipRecord } from "../lib/types";
import type { AutomaticBackupSettingsProps, SettingsScreenProps } from "../lib/screen-props";
import GenericCsvImport from "./GenericCsvImport";
import RegionalSettings from "./RegionalSettings";
import { regionalFormatters } from "../lib/region";

export default function Settings(props: SettingsScreenProps & AutomaticBackupSettingsProps & {persistenceMode:"loading"|"indexeddb"|"localstorage";importGenericCsv:(file:File,mapping:CsvImportMapping,save:boolean,applyBalance:boolean)=>Promise<void>;importBarclaycard:(file:File)=>Promise<void>;createImportAccount:(name:string,kind:AccountKind)=>string;onOpenSetup:()=>void;ukTaxEnabled:boolean;onToggleUkTax:(enabled:boolean)=>void}) {
  const regional=regionalFormatters(props.store.profile);
  const locale=regional.region.locale,currency=regional.region.currency,symbol=regional.currencySymbol;
  const [hasMigrationBackup]=useState(()=>{try{return Boolean(localStorage.getItem(INDEXED_DB_MIGRATION_BACKUP_KEY)??discoverLocalFinanceStore(localStorage)?.raw)}catch{return false}});
  const [storageOrigin]=useState(()=>typeof window==="undefined"?"":window.location.origin);
  function downloadPreviousFormat(){const raw=localStorage.getItem(INDEXED_DB_MIGRATION_BACKUP_KEY)??discoverLocalFinanceStore(localStorage)?.raw;if(!raw)return;const url=URL.createObjectURL(new Blob([raw],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download="personal-cfo-before-indexeddb.json";a.click();URL.revokeObjectURL(url)}
  const { activeDirectDebits, addManualTransaction, anchorMonzoBalance, annualDirectDebitTotal, applyMerchantClassification, archiveDirectDebit, archivedDirectDebitCount, automaticBackup, availableSubcategories, backupDue, backupRef, backupStatusLabel, cardRef, cashProgress, categories, cycleLabel, dataHealthChecks, dataHealthReady, defaultSubcategories, directDebitHistory, directDebitRows, disableAutomaticBackups, displayedDirectDebitRows, dragging, rentalMortgageCommitment, emptyPayslipDraft, enableAutomaticBackups, exportData, fileRef, gbp, gbpExact, activeEmployerAnnualSalary, activeEmployeePensionRate, activeEmployerPensionRate, importCsv, latestCardImport, latestMonzoImport, manual, maxDirectDebitHistory, monthlyDirectDebitTotal, monzoBalanceTracking, pauseMonzoBalanceTracking, payCycleKey, payday, payslipDraft, payslipRef, payslips, payrollMonths, persistenceMode, reconnectAutomaticBackups, resetWithBackup, salaryDates, saveAutomaticBackupNow, saveManualPayslip, saveSnapshot, setBudgetCycle, setCategory, setDetailKey, setDragging, setManual, setPayslipDraft, setPeriod, setSelectedPayslipId, setShowArchivedDirectDebits, setStore, setSubcategoryFilter, setTab, setTxView, showArchivedDirectDebits, store, tab, totals, updateBalance, updateDirectDebitSetting } = props;
  const outstandingChecks=dataHealthChecks.length-dataHealthReady;
  const activePayRule=store.profile?.paySchedule?.rules.at(-1);
  const activeEmployer=activePayRule?.employer??"";
  const activeEmployerLabel=activeEmployer||"Current employer";
  const isActivePayslip=(p:PayslipRecord)=>Boolean(activeEmployer&&p.employer?.toLowerCase().includes(activeEmployer.toLowerCase()));
  const activeEmployerPayslips=payslips.filter(isActivePayslip);
  const historicalPayslips=payslips.filter(p=>!isActivePayslip(p));
  const activeEmployerPayrollMonths=payrollMonths.map(month=>{const records=month.records.filter(isActivePayslip);const sum=(field:keyof Pick<PayslipRecord,"netPay"|"salary"|"cashEarnings"|"tax"|"ni"|"employeePension"|"employerPension">)=>records.reduce((total,p)=>total+p[field],0);return {...month,records,netPay:sum("netPay"),salary:sum("salary"),cashEarnings:sum("cashEarnings"),tax:sum("tax"),ni:sum("ni"),employeePension:sum("employeePension"),employerPension:sum("employerPension")}}).filter(month=>month.records.length);
  const latestActivePayrollMonth=activeEmployerPayrollMonths[0];
  const maxActivePay=Math.max(...activeEmployerPayrollMonths.map(month=>month.netPay),1);
  const renderPayslip=(p:PayslipRecord)=><button key={p.id} onClick={()=>{setSelectedPayslipId(p.id);setDetailKey("payslip")}}><div className="payslip-month"><b>{new Date(p.payDate+"T12:00:00").toLocaleDateString(locale,{month:"short"})}</b><span>{new Date(p.payDate+"T12:00:00").getFullYear()}</span></div><span><strong>{p.employer??p.fileName}</strong><small>{p.employer?`${p.fileName} · `:""}{props.ukTaxEnabled?`Tax code ${p.taxCode} · `:""}Salary {gbpExact.format(p.salary)}</small></span><span><small>Tax + NI</small><strong>{gbpExact.format(p.tax+p.ni)}</strong></span><span><small>Net pay</small><strong>{gbpExact.format(p.netPay)}</strong></span><i>›</i></button>;
  return <>
      {tab==="Settings"&&<section className="hub-page">
<article className="hub-hero panel"><div><span className="insight-label">DATA & SETTINGS</span><h2>Keep the numbers trustworthy.</h2><p>Imports, balances, payroll and recurring payments are operational tools. They support the story without competing with it.</p></div><div><span>Data readiness</span><strong>{outstandingChecks||"Ready"}</strong><small>{outstandingChecks?`${outstandingChecks} update${outstandingChecks===1?"":"s"} needed`:"All checks current"}</small></div></article>
<div className="hub-grid">
<button className="hub-card" onClick={()=>setTab("Update")}><span>DATA & BACKUP</span><h3>Import and reconcile</h3><strong>{regional.formatNumber(store.transactions.length)}</strong><p>Transactions stored locally, with duplicate checks, previews, backups and snapshots.</p><b>Open data hub →</b></button>
<button className="hub-card" onClick={()=>setTab("Accounts")}><span>ACCOUNTS</span><h3>Update balances</h3><strong>{gbp.format(totals.net)}</strong><p>Current net worth across property, pensions, cash, investments and debt.</p><b>Open accounts →</b></button>
<button className="hub-card" onClick={()=>setTab("Income")}><span>PAYROLL & PENSION</span><h3>{activeEmployerLabel} employment</h3><strong>{(activeEmployeePensionRate*100).toFixed(0)}% + {(activeEmployerPensionRate*100).toFixed(0)}%</strong><p>Track take-home pay, {props.ukTaxEnabled?"PAYE and ":""}workplace pension contributions. Earlier employment remains available as history.</p><b>Open payroll →</b></button>
<button className="hub-card" onClick={()=>setTab("Direct Debits")}><span>DIRECT DEBITS</span><h3>Manage fixed payments</h3><strong>{activeDirectDebits.length}</strong><p>{gbp.format(monthlyDirectDebitTotal)} monthly equivalent across active recurring commitments.</p><b>Open direct debits →</b></button>
<button className="hub-card" onClick={props.onOpenSetup}><span>SETUP GUIDE</span><h3>{store.onboarding?.status==="completed"?"Review your setup":"Continue setup"}</h3><p>Revisit accounts, imports, income, commitments, categories and goals without resetting your data.</p><b>Open guide →</b></button>
</div>
<article className="panel"><span className="insight-label">OPTIONAL FEATURES</span><h3>UK Tax</h3><p>PAYE, payslips, P45/P60 and UK tax-year evidence. Turning this off hides Tax without deleting saved evidence.</p><label><input type="checkbox" checked={props.ukTaxEnabled} onChange={event=>props.onToggleUkTax(event.target.checked)}/> Enable UK Tax</label></article>
<RegionalSettings store={store} setStore={setStore}/>
<CategorySettings store={store} setStore={setStore}/>
</section>}


      {tab==="Direct Debits"&&<section className="dd-dashboard">
        <article className="panel dd-hero">
<div>
<span className="insight-label">REGULAR COMMITMENTS</span>
<h2>{gbp.format(monthlyDirectDebitTotal)} monthly equivalent</h2>
<p>Monthly, quarterly and annual collections are normalised into a comparable monthly budget. Retiring an item changes future plans only—historical payments remain untouched.</p>
</div>
<button className="ghost" onClick={()=>setTab("Update")}>Import newer Monzo data</button>
</article>
        <section className="dd-kpis">
<article>
<span>Active payments</span>
<strong>{activeDirectDebits.length}</strong>
<small>Included in forward planning</small>
</article>
<article>
<span>Annualised cost</span>
<strong>{gbp.format(annualDirectDebitTotal)}</strong>
<small>Uses each payment&apos;s frequency</small>
</article>
<article>
<span>Largest monthly equivalent</span>
<strong>{gbp.format(activeDirectDebits[0]?.monthlyEquivalent??0)}</strong>
<small>{activeDirectDebits[0]?.label??"No payments found"}</small>
</article>
<article>
<span>Retired or inactive</span>
<strong>{directDebitRows.length-activeDirectDebits.length}</strong>
<small>Excluded from future commitments</small>
</article>
</section>
        <div className="dd-source-note">
<b>How this is identified</b>
<span>Your historical app data did not retain Monzo&apos;s payment-type field, so older items are recognised from repeat payment patterns. New Monzo CSV imports now preserve “Direct Debit” when supplied.</span>
</div>
        {rentalMortgageCommitment&&<div className="dd-check-note">
<span>
<b>{store.profile?.propertyConfig?.rentalCategory??"Rental"} mortgage check</b>
<small>The latest matching rental-mortgage payment in your loaded data is shown here.</small>
</span>
<strong>{regional.formatDate(rentalMortgageCommitment.lastDate,{day:"numeric",month:"long",year:"numeric"})}</strong>
<span>
<b>{gbpExact.format(rentalMortgageCommitment.lastAmount)}</b>
<small>Counted in {cycleLabel(payCycleKey(rentalMortgageCommitment.lastDate,payday,salaryDates),payday,salaryDates)}</small>
</span>
<button className="text-button" onClick={()=>setTab("Update")}>Import newer Monzo data →</button>
</div>}
        <section className="two-col dd-overview">
<article className="panel">
<div className="panel-head">
<div>
<h3>Six-cycle payment history</h3>
<p>Actual payments remain here even after a Direct Debit is retired</p>
</div>
</div>
<div className="dd-history">{directDebitHistory.map(item=>
<div key={item.key}>
<span>{gbp.format(item.total)}</span>
<i style={{height:`${Math.max(8,item.total/maxDirectDebitHistory*145)}px`}}/>
<small>{cycleLabel(item.key,payday,salaryDates).split(" – ")[0]}</small>
</div>)}</div>
</article>
<article className="panel dd-explainer">
<span className="insight-label">NUMBER CHECK</span>
<h3>Collections and monthly budget are different.</h3>
<p>The forward monthly equivalent is <b>{gbp.format(monthlyDirectDebitTotal)}</b>. A quarterly payment contributes one third of its usual collection to this number, while the history chart shows the full amount when it actually left your account.</p>
<button className="text-button" onClick={()=>setTab("Budget")}>Open the audited budget →</button>
</article>
</section>
        <article className="panel dd-list-panel">
<div className="panel-head">
<div>
<h3>Direct Debit register</h3>
<p>Set the collection frequency or retire a payment. Category changes use the same one-off, going-forward or full-history choice as Spending.</p>
</div>
<div className="dd-list-actions">
<span className="safe-badge">{activeDirectDebits.length} active</span>{archivedDirectDebitCount>0&&<button className="text-button" onClick={()=>setShowArchivedDirectDebits(value=>!value)}>{showArchivedDirectDebits?"Hide":`Show ${archivedDirectDebitCount}`} retired</button>}</div>
</div>
<div className="dd-list-head">
<span>Status</span>
<span>Payee</span>
<span>Category</span>
<span>Frequency</span>
<span>Collection</span>
<span>Monthly equivalent</span>
<span>Last collected</span>
<span>Action</span>
</div>
<div className="dd-list">{displayedDirectDebitRows.map(row=>
<div className={`${!row.active?"dd-row inactive":"dd-row"}${row.archived?" archived":""}`} key={row.key}>
<span className={`dd-status ${row.archived?"retired":row.active?"active":"inactive"}`}>{row.archived?"Retired":row.active?"Active":"Inactive"}</span>
<span>
<strong>{row.label}</strong>
<small>{row.source}</small>
</span>
<select aria-label={`Category for ${row.label}`} className="dd-category-select" value={row.category} onChange={event=>row.transactionId&&applyMerchantClassification(row.transactionId,event.target.value)}>{categories.filter(item=>["essential","lifestyle","property"].includes(categoryGroupFor(store.profile,item))).map(item=>
<option key={item}>{item}</option>)}</select>
<select aria-label={`Frequency for ${row.label}`} className="dd-frequency-select" value={row.frequency} onChange={event=>updateDirectDebitSetting(row.key,{frequency:event.target.value as DirectDebitFrequency})}>
<option value="weekly">Weekly</option>
<option value="monthly">Monthly</option>
<option value="quarterly">Quarterly</option>
<option value="annual">Annual</option>
<option value="irregular">Irregular</option>
</select>
<strong>{gbpExact.format(row.expected)}</strong>
<strong>{row.frequency==="irregular"?"—":gbpExact.format(row.monthlyEquivalent)}</strong>
<span className="dd-date">
<strong>{row.lastDate?new Date(row.lastDate+"T12:00:00").toLocaleDateString(locale,{day:"numeric",month:"short",year:"numeric"}):"—"}</strong>{row.lastDate&&<small>{cycleLabel(payCycleKey(row.lastDate,payday,salaryDates),payday,salaryDates)}</small>}</span>{row.archived?<button className="dd-restore" onClick={()=>updateDirectDebitSetting(row.key,{archived:false})}>Restore</button>:<button className="dd-retire" onClick={()=>archiveDirectDebit(row.key,row.label)}>Retire</button>}</div>)}</div>
</article>
      </section>}


      {tab==="Income"&&<section className="income-dashboard">
<article className="panel income-hero">
<div>
<span className="insight-label">{activeEmployerLabel.toUpperCase()} · ACTIVE EMPLOYMENT</span>
<h2>{latestActivePayrollMonth?gbpExact.format(latestActivePayrollMonth.netPay):"No active-employer payslip yet"}</h2>
<p>{latestActivePayrollMonth?`${new Date(latestActivePayrollMonth.key+"-01T12:00:00").toLocaleDateString(locale,{month:"long",year:"numeric"})} take-home pay · pension tracked separately`:"Upload a payslip to establish your baseline"}</p>
</div>
<button className="primary" onClick={()=>payslipRef.current?.click()}>＋ Upload payslip</button>
</article>
<article className="panel active-payroll-profile"><div><span className="insight-label">CURRENT PAYROLL PROFILE</span><h3>{activeEmployerAnnualSalary?`${gbp.format(activeEmployerAnnualSalary)} salary`:"Add a salary assumption"}</h3><p>Current planning assumption. The app will use imported payslips for actual take-home pay and tax.</p></div><div><span>Your pension</span><strong>{(activeEmployeePensionRate*100).toFixed(0)}%</strong><small>Salary contribution</small></div><div><span>Employer match</span><strong>{(activeEmployerPensionRate*100).toFixed(0)}%</strong><small>Paid on top</small></div><div><span>Provider</span><strong>{store.profile?.planning?.pensionProvider||"Not configured"}</strong><small>Workplace pension</small></div></article>
{latestActivePayrollMonth&&<section className="income-kpis">
<article>
<span>Gross earnings</span>
<strong>{gbpExact.format(latestActivePayrollMonth.cashEarnings)}</strong>
<small>{activeEmployerLabel} payroll only</small>
</article>
<article>
<span>{props.ukTaxEnabled?"PAYE tax":"Tax deducted"}</span>
<strong>{gbpExact.format(latestActivePayrollMonth.tax)}</strong>
<small>Latest active payroll month</small>
</article>
<article>
<span>National Insurance</span>
<strong>{gbpExact.format(latestActivePayrollMonth.ni)}</strong>
<small>Employee contribution</small>
</article>
<article>
<span>Pension funding</span>
<strong>{gbpExact.format(latestActivePayrollMonth.employeePension+latestActivePayrollMonth.employerPension)}</strong>
<small>{gbpExact.format(latestActivePayrollMonth.employerPension)} from {activeEmployerLabel}</small>
</article>
</section>}<section className="two-col income-main">
<article className="panel">
<div className="panel-head">
<div>
<h3>{activeEmployerLabel} net-pay history</h3>
<p>Active-employer payslips only; historical employers are shown separately.</p>
</div>
</div>
<div className="payslip-chart" role="img" aria-label={`Monthly ${activeEmployerLabel} net-pay history; exact payslips are listed below`}>{[...activeEmployerPayrollMonths].reverse().map(month=>
<div key={month.key} title={`${new Date(month.key+"-01T12:00:00").toLocaleDateString(locale,{month:"long",year:"numeric"})}: ${gbpExact.format(month.netPay)} from ${month.records.length} payslip${month.records.length===1?"":"s"}`}>
<span>{gbp.format(month.netPay)}</span>
<i style={{height:`${Math.max(month.netPay/maxActivePay*155,7)}px`}}/>
<b>{new Date(month.key+"-01T12:00:00").toLocaleDateString(locale,{month:"short"})}</b>
</div>)}</div>
</article>
<article className="panel payslip-upload-card">
<div className="upload-icon">↑</div>
<h3>Add the next payslip</h3>
<p>Upload the original employer PDF. Salary, tax, NI, pension and net pay are extracted locally.</p>
<button className="primary" onClick={()=>payslipRef.current?.click()}>Choose PDF</button>
<small>The file never leaves this browser.</small>
</article>
</section>
<article className="panel payslip-history">
<div className="panel-head">
<div>
<h3>{activeEmployerLabel} payslips</h3>
<p>Click a month to see tax, NI, take-home pay and pension funding</p>
</div>
<span className="safe-badge">{activeEmployerPayslips.length} active</span>
</div>
<div className="payslip-list">{activeEmployerPayslips.map(renderPayslip)}</div>
{historicalPayslips.length>0&&<details className="historical-payroll"><summary>Historical payroll ({historicalPayslips.length})</summary><p>Preserved for tax and historical reporting. These records do not define the active-employer baseline.</p><div className="payslip-list">{historicalPayslips.map(renderPayslip)}</div></details>}
</article>
</section>}


      {tab==="Accounts"&&<section className="panel full">
<div className="section-title">
<div>
<h2>Accounts & balances</h2>
<p>Update these once a month. Net worth recalculates instantly.</p>
</div>
<button className="ghost danger" onClick={resetWithBackup}>Back up & reset baseline</button>
</div>
<AccountBalances store={store} setStore={setStore} updateBalance={updateBalance}/>
</section>}

      {tab==="Update"&&<section className="data-hub">
        <div className="data-main">
          <article className="panel update-intro">
<span className="insight-label">MONTHLY DATA HUB</span>
<h2>Everything needed to keep the dashboard current.</h2>
<p>Import activity, refresh balances and save a snapshot. The app stores everything privately in this browser.</p>
</article>

          <article className="panel reconciliation-centre">
<div className="reconciliation-centre-head">
<div>
<span className="insight-label">RECONCILIATION CENTRE</span>
<h3>{outstandingChecks?`${outstandingChecks} update${outstandingChecks===1?"":"s"} needed`:"Everything is current"}</h3>
<p>One place to see whether the dashboard is complete enough to trust before reviewing a cycle.</p>
</div>
<div className={`reconciliation-score ${dataHealthReady===dataHealthChecks.length?"complete":""}`}><strong>{dataHealthReady}/{dataHealthChecks.length}</strong><span>{dataHealthReady===dataHealthChecks.length?"Ready":"Check data"}</span></div>
</div>
<div className="data-health-grid">{dataHealthChecks.map(check=><button className={`data-health-check ${check.status}`} key={check.key} onClick={()=>{
  if(check.key==="monzo")fileRef.current?.click();
  else if(check.key==="card")cardRef.current?.click();
  else if(check.key==="pay"){if(check.status==="good")setTab("Income");else payslipRef.current?.click()}
  else if(check.key==="review"){setCategory(categoryFor(store.profile,"Other")?.name??"Other");setSubcategoryFilter(categoryFor(store.profile,"Other")?.subcategories.find(item=>item.id==="category:other/subcategory:needs-review")?.name??"Needs review");setPeriod("Latest imported pay cycle");setTxView("Spending");setTab("Transactions")}
  else if(check.key==="balance"){setBudgetCycle("latest");setTab("Budget")}
  else if(check.key==="backup")exportData();
  else saveSnapshot();
}}><i aria-hidden="true">{check.status==="good"?"✓":check.status==="attention"?"!":"·"}</i><span><strong>{check.label}</strong><small>{check.value}</small></span><b>{check.key==="pay"&&check.status==="good"?"View payslips":check.action} →</b></button>)}</div>
<div className="reconciliation-meta"><span>Last Monzo file: <b>{latestMonzoImport?.fileName??"None"}</b></span><span>Last card file: <b>{latestCardImport?.fileName??"None"}</b></span></div>
</article>

          <article className="panel import-panel">
<div className="panel-head">
<div>
<h3>1. Import Monzo transactions</h3>
<p>Export a CSV from Monzo, then drop it below. Existing history is kept.</p>
</div>
<span className="safe-badge">Duplicate safe</span>
</div>
            <div className={dragging?"import-zone dragging":"import-zone"} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);const file=e.dataTransfer.files?.[0];if(file)importCsv(file)}}>
              <div className="upload-icon">↑</div>
<strong>Drop your Monzo CSV here</strong>
<span>or select it from your Mac</span>
<button className="primary" onClick={()=>fileRef.current?.click()}>Choose CSV file</button>
<small>Only new transactions are added. Matching date, merchant, amount and account records are skipped.</small>
            </div>
            <div className={monzoBalanceTracking.enabled?"monzo-balance-tracker tracking":"monzo-balance-tracker"}>
<div>
<span className="status-label">CURRENT-ACCOUNT TRACKING</span>
<strong>{monzoBalanceTracking.enabled?"Automatic updates on":"Needs a one-time anchor"}</strong>
<small>{monzoBalanceTracking.enabled&&monzoBalanceTracking.syncedThrough?`Synced through ${new Date(monzoBalanceTracking.syncedThrough+"T12:00:00").toLocaleDateString(locale,{day:"numeric",month:"short",year:"numeric"})}`:"Import the newest CSV, enter the exact balance, then start tracking."}</small>
</div>
<label>
<span>Monzo current account</span>
<div className="money-input">
<b>{symbol}</b>
<input aria-label="Monzo current account balance used for automatic tracking" type="number" min="0" step="0.01" value={totals.currentAccount} onChange={event=>updateBalance("monzo-current",Number(event.target.value))}/>
</div>
</label>
<button className={monzoBalanceTracking.enabled?"ghost":"primary"} onClick={monzoBalanceTracking.enabled?pauseMonzoBalanceTracking:anchorMonzoBalance}>{monzoBalanceTracking.enabled?"Pause tracking":"Use as starting balance"}</button>
<p>Pot money is never added to this figure. Transfers into pots reduce the current account; transfers back increase it. Those transfers remain excluded from spending.</p>
</div>
            <div className="import-history">
<div className="subhead">
<strong>Recent imports & reports</strong>
<span>{store.imports?.length??0} files processed</span>
</div>{(store.imports??[]).length===0?<div className="empty-state">No files imported yet. Your first CSV will replace the sample transactions.</div>:(store.imports??[]).slice(0,5).map(item=>
<div className="history-row" key={item.id}>
<div className={`file-mark ${item.source==="Barclaycard"?"card-file":""}`}>{item.source==="Barclaycard"?"CARD":"CSV"}</div>
<div>
<strong>{item.fileName}</strong>
<span>{item.source??"Monzo"} · {new Date(item.importedAt).toLocaleString(locale,{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}{item.from&&item.to?` · ${item.from} to ${item.to}`:""}</span>
</div>
<div>
<strong>+{item.added}</strong>
<span>{item.skipped} duplicates skipped · {item.rejected??0} rejected · {item.needsReview??0} initially needed categorisation</span>{Boolean(item.issues?.length)&&<details><summary>View import errors</summary><ul>{item.issues!.map((issue,index)=><li key={index}>{issue}</li>)}</ul></details>}
</div>
</div>)}</div>
          </article>

          <GenericCsvImport region={regional.region} accounts={store.profile?.accounts??[]} mappings={store.profile?.csvMappings??[]} onGeneric={props.importGenericCsv} onMonzo={importCsv} onBarclaycard={props.importBarclaycard} onCreateAccount={props.createImportAccount}/>

          <article className="panel card-import">
<div className="panel-head">
<div>
<h3>2. Import your Barclaycard statement</h3>
<p>Upload the latest statement as PDF or CSV. Purchases update spending; confirm the current balance below to update debt.</p>
</div>
<span className="safe-badge">No double counting</span>
</div>
<div className="card-upload">
<div>
<div className="card-symbol">B</div>
<span>
<strong>Barclaycard monthly statement</strong>
<small>PDF or CSV · duplicates skipped automatically</small>
</span>
</div>
<button className="primary" onClick={()=>cardRef.current?.click()}>Choose PDF or CSV</button>
</div>{store.cardStatement&&<>
<div className="card-debt-summary">
<div>
<span>Statement balance</span>
<strong>{gbpExact.format(store.cardStatement.balance)}</strong>
</div>
<div>
<span>Payment due</span>
<strong>{store.cardStatement.dueDate?new Date(store.cardStatement.dueDate+"T12:00:00").toLocaleDateString(locale,{day:"numeric",month:"short",year:"numeric"}):"Not extracted"}</strong>
</div>
<div>
<span>Minimum</span>
<strong>{gbpExact.format(store.cardStatement.minimumPayment)}</strong>
</div>
<div>
<span>Credit limit</span>
<strong>{gbp.format(store.cardStatement.creditLimit)}</strong>
</div>
</div>
<label className="card-balance-edit">
<span>Current card balance owed</span>
<div className="money-input">
<b>{symbol}</b>
<input aria-label="Current Barclaycard balance owed" type="number" min="0" step="0.01" value={totals.cardDebt} onChange={e=>updateBalance("barclaycard-debt",Number(e.target.value))}/>
</div>
<small>Update this after a payment or if the PDF cannot read the statement balance.</small>
</label>
</>}<p className="accounting-note">
<b>How this works:</b> purchases count once as spending. The Monzo repayment is a transfer, while the unpaid statement balance remains a liability until the next statement or a manual balance update.</p>
</article>

          <article className="panel payslip-import">
<div className="panel-head">
<div>
<h3>3. Upload your employer payslip</h3>
<p>Add the original monthly PDF to track income, deductions and pension funding.</p>
</div>
<span className="safe-badge">Stored locally</span>
</div>
<div className="card-upload">
<div>
<div className="card-symbol payslip-symbol">{symbol}</div>
<span>
<strong>Employer monthly payslip</strong>
<small>PDF · replaces an existing record for the same payday</small>
</span>
</div>
<div className="payslip-actions">
<button className="ghost" onClick={()=>setPayslipDraft(emptyPayslipDraft())}>Enter manually</button>
<button className="primary" onClick={()=>payslipRef.current?.click()}>Choose payslip</button>
</div>
</div>{payslipDraft&&<div className="manual-payslip">
<div className="manual-payslip-head">
<div>
<span className="insight-label">RELIABLE FALLBACK</span>
<h4>Enter the payslip totals</h4>
<p>Use current-period figures except in the explicitly labelled YTD fields. Saving replaces the same employer’s record on that pay date. Leave optional tax fields blank if they are not shown.</p>
</div>
<button className="text-button" onClick={()=>setPayslipDraft(null)}>Cancel</button>
</div>
<div className="manual-payslip-grid">
<label>Employer<input value={payslipDraft.employer??""} onChange={e=>setPayslipDraft(d=>d&&({...d,employer:e.target.value}))}/></label>
{props.ukTaxEnabled&&(["taxablePay","ytdTaxablePay","ytdTaxPaid"] as const).map((field,index)=><label key={field}>{[`Taxable pay — this period (${currency})`,`Taxable pay YTD — this employment (${currency})`,`PAYE tax YTD — this employment (${currency})`][index]}<input inputMode="decimal" value={payslipDraft[field]??""} onChange={e=>setPayslipDraft(d=>d&&({...d,[field]:e.target.value}))}/></label>)}
{props.ukTaxEnabled&&<label>Pension tax treatment<select value={payslipDraft.pensionTaxTreatment??"unknown"} onChange={e=>setPayslipDraft(d=>d&&({...d,pensionTaxTreatment:e.target.value as NonNullable<typeof d>["pensionTaxTreatment"]}))}><option value="unknown">Unknown — needs review</option><option value="salary-sacrifice">Salary sacrifice</option><option value="net-pay">Net pay</option><option value="relief-at-source">Relief at source</option></select></label>}
<label>Pay date<input type="date" value={payslipDraft.payDate} onChange={e=>setPayslipDraft(d=>d&&({...d,payDate:e.target.value}))}/>
</label>
<label>Gross salary ({currency})<input inputMode="decimal" placeholder="12102.50" value={payslipDraft.salary} onChange={e=>setPayslipDraft(d=>d&&({...d,salary:e.target.value}))}/>
</label>
<label>Total earnings ({currency})<input inputMode="decimal" placeholder="11497.37" value={payslipDraft.cashEarnings} onChange={e=>setPayslipDraft(d=>d&&({...d,cashEarnings:e.target.value}))}/>
</label>
<label>{props.ukTaxEnabled?`PAYE tax (${currency})`:`Tax deducted (${currency})`}<input inputMode="decimal" value={payslipDraft.tax} onChange={e=>setPayslipDraft(d=>d&&({...d,tax:e.target.value}))}/>
</label>
<label>National Insurance ({currency})<input inputMode="decimal" value={payslipDraft.ni} onChange={e=>setPayslipDraft(d=>d&&({...d,ni:e.target.value}))}/>
</label>
<label>Net pay ({currency})<input inputMode="decimal" value={payslipDraft.netPay} onChange={e=>setPayslipDraft(d=>d&&({...d,netPay:e.target.value}))}/>
</label>
<label>Employee pension ({currency})<input inputMode="decimal" value={payslipDraft.employeePension} onChange={e=>setPayslipDraft(d=>d&&({...d,employeePension:e.target.value}))}/>
</label>
<label>Employer pension ({currency})<input inputMode="decimal" value={payslipDraft.employerPension} onChange={e=>setPayslipDraft(d=>d&&({...d,employerPension:e.target.value}))}/>
</label>
<label>Annual leave payout ({currency})<input inputMode="decimal" value={payslipDraft.annualLeavePayout} onChange={e=>setPayslipDraft(d=>d&&({...d,annualLeavePayout:e.target.value}))}/>
</label>
{props.ukTaxEnabled&&<label>Tax code<input placeholder="e.g. 2461T" value={payslipDraft.taxCode} onChange={e=>setPayslipDraft(d=>d&&({...d,taxCode:e.target.value}))}/></label>}
</div>
<button className="primary manual-payslip-save" onClick={saveManualPayslip}>Save payslip</button>
</div>}</article>

          <article className="panel manual-panel">
<div className="panel-head">
<div>
<h3>4. Add something manually</h3>
<p>Useful for cash, corrections or accounts without an export.</p>
</div>
</div>
<div className="manual-form">
<label>Date<input type="date" value={manual.date} onChange={e=>setManual(m=>({...m,date:e.target.value}))}/>
</label>
<label className="wide-field">Description<input placeholder="e.g. Rental income" value={manual.merchant} onChange={e=>setManual(m=>({...m,merchant:e.target.value}))}/>
</label>
<label>Amount ({currency})<input type="number" step="0.01" placeholder="-45.00" value={manual.amount} onChange={e=>setManual(m=>({...m,amount:e.target.value}))}/>
<small>Income positive, costs negative</small>
</label>
<label>Category<select value={manual.category} onChange={e=>{const next=e.target.value;setManual(m=>({...m,category:next,subcategory:defaultSubcategories[next]??"Miscellaneous"}))}}>{categories.map(c=>
<option key={c}>{c}</option>)}</select>
</label>
<label>Subcategory<select value={manual.subcategory} onChange={e=>setManual(m=>({...m,subcategory:e.target.value}))}>{(availableSubcategories[manual.category]??[]).map(item=>
<option key={item}>{item}</option>)}</select>
</label>
<label>Account<input value={manual.account} onChange={e=>setManual(m=>({...m,account:e.target.value}))}/>
</label>
<button className="primary add-entry" onClick={addManualTransaction}>Add transaction</button>
</div>
</article>

          <article className="panel quick-balances">
<div className="panel-head">
<div>
<h3>5. Refresh the changing balances</h3>
<p>Cash, card debt and investments normally move most often. All other balances remain under Accounts.</p>
</div>
<button className="text-button" onClick={()=>setTab("Accounts")}>Update every account →</button>
</div>
<div className="quick-grid">{["savings","barclaycard-debt","t212","rl","hl"].map(id=>{const b=store.balances.find(x=>x.id===id);return b?<label key={b.id}>
<span>{b.name}</span>
<div className="money-input">
<b>{symbol}</b>
<input type="number" step="0.01" value={b.value} onChange={e=>updateBalance(b.id,Number(e.target.value))}/>
</div>
</label>:null})}</div>
</article>

          <article className="panel finish-panel">
<div>
<span className="insight-label">FINISH THE CHECK-IN</span>
<h3>Review, snapshot, back up.</h3>
<p>Do this once at month-end so the Overview charts show your progress.</p>
</div>
<div className="finish-actions">
<button className="ghost" onClick={()=>setTab("Transactions")}>Review “Other”</button>
<button className="ghost" onClick={saveSnapshot}>Save monthly snapshot</button>
<button className="primary" onClick={exportData}>Download backup</button>
</div>
</article>
        </div>
        <aside className="data-side">
<article className="panel update-summary">
<span className="status-label">CURRENT PICTURE</span>
<div>
<span>Net worth</span>
<strong>{gbp.format(totals.net)}</strong>
</div>
<div>
<span>Cash progress</span>
<strong>{cashProgress.toFixed(0)}%</strong>
</div>
<div>
<span>Transactions</span>
<strong>{regional.formatNumber(store.transactions.length)}</strong>
</div>
<div>
<span>Last updated</span>
<strong>{regional.formatDate(store.updatedAt,{day:"numeric",month:"short"})}</strong>
</div>
</article>
<article className="panel payday-card">
<span className="insight-label">YOUR SALARY CYCLE</span>
<h3>{activeEmployerLabel} payday is the {payday}th</h3>
<p>Pay cycles follow the configured payday and any dated employer rules. Earlier salary dates remain in historical reporting.</p>
<label>Nominal payday<input type="number" min="1" max="31" value={payday} onChange={e=>{const nextPayday=Math.min(31,Math.max(1,Number(e.target.value)||1));setStore(s=>({...s,payday:nextPayday,paydayRules:s.paydayRules?.length?s.paydayRules.map((rule,index,all)=>index===all.length-1?{...rule,payday:nextPayday}:rule):[],paydayScheduleVersion:1}))}}/>
</label>
</article>
<article className="panel monthly-routine">
<span className="insight-label">BEST ROUTINE</span>
<ol>
<li>
<b>1</b>
<span>Import the latest Monzo CSV after payday.</span>
</li>
<li>
<b>2</b>
<span>Upload the latest Barclaycard statement.</span>
</li>
<li>
<b>3</b>
<span>Review “Other” and refresh account balances.</span>
</li>
<li>
<b>4</b>
<span>Save one snapshot and download a backup.</span>
</li>
</ol>
<small>Usually takes less than 10 minutes.</small>
</article>
<article className={`panel automatic-backup-card state-${automaticBackup.status}`}>
<span className="insight-label">AUTOMATIC RECOVERY</span>
<h3>{automaticBackup.status==="ready"?"Versioned local backups are active":automaticBackup.status==="saving"?"Saving a local recovery point…":automaticBackup.status==="unsupported"?"Automatic folder backups are unavailable":"Protect the data between manual exports"}</h3>
{automaticBackup.status==="ready"&&<p>Every saved change creates a dated private JSON recovery point in <b>{automaticBackup.folder}</b>. The newest 20 are retained; nothing is sent to GitHub or a server.</p>}
{automaticBackup.status==="not-configured"&&<p>Choose a folder outside this project and outside Git. The app will write private recovery files there whenever your data changes.</p>}
{automaticBackup.status==="needs-permission"&&<p>The browser remembers your chosen folder, but needs permission to write to it again.</p>}
{automaticBackup.status==="unsupported"&&<p>This browser does not support a chosen local backup folder. Continue to download a portable JSON backup after each pay-cycle close.</p>}
{automaticBackup.status==="checking"&&<p>Checking whether a local recovery folder has already been connected…</p>}
{automaticBackup.status==="error"&&<p>{automaticBackup.error||"The recovery folder needs attention. You can choose it again without changing your financial data."}</p>}
{automaticBackup.savedAt&&<small className="automatic-backup-time">Last automatic recovery point: {new Date(automaticBackup.savedAt).toLocaleString(locale,{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</small>}
<div className="automatic-backup-actions">
{["not-configured","error"].includes(automaticBackup.status)&&<button className="primary" onClick={()=>void enableAutomaticBackups()}>Choose backup folder</button>}
{automaticBackup.status==="needs-permission"&&<button className="primary" onClick={()=>void reconnectAutomaticBackups()}>Reconnect folder</button>}
{automaticBackup.status==="ready"&&<><button className="primary" onClick={()=>void saveAutomaticBackupNow()}>Save recovery point now</button><button className="ghost" onClick={()=>void disableAutomaticBackups()}>Stop automatic backups</button></>}
</div>
</article>
<article className={`panel backup-card ${backupDue?"backup-due":"backup-current"}`}>
<span className="insight-label">LOCAL DATA ENGINE</span>
<h3>{persistenceMode==="indexeddb"?"IndexedDB is active":"Legacy browser storage is active"}</h3>
<p>{persistenceMode==="indexeddb"?"Transactions, balances and financial history are stored as structured local records. Nothing is sent to a server.":"The app is using its compatibility store. Your data remains local; export a backup before troubleshooting browser storage."}</p>
<small className="storage-location">This browser profile at <b>{storageOrigin||"this local address"}</b> holds this private record. A different browser, profile, <code>localhost</code>, or <code>127.0.0.1</code> has a separate store.</small>
{store.transactions.length===0&&<p className="storage-recovery-hint"><b>No transactions are in this local record yet.</b> This does not prove your data has gone: open the dashboard in the browser/address you used previously or restore your latest private backup below. Do not reset the app.</p>}
{hasMigrationBackup&&<button className="ghost" onClick={downloadPreviousFormat}>Download pre-IndexedDB recovery copy</button>}
<hr/>
<h3>Restore or move computers</h3>
<p>Your backup contains transactions, categories, goals, balances and trend history.</p>
<strong className="backup-status">{backupStatusLabel}</strong>
<button className="primary" onClick={exportData}>Export a backup</button>
<button className="ghost" onClick={()=>backupRef.current?.click()}>Restore a backup</button>
</article>
</aside>
      </section>}
  </>;
}
