"use client";
import {useEffect,useRef,useState,type Dispatch,type SetStateAction} from 'react';
import type {AccountKind,CsvImportMapping,PayslipDraft,PayslipRecord,Store,Tx} from '../lib/types';
import type {cycleCoverageStatus} from '../lib/coverage';
import type {ReviewTask} from './MonthlyReview';
import GenericCsvImport from './GenericCsvImport';
import AccountBalances from './AccountBalances';
import PayslipForm from './PayslipForm';
import {personalSpendingAmount} from '../lib/transactions';
import {regionalFormatters} from '../lib/region';
import {accountReviewAvailability} from '../lib/review-workflow';

type Props={
  task:ReviewTask;onClose:()=>void;store:Store;setStore:Dispatch<SetStateAction<Store>>;
  coverage:ReturnType<typeof cycleCoverageStatus>;cycleLabel:string;
  onConfirmCoverage:(accountId:string)=>void;onGeneric:(file:File,mapping:CsvImportMapping,save:boolean,applyBalance:boolean)=>Promise<void>;
  onMonzo:(file:File,accountId?:string)=>Promise<void>;onCard:(file:File,accountId?:string)=>Promise<void>;onCreateAccount:(name:string,kind:AccountKind)=>string;
  onPayslip:(file:File)=>Promise<void>;payslip?:PayslipRecord;onShowPayslip:(record:PayslipRecord)=>void;
  draft:PayslipDraft|null;setDraft:Dispatch<SetStateAction<PayslipDraft|null>>;onBlankPayslip:()=>void;onSavePayslip:()=>void;ukTaxEnabled:boolean;
  updateBalance:(id:string,value:number)=>void;transactions:Tx[];needsReview:(transaction:Tx)=>boolean;
  onClassify:(id:string,category:string)=>void;money:Intl.NumberFormat;
  plan:{name:string;amount:number;fixedCommitments:number}[];onUpdatePlan:(name:string,value:number)=>void;planningIncome:number;
};
const titles:Record<ReviewTask,string>={current:'Import and review current accounts',card:'Import and review credit cards',payslip:'Review this cycle’s payslip',balances:'Check dated account balances',categories:'Review unclear and unusual spending',plan:'Check your next-cycle plan'};

