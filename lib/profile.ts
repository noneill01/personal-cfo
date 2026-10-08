import { accountKind } from "./balances.ts";
import { categoryFor, freshCategories, legacyCategoryGroup, makeCategory, resolveCategory } from "./categories.ts";
import { legacyTransactionRole } from "./transaction-roles.ts";
import { baselineMortgagePlanner } from "./mortgage.ts";
import type { Store, Tx, UserProfile } from "./types.ts";
import { DEFAULT_REGION, normaliseRegion } from "./region.ts";

export const USER_PROFILE_VERSION = 7;
export const defaultAccountCoverage = (kind: UserProfile["accounts"][number]["kind"]) => kind === "current" || kind === "credit-card" ? "required" as const : "excluded" as const;

// Profile owns identity, classification and planning configuration. The old
// Store fields are a compatibility projection for existing controls/backups;
// they do not win when a saved profile disagrees. Monetary balances, statement
// history, mortgage rates/payments and Direct Debit observation/archival state
// remain authoritative in Store because they are dated financial/operational
// state, not user identity defaults. Provider importers retain their own IDs.

// Pre-profile, owner-specific recovery data intentionally does not ship with
// the generic product. Current profiles already persist their full config;
// older generic stores are upgraded only from the data they actually contain.

/** A neutral first run: no personal accounts, income sources or planning assumptions. */
export function createFreshStore(): Store {
  const store: Store = {
    onboarding: { version: 1, status: "not-started", step: "welcome" },
    transactions: [], balances: [], goals: [], snapshots: [], imports: [],
    merchantRules: [], customSubcategories: {}, directDebitHidden: [], directDebitSettings: {},
    sinkingFunds: [], paydayAllocationsMoved: {},
    balanceReconciliations: [], cycleCloseouts: [], cycleAnnotations: {},
    payslips: [], mortgageStatements: [], mortgagePlanner: { ...baselineMortgagePlanner },
    monthlyBudget: 0, planningIncome: 0,
    budgetVersion: 2, classificationVersion: 1, paydayRules: [], paydayScheduleVersion: 1,
    updatedAt: "",
  };
  return migrateUserProfile(store, "fresh");
}

/** Extract configuration, never balance values or financial history. */
export function profileFromStore(store: Store, origin: UserProfile["origin"]): UserProfile {
  const observedSubcategories=(name:string)=>[
    ...(store.customSubcategories?.[name]??[]),
    ...store.transactions.filter(item=>item.category===name&&item.subcategory).map(item=>item.subcategory!),
    ...(store.merchantRules??[]).filter(item=>item.category===name&&item.subcategory).map(item=>item.subcategory),
  ];
  const configuredCategories = freshCategories().map(category => makeCategory(category.name, category.group, [
    ...category.subcategories.map(item => item.name), ...observedSubcategories(category.name),
  ]));
  const known = new Set(configuredCategories.map(item => item.name));
  for (const name of [...store.transactions.map(item => item.category), ...(store.merchantRules ?? []).map(item => item.category)]) {
    if (name && !known.has(name)) { configuredCategories.push(makeCategory(name, legacyCategoryGroup(name), observedSubcategories(name))); known.add(name); }
  }
  const usedCategoryIds=new Set<string>();
  const categories=configuredCategories.map(item=>{
    const base=item.id;let id=base,suffix=2;
    while(usedCategoryIds.has(id))id=`${base}-${suffix++}`;
    usedCategoryIds.add(id);
    const stable=id===base?item:{...item,id,subcategories:item.subcategories.map(sub=>({...sub,id:sub.id.replace(`${base}/`,`${id}/`)}))};
    return {...stable,subcategories:stable.subcategories.map(sub=>{
      const role=legacyTransactionRole({merchant:"",account:"",amount:1,category:stable.name,categoryId:stable.id,subcategory:sub.name,subcategoryId:sub.id,categoryGroup:stable.group});
      return role==="none"?sub:{...sub,role};
    })};
  });
  return {
    version: USER_PROFILE_VERSION,
    origin,
    region: { ...DEFAULT_REGION },
    enabledPacks: origin === "legacy" ? ["uk-tax"] : [],
    accounts: store.balances.map(({ id, name, type }) => { const kind=accountKind({ type }); return { id, name, kind, coverage:defaultAccountCoverage(kind) }; }),
    goals: store.goals.map(({ id, name, target, colour }) => ({ id, name, target, colour })),
    ...(store.payday === undefined && !(store.paydayRules?.length) ? {} : { paySchedule: { payday: store.payday ?? 28, rules: store.paydayRules ?? [] } }),
    merchantRules: (store.merchantRules ?? []).map(rule => ({ ...rule })),
    categories,
    customSubcategories: Object.fromEntries(Object.entries(store.customSubcategories ?? {}).map(([category, items]) => [category, [...items]])),
    ...(store.planningIncome || Object.keys(store.budgetPlan ?? {}).length ? { planning: { income: store.planningIncome ?? 0, budgetPlan: { ...(store.budgetPlan ?? {}) } } } : {}),
  };
}

