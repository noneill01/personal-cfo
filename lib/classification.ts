import type { MerchantRule, Tx, UserProfile } from "./types.ts";
import { categoryFor, resolveCategory } from "./categories.ts";
import { assignTransactionRole, legacySavingsChallengeDescription } from "./transaction-roles.ts";

export const categories = ["Housing", "Rental property", "Bills", "Groceries", "Eating out", "Transport", "Children", "Travel", "Hobbies", "Home", "Shopping", "Entertainment", "Health", "Business expenses", "Income", "Savings", "Transfers", "Other"];

export const subcategories: Record<string, string[]> = {
  Housing: ["Mortgage", "Rates", "Repairs & maintenance", "Rental property", "Other housing"],
  "Rental property": ["Safety & compliance", "Heating", "Repairs & maintenance", "Insurance", "Rates & utilities", "Professional fees", "Fixtures & furnishings", "Capital improvements — review", "Other property cost"],
  Bills: ["Energy", "Broadband & mobile", "Insurance", "Subscriptions", "Other bills"],
  Groceries: ["Supermarkets", "Local shops", "Household essentials"],
  "Eating out": ["Restaurants", "Cafés & coffee", "Takeaways", "Pubs & bars"],
  Transport: ["Car payment", "Fuel", "Insurance & tax", "Parking", "Public transport", "Other transport"],
  Children: ["Maintenance", "School & childcare", "Activities", "Clothing & gifts"],
  Travel: ["Flights", "Accommodation", "Trips & activities", "Travel spending"],
  Hobbies: ["Equipment", "Training", "Events", "Social"],
  Home: ["Furniture", "DIY & repairs", "Garden", "Improvements"],
  Shopping: ["Amazon & online", "Clothing", "Gifts", "General retail"],
  Entertainment: ["Streaming", "Cinema & events", "Apps & software", "Other entertainment"],
  Health: ["Dental & medical", "Fitness", "Pharmacy", "Pets", "Other health"],
  "Business expenses": ["Flights", "Hotels", "Meals", "Ground transport", "Other work expense", "Reimbursement"],
  Income: ["Salary", "Bonus", "Rental income", "Refund", "Other income"],
  Savings: ["Bills pot", "Cash savings", "Savings challenge", "ISA", "Pension", "VCT"],
  Transfers: ["Internal transfer", "Credit card payment"],
  Other: ["Needs review", "Charity", "Miscellaneous"],
};

export const defaultSubcategories: Record<string, string> = { Housing: "Other housing", "Rental property": "Other property cost", Bills: "Other bills", Groceries: "Household essentials", "Eating out": "Restaurants", Transport: "Other transport", Children: "Activities", Travel: "Travel spending", Hobbies: "Equipment", Home: "Improvements", Shopping: "General retail", Entertainment: "Other entertainment", Health: "Other health", "Business expenses": "Other work expense", Income: "Other income", Savings: "Cash savings", Transfers: "Internal transfer", Other: "Needs review" };

