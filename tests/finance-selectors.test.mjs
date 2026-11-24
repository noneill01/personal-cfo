import test from 'node:test';
import assert from 'node:assert/strict';
import {selectTransactionView,summarizePayCycles} from '../lib/finance-selectors.ts';
import {configuredAccountCoverage} from '../lib/coverage.ts';
import {createFreshStore} from '../lib/profile.ts';
import {rentalCategoryFor,makeCategory} from '../lib/categories.ts';
const tx=(id,account,amount,category='Groceries',date='2026-10-02')=>({id,account,amount,category,date,subcategory:'Food',merchant:`Example ${id}`,categoryGroup:category==='Income'?'income':'essential'});
const defaults={period:'All data',cycleKey:'2026-09',payday:28,salaryDates:{},through:'2026-10-27',query:'',accountFilter:'All accounts',category:'All categories',subcategoryFilter:'All subcategories',activity:'Spending',accountIds:['bank','card']};
test('an absent rental configuration never creates an Other property shortcut',()=>{
  const profile=createFreshStore().profile;
  assert.equal(rentalCategoryFor(profile),undefined);
  assert.equal(rentalCategoryFor({...profile,propertyConfig:{rentalCategory:''}}),undefined);
  const property=makeCategory('Example rental','property');
  assert.equal(rentalCategoryFor({...profile,categories:[...profile.categories,property]}).name,'Example rental');
  assert.equal(rentalCategoryFor({...profile,propertyConfig:{rentalCategory:'Bills'}}).name,'Bills');
});
test('clearing a category filter restores totals without reloading transactions',()=>{
  const transactions=[tx('food','bank',-100),tx('pay','bank',1000,'Income')];
  const empty=selectTransactionView({...defaults,transactions,category:'Other'});
  assert.equal(empty.spending,0);assert.equal(empty.income,0);
  const restored=selectTransactionView({...defaults,transactions});
  assert.equal(restored.spending,100);assert.equal(restored.income,1000);
});
test('account filtering scopes rows, totals and breakdown identically',()=>{
  const result=selectTransactionView({...defaults,transactions:[tx('food','bank',-100),tx('food-card','card',-80),tx('refund','card',20),tx('pay','bank',1000,'Income')],accountFilter:'card'});
  assert.equal(result.spending,60);assert.equal(result.income,0);assert.equal(result.filtered.length,2);assert.deepEqual(result.categorySpend,[['Groceries',60]]);
});
test('legacy display accounts resolve through the canonical import destination',()=>{
  const result=selectTransactionView({...defaults,transactions:[{...tx('old','Old Bank',-30),importBatch:'batch'}],imports:[{id:'batch',accountId:'bank'}],accountFilter:'bank'});
  assert.equal(result.filtered.length,1);assert.equal(result.spending,30);
});
test('search/category scope controls summaries while activity controls only the rows',()=>{
  const rows=[tx('food','bank',-100),tx('refund','bank',50),tx('pay','bank',1000,'Income')];
  const result=selectTransactionView({...defaults,transactions:rows,category:'Groceries',query:'refund'});
  assert.equal(result.spending,-50);assert.equal(result.filtered[0].id,'refund');assert.equal(result.maxCategory,50);
  const income=selectTransactionView({...defaults,transactions:rows,activity:'Income'});
  assert.deepEqual(income.filtered.map(row=>row.id),['pay']);assert.equal(income.spending,50);
});
test('cycle history nets refunds and retains old cycles for historical review',()=>{
  const transactions=Array.from({length:8},(_,i)=>tx(`month-${i}`,'bank',-100,'Groceries',`2026-${String(i+1).padStart(2,'0')}-28`));
  transactions.push(tx('refund','bank',100,'Groceries','2026-08-29'));
  const store={...createFreshStore(),transactions,profile:{...createFreshStore().profile,accounts:[{id:'bank',kind:'current',name:'Example bank'}]}};
  const result=summarizePayCycles({transactions,payday:28,salaryDates:{},coverage:configuredAccountCoverage(store)});
  assert.equal(result.length,8);assert.equal(result.at(-1)[1].spend,0);assert.equal(result[0][0],'2026-01');
});
