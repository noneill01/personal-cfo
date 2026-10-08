import assert from "node:assert/strict";
import test from "node:test";
import { applyUserProfile, classifyConfiguredIncome, createFreshStore, migrateUserProfile, syncUserProfileInPlace, USER_PROFILE_VERSION } from "../lib/profile.ts";
import { accountKind, assetBalance, debtBalance, cashBalance, createBalanceSnapshot } from "../lib/balances.ts";
import { classifyWithRules, inferCategory, inferSubcategory } from "../lib/classification.ts";
import { isSalaryTransaction, isRentalIncome, payCycleAnchorDates, payCycleKey } from "../lib/pay-cycles.ts";
import { parseBackup, serialiseBackup } from "../lib/backup.ts";
import { financeStoresMatch, loadFinanceStore, saveFinanceStore } from "../lib/storage.ts";

const legacyStore = () => ({
  transactions: [{ id: "t1", date: "2026-01-02", merchant: "Example shop", account: "Example bank", category: "Groceries", amount: -25 }],
  balances: [
    { id: "bank", name: "Everyday account", type: "Current account", group: "asset", value: 1500 },
    { id: "home", name: "Home", type: "Property", group: "asset", value: 100000 },
    { id: "card", name: "Card", type: "Credit card", group: "liability", value: 300 },
  ],
  goals: [{ id: "ef", name: "Reserve", target: 5000, current: 1200, colour: "green" }],
  snapshots: [{ date: "2026-01-01", netWorth: 101000, cash: 1500, pension: 0, debt: 500 }],
  imports: [{ id: "batch-1", fileName: "synthetic.csv", importedAt: "2026-01-02", added: 1, skipped: 0 }],
  merchantRules: [{ key: "example shop", label: "Example shop", category: "Groceries", subcategory: "Local", updatedAt: "2026-01-02" }],
  customSubcategories: { Groceries: ["Local"] },
  payday: 21, paydayRules: [{ effectiveFrom: "2026-01", payday: 21, employer: "Example employer" }],
  monthlyBudget: 1000, updatedAt: "2026-01-02",
});

test("fresh store and profile contain no personal accounts, goals, providers or payday", () => {
  const store = createFreshStore();
  assert.equal(store.profile.version, USER_PROFILE_VERSION);
  assert.equal(store.profile.origin, "fresh");
  assert.deepEqual(store.profile.accounts, []);
  assert.deepEqual(store.profile.goals, []);
  assert.deepEqual(store.profile.merchantRules, []);
  assert.deepEqual(store.profile.customSubcategories, {});
  assert.equal(store.profile.paySchedule, undefined);
  assert.deepEqual(store.balances, []);
  assert.deepEqual(store.goals, []);
  assert.deepEqual(store.transactions, []);
  assert.equal(store.payday, undefined);
  assert.equal(store.cardStatement, undefined);
  assert.equal(store.monzoBalanceTracking, undefined);
  assert.equal(store.esppRefundAmount, undefined);
  assert.equal(store.planningIncome, 0);
  assert.equal(store.profile.accounts.some(item => "value" in item), false);
  assert.equal(JSON.stringify(store).includes("Example employer"), false);
  assert.equal(store.profile.incomeSources, undefined);
  assert.equal(store.profile.merchantCategoryHints, undefined);
  assert.equal(store.profile.merchantSubcategoryHints, undefined);
  assert.equal(store.profile.propertyConfig, undefined);
  assert.equal(store.profile.planning, undefined);
  assert.equal(JSON.stringify(store.profile).match(/previousEmployer|currentEmployer|example-user|rentalProperty|primary lender|barclaycard|monzo/i), null);
  assert.equal(JSON.stringify(store).match(/previousEmployer|currentEmployer|example-user|rentalProperty|mainHome|primary lender|barclaycard|monzo|tenant/i), null);
});

