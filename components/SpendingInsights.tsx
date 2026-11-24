"use client";



import type { PlanScreenProps } from "../lib/screen-props";


import { categoryFor } from "../lib/categories";



function transactionFingerprint(transactions: Array<{
    id: string;
}>) {
    const value = transactions.map(transaction => transaction.id).sort().join("|");
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

export default function SpendingInsights(props: Pick<PlanScreenProps, "budgetCycle" | "cycleKeys" | "cycleLabel" | "duplicateGroups" | "feeTransactions" | "gbp" | "gbpExact" | "increasedDirectDebits" | "leakageRate" | "payday" | "repeatedSmallGroups" | "repeatedSmallSpend" | "reviewTransactions" | "reviewableSpend" | "salaryDates" | "selectedBudgetCycle" | "selectedBudgetDataState" | "setBudgetCycle" | "setCategory" | "setPeriod" | "setQuery" | "setStore" | "setSubcategoryFilter" | "setTab" | "setTxView" | "store" | "subscriptionSpend" | "subscriptionTransactions">) {
const { budgetCycle, cycleKeys, cycleLabel, duplicateGroups, feeTransactions, gbp, gbpExact, increasedDirectDebits, leakageRate, payday, repeatedSmallGroups, repeatedSmallSpend, reviewTransactions, reviewableSpend, salaryDates, selectedBudgetCycle, selectedBudgetDataState, setBudgetCycle, setCategory, setPeriod, setQuery, setStore, setSubcategoryFilter, setTab, setTxView, store, subscriptionSpend, subscriptionTransactions } = props;
const locale = gbp.resolvedOptions().locale;
const reviewCategory = categoryFor(store.profile, "Other")?.name ?? "Other";
const reviewSubcategory = categoryFor(store.profile, "Other")?.subcategories.find(item => item.id === "category:other/subcategory:needs-review")?.name ?? "Needs review";
const reviewedSpendingSignals = store.reviewedSpendingSignals ?? [];
const reviewedSignalIds = new Set(reviewedSpendingSignals.map(signal => signal.id));
const feeSignalId = `${selectedBudgetCycle}:fees:${transactionFingerprint(feeTransactions)}`;
const unclearSignalId = `${selectedBudgetCycle}:unclear:${transactionFingerprint(reviewTransactions)}`;
const repeatedSignalId = (group: PlanScreenProps["repeatedSmallGroups"][number]) => `${selectedBudgetCycle}:repeat:${group.key}:${transactionFingerprint(group.transactions)}`;
const debitSignalId = (row: PlanScreenProps["increasedDirectDebits"][number]) => `${selectedBudgetCycle}:debit:${row.key}:${Math.round(row.lastAmount * 100)}:${Math.round(row.expected * 100)}`;
const visibleRepeatedSmallGroups = repeatedSmallGroups.filter(group => !reviewedSignalIds.has(repeatedSignalId(group)));
const visibleIncreasedDirectDebits = increasedDirectDebits.filter(row => !reviewedSignalIds.has(debitSignalId(row)));
const showFeeSignal = feeTransactions.length > 0 && !reviewedSignalIds.has(feeSignalId);
const showUnclearSignal = reviewTransactions.length > 0 && !reviewedSignalIds.has(unclearSignalId);
const reviewedSignalsForCycle = reviewedSpendingSignals.filter(signal => signal.cycle === selectedBudgetCycle).sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt));
const activeSignalCount = (showFeeSignal ? 1 : 0) + visibleRepeatedSmallGroups.length + (showUnclearSignal ? 1 : 0) + visibleIncreasedDirectDebits.length;
function markSignalReviewed(id: string, title: string, openDetails: () => void) {
    setStore(current => ({ ...current, reviewedSpendingSignals: [...(current.reviewedSpendingSignals ?? []).filter(signal => signal.id !== id), { id, cycle: selectedBudgetCycle, title, reviewedAt: new Date().toISOString() }], updatedAt: new Date().toISOString().slice(0, 10) }));
    openDetails();
}
function restoreSignal(id: string) { setStore(current => ({ ...current, reviewedSpendingSignals: (current.reviewedSpendingSignals ?? []).filter(signal => signal.id !== id), updatedAt: new Date().toISOString().slice(0, 10) })); }
return (<section className="leakage-dashboard">
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
      </section>);
}
