import test from "node:test";
import assert from "node:assert/strict";
import { activeCommitmentDefinitions, commitmentEvidence, detectedDirectDebitDefinitions, groupCommitmentTransactions, migrateRecurringCommitments, reconcileRecurringCommitments } from "../lib/recurring-commitments.ts";
import { buildPlanRows, explicitRecurringCommitments, expectedPlanCommitmentAmount, summarizeNextCyclePlan } from "../lib/plan.ts";
import { buildCashRunway } from "../lib/cash-runway.ts";
import { parseBackup, serialiseBackup } from "../lib/backup.ts";
import { financeStoreDigest } from "../lib/storage.ts";

const tx = (id, date, merchant, amount, extra = {}) => ({ id, date, merchant, amount, category: "Bills", account: "Monzo", ...extra });
const definition = (key, method = "direct-debit") => ({
  key, label: key, category: "Bills", expected: 80, scheduledAmount: 80,
  frequency: "monthly", lastDate: "2026-09-01", source: method,
  payments: [{ date: "2026-08-01", amount: 80 }, { date: "2026-09-01", amount: 80 }],
});
const blankStore = transactions => ({ transactions, balances: [], goals: [], monthlyBudget: 0, updatedAt: "2026-09-01" });

test("Direct Debit and explicit Recurring evidence resolve to one confirmed commitment", () => {
  const rows = [tx("a", "2026-08-01", "Example Finance", -80, { transactionType: "Direct Debit" }),
    tx("b", "2026-09-01", "Example Finance", -80, { transactionType: "Direct Debit", spendingTreatment: "Recurring" })];
  const explicit = explicitRecurringCommitments(rows);
  const evidence = commitmentEvidence(rows, [definition("example finance")], explicit, []);
  const records = reconcileRecurringCommitments(undefined, evidence);
  assert.equal(records.length, 1);
  assert.equal(records[0].status, "confirmed");
  assert.equal(records[0].paymentMethod, "direct-debit");
});

test("explicit recurring card and transfer evidence becomes fixed, while repeated shopping does not", () => {
  const rows = [
    tx("c1", "2026-08-01", "Installment Provider", -80.14, { account: "Credit card", transactionType: "Card payment" }),
    tx("c2", "2026-09-01", "Installment Provider", -80.14, { account: "Credit card", transactionType: "Card payment", spendingTreatment: "Recurring" }),
    tx("t1", "2026-08-02", "Service Transfer", -40, { transactionType: "Transfer" }),
    tx("t2", "2026-09-02", "Service Transfer", -40, { transactionType: "Transfer", spendingTreatment: "Recurring" }),
    tx("s1", "2026-08-05", "Corner Shop", -12, { transactionType: "Card payment" }),
    tx("s2", "2026-09-05", "Corner Shop", -12, { transactionType: "Card payment" }),
  ];
  const explicit = explicitRecurringCommitments(rows);
  const records = reconcileRecurringCommitments(undefined, commitmentEvidence(rows, [], explicit, []));
  assert.deepEqual(records.map(record => record.key), ["installment provider", "service transfer"]);
  assert.deepEqual(records.map(record => record.paymentMethod), ["card", "transfer"]);
  const active = activeCommitmentDefinitions(records, rows, explicit);
  assert.equal(active.length, 2);
  assert.equal(active[0].expected, 80.14);
});

test("a standing order marked Recurring retains its payment method", () => {
  const rows = [tx("so1", "2026-08-02", "Club Dues", -25, { transactionType: "Standing Order" }),
    tx("so2", "2026-09-02", "Club Dues", -25, { transactionType: "Standing Order", spendingTreatment: "Recurring" })];
  const records = reconcileRecurringCommitments(undefined, commitmentEvidence(rows, [], explicitRecurringCommitments(rows), []));
  assert.equal(records[0].paymentMethod, "standing-order");
});

test("user overrides outrank confirmed and detected signals, including legacy Direct Debit settings", () => {
  const evidence = [{ ...definition("loan"), paymentMethod: "direct-debit", status: "detected" }];
  const confirmed = reconcileRecurringCommitments([{ id: "merchant:loan", key: "loan", label: "Loan", category: "Bills", scheduledAmount: 75,
    frequency: "monthly", lastDate: "2026-08-01", paymentMethod: "card", status: "confirmed", source: "user" }], evidence);
  assert.equal(confirmed[0].status, "confirmed");
  const overridden = reconcileRecurringCommitments(confirmed, evidence, { loan: { frequency: "quarterly", archived: true } });
  assert.equal(overridden[0].status, "user-overridden");
  assert.equal(overridden[0].frequency, "quarterly");
  assert.equal(overridden[0].archived, true);
  assert.equal(activeCommitmentDefinitions(overridden, [], [definition("loan")]).length, 0);
});