test("a current-schema profile is self-sufficient and bypasses removed private fallbacks",()=>{
  const source=migrateUserProfile(legacyStore());
  source.profile={...source.profile,
    enabledPacks:["uk-tax"],
    taxEmployers:[{id:"example-employer",displayName:"Example Employer",aliases:["Example Employer Limited"]}],
    incomeSources:[{kind:"salary",merchantContains:["example payroll"]},{kind:"rental",merchantContains:["example tenant"]}],
    merchantCategoryHints:[{category:"Housing",merchantContains:["example lender"]}],
    merchantSubcategoryHints:[{category:"Housing",subcategory:"Mortgage",merchantContains:["example lender"]}],
    propertyConfig:{rentalCategory:"Rental costs",rentalMortgageMerchantKey:"rental lender",homeMortgageMerchantKey:"home lender"},
    planning:{income:4200,budgetPlan:{Housing:1200},annualSalary:84000,employeePensionRate:.06,employerPensionRate:.08,pensionProvider:"Example Pension"},
  };
  source.recurringCommitments=[{id:"example-commitment",key:"example",label:"Example service",category:"Bills",scheduledAmount:25,frequency:"monthly",lastDate:"2026-01-02",paymentMethod:"card",status:"confirmed",source:"Synthetic"}];
  source.accountCoverageConfirmations={"2026-01":{bank:{through:"2026-01-31",confirmedAt:"2026-02-01"}}};
  const before=structuredClone(source);
  assert.equal(migrateUserProfile(source),source);
  assert.deepEqual(source,before);
  for(const key of ["accounts","goals","paySchedule","merchantRules","categories","customSubcategories","incomeSources","propertyConfig","planning","enabledPacks","taxEmployers"])assert.deepEqual(source.profile[key],before.profile[key],key);
  assert.deepEqual(source.recurringCommitments,before.recurringCommitments);
  assert.deepEqual(source.accountCoverageConfirmations,before.accountCoverageConfirmations);
});

test("migrated profile supplies the existing pay-cycle and income-source behaviour", () => {
  const source = legacyStore();
  const migrated = migrateUserProfile(source);
  const rules = migrated.profile.paySchedule.rules;
  const anchors = [{ date: "2026-01-21", employer: "Example employer" }];
  const before = payCycleAnchorDates(anchors, source.paydayRules, source.payday, "2026-02");
  const after = payCycleAnchorDates(anchors, rules, migrated.profile.paySchedule.payday, "2026-02");
  assert.deepEqual(after, before);
  assert.equal(payCycleKey("2026-01-22", source.payday, before), payCycleKey("2026-01-22", migrated.profile.paySchedule.payday, after));
  const salary = { merchant: "Example Payroll", category: "Income", subcategory: "Salary", amount: 1800 };
  assert.equal(isSalaryTransaction(salary, migrated.profile.incomeSources), true);
  assert.equal(isRentalIncome({ ...salary, subcategory: "Rental income", role: "rental-income" }, migrated.profile.incomeSources), true);
});

test("an explicit strict incoming-employer rule survives generic migration", () => {
  const old = legacyStore();
  old.payday = 28;
  old.paydayRules = [{ effectiveFrom: "2026-08", payday: 28, employer: "Northstar Systems", strictStart:true }];
  const migrated = migrateUserProfile(old);
  assert.equal(migrated.profile.paySchedule.rules[0].strictStart, true);
  assert.equal(migrated.paydayRules[0].strictStart, true);
  const anchors = [{ date: "2026-08-27", employer: "Northstar Systems" }];
  const dates = payCycleAnchorDates(anchors, migrated.profile.paySchedule.rules, 28, "2026-09");
  assert.equal(payCycleKey("2026-08-27", 28, dates), "2026-07");
});

