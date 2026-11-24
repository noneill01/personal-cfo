import type { CategoryConfig, SpendingNature, Tx, UserProfile } from './types.ts';
import { categoryFor, legacyCategoryId, legacySubcategoryId } from './categories.ts';
import { personalSpendingAmount, spendingTreatmentFor } from './transactions.ts';
import { transactionRole } from './transaction-roles.ts';

export const SPENDING_NATURES: Record<SpendingNature, string> = {
  'routine-discretionary': 'Routine discretionary',
  'variable-essential': 'Variable essentials',
  'irregular-discretionary': 'Irregular / planned discretionary',
  'home-property': 'Home / property',
  structural: 'Structural / fixed', work: 'Work / reimbursable',
  'non-spending': 'Non-spending', unclassified: 'Unclassified',
};
export const DEFAULT_SMALL_PURCHASE_THRESHOLD = 30;
const defaults: Record<string, SpendingNature> = {};
function seed(nature: SpendingNature, names: string[]) {
  for (const name of names) defaults[legacyCategoryId(name)] = nature;
}
seed('routine-discretionary', ['Eating out', 'Shopping', 'Entertainment']);
seed('variable-essential', ['Groceries', 'Transport', 'Health', 'Children', 'Childcare']);
seed('irregular-discretionary', ['Travel', 'Cycling']);
seed('home-property', ['Home']);
seed('structural', ['Housing', 'Bills']);
seed('work', ['Work expenses', 'Business expenses']);
seed('non-spending', ['Income', 'Savings', 'Transfers']);
for (const [category, subcategory, nature] of [
  ['Housing', 'Repairs', 'home-property'], ['Shopping', 'Gifts', 'irregular-discretionary'],
  ['Shopping', 'Furniture', 'irregular-discretionary'], ['Entertainment', 'Events', 'irregular-discretionary'],
  ['Entertainment', 'Subscriptions', 'structural'],
  ['Home', 'Furniture', 'irregular-discretionary'],
  ['Home', 'Furniture & furnishings', 'irregular-discretionary'],
] as const) defaults[legacySubcategoryId(legacyCategoryId(category), subcategory)] = nature;

/** Stable IDs, not names or broad Plan groups, own the default semantics. */
export function seedSpendingNatures(categories: CategoryConfig[]): CategoryConfig[] {
  return categories.map(category => ({ ...category,
    spendingNature: category.spendingNature ?? defaults[category.id] ?? 'unclassified',
    subcategories: category.subcategories.map(sub => ({ ...sub,
      ...(sub.spendingNature !== undefined || defaults[sub.id] ? { spendingNature: sub.spendingNature ?? defaults[sub.id] } : {}),
    })),
  }));
}

export function spendingNatureFor(row: Tx, profile?: UserProfile, confirmedRecurring = false): SpendingNature {
  const treatment = spendingTreatmentFor(row);
  if (treatment === 'Reimbursable business' || row.categoryGroup === 'work') return 'work';
  // An analysis preference can never turn a transfer, salary or savings movement into spending.
  if (personalSpendingAmount(row) === 0) return 'non-spending';
  if (row.categoryGroup === 'property') return 'home-property';
  const category = categoryFor(profile, row);
  const sub = category?.subcategories.find(item => item.id === row.subcategoryId || item.name === row.subcategory);
  const subId = sub?.id ?? row.subcategoryId ?? (row.subcategory ? legacySubcategoryId(category?.id ?? row.categoryId ?? legacyCategoryId(row.category), row.subcategory) : '');
  const nature = row.spendingNature ?? (sub ? sub.spendingNature : defaults[subId]) ?? category?.spendingNature
    ?? defaults[category?.id ?? row.categoryId ?? legacyCategoryId(row.category)] ?? 'unclassified';
  if (nature === 'home-property') return nature;
  if (confirmedRecurring || treatment === 'Recurring' || transactionRole(row) === 'maintenance') return 'structural';
  if (['Planned one-off', 'Unplanned one-off'].includes(treatment) && nature === 'routine-discretionary') return 'irregular-discretionary';
  // Work/non-spending preferences do not override the accounting exclusions above.
  return nature;
}

export function smallPurchaseThreshold(profile?: UserProfile): number {
  const value = profile?.spendingAnalysis?.smallPurchaseThreshold;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : DEFAULT_SMALL_PURCHASE_THRESHOLD;
}
