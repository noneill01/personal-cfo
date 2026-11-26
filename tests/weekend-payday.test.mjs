import test from 'node:test';
import assert from 'node:assert/strict';
import { payCycleAnchorDates, cycleBounds, payCycleKey, transactionCycleKey } from '../lib/pay-cycles.ts';
import { payrollFallbackEntries } from '../lib/payslips.ts';
import { summarizePayCycles } from '../lib/finance-selectors.ts';
import { configuredAccountCoverage } from '../lib/coverage.ts';
import { createFreshStore } from '../lib/profile.ts';
import { buildCashRunway } from '../lib/cash-runway.ts';

const rules=[{effectiveFrom:'2026-09',payday:28,employer:'Example Employer',strictStart:true}];
const slip={date:'2026-11-28',employer:'Example Employer',source:'payslip'};
const deposit={date:'2026-11-27',employer:'Example Employer Payroll',source:'transaction'};
test('weekend payday is Friday before and after salary import, regardless of anchor order',()=>{
  for(const records of [[],[slip],[deposit,slip],[slip,deposit]]){
    const dates=payCycleAnchorDates(records,rules,28,'2026-12');
    assert.deepEqual(cycleBounds('2026-10',28,dates),{start:'2026-10-28',end:'2026-11-26'});
    assert.deepEqual(cycleBounds('2026-11',28,dates),{start:'2026-11-27',end:'2026-12-27'});
    assert.equal(payCycleKey('2026-11-26',28,dates),'2026-10');
    assert.equal(payCycleKey('2026-11-27',28,dates),'2026-11');
  }
});
test('Sunday and no-rule profiles also use the preceding Friday',()=>{
  const dates=payCycleAnchorDates([{...slip,date:'2026-06-28'}],[],28,'2026-07');
  assert.equal(dates['2026-06'],'2026-06-26');
});
test('a later nominal payslip cannot displace posted salary, including an explicit holiday date',()=>{
  const dates=payCycleAnchorDates([{...deposit,date:'2026-12-24'},{...slip,date:'2026-12-28'}],[],28,'2027-01');
  assert.equal(dates['2026-12'],'2026-12-24');
});
test('salary is counted once in new cycle; purchases and runway follow the same boundary',()=>{
  const dates=payCycleAnchorDates([slip,deposit],rules,28,'2026-12');
  const salary=(id,date)=>({id,date,merchant:'Example Employer Payroll',amount:2000,category:'Income',categoryGroup:'income',subcategory:'Salary',role:'salary',account:'bank'});
  const rows=[salary('oct','2026-10-28'),salary('nov','2026-11-27'),{id:'purchase',date:'2026-11-27',merchant:'Example Grocer',amount:-40,category:'Groceries',categoryGroup:'essential',account:'bank'}];
  const payslips=[{id:'nov-slip',payDate:'2026-11-28',employer:'Example Employer',netPay:2000}];
  const fallbacks=payrollFallbackEntries(payslips,rows,28,dates);
  assert.deepEqual(fallbacks,[]);
  const store=createFreshStore();store.transactions=rows;store.profile.accounts=[{id:'bank',name:'Example Bank',kind:'current',coverage:'required'}];
  const summaries=new Map(summarizePayCycles({transactions:rows,payslips,payrollFallbacks:fallbacks,payday:28,salaryDates:dates,coverage:configuredAccountCoverage(store)}));
  assert.equal(summaries.get('2026-10').income,2000);assert.equal(summaries.get('2026-11').income,2000);
  assert.equal(summaries.get('2026-10').spend,0);assert.equal(summaries.get('2026-11').spend,40);
  assert.equal(transactionCycleKey(rows[2],28,dates),'2026-11');
  const bounds=cycleBounds('2026-11',28,dates);
  const runway=buildCashRunway({allTransactions:rows,personalTransactions:[rows[2]],...bounds,cashAccounts:[{accountId:'bank',balance:1960,balanceThrough:'2026-11-27'}],spendingPlan:1000,live:true});
  assert.equal(runway.openingBalance,0);
});
