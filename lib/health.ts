import { accountKind } from "./balances.ts";
import type { AccountKind, Store } from "./types.ts";

/** A stored score retains the rules that produced it. Historical versions are never rewritten. */
export const HEALTH_SCORE_VERSION = 4 as const;
export type HealthScoreVersion = 1 | 2 | 3 | typeof HEALTH_SCORE_VERSION;
export type HealthInputs = {
  cashProgress?: number; savingsRate?: number; cashFlowMargin?: number; debtRatio?: number;
  accessibleCash?: number; essentialMonthlySpend?: number; monthlyIncome?: number;
  creditCardDebt?: number; consumerDebt?: number; mortgageDebt?: number; propertyAssets?: number;
  hasBalanceData?: boolean; sourcePeriod?: string; sourcePeriodLabel?: string; sourcePeriodComplete?: boolean;
  sourcePeriodStale?: boolean; balancesAsOf?: string; balanceDataStale?: boolean;
  hasReserveData?: boolean; hasDebtData?: boolean; missingBalanceAccounts?: string[]; staleBalanceAccounts?: string[];
};
export type HealthComponentKey = "cash" | "savings" | "cashflow" | "debt";
export type HealthComponent = {
  key: HealthComponentKey; label: string; points: number; available: number;
  dataAvailable?: boolean; status?: "strong" | "watch" | "risk" | "missing";
  explanation?: string; positiveFactors?: string[]; riskFactors?: string[]; actions?: string[];
};
export type HealthReadinessInput = { hasAssetBalance: boolean; hasCashBalance: boolean; hasDebtBalance: boolean; completeCycles: number };
export type HealthReadiness = { ready: boolean; confidence: "Setup needed" | "Partial" | "Complete"; missing: string[]; message: string };
export type HealthAssessment = {
  version: 4; score: number | null; status: "Insufficient data" | "At risk" | "Vulnerable" | "Building" | "Resilient" | "Strong";
  confidence: "insufficient" | "provisional" | "complete"; provisional: boolean; summary: string;
  source: { period?: string; label?: string; complete: boolean; stale: boolean; balancesAsOf?: string };
  components: HealthComponent[]; strongestFactor?: HealthComponent; biggestRisk?: HealthComponent;
  positiveFactors: string[]; riskFactors: string[]; actions: string[]; missing: string[];
};

export const HEALTH_V4_WEIGHTS = { reserve: 35, cashFlow: 35, debt: 30 } as const;
const RESERVE_POINTS: readonly [number, number][] = [[0,0],[.5,4],[1,9],[3,24],[6,35]];
const CASH_FLOW_POINTS: readonly [number, number][] = [[-50,0],[-20,4],[-5,10],[0,16],[5,21],[10,26],[20,32],[30,35]];
const CARD_DEBT_POINTS: readonly [number, number][] = [[0,14],[.1,12],[.25,9],[.5,5],[1,1],[2,0]];
const LOAN_DEBT_POINTS: readonly [number, number][] = [[0,8],[.1,6],[.25,3],[.5,0]];
const MORTGAGE_LTV_POINTS: readonly [number, number][] = [[0,8],[.6,8],[.8,6],[.9,3.5],[1,1],[1.2,0]];

const clamp = (value: number, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));
const finite = (value: number | undefined): value is number => typeof value === "number" && Number.isFinite(value);
function piecewise(value: number, points: readonly [number, number][]) {
  if (value <= points[0][0]) return points[0][1];
  for (let index=1;index<points.length;index++) {
    const [upperX,upperY]=points[index],[lowerX,lowerY]=points[index-1];
    if(value<=upperX)return lowerY+(upperY-lowerY)*(value-lowerX)/(upperX-lowerX);
  }
  return points.at(-1)![1];
}
const rounded=(value:number)=>Math.round(value*10)/10;

