"use client";

import { useState } from "react";
import type { ImportRecord, Tx } from "../lib/types";
import { buildCashRunway, type CashRunwayCommitment, type RunwayCashAccount } from "../lib/cash-runway";

export type PlanCashRunwayProps = {
  cycleLabel: (key: string) => string;
  cycleOptions: string[];
  cycleKey: string;
  bounds: { start: string; end: string };
  allTransactions: Tx[];
  personalTransactions: Tx[];
  spendingPlan: number;
  fixedCommitments: CashRunwayCommitment[];
  isLive: boolean;
  format: (value: number) => string;
  setCycle: (value: string) => void;
  openTransactions: () => void;
  cashAccounts: RunwayCashAccount[];
  imports: ImportRecord[];
};

function shortDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString("en-GB",{day:"numeric",month:"short"}); }

/** Focused view model boundary for the Plan cash-runway feature. */
export default function PlanCashRunway({
  cycleLabel,cycleOptions,cycleKey,bounds,allTransactions,personalTransactions,spendingPlan,fixedCommitments,isLive,format,setCycle,openTransactions,cashAccounts,imports,
}: PlanCashRunwayProps) {
  const [hoveredPoint,setHoveredPoint]=useState<number|null>(null);
  const [expanded,setExpanded]=useState(false);
  const runway=buildCashRunway({allTransactions,personalTransactions,start:bounds.start,end:bounds.end,cashAccounts,imports,spendingPlan,fixedCommitments,live:isLive});
  const canPlot=runway.hasAccountActivity&&runway.hasBalanceAnchor;
  const {points}=runway;
  const activeIndex=Math.min(hoveredPoint??Math.max(0,points.length-1),Math.max(0,points.length-1));
  const active=points[activeIndex];
  const maximum=Math.max(...points.flatMap(point=>[point.actual,point.onTrack]),1);
  const minimum=Math.min(0,...points.flatMap(point=>[point.actual,point.onTrack]));
  const width=800, height=300, left=62, right=24, top=28, bottom=48, plotWidth=width-left-right, plotHeight=height-top-bottom;
  const x=(index:number)=>left+(points.length<=1?0:index/(points.length-1)*plotWidth);
  const range=Math.max(1,maximum-minimum);
  const y=(value:number)=>top+plotHeight-((value-minimum)/range*plotHeight);
  const line=(key:"actual"|"onTrack")=>points.map((point,index)=>`${index===0?"M":"L"}${x(index).toFixed(1)},${y(point[key]).toFixed(1)}`).join(" ");
  const area=points.length?`${line("actual")} L ${x(points.length-1).toFixed(1)},${top+plotHeight} L ${x(0).toFixed(1)},${top+plotHeight} Z`:"";
  const runwayMargin=active?active.actual-active.onTrack:0;
  const onTrack=runwayMargin>=0;
  const status=!runway.hasBalanceAnchor?"Needs current balance":!runway.hasAccountActivity?"Needs account data":onTrack?"On track":"Needs attention";
  const statusDetail=!runway.hasBalanceAnchor?"Update each current-account balance in Settings":!runway.hasAccountActivity?"Import current-account transactions to begin":`${format(Math.abs(runwayMargin))} ${onTrack?"above":"below"} target`;
  return <article className="panel spend-pace-card">
    <button type="button" className="cash-runway-toggle" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>
      <span className="cash-runway-toggle-copy"><span className="insight-label">CASH RUNWAY</span><strong>Actual cash vs your plan</strong><small>See whether your current-account cash is holding up through this pay cycle.</small></span>
      <span className={`cash-runway-toggle-status ${onTrack?"ahead":"behind"}`}><b>{status}</b><small>{statusDetail} · {expanded?"Hide details ↑":"Show details ↓"}</small></span>
    </button>
    {expanded&&<div className="cash-runway-content">
      <div className="spend-pace-head">
        <div><h3>Actual cash vs budget target</h3><p><b>Blue</b> is your reconstructed current-account balance. <b>Green</b> places known fixed bills on their expected collection dates, then paces the remaining variable-spending allowance across the cycle.</p></div>
        <label><span>Cycle</span><select aria-label="Cycle shown in cash runway chart" value={cycleKey} onChange={event=>setCycle(event.target.value)}>{cycleOptions.slice(0,12).map(key=><option value={key} key={key}>{cycleLabel(key)}</option>)}</select></label>
      </div>
      {!canPlot?<div className="spend-pace-empty"><strong>{!runway.hasBalanceAnchor?"Current-account balance needed":"No current-account activity imported for this cycle yet."}</strong><span>{!runway.hasBalanceAnchor?"Enter a dated balance for each current account in Settings before plotting cash.":"Upload the latest account transactions to plot this cash-runway view."}</span></div>:<>
      <div className="spend-pace-metrics">
        <div><span>Cash at payday</span><strong>{format(runway.openingBalance)}</strong><small>Before this cycle&apos;s movements</small></div>
        <div><span>Actual cash</span><strong>{format(active?.actual??0)}</strong><small>Through {shortDate(active?.date??bounds.start)}</small></div>
        <div className={onTrack?"on-pace":"off-pace"}><span>{onTrack?"Above target":"Below target"}</span><strong>{format(Math.abs(runwayMargin))}</strong><small>Compared with the green target line</small></div>
      </div>
      <div className="spend-pace-chart-wrap">
        <svg className="spend-pace-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Actual current-account cash in blue and budget target cash in green for ${cycleLabel(cycleKey)}`} onPointerMove={event=>{const rect=event.currentTarget.getBoundingClientRect();const ratio=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width));setHoveredPoint(Math.round(ratio*Math.max(0,points.length-1)))}} onPointerLeave={()=>setHoveredPoint(null)}>
          <defs><linearGradient id="spend-pace-fill" x1="0" x2="0" y1="0" y2="1"><stop stopColor="var(--blue)" stopOpacity=".30"/><stop offset="1" stopColor="var(--blue)" stopOpacity=".02"/></linearGradient></defs>
          {[0,.25,.5,.75,1].map(ratio=>{const value=minimum+range*ratio;const position=y(value);return <g key={ratio}><line x1={left} x2={width-right} y1={position} y2={position} className="spend-pace-grid"/><text x={left-10} y={position+4} textAnchor="end" className="spend-pace-axis">{format(value)}</text></g>})}
          {[0,.25,.5,.75,1].map(ratio=>{const index=Math.round(Math.max(0,points.length-1)*ratio);return <g key={ratio}><line x1={x(index)} x2={x(index)} y1={top} y2={top+plotHeight} className="spend-pace-grid vertical"/><text x={x(index)} y={height-18} textAnchor={ratio===0?"start":ratio===1?"end":"middle"} className="spend-pace-axis">{shortDate(points[index]?.date??bounds.start)}</text></g>})}
          <path d={area} className="spend-pace-area"/><path d={line("onTrack")} className="spend-pace-plan-line"/><path d={line("actual")} className="spend-pace-actual-line"/>
          {active&&<g className="spend-pace-tooltip"><line x1={x(activeIndex)} x2={x(activeIndex)} y1={top} y2={top+plotHeight} className="spend-pace-crosshair"/><circle cx={x(activeIndex)} cy={y(active.actual)} r="5" className="spend-pace-point"/><rect x={Math.min(width-200,Math.max(left+8,x(activeIndex)+10))} y={top+8} width="178" height="74" rx="8"/><text x={Math.min(width-188,Math.max(left+20,x(activeIndex)+22))} y={top+30}>{shortDate(active.date)}</text><text x={Math.min(width-188,Math.max(left+20,x(activeIndex)+22))} y={top+49}>Actual {format(active.actual)}</text><text x={Math.min(width-188,Math.max(left+20,x(activeIndex)+22))} y={top+67}>Target {format(active.onTrack)}</text></g>}
        </svg>
      </div>
      <div className="spend-pace-footer"><span><i className="actual"/>Actual current cash</span><span><i className="planned"/>Budget target cash</span><small>{runway.savingsTopUps>0?`${format(runway.savingsTopUps)} moved in from savings this cycle · `:""}Data through {shortDate(runway.dataThrough)}</small><button className="text-button" onClick={openTransactions}>Inspect transactions →</button></div>
      <details className="spend-pace-data"><summary>View daily figures</summary><div><table><thead><tr><th>Date</th><th>Actual cash</th><th>Target cash</th><th>Expected bills</th><th>Savings top-up</th></tr></thead><tbody>{points.map(point=><tr key={point.date}><td>{shortDate(point.date)}</td><td>{format(point.actual)}</td><td>{format(point.onTrack)}</td><td>{point.expectedFixedSpend?format(point.expectedFixedSpend):"—"}</td><td>{point.savingsTopUp?format(point.savingsTopUp):"—"}</td></tr>)}</tbody></table></div></details>
      </>}
    </div>}
  </article>;
}
