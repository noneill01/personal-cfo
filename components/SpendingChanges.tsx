"use client";

import { useMemo, useState } from 'react';
import { analyzeSpending, type SpendingChange } from '../lib/spending-analysis';
import { regionalFormatters } from '../lib/region';
import type { Store } from '../lib/types';
import type { SalaryDateMap } from '../lib/pay-cycles';

export default function SpendingChanges({store,payday,salaryDates,currentKey,today,onInspect}:{store:Store;payday:number;salaryDates:SalaryDateMap;currentKey:string;today:string;onInspect:(item:SpendingChange)=>void}) {
  const [window,setWindow]=useState<3|6>(3);
  const result=useMemo(()=>analyzeSpending(store,payday,salaryDates,currentKey,today,window),[store,payday,salaryDates,currentKey,today,window]);
  const {moneyExact:money,formatDate}=regionalFormatters(store.profile);
  const dates=(periods:typeof result.window.recent)=>periods.map(p=>`${formatDate(p.start)} – ${formatDate(p.end)}`).join('; ');
  const analysis=result.controllable;
  const purchases=(change:typeof analysis.routineDiscretionary)=><p>{change.previousPurchases.purchaseCount} → {change.recentPurchases.purchaseCount} purchases · average purchase {money.format(change.previousPurchases.averagePurchase)} → {money.format(change.recentPurchases.averagePurchase)} · refunds {money.format(change.previousPurchases.refundTotal)} → {money.format(change.recentPurchases.refundTotal)}. Purchase counts are not visits.</p>;
  const item=(change:SpendingChange)=><button className="spending-change-item" key={change.key} onClick={()=>onInspect(change)}>
    <strong>{change.label}</strong>
    <span>{money.format(change.previousAverage)} → {money.format(change.recentAverage)} / pay period</span>
    <b>{change.difference===0?'—':change.difference<0?'↓':'↑'} {money.format(Math.abs(change.difference))}{change.percentage!==null?` · ${Math.abs(change.percentage)}%`:''}</b>
    <small>{change.strength==='consistent'?'Consistent across the recent periods':change.strength==='single-period'?'Single-period movement':'Emerging movement'} · {change.explanationType==='observed'?'Observed spending, not a claim of money saved':change.explanationType}</small>
    <small>{change.previousActivePeriods} previous / {change.recentActivePeriods} recent periods with records · View transactions →</small>
    <small>{change.previousPurchases.purchaseCount} → {change.recentPurchases.purchaseCount} purchases · average size {money.format(change.previousPurchases.averagePurchase)} → {money.format(change.recentPurchases.averagePurchase)}</small>
  </button>;
  const group=(title:string,changes:SpendingChange[])=>changes.length>0&&<section><h4>{title}</h4><div className="spending-change-grid">{changes.map(item)}</div></section>;
  return <article id="spending-changes" className="panel spending-changes" aria-label="Spending changes">
    <div className="panel-head"><div><h3>Spending changes</h3><p>Am I improving the spending I can control? All included accounts · completed periods, independent of the filters above.</p></div>
    <label>Comparison <select value={window} onChange={event=>setWindow(Number(event.target.value) as 3|6)}><option value={3}>3 versus 3 periods</option><option value={6} disabled={result.eligibleCount<12}>6 versus 6 periods</option></select></label></div>
    <p>{result.summary}</p>
    {result.size>0&&<>
      <details><summary>Evidence: {result.size} versus {result.size} completed periods{!result.window.contiguous?' · gaps in history':''}</summary><p>Previous: {dates(result.window.previous)}</p><p>Recent: {dates(result.window.recent)}</p><p>Live, incomplete and baseline-excluded periods are not compared. Property is separate from personal behavioural comparisons; the complete breakdown includes it. Reimbursable work follows existing accounting exclusions.</p>{result.window.excluded.map(p=><p key={p.key}>{p.key}: {p.reason}</p>)}</details>
      <div className="spending-change-grid">{item(analysis.routineDiscretionary)}{item(analysis.smallRepeatSpending)}</div>
      {purchases(analysis.routineDiscretionary)}
      <p>Small purchases: at most {money.format(analysis.smallRepeatSpending.threshold)} each · {analysis.smallRepeatSpending.previousPurchases.purchasesPerPeriod} → {analysis.smallRepeatSpending.recentPurchases.purchasesPerPeriod} purchases per period. Gross purchases, not net savings. Change the threshold in Settings → Categories.</p>
      {group('Everyday changes worth reviewing',analysis.strongestSignals)}
      {analysis.smallRepeatSpending.difference<0&&analysis.routineDiscretionary.difference>0&&<p>Small everyday purchases fell, but larger purchases or refunds offset that reduction in total everyday spending.</p>}
      {!analysis.strongestSignals.length&&<p>No material everyday-spending changes identified. Check unclassified spending before drawing conclusions.</p>}
      <details><summary>Essentials, irregular costs and the complete picture</summary>
        <p>These buckets reconcile to all genuine spending, including property. Work and transfers excluded by accounting rules are not personal spending. Changing an analysis preference does not remove a transaction from this total.</p>
        <div className="spending-change-grid">{item(analysis.total)}{analysis.totalsByNature.filter(change=>change.previousTransactionIds.length||change.recentTransactionIds.length).map(item)}</div>
        {group('Recurring costs — structural changes',result.structuralChanges)}
        {group('Marked one-offs — not a lifestyle trend',result.notableOneOffs)}
      </details>
      <details><summary>Category, subcategory and repeat-merchant detail</summary>
        {group('Everyday categories',analysis.categoryTrends)}
        {group('Everyday subcategories',analysis.subcategoryTrends)}
        {group('Everyday repeat merchants',analysis.merchantTrends)}
        <p>No travel context or reason for a purchase is inferred. Set category/subcategory preferences in Settings, or an individual analysis preference on a transaction.</p>
      </details>
    </>}
  </article>;
}
