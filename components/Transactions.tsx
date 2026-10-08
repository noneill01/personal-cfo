"use client";

import type { TransactionsScreenProps } from "../lib/screen-props";
import type { SpendingTreatment } from "../lib/types";
import { configuredAccountCoverage } from "../lib/coverage";
import { categoryFor } from "../lib/categories";

export default function Transactions(props: TransactionsScreenProps) {
  const { accountFilter, allBusinessExpenses, applyMerchantClassification, availableSubcategories, breakdownSpend, categories, category, coverage, currentCycleKey, cycleAnnotations, cycleBounds, cycleKeys, cycleLabel, displayedTransactions, filtered, gbp, gbpExact, income, inferSubcategory, isInternalPotTransfer, latestDataCycleKey, maxCategory, maxMonth, monthly, payday, period, periodTransactions, query, salaryDates, selectedBusinessExpenses, selectedPeriodLabel, setAccountFilter, setCategory, setNewSubcategory, setPeriod, setQuery, setSubcategoryDialog, setSubcategoryFilter, setTab, setTxLimit, setTxView, spending, spendingTreatmentFor, store, subcategoryFilter, subcategorySpend, tab, txLimit, txView, uncategorised, updateSpendingTreatment } = props;
  const locale=gbp.resolvedOptions().locale,currency=gbp.resolvedOptions().currency;
  const accountCoverage=configuredAccountCoverage(store);
  const relevantAccounts=[...accountCoverage.required,...accountCoverage.optional];
  const cycleStart=cycleBounds(currentCycleKey,payday,salaryDates).start;
  const missingCoverage=accountCoverage.required.filter(account=>!account.to||account.to<cycleStart||account.gaps.some(gap=>gap.to>=cycleStart));
  const now=new Date();
  const currentTaxYearStart=now.getMonth()>3||(now.getMonth()===3&&now.getDate()>=6)?now.getFullYear():now.getFullYear()-1;
  const taxYearStart=`${currentTaxYearStart}-04-06`;
  const taxYearEnd=`${currentTaxYearStart+1}-04-05`;
  const taxYearLabel=`${currentTaxYearStart}/${String(currentTaxYearStart+1).slice(-2)}`;
  const rentalCategoryConfig=categoryFor(store.profile,store.profile?.propertyConfig?.rentalCategory??"")??store.profile?.categories?.find(item=>item.group==="property"&&item.enabled);
  const rentalCategory=rentalCategoryConfig?.name??store.profile?.propertyConfig?.rentalCategory;
  const activeEmployer=store.profile?.paySchedule?.rules.at(-1)?.employer;
  const rentalPropertyTaxYearCosts=store.transactions.filter(transaction=>transaction.amount<0&&(rentalCategoryConfig?transaction.categoryId===rentalCategoryConfig.id:Boolean(rentalCategory&&transaction.category===rentalCategory))&&transaction.date>=taxYearStart&&transaction.date<=taxYearEnd);
  const rentalPropertyTaxYearTotal=rentalPropertyTaxYearCosts.reduce((sum,transaction)=>sum-transaction.amount,0);
  const selectedRentalPropertyTotal=periodTransactions.filter(transaction=>transaction.amount<0&&(rentalCategoryConfig?transaction.categoryId===rentalCategoryConfig.id:Boolean(rentalCategory&&transaction.category===rentalCategory))).reduce((sum,transaction)=>sum-transaction.amount,0);
  function exportRentalPropertyCosts(){
    const csvCell=(value:string|number)=>{const raw=String(value);const safe=typeof value==="string"&&/^[=+\-@]/.test(raw)?`'${raw}`:raw;return `"${safe.replace(/"/g,'""')}"`};
    const header=["Date","Merchant","Account","Category","Subcategory",`Amount ${currency}`,"Spending treatment","Review note"];
    const rows=rentalPropertyTaxYearCosts.sort((a,b)=>a.date.localeCompare(b.date)).map(transaction=>[transaction.date,transaction.merchant,transaction.account,transaction.category,transaction.subcategory||inferSubcategory(transaction.category,transaction.merchant),Math.abs(transaction.amount).toFixed(2),spendingTreatmentFor(transaction),transaction.subcategory==="Capital improvements — review"?"Review as possible capital expenditure":"Keep evidence and confirm allowable tax treatment"]);
    const blob=new Blob([[header,...rows].map(row=>row.map(csvCell).join(",")).join("\n")],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=`rental-costs-${taxYearLabel.replace("/","-")}.csv`;link.click();URL.revokeObjectURL(url);
  }
  return <>
      {tab==="Transactions"&&<section className="transactions-page">
        <article className="panel transaction-head">
<div className="transaction-heading">
<div>
<span className="insight-label">TRANSACTION CONTROL CENTRE</span>
<h2>Your money, without the noise.</h2>
<p>Start with real spending, then open all activity only when you need it.</p>
</div>
<div className="coverage-badge">
<span>DATA COVERAGE</span>
<strong>{store.transactions.length.toLocaleString(locale)} records</strong>
<small>{coverage.from&&coverage.to?`${new Date(coverage.from+"T12:00:00").toLocaleDateString(locale,{day:"numeric",month:"short",year:"numeric"})} – ${new Date(coverage.to+"T12:00:00").toLocaleDateString(locale,{day:"numeric",month:"short",year:"numeric"})}`:"No imported history"}</small>
</div>
</div>
          <div className="source-strip">
{relevantAccounts.map(account=><div key={account.accountId}>
<i className={`source-dot ${account.kind==="credit-card"?"card":"monzo"}`}/>
<span>{account.name}</span>
<strong>{account.count.toLocaleString(locale)}</strong>
</div>)}
<div>
<i className="source-dot manual"/>
<span>Manual</span>
<strong>{(coverage.accounts.Manual??0).toLocaleString(locale)}</strong>
</div>
<button onClick={()=>setTab("Update")}>Import newer data →</button>
</div>
          {missingCoverage.length>0&&<div className="data-gap">
<b>Data check</b>
<span>{missingCoverage.map(account=>`${account.name}: ${account.to?`activity through ${new Date(account.to+"T12:00:00").toLocaleDateString(locale,{day:"numeric",month:"long"})}`:"no transactions loaded"}${account.gaps.length?"; check the gap in imported dates":""}`).join(" · ")}. Import or review the missing account activity to make this cycle complete.</span>
</div>}
          <div className="transaction-controls">
<div className="view-switch" role="group" aria-label="Transaction view">{(["Spending","Savings","Work expenses","All activity","Income"] as const).map(view=>
<button key={view} className={txView===view?"active":""} onClick={()=>{setTxView(view);setTxLimit(30)}}>{view}</button>)}{rentalCategory&&<button className={category===rentalCategory?"active property-view":"property-view"} onClick={()=>{setTxView("Spending");setCategory(rentalCategory);setSubcategoryFilter("All subcategories");setTxLimit(30)}}>{rentalCategory}</button>}</div>
<div className="filter-bar">
<label className="search-box">
<span aria-hidden="true">⌕</span>
<span className="sr-only">Search transactions by merchant or account</span>
<input aria-label="Search transactions by merchant or account" placeholder="Search merchant or account" value={query} onChange={e=>{setQuery(e.target.value);setTxLimit(30)}}/>
</label>
<select aria-label="Transaction account" value={accountFilter} onChange={e=>{setAccountFilter(e.target.value);setTxLimit(30)}}>
<option value="All accounts">All accounts</option>
<option value="Barclaycard">Credit card</option>
<option value="Monzo">Monzo</option>
<option value="Manual">Manual entries</option>
</select>
<select aria-label="Transaction category" value={category} onChange={e=>{setCategory(e.target.value);setSubcategoryFilter("All subcategories");setTxLimit(30)}}>
<option>All categories</option>{categories.map(c=>
<option key={c} value={c}>{c}</option>)}</select>
<select aria-label="Transaction subcategory" value={subcategoryFilter} disabled={category==="All categories"} onChange={e=>{setSubcategoryFilter(e.target.value);setTxLimit(30)}}>
<option>All subcategories</option>{category!=="All categories"&&(availableSubcategories[category]??[]).map(item=>
<option key={item}>{item}</option>)}</select>
<button className="new-subcategory-button" disabled={category==="All categories"} onClick={()=>{setSubcategoryDialog({category});setNewSubcategory("")}}>＋ New subcategory</button>
<select aria-label="Salary cycle" value={period} onChange={e=>{setPeriod(e.target.value);setTxLimit(30)}}>
<option>Current pay cycle</option>
<option>Last completed pay cycle</option>
<option>Latest imported pay cycle</option>{cycleKeys.slice(0,12).map(key=>
<option key={key} value={`cycle:${key}`}>{cycleLabel(key,payday,salaryDates)}</option>)}<option>3 months</option>
<option>6 months</option>
<option>12 months</option>
<option>All data</option>
</select>
</div>
</div>
          <div className="transaction-kpis">
<div className="income-tile">
<span>Money in</span>
<strong>{gbp.format(income)}</strong>
<small>Selected period</small>
</div>
<div className="spend-tile">
<span>True spending</span>
<strong>{gbp.format(spending)}</strong>
<small>Transfers and card repayments excluded</small>
</div>
<div className="net-tile">
<span>Net cash flow</span>
<strong className={income-spending>=0?"positive":""}>{income-spending>=0?"+":""}{gbp.format(income-spending)}</strong>
<small>{selectedPeriodLabel}</small>
</div>
<button className="review-tile" onClick={()=>{setTxView("Spending");setCategory(categoryFor(store.profile,"Other")?.name??"Other");setSubcategoryFilter(categoryFor(store.profile,"Other")?.subcategories.find(item=>item.id==="category:other/subcategory:needs-review")?.name??"Needs review");setTxLimit(30)}}>
<span>Needs review</span>
<strong>{uncategorised}</strong>
<small>Uncategorised costs →</small>
</button>
</div>
          {rentalCategory&&category===rentalCategory&&<section className="rental-property-expense-summary" aria-label={`${rentalCategory} spending summary`}>
<div><span>{rentalCategory.toUpperCase()}</span><h3>Rental costs, kept separate.</h3><p>Use a specific subcategory for each cost and retain the receipt or invoice. This register supports your tax working papers; it does not assume every item is tax-deductible.</p></div>
<div><span>Selected period</span><strong>{gbpExact.format(selectedRentalPropertyTotal)}</strong><small>{selectedPeriodLabel}</small></div>
<div><span>Tax year {taxYearLabel}</span><strong>{gbpExact.format(rentalPropertyTaxYearTotal)}</strong><small>{rentalPropertyTaxYearCosts.length} recorded cost{rentalPropertyTaxYearCosts.length===1?"":"s"}</small></div>
<button className="primary" disabled={!rentalPropertyTaxYearCosts.length} onClick={exportRentalPropertyCosts}>Export tax-year CSV</button>
</section>}
          {txView==="Work expenses"&&<section className="work-expense-summary" aria-label="Work expense reimbursement position">
<div className="work-expense-copy">
<span>{activeEmployer?`${activeEmployer.toUpperCase()} EXPENSES`:"WORK EXPENSES"}</span>
<h3>Keep business travel out of your personal budget.</h3>
<p>Mark card purchases as <b>Reimbursable business</b>. When your employer repays you, categorise that incoming transaction as <b>Business expenses › Reimbursement</b>.</p>
</div>
<div><span>Spent this period</span><strong>{gbpExact.format(selectedBusinessExpenses.spent)}</strong></div>
<div><span>Repaid this period</span><strong>{gbpExact.format(selectedBusinessExpenses.reimbursed)}</strong></div>
<div className={allBusinessExpenses.outstanding>0?"outstanding":"settled"}><span>Still owed to you</span><strong>{gbpExact.format(allBusinessExpenses.outstanding)}</strong><small>Across all imported history</small></div>
<small className="work-expense-guidance">If the repayment description is also used for salary, choose <b>Just this transaction</b> when categorising it. Work costs remain visible in card debt until repayment, but are excluded from personal spending and income.</small>
</section>}
        </article>
        <div className="cycle-context">
<span>{period==="Current pay cycle"?"LIVE SALARY CYCLE":period==="Last completed pay cycle"?"LAST COMPLETED SALARY CYCLE":"SELECTED SALARY CYCLE"}</span>
<strong>{selectedPeriodLabel}</strong>
<small>{period==="Current pay cycle"?"Begins when salary reaches your account and remains open until the day before the next payday.":"A complete payday-to-payday view—not a calendar month."}</small>
</div>
        <section className="transaction-insights">
<article className="panel">
<div className="panel-head">
<div>
<h3>{category==="All categories"?"Where spending went":`Inside ${category}`}</h3>
<p>{period==="Latest pay cycle"?cycleLabel(latestDataCycleKey,payday,salaryDates):period.startsWith("cycle:")?cycleLabel(period.slice(6),payday,salaryDates):period} · {category==="All categories"?"click a category to drill down":"subcategory breakdown"}</p>
</div>
<strong>{gbp.format(category==="All categories"?spending:subcategorySpend.reduce((sum,[,value])=>sum+value,0))}</strong>
</div>
<div className="category-bars transaction-category-bars">{breakdownSpend.map(([name,value])=>
<button key={name} onClick={()=>{if(category==="All categories"){setCategory(name);setSubcategoryFilter("All subcategories")}else setSubcategoryFilter(name);setTxView("Spending");setTxLimit(30)}}>
<span>{name}</span>
<div>
<i style={{width:`${value/maxCategory*100}%`}}/>
</div>
<strong>{gbp.format(value)}</strong>
<small>{(category==="All categories"?spending:subcategorySpend.reduce((sum,[,v])=>sum+v,0))?`${(value/(category==="All categories"?spending:subcategorySpend.reduce((sum,[,v])=>sum+v,0))*100).toFixed(0)}%`:"0%"}</small>
</button>)}</div>{category!=="All categories"&&<button className="drill-back" onClick={()=>{setCategory("All categories");setSubcategoryFilter("All subcategories")}}>← Back to all categories</button>}</article>
<article className="panel">
<div className="panel-head">
<div>
<h3>Pay cycle by pay cycle</h3>
<p>Salary paid in each payroll month plus any net savings used, compared with spending in its 28th–27th cycle</p>
</div>
<span className="legend">
<i className="income-dot"/>Salary <i className="savings-dot"/>Savings used <i className="spend-dot"/>Spend</span>
</div>
<div className="mini-cycle-chart" role="group" aria-label="Choose a salary cycle">{monthly.map(([key,value])=>{const bounds=cycleBounds(key,payday,salaryDates);const startLabel=new Date(bounds.start+"T12:00:00").toLocaleDateString(locale,{day:"numeric",month:"short"});const live=key===currentCycleKey;const annotation=cycleAnnotations[key];const incomeHeight=value.salaryIncome?Math.max(value.salaryIncome/maxMonth*120,2):0;const savingsHeight=value.savingsUsed?Math.max(value.savingsUsed/maxMonth*120,2):0;return <button className={`${period===`cycle:${key}`?"selected ":""}${live?"live-cycle ":""}${annotation&&annotation.kind!=="Normal"?"annotated-cycle":""}`} aria-label={`${key}: salary paid ${gbp.format(value.salaryIncome)}, savings used ${gbp.format(value.savingsUsed)}, spending ${gbp.format(value.spend)}${annotation?`, ${annotation.kind}`:""}`} title={`${key} payroll · Salary ${gbp.format(value.salaryIncome)} · ${cycleLabel(key,payday,salaryDates)} spending ${gbp.format(value.spend)} · Savings used ${gbp.format(value.savingsUsed)}${annotation?` · ${annotation.title||annotation.kind}`:""}`} key={key} onClick={()=>{setPeriod(`cycle:${key}`);setTxLimit(30)}}>
<span>{startLabel}</span>
<div>
<span className={`funding-stack ${value.savingsUsed?"with-savings":""}`} aria-hidden="true">
{value.savingsUsed>0&&<i className="savings-used" style={{height:`${savingsHeight}px`}}/>}
<i className="income" style={{height:`${incomeHeight}px`}}/>
</span>
<i className="spend" style={{height:`${Math.max(value.spend/maxMonth*120,2)}px`}}/>
</div>
<small>{live?"Live":gbp.format(value.spend)}</small>{annotation&&annotation.kind!=="Normal"&&<em>{annotation.kind}</em>}
</button>})}</div>
<p className="cycle-funding-note">Salary is grouped by the month shown on its payslip, so August includes both transition payrolls. Savings used is a net withdrawal from genuine savings in that cycle; bills-pot releases and credit-card repayments remain excluded.</p>
</article>
</section>
        <article className="panel activity-panel">
<div className="activity-title">
<div>
<h3>{txView}</h3>
<p>Showing {Math.min(txLimit,filtered.length)} of {filtered.length.toLocaleString(locale)} matching · {periodTransactions.length.toLocaleString(locale)} records in period</p>
</div>
<span>Every edit asks: one-off, going forward, or all history</span>
</div>
<div className="activity-list">{displayedTransactions.map((t,i)=>{const previous=displayedTransactions[i-1];const showDate=!previous||previous.date!==t.date;const catClass=t.category.toLowerCase().replace(/[^a-z]+/g,"-");const txSubcategory=t.subcategory||inferSubcategory(t.category,t.merchant);const lockedTransfer=isInternalPotTransfer(t);const treatment=spendingTreatmentFor(t);return <div key={t.id}>{showDate&&<div className="date-divider">
<span>{new Date(t.date+"T12:00:00").toLocaleDateString(locale,{weekday:"short",day:"numeric",month:"long"})}</span>
<i/>
</div>}<div className="activity-row">
<div className={`category-icon cat-${catClass}`}>{t.category.slice(0,1)}</div>
<div className="activity-copy">
<strong>{t.merchant}</strong>
<span>{t.account}{t.transactionTime?` · ${t.transactionTime.slice(0,5)}`:""} · {t.category} › {txSubcategory}</span>
{t.reference&&<small>{t.reference}</small>}
</div>
<div className="classification-controls">
<select aria-label={`Category for ${t.merchant}`} title={lockedTransfer?"Monzo pot transfers are automatically excluded from spending":undefined} disabled={lockedTransfer} className={`category-select cat-${catClass}`} value={t.category} onChange={e=>applyMerchantClassification(t.id,e.target.value)}>{categories.map(c=>
<option key={c}>{c}</option>)}</select>
<div className="subcategory-control">
<select aria-label={`Subcategory for ${t.merchant}`} title={lockedTransfer?"Monzo pot transfers are automatically excluded from spending":undefined} disabled={lockedTransfer} className="subcategory-select" value={txSubcategory} onChange={e=>applyMerchantClassification(t.id,t.category,e.target.value)}>{(availableSubcategories[t.category]??[]).map(item=>
<option key={item}>{item}</option>)}</select>
<button aria-label={`Add a subcategory under ${t.category}`} disabled={lockedTransfer} title={lockedTransfer?"Monzo pot transfers are automatically excluded from spending":"Create a more granular subcategory"} onClick={()=>{setSubcategoryDialog({category:t.category,transactionId:t.id});setNewSubcategory("")}}>＋</button>
</div>
</div>
{t.amount<0&&<label className={`treatment-control treatment-${treatment.toLowerCase().replace(/[^a-z]+/g,"-")}`}><span className="sr-only">Spending treatment for {t.merchant}</span><select aria-label={`Spending treatment for ${t.merchant}`} value={treatment} disabled={lockedTransfer||treatment==="Transfer / savings"} onChange={event=>updateSpendingTreatment(t.id,event.target.value as SpendingTreatment)}>{["Recurring","Normal variable","Planned one-off","Unplanned one-off","Reimbursable business","Transfer / savings"].map(option=><option key={option}>{option}</option>)}</select></label>}
<strong className={t.amount>0?"activity-amount positive":"activity-amount"}>{t.amount>0?"+":""}{gbpExact.format(t.amount)}</strong>
</div>
</div>})}</div>{txLimit<filtered.length&&<button className="load-more" onClick={()=>setTxLimit(n=>n+30)}>Show 30 more</button>}{!filtered.length&&<div className="empty-transactions">
<strong>No matching activity</strong>
<span>Try another account, view, period, category or subcategory.</span>
</div>}</article>
      </section>}

  </>;
}
