"use client";
import {useState} from 'react';
import type {HomeScreenPropsWithHealthHistory} from '../lib/screen-props';
import {buildHomeSummary} from '../lib/presentation';
import HomeDetails from './HomeDetails';

export default function Home(props:HomeScreenPropsWithHealthHistory & {resetAccountFilter:()=>void}) {
  const {position,period,attention,categories,trend}=buildHomeSummary(props);
  const [trendPoint,setTrendPoint]=useState<string>();
  const money=props.gbp,locale=money.resolvedOptions().locale;
  const date=(value:string)=>new Date(value+'T12:00:00').toLocaleDateString(locale,{day:'numeric',month:'short',year:'numeric'});
  const activity=(view:'Income'|'Spending'|'Savings'|'All activity',category='All categories')=>{
    props.resetAccountFilter();
    props.setQuery('');props.setCategory(category);props.setSubcategoryFilter('All subcategories');
    props.setPeriod(`cycle:${period.key}`);props.setTxView(view);props.setTab('Transactions');
  };
  const act=(item:typeof attention[number])=>{
    if(item.key==='data')props.setTab('Monthly Review');
    else if(item.key==='review')activity('Spending',props.categoryLabels.review);
    else {props.setBudgetCycle(period.key);props.setTab('Budget');}
  };
  const low=Math.min(...trend.map(p=>p.netWorth),0),high=Math.max(...trend.map(p=>p.netWorth),1);
  const point=(index:number,value:number)=>`${48+index/Math.max(1,trend.length-1)*600},${146-(value-low)/(high-low)*120}`;
  const inspected=trend.find(p=>p.date===trendPoint)??trend.at(-1);
  return <section className="home-simple">
    <section className="position-row" aria-label="Financial position now">
      <button onClick={()=>props.setDetailKey('growth')}><span>Net worth</span><strong>{money.format(position.netWorth)}</strong><small>All assets less all debt</small></button>
      <button onClick={()=>props.setDetailKey('accessible')}><span>Cash after card debt</span><strong>{money.format(position.cashAfterCards)}</strong><small>Current accounts + cash savings − cards</small></button>
      <button onClick={()=>props.setDetailKey('health')}><span>Financial Health · V4</span><strong>{props.healthReadiness.ready?`${props.healthScore}/100`:'—'}</strong><small>{props.healthReadiness.ready?`${props.healthAssessment.status} · ${props.healthAssessment.confidence}`:props.healthReadiness.message}</small></button>
    </section>
    <p className="position-date">Latest recorded balances{position.asOf?` · oldest balance ${date(position.asOf)}`:' · check individual account dates'} · <button className="text-button" onClick={()=>props.setTab('Accounts')}>View accounts</button></p>
    <article className="panel period-summary">
      <div className="panel-head"><div><h2>This pay period</h2><p>{period.label} · {period.state==='awaiting'?'Waiting for activity':period.state==='partial'?'Activity still arriving':'Complete activity'}</p></div>
        <label>View period<select aria-label="Home pay period" value={props.overviewCycle} onChange={e=>props.setOverviewCycle(e.target.value)}><option value="latest">Current pay period</option>{props.cycleKeys.filter(key=>key!==props.currentCycleKey).slice(0,12).map(key=><option key={key} value={key}>{props.cycleLabel(key,props.payday,props.salaryDates)}</option>)}</select></label>
      </div>
      <div className="period-totals">
        <button onClick={()=>activity('Income')}><span>Income</span><strong>{period.ready?money.format(period.income):'Awaiting data'}</strong></button>
        <button onClick={()=>activity('Spending')}><span>Spending</span><strong>{period.ready?money.format(period.spending):'Awaiting data'}</strong></button>
        <button onClick={()=>activity('Savings')}><span>{period.saved<0?'Savings withdrawn':'Saved & invested'}</span><strong>{period.ready?money.format(Math.abs(period.saved)):'Awaiting data'}</strong></button>
        <button onClick={()=>activity('All activity')}><span>After spending & saving</span><strong>{period.ready?money.format(period.result):'Awaiting data'}</strong></button>
      </div>
      <small>Period result is income less spending and net savings transfers. It is not your bank balance. Workplace pension contributions are recorded separately in Payroll.</small>
    </article>
    <article className="panel primary-attention">
      <span className="insight-label">YOUR NEXT STEP</span>
      <h2>{attention[0]?.title??(period.state==='complete'?'Review your completed period':'Keep your activity up to date')}</h2>
      <p>{attention[0]?.copy??(period.state==='complete'?'Check the period and save your review.':'No urgent issue is visible in the recorded data. Import new activity as it arrives.')}</p>
      <button className="primary" onClick={()=>attention[0]?act(attention[0]):props.setTab('Monthly Review')}>{attention[0]?.action??'Open Review'} →</button>
      {attention.length>1&&<details><summary>{attention.length-1} other item{attention.length>2?'s':''}</summary>{attention.slice(1).map(item=><button className="attention-link" key={item.key} onClick={()=>act(item)}><strong>{item.title}</strong><span>{item.copy}</span><b>{item.action} →</b></button>)}</details>}
    </article>
    <article className="panel simple-spending"><div className="panel-head"><div><h2>Where spending went</h2><p>{period.label}</p></div><button className="text-button" onClick={()=>activity('Spending')}>All activity →</button></div>
      {categories.length?<><ol className="ranked-spending">{categories.slice(0,5).map(([name,amount])=><li key={name}><button onClick={()=>activity('Spending',name)}><span>{name}</span><strong>{money.format(amount)}</strong><span aria-hidden="true">→</span></button></li>)}</ol>{categories.length>5&&<button className="text-button" onClick={()=>activity('Spending')}>View all {categories.length} categories</button>}</>:<p>No spending recorded for this period.</p>}
    </article>
    <article className="panel simple-trend"><div className="panel-head"><div><h2>Net-worth direction</h2><p>Dated account snapshots · {inspected?`${date(inspected.date)}: ${money.format(inspected.netWorth)}`:'No snapshots yet'}</p></div><button className="text-button" onClick={()=>props.setDetailKey('growth')}>Explore history →</button></div>
      {trend.length>1?<><svg viewBox="0 0 680 180" role="img" aria-label="Net worth over time; exact dates and values below"><text x="4" y="18">{money.format(high)}</text><text x="4" y="163">{money.format(low)}</text><path d="M48 26V146H648" fill="none" stroke="var(--line)"/><polyline points={trend.map((p,i)=>point(i,p.netWorth)).join(' ')} fill="none" stroke="var(--blue)" strokeWidth="3"/>{trend.map((p,i)=>{const [cx,cy]=point(i,p.netWorth).split(',');return <circle key={p.date} cx={cx} cy={cy} r="6" fill="var(--blue)" tabIndex={0} onFocus={()=>setTrendPoint(p.date)} onMouseEnter={()=>setTrendPoint(p.date)} aria-label={`${date(p.date)}: ${money.format(p.netWorth)}`}><title>{date(p.date)}: {money.format(p.netWorth)}</title></circle>})}<text x="48" y="178">{date(trend[0].date)}</text><text x="648" y="178" textAnchor="end">{date(trend.at(-1)!.date)}</text></svg><details><summary>View exact values</summary><table><thead><tr><th>Date</th><th>Net worth</th></tr></thead><tbody>{trend.map(p=><tr key={p.date}><td>{date(p.date)}</td><td>{money.format(p.netWorth)}</td></tr>)}</tbody></table></details></>:<p>{trend.length?'One snapshot recorded. A second dated snapshot will show the change.':'Update account balances to start your history.'}</p>}
    </article>
    <details className="overview-more"><summary><span><b>Detailed analysis</b><small>Full money flow, financial history, goals and comparisons</small></span><i>Explore</i></summary><div className="overview-more-content"><HomeDetails {...props}/></div></details>
  </section>;
}
