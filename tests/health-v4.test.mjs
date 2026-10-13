import assert from "node:assert/strict";
import test from "node:test";
import { HEALTH_SCORE_VERSION, assessFinancialHealth, calculateHealthScore, healthComponents } from "../lib/health.ts";

const healthy={accessibleCash:18_000,essentialMonthlySpend:3_000,monthlyIncome:6_000,cashFlowMargin:20,savingsRate:15,creditCardDebt:0,consumerDebt:0,mortgageDebt:0,propertyAssets:0,hasBalanceData:true,sourcePeriod:"2026-09",sourcePeriodLabel:"28 Sep – 27 Oct",sourcePeriodComplete:true,balancesAsOf:"2026-10-27"};
const assess=(patch={})=>assessFinancialHealth({...healthy,...patch});
const component=(result,key)=>result.components.find(item=>item.key===key);

test("Health Score V4 refuses to present a healthy score for a fresh no-data profile",()=>{
  const result=assessFinancialHealth({});
  assert.equal(HEALTH_SCORE_VERSION,4);assert.equal(result.score,null);assert.equal(result.status,"Insufficient data");assert.equal(result.confidence,"insufficient");assert.equal(result.missing.length,3);
});

test("a strong reserve, positive cash flow and no expensive debt score strongly",()=>{
  const result=assess();assert.ok(result.score>=90);assert.equal(result.status,"Strong");assert.equal(result.confidence,"complete");assert.equal(result.components.reduce((sum,item)=>sum+item.available,0),100);
});

test("breaking even scores materially below a sustainable positive surplus",()=>{
  const breakingEven=assess({cashFlowMargin:0}),positive=assess({cashFlowMargin:20});
  assert.ok(positive.score-breakingEven.score>=15);
});

test("negative cash flow is penalised progressively",()=>{
  const mild=assess({cashFlowMargin:-5}),severe=assess({cashFlowMargin:-20}),extreme=assess({cashFlowMargin:-100});
  assert.ok(mild.score<assess({cashFlowMargin:0}).score);assert.ok(severe.score<mild.score);assert.ok(extreme.score<=severe.score);
});

test("no reserve, a severe deficit and significant revolving debt can produce a genuinely low score",()=>{
  const result=assess({accessibleCash:0,cashFlowMargin:-20,creditCardDebt:12_000});
  assert.ok(result.score<25);assert.equal(result.status,"At risk");
});

test("reserve scoring progresses from zero through one, three and six months",()=>{
  const points=[0,1,3,6].map(months=>component(assess({accessibleCash:months*3_000}),"cash").points);
  assert.deepEqual(points,[0,9,24,35]);assert.ok(assess({accessibleCash:0}).score<assess({accessibleCash:18_000}).score);
});

test("credit-card debt is materially more concerning than a supported mortgage",()=>{
  const card=assess({creditCardDebt:6_000}),loan=assess({consumerDebt:6_000}),mortgage=assess({mortgageDebt:6_000,propertyAssets:10_000});
  assert.ok(component(card,"debt").points<component(loan,"debt").points);assert.ok(component(loan,"debt").points<component(mortgage,"debt").points);assert.ok(card.score<mortgage.score);
});

test("mortgage risk reflects loan-to-value without treating home equity as cash",()=>{
  const lowLtv=assess({mortgageDebt:300_000,propertyAssets:600_000}),highLtv=assess({mortgageDebt:570_000,propertyAssets:600_000});
  assert.ok(component(lowLtv,"debt").points>component(highLtv,"debt").points);
  const equityNoCash=assess({accessibleCash:0,mortgageDebt:100_000,propertyAssets:1_000_000});assert.equal(component(equityNoCash,"cash").points,0);assert.ok(equityNoCash.score<75);
});

test("an incomplete current cycle cannot replace completed-period behaviour",()=>{
  const result=assess({sourcePeriodComplete:false,sourcePeriod:"2026-10",cashFlowMargin:80});
  assert.equal(result.score,null);assert.equal(component(result,"cashflow").dataAvailable,false);assert.ok(result.missing.includes("Sustainable cash flow"));
});

test("stale balances or source periods make an otherwise calculable score provisional",()=>{
  const result=assess({balanceDataStale:true,sourcePeriodStale:true});
  assert.equal(typeof result.score,"number");assert.equal(result.provisional,true);assert.equal(result.confidence,"provisional");assert.ok(result.riskFactors.some(item=>item.includes("stale")));
});

test("missing mortgage context is explicit and provisional",()=>{
  const result=assess({mortgageDebt:250_000,propertyAssets:0});
  assert.equal(result.provisional,true);assert.ok(component(result,"debt").riskFactors.some(item=>item.includes("Property value is missing")));
});

test("scores are bounded and healthy-input improvements are monotonic",()=>{
  for(const margin of [-1_000,-50,0,30,1_000]){const score=assess({cashFlowMargin:margin}).score;assert.ok(score>=0&&score<=100)}
  const reserves=[0,.5,1,3,6,12].map(months=>assess({accessibleCash:months*3_000}).score);assert.deepEqual(reserves,[...reserves].sort((a,b)=>a-b));
  const cardDebt=[0,1_500,3_000,6_000,12_000].map(creditCardDebt=>assess({creditCardDebt}).score);assert.deepEqual(cardDebt,[...cardDebt].sort((a,b)=>b-a));
});

test("historical V3 arithmetic remains versioned and reproducible",()=>{
  const legacy={cashProgress:0,savingsRate:0,cashFlowMargin:0,debtRatio:0};
  assert.equal(calculateHealthScore(legacy,3),40);assert.equal(calculateHealthScore({...legacy,cashFlowMargin:-20},3),25);assert.equal(healthComponents(legacy,3).reduce((sum,item)=>sum+item.available,0),100);
});
