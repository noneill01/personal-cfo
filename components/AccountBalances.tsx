"use client";
import { useState, type Dispatch, type SetStateAction } from "react";
import type { Balance, Store } from "../lib/types";
import { createBalanceSnapshot } from "../lib/balances";
import { syncGoalsWithBalances } from "../lib/goals";
import BalanceHistory from "./BalanceHistory";

export default function AccountBalances({store,setStore,updateBalance}: {store:Store;setStore:Dispatch<SetStateAction<Store>>;updateBalance:(id:string,value:number)=>void}) {
  const [name,setName]=useState("");
  const [type,setType]=useState("Cash ISA");
  const [historyOpen,setHistoryOpen]=useState(false);
  const types=["Current account","Cash","Cash ISA","Stocks & Shares ISA","Pension","Property","VCT","Credit card","Mortgage","Loan"];
  const money=new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP",minimumFractionDigits:0,maximumFractionDigits:0});
  const assets=store.balances.filter(balance=>balance.group==="asset");
  const liabilities=store.balances.filter(balance=>balance.group==="liability");
  const assetTotal=assets.reduce((sum,balance)=>sum+balance.value,0);
  const debtTotal=liabilities.reduce((sum,balance)=>sum+balance.value,0);
  const netWorth=assetTotal-debtTotal;
  const accessibleCash=assets.filter(balance=>["Current account","Cash","Cash ISA"].includes(balance.type)).reduce((sum,balance)=>sum+balance.value,0);
  const sections=[
    {key:"cash",title:"Cash & accessible savings",description:"Money available without selling investments",tone:"cash",items:assets.filter(balance=>["Current account","Cash","Cash ISA"].includes(balance.type))},
    {key:"investments",title:"Pensions & investments",description:"Long-term and invested wealth",tone:"investments",items:assets.filter(balance=>["Stocks & Shares ISA","ISA","Pension","VCT"].includes(balance.type))},
    {key:"property",title:"Property",description:"Current property valuations",tone:"property",items:assets.filter(balance=>balance.type==="Property")},
    {key:"debt",title:"Mortgages & other debt",description:"Outstanding balances you owe",tone:"debt",items:liabilities},
  ].filter(section=>section.items.length);
  function change(transform:(balances:Balance[])=>Balance[]) {
    setStore(s=>{const balances=transform(s.balances);const date=new Date().toISOString().slice(0,10);const snapshot=createBalanceSnapshot(balances,date);
      return {...s,balances,goals:syncGoalsWithBalances(s.goals,balances),snapshots:[...(s.snapshots??[]).filter(p=>p.date!==date),snapshot].sort((a,b)=>a.date.localeCompare(b.date)),updatedAt:date};});
  }
  return <>
    <div className="accounts-summary" aria-label="Balance summary">
      <div className="net"><span>Net worth</span><strong>{money.format(netWorth)}</strong><small>Assets less everything owed</small></div>
      <div><span>Total wealth</span><strong>{money.format(assetTotal)}</strong><small>All property, pensions, cash and investments</small></div>
      <div><span>Total debt</span><strong>{money.format(debtTotal)}</strong><small>{liabilities.length} outstanding balances</small></div>
      <div><span>Accessible cash</span><strong>{money.format(accessibleCash)}</strong><small>Before credit-card debt</small></div>
    </div>
    <p className="account-guidance"><b>Update the balance directly in each row.</b> Account type and balance date are under Details. Changes also update Home, Goals and today&apos;s net-worth snapshot.</p>
    <button className="history-toggle" aria-expanded={historyOpen} onClick={()=>setHistoryOpen(value=>!value)}><span><b>View balance history</b><small>Track net worth growth and debt reduction over time</small></span><strong>{historyOpen?"Hide history":"Show history"} {historyOpen?"↑":"↓"}</strong></button>
    {historyOpen&&<BalanceHistory snapshots={store.snapshots??[]} format={money.format}/>} 
    <div className="balance-sections">{sections.map(section=>{
      const total=section.items.reduce((sum,balance)=>sum+balance.value,0);
      return <section className={`balance-section ${section.tone}`} key={section.key}>
        <header><div><h3>{section.title}</h3><p>{section.description}</p></div><strong>{money.format(total)}</strong></header>
        <div className="balance-list">{section.items.map(balance=><article className="balance-row" key={balance.id}>
          <i aria-hidden="true"/>
          <div className="balance-identity"><strong>{balance.name}</strong><span>{balance.type}{balance.asOf?` · ${new Date(balance.asOf+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}`:" · Date needed"}</span></div>
          <label className="balance-value"><span className="sr-only">{balance.group==="liability"?"Amount owed":"Balance"} for {balance.name}</span><b>£</b><input aria-label={`Balance for ${balance.name}`} type="number" step="0.01" min={balance.type==="Current account"?undefined:0} value={balance.value} onChange={event=>{const value=event.target.valueAsNumber;if(Number.isFinite(value))updateBalance(balance.id,value)}}/></label>
          <details className="balance-details"><summary>Details</summary><div>
            <label><span>Account type</span><select aria-label={`Account type for ${balance.name}`} value={balance.type} onChange={event=>{const next=event.target.value;change(items=>items.map(item=>item.id===balance.id?{...item,type:next}:item))}}>{types.filter(item=>["Credit card","Mortgage","Loan"].includes(item)===(balance.group==="liability")).map(item=><option key={item}>{item}</option>)}{!types.includes(balance.type)&&<option>{balance.type}</option>}</select></label>
            <label><span>Balance as of</span><input aria-label={`Balance date for ${balance.name}`} type="date" value={balance.asOf??""} onChange={event=>change(items=>items.map(item=>item.id===balance.id?{...item,asOf:event.target.value}:item))}/></label>
          </div></details>
        </article>)}</div>
      </section>})}</div>
    <details className="add-account-panel"><summary>＋ Add another account</summary>
      <form className="add-account" onSubmit={event=>{event.preventDefault();if(!name.trim())return;const next:Balance={id:`account-${crypto.randomUUID()}`,name:name.trim(),type,group:["Credit card","Mortgage","Loan"].includes(type)?"liability":"asset",value:0,asOf:new Date().toISOString().slice(0,10)};change(items=>[...items,next]);setName("");}}>
        <label><span>Account name</span><input value={name} onChange={event=>setName(event.target.value)} placeholder="e.g. Cash ISA" required/></label>
        <label><span>Type</span><select value={type} onChange={event=>setType(event.target.value)}>{types.map(item=><option key={item}>{item}</option>)}</select></label>
        <button className="primary" type="submit">Add account</button>
      </form>
    </details>
  </>;
}
