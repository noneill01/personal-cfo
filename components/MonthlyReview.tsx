"use client";

import SpendingSummary from "./SpendingSummary";
import type { MonthlyReviewProps } from "../lib/screen-props";
import type { CycleAnnotationKind } from "../lib/types";
import { categoryFor } from "../lib/categories";

export default function MonthlyReview(props: MonthlyReviewProps) {
  const { reviewChecks, reviewChanged, reviewPayslip, reviewCycleTransactions, backupStatusLabel, cardRef, closeReviewCycle, confirmCardCoverageThrough, coverage, currentCycleDataState, currentCycleKey, cycleHasFullCoverage, cycleLabel, dataHealthChecks, dataHealthReady, fileRef, formatCoverageDate, gbp, latestCardImport, latestMonzoImport, payday, payslipRef, priorReviewSummary, reconciliationAligned, reopenReviewCycle, reviewActionCopy, reviewActionTitle, reviewCloseout, reviewCloseoutNote, reviewComparisonLabel, reviewCycleAnnotation, reviewCycleComplete, reviewCycleCoverage, reviewCycleKey, reviewCycleOptions, reviewCycleSelection, reviewCycleSummary, reviewMonthlyNarrative, reviewNeedsReview, reviewPlannedOneOffs, reviewSaved, reviewSpendChange, reviewUnderlyingSpending, reviewUnplannedOneOffs, salaryDates, setBudgetCycle, setCategory, setCloseoutNotes, setPeriod, setReviewCycleSelection, setSubcategoryFilter, setTab, setTxView, store, tab, updateCycleAnnotation } = props;
  const outstandingChecks=reviewChecks.missing.length;
  const reviewCategory=categoryFor(store.profile,"Other")?.name??"Other";
  const reviewSubcategory=categoryFor(store.profile,"Other")?.subcategories.find(item=>item.id==="category:other/subcategory:needs-review")?.name??"Needs review";
  const canClose=reviewCycleComplete&&reviewChecks.ready;
  return <>
      {tab==="Monthly Review"&&<section className="monthly-review-page">
<article className="review-hero panel">
<div>
<span className="insight-label">MONTHLY REVIEW</span>
<h2>Import, check, understand, then close.</h2>
<p>This is the repeatable workflow that keeps every dashboard trustworthy. You are reviewing {cycleLabel(reviewCycleKey,payday,salaryDates)}.</p>
</div>
<div className={`review-readiness ${outstandingChecks===0?"complete":""}`}><strong>{outstandingChecks||"✓"}</strong><span>{outstandingChecks?`update${outstandingChecks===1?"":"s"} needed`:"ready"}</span></div>
</article>

<article className="panel review-cycle-context">
<button onClick={()=>{setPeriod(`cycle:${currentCycleKey}`);setTxView("All activity");setCategory("All categories");setSubcategoryFilter("All subcategories");setTab("Transactions")}}><span>CURRENT OPEN CYCLE</span><strong>{cycleLabel(currentCycleKey,payday,salaryDates)}</strong><small>{currentCycleDataState==="awaiting"?"Waiting for activity":currentCycleDataState==="partial"?"Live—spending is still arriving":"Coverage is current"}</small><b>View live activity →</b></button>
<label><span>REVIEWING COMPLETED OR HISTORICAL CYCLE</span><strong>{cycleLabel(reviewCycleKey,payday,salaryDates)}</strong><select aria-label="Monthly review cycle" value={reviewCycleSelection} onChange={event=>setReviewCycleSelection(event.target.value)}><option value="latest">Last completed cycle</option>{reviewCycleOptions.map((key:string)=><option key={key} value={key}>{cycleLabel(key,payday,salaryDates)}</option>)}</select><small>{reviewCloseout?"Closed record saved":"Available for review and closeout"}</small></label>
</article>

<article className={`panel cycle-annotation-editor kind-${reviewCycleAnnotation.kind.toLowerCase().replace(/\s+/g,"-")}`}>
<div><span className="insight-label">CYCLE CONTEXT</span><h3>{reviewCycleAnnotation.title||reviewCycleAnnotation.kind}</h3><p>{reviewCycleAnnotation.note||"Add context when this cycle should not be compared like an ordinary month."}</p></div>
<div className="cycle-annotation-controls">
<label><span>Cycle type</span><select aria-label="Monthly review cycle type" value={reviewCycleAnnotation.kind} onChange={event=>updateCycleAnnotation(reviewCycleKey,{kind:event.target.value as CycleAnnotationKind,title:event.target.value==="Normal"?"":""})}>{["Normal","Transition","Holiday","Home renovation","Bonus month","RSU vest","Large annual bill"].map(kind=><option key={kind}>{kind}</option>)}</select></label>
<label className="annotation-title"><span>Short explanation</span><input aria-label="Cycle annotation explanation" value={reviewCycleAnnotation.title||""} placeholder="What made this cycle different?" onChange={event=>updateCycleAnnotation(reviewCycleKey,{title:event.target.value})}/></label>
<label className="annotation-note"><span>Comparison note</span><input aria-label="Cycle annotation comparison note" value={reviewCycleAnnotation.note||""} placeholder="How should this affect comparisons?" onChange={event=>updateCycleAnnotation(reviewCycleKey,{note:event.target.value})}/></label>
<label className="baseline-toggle"><input type="checkbox" checked={Boolean(reviewCycleAnnotation.excludeFromBaseline)} onChange={event=>updateCycleAnnotation(reviewCycleKey,{excludeFromBaseline:event.target.checked})}/><span>Exclude this cycle from recurring averages</span></label>
</div>
{reviewCycleAnnotation.excludeFromBaseline&&<b className="baseline-exclusion-note">Visible in history · excluded from baseline</b>}
</article>

<div className="review-step-grid">
<button className="review-step" onClick={()=>setTab("Update")}><i className={reviewCycleCoverage.monzoComplete?"done":"attention"}>1</i><span><strong>Import current accounts</strong><small>{reviewCycleCoverage.monzoComplete?`Complete through ${formatCoverageDate(reviewCycleCoverage.bounds.end)}`:`Needed through ${formatCoverageDate(reviewCycleCoverage.bounds.end)}`}</small></span><b>Choose import →</b></button>
<button className="review-step" onClick={()=>setTab("Update")}><i className={reviewCycleCoverage.cardComplete?"done":"attention"}>2</i><span><strong>Review credit cards</strong><small>{!store.profile?.accounts.some(account=>account.kind==="credit-card"&&account.coverage!=="excluded")?"Not required":reviewCycleCoverage.cardComplete?`Reviewed through ${formatCoverageDate(reviewCycleCoverage.bounds.end)}`:`Needed through ${formatCoverageDate(reviewCycleCoverage.bounds.end)}`}</small></span><b>Choose import →</b></button>
<button className="review-step" onClick={()=>reviewPayslip?setTab("Income"):payslipRef.current?.click()}><i className={reviewPayslip?"done":"attention"}>3</i><span><strong>{reviewPayslip?"Payslip recorded":"Add cycle payslip"}</strong><small>{reviewPayslip?`${reviewPayslip.employer??"Employer"} · ${formatCoverageDate(reviewPayslip.payDate)}`:"Needed for this cycle"}</small></span><b>{reviewPayslip?"View payslips →":"Choose PDF →"}</b></button>
<button className="review-step" onClick={()=>{setCategory(reviewCategory);setSubcategoryFilter(reviewSubcategory);setPeriod(`cycle:${reviewCycleKey}`);setTxView("Spending");setTab("Transactions")}}><i className={reviewNeedsReview?"attention":"done"}>4</i><span><strong>Review categories</strong><small>{reviewNeedsReview?`${reviewNeedsReview} outgoing${reviewNeedsReview===1?"":"s"} need attention`:"All clear for this cycle"}</small></span><b>Open details →</b></button>
<button className="review-step" onClick={()=>{setBudgetCycle(reviewCycleKey);setTab("Budget")}}><i className={reconciliationAligned?"done":""}>5</i><span><strong>Reconcile & plan</strong><small>{reconciliationAligned?"Current account is aligned":"Check balance and fixed payments"}</small></span><b>Open plan →</b></button>
<button className="review-step" onClick={()=>document.getElementById("review-closeout")?.scrollIntoView({behavior:"smooth",block:"center"})}><i className={reviewCloseout?"done":canClose?"attention":""}>6</i><span><strong>Close & back up</strong><small>{reviewCloseout?"Closeout, snapshot and backup saved":canClose?"Ready for your sign-off":"Finish the checks first"}</small></span><b>{reviewCloseout?"View closeout":"Finish review"} →</b></button>
</div>

{outstandingChecks>0&&<div className="review-open-items" role="status"><strong>Still needed for this cycle</strong><ul>{reviewChecks.missing.map(item=><li key={item}>{item}</li>)}</ul></div>}
{reviewChanged&&<div className="review-open-items"><strong>This closed cycle has changed.</strong><p>Imports or corrections have changed its totals. Review the figures below and update the closeout to save the correction.</p></div>}
<article className="panel review-summary-card">
<div className="panel-head"><div><h3>Your monthly summary</h3><p>{cycleLabel(reviewCycleKey,payday,salaryDates)} · {cycleHasFullCoverage(reviewCycleKey)?"complete cycle":"best available data"}</p></div><button className="text-button" onClick={()=>{setPeriod(`cycle:${reviewCycleKey}`);setTxView("All activity");setCategory("All categories");setSubcategoryFilter("All subcategories");setTab("Transactions")}}>See every transaction →</button></div>
<div className="review-kpi-grid">
<div><span>Income</span><strong>{gbp.format(reviewCycleSummary.income)}</strong><small>Salary, rent and other income</small></div>
<div><span>Total spending</span><strong>{gbp.format(reviewCycleSummary.spend)}</strong><small>{priorReviewSummary?`${reviewSpendChange>=0?"+":"−"}${gbp.format(Math.abs(reviewSpendChange))} vs prior cycle`:"First comparable cycle"}</small></div>
<div><span>{reviewSaved<0?"Savings used":"Saved & invested"}</span><strong>{reviewSaved===0?"Not recorded":gbp.format(Math.abs(reviewSaved))}</strong><small>{reviewSaved<0?"Drawn back into cash":"Pay-yourself-first movements"}</small></div>
<div><span>Cash-flow result</span><strong className={reviewCycleSummary.income-reviewCycleSummary.spend>=0?"positive":"negative"}>{gbp.format(reviewCycleSummary.income-reviewCycleSummary.spend)}</strong><small>Before interpreting internal transfers</small></div>
</div>
<SpendingSummary transactions={reviewCycleTransactions}/>
<div className="review-narrative">
<div><span>WHAT CHANGED</span><strong>{reviewComparisonLabel}</strong><p>{reviewMonthlyNarrative}</p></div>
<div><span>NEXT ACTION</span><strong>{reviewActionTitle}</strong><p>{reviewActionCopy}</p></div>
</div>
</article>

<article className={`panel review-closeout-card ${reviewCloseout?"closed":canClose?"ready":"waiting"}`} id="review-closeout">
<div className="review-closeout-copy">
<span className="insight-label">FINAL STEP</span>
<h3>{reviewCloseout?"This cycle is closed.":canClose?"Ready to close this cycle.":"One final check remains."}</h3>
<p>{reviewCloseout?`Saved ${new Date(reviewCloseout.closedAt).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}. The saved closeout is retained. Figures above reflect the latest transactions; changes are highlighted for review.`:canClose?"Closing saves the cycle result, a dated net-worth snapshot and a downloadable safety backup. Your imported transactions remain available in full.":reviewCycleCoverage.monzoComplete&&reviewCycleCoverage.cardHistoryStarted&&!reviewCycleCoverage.cardComplete?"Your current-account activity is complete; confirm that you reviewed the latest credit-card activity through the cycle end.":"Resolve the outstanding checks listed above before closing the cycle."}</p>
<small className="closeout-backup-status">{backupStatusLabel}</small>
</div>
{reviewCycleCoverage.monzoComplete&&reviewCycleCoverage.cardHistoryStarted&&!reviewCycleCoverage.cardComplete?<button className="ghost" onClick={()=>confirmCardCoverageThrough(reviewCycleKey)}>Confirm card reviewed through {formatCoverageDate(reviewCycleCoverage.bounds.end)}</button>:canClose?<div className="review-closeout-action"><label><span>Optional note for this cycle</span><input aria-label="Monthly review closeout note" value={reviewCloseoutNote} onChange={event=>setCloseoutNotes(notes=>({...notes,[reviewCycleKey]:event.target.value}))} placeholder="What should you remember next cycle?"/></label><button className="primary" onClick={closeReviewCycle}>{reviewCloseout?"Update closeout & download backup":"Close cycle & download backup"}</button>{reviewCloseout&&<button className="ghost" onClick={reopenReviewCycle}>Reopen this cycle</button>}</div>:<button className="ghost" onClick={()=>reviewNeedsReview?setTab("Transactions"):setTab("Update")}>Resolve outstanding checks</button>}
</article>
</section>}

  </>;
}
