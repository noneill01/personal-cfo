"use client";

import SpendingInsights from "./SpendingInsights";
import SavingsGoals from "./SavingsGoals";
import MortgagePlannerView from "./MortgagePlannerView";
import PlanEditor from "./PlanEditor";
import { useState } from "react";

import type { PlanScreenProps } from "../lib/screen-props";
import PlanCashRunway from "./PlanCashRunway";
import { planningCashPosition } from "../lib/balances";
import { categoryFor } from "../lib/categories";
import { transactionAccountId } from "../lib/coverage";
import { personalSpendingAmount } from "../lib/transactions";

export default function Plan(props: PlanScreenProps & { selectedRentalOperatingSpend:number;planningPeriod:"current"|"next";setPlanningPeriod:(period:"current"|"next")=>void;planningPeriodLabel:string;openMonthlyReview?: (cycle: string) => void }) {
  const { averageFor, balanceReconciliations, baselineMonthlyActual, budgetCycle, budgetRemaining, budgetUsed, completedCycleKeys, completedCycleReview, currentBalanceKnown, cycleCloseouts, cycleKeys, cycleLabel, emergencyContribution, emergencyGap, emergencyMonths, employeePensionEstimate, employerPension, essentialCategories, essentialsTotal, fixedCommitmentExpected, fixedCommitmentPaid, fixedCommitmentReserved, fixedCommitments, flexCoveredCategories, futureTotal, gbp, gbpExact, housingEvidence, isRentalMortgage, isExcludedFromSpending, lastCompletedCycleKey, latestBalanceReconciliation, lifestyleCategories, lifestyleRemaining, lifestyleTotal, lifestyleUsed, liquidForEmergency, maxCompletedSpend, monzoBalanceTracking, nonMonthlyDirectDebitReserve, nonMonthlyDirectDebits, ordinalDay, overBudgetCategories, payday, paydayAllocationsMoved, personalDirectDebitTotal, planRows, planningIncome, reconcileActual, reconcileBalance, reconcileDifference, reconcileMonzoCurrentAccount, reconcileReason, remainingVariablePlan, rentalPropertyReserve, rentalPropertySurplus, salaryDates, selectedBudgetCategorySpend, selectedBudgetComplete, selectedBudgetCycle, selectedBudgetIncome, selectedBudgetSpend, selectedBudgetTransactions, selectedPrimaryMortgageSpend, selectedCloseout, selectedCycleCashFlow, selectedCycleCoverage, selectedCycleDataLabel, selectedCycleIsLive, selectedCycleLatestDate, selectedCyclePayslip, selectedCycleRentIncome, selectedCycleSalaryIncome, selectedRentalMortgageSpend, selectedEssentialSpend, selectedEveryPoundAllocated, selectedEveryPoundRemaining, selectedFlexibleCashOut, selectedHousingSpend, selectedLifestyleSpend, selectedMustPayOut, selectedNonMonthlyCollections, selectedOtherHousingSpend, selectedPayYourselfFirst, selectedPayYourselfFirstProgress, selectedTotalCashOut, selectedTvLicenceSpend, selectedUnreviewed, setBudgetCycle, setCategory, setPeriod, setQuery, setReconcileBalance, setReconcileReason, setStore, setSubcategoryFilter, setTab, setTxView, spendableBalanceReady, spendingPlan, store, tab, threeMonthFund, togglePaydayAllocations, totals, travelEvidenceByCycle, travelPlan, tvLicenceDirectDebit, typicalRentalMortgage, typicalRentalIncome, updateBalance, variableMonthlyActual, variablePlanMargin, variableSpendSoFar, variableSpendingPlan } = props;
  const planningCash=planningCashPosition(store.balances,store.profile);
  const locale=gbp.resolvedOptions().locale,currency=gbp.resolvedOptions().currency,symbol=gbp.formatToParts(0).find(part=>part.type==="currency")?.value??currency;
  const legacyMonzoConfigured=store.balances.some(balance=>balance.id==="monzo-current");
  const legacyPotPlanning=legacyMonzoConfigured&&store.profile?.origin==="legacy";
  const runwayCashAccounts=planningCash.currentAccounts.map(balance=>({accountId:balance.id,balance:balance.value,balanceKnown:Boolean(balance.asOf)||balance.value!==0,balanceThrough:balance.asOf??store.transactions.filter(row=>transactionAccountId(row,store.imports??[],planningCash.currentAccounts.map(account=>account.id))===balance.id).map(row=>row.date).sort().at(-1)??""}));
  const [fixedCommitmentsOpen,setFixedCommitmentsOpen]=useState(false);

  const selectedRentalOperatingSpend=props.selectedRentalOperatingSpend;
  const rentalCategory=categoryFor(store.profile,store.profile?.propertyConfig?.rentalCategory??"")?.name??store.profile?.propertyConfig?.rentalCategory;
  const savingsCategory=categoryFor(store.profile,"Savings")?.name??"Savings";

  const rentalLabel=rentalCategory?.replace(/ property$/i,"")??"Rental property";
  const homeLabel=store.balances.find(balance=>balance.id==="home")?.name??"Home";
  const activeEmployer=store.profile?.paySchedule?.rules.at(-1)?.employer??"your employer";
  const pensionProvider=store.profile?.planning?.pensionProvider??"Your pension provider";
  const annualSalary=store.profile?.planning?.annualSalary??0;

  return <>

      {(tab==="Budget"||tab==="Plan")&&<section className="budget-dashboard">
<article className="panel plan-intro"><div><h2>Your spending and savings plan</h2><p>{props.planningPeriodLabel}</p><small>These allowances carry forward until you edit them. Commitments reflect the period chosen below.</small></div><div className="plan-inputs"><label>Planning period<select value={props.planningPeriod} onChange={e=>props.setPlanningPeriod(e.target.value as "current"|"next")}><option value="current">Current pay period</option><option value="next">Next pay period</option></select></label><label>Expected take-home income<div className="money-input"><b>{symbol}</b><input aria-label="Planned net pay" type="number" min="0" step="50" value={planningIncome} onChange={e=>setStore(s=>({...s,planningIncome:Number(e.target.value)}))}/></div></label></div></article>
<PlanEditor {...props}/><nav className="context-tools" aria-label="Planning tools"><button className="text-button" onClick={()=>setTab("Direct Debits")}>Manage regular payments →</button><button className="text-button" onClick={()=>setTab("Goals")}>1p savings challenge & goals →</button><button className="text-button" onClick={()=>setTab("Mortgage")}>Mortgage analysis →</button><button className="text-button" onClick={()=>props.openMonthlyReview?.(selectedBudgetCycle)}>Review this period →</button></nav>
<details className="overview-more"><summary><span><b>Current-period progress and supporting detail</b><small>Actual spending, commitments paid, forecasts and evidence</small></span><i>Explore</i></summary><div className="overview-more-content">        <article className="panel cycle-control-centre">
<div className="cycle-control-head">
<div>
<div className="cycle-title-line">
<span className="insight-label">ACTUAL PERIOD PERFORMANCE</span>
<span className={`cycle-status ${selectedCycleIsLive?"live":selectedBudgetComplete?"complete":"partial"}`}>{selectedCycleIsLive?"Live cycle":selectedBudgetComplete?"Complete cycle":"Partial data"}</span>
</div>
<h2>{cycleLabel(selectedBudgetCycle,payday,salaryDates)}</h2>
<p>See what has actually arrived and left during this salary-to-salary window. Transfers, savings movements and credit-card repayments are excluded from spending.</p>
</div>
<div className="budget-hero-controls cycle-controls">

<label>
<span>Compare actual period</span>
<select aria-label="Budget cycle" value={budgetCycle} onChange={e=>setBudgetCycle(e.target.value)}>
<option value="latest">Current tracked period</option>{cycleKeys.slice(0,12).map(key=>
<option key={key} value={key}>{cycleLabel(key,payday,salaryDates)}</option>)}</select>
</label>
</div>
</div>
<div className="cycle-control-grid">
<button onClick={()=>{setPeriod(`cycle:${selectedBudgetCycle}`);setTxView("Income");setTab("Transactions")}}>
<span>Salary paid</span>
<strong>{gbp.format(selectedCycleSalaryIncome)}</strong>
<small>Paid in {selectedBudgetCycle} · {gbp.format(selectedBudgetIncome)} total cash received across this salary window</small>
</button>
<button onClick={()=>{setPeriod(`cycle:${selectedBudgetCycle}`);setTxView("Spending");setTab("Transactions")}}>
<span>Personal spending</span>
<strong>{gbp.format(selectedBudgetSpend)}</strong>
<small>{selectedBudgetTransactions.filter(transaction=>transaction.amount<0&&!isExcludedFromSpending(transaction)&&!isRentalMortgage(transaction)&&transaction.categoryGroup!=="property"&&transaction.category!==rentalCategory).length} outgoing transactions</small>
</button>
{rentalCategory&&<button onClick={()=>{setQuery("");setCategory(rentalCategory);setPeriod(`cycle:${selectedBudgetCycle}`);setTxView("Spending");setTab("Transactions")}}>
<span>{rentalLabel} cash flow</span>
<strong className={selectedCycleRentIncome-selectedRentalMortgageSpend-selectedRentalOperatingSpend>=0?"positive":"negative"}>{selectedCycleRentIncome-selectedRentalMortgageSpend-selectedRentalOperatingSpend>=0?"+":"−"}{gbp.format(Math.abs(selectedCycleRentIncome-selectedRentalMortgageSpend-selectedRentalOperatingSpend))}</strong>
<small>{gbp.format(selectedCycleRentIncome)} rent − {gbp.format(selectedRentalMortgageSpend)} mortgage − {gbp.format(selectedRentalOperatingSpend)} other costs</small>
</button>}
<button onClick={()=>{setPeriod(`cycle:${selectedBudgetCycle}`);setTxView("All activity");setTab("Transactions")}}>
<span>Cash-flow so far</span>
<strong className={selectedCycleCashFlow>=0?"positive":"negative"}>{selectedCycleCashFlow>=0?"+":"−"}{gbp.format(Math.abs(selectedCycleCashFlow))}</strong>
<small>Income less personal and rental outgoings</small>
</button>
</div>
<div className="cycle-data-strip">
<div>
<span className={selectedCycleLatestDate?"freshness-dot":"freshness-dot empty"}/>
<span>Transaction data through <b>{selectedCycleDataLabel}</b></span>
{selectedUnreviewed>0&&<span className="review-count">{selectedUnreviewed} need categorising</span>}
</div>
<button className="text-button" onClick={()=>setTab("Update")}>Import the latest activity →</button>
</div>
</article>
<details className="overview-more">
<summary><span><b>Checks and reconciliation</b><small>{selectedCloseout?"This cycle is closed":selectedCycleIsLive?"Live cycle · review closeout and balance checks when needed":selectedBudgetComplete?"Ready to review and close":"Account coverage still needs checking"}{legacyMonzoConfigured&&!monzoBalanceTracking.enabled?" · current-account anchor needed":""}</small></span><i>Details</i></summary>
<div className="overview-more-content">
        <section className="cycle-operations-grid">
<article className="panel cycle-closeout-panel">
<div className="operation-head">
<div>
<span className="insight-label">PAY-CYCLE CLOSEOUT</span>
<h3>{selectedCloseout?"This cycle has a saved record.":selectedCycleIsLive?"Keep watching—the cycle is still live.":selectedBudgetComplete?"Ready for your sign-off.":"Complete the data before closing."}</h3>
<p>Finish account checks, save your note and close the cycle in Monthly Review.</p>
</div>
<span className={`operation-status ${selectedCloseout?"done":selectedCycleIsLive?"live":selectedBudgetComplete?"ready":"waiting"}`}>{selectedCloseout?"Closed":selectedCycleIsLive?"In progress":selectedBudgetComplete?"Ready":"Waiting for data"}</span>
</div>
<div className="closeout-metrics">
<div><span>Income</span><strong>{gbp.format(selectedBudgetIncome)}</strong></div>
<div><span>Must pay</span><strong>{gbp.format(selectedMustPayOut)}</strong></div>
<div><span>Pay yourself first</span><strong className="positive">{gbp.format(selectedPayYourselfFirst)}</strong></div>
<div><span>Flexible costs</span><strong>{gbp.format(selectedFlexibleCashOut)}</strong></div>
<div><span>Unallocated</span><strong className={selectedEveryPoundRemaining>=0?"positive":"negative"}>{selectedEveryPoundRemaining>=0?"+":"−"}{gbp.format(Math.abs(selectedEveryPoundRemaining))}</strong></div>
</div>
<div className="operation-actions">
<button className="primary" onClick={()=>{const cycle=selectedCycleIsLive?lastCompletedCycleKey:selectedBudgetCycle;if(props.openMonthlyReview)props.openMonthlyReview(cycle);else setTab("Monthly Review")}}>{selectedCycleIsLive?"Review the last completed cycle":"Continue in Monthly Review"}</button>
{selectedCloseout&&<small>Saved {new Date(selectedCloseout.closedAt).toLocaleDateString(locale,{day:"numeric",month:"short",year:"numeric"})} · {selectedCloseout.unreviewed?`${selectedCloseout.unreviewed} uncategorised at close`:`all spending categorised`}</small>}
</div>
{cycleCloseouts.length>0&&<details className="operation-history"><summary>View closeout history ({cycleCloseouts.length})</summary><div>{cycleCloseouts.slice(0,6).map(closeout=>{const result=closeout.unallocated??closeout.cashFlow;return <button key={closeout.cycle} onClick={()=>setBudgetCycle(closeout.cycle)}><span><b>{cycleLabel(closeout.cycle,payday,salaryDates)}</b><small>{closeout.note||"No note saved"}</small></span><strong className={result>=0?"positive":"negative"}>{result>=0?"+":"−"}{gbp.format(Math.abs(result))}</strong></button>})}</div></details>}
</article>
{legacyMonzoConfigured&&<article className="panel balance-reconciliation-panel">
<div className="operation-head">
<div>
<span className="insight-label">MONZO BALANCE RECONCILIATION</span>
<h3>Make the tracked balance trustworthy.</h3>
<p>Import the latest CSV first, then compare the app with the balance shown in Monzo. Corrections never count as income or spending.</p>
</div>
<span className={`operation-status ${monzoBalanceTracking.enabled?"done":"waiting"}`}>{monzoBalanceTracking.enabled?"Tracking on":"Anchor needed"}</span>
</div>
<div className="reconciliation-equation">
<div><span>App currently tracks</span><strong>{gbpExact.format(totals.currentAccount)}</strong><small>{monzoBalanceTracking.syncedThrough?`Transactions through ${new Date(monzoBalanceTracking.syncedThrough+"T12:00:00").toLocaleDateString(locale,{day:"numeric",month:"short"})}`:"No dated anchor yet"}</small></div>
<i>→</i>
<label><span>Actual Monzo balance</span><div className="money-input"><b>{symbol}</b><input aria-label="Actual Monzo current-account balance" type="number" min="0" step="0.01" value={reconcileBalance} onChange={event=>setReconcileBalance(event.target.value)} placeholder="0.00"/></div><small>Current account only—exclude pots</small></label>
</div>
<div className={`reconciliation-difference ${reconcileDifference===null?"pending":Math.abs(reconcileDifference)<.005?"matched":"changed"}`}>
<span>Difference</span>
<strong>{reconcileDifference===null?"Enter actual balance":Math.abs(reconcileDifference)<.005?"Exact match":`${reconcileDifference>=0?"+":"−"}${gbpExact.format(Math.abs(reconcileDifference))}`}</strong>
<small>{reconcileDifference===null?"Nothing changes until you confirm.":Math.abs(reconcileDifference)<.005?"The app and Monzo agree.":"This adjustment will be recorded without altering spending."}</small>
</div>
<label className="reconciliation-reason"><span>Reason</span><select aria-label="Balance reconciliation reason" value={reconcileReason} onChange={event=>setReconcileReason(event.target.value)}><option>Routine balance check</option><option>Transactions after CSV cutoff</option><option>Pending card authorisation</option><option>Missing or rejected transaction</option><option>Manual correction</option></select></label>
<div className="operation-actions"><button className="primary" disabled={reconcileActual===null||!Number.isFinite(reconcileActual)||reconcileActual<0} onClick={reconcileMonzoCurrentAccount}>Reconcile and set new anchor</button>{latestBalanceReconciliation&&<small>Last checked {new Date(latestBalanceReconciliation.reconciledAt).toLocaleDateString(locale,{day:"numeric",month:"short",year:"numeric"})} · correction {latestBalanceReconciliation.difference>=0?"+":"−"}{gbpExact.format(Math.abs(latestBalanceReconciliation.difference))}</small>}</div>
{balanceReconciliations.length>0&&<details className="operation-history"><summary>View reconciliation history ({balanceReconciliations.length})</summary><div>{balanceReconciliations.slice(0,6).map(item=><div className="reconciliation-history-row" key={item.id}><span><b>{new Date(item.reconciledAt).toLocaleDateString(locale,{day:"numeric",month:"short",year:"numeric"})}</b><small>{item.reason}{item.transactionsThrough?` · data through ${new Date(item.transactionsThrough+"T12:00:00").toLocaleDateString(locale,{day:"numeric",month:"short"})}`:""}</small></span><strong>{gbpExact.format(item.actualBalance)}</strong></div>)}</div></details>}
</article>}
</section>
</div>
</details>
        <article className={lifestyleRemaining>=0?"panel flex-budget-panel healthy":"panel flex-budget-panel over"}>
<div className="flex-budget-copy">
<span className="insight-label">FLEXIBLE LIFESTYLE ENVELOPE</span>
<h3>{lifestyleRemaining>=0?`${gbp.format(lifestyleRemaining)} still available for living well`:`${gbp.format(Math.abs(lifestyleRemaining))} over the lifestyle envelope`}</h3>
<p>Travel, eating out, cycling, shopping, entertainment, home and other lifestyle categories are guides—not hard limits. Spending more on travel is fine when lower spending elsewhere keeps this overall allowance on track.</p>
{flexCoveredCategories.length>0&&<div className="flex-covered-list">{flexCoveredCategories.map(item=><span key={item.name}><b>{item.name}</b> +{gbp.format((selectedBudgetCategorySpend[item.name]||0)-item.amount)} covered</span>)}</div>}
</div>
<div className="flex-budget-score">
<div><span>Lifestyle plan</span><strong>{gbp.format(lifestyleTotal)}</strong></div>
<div><span>Spent {selectedBudgetComplete?"this cycle":"so far"}</span><strong>{gbp.format(selectedLifestyleSpend)}</strong></div>
<div><span>Essentials recorded</span><strong>{gbp.format(selectedEssentialSpend)}</strong></div>
<div className="progress large" role="progressbar" aria-label="Flexible lifestyle allowance used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(100,lifestyleUsed))}><i className={lifestyleRemaining<0?"over-progress":""} style={{width:`${Math.min(100,lifestyleUsed)}%`}}/></div>
<small>{lifestyleUsed.toFixed(0)}% of the combined lifestyle allowance used</small>
</div>
</article>
        <article className="panel safe-spend-panel">
<div className="safe-spend-main">
<span className="insight-label">UNALLOCATED CASH ESTIMATE</span>
<strong>{!currentBalanceKnown?"Current balance needed":!spendableBalanceReady?"Confirm payday sweep":gbp.format(planningCash.current)}</strong>
<p>Current-account cash is shown separately from savings reserves. Once any payday bill allocations are complete, the remaining current cash is your unallocated amount. Bills already funded elsewhere are not deducted here again.</p>
{spendableBalanceReady&&<div className="safe-spend-equation" aria-label="Spendable current balance comparison">
<span><b>{gbp.format(planningCash.current)}</b> current accounts</span>
<i>vs</i>
<span><b>{gbp.format(remainingVariablePlan)}</b> variable plan remaining</span>
</div>}
<small className="balance-freshness">{planningCash.currentAccounts.map(account=>account.asOf).filter(Boolean).length===planningCash.currentAccounts.length&&planningCash.currentAccounts.length?"Current-account balances are dated; check the account dates in Settings before relying on this estimate.":"Some current-account balances lack a dated anchor; update them in Settings before relying on this estimate."}</small>
</div>
<div className="safe-spend-form">
{legacyMonzoConfigured&&<label>
<span>Monzo current account</span>
<div className="money-input">
<b>{symbol}</b>
<input aria-label="Monzo current account balance" type="number" min="0" step="0.01" value={totals.currentAccount} onChange={event=>updateBalance("monzo-current",Number(event.target.value))}/>
</div>
</label>}
<div className="safe-spend-stat">
<span>Variable plan remaining</span>
<strong>{gbp.format(remainingVariablePlan)}</strong>
<small>{gbp.format(variableSpendSoFar)} used from a {gbp.format(variableSpendingPlan)} variable-spending plan</small>
<details className="cash-calculation-details">
<summary>Where this comes from</summary>
<div>
<span>Total monthly spending plan <b>{gbp.format(spendingPlan)}</b></span>
<span>Less scheduled fixed commitments <b>−{gbp.format(fixedCommitmentExpected)}</b></span>
<span>Variable-spending plan <b>{gbp.format(variableSpendingPlan)}</b></span>
<span>Less variable spending recorded <b>−{gbp.format(variableSpendSoFar)}</b></span>
<span>Variable plan remaining <b>{gbp.format(remainingVariablePlan)}</b></span>
</div>
<button className="text-button" onClick={()=>setTab("Direct Debits")}>Review fixed commitments →</button>
</details>
</div>
<div className="safe-spend-stat">
<span>Position against plan</span>
<strong className={spendableBalanceReady&&variablePlanMargin<0?"negative":""}>{spendableBalanceReady?`${variablePlanMargin>=0?"+":""}${gbp.format(variablePlanMargin)}`:"Pending"}</strong>
<small>{spendableBalanceReady?(variablePlanMargin>=0?"Current cash is above the remaining variable plan":"Current cash is below the remaining variable plan"):"Confirm the payday pot sweep first"}</small>
</div>
{legacyPotPlanning&&<label className="allocation-toggle">
<input type="checkbox" checked={paydayAllocationsMoved} onChange={()=>togglePaydayAllocations(selectedBudgetCycle)}/>
<i/>
<span>I have completed this cycle&apos;s payday transfers into my pots</span>
</label>}
</div>
{legacyPotPlanning&&<div className="pot-data-note">
<b>How pot-funded bills are handled</b>
<span>Monzo records the transfer back from a pot and the matching direct debit. They net to zero in the current account, while the bill remains included in your spending history.</span>
</div>}
{!spendableBalanceReady?<div className="safe-spend-warning">
<b>Spendable balance not ready</b>
<span>{!currentBalanceKnown?"Enter dated balances for your current accounts in Settings.":"Confirm that this pay cycle’s transfers into your pots are complete."}</span>
</div>:variablePlanMargin<0&&<div className="safe-spend-warning">
<b>{gbp.format(Math.abs(variablePlanMargin))} below the remaining variable plan</b>
<span>Your current balance is still yours to spend, but the plan suggests pacing discretionary spending carefully until payday.</span>
</div>}</article>
<details className="overview-more">
<summary><span><b>Spending history and evidence</b><small>{completedCycleKeys.length} complete cycles · average spending, housing and rental context</small></span><i>Details</i></summary>
<div className="overview-more-content">
<div className="budget-source">
<span className="source-live"><i/>COMPLETE DATA ONLY</span>
<strong>{completedCycleKeys.length} fully covered salary cycles set the evidence baseline</strong>
<span>{completedCycleKeys.length?`${cycleLabel(completedCycleKeys[0],payday,salaryDates)} to ${cycleLabel(completedCycleKeys.at(-1)!,payday,salaryDates)}`:"Import required account activity to build a baseline"}</span>
</div>
        <article className="budget-audit">
<div>
<span>Actual personal spending</span>
<strong>{gbp.format(baselineMonthlyActual)}</strong>
<small>Average of complete account cycles</small>
</div>
<div>
<span>Home housing evidence</span>
<strong>{gbp.format(housingEvidence)}</strong>
<small>{homeLabel} mortgage and rates; {rentalLabel} is separate</small>
</div>
<div>
<span>Personal Direct Debits</span>
<strong>{gbp.format(personalDirectDebitTotal)}</strong>
<small>{rentalCategory?`${rentalLabel} mortgage removed from this figure`:"Personal commitments only"}</small>
</div>
<div>
<span>Your editable plan</span>
<strong>{gbp.format(spendingPlan)}</strong>
<small>Target, not a claim about past spending</small>
</div>
</article>
        <section className="budget-evidence-grid">
<article className="panel spending-evidence">
<div className="panel-head">
<div>
<h3>What you have actually spent</h3>
<p>Complete salary-to-salary periods. Card repayments, savings transfers and rental mortgage payments are excluded.</p>
</div>
<span className="safe-badge">Required accounts</span>
</div>
<div className="budget-history-chart" role="img" aria-label="Personal spending across completed salary cycles">{completedCycleReview.map(item=>
<button key={item.key} aria-label={`${cycleLabel(item.key,payday,salaryDates)}: ${gbp.format(item.personalSpend)} personal spending`} onClick={()=>{setBudgetCycle(item.key);setPeriod(`cycle:${item.key}`);setTxView("Spending");setTab("Transactions")}}>
<strong>{gbp.format(item.personalSpend)}</strong>
<i style={{height:`${Math.max(12,item.personalSpend/maxCompletedSpend*132)}px`}}/>
<span>{cycleLabel(item.key,payday,salaryDates).split(" – ")[0]}</span>
</button>)}</div>
<details className="chart-data"><summary>View completed-cycle spending data</summary><table><thead><tr><th>Salary cycle</th><th>Personal spending</th></tr></thead><tbody>{completedCycleReview.map(item=><tr key={item.key}><td>{cycleLabel(item.key,payday,salaryDates)}</td><td>{gbp.format(item.personalSpend)}</td></tr>)}</tbody></table></details>
<div className="spend-mix">
<div>
<span>Recurring commitments</span>
<strong>{gbp.format(personalDirectDebitTotal)}</strong>
<small>Typical active Direct Debits</small>
</div>
<div>
<span>Variable + one-off spend</span>
<strong>{gbp.format(variableMonthlyActual)}</strong>
<small>Complete-cycle average less recurring payments</small>
</div>
</div>
</article>
{rentalCategory&&<article className="panel rental-budget">
<span className="insight-label">{rentalLabel.toUpperCase()} MINI-BUDGET</span>
<h3>The rental now stands on its own.</h3>
<p>Rental income should fund the rental mortgage before it contributes to household spending.</p>
<div className="rental-flow">
<div>
<span>Typical rent</span>
<strong>+{gbp.format(typicalRentalIncome)}</strong>
<small>Rental income</small>
</div>
<i>→</i>
<div>
<span>Mortgage</span>
<strong>−{gbp.format(typicalRentalMortgage)}</strong>
<small>{store.balances.find(balance=>balance.id==="rental-mortgage")?.name??"Rental mortgage"}</small>
</div>
<i>→</i>
<div className={rentalPropertySurplus>=0?"positive-tile":"negative-tile"}>
<span>Before other costs</span>
<strong>{rentalPropertySurplus>=0?"+":"−"}{gbp.format(Math.abs(rentalPropertySurplus))}</strong>
<small>{rentalPropertyReserve?`${gbp.format(rentalPropertyReserve)} suggested reserve`:`Review rent and costs`}</small>
</div>
</div>
<small className="rental-note">The typical figure is before other costs. In the selected cycle, you recorded <b>{gbp.format(selectedRentalOperatingSpend)}</b> of {rentalLabel} repairs, compliance or other property costs. These stay outside your personal lifestyle budget.</small>
</article>}
</section>
</div>
</details>
        <article className="panel fixed-commitments-panel">
<button type="button" className="fixed-commitment-toggle" aria-expanded={fixedCommitmentsOpen} onClick={()=>setFixedCommitmentsOpen(value=>!value)}>
<span className="fixed-commitment-toggle-copy"><span className="insight-label">FIXED COMMITMENT TRACKER</span><strong>Protect bills before spending the rest</strong><small>{fixedCommitments.length} active commitments · paid and reserved values follow this salary cycle.</small></span>
<span className={`fixed-commitment-toggle-status ${fixedCommitmentReserved?"reserved":"covered"}`}><b>{fixedCommitmentReserved?`${gbp.format(fixedCommitmentReserved)} reserved`:"All covered"}</b><small>{fixedCommitmentsOpen?"Hide tracker ↑":"Show tracker ↓"}</small></span>
</button>
{fixedCommitmentsOpen&&<div className="fixed-commitments-content">
<div className="fixed-commitments-intro"><p>Expected amounts come from recent collections. Paid and reserved values update automatically for the selected salary cycle.</p><button className="text-button" onClick={()=>setTab("Direct Debits")}>Manage recurring payments →</button></div>
<div className="fixed-commitment-summary">
<div>
<span>Monthly commitment reserve</span>
<strong>{gbp.format(fixedCommitmentExpected)}</strong>
<small>{fixedCommitments.length} active commitments · non-monthly bills smoothed</small>
</div>
<div>
<span>Actually collected</span>
<strong>{gbp.format(fixedCommitmentPaid)}</strong>
<small>Only transactions that left the account this cycle</small>
</div>
<div className={fixedCommitmentReserved?"reserve-tile":"paid-tile"}>
<span>Keep reserved</span>
<strong>{gbp.format(fixedCommitmentReserved)}</strong>
<small>{fixedCommitmentReserved?"Do not treat as available":"All expected payments covered"}</small>
</div>
<div>
<span>Plan after fixed costs</span>
<strong>{gbp.format(Math.max(0,spendingPlan-fixedCommitmentExpected))}</strong>
<small>Variable and one-off capacity</small>
</div>
</div>
{nonMonthlyDirectDebits.length>0&&<div className="non-monthly-bill-strip">
<div><span>Quarterly & annual provision</span><strong>{gbpExact.format(nonMonthlyDirectDebitReserve)}/month</strong><small>{nonMonthlyDirectDebits.length} non-monthly payment{nonMonthlyDirectDebits.length===1?"":"s"} smoothed across the year</small></div>
<div><span>Collected this cycle</span><strong>{gbpExact.format(selectedNonMonthlyCollections)}</strong><small>{selectedNonMonthlyCollections?"Shown in actual spending on its collection date":"No quarterly or annual collection has left the account"}</small></div>
{tvLicenceDirectDebit&&<div><span>TV Licensing</span><strong>{gbpExact.format(tvLicenceDirectDebit.monthlyEquivalent)}/month provision</strong><small>{selectedTvLicenceSpend?`${gbpExact.format(selectedTvLicenceSpend)} actually collected this cycle`:`${gbpExact.format(0)} actual spend this cycle`}</small></div>}
</div>}
<div className="fixed-commitment-head">
<span>Commitment</span>
<span>Usual timing</span>
<span>Expected</span>
<span>Paid</span>
<span>Status</span>
</div>
<div className="fixed-commitment-list">{fixedCommitments.map((row,index)=>{const remaining=Math.max(0,row.expected-row.paid);const paid=row.paid>=row.expected*.9;return <button key={`${row.key}-${index}`} onClick={()=>{setQuery(row.key);setPeriod(`cycle:${selectedBudgetCycle}`);setTxView("Spending");setTab("Transactions")}}>
<span>
<strong>{row.label}</strong>
<small>{row.category} · {row.source}</small>
</span>
<span>{row.lastDate?`Around the ${ordinalDay(row.lastDate)}`:"Timing unknown"}</span>
<strong>{gbpExact.format(row.expected)}</strong>
<strong>{gbpExact.format(row.paid)}</strong>
<span className={paid?"commitment-paid":row.paid?"commitment-partial":"commitment-reserved"}>{paid?"Paid":row.paid?`${gbp.format(remaining)} left`:"Reserved"}</span>
</button>})}</div>
{rentalCategory&&<div className="fixed-property-note">
<span>{rentalLabel} mortgage</span>
<strong>{gbpExact.format(typicalRentalMortgage)}</strong>
<small>Tracked separately against rental income, so it is not deducted from your personal spending plan twice.</small>
</div>}
</div>}
</article>
        <section className="budget-summary-grid">
<article>
<span>Planned income</span>
<strong>{gbp.format(planningIncome)}</strong>
<small>Your editable take-home target</small>
</article>
<article>
<span>Core essentials</span>
<strong>{gbp.format(essentialsTotal)}</strong>
<small>{planningIncome?`${(essentialsTotal/planningIncome*100).toFixed(0)}% of planned income`:"Housing, bills and commitments"}</small>
</article>
<article>
<span>Guilt-free lifestyle</span>
<strong>{gbp.format(lifestyleTotal)}</strong>
<small>{planningIncome?`${(lifestyleTotal/planningIncome*100).toFixed(0)}% for enjoying life`:"Flexible monthly spending"}</small>
</article>
<article className={selectedBudgetComplete?(budgetRemaining>=0?"budget-surplus":"budget-deficit"):"budget-incomplete"}>
<span>Cycle cash out</span>
<strong>{gbp.format(selectedTotalCashOut)}</strong>
<small>{gbp.format(selectedBudgetSpend)} personal · {gbp.format(selectedRentalMortgageSpend)} rental mortgage</small>
</article>
<article>
<span>Future-you plan</span>
<strong>{gbp.format(futureTotal)}</strong>
<small>{planningIncome?`${(futureTotal/planningIncome*100).toFixed(0)}% to cash and sinking funds`:"Savings and sinking funds"}</small>
</article>
</section>
<details className="overview-more">
<summary><span><b>Income allocation details · {gbp.format(selectedBudgetIncome)} received</b><small>{gbp.format(selectedEveryPoundAllocated)} allocated · {gbp.format(Math.abs(selectedEveryPoundRemaining))} {selectedEveryPoundRemaining>=0?"remaining":"over income"}</small></span><i>Details</i></summary>
<div className="overview-more-content">
        <article className="panel every-pound-allocation">
<div className="panel-head">
<div>
<span className="insight-label">EVERY PART OF YOUR INCOME HAS A JOB</span>
<h3>Pay yourself before flexible spending.</h3>
<p>This reconciles the selected cycle&apos;s income across must-pay costs, savings and investments, flexible costs, and money that is still unallocated.</p>
</div>
<span className={!selectedBudgetComplete?"cycle-chip incomplete":selectedEveryPoundRemaining>=0?"cycle-chip":"cycle-chip over"}>{!selectedBudgetComplete?"Live / partial":selectedEveryPoundRemaining>=0?"Reconciled":"More allocated than income"}</span>
</div>
<div className="every-pound-flow">
<div className="income-job"><span>Income received</span><strong>{gbp.format(selectedBudgetIncome)}</strong><small>100% to allocate</small></div>
<i>→</i>
<button onClick={()=>{setQuery("");setCategory("All categories");setPeriod(`cycle:${selectedBudgetCycle}`);setTxView("Spending");setTab("Transactions")}}><span>1 · Must pay</span><strong>{gbp.format(selectedMustPayOut)}</strong><small>Direct Debits, maintenance and rental-property costs</small></button>
<button className="pay-self-job" onClick={()=>{setQuery("");setCategory(savingsCategory);setSubcategoryFilter("All subcategories");setPeriod(`cycle:${selectedBudgetCycle}`);setTxView("All activity");setTab("Transactions")}}><span>2 · Pay yourself first</span><strong>{gbp.format(selectedPayYourselfFirst)}</strong><small>Cash, ISA and genuine savings allocations</small></button>
<button onClick={()=>{setQuery("");setCategory("All categories");setPeriod(`cycle:${selectedBudgetCycle}`);setTxView("Spending");setTab("Transactions")}}><span>3 · Flexible costs</span><strong>{gbp.format(selectedFlexibleCashOut)}</strong><small>Day-to-day spending after commitments</small></button>
<div className={selectedEveryPoundRemaining>=0?"remaining-job":"remaining-job over"}><span>4 · Still unallocated</span><strong>{selectedEveryPoundRemaining>=0?"+":"−"}{gbp.format(Math.abs(selectedEveryPoundRemaining))}</strong><small>{selectedEveryPoundRemaining>=0?"Available to retain or assign":"Allocations exceed cycle income"}</small></div>
</div>
<div className="pay-self-progress-row">
<div>
<span>Pay-yourself-first progress</span>
<strong>{gbp.format(selectedPayYourselfFirst)} of {gbp.format(futureTotal)}</strong>
<div className="progress" role="progressbar" aria-label="Pay yourself first target achieved" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(100,selectedPayYourselfFirstProgress))}><i style={{width:`${Math.min(100,selectedPayYourselfFirstProgress)}%`}}/></div>
<small>{selectedPayYourselfFirst>=futureTotal?"Payday savings target achieved":`${gbp.format(Math.max(0,futureTotal-selectedPayYourselfFirst))} still to allocate to future you`}</small>
</div>
<div className="payroll-saving-note"><span>Workplace pension</span><strong>{selectedCyclePayslip?gbp.format(selectedCyclePayslip.employeePension+selectedCyclePayslip.employerPension):"No payslip"}</strong><small>{selectedCyclePayslip?`${gbp.format(selectedCyclePayslip.employeePension)} salary sacrifice + ${gbp.format(selectedCyclePayslip.employerPension)} employer funding. This sits outside the take-home plan.`:"Upload the matching payslip to include workplace pension funding."}</small></div>
<div className="allocation-proof"><span>Accounted for</span><strong>{gbp.format(selectedEveryPoundAllocated)}</strong><small>{selectedEveryPoundRemaining>=0?`${gbp.format(selectedEveryPoundAllocated)} allocated + ${gbp.format(selectedEveryPoundRemaining)} remaining = ${gbp.format(selectedBudgetIncome)} income.`:`${gbp.format(selectedEveryPoundAllocated)} allocated is ${gbp.format(Math.abs(selectedEveryPoundRemaining))} above ${gbp.format(selectedBudgetIncome)} income.`}</small></div>
</div>
</article>
</div>
</details>
<section className="budget-clean-grid">

          <div className="budget-side-stack"><PlanCashRunway cycleLabel={key=>cycleLabel(key,payday,salaryDates)} cycleOptions={cycleKeys} cycleKey={selectedBudgetCycle} bounds={selectedCycleCoverage.bounds} allTransactions={store.transactions} personalTransactions={selectedBudgetTransactions.filter(transaction=>personalSpendingAmount(transaction)!==0&&!isRentalMortgage(transaction)&&transaction.categoryGroup!=="property"&&transaction.category!==store.profile?.propertyConfig?.rentalCategory)} spendingPlan={spendingPlan} fixedCommitments={fixedCommitments} isLive={selectedCycleIsLive} format={gbp.format} locale={gbp.resolvedOptions().locale} setCycle={setBudgetCycle} openTransactions={()=>{setPeriod(`cycle:${selectedBudgetCycle}`);setTxView("Spending");setTab("Transactions")}} cashAccounts={runwayCashAccounts} imports={store.imports??[]}/>