test("authoritative profile wins conflicting legacy configuration without changing money or history", () => {
  const source = migrateUserProfile(legacyStore());
  const profile = structuredClone(source.profile);
  profile.accounts[0].name = "Chosen account";
  profile.goals[0].target = 9000;
  profile.paySchedule = { payday: 17, rules: [{ effectiveFrom: "2026-01", payday: 17, employer: "Chosen employer" }] };
  profile.merchantRules = [{ key: "example shop", label: "Example shop", category: "Home", subcategory: "Repairs", updatedAt: "2026-01-03" }];
  profile.customSubcategories = { Home: ["Repairs"] };
  profile.planning = { income: 4000, budgetPlan: { Home: 200 } };
  const conflicting = { ...source, profile, payday: 21, planningIncome: 1000, budgetPlan: { Home: 10 }, merchantRules: source.merchantRules };
  const result = applyUserProfile(conflicting);
  assert.equal(result.balances[0].name, "Chosen account");
  assert.equal(result.balances[0].value, 1500);
  assert.equal(result.goals[0].target, 9000);
  assert.equal(result.goals[0].current, 1200);
  assert.equal(result.payday, 17);
  assert.equal(result.planningIncome, 4000);
  assert.equal(result.budgetPlan.Home, 200);
  assert.deepEqual(result.merchantRules, profile.merchantRules);
  assert.equal(classifyWithRules(source.transactions[0], result.profile.merchantRules).category, "Home");
  assert.deepEqual(result.transactions, source.transactions);
  assert.deepEqual(result.snapshots, source.snapshots);
  assert.equal(assetBalance(result.balances) - debtBalance(result.balances), assetBalance(source.balances) - debtBalance(source.balances));
  const restored = applyUserProfile(migrateUserProfile(parseBackup(serialiseBackup(conflicting))));
  assert.deepEqual(restored.profile, profile);
  assert.equal(restored.payday, 17);
  assert.equal(restored.goals[0].target, 9000);
});

test("profile income aliases classify deposits without embedding a personal employer in core", () => {
  const profile = { ...createFreshStore().profile, incomeSources: [
    { kind: "salary", merchantContains: ["example payroll co"] },
    { kind: "rental", merchantContains: ["example tenant"] },
  ] };
  assert.equal(inferCategory("Example Payroll Co", "", profile.incomeSources), "Income");
  assert.equal(inferSubcategory("Income", "Example Tenant", "", profile.incomeSources), "Rental income");
  const rows = [
    { id: "salary", date: "2026-01-01", merchant: "Example Payroll Co", account: "Example bank", category: "Other", amount: 1000 },
    { id: "rent", date: "2026-01-02", merchant: "Example Tenant", account: "Example bank", category: "Other", amount: 500 },
    { id: "spend", date: "2026-01-03", merchant: "Example Tenant", account: "Example bank", category: "Other", amount: -30 },
  ];
  const classified = classifyConfiguredIncome(rows, profile);
  assert.deepEqual(classified.map(row => [row.category, row.subcategory]), [["Other", undefined], ["Income", "Rental income"], ["Other", undefined]]);
  assert.equal(classified[0], rows[0]);
  assert.equal(classified[2], rows[2]);
});

test("merchant-specific category hints apply only when configured in the profile", () => {
  const hints = [{ category: "Children", merchantContains: ["example child activity"] }];
  assert.equal(inferCategory("Example Child Activity", "", undefined, hints), "Children");
  assert.equal(inferCategory("Example Child Activity", ""), "Children");
  assert.equal(inferCategory("Person Name", ""), "Other");
  assert.equal(inferCategory("Person Name", "", undefined, [{ category: "Children", merchantContains: ["person name"] }]), "Children");
  assert.equal(inferSubcategory("Savings", "Example Pension Provider", "", undefined, [{ category: "Savings", subcategory: "Pension", merchantContains: ["example pension provider"] }]), "Pension");
});

test("version-one backups gain only migration configuration and remain idempotent", () => {
  const old = legacyStore();
  const versionOne = { ...old, profile: { version: 1, origin: "legacy", accounts: [{ id: "bank", name: "From profile", kind: "current" }], goals: [{ id: "ef", name: "Reserve", target: 7000, colour: "green" }], paySchedule: { payday: 19, rules: [] }, merchantRules: old.merchantRules, customSubcategories: old.customSubcategories } };
  const migrated = migrateUserProfile(parseBackup(serialiseBackup(versionOne)));
  assert.equal(migrated.profile.version, USER_PROFILE_VERSION);
  assert.equal(migrated.payday, 19);
  assert.equal(migrated.goals[0].target, 7000);
  assert.equal(migrated.balances[0].name, "From profile");
  assert.deepEqual(migrated.transactions.map(({categoryId,subcategoryId,role,...item})=>item), old.transactions);
  assert.equal(migrated.transactions[0].categoryId,"category:groceries");
  assert.deepEqual(migrateUserProfile(migrated), migrated);
});

