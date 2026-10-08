import type { TransactionRole, Tx, UserProfile } from "./types.ts";
import { categoryFor } from "./categories.ts";
import { legacyCardRepaymentDescription } from "./legacy-repayments.ts";

type RoleRow = Pick<Tx,"merchant"|"category"|"amount"> & Partial<Pick<Tx,"account"|"subcategory"|"categoryId"|"subcategoryId"|"categoryGroup"|"transactionType"|"role">>;
const aliasMatches=(merchant:string,kind:"salary"|"rental",profile?:UserProfile)=>profile?.incomeSources?.some(source=>source.kind===kind&&source.merchantContains.some(alias=>alias&&merchant.toLowerCase().includes(alias.toLowerCase())))??false;
export const legacySavingsChallengeDescription=(merchant:string,account:string)=>account.toLowerCase()==="monzo"&&/\b(?:1p\s+)?saving challenge\b/i.test(merchant);

/** Only the migration/compatibility path interprets old category labels and IDs. */
export function legacyTransactionRole(row:RoleRow,profile?:UserProfile):TransactionRole {
  if(legacyCardRepaymentDescription(row.merchant,row.account??"")||row.subcategoryId?.endsWith("/subcategory:credit-card-payment")||row.category==="Transfers"&&row.subcategory==="Credit card payment")return "debt-repayment";
  if(row.subcategoryId?.endsWith("/subcategory:maintenance")||row.category==="Children"&&row.subcategory==="Maintenance")return "maintenance";
  if(row.subcategoryId?.endsWith("/subcategory:savings-challenge")||row.category==="Savings"&&row.subcategory==="Savings challenge"||legacySavingsChallengeDescription(row.merchant,row.account??""))return "savings-challenge";
  if(row.category==="Savings"||row.categoryGroup==="future")return row.subcategoryId?.endsWith("/subcategory:bills-pot")||row.subcategory==="Bills pot"?"bills-reserve":"savings-contribution";
  if(row.category==="Transfers"||row.categoryGroup==="transfer"||/pot transfer/i.test(row.transactionType??""))return "transfer";
  const income=row.category==="Income"||row.categoryGroup==="income";
  if(row.amount>0&&income&&(row.subcategoryId?.endsWith("/subcategory:salary")||row.subcategory==="Salary"||aliasMatches(row.merchant,"salary",profile)||/payroll|salary/i.test(row.merchant)))return "salary";
  if(row.amount>0&&income&&(row.subcategoryId?.endsWith("/subcategory:rental-income")||row.subcategory==="Rental income"||aliasMatches(row.merchant,"rental",profile)))return "rental-income";
  return "none";
}

/** Existing bare test/legacy rows remain readable; new and migrated rows persist a role. */
export const transactionRole=(row:RoleRow,profile?:UserProfile):TransactionRole=>row.role??legacyTransactionRole(row,profile);
export const hasRole=(row:RoleRow,role:TransactionRole,profile?:UserProfile)=>transactionRole(row,profile)===role;

/** Resolve user-owned role defaults before any provider suggestion. */
export function configuredTransactionRole(row:RoleRow,profile?:UserProfile):TransactionRole|undefined {
  const category=categoryFor(profile,row);
  const sub=category?.subcategories.find(item=>item.id===row.subcategoryId)??category?.subcategories.find(item=>item.name===row.subcategory);
  if(sub?.role!==undefined)return sub.role;
  if(row.amount>0&&aliasMatches(row.merchant,"salary",profile))return "salary";
  if(row.amount>0&&aliasMatches(row.merchant,"rental",profile))return "rental-income";
  return undefined;
}

/** New imports get a concrete value, including none, so old labels cannot govern them later. */
export function assignTransactionRole(row:RoleRow,profile?:UserProfile,suggested?:TransactionRole):TransactionRole {
  return configuredTransactionRole(row,profile)??row.role??suggested??(profile?.origin==="legacy"?legacyTransactionRole(row,profile):"none");
}