/** Additively migrate previous profiles without changing historical labels or amounts. */
export function migrateUserProfile(store: Store, origin: UserProfile["origin"] = "legacy"): Store {
  if (store.profile && store.profile.version >= USER_PROFILE_VERSION && store.profile.categories && store.profile.region) return store;
  const existing = store.profile;
  const baseline = profileFromStore(store, existing?.origin ?? origin);
  const profile: UserProfile = existing ? {
    ...baseline, ...existing, version: USER_PROFILE_VERSION,
    region: normaliseRegion(existing.region),
    // Every pre-Phase-8 installation had Tax available, including profiles
    // first created by Phase 7 onboarding. Preserve that capability on upgrade.
    enabledPacks: existing.enabledPacks ?? ["uk-tax"],
    taxEmployers: existing.taxEmployers ?? baseline.taxEmployers,
    accounts:(existing.accounts??baseline.accounts).map(account=>({...account,coverage:account.coverage??defaultAccountCoverage(account.kind)})),
    categories: (existing.categories ?? baseline.categories ?? []).map(category=>({...category,subcategories:category.subcategories.map(sub=>{
      if(sub.role!==undefined)return sub;
      const role=legacyTransactionRole({merchant:"",account:"",amount:1,category:category.name,categoryId:category.id,subcategory:sub.name,subcategoryId:sub.id,categoryGroup:category.group});
      return role==="none"?sub:{...sub,role};
    })})),
    planning: existing.planning ? { ...baseline.planning, ...existing.planning, seedPlan: existing.planning.seedPlan ?? baseline.planning?.seedPlan } : baseline.planning,
    paySchedule: existing.paySchedule
      ? { ...existing.paySchedule, rules: existing.paySchedule.rules }
      : baseline.paySchedule,
  } : baseline;
  const transactions = store.transactions.map(item => {
    const resolved = resolveCategory(item, profile);
    const categoryId=item.categoryId??resolved.categoryId, subcategoryId=item.subcategoryId??resolved.subcategoryId;
    return { ...item, ...(categoryId?{categoryId}:{}), ...(subcategoryId?{subcategoryId}:{}),role:item.role??legacyTransactionRole({...item,categoryId,subcategoryId},profile) };
  });
  profile.merchantRules = profile.merchantRules.map(item => {
    const resolved = resolveCategory(item, profile);
    const categoryId=item.categoryId??resolved.categoryId, subcategoryId=item.subcategoryId??resolved.subcategoryId;
    const role=item.role??legacyTransactionRole({merchant:item.label,account:"",amount:1,category:item.category,subcategory:item.subcategory,categoryId,subcategoryId},profile);
    return { ...item, ...(categoryId?{categoryId}:{}), ...(subcategoryId?{subcategoryId}:{}),...(role!=="none"?{role}:{}) };
  });
  return applyUserProfile({ ...store, transactions, profile });
}

const legacyTypeForKind = (kind: UserProfile["accounts"][number]["kind"]) => ({
  current: "Current account", savings: "Cash", "cash-isa": "Cash ISA", "investment-isa": "Stocks & Shares ISA",
  investment: "VCT", "credit-card": "Credit card", mortgage: "Mortgage", loan: "Loan", pension: "Pension", property: "Property", other: "Other",
})[kind];

