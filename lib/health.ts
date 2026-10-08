/**
 * Scores are deliberately versioned. A stored score must always retain the
 * rules that produced it, rather than silently changing meaning in history.
 */
export const HEALTH_SCORE_VERSION = 3 as const;
export type HealthScoreVersion = 1 | 2 | typeof HEALTH_SCORE_VERSION;
export type HealthInputs = { cashProgress: number; savingsRate: number; cashFlowMargin?: number; debtRatio: number };
export type HealthComponent = { key: "cash" | "savings" | "cashflow" | "debt"; label: string; points: number; available: number };
export type HealthReadinessInput = { hasAssetBalance: boolean; hasCashBalance: boolean; hasDebtBalance: boolean; completeCycles: number };
export type HealthReadiness = { ready: boolean; confidence: "Setup needed" | "Partial" | "Complete"; missing: string[]; message: string };

const clamp = (value: number, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));

function versionOneComponents({ cashProgress, savingsRate, debtRatio }: HealthInputs): HealthComponent[] {
  return [
    { key: "cash", label: "Emergency reserve", points: clamp(cashProgress / 30) * 19.5, available: 19.5 },
    { key: "cashflow", label: "Cash-flow margin", points: clamp(savingsRate / 25) * 15, available: 15 },
    { key: "debt", label: "Debt ratio", points: clamp((55 - debtRatio) / 55) * 24.75, available: 24.75 },
  ];
}

function versionTwoComponents(inputs: HealthInputs): HealthComponent[] {
  const cashFlowMargin = inputs.cashFlowMargin ?? 0;
  return [
    { key: "cash", label: "Emergency resilience", points: clamp(inputs.cashProgress / 100) * 35, available: 35 },
    { key: "savings", label: "Pay yourself first", points: clamp(inputs.savingsRate / 20) * 30, available: 30 },
    { key: "cashflow", label: "Cash-flow health", points: clamp(cashFlowMargin / 20) * 15, available: 15 },
    { key: "debt", label: "Debt pressure", points: clamp((75 - inputs.debtRatio) / 40) * 20, available: 20 },
  ];
}

/**
 * V3 gives the whole score an intuitive meaning:
 * - no debt, no emergency reserve and break-even cash flow starts around 40;
 * - overspending can pull that down; and
 * - a fully funded reserve, healthy saving/cash flow and no debt earns 100.
 */
function versionThreeComponents(inputs: HealthInputs): HealthComponent[] {
  const cashFlowMargin = inputs.cashFlowMargin ?? 0;
  const savingPoints = clamp(inputs.savingsRate / 20) * 10;
  const cashFlowPoints = clamp(cashFlowMargin / 20, -1, 1) * 15;
  return [
    { key: "cash", label: "Emergency reserve", points: clamp(inputs.cashProgress / 100) * 35, available: 35 },
    { key: "cashflow", label: "Cash flow & saving", points: savingPoints + cashFlowPoints, available: 25 },
    { key: "debt", label: "Debt position", points: clamp((75 - inputs.debtRatio) / 75) * 40, available: 40 },
  ];
}

/**
 * Version 2 deliberately starts at zero. It reflects current resilience and
 * behaviour, not a broad asset position that can make an underfunded plan look healthier than it is.
 */
export function healthComponents(inputs: HealthInputs, version: HealthScoreVersion = HEALTH_SCORE_VERSION): HealthComponent[] {
  if (version === 1) return versionOneComponents(inputs);
  if (version === 2) return versionTwoComponents(inputs);
  return versionThreeComponents(inputs);
}

export function calculateHealthScore(inputs: HealthInputs, version: HealthScoreVersion = HEALTH_SCORE_VERSION) {
  const total = healthComponents(inputs, version).reduce((sum, component) => sum + component.points, 0);
  return Math.round(Math.max(0, Math.min(100, version === 1 ? 42 + total : total)));
}

/**
 * Keep missing financial inputs separate from the score itself. A zero-debt
 * position is healthy; an untouched empty installation is simply unknown.
 */
export function assessHealthReadiness(input: HealthReadinessInput): HealthReadiness {
  const missing=[] as string[];
  if(!input.hasAssetBalance)missing.push("asset balances");
  if(!input.hasCashBalance)missing.push("cash balances");
  if(!input.hasDebtBalance)missing.push("debt balances");
  if(input.completeCycles<1)missing.push("one completed pay cycle");
  if(!missing.length)return {ready:true,confidence:"Complete",missing:[],message:"Balances and at least one completed pay cycle are recorded."};
  const balanceInputs=missing.filter(item=>item!=="one completed pay cycle");
  if(balanceInputs.length===3)return {ready:false,confidence:"Setup needed",missing,message:"Add balances and complete one pay cycle to calculate."};
  return {ready:false,confidence:"Partial",missing,message:`Add ${missing.join(" and ")} to calculate a trustworthy score.`};
}

export function explainHealthMovement(current: HealthInputs, previous?: HealthInputs, version: HealthScoreVersion = HEALTH_SCORE_VERSION) {
  const score = calculateHealthScore(current, version);
  if (!previous) return { score, change: 0, direction: "baseline forming" as const, movements: healthComponents(current, version).map(component => ({ ...component, change: 0 })) };
  const previousComponents = new Map(healthComponents(previous, version).map(component => [component.key, component]));
  const movements = healthComponents(current, version).map(component => ({ ...component, change: Math.round(component.points - (previousComponents.get(component.key)?.points ?? 0)) }));
  const change = score - calculateHealthScore(previous, version);
  return { score, change, direction: change > 0 ? "improving" as const : change < 0 ? "declining" as const : "steady" as const, movements };
}