/** Health uses dated balance evidence, independently of transaction-import coverage. */
const HEALTH_BALANCE_MAX_AGE: Partial<Record<AccountKind, number>> = { current:35, savings:90, "cash-isa":90, "credit-card":35, loan:120, mortgage:120, property:365 };
const cashKinds:AccountKind[]=["current","savings","cash-isa"];
const debtKinds:AccountKind[]=["credit-card","loan","mortgage"];
const balanceDate=(value:string|undefined)=>Boolean(value&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(`${value}T12:00:00Z`))&&new Date(`${value}T12:00:00Z`).toISOString().slice(0,10)===value);
export function healthBalanceEvidence(store:Pick<Store,"balances"|"profile">,today:string) {
  const configs=new Map(store.profile?.accounts.map(account=>[account.id,account])??[]);
  const accounts=new Map([...store.balances.map(balance=>[balance.id,{id:balance.id,name:balance.name,kind:accountKind(balance)}] as const),...[...configs].map(([id,account])=>[id,account] as const)]);
  const evidence=[...accounts.values()].filter(account=>HEALTH_BALANCE_MAX_AGE[account.kind]!==undefined).map(account=>{
    const balance=store.balances.find(item=>item.id===account.id),dated=balanceDate(balance?.asOf);
    // An untouched zero placeholder is not evidence that an account has no balance.
    const recorded=Boolean(balance&&Number.isFinite(balance.value)&&(dated||balance.value!==0));
    const age=dated?(Date.parse(`${today}T12:00:00Z`)-Date.parse(`${balance!.asOf}T12:00:00Z`))/86400000:Infinity;
    return {...account,balance,recorded,stale:recorded&&(!dated||age<0||age>HEALTH_BALANCE_MAX_AGE[account.kind]!)};
  });
  const allRecorded=(kinds:AccountKind[])=>evidence.filter(item=>kinds.includes(item.kind)).every(item=>item.recorded);
  const total=(kinds:AccountKind[])=>allRecorded(kinds)?Math.round(evidence.filter(item=>kinds.includes(item.kind)).reduce((sum,item)=>sum+(item.balance?.value??0),0)*100)/100:undefined;
  const cash=evidence.filter(item=>cashKinds.includes(item.kind));
  const dates=evidence.filter(item=>item.recorded&&balanceDate(item.balance?.asOf)).map(item=>item.balance!.asOf!).sort();
  return {accessibleCash:total(cashKinds),creditCardDebt:total(["credit-card"]),consumerDebt:total(["loan"]),mortgageDebt:total(["mortgage"]),propertyAssets:total(["property"]),hasBalanceData:evidence.some(item=>item.recorded),hasReserveData:cash.length>0&&allRecorded(cashKinds),hasDebtData:evidence.length>0&&allRecorded(debtKinds),balancesAsOf:dates[0],balanceDataStale:evidence.some(item=>item.stale),missingBalanceAccounts:evidence.filter(item=>!item.recorded).map(item=>item.name),staleBalanceAccounts:evidence.filter(item=>item.stale).map(item=>item.name)};
}

