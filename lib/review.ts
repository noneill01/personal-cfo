import type { CycleCloseout, ImportRecord, Store, Tx } from "./types.ts";
import { isExcludedFromSpending, isPayYourselfFirstMovement, spendingTreatmentFor } from "./transactions.ts";

export function spendingBreakdown(transactions: Tx[]) {
  const result = { recurring: 0, variable: 0, planned: 0, unplanned: 0, business: 0, excluded: 0, personal: 0 };
  for (const t of transactions) {
    if (t.amount >= 0) continue;
    const amount = -t.amount;
    if (spendingTreatmentFor(t) === "Reimbursable business") { result.business += amount; continue; }
    if (isExcludedFromSpending(t)) { result.excluded += amount; continue; }
    const treatment = spendingTreatmentFor(t);
    result.personal += amount;
    if (treatment === "Recurring") result.recurring += amount;
    else if (treatment === "Planned one-off") result.planned += amount;
    else if (treatment === "Unplanned one-off") result.unplanned += amount;
    else result.variable += amount;
  }
  return Object.fromEntries(Object.entries(result).map(([k,v]) => [k, Math.round(v*100)/100])) as typeof result;
}

export function closeoutHasChanged(saved: CycleCloseout | undefined, income: number, spend: number, savedAmount: number) {
  return Boolean(saved && (Math.abs(saved.income-income) > .01 || Math.abs(saved.personalSpend+saved.rentalMortgage-spend) > .01 || Math.abs((saved.payYourselfFirst ?? 0)-savedAmount) > .01));
}

export function reviewReadiness(input: { coverageComplete: boolean; missingAccounts?: string[]; payslipRecorded: boolean; unreviewed: number }) {
  const missing: string[] = [];
  if (!input.coverageComplete) missing.push(...(input.missingAccounts?.length?input.missingAccounts.map(name=>`${name} coverage or review confirmation`):["Account coverage"]));
  if (!input.payslipRecorded) missing.push("Payslip for this cycle");
  if (input.unreviewed) missing.push(`${input.unreviewed} uncategorised transactions`);
  return { missing, ready: missing.length === 0 };
}

/** Guard a full-state undo against overwriting edits made after the import. */
export function canUndoImport(current: Store, committed: Store | null) { return committed !== null && current === committed; }

export function unresolvedImports(imports: ImportRecord[], start: string, end: string) {
  return imports.filter(batch => (batch.rejected ?? 0) > 0 && (!batch.from || batch.from <= end) && (!batch.to || batch.to >= start)
    && !imports.some(clean => clean.source === batch.source && clean.importedAt > batch.importedAt && clean.rejected === 0
      && clean.from && clean.to && batch.from && batch.to && clean.from <= batch.from && clean.to >= batch.to));
}

export function savingsTotals(transactions: Tx[]) {
  const rows=transactions.filter(isPayYourselfFirstMovement);
  const added=Math.round(rows.filter(t=>t.amount<0).reduce((sum,t)=>sum-t.amount,0)*100)/100;
  const withdrawn=Math.round(rows.filter(t=>t.amount>0).reduce((sum,t)=>sum+t.amount,0)*100)/100;
  return { added, withdrawn, net: Math.round((added-withdrawn)*100)/100, count:rows.length };
}
