import assert from "node:assert/strict";
import test from "node:test";
import { groupedPersonalSpending, isPersonalSpendingRefund, personalSpendingAmount, personalSpendingTotal, spendingTreatmentSummary } from "../lib/transactions.ts";
import { spendingBreakdown } from "../lib/review.ts";

const tx = (id, amount, overrides = {}) => ({ id, date: "2026-09-10", merchant: "Example shop", account: "Example current", category: "Shopping", categoryGroup: "lifestyle", amount, ...overrides });

test("a full personal refund nets the purchase to zero across review and category summaries", () => {
  const transactions = [tx("purchase", -100), tx("refund", 100)];
  const original = structuredClone(transactions);
  assert.equal(personalSpendingTotal(transactions), 0);
  assert.deepEqual(groupedPersonalSpending(transactions), { Shopping: 0 });
  assert.equal(spendingTreatmentSummary(transactions)["Normal variable"], 0);
  assert.equal(spendingBreakdown(transactions).personal, 0);
  assert.equal(isPersonalSpendingRefund(transactions[1]), true);
  assert.deepEqual(transactions, original, "refund accounting preserves both transactions and their source amounts");
});

test("partial refunds offset only their own expense category and treatment", () => {
  const transactions = [tx("hotel", -250, { category: "Travel", subcategory: "Hotels", spendingTreatment: "Planned one-off" }), tx("hotel-refund", 75, { category: "Travel", subcategory: "Hotels", spendingTreatment: "Planned one-off" }), tx("groceries", -42.18, { category: "Groceries", categoryGroup: "essential" })];
  assert.equal(personalSpendingTotal(transactions), 217.18);
  assert.deepEqual(groupedPersonalSpending(transactions), { Travel: 175, Groceries: 42.18 });
  assert.deepEqual(groupedPersonalSpending(transactions, row => row.subcategory || row.category), { Hotels: 175, Groceries: 42.18 });
  const review = spendingBreakdown(transactions);
  assert.equal(review.planned, 175);
  assert.equal(review.variable, 42.18);
  assert.equal(review.personal, review.recurring + review.variable + review.planned + review.unplanned);
});

test("a refund in a later cycle remains a spending credit in the cycle it arrived", () => {
  const transactions = [tx("purchase", -100, { date: "2026-08-29" }), tx("refund", 60, { date: "2026-09-30" })];
  const august = transactions.filter(row => row.date.startsWith("2026-08"));
  const september = transactions.filter(row => row.date.startsWith("2026-09"));
  assert.equal(personalSpendingTotal(august), 100);
  assert.equal(personalSpendingTotal(september), -60);
  assert.equal(spendingBreakdown(september).personal, -60);
  assert.equal(spendingTreatmentSummary(september)["Normal variable"], -60);
  assert.equal(personalSpendingTotal(transactions), 40);
});

test("income, account funding, repayments and work reimbursements never reduce personal spending", () => {
  const excluded = [
    tx("income", 100, { category: "Income", categoryGroup: "income" }),
    tx("custom-income", 100, { category: "Consulting", categoryGroup: "income" }),
    tx("salary", 100, { role: "salary" }),
    tx("rent", 100, { role: "rental-income" }),
    tx("transfer", 100, { role: "transfer" }),
    tx("savings", 100, { role: "savings-contribution" }),
    tx("challenge", 100, { role: "savings-challenge" }),
    tx("bills", 100, { role: "bills-reserve" }),
    tx("card-repayment", 100, { role: "debt-repayment" }),
    tx("work", 100, { category: "Business expenses" }),
    tx("custom-work", 100, { categoryGroup: "work" }),
    tx("explicit-work", 100, { spendingTreatment: "Reimbursable business" }),
    tx("explicit-transfer", 100, { spendingTreatment: "Transfer / savings" }),
  ];
  for (const row of excluded) {
    assert.equal(personalSpendingAmount(row), 0, row.id);
    assert.equal(isPersonalSpendingRefund(row), false, row.id);
  }
  const rows = [tx("shopping", -100), ...excluded];
  assert.equal(personalSpendingTotal(rows), 100);
  assert.equal(spendingBreakdown(rows).personal, 100);
  assert.equal(spendingTreatmentSummary(rows)["Normal variable"], 100);
});

test("refunds work across source accounts without treating card repayments as refunds", () => {
  const rows = [tx("purchase", -100, { account: "Example card" }), tx("refund", 30, { account: "Example card" }), tx("repayment-out", -100, { role: "debt-repayment" }), tx("repayment-in", 100, { account: "Example card", role: "debt-repayment" })];
  assert.equal(personalSpendingTotal(rows), 70);
  assert.equal(personalSpendingTotal(rows.filter(row => row.account === "Example card")), 70);
  assert.equal(spendingBreakdown(rows).personal, 70);
});