function versionOneComponents(inputs: HealthInputs): HealthComponent[] {
  const cashProgress=inputs.cashProgress??0,savingsRate=inputs.savingsRate??0,debtRatio=inputs.debtRatio??0;
  return [
    { key:"cash",label:"Emergency reserve",points:clamp(cashProgress/30)*19.5,available:19.5 },
    { key:"cashflow",label:"Cash-flow margin",points:clamp(savingsRate/25)*15,available:15 },
    { key:"debt",label:"Debt ratio",points:clamp((55-debtRatio)/55)*24.75,available:24.75 },
  ];
}
function versionTwoComponents(inputs: HealthInputs): HealthComponent[] {
  const cashFlowMargin=inputs.cashFlowMargin??0;
  return [
    { key:"cash",label:"Emergency resilience",points:clamp((inputs.cashProgress??0)/100)*35,available:35 },
    { key:"savings",label:"Pay yourself first",points:clamp((inputs.savingsRate??0)/20)*30,available:30 },
    { key:"cashflow",label:"Cash-flow health",points:clamp(cashFlowMargin/20)*15,available:15 },
    { key:"debt",label:"Debt pressure",points:clamp((75-(inputs.debtRatio??0))/40)*20,available:20 },
  ];
}
function versionThreeComponents(inputs: HealthInputs): HealthComponent[] {
  const cashFlowMargin=inputs.cashFlowMargin??0;
  return [
    { key:"cash",label:"Emergency reserve",points:clamp((inputs.cashProgress??0)/100)*35,available:35 },
    { key:"cashflow",label:"Cash flow & saving",points:clamp((inputs.savingsRate??0)/20)*10+clamp(cashFlowMargin/20,-1,1)*15,available:25 },
    { key:"debt",label:"Debt position",points:clamp((75-(inputs.debtRatio??0))/75)*40,available:40 },
  ];
}

function reserveComponent(inputs:HealthInputs):HealthComponent {
  if(inputs.hasReserveData===false||!finite(inputs.accessibleCash)||!finite(inputs.essentialMonthlySpend)||inputs.essentialMonthlySpend<=0)return {key:"cash",label:"Accessible reserve",points:0,available:HEALTH_V4_WEIGHTS.reserve,dataAvailable:false,status:"missing",explanation:"Add accessible cash and a monthly essentials plan.",riskFactors:["Emergency reserve coverage is not yet measurable."],actions:["Record cash balances and planned essential spending."]};
  const months=Math.max(0,inputs.accessibleCash)/inputs.essentialMonthlySpend,points=rounded(piecewise(months,RESERVE_POINTS));
  return {key:"cash",label:"Accessible reserve",points,available:HEALTH_V4_WEIGHTS.reserve,dataAvailable:true,status:months>=3?"strong":months>=1?"watch":"risk",explanation:`Accessible cash covers ${months.toFixed(1)} months of essential spending.`,positiveFactors:months>=3?["At least three months of essential spending is accessible."]:[],riskFactors:months<1?["Accessible cash covers less than one month of essentials."]:months<3?["Reserve coverage is below three months."]:[],actions:months<3?["Build accessible cash toward three months of essential spending."]:[]};
}
function cashFlowComponent(inputs:HealthInputs):HealthComponent {
  if(!inputs.sourcePeriodComplete||!finite(inputs.monthlyIncome)||inputs.monthlyIncome<=0||!finite(inputs.cashFlowMargin))return {key:"cashflow",label:"Sustainable cash flow",points:0,available:HEALTH_V4_WEIGHTS.cashFlow,dataAvailable:false,status:"missing",explanation:"A completed pay cycle with income and spending is required.",riskFactors:["Cash-flow direction is not yet measurable from a complete period."],actions:["Complete and review one pay cycle."]};
  const margin=inputs.cashFlowMargin,points=rounded(piecewise(margin,CASH_FLOW_POINTS)),saving=inputs.savingsRate??0;
  return {key:"cashflow",label:"Sustainable cash flow",points,available:HEALTH_V4_WEIGHTS.cashFlow,dataAvailable:true,status:margin>=10?"strong":margin>=0?"watch":"risk",explanation:`The completed-cycle cash-flow margin is ${margin.toFixed(1)}%.`,positiveFactors:[...(margin>=10?["Income exceeded spending by a sustainable margin."]:[]),...(saving>0?[`${saving.toFixed(1)}% of income moved to savings or investments.`]:[])],riskFactors:margin<0?[`Spending exceeded income by ${Math.abs(margin).toFixed(1)}%.`]:margin<5?["The completed cycle left little room for disruption."]:[],actions:margin<0?["Bring recurring and flexible spending back below reliable income."]:margin<10?["Protect more of each completed cycle as surplus."]:[]};
}
function debtComponent(inputs:HealthInputs):HealthComponent {
  if(!inputs.hasBalanceData||inputs.hasDebtData===false||!finite(inputs.creditCardDebt)||!finite(inputs.consumerDebt)||!finite(inputs.mortgageDebt)||!finite(inputs.monthlyIncome)||inputs.monthlyIncome<=0)return {key:"debt",label:"Debt quality & burden",points:0,available:HEALTH_V4_WEIGHTS.debt,dataAvailable:false,status:"missing",explanation:"Recorded debt balances and reliable income are required; missing balances are not assumed to be zero.",riskFactors:["Debt burden is not yet measurable."],actions:["Record current balances and complete an income cycle."]};
  const income=inputs.monthlyIncome,card=Math.max(0,inputs.creditCardDebt??0),loan=Math.max(0,inputs.consumerDebt??0),mortgage=Math.max(0,inputs.mortgageDebt??0),property=Math.max(0,inputs.propertyAssets??0);
  const cardPoints=piecewise(card/income,CARD_DEBT_POINTS),loanPoints=piecewise(loan/(income*12),LOAN_DEBT_POINTS);
  const mortgageContextMissing=mortgage>0&&property<=0,mortgagePoints=mortgage===0?8:mortgageContextMissing?2:piecewise(mortgage/property,MORTGAGE_LTV_POINTS);
  const points=rounded(cardPoints+loanPoints+mortgagePoints),ltv=mortgage>0&&property>0?mortgage/property:0;
  return {key:"debt",label:"Debt quality & burden",points,available:HEALTH_V4_WEIGHTS.debt,dataAvailable:true,status:points>=24?"strong":points>=16?"watch":"risk",explanation:mortgageContextMissing?"Mortgage debt is recorded without a corresponding property value.":mortgage>0?`Mortgage loan-to-value is ${(ltv*100).toFixed(1)}%; revolving and consumer debt are weighted more heavily.`:"Revolving and consumer debt are assessed against reliable income.",positiveFactors:[...(card===0?["No revolving credit-card debt is recorded."]:[]),...(loan===0?["No consumer-loan debt is recorded."]:[]),...(mortgage>0&&ltv<=.8?["Mortgage debt is supported by at least 20% property equity."]:[])],riskFactors:[...(card/income>=.25?["Credit-card debt is material relative to monthly income."]:[]),...(loan/(income*12)>=.25?["Consumer-loan debt is material relative to annual income."]:[]),...(mortgageContextMissing?["Property value is missing, so mortgage context is incomplete."]:ltv>.9?["Mortgage loan-to-value is above 90%."]:[])],actions:[...(card>0?["Prioritise expensive revolving debt."]:[]),...(loan>0?["Review the cost and repayment path of consumer loans."]:[]),...(mortgageContextMissing?["Add the corresponding property value for meaningful mortgage context."]:[])]};
}
function versionFourComponents(inputs:HealthInputs){return [reserveComponent(inputs),cashFlowComponent(inputs),debtComponent(inputs)]}