type IncomeSources = UserProfile["incomeSources"];
const matchingIncomeSource = (merchant: string, sources?: IncomeSources) => sources?.find(source => source.merchantContains.some(alias => alias && merchant.toLowerCase().includes(alias.toLowerCase())));
export function inferCategory(merchant: string, raw = "", sources?: IncomeSources, categoryHints?: UserProfile["merchantCategoryHints"], mode: "legacy" | "generic" = "legacy") {
  if (matchingIncomeSource(merchant, sources)) return "Income";
  const categoryHint=categoryHints?.find(hint=>hint.merchantContains.some(alias=>alias&&merchant.toLowerCase().includes(alias.toLowerCase())));
  if (categoryHint) return categoryHint.category;
  // Native/provider categories are suggestions, never authoritative: the
  // profile classifier later resolves them to an enabled user category.
  if (mode === "generic") {
    if (/payroll|salary/i.test(merchant)) return "Income";
    if (/credit card (?:payment|repayment)/i.test(merchant)) return "Transfers";
    return raw.trim() || "Other";
  }
  const value = `${merchant} ${raw}`.toLowerCase();
  const rules: [string[], string][] = [
    [["salary", "payroll"], "Income"],
    [["mortgage", "lps rates", "land & property"], "Housing"],
    [["supermarket", "grocer", "food store"], "Groceries"],
    [["bike", "cycling", "training"], "Hobbies"],
    [["restaurant", "cafe", "coffee", "takeaway"], "Eating out"],
    [["petrol", "fuel", "parking", "car insurance", "public transport", "taxi", "train"], "Transport"],
    [["child", "school", "childcare"], "Children"],
    [["airline", "flight", "hotel", "airbnb", "booking"], "Travel"],
    [["furniture", "builder", "painter", "diy", "carpet", "skip hire", "garden"], "Home"],
    [["dental", "dentist", "gym", "pharmacy", "medical", "veterinary"], "Health"],
    [["streaming", "cinema", "tickets"], "Entertainment"],
    [["electric", "broadband", "insurance", "rates", "phone", "heating"], "Bills"],
    [["online marketplace", "clothing", "department store", "gift shop"], "Shopping"],
    [["transfer", "card payment", "barclaycard payment", "barclays credit card", "credit card payment"], "Transfers"],
    [["savings", "pot"], "Savings"],
  ];
  const matched = rules.find(([needles]) => needles.some(needle => value.includes(needle)))?.[1];
  if (matched) return matched;
  const native: Record<string, string> = { savings: "Savings", transfers: "Transfers", transport: "Transport", groceries: "Groceries", "eating out": "Eating out", starbucks: "Eating out", bills: "Bills", finances: "Bills", entertainment: "Entertainment", shopping: "Shopping", holidays: "Travel", income: "Income", "school dinners": "Children", "kids stuff": "Children", "child care": "Children", "child maintenance": "Children", family: "Children", "personal care": "Health", "hardware diy": "Home", gifts: "Shopping" };
  return native[raw.trim().toLowerCase()] ?? "Other";
}

export function merchantRuleKey(merchant: string) {
  return merchant.toLowerCase().replace(/^(sq\s*\*|zettle_\*)/i, "").replace(/\*[a-z0-9]+/gi, "").replace(/,\s*[^,]+$/, "").replace(/\b\d+\b/g, "").replace(/[^a-z&]+/g, " ").replace(/\s+/g, " ").trim();
}

