import type { ImportRecord, PayslipRecord, Tx, UserProfile } from './types.ts';
import { inferSubcategory } from './classification.ts';
import { participatesInOverview, transactionAccountId, type ActivityCoverage } from './coverage.ts';
import { transactionCycleKey, type SalaryDateMap } from './pay-cycles.ts';
import { salaryIncomeForMonth } from './payslips.ts';
import { businessExpensePosition, groupedPersonalSpending, isBusinessExpenseActivity, isPayYourselfFirstMovement, personalSpendingAmount, personalSpendingTotal, savingsFundingUsed } from './transactions.ts';

export type TransactionActivity = 'Spending' | 'Savings' | 'Work expenses' | 'All activity' | 'Income';
export type CycleSummary = { income: number; spend: number; payslipFallback: number; salaryIncome: number; savingsUsed: number };

/** All transaction summaries use the same account/search/category scope as the rows. */
export function selectTransactionView({ transactions, period, cycleKey, payday, salaryDates, through, query, accountFilter, category, subcategoryFilter, activity, imports = [], accountIds = [] }: {
  transactions: Tx[]; period: string; cycleKey: string; payday: number; salaryDates: SalaryDateMap; through: string;
  query: string; accountFilter: string; category: string; subcategoryFilter: string; activity: TransactionActivity;
  imports?: ImportRecord[]; accountIds?: string[];
}) {
  const anchor=new Date(`${through}T12:00:00Z`);
  if(!['All data','Current pay cycle','Last completed pay cycle','Latest imported pay cycle','Latest pay cycle'].includes(period)&&!period.startsWith('cycle:'))anchor.setUTCMonth(anchor.getUTCMonth()-Number(period.split(' ')[0]));
  const periodTransactions=transactions.filter(row=>period==='All data'||(period.startsWith('cycle:')?transactionCycleKey(row,payday,salaryDates)===period.slice(6):period.includes('cycle')?transactionCycleKey(row,payday,salaryDates)===cycleKey:new Date(`${row.date}T12:00:00Z`)>=anchor));
  const scopedTransactions=periodTransactions.filter(row=>(accountFilter==='All accounts'||(transactionAccountId(row,imports,accountIds)??row.account)===accountFilter)
    &&`${row.merchant} ${row.account}`.toLowerCase().includes(query.toLowerCase())
    &&(['All','All categories'].includes(category)||row.category===category)
    &&(subcategoryFilter==='All subcategories'||(row.subcategory||inferSubcategory(row.category,row.merchant))===subcategoryFilter));
  const filtered=scopedTransactions.filter(row=>activity==='Spending'?personalSpendingAmount(row)!==0:activity==='Income'?row.categoryGroup==='income'&&row.amount>0:activity==='Savings'?isPayYourselfFirstMovement(row):activity==='Work expenses'?isBusinessExpenseActivity(row):true);
  const entries=(totals:Record<string,number>)=>Object.entries(totals).filter(([,value])=>value!==0).sort(([,a],[,b])=>Math.abs(b)-Math.abs(a));
  const categorySpend=entries(groupedPersonalSpending(scopedTransactions));
  const subcategorySpend=entries(groupedPersonalSpending(scopedTransactions,row=>row.subcategory||inferSubcategory(row.category,row.merchant)));
  const breakdownSpend=['All','All categories'].includes(category)?categorySpend:subcategorySpend;
  return {periodTransactions,scopedTransactions,filtered,categorySpend,subcategorySpend,breakdownSpend,spending:personalSpendingTotal(scopedTransactions),income:scopedTransactions.filter(row=>row.amount>0&&row.categoryGroup==='income').reduce((sum,row)=>sum+row.amount,0),maxCategory:Math.max(...breakdownSpend.map(([,value])=>Math.abs(value)),1),selectedBusinessExpenses:businessExpensePosition(scopedTransactions)};
}

/** Keep the complete history for planning/reviews; limit only the chart presentation. */
export function summarizePayCycles({transactions,payslips=[],payrollFallbacks=[],payday,salaryDates,coverage,imports=[],incomeSources}: {
  transactions: Tx[]; payslips?: PayslipRecord[]; payrollFallbacks?: {cycleKey:string;amount:number}[]; payday:number;
  salaryDates:SalaryDateMap; coverage:ActivityCoverage; imports?:ImportRecord[]; incomeSources?:UserProfile['incomeSources'];
}): Array<readonly [string,CycleSummary]> {
  const cycles=new Map<string,Omit<CycleSummary,'salaryIncome'|'savingsUsed'>>();
  const ensure=(key:string)=>{if(!cycles.has(key))cycles.set(key,{income:0,spend:0,payslipFallback:0});return cycles.get(key)!};
  for(const row of transactions){
    if(!participatesInOverview(row,coverage,imports))continue;
    const summary=ensure(transactionCycleKey(row,payday,salaryDates));
    if(row.categoryGroup==='income'&&row.amount>0)summary.income+=row.amount;
    summary.spend+=personalSpendingAmount(row);
  }
  for(const fallback of payrollFallbacks){const summary=ensure(fallback.cycleKey);summary.income+=fallback.amount;summary.payslipFallback+=fallback.amount}
  for(const payslip of payslips)ensure(payslip.payDate.slice(0,7));
  return [...cycles].sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>[key,{...value,spend:Math.round(value.spend*100)/100,salaryIncome:salaryIncomeForMonth(transactions,key,payslips,incomeSources),savingsUsed:savingsFundingUsed(transactions.filter(row=>transactionCycleKey(row,payday,salaryDates)===key))}] as const);
}
