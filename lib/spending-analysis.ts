import type { Store, Tx } from './types.ts';
import { resolveCategory } from './categories.ts';
import { merchantRuleKey } from './classification.ts';
import { groupCommitmentTransactions } from './recurring-commitments.ts';
import { baselineEligibleCycles, configuredAccountCoverage, cycleCoverageStatus, participatesInOverview } from './coverage.ts';
import { cycleBounds, nextMonthKey, transactionCycleKey, type SalaryDateMap } from './pay-cycles.ts';
import { personalSpendingAmount, personalSpendingTotal, spendingTreatmentFor } from './transactions.ts';

export const CHANGE_RULES = { categoryShare: .01, merchantShare: .005, relativeChange: .1, percentageFloor: .01, repeatPeriods: 2, limit: 3, dominantShare: .5 } as const;
export type AnalysisPeriod = { key:string; start:string; end:string };
export type SpendingChange = { key:string; label:string; previousTotal:number; recentTotal:number; previousAverage:number; recentAverage:number; difference:number; percentage:number|null; previousActivePeriods:number; recentActivePeriods:number; previousTransactionIds:string[]; recentTransactionIds:string[]; strength:'single-period'|'emerging'|'consistent'; explanationType:string };
const round=(n:number)=>Math.round(n*100)/100;