test("fixed card commitment shifts Bills composition without increasing the planned total", () => {
  const rows = [tx("1", "2026-08-01", "Installment Provider", -80.14, { account: "Credit card", transactionType: "Card payment" }),
    tx("2", "2026-09-01", "Installment Provider", -80.14, { account: "Credit card", transactionType: "Card payment", spendingTreatment: "Recurring" })];
  const explicit = explicitRecurringCommitments(rows);
  const active = activeCommitmentDefinitions(reconcileRecurringCommitments(undefined, commitmentEvidence(rows, [], explicit, [])), rows, explicit);
  const amount = expectedPlanCommitmentAmount({ ...active[0], planningStart: "2026-09-28", planningEnd: "2026-10-27", lastCycleStart: "2026-08-28", lastCycleEnd: "2026-09-27" });
  const before = buildPlanRows({ categories: ["Bills"], lastCycleSpend: { Bills: 200 }, commitments: [] });
  const after = buildPlanRows({ categories: ["Bills"], lastCycleSpend: { Bills: 200 }, commitments: [{ key: active[0].key, label: active[0].label, category: "Bills", amount, source: active[0].source }] });
  const oldPlan = summarizeNextCyclePlan({ planningIncome: 500, essentials: before, lifestyle: [], futureTotal: 0 });
  const newPlan = summarizeNextCyclePlan({ planningIncome: 500, essentials: after, lifestyle: [], futureTotal: 0 });
  assert.equal(newPlan.fixedCommitments, 80.14);
  assert.equal(newPlan.variableEssentials, oldPlan.variableEssentials - 80.14);
  assert.equal(newPlan.allocated, oldPlan.allocated);
});

test("maintenance remains one commitment and rental obligations stay out of the personal Plan", () => {
  const rows = [tx("1", "2026-09-01", "Rental Mortgage", -500, { category: "Rental property", transactionType: "Direct Debit" })];
  const evidence = commitmentEvidence(rows, [{ ...definition("rental mortgage"), category: "Rental property", scheduledAmount: 500 }], [], [definition("child-maintenance", "transfer")]);
  const records = reconcileRecurringCommitments(undefined, evidence);
  const active = activeCommitmentDefinitions(records, rows, evidence, { rentalCategory: "Rental property", rentalMortgageMerchantKey: "rental mortgage", homeMortgageMerchantKey: "home mortgage" });
  assert.deepEqual(active.map(row => row.key), ["child-maintenance"]);
  assert.equal(reconcileRecurringCommitments(records, evidence).length, records.length);
});

test("inactive detected Direct Debits stay in history but stop contributing to the plan", () => {
  const old = reconcileRecurringCommitments(undefined, [{ ...definition("old service"), paymentMethod: "direct-debit", status: "detected" }]);
  assert.equal(activeCommitmentDefinitions(old, [], []).length, 0);
  assert.equal(old.length, 1);
});

test("a confirmed weekly card commitment follows weekly dates in Plan and Cash Runway", () => {
  const rows = [
    tx("w1", "2026-09-03", "Weekly Service", -12, { account: "Credit card", transactionType: "Card payment" }),
    tx("w2", "2026-09-10", "Weekly Service", -12, { account: "Credit card", transactionType: "Card payment" }),
    tx("w3", "2026-09-17", "Weekly Service", -12, { account: "Credit card", transactionType: "Card payment", spendingTreatment: "Recurring" }),
  ];
  const explicit = explicitRecurringCommitments(rows);
  assert.equal(explicit[0].frequency, "weekly");
  const active = activeCommitmentDefinitions(reconcileRecurringCommitments(undefined, commitmentEvidence(rows, [], explicit, [])), rows, explicit);
  const planned = expectedPlanCommitmentAmount({ ...active[0], planningStart: "2026-09-18", planningEnd: "2026-10-17", lastCycleStart: "2026-08-18", lastCycleEnd: "2026-09-17" });
  assert.equal(planned, 48);
  const runway = buildCashRunway({ allTransactions: [], personalTransactions: [], start: "2026-09-18", end: "2026-10-17",
    cashAccounts:[{accountId:"current",balance:1000,balanceThrough:"2026-10-17"}], spendingPlan: 100, fixedCommitments: active, live: false });
  assert.equal(runway.points.filter(point => point.expectedFixedSpend === 12).length, 4);
});

