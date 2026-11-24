import test from 'node:test';
import assert from 'node:assert/strict';
import {createFreshStore} from '../lib/profile.ts';
import {confirmAccountReview,accountReviewAvailability} from '../lib/review-workflow.ts';
import {readFileSync} from 'node:fs';
import {configuredAccountCoverage,cycleCoverageStatus} from '../lib/coverage.ts';
import {closeoutHasChanged} from '../lib/review.ts';
import {parseBackup,serialiseBackup} from '../lib/backup.ts';
const bounds={start:'2026-09-28',end:'2026-10-27'};
test('full-cycle review stays disabled through the end date and opens the next day',()=>{
  for(const today of ['2026-11-24','2026-11-26T23:59:59Z'])assert.deepEqual(accountReviewAvailability('2026-11-26',today),{canConfirm:false,availableFrom:'2026-11-27'});
  assert.equal(accountReviewAvailability('2026-11-26','2026-11-27T00:00:00Z').canConfirm,true);
  assert.deepEqual(accountReviewAvailability('2026-12-31','2027-01-01'),{canConfirm:true,availableFrom:'2027-01-01'});
});
test('review control uses the shared guard and explains the wait beside the button',()=>{
  const source=readFileSync(new URL('../components/ReviewWorkspace.tsx',import.meta.url),'utf8');
  assert.match(source,/disabled=\{!reviewAvailability.canConfirm\}/);
  assert.match(source,/aria-describedby=/);
  assert.match(source,/This cycle has not ended yet/);
  assert.match(source,/regional.formatDate\(reviewAvailability.availableFrom\)/);
});
test('reviewing a quiet account preserves financial records and other confirmations',()=>{
  const fresh=createFreshStore(),store={...fresh,profile:{...fresh.profile,accounts:[{id:'bank',name:'Example bank',kind:'current'}]},accountCoverageConfirmations:{'2026-09':{card:{from:bounds.start,through:bounds.end,confirmedAt:'2026-10-28T12:00:00Z'}}}};
  const reviewed=confirmAccountReview(store,'2026-09','bank',bounds,'2026-10-28T12:00:00Z');
  assert.equal(reviewed.transactions,store.transactions);assert.equal(reviewed.balances,store.balances);assert.ok(reviewed.accountCoverageConfirmations['2026-09'].card);
  assert.equal(cycleCoverageStatus('2026-09',28,{},configuredAccountCoverage(reviewed),[],{},reviewed.accountCoverageConfirmations).complete,true);
  const restored=parseBackup(serialiseBackup(reviewed));
  assert.deepEqual(restored.accountCoverageConfirmations,reviewed.accountCoverageConfirmations);
});
test('legacy balance-only accounts can be reviewed without requiring a profile migration',()=>{
  const store={...createFreshStore(),profile:undefined,balances:[{id:'bank',name:'Example bank',type:'Current account',group:'asset',value:0}]};
  assert.equal(confirmAccountReview(store,'2026-09','bank',bounds,'2026-10-28T12:00:00Z').accountCoverageConfirmations['2026-09'].bank.from,bounds.start);
});
test('closeout totals reconcile property running costs and refund-adjusted personal spending',()=>{
  const closeout={income:2000,personalSpend:900,rentalMortgage:400,rentalOperatingSpend:50,payYourselfFirst:100};
  assert.equal(closeoutHasChanged(closeout,2000,1350,100),false);
  assert.equal(closeoutHasChanged(closeout,2000,1450,100),true);
});
test('unfinished cycles and unsupported accounts cannot be confirmed as reviewed',()=>{
  const fresh=createFreshStore(),store={...fresh,profile:{...fresh.profile,accounts:[{id:'bank',name:'Example bank',kind:'current'},{id:'fund',name:'Example fund',kind:'investment'}]}};
  assert.throws(()=>confirmAccountReview(store,'2026-09','bank',bounds,'2026-10-20T12:00:00Z'),/after this cycle ends/);
  assert.throws(()=>confirmAccountReview(store,'2026-09','fund',bounds,'2026-10-28T12:00:00Z'),/current or credit-card/);
});
