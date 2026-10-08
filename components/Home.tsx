"use client";

import { savingsTotals } from "../lib/review";
import SpendingSummary from "./SpendingSummary";
import { comparableCash } from "../lib/balances";
import type { HomeScreenPropsWithHealthHistory } from "../lib/screen-props";

export default function Home(props: HomeScreenPropsWithHealthHistory) {
  const {review:reviewCategory,reviewSubcategory}=props.categoryLabels;
  const { overviewCycleTransactions, balancesAsOf, allocationGradient, assetMix, cashProgress, cfoAttentionItems, currentCycleDataState, currentCycleKey, cycleAnnotations, cycleBounds, cycleKeys, cycleLabel, gbp, healthHistoryDisplay, healthMovement, healthReadiness, healthScore, homeChangeSummary, kpis, latestCategorySpend, latestCycleKey, latestDataCycleKey, latestNeedsReview, latestOverPlan, latestRepeatedSmallSpend, liquidForEmergency, maxMonth, maxSnapshot, mixColours, monthly, monthlyFocus, netGrowth, overviewCategorySpend, overviewCycle, overviewCycleKey, overviewDataState, overviewExcludedMovements, overviewFlexibleSpend, overviewFlowReady, overviewIncome, overviewMaxCategory, overviewMustPay, overviewMustPayTransactions, overviewNeedsReview, overviewSavings, overviewSavingsBreakdown, overviewSavingsRate, overviewSpending, overviewSpendingTreatments, overviewUnderlyingSpending, overviewUnallocated, payday, planRows, salaryDates, setBudgetCycle, setCategory, setDetailKey, setOverviewCycle, setPeriod, setQuery, setSubcategoryFilter, setTab, setTxView, snapshots, tab, topFocusCategory, totals } = props;
  const currentAnnotation=cycleAnnotations[currentCycleKey];
  const movement=savingsTotals(overviewCycleTransactions);
  const savingsMovementLabel=overviewSavings<0?"Savings used":"Saved & invested";
  const savingsBreakdownLabel=overviewSavingsBreakdown.length
    ?overviewSavingsBreakdown.slice(0,2).map(([label,value]:[string,number])=>`${label} ${value>=0?"+":"−"}${gbp.format(Math.abs(value))}`).join(" · ")+(overviewSavingsBreakdown.length>2?` · +${overviewSavingsBreakdown.length-2} more`:"")
    :movement.count?"Deposits and withdrawals net to zero":"No savings transfers recorded";
  const remainingCategorySpend=overviewCategorySpend.slice(5);
  const remainingCategoryTotal=remainingCategorySpend.reduce((sum:number,[,amount]:[string,number])=>sum+amount,0);
  const renderCategoryRow=([name,amount]:[string,number])=>{const pct=overviewSpending?amount/overviewSpending*100:0;return <button key={name} title={`${name}: ${gbp.format(amount)} (${pct.toFixed(1)}% of spending)`} onClick={()=>{setCategory(name);setSubcategoryFilter("All subcategories");setPeriod(`cycle:${overviewCycleKey}`);setTxView("Spending");setTab("Transactions")}}>
<span><b>{name}</b><small>{pct.toFixed(1)}% of spending</small></span>
<div className="money-map-bar" role="progressbar" aria-label={`${name}: ${gbp.format(amount)}, ${pct.toFixed(1)}% of spending`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}><i style={{width:`${Math.min(100,pct)}%`}}/></div>
<strong>{gbp.format(amount)}</strong>
</button>};
  const openAttention=(item:HomeScreenPropsWithHealthHistory["cfoAttentionItems"][number])=>{
    if(item.key==="data")setTab("Monthly Review");
    else if(item.key==="liquidity")setTab("Budget");
    else if(item.key==="review"){setQuery("");setCategory(reviewCategory);setSubcategoryFilter(reviewSubcategory);setPeriod(`cycle:${latestDataCycleKey}`);setTxView("Spending");setTab("Transactions")}
    else if(item.key==="travel"){setBudgetCycle("latest");setTab("Budget")}
    else setTab("Budget");
  };
  const primaryAction=cfoAttentionItems[0];
  const secondaryAction=cfoAttentionItems[1];
  return <>
      {tab==="Overview"&&<>
        <section className={`home-cycle-status state-${currentCycleDataState}`} aria-live="polite">
<div className="home-cycle-state" aria-hidden="true">{currentCycleDataState==="complete"?"✓":currentCycleDataState==="partial"?"◐":"…"}</div>
<div className="home-cycle-copy"><span className="insight-label">CURRENT PAY CYCLE</span><strong>{cycleLabel(currentCycleKey,payday,salaryDates)}</strong><small>{currentCycleDataState==="complete"?"Complete and ready to review":currentCycleDataState==="partial"?"Live — spending is still arriving":"Waiting for bank activity"}</small></div>
{currentAnnotation&&currentAnnotation.kind!=="Normal"&&<div className="home-cycle-annotation"><span>{currentAnnotation.kind}</span><strong>{currentAnnotation.title||currentAnnotation.kind}</strong>{currentAnnotation.excludeFromBaseline&&<small>Excluded from normal comparisons</small>}</div>}
<button className="home-health-chip" onClick={()=>setDetailKey("health")} aria-label={healthReadiness.ready?`View Financial Health Score details: ${healthScore} out of 100, ${healthMovement.direction}`:"View Financial Health Score setup requirements"}><span>Health</span><strong>{healthReadiness.ready?healthScore:"—"}</strong><small>{healthReadiness.ready?healthReadiness.confidence:healthReadiness.confidence}</small></button>
<button className="text-button" onClick={()=>setTab("Monthly Review")}>Review cycle →</button>
</section>

        <div className="home-cycle-picker"><label><span>Spending and saving cycle</span><select value={overviewCycle} onChange={e=>{setOverviewCycle(e.target.value);setBudgetCycle(e.target.value)}}><option value="latest">Current cycle · {cycleLabel(currentCycleKey,payday,salaryDates)}</option>{cycleKeys.filter(key=>key!==currentCycleKey).slice(0,12).map(key=><option key={key} value={key}>{cycleLabel(key,payday,salaryDates)}</option>)}</select></label><p>Balances show your latest account records. Spending and saving show the selected pay cycle.</p></div>
        <section className="home-kpi-grid" aria-label="Current financial summary">
<button className="home-kpi-card cash" onClick={()=>setDetailKey("accessible")}><span>Cash after card debt</span><strong>{gbp.format(totals.netLiquid)}</strong><small>Current accounts + cash savings + Cash ISAs − cards</small><i>{cashProgress.toFixed(0)}% of emergency goal · {balancesAsOf?`balances from ${new Date(balancesAsOf+"T12:00:00").toLocaleDateString("en-GB")}`:"Check individual account dates"}</i></button>
<button className={`home-kpi-card spending state-${overviewDataState}`} onClick={()=>{setQuery("");setCategory("All categories");setSubcategoryFilter("All subcategories");setPeriod(`cycle:${overviewCycleKey}`);setTxView("Spending");setTab("Transactions")}}><span>{overviewCycleKey===currentCycleKey?"Spending this cycle":"Selected-cycle spending"}</span><strong>{overviewFlowReady?gbp.format(overviewSpending):"Awaiting data"}</strong><small>{cycleLabel(overviewCycleKey,payday,salaryDates)}</small><i>{overviewFlowReady?`${gbp.format(overviewUnderlyingSpending)} underlying`:"Import activity to begin"}</i></button>
<button className={`home-kpi-card savings ${overviewSavings<0?"withdrawn":""}`} onClick={()=>setDetailKey("savings")}><span>{savingsMovementLabel}</span><strong>{overviewFlowReady?gbp.format(Math.abs(overviewSavings)):"Awaiting data"}</strong><small>{cycleLabel(overviewCycleKey,payday,salaryDates)}</small><small>{overviewFlowReady?savingsBreakdownLabel:"Waiting for activity"}</small>{overviewFlowReady&&overviewSavings!==0&&<i>{overviewSavings<0?"Drawn back into cash":`${overviewSavingsRate.toFixed(0)}% of income`}</i>}</button>
<button className="home-kpi-card wealth" onClick={()=>setDetailKey("growth")}><span>Net worth</span><strong>{gbp.format(totals.net)}</strong><small>{balancesAsOf?`Account values from ${new Date(balancesAsOf+"T12:00:00").toLocaleDateString("en-GB")} · `:"Account dates vary · "}{netGrowth>=0?"+":"−"}{gbp.format(Math.abs(netGrowth))} since first snapshot</small><i>{gbp.format(totals.pension)} in pensions</i></button>
</section>

        <section className={`panel home-decision-brief ${primaryAction?`tone-${primaryAction.tone}`:"tone-green"}`} aria-label="Monthly decision brief">
<div className="home-decision-change">
<span className="insight-label">WHAT CHANGED</span>
<strong>{homeChangeSummary}</strong>
<button className="text-button" onClick={()=>setTab("Monthly Review")}>Open monthly review →</button>
</div>
<div className="home-next-action">
<span className="insight-label">NEXT BEST ACTION</span>
{primaryAction?<><h2>{primaryAction.title}</h2><p>{primaryAction.copy}</p><div className="home-action-buttons"><button className="primary" onClick={()=>openAttention(primaryAction)}>{primaryAction.action} →</button>{secondaryAction&&<button className="text-button" onClick={()=>openAttention(secondaryAction)}>{secondaryAction.title} →</button>}</div></>:<><h2>Nothing urgent right now</h2><p>Your imported data has no urgent exceptions. Close the cycle from Monthly Review when it is complete.</p><button className="primary" onClick={()=>setTab("Monthly Review")}>Review and close cycle →</button></>}
</div>
</section>

        <details className="home-cycle-details">
<summary><span><b>See where this cycle&apos;s money went</b><small>{cycleLabel(overviewCycleKey,payday,salaryDates)} · detailed reconciliation and category breakdown</small></span><strong>{overviewFlowReady?gbp.format(overviewSpending):"Awaiting data"}</strong><i>Open details</i></summary>
        <section className="monthly-money-map home-money-map">
<div className="money-map-head">
<div>
<span className="insight-label">THIS CYCLE AT A GLANCE</span>
<h2>Follow every pound from payday.</h2>
<p>Internal transfers, pot movements and card repayments are excluded so income and spending are counted once.</p>
</div>
<label>
<span>Salary month</span>
<select aria-label="Monthly money map salary cycle" value={overviewCycle} onChange={event=>{setOverviewCycle(event.target.value);setBudgetCycle(event.target.value)}}>
<option value="latest">Current cycle</option>{cycleKeys.slice(0,12).map(key=><option key={key} value={key}>{cycleLabel(key,payday,salaryDates)}</option>)}
</select>
<small className={overviewDataState}>{overviewDataState==="complete"?"Complete data":overviewDataState==="partial"?"Live / partial data":"Awaiting bank activity"}</small>
</label>
</div>
<ol className={`home-money-flow state-${overviewDataState}`} aria-label="Pay-cycle cash reconciliation">
<li className="income"><span>Income</span><strong>{gbp.format(overviewIncome)}</strong><small>Salary, rent and genuine income</small></li>
<li aria-hidden="true" className="operator">−</li>
<li className="essential"><span>Essentials</span><strong>{overviewFlowReady?gbp.format(overviewMustPay):"Waiting"}</strong><small>{overviewMustPayTransactions.length} fixed payment{overviewMustPayTransactions.length===1?"":"s"}</small></li>
<li aria-hidden="true" className="operator">−</li>
<li className="flexible"><span>Flexible</span><strong>{overviewFlowReady?gbp.format(overviewFlexibleSpend):"Waiting"}</strong><small>Day-to-day and discretionary</small></li>
<li aria-hidden="true" className="operator">{overviewSavings<0?"+":"−"}</li>
<li className={`saving ${overviewSavings<0?"withdrawn":""}`}><span>{savingsMovementLabel}</span><strong>{overviewFlowReady?gbp.format(Math.abs(overviewSavings)):"Waiting"}</strong><small>{overviewSavings<0?"Returned to cash":"Pay yourself first"}</small></li>
<li aria-hidden="true" className="operator">=</li>
<li className={`result ${overviewFlowReady&&overviewUnallocated<0?"over":""}`}><span>Cycle result</span><strong>{overviewFlowReady?`${overviewUnallocated>=0?"+":"−"}${gbp.format(Math.abs(overviewUnallocated))}`:"Not ready"}</strong><small>Cash-flow result, not bank balance</small></li>
</ol>
{overviewFlowReady&&overviewSavings<0&&<p className="savings-funded-note"><strong>This cycle used savings.</strong><span>{gbp.format(Math.abs(overviewSavings))} was withdrawn net. Without that withdrawal, income was {gbp.format(Math.max(0,overviewSpending-overviewIncome))} below spending.</span></p>}
{overviewFlowReady&&<SpendingSummary transactions={overviewCycleTransactions}/>}
{overviewFlowReady&&<div className="home-underlying-note"><span>Total spending <b>{gbp.format(overviewSpending)}</b></span>{overviewSpendingTreatments["Planned one-off"]>0&&<span>Planned one-offs <b>{gbp.format(overviewSpendingTreatments["Planned one-off"])}</b></span>}<span>Normal spending excluding one-offs <b>{gbp.format(overviewUnderlyingSpending)}</b></span></div>}
{overviewCategorySpend.length?<div className="money-map-grid">
<div className="money-map-categories">
<div className="money-map-section-head"><div><h3>Where spending went</h3><p>All {overviewCategorySpend.length} categories reconcile to this cycle&apos;s total</p></div><strong>{gbp.format(overviewSpending)}</strong></div>
<div className="money-map-category-list">{overviewCategorySpend.slice(0,5).map(renderCategoryRow)}</div>
{remainingCategorySpend.length>0&&<details className="money-map-category-more"><summary><span><b>Remaining {remainingCategorySpend.length} categor{remainingCategorySpend.length===1?"y":"ies"}</b><small>Open to see the complete breakdown</small></span><strong>{gbp.format(remainingCategoryTotal)}</strong></summary><div className="money-map-category-list">{remainingCategorySpend.map(renderCategoryRow)}</div></details>}
<div className="home-map-actions"><button className="ghost" onClick={()=>setTab("Monthly Review")}>Open monthly review</button><button className="text-button" onClick={()=>{setQuery("");setCategory("All categories");setSubcategoryFilter("All subcategories");setPeriod(`cycle:${overviewCycleKey}`);setTxView("Spending");setTab("Transactions")}}>View all {overviewCategorySpend.length} categories →</button></div>
</div>
</div>:<div className="empty-state"><strong>No spending recorded in this salary cycle yet</strong><span>Import the latest Monzo or Barclaycard statement and this view will update automatically.</span></div>}
<div className="money-map-foot">
<span><b>{overviewExcludedMovements}</b> internal or savings movement{overviewExcludedMovements===1?"":"s"} excluded from spending</span>
<span className={overviewNeedsReview?"needs-review":""}><b>{overviewNeedsReview}</b> outgoing{overviewNeedsReview===1?"":"s"} still need{overviewNeedsReview===1?"s":""} review</span>
</div>
</section>
        </details>
        <details className="overview-more">
<summary><span><b>Supporting financial detail</b><small>Automated saving and the full scorecard</small></span><i>Open details</i></summary>
<div className="overview-more-content">
        <section className="panel executive-scorecard">
<div className="panel-head">
<div>
<h3>Executive scorecard</h3>
<p>A board-level view of the five numbers that matter most</p>
</div>
<div className="score-summary">
<i className={!healthReadiness.ready?"amber":healthScore>=80?"green":healthScore>=65?"amber":"orange"}/>
<span>Financial health · {healthReadiness.ready?healthMovement.direction:healthReadiness.confidence}</span>
<strong>{healthReadiness.ready?`${healthScore}/100`:"—"}</strong>
</div>
</div>
<div className="kpi-grid">{kpis.map(k=>
<article key={k.name}>
<i className={k.status}/>
<div>
<span>{k.name}</span>
<strong>{k.value}</strong>
<small>{k.target}</small>
</div>
</article>)}</div>
<div className="status-legend">
<span>
<i className="green"/>On track</span>
<span>
<i className="amber"/>Watch closely</span>
<span>
<i className="orange"/>Needs attention</span>
</div>
</section>
        <section className="panel health-history-panel">
<div className="panel-head">
<div>
<h3>Financial Health Score history</h3>
<p>V3 starts this month. Earlier scores remain visible as historical context, but are not directly comparable.</p>
</div>
<div className="health-current"><span>Data confidence</span><strong>{healthReadiness.confidence}</strong></div>
</div>
{!healthReadiness.ready?<div className="empty-state"><strong>Financial Health Score is waiting for complete data.</strong><span>{healthReadiness.message}</span></div>:<><div className="health-history-chart" role="img" aria-label={`Financial Health Score history from ${healthHistoryDisplay[0]?.score??healthScore} to ${healthScore} out of 100`}>{healthHistoryDisplay.map((point,index)=>
<div className={`health-history-point version-${point.version}`} key={`${point.date}-${point.version}-${index}`} aria-label={`${new Date(point.date+"T12:00:00").toLocaleDateString("en-GB",{month:"long",year:"numeric"})}: ${point.score} out of 100, score version ${point.version}`} title={`${new Date(point.date+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}: ${point.score}/100 · v${point.version}${point.estimated?" (reconstructed from saved data)":""}`}>
<strong>{point.score}</strong>
<div>
<i className={point.score>=80?"green":point.score>=65?"amber":"orange"} style={{height:`${Math.max(8,point.score*1.35)}px`}}/>
</div>
<span>{new Date(point.date+"T12:00:00").toLocaleDateString("en-GB",{month:"short",year:"2-digit"})}</span>
<small>{point.live?"Live · v3":point.estimated?`Reconstructed · v${point.version}`:`Saved · v${point.version}`}</small>
</div>)}</div>
<details className="chart-data"><summary>View score data</summary><table><thead><tr><th>Date</th><th>Score</th><th>Version</th><th>Source</th></tr></thead><tbody>{healthHistoryDisplay.map((point,index)=><tr key={`${point.date}-${point.version}-${index}`}><td>{new Date(point.date+"T12:00:00").toLocaleDateString("en-GB")}</td><td>{point.score}/100</td><td>v{point.version}</td><td>{point.live?"Live":point.estimated?"Reconstructed":"Saved"}</td></tr>)}</tbody></table></details>
 </>}
<div className="health-history-note">
<i/>
<span>{healthReadiness.ready?"V1 included a base score. V2 and V3 earn every point, but V3 rebalances debt, emergency cash and cash-flow behaviour. New snapshots store V3 exactly.":"A score appears only once balances and one complete pay cycle are recorded, so missing information cannot look like a healthy zero-debt position."}</span>
<button className="text-button" onClick={()=>setTab("Update")}>Save this month →</button>
</div>
</section>
        </div>
        </details>
        <details className="home-explore">
<summary><span><b>Explore trends and supporting dashboards</b><small>Net worth, asset allocation, cash-flow history, goals and plan performance</small></span><i>Open analysis</i></summary>
<div className="home-explore-content">
        <section className="two-col visual-row">
          <article className="panel">
<div className="panel-head">
<div>
<h3>Net-worth direction</h3>
<p>Balances create one dated snapshot per month automatically</p>
</div>
<button className="text-button" onClick={()=>setTab("Update")}>Update now →</button>
</div>
{snapshots.length?<><div className="trend-chart" role="img" aria-label={`Net worth changed from ${gbp.format(snapshots[0].netWorth)} to ${gbp.format(snapshots.at(-1)?.netWorth??totals.net)}`}>{snapshots.map((s,i)=>
<div className="trend-point" key={s.date} title={`${new Date(s.date+"T12:00:00").toLocaleDateString("en-GB")}: ${gbp.format(s.netWorth)}`}>
<div className="trend-value">{i===snapshots.length-1?gbp.format(s.netWorth):""}</div>
<i style={{height:`${Math.max(s.netWorth/maxSnapshot*150,8)}px`}}/>
<span>{new Date(s.date+"T12:00:00").toLocaleDateString("en-GB",{month:"short"})}</span>
</div>)}</div><details className="chart-data"><summary>View net-worth data</summary><p>Older cash records are preserved with their original definitions. Cash comparisons start from records with a consistent basis.</p><table><thead><tr><th>Date</th><th>Net worth</th><th>Cash after cards</th><th>Investment ISA</th><th>Pension</th><th>Debt</th></tr></thead><tbody>{snapshots.map(snapshot=><tr key={snapshot.date}><td>{new Date(snapshot.date+"T12:00:00").toLocaleDateString("en-GB")}</td><td>{gbp.format(snapshot.netWorth)}</td><td>{comparableCash(snapshot)===undefined?"Legacy basis — not comparable":gbp.format(snapshot.cash)}</td><td>{snapshot.isa===undefined?"Not recorded":gbp.format(snapshot.isa)}</td><td>{gbp.format(snapshot.pension)}</td><td>{gbp.format(snapshot.debt)}</td></tr>)}</tbody></table></details></>:<div className="empty-state"><strong>No net-worth history yet</strong><span>Update an account balance to create this month&apos;s first snapshot.</span></div>}
</article>
          <article className="panel">
<div className="panel-head">
<div>
<h3>Asset allocation</h3>
<p>What your wealth is currently doing</p>
</div>
</div>
<div className="allocation">
<div className="allocation-ring" style={{background:allocationGradient}}>
<i>
<strong>{gbp.format(totals.assets)}</strong>
<span>Total assets</span>
</i>
</div>
<div className="allocation-key">{assetMix.map((a,i)=>
<div key={a.name}>
<i style={{background:mixColours[i]}}/>
<span>{a.name}</span>
<strong>{a.pct.toFixed(1)}%</strong>
<small>{gbp.format(a.value)}</small>
</div>)}</div>
</div>
</article>
        </section>
        <section className="two-col">
          <article className="panel">
<div className="panel-head">
<div>
<h3>Salary paid versus spending</h3>
<p>Salary uses the payroll month; spending follows the corresponding 28th–27th pay cycle.</p>
</div>
<span className="legend">
<i className="income-dot"/>Salary paid <i className="spend-dot"/>Spending</span>
</div>
            <div className="bar-chart" role="img" aria-label="Salary paid and spending comparison">{monthly.map(([m,v])=>{const bounds=cycleBounds(m,payday,salaryDates);const startLabel=new Date(bounds.start+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"});const endLabel=new Date(bounds.end+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"});const live=m===currentCycleKey;const complete=props.cycleHasFullCoverage(m);return <div className={live?"month live-cycle":"month"} key={m} title={`${m}: salary paid ${gbp.format(v.salaryIncome)}, spending ${gbp.format(v.spend)} · ${live?"cycle in progress":complete?"complete coverage":"partial history"}`}>
<div className="bars">
<i className="income-bar" style={{height:`${Math.max(v.salaryIncome/maxMonth*180,3)}px`}}/>
<i className="spend-bar" style={{height:`${Math.max(v.spend/maxMonth*180,3)}px`}}/>
</div>
<span>{startLabel}</span>
<small>{live?"Live":complete?`to ${endLabel}`:"Partial history"}</small>
</div>})}</div><details className="chart-data"><summary>View salary and spending data</summary><table><thead><tr><th>Payroll month</th><th>Salary paid</th><th>Spending in pay cycle</th><th>Difference</th><th>Coverage</th></tr></thead><tbody>{monthly.map(([key,value])=><tr key={key}><td>{key}</td><td>{gbp.format(value.salaryIncome)}</td><td>{gbp.format(value.spend)}</td><td>{gbp.format(value.salaryIncome-value.spend)}</td><td>{key===currentCycleKey?"Live":props.cycleHasFullCoverage(key)?"Complete":"Partial"}</td></tr>)}</tbody></table></details>
          </article>
          <article className="panel">
<div className="panel-head">
<div>
<h3>Goals at a glance</h3>
<p>Where future freedom is building</p>
</div>
<button className="text-button" onClick={()=>setTab("Goals")}>View all →</button>
</div>
            <div className="goal-list">{props.goals.map(g=>{const pct=g.target>0?Math.min(g.current/g.target*100,100):0;return <div className="goal-row" key={g.id}>
<div>
<strong>{g.name}</strong>
<span>{gbp.format(g.current)} of {gbp.format(g.target)}</span>
</div>
<div className="progress" role="progressbar" aria-label={`${g.name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
<i style={{width:`${pct}%`,background:g.colour}}/>
</div>
<b>{pct.toFixed(0)}%</b>
</div>})}</div>
          </article>
        </section>
        <section className="two-col wide-left">
          <article className="panel">
<div className="panel-head">
<div>
<h3>Plan versus actual</h3>
<p>{cycleLabel(latestCycleKey,payday,salaryDates)} · every major category</p>
</div>
<button className="text-button" onClick={()=>{setBudgetCycle("latest");setTab("Budget")}}>Edit plan →</button>
</div>
            <div className="overview-plan-bars">{planRows.filter(item=>(latestCategorySpend[item.name]||0)>0).sort((a,b)=>(latestCategorySpend[b.name]||0)-(latestCategorySpend[a.name]||0)).slice(0,7).map(item=>{const actual=latestCategorySpend[item.name]||0;const used=item.amount?actual/item.amount*100:actual?100:0;return <button key={item.name} onClick={()=>{setCategory(item.name);setPeriod("Latest pay cycle");setTxView("Spending");setTab("Transactions")}}>
<span>
<b>{item.name}</b>
<small>{gbp.format(actual)} of {gbp.format(item.amount)}</small>
</span>
<div>
<i className={used>100?"over":""} style={{width:`${Math.min(used,100)}%`}}/>
</div>
<strong className={used>100?"over-text":""}>{used.toFixed(0)}%</strong>
</button>})}</div>
          </article>
          <article className={`panel insight dynamic-focus focus-${monthlyFocus.kind}`}>
<span className="insight-label">THIS MONTH&apos;S FOCUS · LIVE</span>
<h3>{monthlyFocus.title}</h3>
<p>{monthlyFocus.copy}</p>
<div className="focus-meter" role="progressbar" aria-label="Monthly focus progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(monthlyFocus.progress)}>
<i style={{width:`${monthlyFocus.progress}%`}}/>
</div>
<div className="focus-copy">
<span>{cycleLabel(latestCycleKey,payday,salaryDates)}</span>
<strong>{monthlyFocus.metric}</strong>
</div>
<div className="focus-signals">
<span>
<b>{latestOverPlan.length}</b> over-plan areas</span>
<span>
<b>{gbp.format(latestRepeatedSmallSpend)}</b> repeat small spend</span>
<span>
<b>{latestNeedsReview}</b> needs review</span>
</div>
<button className="text-button" onClick={()=>{if(monthlyFocus.kind==="small"){setBudgetCycle("latest");setTab("Leakage")}else if(monthlyFocus.kind==="category"&&topFocusCategory){setCategory(topFocusCategory.name);setPeriod("Latest pay cycle");setTxView("Spending");setTab("Transactions")}else if(monthlyFocus.kind==="review"){setCategory(reviewCategory);setSubcategoryFilter(reviewSubcategory);setPeriod("Latest pay cycle");setTxView("Spending");setTab("Transactions")}else setTab("Budget")}}>{monthlyFocus.kind==="small"?"Open leakage monitor":monthlyFocus.kind==="category"?"Inspect this category":monthlyFocus.kind==="review"?"Review transactions":"Open cash plan"} →</button>
<small className="focus-refresh">Recalculates automatically after every transaction import or category change.</small>
</article>
        </section>
        </div>
        </details>
      </>}

  </>;
}