export function assessFinancialHealth(inputs:HealthInputs):HealthAssessment {
  const components=versionFourComponents(inputs),missing=components.filter(component=>!component.dataAvailable).map(component=>component.label);
  const complete=!missing.length,rawScore=components.reduce((sum,component)=>sum+component.points,0),score=complete?Math.round(clamp(rawScore,0,100)):null;
  const contextualGap=Boolean(inputs.missingBalanceAccounts?.length)||components.some(component=>component.riskFactors?.some(item=>item.includes("Property value is missing"))),stale=Boolean(inputs.balanceDataStale||inputs.sourcePeriodStale),provisional=complete&&(stale||contextualGap);
  const status:HealthAssessment["status"]=score===null?"Insufficient data":score<40?"At risk":score<60?"Vulnerable":score<75?"Building":score<90?"Resilient":"Strong";
  const valid=components.filter(component=>component.dataAvailable),strongestFactor=[...valid].sort((a,b)=>b.points/b.available-a.points/a.available)[0],biggestRisk=[...valid].sort((a,b)=>a.points/a.available-b.points/b.available)[0];
  const confidence:HealthAssessment["confidence"]=score===null?"insufficient":provisional?"provisional":"complete";
  const summary=score===null?`Add ${missing.join(", ").toLowerCase()} before treating this as a financial-health score.`:provisional?`${status}, but some inputs are stale or incomplete.`:`${status}: ${strongestFactor?.label.toLowerCase()} is strongest; ${biggestRisk?.label.toLowerCase()} deserves the most attention.`;
  return {version:4,score,status,confidence,provisional,summary,source:{period:inputs.sourcePeriod,label:inputs.sourcePeriodLabel,complete:Boolean(inputs.sourcePeriodComplete),stale,balancesAsOf:inputs.balancesAsOf},components,strongestFactor,biggestRisk,positiveFactors:components.flatMap(component=>component.positiveFactors??[]),riskFactors:[...components.flatMap(component=>component.riskFactors??[]),...(inputs.balanceDataStale?[inputs.staleBalanceAccounts?.length?`Balance information needs updating: ${inputs.staleBalanceAccounts.join(", ")}.`:"Balance information is stale."]:[]),...(inputs.missingBalanceAccounts?.length?[`Balance evidence is missing: ${inputs.missingBalanceAccounts.join(", ")}.`]:[]),...(inputs.sourcePeriodStale?["The latest completed behavioural period is stale."]:[])],actions:components.flatMap(component=>component.actions??[]),missing};
}

