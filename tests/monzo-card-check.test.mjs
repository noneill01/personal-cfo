import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMonzoCsv} from '../lib/imports.ts';
import {normaliseMonzoImport} from '../lib/importers.ts';
import {commitTransactionImport} from '../lib/import-workflow.ts';
import {createFreshStore} from '../lib/profile.ts';
import {personalSpendingTotal} from '../lib/transactions.ts';

const header='Transaction ID,Date,Name,Amount,Category,Type,Notes and #tags\n';
const check='check-1,13/11/2026,Example provider,0.00,Entertainment,Card payment,Active card check\n';
const purchase='purchase-1,12/11/2026,Example shop,-12.50,Groceries,Card payment,\n';
test('Monzo active card checks retain zero-value evidence without rejection',()=>{
  const result=parseMonzoCsv(header+purchase+check);
  assert.equal(result.rejected,0);assert.deepEqual(result.issues,[]);
  assert.equal(result.transactions.length,2);
  assert.equal(result.transactions[1].sourceId,'check-1');
  assert.equal(result.transactions[1].amount,0);
  assert.equal(personalSpendingTotal(result.transactions),12.5);
});
test('unrecognised zero rows, invalid amounts, dates and descriptions remain rejected',()=>{
  for(const row of [check.replace('Active card check',''),check.replace('0.00',''),check.replace('0.00','oops'),check.replace('13/11/2026','bad-date'),check.replace('Example provider',''),check.replace('Card payment','Bank transfer')]) {
    const result=parseMonzoCsv(header+row);
    assert.equal(result.rejected,1);assert.equal(result.transactions.length,0);
  }
});
test('card checks do not pause balance tracking and reimport is duplicate-safe',()=>{
  const store={...createFreshStore(),balances:[{id:'monzo-current',name:'Example current',group:'asset',type:'Current account',value:1000,asOf:'2026-11-11'}],monzoBalanceTracking:{enabled:true,syncedThrough:'2026-11-11',updatedAt:'2026-11-11'}};
  const draft=normaliseMonzoImport(parseMonzoCsv(header+purchase+check),store.profile);
  const first=commitTransactionImport(store,draft,'synthetic.csv','2026-11-14T12:00:00Z');
  assert.equal(first.record.rejected,0);assert.equal(first.store.monzoBalanceTracking.enabled,true);
  assert.equal(first.store.balances[0].value,987.5);
  const second=commitTransactionImport(first.store,draft,'synthetic.csv','2026-11-14T13:00:00Z');
  assert.equal(second.record.added,0);assert.equal(second.record.skipped,2);
  assert.equal(second.store.balances[0].value,987.5);
});
