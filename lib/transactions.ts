import type { SpendingTreatment, Tx } from "./types.ts";
import { inferSubcategory, isInternalPotTransfer } from "./classification.ts";
import { legacyCardRepaymentDescription } from "./legacy-repayments.ts";
import { transactionRole } from "./transaction-roles.ts";

export const legacyTransactionKey = (transaction: Pick<Tx, "date" | "merchant" | "amount" | "account">) => `${transaction.date}|${transaction.merchant.trim().toLowerCase()}|${transaction.amount.toFixed(2)}|${transaction.account.trim().toLowerCase()}`;
/**
 * Provider IDs win. Imported fingerprints are the next-best identity; only
 * legacy records without either use the cautious date/merchant/value fallback.
 */
export const transactionKey = (transaction: Pick<Tx, "sourceId" | "fingerprint" | "date" | "merchant" | "amount" | "account">) => transaction.sourceId
  ? `${transaction.account.trim().toLowerCase()}|source:${transaction.sourceId.trim().toLowerCase()}`
  : transaction.fingerprint
    ? `${transaction.account.trim().toLowerCase()}|fingerprint:${transaction.fingerprint.trim().toLowerCase()}`
    : legacyTransactionKey(transaction);

/** Match stable provider IDs; consume legacy matches once so real repeated payments survive. */
export function reconcileImportedTransactions(base: Tx[], imported: Tx[]) {
  const reconciled=[...base];const consumedLegacy=new Set<number>();const sourceKeys=new Set(base.filter(transaction=>transaction.sourceId).map(transactionKey));const fingerprintKeys=new Set(base.filter(transaction=>!transaction.sourceId&&transaction.fingerprint).map(transactionKey));const legacyKeys=new Set(base.filter(transaction=>!transaction.sourceId&&!transaction.fingerprint).map(legacyTransactionKey));const fresh:Tx[]=[];let skipped=0;
  for(const transaction of imported){
    if(transaction.sourceId){const sourceKey=transactionKey(transaction);if(sourceKeys.has(sourceKey)){skipped++;continue}const fallbackKey=legacyTransactionKey(transaction);const legacyIndex=reconciled.findIndex((candidate,index)=>!candidate.sourceId&&!consumedLegacy.has(index)&&legacyTransactionKey(candidate)===fallbackKey);if(legacyIndex>=0){consumedLegacy.add(legacyIndex);reconciled[legacyIndex]={...reconciled[legacyIndex],sourceId:transaction.sourceId,transactionTime:transaction.transactionTime,reference:transaction.reference??reconciled[legacyIndex].reference};sourceKeys.add(sourceKey);skipped++;continue}sourceKeys.add(sourceKey);fresh.push(transaction);continue}
    const key=legacyTransactionKey(transaction);const fingerprintKey=transaction.fingerprint?transactionKey(transaction):"";if((fingerprintKey&&fingerprintKeys.has(fingerprintKey))||legacyKeys.has(key)){skipped++;continue}if(fingerprintKey)fingerprintKeys.add(fingerprintKey);else legacyKeys.add(key);fresh.push(transaction)
  }
  return {base:reconciled,fresh,skipped};
}
export const isCardRepayment = (transaction: Pick<Tx, "merchant" | "account"> & Partial<Pick<Tx,"category"|"subcategory"|"amount"|"subcategoryId"|"categoryGroup"|"categoryId"|"role">>) =>
  transaction.role!==undefined?transaction.role==="debt-repayment":legacyCardRepaymentDescription(transaction.merchant,transaction.account)||transaction.subcategoryId?.endsWith("credit-card-payment")===true;
export const isReimbursableBusinessExpense = (transaction: Tx) => transaction.amount < 0 && (transaction.categoryGroup === "work" || transaction.category === "Business expenses" || transaction.spendingTreatment === "Reimbursable business");
export const isBusinessExpenseReimbursement = (transaction: Tx) => transaction.amount > 0 && (transaction.categoryGroup === "work" || transaction.category === "Business expenses");
export const isBusinessExpenseActivity = (transaction: Tx) => isReimbursableBusinessExpense(transaction) || isBusinessExpenseReimbursement(transaction);

export function businessExpensePosition(transactions: Tx[]) {
  const spent = transactions.filter(isReimbursableBusinessExpense).reduce((total, transaction) => total - transaction.amount, 0);
  const reimbursed = transactions.filter(isBusinessExpenseReimbursement).reduce((total, transaction) => total + transaction.amount, 0);
  return { spent, reimbursed, outstanding: Math.max(0, spent - reimbursed), net: reimbursed - spent };
}

export const isExcludedFromSpending = (transaction: Tx) => ["debt-repayment","transfer","savings-contribution","savings-challenge","bills-reserve"].includes(transactionRole(transaction)) || isInternalPotTransfer(transaction) || isReimbursableBusinessExpense(transaction) || Boolean(transaction.categoryGroup&&["transfer","future","work"].includes(transaction.categoryGroup));
export const isPayYourselfFirstMovement = (transaction: Tx) => ["savings-contribution","savings-challenge"].includes(transactionRole(transaction));

/**
 * Net cash returned from genuine savings destinations during a period.
 * Deposits made in the same period reduce the amount shown as funding used;
 * routine bills-pot releases are excluded because they are reserved cash.
 */
export const savingsFundingUsed = (transactions: Tx[]) => Math.max(0, transactions
  .filter(isPayYourselfFirstMovement)
  .reduce((total, transaction) => total + transaction.amount, 0));

/**
 * Net cash moved to each genuine savings destination. Positive values mean
 * money was added; negative values mean money was returned to the current
 * account. Bills-pot funding is deliberately excluded.
 */
export const savingsMovementBreakdown = (transactions: Tx[]) => Object.entries(transactions
  .filter(isPayYourselfFirstMovement)
  .reduce<Record<string, number>>((summary, transaction) => {
    const destination = transaction.subcategory || inferSubcategory(transaction.category, transaction.merchant);
    summary[destination] = (summary[destination] || 0) - transaction.amount;
    return summary;
  }, {}))
  .filter(([, value]) => Math.abs(value) >= .005)
  .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a));

export const spendingTreatmentFor = (transaction: Tx): SpendingTreatment => {
  if (isReimbursableBusinessExpense(transaction) || transaction.categoryGroup === "work" || transaction.category === "Business expenses") return "Reimbursable business";
  if (transaction.spendingTreatment) return transaction.spendingTreatment;
  if (isExcludedFromSpending(transaction)) return "Transfer / savings";
  if (/direct debit/i.test(transaction.transactionType ?? "")) return "Recurring";
  return "Normal variable";
};

export const spendingTreatmentSummary = (transactions: Tx[]) => transactions
  .filter(transaction => transaction.amount < 0 && !isExcludedFromSpending(transaction))
  .reduce<Record<Exclude<SpendingTreatment, "Transfer / savings" | "Reimbursable business">, number>>((summary, transaction) => {
    const treatment = spendingTreatmentFor(transaction);
    if (treatment !== "Transfer / savings" && treatment !== "Reimbursable business") summary[treatment] += -transaction.amount;
    return summary;
  }, { "Recurring": 0, "Normal variable": 0, "Planned one-off": 0, "Unplanned one-off": 0 });