export function healthComponents(inputs:HealthInputs,version:HealthScoreVersion=HEALTH_SCORE_VERSION):HealthComponent[]{if(version===1)return versionOneComponents(inputs);if(version===2)return versionTwoComponents(inputs);if(version===3)return versionThreeComponents(inputs);return versionFourComponents(inputs)}
export function calculateHealthScore(inputs:HealthInputs,version:HealthScoreVersion=HEALTH_SCORE_VERSION){if(version===4)return assessFinancialHealth(inputs).score??0;const total=healthComponents(inputs,version).reduce((sum,component)=>sum+component.points,0);return Math.round(clamp(version===1?42+total:total,0,100))}

/** Compatibility readiness for V1–V3 callers. V4 uses the assessment's explicit missing-data result. */
export function assessHealthReadiness(input:HealthReadinessInput):HealthReadiness {
  const missing=[] as string[];if(!input.hasAssetBalance)missing.push("asset balances");if(!input.hasCashBalance)missing.push("cash balances");if(!input.hasDebtBalance)missing.push("debt balances");if(input.completeCycles<1)missing.push("one completed pay cycle");
  if(!missing.length)return {ready:true,confidence:"Complete",missing:[],message:"Balances and at least one completed pay cycle are recorded."};
  const balanceInputs=missing.filter(item=>item!=="one completed pay cycle");if(balanceInputs.length===3)return {ready:false,confidence:"Setup needed",missing,message:"Add balances and complete one pay cycle to calculate."};
  return {ready:false,confidence:"Partial",missing,message:`Add ${missing.join(" and ")} to calculate a trustworthy score.`};
}
export function explainHealthMovement(current:HealthInputs,previous?:HealthInputs,version:HealthScoreVersion=HEALTH_SCORE_VERSION){const score=calculateHealthScore(current,version);if(!previous)return {score,change:0,direction:"baseline forming" as const,movements:healthComponents(current,version).map(component=>({...component,change:0}))};const previousComponents=new Map(healthComponents(previous,version).map(component=>[component.key,component]));const movements=healthComponents(current,version).map(component=>({...component,change:Math.round(component.points-(previousComponents.get(component.key)?.points??0))}));const change=score-calculateHealthScore(previous,version);return {score,change,direction:change>0?"improving" as const:change<0?"declining" as const:"steady" as const,movements}}
