import assert from "node:assert/strict";
import test from "node:test";
import { HEALTH_SCORE_VERSION, assessFinancialHealth, calculateHealthScore, healthBalanceEvidence, healthComponents } from "../lib/health.ts";
import { createFreshStore } from "../lib/profile.ts";

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

const evidenceStore=(accounts,balances)=>{const store=createFreshStore();return {...store,profile:{...store.profile,accounts},balances}};
const configuredAccount=(id,kind)=>({id,name:`Example ${id}`,kind});
const recordedBalance=(id,type,value=0,asOf="2026-10-27")=>({id,name:`Example ${id}`,type,value,asOf,group:["Credit card","Loan","Mortgage"].includes(type)?"liability":"asset"});

test("omitted debt inputs never earn confirmed zero-debt points",()=>{
  for(const field of ["creditCardDebt","consumerDebt","mortgageDebt"]){
    const result=assess({[field]:undefined});
    assert.equal(result.score,null,field);assert.equal(component(result,"debt").dataAvailable,false,field);
  }
});

test("configured missing debt and untouched zero placeholders cannot masquerade as no debt",()=>{
  const accounts=[configuredAccount("bank","current"),configuredAccount("card","credit-card")];
  for(const balances of [[recordedBalance("bank","Current account",18_000)],[recordedBalance("bank","Current account",18_000),recordedBalance("card","Credit card",0,undefined)]]){
    // Passing undefined invokes the fixture's default date, so explicitly remove it.
    if(balances.length===2)delete balances[1].asOf;
    const evidence=healthBalanceEvidence(evidenceStore(accounts,balances),"2026-10-27");
    const result=assess(evidence);assert.equal(result.score,null);assert.equal(evidence.hasDebtData,false);assert.ok(evidence.missingBalanceAccounts.includes("Example card"));
  }
});

test("dated zero debt is valid evidence and absent unconfigured account kinds are not required",()=>{
  const accounts=[configuredAccount("bank","current"),configuredAccount("card","credit-card")];
  const evidence=healthBalanceEvidence(evidenceStore(accounts,[recordedBalance("bank","Current account",18_000),recordedBalance("card","Credit card")]),"2026-10-27");
  assert.equal(evidence.hasDebtData,true);assert.equal(evidence.consumerDebt,0);assert.equal(evidence.mortgageDebt,0);assert.equal(assess(evidence).confidence,"complete");
  const currentOnly=healthBalanceEvidence(evidenceStore([accounts[0]],[recordedBalance("bank","Current account",18_000)]),"2026-10-27");
  assert.equal(currentOnly.hasDebtData,true);assert.equal(assess(currentOnly).score,assess().score);
  assert.equal(assess(healthBalanceEvidence(evidenceStore([],[]),"2026-10-27")).score,null);
});

test("all accessible reserves need balance evidence, independently of account activity coverage",()=>{
  const accounts=[configuredAccount("bank","current"),configuredAccount("reserve","savings")];
  const store=evidenceStore(accounts,[recordedBalance("bank","Current account",6_000)]);
  const evidence=healthBalanceEvidence(store,"2026-10-27");
  assert.equal(evidence.hasReserveData,false);assert.equal(evidence.accessibleCash,undefined);assert.equal(assess(evidence).score,null);
});

test("health freshness includes excluded savings and mortgage balances with metric-specific ages",()=>{
  const accounts=[configuredAccount("bank","current"),{...configuredAccount("reserve","savings"),coverage:"excluded"},{...configuredAccount("home-loan","mortgage"),coverage:"excluded"},configuredAccount("home","property")];
  const balances=[recordedBalance("bank","Current account",6_000),recordedBalance("reserve","Cash",12_000,"2026-07-27"),recordedBalance("home-loan","Mortgage",120_000,"2026-06-27"),recordedBalance("home","Property",200_000,"2026-01-01")];
  const evidence=healthBalanceEvidence(evidenceStore(accounts,balances),"2026-10-27");
  assert.equal(evidence.balanceDataStale,true);assert.deepEqual(evidence.staleBalanceAccounts,["Example reserve","Example home-loan"]);assert.equal(assess(evidence).confidence,"provisional");
  const refreshed=healthBalanceEvidence(evidenceStore(accounts,balances.map(item=>["reserve","home-loan"].includes(item.id)?{...item,asOf:"2026-10-27"}:item)),"2026-10-27");
  assert.equal(refreshed.balanceDataStale,false);assert.equal(assess(refreshed).confidence,"complete");
});

test("undated nonzero balances stay usable only as provisional evidence",()=>{
  const value=recordedBalance("bank","Current account",18_000);delete value.asOf;
  const evidence=healthBalanceEvidence(evidenceStore([configuredAccount("bank","current")],[value]),"2026-10-27");
  assert.equal(evidence.hasReserveData,true);assert.equal(evidence.balanceDataStale,true);assert.equal(assess(evidence).confidence,"provisional");
});
