import assert from "node:assert/strict";
import test from "node:test";
import { migrateBalanceHistory } from "../lib/balances.ts";
import { parseBackup, serialiseBackup } from "../lib/backup.ts";
import { enableFeaturePack, isFeaturePackEnabled } from "../lib/feature-packs.ts";
import { applyUserProfile, createFreshStore, migrateUserProfile } from "../lib/profile.ts";
import { migrateRecurringCommitments } from "../lib/recurring-commitments.ts";
import { financeStoreDigest, financeStoresMatch } from "../lib/storage.ts";
import { createP60Evidence } from "../lib/tax/facts.ts";
import { migrateTaxStore } from "../lib/tax/migration.ts";

const restoreThroughCurrentMigrations = input => {
  let store = parseBackup(serialiseBackup(input));
  store = applyUserProfile(migrateUserProfile(store));
  store = migrateRecurringCommitments(store, []);
  store = migrateBalanceHistory(store);
  if (isFeaturePackEnabled(store.profile, "uk-tax")) store = migrateTaxStore(store);
  return store;
};

const syntheticCurrentStore = () => {
  const evidence = createP60Evidence({
    id: "document-example", taxYear: "2026/27", employer: "Example Engineering Limited",
    date: "2027-04-05", taxablePay: 42000, taxPaid: 8200, importedAt: "2027-04-06",
  });
  const base = createFreshStore();
  const profile = enableFeaturePack({
    ...base.profile,
    accounts: [
      { id: "account-current", name: "Everyday account", kind: "current", coverage: "required" },
      { id: "account-card", name: "Example card", kind: "credit-card", coverage: "required" },
    ],
    goals: [{ id: "goal-reserve", name: "Reserve", target: 6000, colour: "#397ca0" }],
    paySchedule: { payday: 25, rules: [] },
    incomeSources: [{ kind: "salary", merchantContains: ["example payroll"] }],
    csvMappings: [{ version: 1, id: "mapping-example", name: "Example bank export", accountId: "account-current", dateColumn: "Date", descriptionColumn: "Payee", amountMode: "single", amountColumn: "Amount", dateFormat: "UK", spendingSign: "negative" }],
  }, "uk-tax");
  return migrateTaxStore({
    ...base, profile, onboarding: { version: 1, status: "completed", step: "review" }, payday: 25,
    balances: [
      { id: "account-current", name: "Everyday account", group: "asset", type: "Current account", value: 1800, asOf: "2026-10-25" },
      { id: "account-card", name: "Example card", group: "liability", type: "Credit card", value: 250, asOf: "2026-10-24" },
    ],
    transactions: [
      { id: "transaction-salary", date: "2026-10-25", merchant: "Example Payroll", amount: 3000, account: "account-current", category: "Income", categoryGroup: "income", subcategory: "Salary", role: "salary" },
      { id: "transaction-membership", date: "2026-10-27", merchant: "Example Membership", amount: -25, account: "account-current", category: "Bills", categoryGroup: "essential", subcategory: "Membership", spendingTreatment: "Recurring" },
    ],
    goals: [{ id: "goal-reserve", name: "Reserve", target: 6000, current: 1550, colour: "#397ca0" }],
    recurringCommitments: [{ id: "merchant:example membership", key: "example membership", label: "Example Membership", category: "Bills", subcategory: "Membership", scheduledAmount: 25, frequency: "monthly", lastDate: "2026-10-27", paymentMethod: "card", status: "user-overridden", source: "User confirmation" }],
    accountCoverageConfirmations: { "2026-10": { "account-card": { through: "2026-11-24", confirmedAt: "2026-11-24T12:00:00Z" } } },
    taxDocuments: [evidence.document], taxFacts: evidence.facts,
    updatedAt: "2026-11-24",
  });
};

test("current Personal CFO backup round-trips every release-critical configuration area", () => {
  const source = migrateBalanceHistory(syntheticCurrentStore());
  const restored = restoreThroughCurrentMigrations(source);
  assert.equal(financeStoresMatch(source, restored), true);
  assert.deepEqual(financeStoreDigest(restored), financeStoreDigest(source));
  assert.deepEqual(restored.profile.csvMappings, source.profile.csvMappings);
  assert.deepEqual(restored.profile.categories, source.profile.categories);
  assert.deepEqual(restored.profile.paySchedule, source.profile.paySchedule);
  assert.deepEqual(restored.accountCoverageConfirmations, source.accountCoverageConfirmations);
  assert.deepEqual(restored.taxFacts, source.taxFacts);
  assert.equal(isFeaturePackEnabled(restored.profile, "uk-tax"), true);
});

test("backup migration matrix preserves records across pre-profile, pre-commitment, pre-category and pre-pack shapes", () => {
  const current = syntheticCurrentStore();
  const cases = [
    { name: "pre-profile", value: { ...current, profile: undefined, onboarding: undefined } },
    { name: "pre-recurring-commitments", value: { ...current, recurringCommitments: undefined } },
    { name: "pre-user-categories", value: { ...current, profile: { ...current.profile, version: 1, categories: undefined } } },
    { name: "pre-feature-packs", value: { ...current, profile: { ...current.profile, version: 5, enabledPacks: undefined } } },
  ];
  for (const fixture of cases) {
    const restored = restoreThroughCurrentMigrations(fixture.value);
    assert.equal(restored.transactions.length, fixture.value.transactions.length, `${fixture.name}: transactions`);
    assert.equal(restored.balances.length, fixture.value.balances.length, `${fixture.name}: balances`);
    assert.equal(restored.goals.length, fixture.value.goals.length, `${fixture.name}: goals`);
    assert.deepEqual(restored.transactions.map(row => row.id), fixture.value.transactions.map(row => row.id), `${fixture.name}: transaction IDs`);
    assert.deepEqual(restored.balances.map(row => row.id), fixture.value.balances.map(row => row.id), `${fixture.name}: balance IDs`);
    assert.ok(restored.profile.categories?.length, `${fixture.name}: categories migrated`);
    assert.equal(isFeaturePackEnabled(restored.profile, "uk-tax"), true, `${fixture.name}: Tax retained`);
    assert.deepEqual(restored.taxFacts, current.taxFacts, `${fixture.name}: Tax evidence`);
    assert.deepEqual(restored.accountCoverageConfirmations, current.accountCoverageConfirmations, `${fixture.name}: coverage`);
    if (fixture.name !== "pre-recurring-commitments") assert.deepEqual(restored.recurringCommitments, current.recurringCommitments, `${fixture.name}: commitments`);
  }
});

test("fresh backup stays neutral and round-trips onboarding without enabling optional Tax", () => {
  const source = createFreshStore();
  const restored = restoreThroughCurrentMigrations(source);
  assert.equal(financeStoresMatch(source, restored), true);
  assert.deepEqual(restored.profile.accounts, []);
  assert.deepEqual(restored.profile.goals, []);
  assert.equal(restored.profile.incomeSources, undefined);
  assert.equal(restored.profile.propertyConfig, undefined);
  assert.equal(restored.profile.taxEmployers, undefined);
  assert.equal(isFeaturePackEnabled(restored.profile, "uk-tax"), false);
  assert.deepEqual(restored.onboarding, source.onboarding);
});