test("legacy migration is additive, idempotent and preserves calculations and history", () => {
  const source = legacyStore();
  const before = structuredClone(source);
  const oldTotals = { assets: assetBalance(source.balances), debt: debtBalance(source.balances), cash: cashBalance(source.balances), snapshot: createBalanceSnapshot(source.balances, "2026-01-02") };
  const migrated = migrateUserProfile(source);
  assert.equal(migrated.profile.origin, "legacy");
  assert.equal(migrated.profile.version, USER_PROFILE_VERSION);
  assert.deepEqual(migrated.profile.accounts.map(item => item.kind), ["current", "property", "credit-card"]);
  assert.deepEqual(migrated.profile.goals, [{ id: "ef", name: "Reserve", target: 5000, colour: "green" }]);
  assert.equal(migrated.profile.goals[0].current, undefined);
  assert.deepEqual(migrated.profile.paySchedule, { payday: 21, rules: source.paydayRules });
  assert.deepEqual(migrated.profile.merchantRules.map(({categoryId,subcategoryId,...item})=>item), source.merchantRules);
  assert.equal(migrated.profile.merchantRules[0].categoryId,"category:groceries");
  assert.deepEqual(migrated.profile.customSubcategories, source.customSubcategories);
  for (const field of ["balances", "goals", "snapshots", "imports", "payday", "paydayRules", "customSubcategories"]) assert.deepEqual(migrated[field], before[field], field);
  assert.deepEqual(migrated.transactions.map(({categoryId,subcategoryId,role,...item})=>item),before.transactions);
  assert.deepEqual(migrated.merchantRules.map(({categoryId,subcategoryId,...item})=>item),before.merchantRules);
  assert.deepEqual({ assets: assetBalance(migrated.balances), debt: debtBalance(migrated.balances), cash: cashBalance(migrated.balances), snapshot: createBalanceSnapshot(migrated.balances, "2026-01-02") }, oldTotals);
  assert.deepEqual(source, before);
  assert.equal(migrateUserProfile(migrated), migrated);
  assert.equal(accountKind(migrated.balances[0]), "current");
});

test("configuration changes refresh the mirror without changing state identity or values", () => {
  const previous = migrateUserProfile(legacyStore());
  const store = { ...previous, goals: [{ ...previous.goals[0], target: 6000 }] };
  assert.equal(syncUserProfileInPlace(store, previous), store);
  assert.equal(store.profile.goals[0].target, 6000);
  assert.equal(store.goals[0].current, 1200);
});

test("legacy controls promote account, payday, category and plan edits to profile", () => {
  const previous = migrateUserProfile(legacyStore());
  const next = { ...previous,
    balances: previous.balances.map(balance => balance.id === "bank" ? { ...balance, name: "Renamed", value: 1800 } : balance),
    payday: 23,
    paydayRules: [{ effectiveFrom: "2026-02", payday: 23, employer: "Example employer" }],
    merchantRules: [{ key: "example shop", label: "Example shop", category: "Home", subcategory: "Repairs", updatedAt: "2026-02-01" }],
    customSubcategories: { Home: ["Repairs"] },
    planningIncome: 3500,
    budgetPlan: { Home: 250 },
  };
  syncUserProfileInPlace(next, previous);
  assert.equal(next.profile.accounts[0].name, "Renamed");
  assert.equal(next.balances[0].value, 1800);
  assert.equal(next.profile.paySchedule.payday, 23);
  assert.deepEqual(next.profile.paySchedule.rules, next.paydayRules);
  assert.equal(next.profile.merchantRules[0].category, "Home");
  assert.deepEqual(next.profile.customSubcategories, { Home: ["Repairs"] });
  assert.equal(next.profile.planning.income, 3500);
  assert.equal(next.profile.planning.budgetPlan.Home, 250);
  assert.deepEqual(next.transactions, previous.transactions);
});