test("Cash Runway receives the same generic card commitment as Plan", () => {
  const card = definition("installment provider", "card");
  const records = reconcileRecurringCommitments(undefined, [{ ...card, paymentMethod: "card", status: "confirmed" }]);
  const active = activeCommitmentDefinitions(records, [], [card]);
  const runway = buildCashRunway({ allTransactions: [], personalTransactions: [], start: "2026-09-28", end: "2026-10-27",
    cashAccounts:[{accountId:"current",balance:1000,balanceThrough:"2026-10-27"}], spendingPlan: 200, fixedCommitments: active, live: false });
  assert.ok(runway.points.some(point => point.expectedFixedSpend === 80));
});

test("old backup restores, migration is idempotent, and commitments survive backup and persistence digest", () => {
  const old = parseBackup(serialiseBackup({ ...blankStore([]), directDebitSettings: { loan: { frequency: "quarterly", archived: true } } }));
  assert.equal(old.recurringCommitments, undefined);
  const evidence = [{ ...definition("loan"), paymentMethod: "direct-debit", status: "detected" }];
  const migrated = migrateRecurringCommitments(old, evidence);
  assert.equal(migrateRecurringCommitments(migrated, evidence), migrated);
  const reloaded = parseBackup(serialiseBackup(migrated));
  assert.deepEqual(reloaded.recurringCommitments, migrated.recurringCommitments);
  assert.deepEqual(financeStoreDigest(reloaded), financeStoreDigest(migrated));
  assert.equal(reloaded.recurringCommitments[0].archived, true);
});

test("two mandates to one merchant remain distinct, while direct-debit and confirmed evidence for each merge", () => {
  const rows = [
    tx("a1", "2026-08-01", "Example Insurer", -80, { transactionType: "Direct Debit", reference: "Policy A" }),
    tx("b1", "2026-08-01", "Example Insurer", -130, { transactionType: "Direct Debit", reference: "Policy B" }),
    tx("a2", "2026-09-01", "Example Insurer", -82, { transactionType: "Direct Debit", reference: "Policy A", spendingTreatment: "Recurring" }),
    tx("b2", "2026-09-01", "Example Insurer", -130, { transactionType: "Direct Debit", reference: "Policy B", spendingTreatment: "Recurring" }),
  ];
  const direct = detectedDirectDebitDefinitions(rows, "2026-09-20");
  const explicit = explicitRecurringCommitments(rows);
  const records = reconcileRecurringCommitments(undefined, commitmentEvidence(rows, direct, explicit, []));
  assert.equal(direct.length, 2);
  assert.equal(explicit.length, 2);
  assert.equal(records.length, 2);
  assert.equal(new Set(records.map(row=>row.id)).size, 2);
  assert.deepEqual(records.map(row=>row.status), ["confirmed", "confirmed"]);
  const active = activeCommitmentDefinitions(records, rows, [...direct, ...explicit]);
  const details = active.map(row=>({ key: row.id, label: row.label, category: row.category,
    amount: expectedPlanCommitmentAmount({ ...row, planningStart: "2026-09-28", planningEnd: "2026-10-27", lastCycleStart: "2026-08-28", lastCycleEnd: "2026-09-27" }), source: row.source }));
  const [bills] = buildPlanRows({ categories: ["Bills"], lastCycleSpend: { Bills: 212 }, commitments: details });
  assert.equal(bills.fixedCommitments, 212);
  assert.equal(bills.plannedAmount, 212);
  const runway = buildCashRunway({ allTransactions: [], personalTransactions: [], start: "2026-09-28", end: "2026-10-27",
    cashAccounts:[{accountId:"current",balance:1000,balanceThrough:"2026-10-27"}], spendingPlan: 212, fixedCommitments: active, live: false });
  assert.ok(runway.points.some(point=>point.expectedFixedSpend===212));
});

test("distinct recurring descriptions split, but a varying amount with one reference does not", () => {
  const described = [
    tx("d1", "2026-08-02", "Example Provider", -20, { originalDescription: "Example Provider Plan Basic", spendingTreatment: "Recurring" }),
    tx("d2", "2026-09-02", "Example Provider", -20, { originalDescription: "Example Provider Plan Basic" }),
    tx("d3", "2026-08-03", "Example Provider", -30, { originalDescription: "Example Provider Plan Plus", spendingTreatment: "Recurring" }),
    tx("d4", "2026-09-03", "Example Provider", -30, { originalDescription: "Example Provider Plan Plus" }),
  ];
  assert.equal(explicitRecurringCommitments(described).length, 2);
  const variable = [tx("v1", "2026-08-04", "Utility Provider", -80, { reference: "Account 42", transactionType: "Direct Debit" }),
    tx("v2", "2026-09-04", "Utility Provider", -94, { reference: "Account 42", transactionType: "Direct Debit" })];
  assert.equal(groupCommitmentTransactions(variable).length, 1);
  assert.equal(detectedDirectDebitDefinitions(variable, "2026-09-20").length, 1);
  const changingCardNotes = [tx("n1", "2026-08-04", "Monthly Tool", -40, { account: "Credit card", transactionType: "Card payment", reference: "Invoice 101" }),
    tx("n2", "2026-09-04", "Monthly Tool", -42, { account: "Credit card", transactionType: "Card payment", reference: "Invoice 102", spendingTreatment: "Recurring" })];
  assert.equal(explicitRecurringCommitments(changingCardNotes).length,1);
});