export default function ReviewWorkspace(props:Props){
  const {task,store,coverage,money}=props;
  const regional=regionalFormatters(store.profile);
  const [reviewDate,setReviewDate]=useState(()=>new Date().toISOString());
  useEffect(()=>{const timer=setInterval(()=>setReviewDate(new Date().toISOString()),60000);return ()=>clearInterval(timer)},[]);
  const reviewAvailability=accountReviewAvailability(coverage.bounds.end,reviewDate);
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{heading.current?.focus({preventScroll:true});heading.current?.scrollIntoView({block:'nearest'})},[task]);
  const [selectedAccount,setSelectedAccount]=useState('');
  const kind=task==='card'?'credit-card':'current';
  const accounts=store.profile?.accounts.filter(account=>account.kind===kind)??[];
  const accountId=accounts.some(account=>account.id===selectedAccount)?selectedAccount:accounts[0]?.id??'';
  const unresolved=props.transactions.filter(props.needsReview);
  const unusual=props.transactions.filter(row=>personalSpendingAmount(row)!==0&&['Planned one-off','Unplanned one-off'].includes(row.spendingTreatment??'')).sort((a,b)=>Math.abs(b.amount)-Math.abs(a.amount));
  const reviewRows=[...unresolved,...unusual.filter(row=>!unresolved.some(item=>item.id===row.id))];
  const planned=props.plan.reduce((sum,row)=>sum+row.amount,0);
  return <section className="panel review-task-panel" aria-label={titles[task]}>
    <header><div><span className="insight-label">REVIEW WORKSPACE</span><h3 ref={heading} tabIndex={-1}>{titles[task]}</h3><p>{props.cycleLabel} · finish this step here, then continue below.</p></div><button className="ghost" onClick={props.onClose}>Done with this step</button></header>
    {(task==='current'||task==='card')&&<>
      <div className="review-task-actions"><label>Destination account <select aria-label="Review import destination" value={accountId} onChange={event=>setSelectedAccount(event.target.value)}>{accounts.map(account=><option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      <label className="ghost">{task==='card'?'Choose Barclaycard PDF or CSV':'Choose Monzo CSV'}<input type="file" aria-label={task==='card'?'Review Barclaycard statement':'Review Monzo statement'} accept={task==='card'?'.pdf,.csv':'.csv'} disabled={!accountId} onChange={event=>{const file=event.target.files?.[0];if(file)void(task==='card'?props.onCard(file,accountId):props.onMonzo(file,accountId));event.target.value=''}}/></label></div>
      <p>Native Monzo and Barclaycard readers are optional UK adapters. For another provider, use the CSV mapper below.</p>
      <details><summary>Import another provider’s CSV</summary><GenericCsvImport key={task} region={store.profile?.region} accounts={accounts} mappings={store.profile?.csvMappings?.filter(mapping=>accounts.some(account=>account.id===mapping.accountId))??[]} onGeneric={props.onGeneric} onMonzo={props.onMonzo} onBarclaycard={props.onCard} onCreateAccount={props.onCreateAccount}/></details>
      <div className="review-task-status">{coverage.accounts.filter(account=>account.kind===kind).map(account=><article key={account.accountId}><strong>{account.name}</strong><p>{account.complete?'Full cycle covered':account.hasGap?'Separate imported periods leave an unreviewed interval':'Import the full interval, or review it in your banking app.'}</p>{!account.complete&&<><button className="ghost" disabled={!reviewAvailability.canConfirm} aria-describedby={!reviewAvailability.canConfirm?`review-wait-${account.accountId}`:undefined} onClick={()=>props.onConfirmCoverage(account.accountId)}>I checked all activity from {regional.formatDate(coverage.bounds.start)} to {regional.formatDate(coverage.bounds.end)}</button>{!reviewAvailability.canConfirm&&<p id={`review-wait-${account.accountId}`} role="status">This cycle has not ended yet. You can confirm the full period from {regional.formatDate(reviewAvailability.availableFrom)}. You can still import and check transactions now.</p>}</>}</article>)}</div>
    </>}
    {task==='balances'&&<AccountBalances store={store} setStore={props.setStore} updateBalance={props.updateBalance}/>}
    {task==='payslip'&&<>
      {props.payslip&&<p>Recorded: <button className="text-button" onClick={()=>props.onShowPayslip(props.payslip!)}>{props.payslip.employer??'Employer'} · {money.format(props.payslip.netPay)} net pay</button></p>}
      <div className="review-task-actions"><label className="ghost">Choose payslip PDF<input type="file" aria-label="Review payslip PDF" accept=".pdf,application/pdf" onChange={event=>{const file=event.target.files?.[0];if(file)void props.onPayslip(file);event.target.value=''}}/></label><button className="ghost" onClick={props.onBlankPayslip}>Enter figures manually</button></div>
      {props.draft&&<PayslipForm draft={props.draft} setDraft={props.setDraft} onSave={props.onSavePayslip} onCancel={()=>props.setDraft(null)} region={store.profile?.region} ukTaxEnabled={props.ukTaxEnabled}/>}
    </>}
    {task==='categories'&&<>
      <p>{unresolved.length} unclear item{unresolved.length===1?'':'s'} and {unusual.length} marked one-off item{unusual.length===1?'':'s'}. One-off spending is context, not automatically overspending.</p>
      {reviewRows.length?<div className="table-wrap"><table><caption>Items to check in this cycle</caption><thead><tr><th>Date</th><th>Merchant</th><th>Amount</th><th>Category</th><th>Context</th></tr></thead><tbody>{reviewRows.map(row=><tr key={row.id}><td>{regional.formatDate(row.date)}</td><td>{row.merchant}</td><td>{money.format(row.amount)}</td><td><select aria-label={`Review category for ${row.merchant}`} value={row.category} onChange={event=>props.onClassify(row.id,event.target.value)}>{store.profile?.categories?.filter(item=>item.enabled||item.name===row.category).map(item=><option key={item.id}>{item.name}</option>)}</select></td><td>{row.spendingTreatment??'Needs review'}</td></tr>)}</tbody></table></div>:<p role="status">No unclear or marked one-off items in this cycle.</p>}
    </>}
    {task==='plan'&&<>
      <p>Spending plan {money.format(planned)} against {money.format(props.planningIncome)} expected income. Saving and investment allocations remain in your full Plan.</p>
      <div className="table-wrap"><table><caption>Next-cycle spending allowances</caption><thead><tr><th>Category</th><th>Fixed minimum</th><th>Your plan</th></tr></thead><tbody>{props.plan.map(row=><tr key={row.name}><td>{row.name}</td><td>{money.format(row.fixedCommitments)}</td><td><input type="number" min={row.fixedCommitments} step="0.01" aria-label={`Review plan for ${row.name}`} value={row.amount} onChange={event=>{const value=event.target.valueAsNumber;if(Number.isFinite(value))props.onUpdatePlan(row.name,Math.max(row.fixedCommitments,value))}}/></td></tr>)}</tbody></table></div>
    </>}
  </section>;
}