<article className="panel actual-card">
<div className="panel-head">
<div>
<h3>Cycle performance</h3>
<p>{cycleLabel(selectedBudgetCycle,payday,salaryDates)}</p>
</div>
<span className={!selectedBudgetComplete?"cycle-chip incomplete":budgetRemaining>=0?"cycle-chip":"cycle-chip over"}>{!selectedBudgetComplete?"Data incomplete":budgetRemaining>=0?"Within plan":"Over plan"}</span>
</div>
<div className="budget-ring-row">
<div className="budget-ring" style={{background:`conic-gradient(${budgetUsed>100?"#c7665c":"var(--green)"} ${Math.min(budgetUsed,100)}%,var(--line) 0)`}}>
<i>
<strong>{budgetUsed.toFixed(0)}%</strong>
<span>{selectedBudgetComplete?"used":"recorded"}</span>
</i>
</div>
<div>
<span>Actual income</span>
<strong>{gbp.format(selectedBudgetIncome)}</strong>
<span>Actual spending</span>
<strong>{gbp.format(selectedBudgetSpend)}</strong>
</div>
</div>
<div className="actual-meter">
<div>
<span>Spending plan</span>
<strong>{gbp.format(spendingPlan)}</strong>
</div>
<div>
<span>{selectedBudgetComplete?(budgetRemaining>=0?"Remaining":"Over by"):"Recorded so far"}</span>
<strong>{gbp.format(selectedBudgetComplete?Math.abs(budgetRemaining):selectedBudgetSpend)}</strong>
</div>
<div className="progress large" role="progressbar" aria-label="Salary-cycle budget used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(100,budgetUsed))}>
<i className={budgetRemaining<0?"over-progress":""} style={{width:`${Math.min(100,budgetUsed)}%`}}/>
</div>{!selectedBudgetComplete&&<small>This salary cycle is still missing required account coverage, so it is not used to set your baseline.</small>}</div>
</article>
<article className="panel attention-card">
<span className="insight-label">CYCLE CHECK</span>
<h3>{overBudgetCategories.length?`${overBudgetCategories.length} area${overBudgetCategories.length===1?" needs":"s need"} attention`:flexCoveredCategories.length?"Your lifestyle choices are balancing out":"Everything is within plan"}</h3>{overBudgetCategories.length?<div className="attention-list">{overBudgetCategories.slice(0,4).map(item=>{const actual=selectedBudgetCategorySpend[item.name]||0;return <button key={item.name} onClick={()=>{setCategory(item.name);setPeriod(`cycle:${selectedBudgetCycle}`);setTxView("Spending");setTab("Transactions")}}>
<span>{item.name}<small>{gbp.format(actual)} actual</small>
</span>
<strong>+{gbp.format(actual-item.amount)}</strong>
</button>})}</div>:flexCoveredCategories.length?<><p>Some lifestyle categories are above their guide, but the combined lifestyle allowance still has {gbp.format(lifestyleRemaining)} remaining.</p><div className="attention-list covered">{flexCoveredCategories.slice(0,4).map(item=>{const actual=selectedBudgetCategorySpend[item.name]||0;return <button key={item.name} onClick={()=>{setCategory(item.name);setPeriod(`cycle:${selectedBudgetCycle}`);setTxView("Spending");setTab("Transactions")}}><span>{item.name}<small>{gbp.format(actual)} actual</small></span><strong>Covered</strong></button>})}</div></>:<p>No category has exceeded its planned amount in this salary cycle.</p>}<button className="text-button" onClick={()=>{setPeriod(`cycle:${selectedBudgetCycle}`);setCategory("All categories");setTxView("Spending");setTab("Transactions")}}>Review this cycle&apos;s transactions →</button>
</article>
</div>
</section>
<details className="overview-more">
<summary><span><b>Category-by-category spending · {gbp.format(selectedTotalCashOut)}</b><small>Compare actual costs with the plan and see the housing breakdown</small></span><i>Details</i></summary>
<div className="overview-more-content">
<article className="panel category-tracker">
<div className="panel-head">
<div>
<h3>Where all spending went</h3>
<p>Category detail for genuine spending in {cycleLabel(selectedBudgetCycle,payday,salaryDates)}. Housing includes both mortgages; savings and investments appear in the allocation above.</p>
</div>
<div className="tracker-total">
<span>Total cash out</span>
<strong>{gbp.format(selectedTotalCashOut)}</strong>
<small>Card repayments and pot transfers excluded</small>
</div>
</div>
<div className="tracker-head">
<span>Category</span>
<span>Guide / plan</span>
<span>Actual</span>
<span>Difference</span>
<span>Progress</span>
</div>{planRows.map(item=>{const actual=item.name==="Housing"?selectedHousingSpend:(selectedBudgetCategorySpend[item.name]||0);const guide=item.name==="Housing"?item.amount+typicalRentalMortgage:item.amount;const difference=guide-actual;const used=guide?actual/guide*100:actual?100:0;const flexCovered=lifestyleCategories.includes(item.name)&&difference<0&&lifestyleRemaining>=0;return <button className={flexCovered?"tracker-row flex-covered":"tracker-row"} key={item.name} onClick={()=>{setCategory(item.name);setPeriod(`cycle:${selectedBudgetCycle}`);setTxView("Spending");setTab("Transactions")}}>
<span>
<i className={essentialCategories.includes(item.name)?"essential":"life"}/>
<b>{item.name}{item.name===(categoryFor(store.profile,"Housing")?.name??"Housing")?<small>Includes {homeLabel} + {rentalLabel}</small>:null}</b>
</span>
<strong>{gbp.format(guide)}</strong>
<strong>{gbp.format(actual)}</strong>
<strong className={difference<0?(flexCovered?"flex-value":"negative"):"positive"}>{difference<0?"−":"+"}{gbp.format(Math.abs(difference))}{flexCovered?<small> covered</small>:null}</strong>
<span className="tracker-progress" role="progressbar" aria-label={`${item.name} budget used`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(100,used))}>
<i className={used>100?(flexCovered?"covered":"over"):""} style={{width:`${Math.min(used,100)}%`}}/>
<small>{used.toFixed(0)}%</small>
</span>
</button>})}
<div className="housing-spend-breakdown" aria-label="Housing spending breakdown">
<div><span>{homeLabel} mortgage</span><strong>{gbpExact.format(selectedPrimaryMortgageSpend)}</strong><small>Primary home</small></div>
{rentalCategory&&<div><span>{rentalLabel} mortgage</span><strong>{gbpExact.format(selectedRentalMortgageSpend)}</strong><small>Funded by rent</small></div>}
<div><span>Rates and other housing</span><strong>{gbpExact.format(selectedOtherHousingSpend)}</strong><small>Everything else in Housing</small></div>
<div className="housing-total"><span>Housing total above</span><strong>{gbpExact.format(selectedHousingSpend)}</strong><small>Tracked mortgages included once</small></div>
</div>
</article>
</div>
</details>
<details className="overview-more">
<summary><span><b>Savings projection and plan assumptions</b><small>Emergency-fund timing, starting-plan rationale and calculation notes</small></span><i>Details</i></summary>
<div className="overview-more-content">
        <section className="two-col budget-bottom">
