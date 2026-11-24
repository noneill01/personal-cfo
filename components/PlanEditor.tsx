"use client";

import type { PlanScreenProps } from "../lib/screen-props";

export default function PlanEditor(props: Pick<PlanScreenProps, "cycleLabel" | "essentialPlan" | "essentialsTotal" | "fixedCommitments" | "flexibleBuffer" | "futurePlan" | "futureTotal" | "gbp" | "gbpExact" | "lifestylePlan" | "lifestyleTotal" | "payday" | "planningIncome" | "resetBudgetPlan" | "salaryDates" | "selectedBudgetDataState" | "selectedCycleCoverage" | "selectedCycleIsLive" | "selectedCycleLatestDate" | "selectedLifestyleSpend" | "updateBudgetPlan" | "lastPlanCycleKey" | "nextCyclePlanSummary">) {
const { cycleLabel, essentialPlan, essentialsTotal, flexibleBuffer, futurePlan, futureTotal, gbp, gbpExact, lifestylePlan, lifestyleTotal, payday, resetBudgetPlan, salaryDates, updateBudgetPlan } = props;
const currency = gbp.resolvedOptions().currency, symbol = gbp.formatToParts(0).find(part => part.type === "currency")?.value ?? currency;
const { lastPlanCycleKey, nextCyclePlanSummary } = props;







const commitmentsCovered = essentialsTotal + lifestyleTotal + 0.01 >= nextCyclePlanSummary.fixedCommitments;
return (<details className="panel plan-card plan-editor" open>
<summary>
<span><b>Your planned amounts</b><small>{gbp.format(essentialsTotal)} essentials · {gbp.format(lifestyleTotal)} lifestyle · {gbp.format(futureTotal)} savings & investments</small></span>
<span className={flexibleBuffer>=0?"plan-balance-chip":"plan-balance-chip over"}>{flexibleBuffer===0?"Every amount assigned":flexibleBuffer>0?`${gbp.format(flexibleBuffer)} buffer`:`${gbp.format(Math.abs(flexibleBuffer))} over income`}</span>
<i>Build plan</i>
</summary>
<div className="plan-editor-content">
<div className="panel-head">
<div>
<h3>Assign your income</h3>
<p>{lastPlanCycleKey?<>Start with what happened in {cycleLabel(lastPlanCycleKey,payday,salaryDates)}. Known commitments set a floor; you decide the allowance above it. Incomplete cycles are skipped in favour of the most recent fully covered cycle.</>:<>No fully covered cycle is available yet. Known commitments still set a protected floor.</>}</p>
</div>
<button className="text-button" onClick={resetBudgetPlan}>Reset from evidence</button>
</div>
<div className="plan-groups">
<div className="plan-group essential-group">
<div className="plan-group-title">
<span>
<i className="essential"/>Must pay + everyday essentials</span>
<strong>{gbp.format(essentialsTotal)}</strong>
</div>
<div className="essential-commitment-banner">
<span><b>Fixed commitments locked in</b><small>{essentialPlan.reduce((count,item)=>count+item.commitmentDetails.length,0)} known personal commitments in the planning period. This amount must be covered regardless of income.</small></span>
<div className="commitment-banner-status"><span className={`plan-status-chip ${commitmentsCovered?"good":"bad"}`}><i aria-hidden="true"/>{commitmentsCovered?"Fully covered":"Plan below commitments"}</span><strong>{gbpExact.format(nextCyclePlanSummary.fixedCommitments)}</strong></div>
</div>
<div className="essential-plan-cards">{essentialPlan.map(item=>
<article className={item.fixedCommitments?"essential-plan-card committed":"essential-plan-card"} key={item.name}>
<header><span><b>{item.name}</b><small>{item.fixedCommitments?"Committed floor protected":item.explicitlyEdited?"Your saved amount":"Seeded from last cycle"}</small></span><div className="mini-money-input"><span>{symbol}</span><input aria-label={`${item.name} next pay-cycle plan`} type="number" step="0.01" min={item.fixedCommitments} value={item.amount} onChange={e=>updateBudgetPlan(item.name,Math.max(item.fixedCommitments,Number(e.target.value)))}/></div></header>
<details className="plan-evidence"><summary>Previous spending and allowance</summary><div className="essential-card-evidence"><p><span>Last cycle</span><strong>{gbpExact.format(item.lastCycleActual)}</strong></p><p className={item.fixedCommitments?"fixed-evidence":""}><span>Fixed commitments</span><strong>{item.fixedCommitments?gbpExact.format(item.fixedCommitments):"None"}</strong></p><p><span>Additional allowance</span><strong>{gbpExact.format(Math.max(0,item.amount-item.fixedCommitments))}</strong></p></div></details>
{item.fixedCommitments?<details className="commitment-breakdown inline-breakdown"><summary>See what makes up {gbpExact.format(item.fixedCommitments)}</summary><div>{item.commitmentDetails.map(detail=><p key={detail.key}><span>{detail.label}<small>{detail.source}</small></span><strong>{gbpExact.format(detail.amount)}</strong></p>)}<p className="commitment-total"><span>Total fixed commitments</span><strong>{gbpExact.format(item.fixedCommitments)}</strong></p></div></details>:<small className="variable-essential-note">No fixed payment is known. Your plan is fully adjustable.</small>}
<footer><span>Fixed {gbpExact.format(item.fixedCommitments)}</span><i>+</i><span>Allowance {gbpExact.format(Math.max(0,item.amount-item.fixedCommitments))}</span><i>=</i><strong>Plan {gbpExact.format(item.amount)}</strong></footer>
</article>)}</div></div>
<div className="plan-group lifestyle-group">
<div className="plan-group-title">
<span>
<i className="life"/>Flexible spending</span>

<strong>{gbp.format(lifestyleTotal)}</strong>
</div>
<p className="plan-group-note">Move amounts between categories; the combined allowance is what matters. Actual spending is shown in period progress below.</p>
<div className="plan-group-columns lifestyle-columns">
<span>Category</span>
<span>Last cycle</span>
<span>Your plan</span>
</div>{lifestylePlan.map(item=>
<label className="plan-line editable lifestyle-line" key={item.name}>
<span>{item.name}<small>{item.explicitlyEdited?"Your saved amount":"Seeded from last cycle"}</small>
</span>
<b>{gbp.format(item.lastCycleActual)}</b>
<div className="mini-money-input">
<span>{symbol}</span>
<input aria-label={`${item.name} next pay-cycle plan`} type="number" step="10" min={item.fixedCommitments} value={item.amount} onChange={e=>updateBudgetPlan(item.name,Math.max(item.fixedCommitments,Number(e.target.value)))}/>
</div>
</label>)}</div>
<div className="plan-group future-group">
<div className="plan-group-title">
<span>
<i className="future"/>Savings & investments</span>
<strong>{gbp.format(futureTotal)}</strong>
</div>
<div className="plan-group-columns future-columns">
<span>Goal</span>
<span>Your plan</span>
</div>{futurePlan.map(item=>
<label className="plan-line editable future-line" key={item.name}>
<span>{item.name}<small>automatic payday allocation</small>
</span>
<div className="mini-money-input">
<span>{symbol}</span>
<input aria-label={`${item.name} next pay-cycle plan`} type="number" step="25" min="0" value={item.amount} onChange={e=>updateBudgetPlan(item.name,Number(e.target.value))}/>
</div>
</label>)}</div>
</div>
<div className="next-plan-summary" aria-label="Next pay-cycle plan summary">
<p><span>Planning income</span><strong>{gbp.format(nextCyclePlanSummary.planningIncome)}</strong></p>
<p><span>Fixed commitments</span><strong>{gbpExact.format(nextCyclePlanSummary.fixedCommitments)}</strong></p>
<p><span>Variable essentials</span><strong>{gbp.format(nextCyclePlanSummary.variableEssentials)}</strong></p>
<p><span>Lifestyle</span><strong>{gbp.format(nextCyclePlanSummary.lifestyle)}</strong></p>
<p><span>Future you</span><strong>{gbp.format(nextCyclePlanSummary.futureYou)}</strong></p>
<p className={nextCyclePlanSummary.unallocated>=0?"summary-balance":"summary-balance over"}><span>{nextCyclePlanSummary.unallocated>=0?"Unallocated":"Over-allocated"}</span><strong>{gbp.format(Math.abs(nextCyclePlanSummary.unallocated))}</strong></p>
</div>
</div>
</details>);
}
