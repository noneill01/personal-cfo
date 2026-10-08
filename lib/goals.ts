import type { Balance, Goal } from "./types.ts";
import { emergencyBalance, isaBalance, pensionBalance } from "./balances.ts";

export const linkedGoalSource = (goalId: string) => {
  if (goalId === "ef") return "Current account + cash savings + Cash ISAs − card debt";
  if (goalId === "isa") return "ISA accounts";
  if (goalId === "pension") return "Pension accounts";
  return undefined;
};

export function goalCurrentFromBalances(goal: Goal, balances: Balance[]) {
  if (goal.id === "ef") return emergencyBalance(balances);
  if (goal.id === "isa") return isaBalance(balances);
  if (goal.id === "pension") return pensionBalance(balances);
  return goal.current;
}

/** Accounts are the source of truth; goals retain their labels and targets. */
export function syncGoalsWithBalances(goals: Goal[], balances: Balance[]) {
  return goals.map(goal => ({ ...goal, current: goalCurrentFromBalances(goal, balances) }));
}