export function inferSubcategory(category: string, merchant: string, raw = "", sources?: IncomeSources, hints?: UserProfile["merchantSubcategoryHints"]) {
  if (category === "Income") {
    const source = matchingIncomeSource(merchant, sources);
    if (source) return source.kind === "salary" ? "Salary" : "Rental income";
  }
  const hint=hints?.find(candidate=>candidate.category===category&&candidate.merchantContains.some(alias=>alias&&merchant.toLowerCase().includes(alias.toLowerCase())));
  if (hint) return hint.subcategory;
  const value = `${merchant} ${raw}`.toLowerCase();
  const rules: Record<string, [RegExp, string][]> = {
    Housing: [[/mortgage/, "Mortgage"], [/rates|land & property/, "Rates"], [/rental/, "Rental property"], [/repair|maintenance/, "Repairs & maintenance"]],
    "Rental property": [[/alarm|smoke|carbon monoxide|fire|electrical certificate|gas safety/, "Safety & compliance"], [/boiler|heating|plumb/, "Heating"], [/repair|maintenance|service/, "Repairs & maintenance"], [/insurance/, "Insurance"], [/rate|electric|energy|water|utility/, "Rates & utilities"], [/solicitor|accountant|agent|professional/, "Professional fees"], [/furniture|fixture|furnishing|appliance/, "Fixtures & furnishings"], [/improvement|extension|renovation/, "Capital improvements — review"]],
    Bills: [[/power ni|electric|kerrfuel|energy/, "Energy"], [/mobile|phone|broadband|1pmobile/, "Broadband & mobile"], [/insurance/, "Insurance"], [/netflix|spotify|audible|prime|subscription/, "Subscriptions"]],
    Groceries: [[/tesco|sainsbury|lidl|aldi|asda|m&s/, "Supermarkets"], [/spar|centra|carnbrooke/, "Local shops"]],
    "Eating out": [[/coffee|cafe|café|starbucks|costa|baker/, "Cafés & coffee"], [/deliveroo|just eat|takeaway/, "Takeaways"], [/pub|bar|duke of york|four horsemen/, "Pubs & bars"]],
    Transport: [[/bmw financial|car payment/, "Car payment"], [/shell|bp |petrol|fuel/, "Fuel"], [/insurance|dvla|tax/, "Insurance & tax"], [/parking|ncp|airport/, "Parking"], [/train|translink|uber|pidlitacka/, "Public transport"]],
    Children: [[/maintenance/, "Maintenance"], [/school|childcare/, "School & childcare"], [/airtastic|jumping jacks|lost city|activity/, "Activities"]],
    Travel: [[/easyjet|ryanair|flight/, "Flights"], [/hotel|airbnb|booking|marriott/, "Accommodation"], [/aqualand|safari|walkthrough|tour/, "Trips & activities"]],
    Hobbies: [[/training/, "Training"], [/event|race/, "Events"], [/coffee|cafe|café|social/, "Social"]],
    Home: [[/ikea|furniture|ashbury/, "Furniture"], [/b&q|screwfix|hornbach|skip|repair/, "DIY & repairs"], [/garden/, "Garden"]],
    Shopping: [[/amazon|amzn|online/, "Amazon & online"], [/clothing|timberland|stradivarius|next retail/, "Clothing"], [/gift|claires|the works/, "Gifts"]],
    Entertainment: [[/netflix|spotify|audible|prime/, "Streaming"], [/cinema|omniplex|ticket/, "Cinema & events"], [/app|software/, "Apps & software"]],
    Health: [[/dental|dentist|medical/, "Dental & medical"], [/gym|fitness|run north west|mr sports/, "Fitness"], [/pharmacy|boots/, "Pharmacy"], [/vet|veterina/, "Pets"]],
    "Business expenses": [[/easyjet|ryanair|flight|airline/, "Flights"], [/hotel|airbnb|booking|marriott/, "Hotels"], [/restaurant|meal|cafe|café|coffee/, "Meals"], [/taxi|uber|train|parking|translink/, "Ground transport"], [/reimburse|expense repayment/, "Reimbursement"]],
    Income: [[/salary|payroll/, "Salary"], [/bonus/, "Bonus"], [/rent/, "Rental income"], [/refund/, "Refund"]],
    Savings: [[/saving challenge|1p saving/, "Savings challenge"], [/isa/, "ISA"], [/pension/, "Pension"], [/vct/, "VCT"]],
    Transfers: [[/barclaycard|barclays.*card|credit card/, "Credit card payment"]],
    Other: [[/charity|latinlink|donation/, "Charity"]],
  };
  return rules[category]?.find(([pattern]) => pattern.test(value))?.[1] ?? defaultSubcategories[category] ?? "Miscellaneous";
}

export function isInternalPotTransfer(transaction: Pick<Tx, "merchant" | "account" | "transactionType">) {
  return /pot transfer/i.test(transaction.transactionType ?? "") || (transaction.account.toLowerCase() === "monzo" && /\bpot\b\s*$/i.test(transaction.merchant.trim()));
}

export function isSavingsChallengeTransfer(transaction: Pick<Tx, "merchant" | "account"> & Partial<Pick<Tx,"role">>) {
  return transaction.role!==undefined?transaction.role==="savings-challenge":legacySavingsChallengeDescription(transaction.merchant,transaction.account);
}

