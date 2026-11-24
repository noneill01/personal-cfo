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
  const item=(change:SpendingChange)=><button className="spending-change-item" key={change.key} onClick={()=>onInspect(change)}>
    <strong>{change.label}</strong>
    <span>{money.format(change.previousAverage)} → {money.format(change.recentAverage)} / pay period</span>
    <b>{change.difference<0?'↓':'↑'} {money.format(Math.abs(change.difference))}{change.percentage!==null?` · ${Math.abs(change.percentage)}%`:''}</b>
    <small>{change.strength==='consistent'?'Consistent across the recent periods':change.strength==='single-period'?'Single-period movement':'Emerging movement'} · {change.explanationType==='observed'?'Observed spending, not a claim of money saved':change.explanationType}</small>
    <small>{change.previousActivePeriods} previous / {change.recentActivePeriods} recent periods with records · View transactions →</small>
  </button>;
  const group=(title:string,changes:SpendingChange[])=>changes.length>0&&<section><h4>{title}</h4><div className="spending-change-grid">{changes.map(item)}</div></section>;
  return <article className="panel spending-changes" aria-label="Spending changes">
    <div className="panel-head"><div><h3>Spending changes</h3><p>All included personal accounts · completed periods, independent of the filters above.</p></div>
    <label>Comparison <select value={window} onChange={event=>setWindow(Number(event.target.value) as 3|6)}><option value={3}>3 versus 3 periods</option><option value={6} disabled={result.eligibleCount<12}>6 versus 6 periods</option></select></label></div>
    <p>{result.summary}</p>
    {result.size>0&&<>
      <details><summary>Evidence: {result.size} versus {result.size} completed periods{!result.window.contiguous?' · gaps in history':''}</summary><p>Previous: {dates(result.window.previous)}</p><p>Recent: {dates(result.window.recent)}</p><p>Live, incomplete and baseline-excluded periods are not compared. Known property and reimbursable work activity are excluded.</p>{result.window.excluded.map(p=><p key={p.key}>{p.key}: {p.reason}</p>)}</details>
      <div className="spending-change-grid">{[result.overall,result.underlying].map(item)}</div>
      {group('Variable spending coming down',result.reductions)}
      {group('Variable spending moving up',result.increases)}
      {group('Recurring costs — structural changes',result.structuralChanges)}
      {group('Marked one-offs — not a lifestyle trend',result.notableOneOffs)}
      {result.merchantChanges.length>0&&<details><summary>Repeat merchant changes</summary><div className="spending-change-grid">{result.merchantChanges.map(item)}</div></details>}
      {!result.reductions.length&&!result.increases.length&&<p>No material variable-spending changes identified in this comparison.</p>}
    </>}
  </article>;
}
