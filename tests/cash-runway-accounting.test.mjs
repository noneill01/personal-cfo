import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCashRunway} from '../lib/cash-runway.ts';

const row=(id,account,date,amount,category='Groceries')=>({id,account,date,amount,category,merchant:`Example ${id}`});
const salary=row('salary','bank','2026-09-28',5000,'Income');
function run(spending,bankRows=[],balance=5000,plan=1000,fixedCommitments=[]){
  return buildCashRunway({allTransactions:[salary,...spending,...bankRows],personalTransactions:spending,start:'2026-09-28',end:'2026-10-27',cashAccounts:[{accountId:'bank',balance,balanceThrough:'2026-10-27',balanceKnown:true}],spendingPlan:plan,fixedCommitments,live:false});
}
const last=result=>result.points.at(-1);
test('card purchase and full settlement consume the allowance exactly once',()=>{
  const purchase=row('purchase','card','2026-10-01',-1000);
  const payment={...row('settlement','bank','2026-10-20',-1000,'Transfers'),role:'debt-repayment'};
  const result=run([purchase],[payment],4000);
  assert.equal(last(result).actual,4000);
  assert.ok(Math.abs(last(result).onTrack-4000)<.01);
  assert.equal(result.points.reduce((sum,p)=>sum+p.personalSpend,0),1000);
});
test('unpaid card purchases use the budget but do not change current cash',()=>{
  const result=run([row('purchase','card','2026-10-01',-1000)]);
  assert.equal(last(result).actual,5000);
  assert.ok(Math.abs(last(result).onTrack-5000)<.01);
});
test('partial settlement and older card debt move both cash paths without another budget charge',()=>{
  const result=run([row('purchase','card','2026-10-01',-1000)],[{...row('settlement','bank','2026-10-20',-1500,'Transfers'),role:'debt-repayment'}],3500);
  assert.ok(Math.abs(last(result).actual-last(result).onTrack)<.01);
});
test('cash and card purchases share the same allowance',()=>{
  const cash=row('cash','bank','2026-10-01',-400),card=row('card','card','2026-10-02',-600);
  const result=run([cash,card],[],4600);
  assert.ok(Math.abs(last(result).actual-last(result).onTrack)<.01);
});
test('cash and card refunds restore allowance without inventing income',()=>{
  for(const account of ['bank','card']){
    const purchase=row('buy',account,'2026-10-01',-100),refund=row('refund',account,'2026-10-02',100);
    const result=run([purchase,refund],[],5000,100);
    assert.equal(result.points.reduce((sum,p)=>sum+p.personalSpend,0),0);
    assert.ok(Math.abs(last(result).actual-last(result).onTrack-100)<.01);
  }
});
test('fixed recurring card charge uses the dated allowance and settlement once',()=>{
  const charge=row('subscription','card','2026-10-01',-80);
  const settlement={...row('settlement','bank','2026-10-20',-80,'Transfers'),role:'debt-repayment'};
  const result=run([charge],[settlement],4920,80,[{key:'subscription',expected:80,scheduledAmount:80,lastDate:'2026-09-01',frequency:'monthly'}]);
  assert.equal(result.points.reduce((sum,p)=>sum+p.expectedFixedSpend,0),80);
  assert.ok(Math.abs(last(result).actual-last(result).onTrack)<.01);
});
test('live runway includes card activity after the last bank transaction when the balance covers it',()=>{
  const purchase=row('purchase','card','2026-10-10',-1000);
  const result=buildCashRunway({allTransactions:[salary,purchase],personalTransactions:[purchase],start:'2026-09-28',end:'2026-10-27',cashAccounts:[{accountId:'bank',balance:5000,balanceThrough:'2026-10-20',balanceKnown:true}],spendingPlan:1000,live:true});
  assert.equal(result.dataThrough,'2026-10-10');
  assert.equal(last(result).actual,5000);
  assert.equal(result.points.reduce((sum,p)=>sum+p.personalSpend,0),1000);
  assert.ok(last(result).onTrack>last(result).actual,'unpaid card spending above the paced allowance needs attention');
});
test('live runway stops at the declared balance date and excludes later bank and card records',()=>{
  const purchase=row('purchase','card','2026-10-10',-300),laterCard=row('later-card','card','2026-10-22',-500),laterBank=row('later-bank','bank','2026-10-23',-200);
  const result=buildCashRunway({allTransactions:[salary,purchase,laterCard,laterBank],personalTransactions:[purchase,laterCard,laterBank],start:'2026-09-28',end:'2026-10-27',cashAccounts:[{accountId:'bank',balance:5000,balanceThrough:'2026-10-20',balanceKnown:true}],spendingPlan:1000,live:true});
  assert.equal(result.dataThrough,'2026-10-20');
  assert.equal(last(result).actual,5000);
  assert.equal(result.points.reduce((sum,p)=>sum+p.personalSpend,0),300);
  assert.equal(result.points.reduce((sum,p)=>sum+p.netMovement,0),5000);
  assert.ok(result.points.every(point=>point.date<='2026-10-20'));
});