export function matchingMerchantRule(transaction: Tx, rules: MerchantRule[], requiredCategory?: string) {
  const key = merchantRuleKey(transaction.merchant);
  return rules.filter(rule => rule.key === key && (!requiredCategory || rule.category === requiredCategory || rule.categoryId === `category:${requiredCategory.toLowerCase()}`) && (!rule.effectiveFrom || transaction.date >= rule.effectiveFrom)).sort((a, b) => (b.effectiveFrom ?? "").localeCompare(a.effectiveFrom ?? "") || b.updatedAt.localeCompare(a.updatedAt))[0];
}

export function classifyWithRules(transaction: Tx, rules: MerchantRule[], sources?: IncomeSources, hints?: UserProfile["merchantSubcategoryHints"], profile?: UserProfile) {
  const finish=(candidate:Tx,suggested?:Tx["role"])=>{const resolved=resolveCategory(candidate,profile);return {...resolved,role:suggested??assignTransactionRole(resolved,profile)};};
  if (transaction.classificationOverride) return transaction.role===undefined?finish(transaction):{...resolveCategory(transaction,profile),role:transaction.role};
  // An archived historical assignment remains visible, while new imports can
  // no longer acquire it from a provider label or old merchant rule.
  if (transaction.categoryId && categoryFor(profile,transaction)?.enabled === false) return finish(transaction);
  const match = matchingMerchantRule(transaction, rules);
  if (match && categoryFor(profile,match)?.enabled !== false) return finish({ ...transaction, categoryId: match.categoryId, category: match.category, subcategoryId: match.subcategoryId, subcategory: match.subcategory,role:match.role??transaction.role },match.role);
  if (isInternalPotTransfer(transaction)) {
    const saved = matchingMerchantRule(transaction, rules, "Savings");
    const savingsChallenge = /saving challenge|1p saving/i.test(transaction.merchant);
    const genuineCashSavings = /daily savings|cash savings|emergency|rainy day/i.test(transaction.merchant);
    const destination=categoryFor(profile,"Savings")??profile?.categories?.find(item=>item.group==="future"&&item.enabled);
    const subcategory=saved?.subcategory??(savingsChallenge?"Savings challenge":genuineCashSavings?"Cash savings":"Bills pot");
    return finish({ ...transaction, categoryId:destination?.id, category:destination?.name??"Savings", subcategoryId:saved?.subcategoryId, subcategory,role:saved?.role??(savingsChallenge?"savings-challenge":genuineCashSavings?"savings-contribution":"bills-reserve") });
  }
  const selected = categoryFor(profile, transaction);
  const category = selected?.enabled === false ? profile?.categories?.find(item => item.id === "category:other" && item.enabled) : selected ?? profile?.categories?.find(item => item.id === "category:other" && item.enabled);
  const hintedRole=category?.group==="transfer"&&/credit card (?:payment|repayment)/i.test(transaction.merchant)?"debt-repayment":undefined;
  const confirmedIncome=sources?.find(source=>transaction.amount>0&&source.merchantContains.some(alias=>alias&&transaction.merchant.toLowerCase().includes(alias.toLowerCase())));
  const freshSubcategory=category?.group==="income"&&profile?.origin==="fresh"&&!transaction.subcategory
    ? category.subcategories.find(item=>item.enabled&&item.role===(confirmedIncome?.kind==="salary"?"salary":confirmedIncome?.kind==="rental"?"rental-income":"none"))
      ?? category.subcategories.find(item=>item.enabled&&item.name.toLowerCase().includes("other"))
    : category?.subcategories.find(item=>item.enabled&&item.name===transaction.subcategory)
    ?? category?.subcategories.find(item=>item.enabled&&item.role===hintedRole&&hintedRole!==undefined)
    ?? category?.subcategories.find(item=>item.enabled);
  const candidate = { ...transaction, ...(category ? {categoryId:category.id,category:category.name} : {}), subcategory:profile?.origin==="fresh"?freshSubcategory?.name:(transaction.subcategory || inferSubcategory(transaction.category, transaction.merchant, "", sources, hints)) };
  return finish(candidate);
}
