import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeSpending} from '../lib/spending-analysis.ts';
import {createFreshStore} from '../lib/profile.ts';
import {personalSpendingTotal} from '../lib/transactions.ts';
import {merchantRuleKey} from '../lib/classification.ts';
import {readFileSync} from 'node:fs';

const month=n=>`2026-${String(n).padStart(2,'0')}`;
const row=(id,n,amount=-100,extra={})=>({id,date:`${month(n)}-15`,amount,account:'bank',merchant:'Example shop',category:'Groceries',...extra});
function fixture(count=6) {
  const store=createFreshStore();
  store.profile={...store.profile,accounts:[{id:'bank',name:'Example bank',kind:'current',coverage:'required'}]};
  store.transactions=Array.from({length:count},(_,i)=>row(`regular-${i}`,i+1,i<Math.floor(count/2)?-100:-50));
  store.imports=[{id:'coverage',accountId:'bank',fileName:'synthetic.csv',importedAt:'2027-01-01T12:00:00Z',added:count,skipped:0,rejected:0,from:'2026-01-01',to:`${month(count)}-${new Date(2026,count,0).getDate()}`}];
  return store;
}
const run=(store,window=3)=>analyzeSpending(store,1,{},'2027-01','2027-01-01',window);
test('six covered periods produce consistent reductions with exact evidence and no mutation',()=>{
  const store=fixture(),before=JSON.stringify(store),result=run(store);
  assert.equal(result.size,3);assert.equal(result.reductions[0].difference,-50);assert.equal(result.reductions[0].strength,'consistent');
  assert.equal(personalSpendingTotal(result.rows.filter(r=>result.overall.recentTransactionIds.includes(r.id))),result.overall.recentTotal);
  assert.deepEqual(run(store),result);assert.equal(JSON.stringify(store),before);
});
test('consistent category increases are detected',()=>{const s=fixture();s.transactions.forEach((r,i)=>r.amount=i<3?-50:-100);assert.equal(run(s).increases[0].difference,50)});
test('a single large unmarked purchase is not a consistent lifestyle change',()=>{const s=fixture();s.transactions.push(row('large',6,-9000,{category:'Shopping'}));const item=run(s).increases.find(i=>i.label==='Shopping');assert.notEqual(item.strength,'consistent');assert.match(item.explanationType,/isolated/)});
for(const treatment of ['Planned one-off','Unplanned one-off'])test(`${treatment} is separated from variable trends`,()=>{const s=fixture();s.transactions.push(row('large',6,-9000,{category:'Shopping',spendingTreatment:treatment}));const r=run(s);assert.equal(r.oneOffs.recentTotal,9000);assert.equal(r.underlying.recentTotal,150);assert.equal(r.increases.length,0)});
test('new confirmed recurring commitment is structural, not variable',()=>{const s=fixture();for(let n=4;n<=6;n++)s.transactions.push(row(`fixed-${n}`,n,-200,{merchant:'Example subscription',category:'Bills'}));s.recurringCommitments=[{id:`merchant:${merchantRuleKey('Example subscription')}`,key:merchantRuleKey('Example subscription'),label:'Example subscription',category:'Bills',scheduledAmount:200,frequency:'monthly',lastDate:'2026-06-15',paymentMethod:'card',status:'confirmed',source:'manual'}];const r=run(s);assert.equal(r.structuralChanges.length,1);assert.equal(r.recurring.recentTotal,600);assert.equal(r.variable.recentTotal,150);assert.ok(r.overall.difference>0);assert.ok(r.variable.difference<0)});
test('absent recurring payment is not asserted to be cancelled',()=>{const s=fixture();for(let n=1;n<=3;n++)s.transactions.push(row(`fixed-${n}`,n,-200,{merchant:'Example subscription',spendingTreatment:'Recurring'}));assert.match(run(s).structuralChanges[0].explanationType,/not proof it ended/)});
test('recurring price reduction is structural',()=>{const s=fixture();s.transactions.forEach(r=>r.spendingTreatment='Recurring');const r=run(s);assert.equal(r.structuralChanges[0].difference,-50);assert.equal(r.reductions.length,0)});
test('single merchant purchase does not create repeat merchant insight',()=>{const s=fixture();s.transactions.push(row('once',6,-1000,{merchant:'One visit'}));assert.equal(run(s).merchantChanges.some(i=>i.label==='One visit'),false)});
test('refund lowers net spending but cannot claim consistent improvement',()=>{const s=fixture();s.transactions.push(row('refund',6,100));const r=run(s);assert.equal(r.overall.recentTotal,50);assert.notEqual(r.reductions[0].strength,'consistent');assert.match(r.reductions[0].explanationType,/Refunds/)});
for(const role of ['debt-repayment','transfer','savings-contribution','savings-challenge','bills-reserve','salary','rental-income'])test(`${role} movements do not affect comparison`,()=>{const s=fixture(),expected=run(s).overall;s.transactions.push(row('movement',6,role==='salary'||role==='rental-income'?10000:-10000,{role}));assert.deepEqual(run(s).overall,expected)});
test('savings withdrawal is not spending',()=>{const s=fixture(),before=run(s).overall;s.transactions.push(row('withdrawal',6,900,{spendingTreatment:'Transfer / savings'}));assert.deepEqual(run(s).overall,before)});
test('business expenses and repayments do not affect personal comparison',()=>{const s=fixture(),before=run(s).overall;s.transactions.push(row('work',6,-900,{spendingTreatment:'Reimbursable business'}),row('repaid',6,900,{category:'Business expenses',categoryGroup:'work'}));assert.deepEqual(run(s).overall,before)});
test('property costs excluded',()=>{const s=fixture(),before=run(s).overall;s.transactions.push(row('property',6,-900,{category:'Example rental',categoryGroup:'property'}));assert.deepEqual(run(s).overall,before)});
test('live period never contaminates comparison',()=>{const s=fixture(),before=run(s).overall;s.transactions.push({...row('live',1,-10000),date:'2027-01-01'});assert.deepEqual(run(s).overall,before)});
test('missing required account coverage prevents manufactured trends',()=>{const s=fixture();s.profile.accounts.push({id:'card',name:'Example card',kind:'credit-card',coverage:'required'});assert.equal(run(s).status,'insufficient-history')});
for(let n=2;n<=5;n++)test(`${n} periods falls back to equal limited windows`,()=>{const r=run(fixture(n));assert.equal(r.size,Math.floor(n/2));assert.equal(r.status,'limited')});
test('twelve periods supports six versus six; default remains three',()=>{assert.equal(run(fixture(12),6).size,6);assert.equal(run(fixture(12)).size,3)});
test('near-zero category baseline suppresses percentage',()=>{const s=fixture();for(let n=1;n<=6;n++)s.transactions.push(row(`tiny-${n}`,n,n<4?-.01:-30,{category:'Shopping'}));assert.equal(run(s).increases[0].percentage,null)});
test('equal overall totals can hide a meaningful category mix change',()=>{const s=fixture();for(let n=1;n<=6;n++)s.transactions.push(row(`other-${n}`,n,n<4?-50:-100,{category:'Shopping'}));const r=run(s);assert.equal(r.overall.difference,0);assert.equal(r.reductions.length,1);assert.equal(r.increases.length,1)});
test('seasonal recurring cost warns about timing',()=>{const s=fixture();s.transactions.push(row('annual',6,-1200,{merchant:'Example insurance',spendingTreatment:'Recurring'}));assert.match(run(s).structuralChanges[0].explanationType,/frequency/);assert.notEqual(run(s).structuralChanges[0].strength,'consistent')});
test('region changes presentation only',()=>{const s=fixture(),expected=run(s);s.profile.region={country:'US',currency:'USD',locale:'en-US'};assert.deepEqual(run(s),expected)});
test('excluded transition periods are omitted and gaps reduce confidence',()=>{const s=fixture(7);s.cycleAnnotations={'2026-04':{kind:'Transition',excludeFromBaseline:true}};const r=run(s);assert.equal(r.size,3);assert.equal(r.window.contiguous,false);assert.equal(r.window.recent.some(p=>p.key==='2026-04'),false)});
test('consistent evidence ranks ahead of a larger isolated movement',()=>{const s=fixture();s.transactions.forEach((r,i)=>r.amount=i<3?-50:-100);s.transactions.push(row('large',6,-9000,{category:'Shopping'}));const r=run(s);assert.equal(r.increases[0].label,'Groceries');assert.equal(r.increases[1].label,'Shopping')});
test('new spending from zero baseline remains visible without infinite percentages',()=>{const s=fixture();s.transactions=s.transactions.filter(r=>r.date>='2026-04-01');const r=run(s);assert.equal(r.increases.length,1);assert.equal(r.increases[0].percentage,null)});
test('Activity remains records-first with exact-ID drilldown and a clear action',()=>{const source=readFileSync(new URL('../components/Transactions.tsx',import.meta.url),'utf8');assert.ok(source.indexOf('id="activity-records"')<source.indexOf('<SpendingChanges'));assert.match(source,/comparisonIds\.has\(row.id\)/);assert.match(source,/Clear comparison/);assert.match(source,/comparison\?\.filters===filterKey/)});
