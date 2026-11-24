import assert from 'node:assert/strict';
import test from 'node:test';
import {buildHomeSummary,navigationItems,screenTitle} from '../lib/presentation.ts';
import {visibleNavigation} from '../lib/feature-packs.ts';

test('Home preserves established totals, negative savings and period identity without mutating records',()=>{
  const input={totals:{net:90000,netLiquid:4200,currentAccount:1200},balancesAsOf:'2026-10-28',
    overviewCycleKey:'2026-10',payday:28,salaryDates:{},cycleLabel:key=>key,
    overviewFlowReady:true,overviewDataState:'partial',overviewIncome:3000,overviewSpending:3400,
    overviewSavings:-500,overviewUnallocated:100,cfoAttentionItems:[{key:'data',title:'Update activity'}],
    overviewCategorySpend:[['Food',400],['Shopping',-25]],snapshots:[{date:'2026-10-28',netWorth:90000}]};
  const before=structuredClone({...input,cycleLabel:undefined});
  const summary=buildHomeSummary(input);
  assert.deepEqual(summary.position,{netWorth:90000,cashAfterCards:4200,currentAccounts:1200,asOf:'2026-10-28'});
  assert.equal(summary.period.result,100);assert.equal(summary.period.saved,-500);
  assert.equal(summary.period.income,3000);assert.equal(summary.period.key,'2026-10');
  assert.deepEqual(summary.categories,[['Food',400],['Shopping',-25]]);
  assert.deepEqual({...input,cycleLabel:undefined},before);
  const missing=buildHomeSummary({...input,overviewFlowReady:false,overviewDataState:'awaiting'});
  assert.equal(missing.period.ready,false);assert.equal(missing.period.state,'awaiting');
});

test('new labels preserve old destinations and optional Tax visibility',()=>{
  assert.equal(screenTitle('Transactions'),'Activity');assert.equal(screenTitle('Monthly Review'),'Review');
  assert.equal(screenTitle('Plan'),'Plan');assert.equal(screenTitle('Budget'),'Plan');
  assert.equal(screenTitle('Income'),'Payroll & pension');
  assert.equal(visibleNavigation(navigationItems,{enabledPacks:[]}).length,5);
  assert.equal(visibleNavigation(navigationItems,{enabledPacks:['uk-tax']}).length,6);
});