test("editing a legacy budget field preserves profile-only salary and pension assumptions", () => {
  const baseline=migrateUserProfile(legacyStore());
  const previous=applyUserProfile({ ...baseline, profile: { ...baseline.profile, planning: { ...baseline.profile.planning, annualSalary: 91000, employeePensionRate: .05, employerPensionRate: .08, pensionProvider: "Example Pension" } } });
  const next={ ...previous, budgetPlan: { Home: 100 } };
  syncUserProfileInPlace(next, previous);
  assert.equal(next.profile.planning.budgetPlan.Home, 100);
  assert.equal(next.profile.planning.annualSalary, 91000);
  assert.equal(next.profile.planning.employeePensionRate, .05);
  assert.equal(next.profile.planning.employerPensionRate, .08);
  assert.equal(next.profile.planning.pensionProvider, "Example Pension");
});

test("new and legacy backups restore without dropping financial records", () => {
  const current = migrateUserProfile(legacyStore());
  assert.deepEqual(parseBackup(serialiseBackup(current)), current);
  const restoredLegacy = migrateUserProfile(parseBackup(serialiseBackup(legacyStore())));
  assert.deepEqual(restoredLegacy.transactions, current.transactions);
  assert.deepEqual(restoredLegacy.balances, current.balances);
  assert.deepEqual(restoredLegacy.snapshots, current.snapshots);
  assert.deepEqual(restoredLegacy.profile, current.profile);
});

test("IndexedDB save and reload retain the versioned profile and every collection", async () => {
  const previousIndexedDb = globalThis.indexedDB;
  const tables = new Map();
  const database = {
    objectStoreNames: { contains: name => tables.has(name) },
    createObjectStore(name) { tables.set(name, new Map()); },
    transaction() {
      const transaction = {
        objectStore(name) {
          const table = tables.get(name);
          return {
            put(record) { table.set(record.key, structuredClone(record)); },
            clear() { table.clear(); },
            get(key) { return request(() => structuredClone(table.get(key))); },
            getAll() { return request(() => [...table.values()].map(value => structuredClone(value))); },
          };
        },
      };
      setTimeout(() => transaction.oncomplete?.(), 0);
      return transaction;
    },
    close() {},
  };
  const request = producer => {
    const result = {};
    queueMicrotask(() => { result.result = producer(); result.onsuccess?.(); });
    return result;
  };
  globalThis.indexedDB = {
    open() {
      const result = { result: database };
      queueMicrotask(() => { result.onupgradeneeded?.(); result.onsuccess?.(); });
      return result;
    },
  };
  try {
    const fresh = createFreshStore();
    await saveFinanceStore(fresh);
    const reloadedFresh = await loadFinanceStore();
    assert.deepEqual(reloadedFresh.profile, fresh.profile);
    assert.deepEqual(reloadedFresh.balances, []);
    assert.equal(reloadedFresh.payday, undefined);
    const source = migrateUserProfile(legacyStore());
    source.profile.csvMappings = [{ version:1, id:"synthetic-csv", name:"Test bank", accountId:"test-current", dateColumn:"Date", descriptionColumn:"Description", amountMode:"single", amountColumn:"Amount" }];
    source.recurringCommitments = [{ id: "merchant:example service", key: "example service", label: "Example service", category: "Bills", scheduledAmount: 20, frequency: "monthly", lastDate: "2026-01-02", paymentMethod: "card", status: "confirmed", source: "Synthetic test" }];
    await saveFinanceStore(source);
    const loaded = await loadFinanceStore();
    assert.deepEqual(loaded.profile, source.profile);
    assert.deepEqual(loaded.transactions, source.transactions);
    assert.deepEqual(loaded.balances, source.balances);
    assert.deepEqual(loaded.snapshots, source.snapshots);
    assert.deepEqual(loaded.recurringCommitments, source.recurringCommitments);
    assert.equal(financeStoresMatch(source, loaded), true);
    assert.equal(financeStoresMatch(source, { ...loaded, recurringCommitments: [] }), false);
    assert.equal(financeStoresMatch(source, { ...loaded, profile: { ...loaded.profile, goals: [] } }), false);
  } finally {
    if (previousIndexedDb === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = previousIndexedDb;
  }
});
