import { addOnboardingAccount, addOnboardingGoal, configureIncome, finishOnboarding } from "./onboarding.ts";
import { createFreshStore, syncUserProfileInPlace } from "./profile.ts";
import { normaliseRegion } from "./region.ts";
import type { RecurringCommitment, RegionalConfig, Store, Tx } from "./types.ts";

const iso = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};
const monthAnchor = (base: Date, offset: number, day = 28) =>
  new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + offset, day));

function currentPaydayAnchor(now: Date) {
  const thisMonth = monthAnchor(now, 0);
  return now.getUTCDate() >= 28 ? thisMonth : monthAnchor(now, -1);
}

function transaction(
  id: string,
  date: Date,
  merchant: string,
  amount: number,
  category: string,
  subcategory?: string,
  extra: Partial<Tx> = {},
): Tx {
  return {
    id,
    date: iso(date),
    merchant,
    amount,
    account: "demo-current",
    category,
    ...(subcategory ? { subcategory } : {}),
    ...extra,
  };
}

/**
 * A fictional, self-contained profile for evaluating Personal CFO before entering
 * real financial data. It is generated locally and contains no owner data.
 */
export function createDemoStore(regionOrNow?: Partial<RegionalConfig> | Date, date = new Date()): Store {
  const region=regionOrNow instanceof Date ? undefined : regionOrNow;
  const now=regionOrNow instanceof Date ? regionOrNow : date;
  const today = iso(now);
  const anchor = currentPaydayAnchor(now);
  const anchors = [-2, -1, 0].map(offset => monthAnchor(anchor, offset));

  let store = createFreshStore();
  if (store.profile) store = { ...store, profile: { ...store.profile, region: normaliseRegion(region) } };
  store = addOnboardingAccount(store, { id: "demo-current", name: "Everyday account", kind: "current", balance: 3250, asOf: today, coverage: "required" });
  store = addOnboardingAccount(store, { id: "demo-savings", name: "Rainy day savings", kind: "savings", balance: 8200, asOf: today, coverage: "excluded" });
  store = addOnboardingAccount(store, { id: "demo-card", name: "Rewards card", kind: "credit-card", balance: 480, asOf: today, coverage: "required" });
  store = addOnboardingAccount(store, { id: "demo-pension", name: "Workplace pension", kind: "pension", balance: 32000, asOf: today, coverage: "excluded" });

  const transactions: Tx[] = anchors.flatMap((salaryDate, index) => {
    const suffix = String(index + 1);
    return [
      transaction(`demo-salary-${suffix}`, salaryDate, "Example Payroll", 4200, "Income", "Salary"),
      transaction(`demo-rent-${suffix}`, addDays(salaryDate, 2), "Oak Street Lettings", -1250, "Housing", "Rent", { spendingTreatment: "Recurring", transactionType: "Standing order" }),
      transaction(`demo-energy-${suffix}`, addDays(salaryDate, 5), "Example Energy", -118, "Bills", "Utilities", { spendingTreatment: "Recurring", transactionType: "Direct debit" }),
      transaction(`demo-broadband-${suffix}`, addDays(salaryDate, 7), "Example Broadband", -39, "Bills", "Subscriptions", { spendingTreatment: "Recurring", transactionType: "Direct debit" }),
      transaction(`demo-groceries-a-${suffix}`, addDays(salaryDate, 9), "Neighbourhood Market", -86, "Groceries"),
      transaction(`demo-transport-${suffix}`, addDays(salaryDate, 11), "City Transit", -54, "Transport"),
      transaction(`demo-eating-${suffix}`, addDays(salaryDate, 13), "Harbour Kitchen", -42, "Eating out"),
      transaction(`demo-groceries-b-${suffix}`, addDays(salaryDate, 17), "Neighbourhood Market", -74, "Groceries"),
      transaction(`demo-entertainment-${suffix}`, addDays(salaryDate, 19), "Example Cinema", -28, "Entertainment"),
      transaction(`demo-savings-${suffix}`, addDays(salaryDate, 20), "Savings transfer", -500, "Savings", "Cash savings", { role: "savings-contribution", spendingTreatment: "Transfer / savings" }),
    ];
  }).filter(row => row.date <= today);

  const latestDateFor = (merchant: string) =>
    [...transactions].reverse().find(row => row.merchant === merchant)?.date ?? today;

  const commitments: RecurringCommitment[] = [
    { id: "demo-rent", key: "oak-street-lettings", label: "Oak Street Lettings", category: "Housing", subcategory: "Rent", scheduledAmount: 1250, frequency: "monthly", lastDate: latestDateFor("Oak Street Lettings"), paymentMethod: "standing-order", status: "confirmed", source: "Demo data" },
    { id: "demo-energy", key: "example-energy", label: "Example Energy", category: "Bills", subcategory: "Utilities", scheduledAmount: 118, frequency: "monthly", lastDate: latestDateFor("Example Energy"), paymentMethod: "direct-debit", status: "confirmed", source: "Demo data" },
    { id: "demo-broadband", key: "example-broadband", label: "Example Broadband", category: "Bills", subcategory: "Subscriptions", scheduledAmount: 39, frequency: "monthly", lastDate: latestDateFor("Example Broadband"), paymentMethod: "direct-debit", status: "confirmed", source: "Demo data" },
  ];

  const budgetPlan = {
    Housing: 1250,
    Bills: 250,
    Groceries: 420,
    Transport: 180,
    "Eating out": 180,
    Shopping: 150,
    Entertainment: 120,
    Travel: 150,
    Savings: 700,
  };

  store = {
    ...store,
    demoMode: true,
    transactions,
    recurringCommitments: commitments,
    imports: [{ id: "demo-import", fileName: "fictional-demo-data", importedAt: now.toISOString(), added: transactions.length, skipped: 0, source: "Generic CSV", importerId: "demo" }],
    monthlyBudget: 3400,
    planningIncome: 4200,
    budgetPlan,
    snapshots: [
      { date: iso(monthAnchor(anchor, -2, 27)), netWorth: 38300, cash: 10100, pension: 28600, debt: 400 },
      { date: iso(monthAnchor(anchor, -1, 27)), netWorth: 40500, cash: 10800, pension: 30100, debt: 400 },
      { date: today, netWorth: 42970, cash: 10970, pension: 32000, debt: 480 },
    ],
    updatedAt: today,
  };

  store = configureIncome(store, "Example Payroll", "salary", 28);
  store = addOnboardingGoal(store, { id: "ef", name: "Emergency fund", target: 12000, current: 8200 });

  if (store.profile) {
    store = {
      ...store,
      profile: {
        ...store.profile,
        planning: { income: 4200, budgetPlan },
      },
    };
  }

  return syncUserProfileInPlace(finishOnboarding(store));
}
