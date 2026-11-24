import test from 'node:test';
import assert from 'node:assert/strict';
import { createFreshStore, migrateUserProfile, USER_PROFILE_VERSION } from '../lib/profile.ts';
import { analyzeSpending, spendingAttention } from '../lib/spending-analysis.ts';
import { spendingNatureFor, smallPurchaseThreshold, seedSpendingNatures } from '../lib/spending-nature.ts';
import { makeCategory, resolveCategory } from '../lib/categories.ts';
import { personalSpendingTotal } from '../lib/transactions.ts';
import { parseBackup, serialiseBackup } from '../lib/backup.ts';

const month=n=>`2026-${String(n).padStart(2,'0')}`;
const row=(id,n,amount=-10,extra={})=>({id,date:`${month(n)}-15`,merchant:'Fictional café',account:'bank',amount,category:'Eating out',subcategory:'Cafés',...extra});
function fixture(count=6) {
  const s=createFreshStore();
  s.profile.accounts=[{id:'bank',name:'Synthetic bank',kind:'current',coverage:'required'}];
  s.transactions=Array.from({length:count},(_,i)=>Array.from({length:i<count/2?6:2},(_,j)=>row(`${i}-${j}`,i+1))).flat();
  s.imports=[{id:'batch',accountId:'bank',fileName:'synthetic.csv',importedAt:'2027-01-01',added:s.transactions.length,skipped:0,rejected:0,from:'2026-01-01',to:`${month(count)}-${new Date(2026,count,0).getDate()}`}];
  return s;
}
const run=(s,window=3)=>analyzeSpending(s,1,{},'2027-01','2027-01-01',window);
test('routine spending and small purchase frequency consistently fall with per-period metrics',()=>{
  const a=run(fixture()).controllable;
  assert.equal(a.routineDiscretionary.strength,'consistent');assert.equal(a.routineDiscretionary.difference,-40);
  assert.equal(a.smallRepeatSpending.purchaseCountChange,-12);
  assert.equal(a.smallRepeatSpending.recentPurchases.averagePurchase,10);
  assert.equal(a.periods[0].routineDiscretionary.purchaseCount,6);
  assert.equal(a.periods.at(-1).smallRepeatSpending.purchaseCount,2);
});
test('routine increase consistently rises',()=>{const s=fixture();s.transactions.forEach(r=>r.amount=r.date<'2026-04'?-5:-40);assert.equal(run(s).controllable.routineDiscretionary.strength,'consistent');assert.ok(run(s).controllable.routineDiscretionary.difference>0)});
test('cafés fall while restaurants mask improvement, with repairs separate',()=>{
  const s=fixture();for(let n=4;n<=6;n++)s.transactions.push(row(`meal-${n}`,n,-100,{merchant:'Fictional restaurant',subcategory:'Restaurants'}));
  s.transactions.push(row('repair',6,-800,{category:'Home',subcategory:'DIY & repairs'}));
  const a=run(s).controllable;
  assert.ok(a.routineDiscretionary.difference>0);assert.ok(a.smallRepeatSpending.difference<0);
  assert.ok(a.subcategoryTrends.find(t=>t.label.endsWith('Cafés')).difference<0);
  assert.ok(a.subcategoryTrends.find(t=>t.label.endsWith('Restaurants')).difference>0);
  assert.equal(a.totalsByNature.find(t=>t.nature==='home-property').recentTotal,800);
});
test('one large meal does not erase small-repeat reduction or establish consistent increase',()=>{const s=fixture();s.transactions.push(row('meal',6,-900));const a=run(s).controllable;assert.equal(a.smallRepeatSpending.difference,-40);assert.notEqual(a.routineDiscretionary.strength,'consistent')});
for(const [category,extra,nature] of [
  ['Home',{subcategory:'Repairs'},'home-property'],['Home',{subcategory:'Improvements'},'home-property'],
  ['Bills',{},'structural'],['Housing',{subcategory:'Mortgage'},'structural'],
  ['Children',{role:'maintenance'},'structural'],['Groceries',{},'variable-essential'],
  ['Transport',{},'variable-essential'],['Travel',{},'irregular-discretionary'],
  ['Cycling',{},'irregular-discretionary'],['Custom unknown',{categoryGroup:'lifestyle'},'unclassified'],
])test(`${category} ${JSON.stringify(extra)} has safe behavioural semantics`,()=>{const s=fixture(),r=row('specific',6,-400,{category,...extra});s.transactions.push(r);assert.equal(spendingNatureFor(resolveCategory(r,s.profile),s.profile),nature);assert.equal(run(s).controllable.routineDiscretionary.recentTotal,60)});
for(const role of ['transfer','debt-repayment','savings-contribution','savings-challenge','bills-reserve','salary','rental-income'])test(`${role} cannot become routine spending through an override`,()=>{
  const s=fixture();s.transactions.push(row('excluded',6,-900,{role,spendingNature:'routine-discretionary'}));assert.equal(run(s).controllable.total.recentTotal,60);
});
test('work expense and reimbursement excluded',()=>{const s=fixture();s.transactions.push(row('work',6,-900,{spendingTreatment:'Reimbursable business'}),row('refund',6,900,{spendingTreatment:'Reimbursable business'}));assert.equal(run(s).controllable.total.recentTotal,60)});
test('refund lowers net not gross purchase count or average and weakens reduction claim',()=>{const s=fixture();s.transactions.push(row('refund',6,50));const a=run(s).controllable.routineDiscretionary;assert.equal(a.recentTotal,10);assert.equal(a.recentPurchases.purchaseCount,6);assert.equal(a.recentPurchases.averagePurchase,10);assert.equal(a.recentPurchases.refundTotal,50);assert.notEqual(a.strength,'consistent')});
for(const spendingTreatment of ['Planned one-off','Unplanned one-off'])test(`${spendingTreatment} separated without losing actual spending`,()=>{const s=fixture();s.transactions.push(row('once',6,-600,{spendingTreatment}));const a=run(s).controllable;assert.equal(a.routineDiscretionary.recentTotal,60);assert.equal(a.total.recentTotal,660)});
test('live incomplete cycle excluded; no run-rate conflation',()=>{const s=fixture(),expected=run(s);s.transactions.push({...row('live',1,-900),date:'2027-01-01'});assert.deepEqual(run(s),expected)});
test('3-vs-3 and 6-vs-6 plus insufficient history',()=>{assert.equal(run(fixture()).size,3);assert.equal(run(fixture(12),6).size,6);assert.equal(run(fixture(1)).status,'insufficient-history')});
test('gaps weaken consistency',()=>{const s=fixture(7);s.cycleAnnotations={'2026-03':{excludeFromBaseline:true,kind:'Holiday'}};assert.notEqual(run(s).controllable.routineDiscretionary.strength,'consistent')});
test('near-zero comparison percentage suppressed',()=>{const s=fixture();s.transactions.forEach(r=>r.amount=r.date<'2026-04'?-.001:-10);for(let n=1;n<=6;n++)s.transactions.push(row(`essential-${n}`,n,-1000,{category:'Groceries'}));assert.equal(run(s).controllable.routineDiscretionary.percentage,null)});
test('transaction then subcategory then category overrides; fixed obligations retain authority',()=>{
  const s=fixture();const category=makeCategory('Example custom','lifestyle',['Example sub']);
  category.spendingNature='variable-essential';category.subcategories[0].spendingNature='home-property';s.profile.categories.push(category);
  const r=resolveCategory(row('override',6,-10,{category:category.name,subcategory:'Example sub'}),s.profile);
  assert.equal(spendingNatureFor(r,s.profile),'home-property');assert.equal(spendingNatureFor({...r,spendingNature:'routine-discretionary'},s.profile),'routine-discretionary');
  assert.equal(spendingNatureFor({...r,spendingNature:'routine-discretionary'},s.profile,true),'structural');
});
test('recognized subcategory default, custom renaming and thresholds',()=>{
  const s=fixture();const housing=s.profile.categories.find(c=>c.name==='Housing');housing.name='Shelter';
  assert.equal(spendingNatureFor({...row('r',1),category:'Shelter',categoryId:housing.id,subcategory:'Repairs'},s.profile),'home-property');
  assert.equal(smallPurchaseThreshold(s.profile),30);s.profile.spendingAnalysis={smallPurchaseThreshold:5};assert.equal(run(s).controllable.smallRepeatSpending.recentTotal,0);
});
test('all class buckets conserve genuine spending including property and custom overrides',()=>{
  const s=fixture();s.transactions.push(row('rental',6,-123,{category:'Example rental',categoryGroup:'property'}),row('odd',6,-11,{category:'Unknown'}),row('override',6,-9,{spendingNature:'non-spending'}));
  const a=run(s).controllable;
  assert.equal(a.totalsByNature.reduce((sum,t)=>sum+t.previousTotal+t.recentTotal,0),personalSpendingTotal(s.transactions));
  for(const t of a.totalsByNature)assert.equal(personalSpendingTotal(s.transactions.filter(r=>t.recentTransactionIds.includes(r.id))),t.recentTotal);
});
test('v7 migration is additive config-only, idempotent, preserves backup and financial history',()=>{
  const s=fixture();s.profile.version=7;s.profile.categories[0].spendingNature='variable-essential';s.snapshots=[{date:'2026-01-01',netWorth:123}];
  const original=structuredClone(s),next=migrateUserProfile(s);
  assert.equal(next.profile.version,USER_PROFILE_VERSION);assert.equal(next.transactions,s.transactions);
  for(const key of Object.keys(s).filter(k=>k!=='profile'))assert.deepEqual(next[key],s[key]);
  assert.equal(next.profile.categories[0].spendingNature,'variable-essential');assert.deepEqual(s,original);
  assert.equal(migrateUserProfile(next),next);assert.deepEqual(parseBackup(serialiseBackup(next)),JSON.parse(JSON.stringify(next)));
  assert.deepEqual(seedSpendingNatures(next.profile.categories),next.profile.categories);
});
test('USD EUR and GBP leave all calculations identical',()=>{const s=fixture(),expected=run(s);for(const region of [{country:'US',currency:'USD',locale:'en-US'},{country:'IE',currency:'EUR',locale:'en-IE'}]){s.profile.region=region;assert.deepEqual(run(s),expected)}});
test('subcategory can explicitly return to category inheritance',()=>{const s=fixture(),c=s.profile.categories.find(c=>c.name==='Housing');c.spendingNature='variable-essential';c.subcategories.find(sub=>sub.name==='Repairs').spendingNature=undefined;assert.equal(spendingNatureFor(resolveCategory(row('r',1,-10,{category:'Housing',subcategory:'Repairs'}),s.profile),s.profile),'variable-essential')});
test('Home offers at most one material consistent insight and none with limited evidence',()=>{assert.equal(spendingAttention(run(fixture())).length,1);assert.equal(spendingAttention(run(fixture(3))).length,0);const s=fixture();s.transactions.forEach(row=>row.amount=-10);assert.ok(spendingAttention(run(s)).length<=1)});
test('one observed merchant does not create repeat behaviour and preference round-trips',()=>{const s=fixture();s.transactions.push(row('only',6,-25,{merchant:'Single merchant',spendingNature:'routine-discretionary'}));s.profile.spendingAnalysis={smallPurchaseThreshold:22};const a=run(s).controllable;assert.equal(a.merchantTrends.some(item=>item.label==='Single merchant'),false);const restored=parseBackup(serialiseBackup(s));assert.equal(restored.profile.spendingAnalysis.smallPurchaseThreshold,22);assert.equal(restored.transactions.at(-1).spendingNature,'routine-discretionary')});
