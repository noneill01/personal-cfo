import assert from "node:assert/strict";
import test from "node:test";
import {
  accountKind, assetBalance, debtBalance, currentAccountBalance, savingsBalance,
  pensionBalance, propertyAssetBalance, investmentBalance, cashBalance,
  cashAfterCardDebt, cardDebtBalance, mortgageDebtBalance, isaBalance,
  propertyEquity, createBalanceSnapshot, isCashAccount, migrateBalanceHistory,
} from "../lib/balances.ts";
import { goalCurrentFromBalances } from "../lib/goals.ts";
import { assessHealthReadiness, calculateHealthScore } from "../lib/health.ts";

const legacyTypes = {
  "Current account": "current",
  Cash: "savings",
  "Cash ISA": "cash-isa",
  ISA: "investment-isa",
  "Stocks & Shares ISA": "investment-isa",
  VCT: "investment",
  "Credit card": "credit-card",
  Mortgage: "mortgage",
  Loan: "loan",
  Pension: "pension",
  Property: "property",
};
const account = (id, type, value, group = "asset") => ({ id, name: id, type, value, group });
const balances = [
  account("current", "Current account", 1200),
  account("savings", "Cash", 3200),
  account("cash-isa", "Cash ISA", 1400),
  account("old-isa", "ISA", 800),
  account("new-isa", "Stocks & Shares ISA", 2400),
  account("vct", "VCT", 600),
  account("pension", "Pension", 10000),
  account("property", "Property", 50000),
  account("unknown-asset", "Collectible", 200),
  account("card", "Credit card", 500, "liability"),
  account("mortgage", "Mortgage", 25000, "liability"),
  account("loan", "Loan", 1000, "liability"),
  account("unknown-debt", "Other obligation", 100, "liability"),
];

const oldSum = (group, types) => Math.round(balances
  .filter(balance => balance.group === group && (!types || types.includes(balance.type)))
  .reduce((total, balance) => total + balance.value, 0) * 100) / 100;

test("every existing balance type maps to a canonical kind; unknown types remain other", () => {
  for (const [type, kind] of Object.entries(legacyTypes)) assert.equal(accountKind({ type }), kind, type);
  assert.equal(accountKind({ type: "Collectible" }), "other");
  assert.equal(accountKind({ type: "toString" }), "other");
  assert.equal(accountKind({ type: "" }), "other");
});

test("all legacy financial totals equal the previous free-text calculations", () => {
  const original = structuredClone(balances);
  const grossCash = oldSum("asset", ["Cash", "Current account", "Cash ISA"]);
  const cardDebt = oldSum("liability", ["Credit card"]);
  const mortgageDebt = oldSum("liability", ["Mortgage"]);
  const assets = oldSum("asset");
  const debt = oldSum("liability");
  assert.equal(currentAccountBalance(balances), oldSum("asset", ["Current account"]));
  assert.equal(savingsBalance(balances), oldSum("asset", ["Cash"]));
  assert.equal(cashBalance(balances), grossCash);
  assert.equal(cashAfterCardDebt(balances), grossCash - cardDebt);
  assert.equal(isaBalance(balances), oldSum("asset", ["ISA", "Stocks & Shares ISA"]));
  assert.equal(investmentBalance(balances), oldSum("asset", ["ISA", "Stocks & Shares ISA", "VCT"]));
  assert.equal(pensionBalance(balances), oldSum("asset", ["Pension"]));
  assert.equal(propertyAssetBalance(balances), oldSum("asset", ["Property"]));
  assert.equal(cardDebtBalance(balances), cardDebt);
  assert.equal(mortgageDebtBalance(balances), mortgageDebt);
  assert.equal(debtBalance(balances), debt);
  assert.equal(assetBalance(balances), assets);
  assert.equal(propertyEquity(balances), oldSum("asset", ["Property"]) - mortgageDebt);
  const snapshot = createBalanceSnapshot(balances, "2026-01-01");
  assert.equal(snapshot.grossCash, grossCash);
  assert.equal(snapshot.cash, grossCash - cardDebt);
  assert.equal(snapshot.cashIsa, oldSum("asset", ["Cash ISA"]));
  assert.equal(snapshot.isa, oldSum("asset", ["ISA", "Stocks & Shares ISA"]));
  assert.equal(snapshot.pension, oldSum("asset", ["Pension"]));
  assert.equal(snapshot.debt, debt);
  assert.equal(snapshot.netWorth, assets - debt);
  assert.deepEqual(snapshot.accountBalances, balances);
  assert.deepEqual(balances, original);
});

test("old saved balance shapes and historical ISA migration remain valid", () => {
  const oldStore = { balances: structuredClone(balances), snapshots: [], goals: [], transactions: [], monthlyBudget: 0, updatedAt: "2026-01-01" };
  const migrated = migrateBalanceHistory(oldStore);
  assert.equal(migrated.balances.find(balance => balance.id === "old-isa").type, "Stocks & Shares ISA");
  assert.deepEqual(oldStore.balances, balances);
  assert.equal(accountKind(migrated.balances.find(balance => balance.id === "old-isa")), "investment-isa");
  assert.equal(createBalanceSnapshot(migrated.balances, "2026-01-01").netWorth, createBalanceSnapshot(balances, "2026-01-01").netWorth);
});

test("goal and Health Score balance-derived inputs keep their previous values", () => {
  const grossCash = oldSum("asset", ["Cash", "Current account", "Cash ISA"]);
  const cardDebt = oldSum("liability", ["Credit card"]);
  const assets = oldSum("asset");
  const debt = oldSum("liability");
  assert.equal(goalCurrentFromBalances({ id: "ef", current: 0 }, balances), grossCash - cardDebt);
  assert.equal(goalCurrentFromBalances({ id: "pension", current: 0 }, balances), oldSum("asset", ["Pension"]));
  const oldInputs = { cashProgress: ((grossCash - cardDebt) / 15000) * 100, savingsRate: 12, cashFlowMargin: 8, debtRatio: (debt / assets) * 100 };
  const newInputs = { cashProgress: (cashAfterCardDebt(balances) / 15000) * 100, savingsRate: 12, cashFlowMargin: 8, debtRatio: (debtBalance(balances) / assetBalance(balances)) * 100 };
  assert.deepEqual(newInputs, oldInputs);
  assert.equal(calculateHealthScore(newInputs), calculateHealthScore(oldInputs));
  assert.equal(balances.some(balance => balance.group === "asset" && isCashAccount(balance)),
    balances.some(balance => ["Cash", "Current account", "Cash ISA"].includes(balance.type)));
  const oldCashEvidence = balances.some(balance => ["Cash", "Current account", "Cash ISA"].includes(balance.type));
  const newCashEvidence = balances.some(isCashAccount);
  assert.deepEqual(assessHealthReadiness({ hasAssetBalance: true, hasCashBalance: newCashEvidence, hasDebtBalance: true, completeCycles: 1 }),
    assessHealthReadiness({ hasAssetBalance: true, hasCashBalance: oldCashEvidence, hasDebtBalance: true, completeCycles: 1 }));
});