/** Project authoritative configuration onto old fields until their consumers migrate. */
export function applyUserProfile(store: Store): Store {
  const profile = store.profile;
  if (!profile) return store;
  const accountConfig = new Map(profile.accounts.map(account => [account.id, account]));
  const balances = store.balances.map(balance => {
    const config = accountConfig.get(balance.id);
    if (!config) return balance;
    return { ...balance, name: config.name, type: config.kind === accountKind(balance) ? balance.type : legacyTypeForKind(config.kind) };
  });
  const currentGoals = new Map(store.goals.map(goal => [goal.id, goal]));
  return { ...store, balances,
    goals: profile.goals.map(config => ({ ...config, current: currentGoals.get(config.id)?.current ?? 0 })),
    payday: profile.paySchedule?.payday, paydayRules: profile.paySchedule?.rules ?? [],
    merchantRules: profile.merchantRules.map(rule => ({ ...rule })),
    customSubcategories: Object.fromEntries(Object.entries(profile.customSubcategories).map(([key, values]) => [key, [...values]])),
    planningIncome: profile.planning?.income ?? 0, budgetPlan: { ...(profile.planning?.budgetPlan ?? {}) },
  };
}

/** Compatibility pass for income rows that predate profile-based source aliases. */
export function classifyConfiguredIncome(transactions: Tx[], profile?: UserProfile): Tx[] {
  if (!profile?.incomeSources?.length) return transactions;
  return transactions.map(transaction => {
    if (transaction.amount <= 0 || transaction.classificationOverride) return transaction;
    const source = profile.incomeSources?.find(candidate => candidate.kind === "rental" && candidate.merchantContains.some(alias => alias && transaction.merchant.toLowerCase().includes(alias.toLowerCase())));
    if (!source || transaction.role==="rental-income") return transaction;
    const income=categoryFor(profile,"Income")??profile.categories?.find(item=>item.group==="income"&&item.enabled);
    const rental=income?.subcategories.find(item=>item.role==="rental-income");
    return { ...transaction, category: income?.name??"Income", categoryId:income?.id, subcategory:rental?.name??"Rental income", subcategoryId:rental?.id,role:"rental-income" as const };
  });
}

/** Existing UI writes old fields; translate only actual edits back into profile. */
export function syncUserProfileInPlace(store: Store, previous?: Store): Store {
  if (!store.profile) Object.assign(store, migrateUserProfile(store));
  else if (previous?.profile && store.profile === previous.profile) {
    const before = profileFromStore(previous, previous.profile.origin);
    const after = profileFromStore(store, previous.profile.origin);
    const changed = <T,>(key: keyof UserProfile, value: T) => JSON.stringify(before[key]) !== JSON.stringify(after[key]) ? value : store.profile![key];
    const currentPlanning=store.profile.planning;
    const planning=currentPlanning ? { ...currentPlanning,
      ...(before.planning?.income !== after.planning?.income ? { income: after.planning?.income ?? 0 } : {}),
      ...(JSON.stringify(before.planning?.budgetPlan) !== JSON.stringify(after.planning?.budgetPlan) ? { budgetPlan: { ...(after.planning?.budgetPlan ?? {}) } } : {}),
    } : after.planning;
    store.profile = {
      ...store.profile,
      accounts: changed("accounts", after.accounts.map(account=>({...account,coverage:store.profile?.accounts.find(old=>old.id===account.id)?.coverage??defaultAccountCoverage(account.kind)}))) as UserProfile["accounts"],
      goals: changed("goals", after.goals) as UserProfile["goals"],
      paySchedule: changed("paySchedule", after.paySchedule) as UserProfile["paySchedule"],
      merchantRules: changed("merchantRules", after.merchantRules) as UserProfile["merchantRules"],
      customSubcategories: changed("customSubcategories", after.customSubcategories) as UserProfile["customSubcategories"],
      planning,
    };
  }
  Object.assign(store, applyUserProfile(store));
  return store;
}