/** Read-only analysis. Dates, currency and evidence are supplied, never inferred from the clock. */
export function analyzeSpending(store:Store, payday:number, salaryDates:SalaryDateMap, currentKey:string, today:string, requested:3|6=3) {
  const coverage=configuredAccountCoverage(store);
  // A new live transaction must not extend an older imported coverage interval
  // across months with no evidence. Explicit account confirmations still apply.
  coverage.required=coverage.required.map(account=>{
    const through=(store.imports??[]).filter(batch=>batch.accountId===account.accountId).map(batch=>batch.coverage?.through??batch.to).filter((date):date is string=>Boolean(date)).sort().at(-1);
    return through?{...account,to:through}:account;
  });
  const resolved=store.transactions.map(row=>resolveCategory(row,store.profile));
  const rawKeys=resolved.map(row=>transactionCycleKey(row,payday,salaryDates));
  // Include quiet covered periods, not just months containing purchases.
  const keys:string[]=[];
  const first=[...rawKeys,...coverage.required.filter(a=>a.from).map(a=>transactionCycleKey({date:a.from,merchant:'',amount:0,category:''},payday,salaryDates))].sort()[0];
  for(let key=first;key&&key<currentKey;key=nextMonthKey(key))keys.push(key);
  const complete=(key:string)=>cycleBounds(key,payday,salaryDates).end<today&&cycleCoverageStatus(key,payday,salaryDates,coverage,store.imports,store.cardCoverageConfirmations,store.accountCoverageConfirmations).complete;
  const eligible=baselineEligibleCycles(keys,currentKey,complete,store.cycleAnnotations,12);
  const size=eligible.length>=requested*2?requested:eligible.length>=6?3:eligible.length>=4?2:eligible.length>=2?1:0;
  const previousKeys=size?eligible.slice(-size*2,-size):[], recentKeys=size?eligible.slice(-size):[];
  const periods=(list:string[])=>list.map(key=>({key,...cycleBounds(key,payday,salaryDates)}));
  const excluded=keys.filter(key=>!eligible.includes(key)).map(key=>({key,reason:store.cycleAnnotations?.[key]?.excludeFromBaseline?'Excluded from baseline':!complete(key)?'Incomplete account coverage':'Outside comparison history'}));
  const selected=new Set([...previousKeys,...recentKeys]);
  const rows=resolved.filter(row=>selected.has(transactionCycleKey(row,payday,salaryDates))&&participatesInOverview(row,coverage,store.imports)&&row.categoryGroup!=='property'&&!(store.profile?.propertyConfig?.rentalMortgageMerchantKey&&merchantRuleKey(row.merchant)===store.profile.propertyConfig.rentalMortgageMerchantKey)&&personalSpendingAmount(row)!==0).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  const periodOf=(row:Tx)=>transactionCycleKey(row,payday,salaryDates);
  const previousRows=rows.filter(r=>previousKeys.includes(periodOf(r)));
  const base=personalSpendingTotal(previousRows)/Math.max(size,1);
  const materialityBase=Math.max(Math.abs(base),Math.abs(personalSpendingTotal(rows.filter(r=>recentKeys.includes(periodOf(r))))/Math.max(size,1)));
  const contiguous=[...previousKeys,...recentKeys].every((key,i,list)=>!i||nextMonthKey(list[i-1])===key);
  function compare(key:string,label:string,items:Tx[], explanationType='observed'):SpendingChange {
    const before=items.filter(r=>previousKeys.includes(periodOf(r))),after=items.filter(r=>recentKeys.includes(periodOf(r)));
    const previousTotal=personalSpendingTotal(before),recentTotal=personalSpendingTotal(after),previousAverage=previousTotal/Math.max(size,1),recentAverage=recentTotal/Math.max(size,1),difference=recentAverage-previousAverage;
    const recentValues=recentKeys.map(k=>personalSpendingTotal(after.filter(r=>periodOf(r)===k)));
    const largest=Math.max(0,...after.map(personalSpendingAmount));
    const isolated=after.filter(r=>personalSpendingAmount(r)>0).length===1||largest>Math.max(recentTotal,1)*CHANGE_RULES.dominantShare;
    const refundDriven=after.some(r=>personalSpendingAmount(r)<0)&&difference<0;
    const consistent=size>=3&&contiguous&&!isolated&&!refundDriven&&recentValues.every(value=>difference<0?value<previousAverage:value>previousAverage);
    return {key,label,previousTotal,recentTotal,previousAverage:round(previousAverage),recentAverage:round(recentAverage),difference:round(difference),percentage:previousAverage>0&&base>0&&previousAverage>=base*CHANGE_RULES.percentageFloor?round(difference/previousAverage*100):null,previousActivePeriods:new Set(before.map(periodOf)).size,recentActivePeriods:new Set(after.map(periodOf)).size,previousTransactionIds:before.map(r=>r.id),recentTransactionIds:after.map(r=>r.id),strength:consistent?'consistent':size>=2?'emerging':'single-period',explanationType:refundDriven?'Refunds contribute to this reduction':isolated&&difference>0?'An isolated payment dominates; review its treatment':explanationType};
  }
  const oneOff=(r:Tx)=>['Planned one-off','Unplanned one-off'].includes(spendingTreatmentFor(r));
  const obligationGroups=groupCommitmentTransactions(resolved);
  const confirmedGroups=new Set(obligationGroups.filter(group=>(store.recurringCommitments??[]).some(record=>record.status!=='detected'&&(record.id===group.id||(record.key===group.key&&obligationGroups.filter(other=>other.key===group.key).length===1)))).map(group=>group.id));
  const groupFor=new Map(obligationGroups.flatMap(group=>group.transactions.map(row=>[row.id,group] as const)));
  const recurring=(r:Tx)=>!oneOff(r)&&(spendingTreatmentFor(r)==='Recurring'||r.role==='maintenance'||confirmedGroups.has(groupFor.get(r.id)?.id??''));
  const material=(item:SpendingChange,share:number)=>materialityBase>0&&Math.abs(item.difference)>=materialityBase*share&&(!item.previousAverage||Math.abs(item.difference)>=Math.abs(item.previousAverage)*CHANGE_RULES.relativeChange);
  const rank=(a:SpendingChange,b:SpendingChange)=>Number(b.strength==='consistent')-Number(a.strength==='consistent')||Math.abs(b.difference)-Math.abs(a.difference)||a.key.localeCompare(b.key);
  const grouped=(items:Tx[],keyOf:(r:Tx)=>string,labelOf:(r:Tx)=>string)=>[...new Set(items.map(keyOf))].sort().map(key=>{const group=items.filter(r=>keyOf(r)===key);return compare(key,labelOf(group[0]),group)});
  const variable=rows.filter(r=>!oneOff(r)&&!recurring(r));
  const categories=grouped(variable,r=>r.categoryId??r.category,r=>r.category).filter(item=>material(item,CHANGE_RULES.categoryShare)).sort(rank);
  const merchantChanges=grouped(rows.filter(r=>!oneOff(r)),r=>merchantRuleKey(r.merchant),r=>r.merchant).filter(item=>Math.max(item.previousActivePeriods,item.recentActivePeriods)>=CHANGE_RULES.repeatPeriods&&material(item,CHANGE_RULES.merchantShare)).sort(rank);
  const structuralChanges=grouped(rows.filter(recurring),r=>groupFor.get(r.id)?.id??r.id,r=>r.merchant).filter(item=>material(item,CHANGE_RULES.merchantShare)).map(item=>({...item,strength:'emerging' as const,explanationType:!item.previousActivePeriods?'Newly observed recurring cost; check frequency':!item.recentActivePeriods?'No payment observed in recent window; not proof it ended':'Recurring payment totals changed; seasonal timing or amount may explain this'}));
  return {status:size===0?'insufficient-history':size<3?'limited':'ready',size,eligibleCount:eligible.length,window:{previous:periods(previousKeys),recent:periods(recentKeys),excluded,contiguous},overall:compare('overall','Total personal spending',rows),underlying:compare('underlying','Excluding marked one-offs',rows.filter(r=>!oneOff(r))),variable:compare('variable','Normal variable spending',variable),recurring:compare('recurring','Recurring spending',rows.filter(recurring)),oneOffs:compare('one-offs','Marked one-offs',rows.filter(oneOff)),reductions:categories.filter(i=>i.difference<0).slice(0,CHANGE_RULES.limit),increases:categories.filter(i=>i.difference>0).slice(0,CHANGE_RULES.limit),merchantChanges:merchantChanges.slice(0,CHANGE_RULES.limit*2),structuralChanges:structuralChanges.sort(rank).slice(0,CHANGE_RULES.limit),notableOneOffs:grouped(rows.filter(oneOff),r=>r.categoryId??r.category,r=>r.category).sort(rank).slice(0,CHANGE_RULES.limit),rows,summary:size===0?'At least two completed, covered, baseline-eligible pay periods are needed.':size<3?'Limited history: these are movements, not established trends.':'Comparison of completed eligible pay periods. Lower spending is not necessarily money saved.'};
}
export type SpendingAnalysis=ReturnType<typeof analyzeSpending>;
