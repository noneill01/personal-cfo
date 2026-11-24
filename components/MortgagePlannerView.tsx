"use client";

import type { MortgageAccountId } from "../lib/types";

import type { PlanScreenProps } from "../lib/screen-props";


import { categoryFor } from "../lib/categories";




export default function MortgagePlannerView(props: Pick<PlanScreenProps, "baseMortgage" | "gbp" | "gbpExact" | "importError" | "investedAfterEarlyPayoff" | "investedAlternative" | "investmentContributions" | "investmentGrowth" | "latestMortgageStatement" | "mortgageChartYears" | "mortgageDate" | "mortgageImportTarget" | "mortgageInterestSaved" | "mortgageMonthsSaved" | "mortgageSettings" | "mortgageStatementRef" | "plannedMortgage" | "prepareMortgageStatement" | "selectedMortgageHistory" | "setMortgageImportTarget" | "store" | "updateMortgagePlanner">) {
const { baseMortgage, gbp, gbpExact, importError, investedAfterEarlyPayoff, investedAlternative, investmentContributions, investmentGrowth, latestMortgageStatement, mortgageChartYears, mortgageDate, mortgageImportTarget, mortgageInterestSaved, mortgageMonthsSaved, mortgageSettings, mortgageStatementRef, plannedMortgage, prepareMortgageStatement, selectedMortgageHistory, setMortgageImportTarget, store, updateMortgagePlanner } = props;
const locale = gbp.resolvedOptions().locale, currency = gbp.resolvedOptions().currency, symbol = gbp.formatToParts(0).find(part => part.type === "currency")?.value ?? currency;
const rentalCategory = categoryFor(store.profile, store.profile?.propertyConfig?.rentalCategory ?? "")?.name ?? store.profile?.propertyConfig?.rentalCategory;
const rentalLabel = rentalCategory?.replace(/ property$/i, "") ?? "Rental property";
const homeLabel = store.balances.find(balance => balance.id === "home")?.name ?? "Home";
return (<section className="mortgage-dashboard">
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
<b>2</b>Build your emergency reserve</span>
<span>
<b>3</b>Check lender overpayment limits</span>
<span>
<b>4</b>Split surplus between ISA and mortgage</span>
</div>
</article>
      </section>);
}
