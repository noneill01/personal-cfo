import type { CategoryConfig, CategoryGroup, MerchantRule, TransactionRole, Tx, UserProfile } from "./types.ts";

const slug = (value: string) => value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "other";
export const legacyCategoryId = (name: string) => `category:${slug(name)}`;
export const legacySubcategoryId = (categoryId: string, name: string) => `${categoryId}/subcategory:${slug(name)}`;

/** These names are migration compatibility, never Plan membership rules. */
const legacyGroups: Record<string, CategoryGroup> = {
  Housing: "essential", Bills: "essential", Groceries: "essential", Transport: "essential", Children: "essential", Health: "essential",
  "Eating out": "lifestyle", Shopping: "lifestyle", Entertainment: "lifestyle", Travel: "lifestyle", Cycling: "lifestyle", Home: "lifestyle", Other: "lifestyle",
  Savings: "future", Income: "income", Transfers: "transfer", "Business expenses": "work", "Rental property": "property",
};
export const legacyCategoryGroup = (name: string): CategoryGroup => legacyGroups[name] ?? "lifestyle";

export function makeCategory(name: string, group: CategoryGroup, subcategories: string[] = []): CategoryConfig {
  const id = legacyCategoryId(name);
  const used = new Set<string>();
  return { id, name, group, enabled: true, subcategories: [...new Set(subcategories)].map(sub => {
    const base=legacySubcategoryId(id,sub);let key=base,suffix=2;
    while(used.has(key))key=`${base}-${suffix++}`;
    used.add(key);return {id:key,name:sub,enabled:true};
  }) };
}

/** No person-, family-, employer- or property-specific starter categories. */
export const freshCategories = (): CategoryConfig[] => [
  makeCategory("Housing", "essential", ["Mortgage", "Rent", "Repairs"]),
  makeCategory("Bills", "essential", ["Utilities", "Insurance", "Subscriptions"]),
  makeCategory("Groceries", "essential"), makeCategory("Transport", "essential"),
  makeCategory("Health", "essential"), makeCategory("Eating out", "lifestyle"),
  makeCategory("Shopping", "lifestyle"), makeCategory("Entertainment", "lifestyle"),
  makeCategory("Travel", "lifestyle"), makeCategory("Home", "lifestyle"),
  makeCategory("Other", "lifestyle", ["Needs review"]),
  makeCategory("Income", "income", ["Salary", "Other income"]),
  makeCategory("Savings", "future", ["Cash savings", "ISA", "Pension"]),
  makeCategory("Transfers", "transfer", ["Internal transfer", "Credit card payment"]),
  makeCategory("Work expenses", "work"),
];

export function categoryFor(profile: UserProfile | undefined, value: Pick<Tx, "category" | "categoryId"> | Pick<MerchantRule, "category" | "categoryId"> | string) {
  const category = typeof value === "string" ? value : value.category;
  const id = typeof value === "string" ? undefined : value.categoryId;
  return profile?.categories?.find(item => item.id === id) ?? profile?.categories?.find(item => item.name === category) ?? profile?.categories?.find(item => item.id === legacyCategoryId(category));
}
export const categoryGroupFor = (profile: UserProfile | undefined, value: Pick<Tx, "category" | "categoryId"> | string): CategoryGroup => categoryFor(profile, value)?.group ?? legacyCategoryGroup(typeof value === "string" ? value : value.category);
export const categoryNameFor = (profile: UserProfile | undefined, value: Pick<Tx, "category" | "categoryId"> | string) => categoryFor(profile, value)?.name ?? (typeof value === "string" ? value : value.category);

export function resolveCategory<T extends Tx | MerchantRule>(item: T, profile?: UserProfile): T {
  const category = categoryFor(profile, item);
  if (!category) return item;
  const subcategory = category.subcategories.find(sub => sub.id === item.subcategoryId)
    ?? category.subcategories.find(sub => sub.name === item.subcategory);
  return { ...item, categoryId: category.id, category: category.name, ...( "merchant" in item ? { categoryGroup: category.group } : {}),
    ...(subcategory ? { subcategoryId: subcategory.id, subcategory: subcategory.name } : {}) };
}

export function addCategory(categories: CategoryConfig[], name: string, group: CategoryGroup): CategoryConfig[] {
  const clean = name.trim();
  if (!clean || categories.some(item => item.name.toLowerCase() === clean.toLowerCase())) return categories;
  const base = legacyCategoryId(clean);
  const ids = new Set(categories.map(item => item.id));
  let id = base, suffix = 2;
  while (ids.has(id)) id = `${base}-${suffix++}`;
  return [...categories, { id, name: clean, group, enabled: true, subcategories: [] }];
}
export function updateCategory(categories: CategoryConfig[], id: string, patch: Partial<Pick<CategoryConfig, "name" | "group" | "enabled">>): CategoryConfig[] {
  const clean = patch.name?.trim();
  if (patch.name !== undefined && (!clean || categories.some(item => item.id !== id && item.name.toLowerCase() === clean.toLowerCase()))) return categories;
  return categories.map(item => item.id === id ? { ...item, ...patch, ...(clean ? { name: clean } : {}) } : item);
}
export function addSubcategory(categories: CategoryConfig[], categoryId: string, name: string): CategoryConfig[] {
  const clean = name.trim();
  if (!clean) return categories;
  return categories.map(item => {
    if (item.id !== categoryId || item.subcategories.some(sub => sub.name.toLowerCase() === clean.toLowerCase())) return item;
    const base = legacySubcategoryId(categoryId, clean);
    const ids = new Set(item.subcategories.map(sub => sub.id));
    let id = base, suffix = 2;
    while (ids.has(id)) id = `${base}-${suffix++}`;
    return { ...item, subcategories: [...item.subcategories, { id, name: clean, enabled: true }] };
  });
}
export function updateSubcategory(categories: CategoryConfig[], categoryId: string, id: string, patch: { name?: string; enabled?: boolean; role?: TransactionRole }): CategoryConfig[] {
  const clean = patch.name?.trim();
  return categories.map(item => {
    if (item.id !== categoryId || (patch.name !== undefined && (!clean || item.subcategories.some(sub => sub.id !== id && sub.name.toLowerCase() === clean.toLowerCase())))) return item;
    return { ...item, subcategories: item.subcategories.map(sub => sub.id === id ? { ...sub, ...patch, ...(clean ? { name: clean } : {}) } : sub) };
  });
}