<article className="panel savings-plan">
<span className="insight-label">EMERGENCY FUND</span>
<h3>{threeMonthFund?`Three months of planned essentials`:`Waiting for a spending baseline`}</h3>
<div className="saving-number">
<strong>{gbp.format(threeMonthFund)}</strong>
<span>calculated target</span>
</div>
<div className="progress large" role="progressbar" aria-label="Emergency fund progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(threeMonthFund?Math.min(100,liquidForEmergency/threeMonthFund*100):0)}>
<i style={{width:`${threeMonthFund?Math.min(100,liquidForEmergency/threeMonthFund*100):0}%`}}/>
</div>
<div className="saving-grid">
<div>
<span>Cash</span>
<strong>{gbp.format(totals.cash)}</strong>
</div>
<div>
<span>Less card debt</span>
<strong>−{gbp.format(totals.cardDebt)}</strong>
</div>
<div>
<span>Emergency cash</span>
<strong>{gbp.format(liquidForEmergency)}</strong>
</div>
<div>
<span>Remaining gap</span>
<strong>{gbp.format(emergencyGap)}</strong>
</div>
<div>
<span>Payday transfer</span>
<strong>{gbp.format(emergencyContribution)}</strong>
</div>
<div>
<span>Estimated completion</span>
<strong>{emergencyGap===0?"Funded":emergencyContribution>0?`${emergencyMonths} cycles`:"Set a transfer"}</strong>
</div>
</div>
<p className="isa-separate-note"><strong>{gbp.format(totals.isa)} in Trading 212 / ISA</strong><span>Accessible investment, shown for context but excluded from the emergency fund and runway.</span></p>
</article>
<article className="panel budget-guidance">
<span className="insight-label">WHY THIS STARTING PLAN</span>
<div>
<strong>Protect the non-negotiables</strong>
<p>{gbp.format(essentialsTotal)} covers the recurring level seen across housing, bills, transport, children, groceries and health.</p>
</div>
<div>
<strong>Travel is lumpy—not monthly</strong>
<p>{travelEvidenceByCycle.length?`${travelEvidenceByCycle.map(value=>gbp.format(value)).join(" + ")} across the evidence cycles creates the ${gbp.format(averageFor("Travel"))} historic average.`:"Import complete cycles to build travel evidence."} Your repeatable travel plan remains {gbp.format(travelPlan)}.</p>
</div>
<div>
<strong>Keep enjoyment visible</strong>
<p>{gbp.format(lifestyleTotal)} remains available for meals, cycling, entertainment, shopping, home and travel—without pretending the recent travel spike repeats every month.</p>
</div>
<div>
<strong>Build cash steadily</strong>
<p>{gbp.format(futureTotal)} goes to the emergency fund, a small ISA habit and annual-cost sinking funds. Keep the take-home plan conservative until the first full payslip establishes the new baseline.</p>
</div>
<small>{pensionProvider} is modelled at approximately {gbp.format(employeePensionEstimate)} from you plus {gbp.format(employerPension)} from {activeEmployer} each month—a combined {gbp.format(employeePensionEstimate+employerPension)} based on configured contribution rates and {gbp.format(annualSalary)} salary.</small>
</article>
</section>
        <article className="panel budget-notes">
<div>
<span className="source-live">
<i/>FROM YOUR DATA</span>
<p>
<b>Only complete salary cycles:</b> incomplete periods cannot make the averages look artificially low.</p>
</div>
<div>
<span className="source-plan">
<i/>SENSIBLE START</span>
<p>
<b>{gbp.format(essentialsTotal+lifestyleTotal+futureTotal)} allocated:</b> {gbp.format(essentialsTotal)} essentials, {gbp.format(lifestyleTotal)} guilt-free life and {gbp.format(futureTotal)} future you.</p>
</div>
<div>
<span className="source-check">
<i/>REFINE THIS</span>
<p>
<b>Subcategories will improve it:</b> {selectedUnreviewed} transaction{selectedUnreviewed===1?"":"s"} still need review for {cycleLabel(selectedBudgetCycle,payday,salaryDates)}.</p>
</div>
</article>
</div>
</details>
</div></details>
      </section>}

      {tab==="Leakage"&&<SpendingInsights {...props}/> }

      {tab==="Goals"&&<SavingsGoals {...props}/> }
      {tab==="Mortgage"&&<MortgagePlannerView {...props}/> }

  </>;
}