test("reference-free obligations split only with overlapping repeated amount patterns", () => {
  const rows = [
    tx("a1", "2026-08-01", "Shared Lender", -80, { transactionType: "Direct Debit" }),
    tx("b1", "2026-08-12", "Shared Lender", -130, { transactionType: "Direct Debit" }),
    tx("a2", "2026-09-01", "Shared Lender", -80, { transactionType: "Direct Debit" }),
    tx("b2", "2026-09-12", "Shared Lender", -130, { transactionType: "Direct Debit" }),
  ];
  assert.equal(detectedDirectDebitDefinitions(rows, "2026-09-20").length, 2);
  const changedPrice = [tx("p1", "2026-07-01", "One Provider", -80, { transactionType: "Direct Debit" }),
    tx("p2", "2026-08-01", "One Provider", -80, { transactionType: "Direct Debit" }),
    tx("p3", "2026-09-01", "One Provider", -120, { transactionType: "Direct Debit" }),
    tx("p4", "2026-10-01", "One Provider", -120, { transactionType: "Direct Debit" })];
  assert.equal(groupCommitmentTransactions(changedPrice).length, 1);
  const sameAmountDifferentDates = [
    tx("x1", "2026-08-01", "Same Payee", -40, { transactionType: "Direct Debit" }),
    tx("y1", "2026-08-15", "Same Payee", -40, { transactionType: "Direct Debit" }),
    tx("x2", "2026-09-01", "Same Payee", -40, { transactionType: "Direct Debit" }),
    tx("y2", "2026-09-15", "Same Payee", -40, { transactionType: "Direct Debit" }),
  ];
  assert.equal(detectedDirectDebitDefinitions(sameAmountDifferentDates,"2026-09-20").length,2);
});

test("Phase 4 merchant-key overrides migrate to one matching obligation without hiding another", () => {
  const saved = [{ id: "merchant:example insurer", key: "example insurer", label: "Example Insurer", category: "Bills", scheduledAmount: 80,
    frequency: "quarterly", lastDate: "2026-08-01", paymentMethod: "direct-debit", status: "user-overridden", archived: false, source: "Legacy edit" }];
  const evidence = [
    { ...definition("example insurer"), id: "ref:example insurer:policy a", reference: "policy a", scheduledAmount: 80, paymentMethod: "direct-debit", status: "detected" },
    { ...definition("example insurer"), id: "ref:example insurer:policy b", reference: "policy b", scheduledAmount: 130, paymentMethod: "direct-debit", status: "detected" },
  ];
  const migrated = reconcileRecurringCommitments(saved, evidence);
  assert.equal(migrated.length, 2);
  assert.equal(migrated.find(row=>row.reference==="policy a").status,"user-overridden");
  assert.equal(migrated.find(row=>row.reference==="policy a").frequency,"quarterly");
  assert.equal(migrated.find(row=>row.reference==="policy b").status,"detected");
  assert.deepEqual(reconcileRecurringCommitments(migrated, evidence),migrated);
  assert.deepEqual(parseBackup(serialiseBackup({ ...blankStore([]), recurringCommitments:migrated })).recurringCommitments,migrated);
  const confirmed = [{ ...migrated[1], status:"confirmed", source:"User confirmation" }];
  assert.equal(reconcileRecurringCommitments(confirmed,evidence).find(row=>row.id===confirmed[0].id).status,"confirmed");
});

test("a persistent manual ID outranks re-detection of its referenced obligation", () => {
  const saved = [{ id:"manual:policy-a", key:"example insurer", label:"Policy A", category:"Bills", reference:"policy a",
    scheduledAmount:80, frequency:"monthly", lastDate:"2026-08-01", paymentMethod:"manual", status:"user-overridden", source:"User" }];
  const candidate = { ...definition("example insurer"), id:"ref:example insurer:policy a", reference:"policy a",
    paymentMethod:"direct-debit", status:"detected" };
  const records = reconcileRecurringCommitments(saved,[candidate]);
  assert.equal(records.length,1);
  assert.equal(records[0].id,"manual:policy-a");
  assert.equal(records[0].status,"user-overridden");
  const active = activeCommitmentDefinitions(records,[],[candidate]);
  assert.equal(active[0].evidenceId,candidate.id);
  assert.deepEqual(reconcileRecurringCommitments(records,[candidate]),records);
});
