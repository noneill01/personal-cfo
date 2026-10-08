"use client";

import { useState } from "react";
import type { MortgageAccountId } from "../lib/types";
import { linkedGoalSource } from "../lib/goals";
import type { PlanScreenProps } from "../lib/screen-props";
import PlanCashRunway from "./PlanCashRunway";
import { planningCashPosition } from "../lib/balances";
import { categoryFor } from "../lib/categories";
import { transactionAccountId } from "../lib/coverage";

function transactionFingerprint(transactions: Array<{id:string}>) {
  const value=transactions.map(transaction=>transaction.id).sort().join("|");
  let hash=2166136261;
  for(let index=0;index<value.length;index+=1){hash^=value.charCodeAt(index);hash=Math.imul(hash,16777619)}
  return (hash>>>0).toString(36);
}

export default function Plan(props: PlanScreenProps) {
  const { averageFor, balanceReconciliations, baseMortgage, baselineMonthlyActual, baselineSinkingFunds, budgetCycle, budgetRemaining, budgetUsed, cashProgress, challengeBalanceDate, challengeBalanceInput, closeSelectedCycle, completedCycleKeys, completedCycleReview, confirmCardCoverageThrough, coverage, currentBalanceKnown, currentSavingsChallenge, cycleCloseouts, cycleKeys, cycleLabel, duplicateGroups, emergencyContribution, emergencyGap, emergencyGoal, emergencyMonths, employeePensionEstimate, employerPension, essentialCategories, essentialPlan, essentialsTotal, feeTransactions, fixedCommitmentExpected, fixedCommitmentPaid, fixedCommitmentReserved, fixedCommitments, flexCoveredCategories, flexibleBuffer, formatCoverageDate, futurePlan, futureTotal, gbp, gbpExact, housingEvidence, importError, increasedDirectDebits, investedAfterEarlyPayoff, investedAlternative, investmentContributions, investmentGrowth, isRentalMortgage, isExcludedFromSpending, lastCompletedCycleKey, latestBalanceReconciliation, latestMortgageStatement, latestSavingsChallengeTransfer, leakageRate, lifestyleCategories, lifestylePlan, lifestyleRemaining, lifestyleTotal, lifestyleUsed, liquidForEmergency, maxCompletedSpend, maxSavingsChallengeHistory, monzoBalanceTracking, mortgageChartYears, mortgageDate, mortgageImportTarget, mortgageInterestSaved, mortgageMonthsSaved, mortgageSettings, mortgageStatementRef, nonMonthlyDirectDebitReserve, nonMonthlyDirectDebits, ordinalDay, overBudgetCategories, payday, paydayAllocationsMoved, personalDirectDebitTotal, planRows, plannedMortgage, planningIncome, prepareMortgageStatement, recommendedPlanBuffer, reconcileActual, reconcileBalance, reconcileDifference, reconcileMonzoCurrentAccount, reconcileReason, remainingVariablePlan, rentalPropertyReserve, rentalPropertySurplus, repeatedSmallGroups, repeatedSmallSpend, resetBudgetPlan, reviewTransactions, reviewableSpend, salaryDates, saveSavingsChallengeBalance, savingsChallengeBalance, savingsChallengeDailyAmount, savingsChallengeHistory, savingsChallengeLatestCycle, savingsChallengeNext31, savingsChallengeNextDaily, savingsChallengeProjectedYear, savingsChallengeReconciliation, savingsChallengeTotal, savingsChallengeTracking, selectedBudgetCategorySpend, selectedBudgetComplete, selectedBudgetCycle, selectedBudgetDataState, selectedBudgetIncome, selectedBudgetSpend, selectedBudgetTransactions, selectedPrimaryMortgageSpend, selectedCloseout, selectedCloseoutNote, selectedCycleCashFlow, selectedCycleCoverage, selectedCycleDataLabel, selectedCycleIsLive, selectedCycleLatestDate, selectedCyclePayslip, selectedCycleRentIncome, selectedCycleSalaryIncome, selectedRentalMortgageSpend, selectedEssentialSpend, selectedEveryPoundAllocated, selectedEveryPoundRemaining, selectedFlexibleCashOut, selectedHousingSpend, selectedLifestyleSpend, selectedMortgageHistory, selectedMustPayOut, selectedNonMonthlyCollections, selectedOtherHousingSpend, selectedPayYourselfFirst, selectedPayYourselfFirstProgress, selectedTotalCashOut, selectedTvLicenceSpend, selectedUnreviewed, setBudgetCycle, setCategory, setChallengeBalanceDate, setChallengeBalanceInput, setCloseoutNotes, setMortgageImportTarget, setPeriod, setQuery, setReconcileBalance, setReconcileReason, setStore, setSubcategoryFilter, setTab, setTxView, spendableBalanceReady, spendingPlan, store, subscriptionSpend, subscriptionTransactions, tab, threeMonthFund, togglePaydayAllocations, totals, travelEvidenceByCycle, travelPlan, tvLicenceDirectDebit, typicalRentalMortgage, typicalRentalIncome, updateBalance, updateBudgetPlan, updateMortgagePlanner, updateSinkingFund, variableMonthlyActual, variablePlanMargin, variableSpendSoFar, variableSpendingPlan } = props;
  const planningCash=planningCashPosition(store.balances,store.profile);
  const locale=gbp.resolvedOptions().locale,currency=gbp.resolvedOptions().currency,symbol=gbp.formatToParts(0).find(part=>part.type==="currency")?.value??currency;
  const legacyMonzoConfigured=store.balances.some(balance=>balance.id==="monzo-current");
  const legacyPotPlanning=legacyMonzoConfigured&&store.profile?.origin==="legacy";
  const runwayCashAccounts=planningCash.currentAccounts.map(balance=>({accountId:balance.id,balance:balance.value,balanceKnown:Boolean(balance.asOf)||balance.value!==0,balanceThrough:balance.asOf??store.transactions.filter(row=>transactionAccountId(row,store.imports??[],planningCash.currentAccounts.map(account=>account.id))===balance.id).map(row=>row.date).sort().at(-1)??""}));
  const [fixedCommitmentsOpen,setFixedCommitmentsOpen]=useState(false);
  const {lastPlanCycleKey,nextCyclePlanSummary}=props;
  const selectedRentalOperatingSpend=(props as PlanScreenProps & {selectedRentalOperatingSpend:number}).selectedRentalOperatingSpend;
  const rentalCategory=categoryFor(store.profile,store.profile?.propertyConfig?.rentalCategory??"")?.name??store.profile?.propertyConfig?.rentalCategory;
  const savingsCategory=categoryFor(store.profile,"Savings")?.name??"Savings";
  const reviewCategory=categoryFor(store.profile,"Other")?.name??"Other";
  const reviewSubcategory=categoryFor(store.profile,"Other")?.subcategories.find(item=>item.id==="category:other/subcategory:needs-review")?.name??"Needs review";
  const rentalLabel=rentalCategory?.replace(/ property$/i,"")??"Rental property";
  const homeLabel=store.balances.find(balance=>balance.id==="home")?.name??"Home";
  const activeEmployer=store.profile?.paySchedule?.rules.at(-1)?.employer??"your employer";
  const pensionProvider=store.profile?.planning?.pensionProvider??"Your pension provider";
  const annualSalary=store.profile?.planning?.annualSalary??0;
  const reviewedSpendingSignals=store.reviewedSpendingSignals??[];
  const reviewedSignalIds=new Set(reviewedSpendingSignals.map(signal=>signal.id));
  const feeSignalId=`${selectedBudgetCycle}:fees:${transactionFingerprint(feeTransactions)}`;
  const unclearSignalId=`${selectedBudgetCycle}:unclear:${transactionFingerprint(reviewTransactions)}`;
  const repeatedSignalId=(group:PlanScreenProps["repeatedSmallGroups"][number])=>`${selectedBudgetCycle}:repeat:${group.key}:${transactionFingerprint(group.transactions)}`;
  const debitSignalId=(row:PlanScreenProps["increasedDirectDebits"][number])=>`${selectedBudgetCycle}:debit:${row.key}:${Math.round(row.lastAmount*100)}:${Math.round(row.expected*100)}`;
  const visibleRepeatedSmallGroups=repeatedSmallGroups.filter(group=>!reviewedSignalIds.has(repeatedSignalId(group)));
  const visibleIncreasedDirectDebits=increasedDirectDebits.filter(row=>!reviewedSignalIds.has(debitSignalId(row)));
  const showFeeSignal=feeTransactions.length>0&&!reviewedSignalIds.has(feeSignalId);
  const showUnclearSignal=reviewTransactions.length>0&&!reviewedSignalIds.has(unclearSignalId);
  const reviewedSignalsForCycle=reviewedSpendingSignals.filter(signal=>signal.cycle===selectedBudgetCycle).sort((a,b)=>b.reviewedAt.localeCompare(a.reviewedAt));
  const activeSignalCount=(showFeeSignal?1:0)+visibleRepeatedSmallGroups.length+(showUnclearSignal?1:0)+visibleIncreasedDirectDebits.length;
  const cycleDay=(value:string)=>new Date(`${value}T12:00:00`).getTime();
  const cycleLength=Math.max(1,Math.round((cycleDay(selectedCycleCoverage.bounds.end)-cycleDay(selectedCycleCoverage.bounds.start))/86400000)+1);
  const paceThrough=selectedCycleLatestDate&&selectedCycleLatestDate>=selectedCycleCoverage.bounds.start?selectedCycleLatestDate:selectedCycleCoverage.bounds.start;
  const elapsedDays=Math.max(1,Math.min(cycleLength,Math.round((cycleDay(paceThrough)-cycleDay(selectedCycleCoverage.bounds.start))/86400000)+1));
  const lifestylePacedAllowance=selectedCycleIsLive?lifestyleTotal*(elapsedDays/cycleLength):lifestyleTotal;
  const lifestyleStatus=selectedBudgetDataState==="awaiting"?"neutral":selectedLifestyleSpend>lifestyleTotal+.01?"bad":selectedCycleIsLive&&selectedLifestyleSpend>lifestylePacedAllowance*1.05?"warning":"good";
  const lifestyleStatusLabel=lifestyleStatus==="neutral"?"Awaiting data":lifestyleStatus==="bad"?`${gbp.format(selectedLifestyleSpend-lifestyleTotal)} over`:lifestyleStatus==="warning"?"Ahead of pace":"On track";
  const commitmentsCovered=essentialsTotal+lifestyleTotal+0.01>=nextCyclePlanSummary.fixedCommitments;
  function markSignalReviewed(id:string,title:string,openDetails:()=>void){
    setStore(current=>({...current,reviewedSpendingSignals:[...(current.reviewedSpendingSignals??[]).filter(signal=>signal.id!==id),{id,cycle:selectedBudgetCycle,title,reviewedAt:new Date().toISOString()}],updatedAt:new Date().toISOString().slice(0,10)}));
    openDetails();
  }
  function restoreSignal(id:string){setStore(current=>({...current,reviewedSpendingSignals:(current.reviewedSpendingSignals??[]).filter(signal=>signal.id!==id),updatedAt:new Date().toISOString().slice(0,10)}))}
  return <>
      {tab==="Plan"&&<section className="hub-page">
<article className="hub-hero panel"><div><span className="insight-label">PLAN</span><h2>Make the next unit of income intentional.</h2><p>Budget, goals and long-term decisions live together here. Use the specialist tools only when you need the detail.</p></div><div><span>Money not yet assigned</span><strong>{gbp.format(recommendedPlanBuffer)}</strong><small>After the recommended plan from {gbp.format(planningIncome)} income</small></div></article>
<PlanCashRunway cycleLabel={key=>cycleLabel(key,payday,salaryDates)} cycleOptions={cycleKeys} cycleKey={selectedBudgetCycle} bounds={selectedCycleCoverage.bounds} allTransactions={store.transactions} personalTransactions={selectedBudgetTransactions.filter(transaction=>transaction.amount<0&&!isExcludedFromSpending(transaction)&&!isRentalMortgage(transaction)&&transaction.categoryGroup!=="property"&&transaction.category!==store.profile?.propertyConfig?.rentalCategory)} spendingPlan={spendingPlan} fixedCommitments={fixedCommitments} isLive={selectedCycleIsLive} format={gbp.format} locale={gbp.resolvedOptions().locale} setCycle={setBudgetCycle} openTransactions={()=>{setPeriod(`cycle:${selectedBudgetCycle}`);setTxView("Spending");setTab("Transactions")}} cashAccounts={runwayCashAccounts} imports={store.imports??[]}/>
<div className="hub-grid">
<button className="hub-card" onClick={()=>setTab("Budget")}><span>MONTHLY PLAN</span><h3>Track every amount</h3><strong>{gbp.format(spendingPlan)}</strong><p>Essentials, flexible spending and pay-yourself-first in one salary-cycle plan.</p><b>Open monthly plan →</b></button>
<button className="hub-card" onClick={()=>setTab("Goals")}><span>GOALS</span><h3>Build accessible freedom</h3><strong>{cashProgress.toFixed(0)}%</strong><p>{gbp.format(liquidForEmergency)} after card debt toward the {gbp.format(emergencyGoal.target)} emergency goal.</p><b>Open goals →</b></button>
<button className="hub-card" onClick={()=>setTab("Mortgage")}><span>MORTGAGE</span><h3>Model the trade-off</h3><strong>{mortgageSettings.annualRate.toFixed(2)}%</strong><p>{gbp.format(mortgageSettings.balance)} outstanding. Compare overpaying with investing on equal terms.</p><b>Open mortgage planner →</b></button>
<button className="hub-card" onClick={()=>setTab("Leakage")}><span>SPENDING INSIGHTS</span><h3>Challenge low-value spend</h3><strong>{gbp.format(reviewableSpend)}</strong><p>Reviewable spending in the selected cycle—not a demand to cut what you value.</p><b>Open insights →</b></button>
</div>
</section>}


      {tab==="Budget"&&<section className="budget-dashboard">
        <article className="panel cycle-control-centre">
<div className="cycle-control-head">
<div>
<div className="cycle-title-line">
<span className="insight-label">PAY-CYCLE CONTROL CENTRE</span>
<span className={`cycle-status ${selectedCycleIsLive?"live":selectedBudgetComplete?"complete":"partial"}`}>{selectedCycleIsLive?"Live cycle":selectedBudgetComplete?"Complete cycle":"Partial data"}</span>
</div>
<h2>{cycleLabel(selectedBudgetCycle,payday,salaryDates)}</h2>
<p>See what has actually arrived and left during this salary-to-salary window. Transfers, savings movements and credit-card repayments are excluded from spending.</p>
</div>
<div className="budget-hero-controls cycle-controls">
<label>
<span>Planned net pay</span>
<div className="money-input">
<b>{symbol}</b>
<input aria-label="Planned net pay" type="number" step="50" value={planningIncome} onChange={e=>setStore(s=>({...s,planningIncome:Number(e.target.value)}))}/>
</div>
</label>
<label>
<span>Cycle to review</span>
<select aria-label="Budget cycle" value={budgetCycle} onChange={e=>setBudgetCycle(e.target.value)}>
<option value="latest">Latest tracked cycle</option>{cycleKeys.slice(0,12).map(key=>
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
<div className="budget-source">
<span className="source-live">
<i/>COMPLETE DATA ONLY</span>
<strong>{completedCycleKeys.length} fully covered salary cycles set the evidence baseline</strong>
<span>{completedCycleKeys.length?`${cycleLabel(completedCycleKeys[0],payday,salaryDates)} to ${cycleLabel(completedCycleKeys.at(-1)!,payday,salaryDates)}`:"Import required account activity to build a baseline"}</span>
</div>
        <section className="cycle-operations-grid">
<article className="panel cycle-closeout-panel">
<div className="operation-head">
<div>
<span className="insight-label">PAY-CYCLE CLOSEOUT</span>
<h3>{selectedCloseout?"This cycle has a saved record.":selectedCycleIsLive?"Keep watching—the cycle is still live.":selectedBudgetComplete?"Ready for your sign-off.":"Complete the data before closing."}</h3>
<p>Close a finished cycle to preserve its outcome, your note and a dated net-worth snapshot.</p>
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
<label className="closeout-note">
<span>What should you remember or change next cycle?</span>
<textarea aria-label="Pay-cycle closeout note" value={selectedCloseoutNote} onChange={event=>setCloseoutNotes(notes=>({...notes,[selectedBudgetCycle]:event.target.value}))} placeholder={`For example: Travel was intentional; keep small convenience spending below ${gbp.format(100)} next cycle.`}/>
</label>
{!selectedCycleIsLive&&!selectedCycleCoverage.cardComplete&&selectedCycleCoverage.cardHistoryStarted&&<div className="card-coverage-confirm">
<div>
<span className="insight-label">CREDIT-CARD CHECKPOINT</span>
<strong>Statement timing should not block the closeout.</strong>
<p>Required card activity currently reaches {formatCoverageDate(coverage.cardTo)}. If you have checked every configured credit card and there are no missing purchases, confirm it through {formatCoverageDate(selectedCycleCoverage.bounds.end)}.</p>
</div>
<button className="ghost" onClick={()=>confirmCardCoverageThrough(selectedBudgetCycle)}>Confirm reviewed through {formatCoverageDate(selectedCycleCoverage.bounds.end)}</button>
</div>}
{!selectedCycleIsLive&&selectedCycleCoverage.confirmedCardThrough&&<div className="card-coverage-confirm confirmed">
<div>
<span className="insight-label">CARD ACTIVITY CONFIRMED</span>
<strong>Reviewed through {formatCoverageDate(selectedCycleCoverage.confirmedCardThrough)}</strong>
<p>The imported statement dates and transactions are unchanged. This confirmation only certifies that you reviewed the completed cycle.</p>
</div>
</div>}
<div className="operation-actions">
{selectedCycleIsLive?<button className="ghost" onClick={()=>setBudgetCycle(lastCompletedCycleKey)}>Review the last completed cycle</button>:<button className="primary" disabled={!selectedBudgetComplete} onClick={closeSelectedCycle}>{selectedCloseout?"Refresh closeout & backup":"Close cycle & download backup"}</button>}
{!selectedCycleIsLive&&!selectedBudgetComplete&&(!selectedCycleCoverage.monzoComplete||!selectedCycleCoverage.cardHistoryStarted)&&<button className="ghost" onClick={()=>setTab("Update")}>Import missing activity</button>}
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
        <article className="panel every-pound-allocation">
<div className="panel-head">
<div>
<span className="insight-label">EVERY POUND HAS A JOB</span>
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
<section className="budget-clean-grid">
<details className="panel plan-card plan-editor">
<summary>
<span><b>Next pay-cycle plan</b><small>{gbp.format(essentialsTotal)} essentials · {gbp.format(lifestyleTotal)} lifestyle · {gbp.format(futureTotal)} future you</small></span>
<span className={flexibleBuffer>=0?"plan-balance-chip":"plan-balance-chip over"}>{flexibleBuffer===0?"Every amount assigned":flexibleBuffer>0?`${gbp.format(flexibleBuffer)} buffer`:`${gbp.format(Math.abs(flexibleBuffer))} over income`}</span>
<i>Build plan</i>
</summary>
<div className="plan-editor-content">
<div className="panel-head">
<div>
<h3>Build your next pay-cycle plan</h3>
<p>{lastPlanCycleKey?<>Start with what happened in {cycleLabel(lastPlanCycleKey,payday,salaryDates)}. Known commitments set a floor; you decide the allowance above it. Incomplete cycles are skipped in favour of the most recent fully covered cycle.</>:<>No fully covered cycle is available yet. Known commitments still set a protected floor.</>}</p>
</div>
<button className="text-button" onClick={resetBudgetPlan}>Reset from evidence</button>
</div>
<div className="plan-groups">
<div className="plan-group essential-group">
<div className="plan-group-title">
<span>
<i className="essential"/>Essentials — committed &amp; necessary</span>
<strong>{gbp.format(essentialsTotal)}</strong>
</div>
<div className="essential-commitment-banner">
<span><b>Fixed commitments locked in</b><small>{essentialPlan.reduce((count,item)=>count+item.commitmentDetails.length,0)} known personal commitments due next cycle. This amount must be covered regardless of income.</small></span>
<div className="commitment-banner-status"><span className={`plan-status-chip ${commitmentsCovered?"good":"bad"}`}><i aria-hidden="true"/>{commitmentsCovered?"Fully covered":"Plan below commitments"}</span><strong>{gbpExact.format(nextCyclePlanSummary.fixedCommitments)}</strong></div>
</div>
<div className="essential-plan-cards">{essentialPlan.map(item=>
<article className={item.fixedCommitments?"essential-plan-card committed":"essential-plan-card"} key={item.name}>
<header><span><b>{item.name}</b><small>{item.fixedCommitments?"Committed floor protected":item.explicitlyEdited?"Your saved amount":"Seeded from last cycle"}</small></span><div className="mini-money-input"><span>{symbol}</span><input aria-label={`${item.name} next pay-cycle plan`} type="number" step="0.01" min={item.fixedCommitments} value={item.amount} onChange={e=>updateBudgetPlan(item.name,Math.max(item.fixedCommitments,Number(e.target.value)))}/></div></header>
<div className="essential-card-evidence"><p><span>Last cycle</span><strong>{gbpExact.format(item.lastCycleActual)}</strong></p><p className={item.fixedCommitments?"fixed-evidence":""}><span>Fixed commitments</span><strong>{item.fixedCommitments?gbpExact.format(item.fixedCommitments):"None"}</strong></p><p><span>Additional allowance</span><strong>{gbpExact.format(Math.max(0,item.amount-item.fixedCommitments))}</strong></p></div>
{item.fixedCommitments?<details className="commitment-breakdown inline-breakdown"><summary>See what makes up {gbpExact.format(item.fixedCommitments)}</summary><div>{item.commitmentDetails.map(detail=><p key={detail.key}><span>{detail.label}<small>{detail.source}</small></span><strong>{gbpExact.format(detail.amount)}</strong></p>)}<p className="commitment-total"><span>Total fixed commitments</span><strong>{gbpExact.format(item.fixedCommitments)}</strong></p></div></details>:<small className="variable-essential-note">No fixed payment is known. Your plan is fully adjustable.</small>}
<footer><span>Fixed {gbpExact.format(item.fixedCommitments)}</span><i>+</i><span>Allowance {gbpExact.format(Math.max(0,item.amount-item.fixedCommitments))}</span><i>=</i><strong>Plan {gbpExact.format(item.amount)}</strong></footer>
</article>)}</div></div>
<div className="plan-group lifestyle-group">
<div className="plan-group-title">
<span>
<i className="life"/>Lifestyle — you control this</span>
<span className={`plan-status-chip ${lifestyleStatus}`}><i aria-hidden="true"/>{lifestyleStatusLabel}</span>
<strong>{gbp.format(lifestyleTotal)}</strong>
</div>
<p className="plan-group-note">{gbp.format(selectedLifestyleSpend)} used this cycle. {selectedCycleIsLive?`${gbp.format(lifestylePacedAllowance)} is the paced allowance through ${new Date(`${paceThrough}T12:00:00`).toLocaleDateString(locale,{day:"numeric",month:"short"})}.`:`The completed-cycle allowance was ${gbp.format(lifestyleTotal)}.`} Move freely between categories; the combined envelope is what matters.</p>
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
<i className="future"/>Future you</span>
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
</details>
          <div className="budget-side-stack">
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
<b>{gbp.format(7200)} allocated:</b> {gbp.format(essentialsTotal)} essentials, {gbp.format(lifestyleTotal)} guilt-free life and {gbp.format(futureTotal)} future you.</p>
</div>
<div>
<span className="source-check">
<i/>REFINE THIS</span>
<p>
<b>Subcategories will improve it:</b> {selectedUnreviewed} transaction{selectedUnreviewed===1?"":"s"} still need review for {cycleLabel(selectedBudgetCycle,payday,salaryDates)}.</p>
</div>
</article>
      </section>}


      {tab==="Leakage"&&<section className="leakage-dashboard">
        <article className={`panel leakage-hero state-${selectedBudgetDataState}`}>
<div>
<span className="insight-label">LEAKAGE MONITOR</span>
<h2>{selectedBudgetDataState==="awaiting"?"Awaiting spending data":reviewableSpend?`${gbp.format(reviewableSpend)} worth reviewing`:selectedBudgetDataState==="partial"?"No issue visible in the partial data":"No obvious leakage found"}</h2>
<p>{cycleLabel(selectedBudgetCycle,payday,salaryDates)} · {selectedBudgetDataState==="awaiting"?"Import bank activity before drawing a conclusion.":selectedBudgetDataState==="partial"?"Early signals only—the cycle is not complete.":"signals are prompts to review, not judgements about spending."}</p>
</div>
<div className={selectedBudgetDataState==="awaiting"?"leakage-score waiting":leakageRate>8?"leakage-score high":leakageRate>4?"leakage-score watch":"leakage-score good"}>
<span>Reviewable share</span>
<strong>{selectedBudgetDataState==="awaiting"?"—":`${leakageRate.toFixed(1)}%`}</strong>
<small>{selectedBudgetDataState==="awaiting"?"No cycle spending loaded":"of true cycle spending"}</small>
</div>
</article>
        <div className="leakage-cycle">
<label>Salary cycle<select value={budgetCycle} onChange={event=>setBudgetCycle(event.target.value)}>
<option value="latest">Latest tracked cycle</option>{cycleKeys.slice(0,12).map(key=>
<option key={key} value={key}>{cycleLabel(key,payday,salaryDates)}</option>)}</select>
</label>
<p>Family, housing, cycling and planned travel are not automatically treated as leakage.</p>
</div>
        <section className="leakage-kpis">
<article>
<span>Repeated small spends</span>
<strong>{gbp.format(repeatedSmallSpend)}</strong>
<small>{repeatedSmallGroups.reduce((sum,group)=>sum+group.count,0)} transactions at repeat merchants</small>
</article>
<article>
<span>Subscriptions</span>
<strong>{gbp.format(subscriptionSpend)}</strong>
<small>{subscriptionTransactions.length} payment{subscriptionTransactions.length===1?"":"s"} to review for value</small>
</article>
<article>
<span>Needs review</span>
<strong>{reviewTransactions.length}</strong>
<small>Improve categories before drawing conclusions</small>
</article>
<article>
<span>Possible duplicates</span>
<strong>{duplicateGroups.length}</strong>
<small>Matching provider identity or legacy fingerprint</small>
</article>
</section>
        <section className="leakage-grid">
<article className="panel">
<div className="panel-head">
<div>
<h3>What deserves a look</h3>
<p>Prioritised signals from this salary cycle · opening one marks it reviewed</p>
</div>
</div>
<div className="leak-signal-list">
          {showFeeSignal&&<button onClick={()=>markSignalReviewed(feeSignalId,"Fees or interest",()=>{setQuery("fee");setPeriod(`cycle:${selectedBudgetCycle}`);setCategory("All categories");setTxView("Spending");setTab("Transactions")})}>
<i className="signal-high">!</i>
<span>
<strong>Fees or interest</strong>
<small>{feeTransactions.length} matching transaction{feeTransactions.length===1?"":"s"} · usually avoidable</small>
</span>
<b>{gbp.format(feeTransactions.reduce((sum,transaction)=>sum-transaction.amount,0))}</b>
</button>}
          {visibleRepeatedSmallGroups.slice(0,4).map(group=>
<button key={group.key} onClick={()=>markSignalReviewed(repeatedSignalId(group),group.label,()=>{setQuery(group.label);setPeriod(`cycle:${selectedBudgetCycle}`);setCategory("All categories");setTxView("Spending");setTab("Transactions")})}>
<i className="signal-watch">{group.count}</i>
<span>
<strong>{group.label}</strong>
<small>Repeated small payments · average {gbpExact.format(group.total/group.count)}</small>
</span>
<b>{gbp.format(group.total)}</b>
</button>)}
          {showUnclearSignal&&<button onClick={()=>markSignalReviewed(unclearSignalId,"Unclear categories",()=>{setQuery("");setPeriod(`cycle:${selectedBudgetCycle}`);setCategory(reviewCategory);setSubcategoryFilter(reviewSubcategory);setTxView("Spending");setTab("Transactions")})}>
<i className="signal-review">?</i>
<span>
<strong>Unclear categories</strong>
<small>Classify these before deciding whether they are a leak</small>
</span>
<b>{reviewTransactions.length}</b>
</button>}
          {visibleIncreasedDirectDebits.map(row=>
<button key={row.key} onClick={()=>markSignalReviewed(debitSignalId(row),`${row.label} increased`,()=>{setQuery(row.label);setPeriod(`cycle:${selectedBudgetCycle}`);setCategory("All categories");setTxView("Spending");setTab("Transactions")})}>
<i className="signal-watch">↑</i>
<span>
<strong>{row.label} increased</strong>
<small>Latest collection is above its recent typical amount</small>
</span>
<b>+{gbp.format(row.lastAmount-row.expected)}</b>
</button>)}
          {!activeSignalCount&&<div className="leak-empty">
<strong>You are all caught up</strong>
<span>Reviewed items stay cleared unless new activity creates a fresh signal.</span>
</div>}
        </div>
        {reviewedSignalsForCycle.length>0&&<details className="reviewed-signal-history">
<summary>{reviewedSignalsForCycle.length} reviewed item{reviewedSignalsForCycle.length===1?"":"s"}</summary>
<div>{reviewedSignalsForCycle.map(signal=><div key={signal.id}><span><strong>{signal.title}</strong><small>Reviewed {new Date(signal.reviewedAt).toLocaleDateString(locale,{day:"numeric",month:"short"})}</small></span><button type="button" onClick={()=>restoreSignal(signal.id)}>Restore</button></div>)}</div>
</details>}
</article>
        <article className="panel leakage-guidance">
<span className="insight-label">CUT WITHOUT FEELING RESTRICTED</span>
<h3>Review value, not joy.</h3>
<div>
<b>1</b>
<span>
<strong>Cancel what you forgot</strong>
<small>Check subscriptions first; keep the ones you actively enjoy.</small>
</span>
</div>
<div>
<b>2</b>
<span>
<strong>Put a ceiling on frictionless spend</strong>
<small>Repeated small payments are easier to trim than family time or planned hobbies.</small>
</span>
</div>
<div>
<b>3</b>
<span>
<strong>Fix unclear data</strong>
<small>“Other” is a data problem first, not proof of overspending.</small>
</span>
</div>
<button className="text-button" onClick={()=>{setPeriod(`cycle:${selectedBudgetCycle}`);setCategory("All categories");setTxView("Spending");setTab("Transactions")}}>Review all cycle spending →</button>
</article>
</section>
      </section>}


      {tab==="Goals"&&<article className="panel savings-challenge-panel">
<div className="panel-head">
<div>
<span className="insight-label">AUTOMATED SAVINGS</span>
<h3>Your 2026 savings challenge</h3>
<p>Daily Monzo pot transfers are savings behaviour, not spending. The graph uses your salary-to-salary cycles.</p>
</div>
<div className="savings-challenge-total">
<span>Current pot balance</span>
<strong>{gbpExact.format(savingsChallengeBalance)}</strong>
<small>Anchored {new Date(`${savingsChallengeTracking.syncedThrough}T12:00:00`).toLocaleDateString(locale,{day:"numeric",month:"long",year:"numeric"})} · newer CSV transactions roll it forward</small>
</div>
</div>
<div className="challenge-balance-reconciliation">
<div><span>Reconstructed contributions</span><strong>{gbpExact.format(savingsChallengeTotal)}</strong><small>{currentSavingsChallenge.length} transfers through {latestSavingsChallengeTransfer?.date?new Date(latestSavingsChallengeTransfer.date+"T12:00:00").toLocaleDateString(locale,{day:"numeric",month:"long"}):"the latest import"} · refreshed from every Monzo CSV</small></div>
<div><span>Balance reconciliation</span><strong className={Math.abs(savingsChallengeReconciliation)<.01?"positive":savingsChallengeReconciliation>0?"positive":"negative"}>{savingsChallengeReconciliation>=0?"+":"−"}{gbpExact.format(Math.abs(savingsChallengeReconciliation))}</strong><small>{Math.abs(savingsChallengeReconciliation)<.01?"Live balance and imported history agree":savingsChallengeReconciliation>0?"Live pot is ahead of imported contribution history":"Imported contributions exceed the live pot balance"}</small></div>
<div className="challenge-balance-editor">
<label><span>Verified pot balance</span><div className="money-input"><b>{symbol}</b><input aria-label="Verified savings challenge pot balance" inputMode="decimal" value={challengeBalanceInput} onChange={event=>setChallengeBalanceInput(event.target.value)}/></div></label>
<label><span>As of</span><input aria-label="Savings challenge balance date" type="date" value={challengeBalanceDate} onChange={event=>setChallengeBalanceDate(event.target.value)}/></label>
<button className="primary" onClick={saveSavingsChallengeBalance}>Update balance</button>
</div>
</div>
<div className="challenge-forecast-grid">
<div>
<span>Current daily transfer</span>
<strong>{gbpExact.format(savingsChallengeDailyAmount)}</strong>
<small>Next transfer: {gbpExact.format(savingsChallengeNextDaily)}</small>
</div>
<div>
<span>Next 31 days</span>
<strong>{gbpExact.format(savingsChallengeNext31)}</strong>
<small>If the 4p increase continues</small>
</div>
<div>
<span>Projected 2026 total</span>
<strong>{gbpExact.format(savingsChallengeProjectedYear)}</strong>
<small>Based on the current progression</small>
</div>
<div>
<span>Latest salary cycle saved</span>
<strong>{gbpExact.format(savingsChallengeLatestCycle)}</strong>
<small>Actual imported transfers</small>
</div>
</div>
<div className="savings-challenge-chart" role="img" aria-label="Savings challenge contributions by salary cycle">{savingsChallengeHistory.map(item=>
<div key={item.key} title={`${cycleLabel(item.key,payday,salaryDates)}: ${gbpExact.format(item.total)}`}>
<strong>{gbp.format(item.total)}</strong>
<i style={{height:`${Math.max(6,item.total/maxSavingsChallengeHistory*130)}px`}}/>
<span>{cycleLabel(item.key,payday,salaryDates).split(" – ")[0]}</span>
</div>)}</div>
<details className="chart-data"><summary>View savings challenge data</summary><table><thead><tr><th>Salary cycle</th><th>Saved</th></tr></thead><tbody>{savingsChallengeHistory.map(item=><tr key={item.key}><td>{cycleLabel(item.key,payday,salaryDates)}</td><td>{gbpExact.format(item.total)}</td></tr>)}</tbody></table></details>
<div className="savings-accounting-note">
<i>i</i>
<span>
<b>No double counting:</b> the verified pot balance is a reconciliation figure, not an extra asset. Net worth still uses the cash balances entered under Accounts, so include the pot there only once.</span>
</div>
</article>}
      {tab==="Goals"&&<section className="goals-dashboard">
<section className="goals-grid">{props.goals.map(g=>{const pct=Math.min(g.current/g.target*100,100);const linkedSource=linkedGoalSource(g.id);return <article className="goal-card" key={g.id}>
<div className="goal-ring" role="progressbar" aria-label={`${g.name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} style={{background:`conic-gradient(${g.colour} ${pct}%,#e9ece8 0)`}}>
<i>{pct.toFixed(0)}%</i>
</div>
<h3>{g.name}</h3>
<strong>{gbp.format(g.current)}</strong>
<span>Target {gbp.format(g.target)}</span>
<label>{linkedSource?`Current value · ${linkedSource}`:"Current value"}<input type="number" value={g.current} readOnly={Boolean(linkedSource)} onChange={e=>{if(!linkedSource)setStore(s=>({...s,goals:s.goals.map(x=>x.id===g.id?{...x,current:Number(e.target.value)}:x)}))}}/>
</label>
<label>Target<input type="number" value={g.target} onChange={e=>setStore(s=>({...s,goals:s.goals.map(x=>x.id===g.id?{...x,target:Number(e.target.value)}:x)}))}/>
</label>
</article>})}</section>
<article className="panel sinking-funds-panel">
<div className="panel-head">
<div>
<span className="insight-label">SINKING FUNDS</span>
<h3>Give irregular costs their own balance.</h3>
<p>These monthly amounts are already represented across your budget categories; they are not added on top.</p>
</div>
<strong>{gbp.format((store.sinkingFunds??baselineSinkingFunds).reduce((sum,fund)=>sum+fund.current,0))} saved</strong>
</div>
<div className="sinking-fund-grid">{(store.sinkingFunds??baselineSinkingFunds).map(fund=>{const pct=fund.target?Math.min(100,fund.current/fund.target*100):0;const months=fund.monthly>0?Math.ceil(Math.max(0,fund.target-fund.current)/fund.monthly):0;return <article key={fund.id}>
<div className="sinking-title">
<i style={{background:fund.colour}}/>
<span>
<strong>{fund.name}</strong>
<small>{months?`${months} months at the current pace`:"Target funded"}</small>
</span>
<b>{pct.toFixed(0)}%</b>
</div>
<div className="progress" role="progressbar" aria-label={`${fund.name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
<i style={{width:`${pct}%`,background:fund.colour}}/>
</div>
<div className="sinking-inputs">
<label>
<span>Current</span>
<div>
<b>{symbol}</b>
<input type="number" min="0" value={fund.current} onChange={event=>updateSinkingFund(fund.id,"current",Number(event.target.value))}/>
</div>
</label>
<label>
<span>Target</span>
<div>
<b>{symbol}</b>
<input type="number" min="0" value={fund.target} onChange={event=>updateSinkingFund(fund.id,"target",Number(event.target.value))}/>
</div>
</label>
<label>
<span>Monthly</span>
<div>
<b>{symbol}</b>
<input type="number" min="0" value={fund.monthly} onChange={event=>updateSinkingFund(fund.id,"monthly",Number(event.target.value))}/>
</div>
</label>
</div>
</article>})}</div>
</article>
</section>}


      {tab==="Mortgage"&&<section className="mortgage-dashboard">
        <article className="panel mortgage-hero">
<div>
<span className="insight-label">{homeLabel.toUpperCase()} MORTGAGE PLANNER</span>
<h2>See what every overpayment buys you.</h2>
<p>Use your actual balance, interest rate and contractual payment. The results update instantly and remain private in this browser.</p>
</div>
<div className="mortgage-hero-number">
<span>Outstanding</span>
<strong>{gbpExact.format(mortgageSettings.balance)}</strong>
<button className="text-button" onClick={()=>updateMortgagePlanner("balance",store.balances.find(balance=>balance.id==="mortgage")?.value??mortgageSettings.balance)}>Use Accounts balance</button>
</div>
</article>
        <article className="panel mortgage-import-panel">
<div className="panel-head">
<div>
<span className="insight-label">MORTGAGE STATEMENTS</span>
<h3>Keep balances current from a CSV</h3>
<p>Choose the property, preview the detected balance, then confirm. Imports update Accounts, net worth and the dated balance history without storing account numbers.</p>
</div>
{latestMortgageStatement?<span className="safe-badge">Updated {new Date(latestMortgageStatement.statementDate+"T12:00:00").toLocaleDateString(locale,{day:"numeric",month:"short",year:"numeric"})}</span>:<span className="status-pill amber">No statement yet</span>}
</div>
<div className="mortgage-import-controls">
<label>
<span>Mortgage to update</span>
<select aria-label="Mortgage to update from statement" value={mortgageImportTarget} onChange={event=>setMortgageImportTarget(event.target.value as MortgageAccountId)}>
<option value="mortgage">{store.balances.find(balance=>balance.id==="mortgage")?.name??"Main mortgage"}</option>
<option value="rental-mortgage">{store.balances.find(balance=>balance.id==="rental-mortgage")?.name??"Rental mortgage"}</option>
</select>
</label>
<div className="mortgage-current-balance">
<span>Current tracked balance</span>
<strong>{gbpExact.format(store.balances.find(balance=>balance.id===mortgageImportTarget)?.value??0)}</strong>
<small>{latestMortgageStatement?latestMortgageStatement.fileName:"Entered manually under Accounts"}</small>
{latestMortgageStatement?.interestRate!==undefined&&<em>Statement rate <b>{latestMortgageStatement.interestRate.toFixed(2)}%</b>{latestMortgageStatement.interestRateDate?` from ${new Date(latestMortgageStatement.interestRateDate+"T12:00:00").toLocaleDateString(locale,{day:"numeric",month:"short",year:"numeric"})}`:""}</em>}
</div>
<div className="mortgage-upload-action">
<input ref={mortgageStatementRef} className="visually-hidden" type="file" accept=".csv,text/csv" aria-label="Upload mortgage statement CSV" onChange={event=>{const file=event.target.files?.[0];if(file)void prepareMortgageStatement(file)}}/>
<button className="primary" onClick={()=>mortgageStatementRef.current?.click()}>Upload mortgage CSV</button>
<small>CSV only · previewed before anything changes</small>
</div>
</div>
{importError&&<div className="import-inline-error" role="alert"><strong>Import needs attention</strong><span>{importError}</span></div>}
{selectedMortgageHistory.length>0&&<details className="mortgage-history">
<summary>View {selectedMortgageHistory.length} imported statement{selectedMortgageHistory.length===1?"":"s"}</summary>
<div className="table-wrap"><table><caption>{mortgageImportTarget==="mortgage"?homeLabel:rentalLabel} mortgage balance history</caption><thead><tr><th>Statement date</th><th>Balance</th><th>Rate</th><th>Movement</th><th>File</th></tr></thead><tbody>{selectedMortgageHistory.map((record,index)=>{const older=selectedMortgageHistory[index+1];const movement=older?record.balance-older.balance:undefined;return <tr key={record.id}><td>{new Date(record.statementDate+"T12:00:00").toLocaleDateString(locale)}</td><td className="amount">{gbpExact.format(record.balance)}</td><td>{record.interestRate===undefined?"—":`${record.interestRate.toFixed(2)}%`}</td><td className={movement===undefined?"":"amount "+(movement<=0?"positive":"negative")}>{movement===undefined?"—":`${movement>0?"+":""}${gbpExact.format(movement)}`}</td><td>{record.fileName}</td></tr>})}</tbody></table></div>
</details>}
</article>
        <section className="mortgage-input-grid panel">
<label>
<span>Mortgage balance</span>
<div className="money-input">
<b>{symbol}</b>
<input aria-label="Mortgage balance" type="number" min="0" step="100" value={mortgageSettings.balance} onChange={event=>updateMortgagePlanner("balance",Number(event.target.value))}/>
</div>
</label>
<label>
<span>Interest rate</span>
<div className="suffix-input">
<input aria-label="Mortgage interest rate" type="number" min="0" step=".01" value={mortgageSettings.annualRate} onChange={event=>updateMortgagePlanner("annualRate",Number(event.target.value))}/>
<b>%</b>
</div>
</label>
<label>
<span>Contractual payment</span>
<div className="money-input">
<b>{symbol}</b>
<input aria-label="Contractual monthly payment" type="number" min="0" step="10" value={mortgageSettings.monthlyPayment} onChange={event=>updateMortgagePlanner("monthlyPayment",Number(event.target.value))}/>
</div>
</label>
<label>
<span>Investment return assumption</span>
<div className="suffix-input">
<input aria-label="Investment return assumption" type="number" min="0" step=".1" value={mortgageSettings.investmentReturn} onChange={event=>updateMortgagePlanner("investmentReturn",Number(event.target.value))}/>
<b>%</b>
</div>
</label>
</section>
        <section className="mortgage-scenarios panel">
<div className="panel-head">
<div>
<h3>Choose an overpayment scenario</h3>
<p>Set a monthly amount, an annual lump sum, or combine both.</p>
</div>
<span className="safe-badge">Interactive</span>
</div>
<div className="scenario-row">
<div>
<span>Monthly overpayment</span>
<div className="scenario-chips">{[0,100,250,500].map(value=>
<button key={value} className={mortgageSettings.monthlyOverpayment===value?"active":""} onClick={()=>updateMortgagePlanner("monthlyOverpayment",value)}>{value?`+${gbp.format(value)}`:"None"}</button>)}</div>
</div>
<label>
<span>Custom monthly</span>
<div className="money-input">
<b>{symbol}</b>
<input aria-label="Custom monthly overpayment" type="number" min="0" step="25" value={mortgageSettings.monthlyOverpayment} onChange={event=>updateMortgagePlanner("monthlyOverpayment",Number(event.target.value))}/>
</div>
</label>
<div>
<span>Annual lump sum</span>
<div className="scenario-chips">
<button className={mortgageSettings.annualOverpayment===0?"active":""} onClick={()=>updateMortgagePlanner("annualOverpayment",0)}>None</button>
<button className={mortgageSettings.annualOverpayment===10000?"active":""} onClick={()=>updateMortgagePlanner("annualOverpayment",10000)}>+{gbp.format(10000)}</button>
</div>
</div>
<label>
<span>Custom annual</span>
<div className="money-input">
<b>{symbol}</b>
<input aria-label="Custom annual overpayment" type="number" min="0" step="500" value={mortgageSettings.annualOverpayment} onChange={event=>updateMortgagePlanner("annualOverpayment",Number(event.target.value))}/>
</div>
</label>
</div>
</section>
        {!baseMortgage.valid?<article className="panel mortgage-warning">
<strong>The contractual payment does not cover the monthly interest.</strong>
<span>Check the balance, rate and payment before using this illustration.</span>
</article>:<>
<section className="mortgage-results">
<article>
<span>Current mortgage-free date</span>
<strong>{mortgageDate(baseMortgage.months)}</strong>
<small>{Math.floor(baseMortgage.months/12)} years {baseMortgage.months%12} months</small>
</article>
<article className="result-accent">
<span>New mortgage-free date</span>
<strong>{mortgageDate(plannedMortgage.months)}</strong>
<small>{mortgageMonthsSaved?`${Math.floor(mortgageMonthsSaved/12)} years ${mortgageMonthsSaved%12} months earlier`:"No change yet"}</small>
</article>
<article>
<span>Interest saved</span>
<strong>{gbp.format(mortgageInterestSaved)}</strong>
<small>{gbp.format(baseMortgage.interest)} baseline interest</small>
</article>
<article>
<span>Payments removed</span>
<strong>{mortgageMonthsSaved}</strong>
<small>monthly mortgage payments</small>
</article>
</section>
        <section className="two-col mortgage-main">
<article className="panel">
<div className="panel-head">
<div>
<h3>Balance falling over time</h3>
<p>Annual snapshots under the current payment and your selected plan</p>
</div>
<span className="mortgage-legend">
<i/>Current <i/>Overpay</span>
</div>
<div className="mortgage-chart" role="img" aria-label="Mortgage balance comparison between contractual payments and selected overpayments">{mortgageChartYears.map(year=>{const base=baseMortgage.balances[year]??0;const planned=plannedMortgage.balances[year]??0;return <div key={year} title={`${year===0?"Now":`Year ${year}`}: current plan ${gbp.format(base)}, overpayment plan ${gbp.format(planned)}`}>
<span>{year===0?"Now":`Y${year}`}</span>
<div>
<i className="base" style={{height:`${Math.max(2,base/mortgageSettings.balance*150)}px`}}/>
<i className="plan" style={{height:`${Math.max(2,planned/mortgageSettings.balance*150)}px`}}/>
</div>
<small>{gbp.format(planned)}</small>
</div>})}</div>
<details className="chart-data"><summary>View mortgage balance data</summary><table><thead><tr><th>Year</th><th>Contractual plan</th><th>Overpayment plan</th></tr></thead><tbody>{mortgageChartYears.map(year=><tr key={year}><td>{year===0?"Now":year}</td><td>{gbp.format(baseMortgage.balances[year]??0)}</td><td>{gbp.format(plannedMortgage.balances[year]??0)}</td></tr>)}</tbody></table></details>
</article>
<article className="panel mortgage-tradeoff">
<span className="insight-label">OVERPAY OR INVEST?</span>
<h3>A fair, like-for-like comparison</h3>
<p>Both routes use exactly the same extra cash. The illustration runs to the original mortgage-free date and separates your invested contributions from uncertain market growth.</p>
<div className="mortgage-comparison-grid">
<section>
<span>OVERPAY ROUTE</span>
<strong>{gbp.format(mortgageInterestSaved)}</strong>
<small>Guaranteed interest avoided at a {mortgageSettings.annualRate.toFixed(2)}% mortgage rate</small>
<dl><div><dt>Mortgage-free earlier</dt><dd>{mortgageMonthsSaved} months</dd></div><div><dt>Investing freed payments afterwards</dt><dd>{gbp.format(investedAfterEarlyPayoff)}</dd></div></dl>
</section>
<section>
<span>INVEST ROUTE</span>
<strong>{gbp.format(investedAlternative)}</strong>
<small>Illustrative pot at {mortgageSettings.investmentReturn}%—not guaranteed</small>
<dl><div><dt>Your contributions</dt><dd>{gbp.format(investmentContributions)}</dd></div><div><dt>Illustrative growth</dt><dd>{gbp.format(investmentGrowth)}</dd></div></dl>
</section>
</div>
<div className="mortgage-break-even"><span>Guaranteed equivalent return from overpaying</span><strong>{mortgageSettings.annualRate.toFixed(2)}%</strong><small>Before considering investment fees, tax, volatility or the value of keeping money accessible.</small></div>
<small>Investment returns are uncertain and this is not a recommendation. Check your lender&apos;s annual overpayment allowance before acting.</small>
</article>
</section>
</>}
        <article className="panel mortgage-guidance">
<div>
<span className="insight-label">YOUR DECISION ORDER</span>
<h3>Liquidity first, then optimisation.</h3>
<p>With your pension already strong, the decision is not simply mortgage versus market return. Accessible cash still gives you the most resilience.</p>
</div>
<div className="mortgage-priorities">
<span>
<b>1</b>Clear expensive card debt</span>
<span>
<b>2</b>Build cash toward {gbp.format(15000)}</span>
<span>
<b>3</b>Check lender overpayment limits</span>
<span>
<b>4</b>Split surplus between ISA and mortgage</span>
</div>
</article>
      </section>}

  </>;
}
