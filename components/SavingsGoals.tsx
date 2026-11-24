"use client";

import {useState} from "react";

import { linkedGoalSource } from "../lib/goals";
import type { PlanScreenProps } from "../lib/screen-props";







export default function SavingsGoals(props: Pick<PlanScreenProps, "goals" | "baseMortgage" | "baselineSinkingFunds" | "challengeBalanceDate" | "challengeBalanceInput" | "currentSavingsChallenge" | "cycleLabel" | "gbp" | "gbpExact" | "importError" | "investedAfterEarlyPayoff" | "investedAlternative" | "investmentContributions" | "investmentGrowth" | "latestMortgageStatement" | "latestSavingsChallengeTransfer" | "maxSavingsChallengeHistory" | "mortgageChartYears" | "mortgageDate" | "mortgageImportTarget" | "mortgageInterestSaved" | "mortgageMonthsSaved" | "mortgageSettings" | "mortgageStatementRef" | "payday" | "plannedMortgage" | "prepareMortgageStatement" | "salaryDates" | "saveSavingsChallengeBalance" | "savingsChallengeBalance" | "savingsChallengeDailyAmount" | "savingsChallengeHistory" | "savingsChallengeLatestCycle" | "savingsChallengeNext31" | "savingsChallengeNextDaily" | "savingsChallengeProjectedYear" | "savingsChallengeReconciliation" | "savingsChallengeTotal" | "savingsChallengeTracking" | "selectedMortgageHistory" | "setChallengeBalanceDate" | "setChallengeBalanceInput" | "setMortgageImportTarget" | "setStore" | "store" | "tab" | "updateMortgagePlanner" | "updateSinkingFund">) {
const { baselineSinkingFunds, challengeBalanceDate, challengeBalanceInput, currentSavingsChallenge, cycleLabel, gbp, gbpExact, latestSavingsChallengeTransfer, maxSavingsChallengeHistory, payday, salaryDates, saveSavingsChallengeBalance, savingsChallengeBalance, savingsChallengeDailyAmount, savingsChallengeHistory, savingsChallengeLatestCycle, savingsChallengeNext31, savingsChallengeNextDaily, savingsChallengeProjectedYear, savingsChallengeReconciliation, savingsChallengeTotal, savingsChallengeTracking, setChallengeBalanceDate, setChallengeBalanceInput, setStore, store, tab, updateSinkingFund } = props;
const [challengeOpen,setChallengeOpen]=useState(true);
const locale = gbp.resolvedOptions().locale, currency = gbp.resolvedOptions().currency, symbol = gbp.formatToParts(0).find(part => part.type === "currency")?.value ?? currency;



return (<><header className="section-title"><div><span className="insight-label">SAVINGS</span><h2>1p savings challenge & goals</h2><p>Your automated challenge, savings targets and irregular-cost funds in one place.</p></div></header><details className="overview-more" open={challengeOpen} onToggle={event=>setChallengeOpen(event.currentTarget.open)}><summary><span><b>1p savings challenge</b><small>Current balance, contributions and projection</small></span><i>{challengeOpen?"Hide":"View"}</i></summary><article className="panel savings-challenge-panel">
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
</article></details>

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



</>);
}
