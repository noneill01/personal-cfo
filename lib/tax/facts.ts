import type { EmployerAlias, PayslipRecord, Tx } from "../types.ts";
import { isRentalIncome, isSalaryTransaction } from "../pay-cycles.ts";
import { taxYearForDate } from "./tax-year.ts";
import type { EvidenceConfidence, TaxDocument, TaxFact, TaxFactType } from "./types.ts";
import { taxEmployer, employerKey } from "./employers.ts";

const round = (value: number) => Math.round(value * 100) / 100;

export function payslipFacts(payslips: PayslipRecord[], aliases: readonly EmployerAlias[] = []): TaxFact[] {
  const unique = [...new Map(payslips.map(payslip => [payslip.id, payslip])).values()];
  const key = (payslip: PayslipRecord) => `${taxYearForDate(payslip.payDate)}|${payslip.employerId ?? taxEmployer(payslip.employer, payslip.id,aliases).id}`;
  const latest = (payslip: PayslipRecord, field: "ytdTaxablePay" | "ytdTaxPaid") => unique
    .filter(item => key(item) === key(payslip) && item[field] !== undefined && Number.isFinite(item[field]))
    .sort((a, b) => b.payDate.localeCompare(a.payDate) || b.id.localeCompare(a.id))[0];
  return unique.flatMap(payslip => {
    const taxYear = taxYearForDate(payslip.payDate);
    const employer = payslip.employer || "Unknown employer";
    const sourceId = `payslip:${payslip.id}`;
    const confidence: EvidenceConfidence = "high";
    const fact = (type: TaxFactType, amount: number | undefined, explanation: string, quality: EvidenceConfidence = confidence): TaxFact | null => amount !== undefined && Number.isFinite(amount) ? {
      id: `${sourceId}:${type}`, taxYear, type, amount: round(amount), date: payslip.payDate,
      sourceType: "payslip", sourceId, confidence: quality, status: "active", employer,
      employerId: payslip.employerId ?? taxEmployer(payslip.employer, payslip.id,aliases).id,
      explanation, provenance: { fileName: payslip.fileName, taxCode: payslip.taxCode },
    } : null;
    const payYtd = latest(payslip, "ytdTaxablePay");
    const taxYtd = latest(payslip, "ytdTaxPaid");
    // Select each measure independently. Later period evidence extends the latest YTD.
    const selected = (anchor: PayslipRecord | undefined, type: TaxFactType, field: "ytdTaxablePay" | "ytdTaxPaid", period: number | undefined, explanation: string, quality: EvidenceConfidence = confidence) =>
      anchor?.id === payslip.id ? { ...fact(type, anchor[field], `Latest payslip YTD ${type === "income-tax-deducted" ? "PAYE tax" : "taxable pay"}; earlier periods are covered by this total.`)!, provenance: { fileName: payslip.fileName, taxCode: payslip.taxCode, basis: "latest-ytd" } }
      : !anchor || payslip.payDate > anchor.payDate ? fact(type, period, explanation, quality) : null;
    const explicitPay = payslip.taxablePay !== undefined && payslip.taxablePaySource !== "estimated";
    const pension = fact("pension-contribution", payslip.employeePension, "One pension contribution; treatment describes this amount and is not another contribution.");
    return [
      selected(payYtd, "employment-taxable-pay", "ytdTaxablePay", payslip.taxablePay ?? payslip.cashEarnings ?? payslip.salary,
        explicitPay ? "Explicit current-period taxable pay from payslip." : "Estimated from gross/cash earnings; taxable pay was not reported. Needs review.", explicitPay ? "high" : "low"),
      fact("employment-gross-pay", payslip.salary, "Gross salary shown on payslip."),
      selected(taxYtd, "income-tax-deducted", "ytdTaxPaid", payslip.taxEvidence === "missing" ? undefined : payslip.tax, "Current-period PAYE income tax deducted on payslip."),
      fact("employee-ni", payslip.ni, "Employee National Insurance shown on payslip."),
      pension ? { ...pension, treatment: payslip.pensionTaxTreatment ?? "unknown" } : null,
      fact("employer-pension", payslip.employerPension, "Employer pension contribution shown on payslip."),
      fact("rsu-taxable-income", payslip.rsuGain, "RSU taxable income reported on payslip."),
    ].filter((item): item is TaxFact => Boolean(item));
  });
}

/**
 * Older imported payslips may pre-date employer extraction. Match only an
 * exact net-pay salary receipt from a known employer within three days, keeping
 * genuinely ambiguous records unidentified.
 */
export function inferPayslipEmployers(payslips: PayslipRecord[], transactions: Tx[], aliases: readonly EmployerAlias[] = []) {
  const knownIds = new Set(aliases.map(employer=>employer.id));
  return payslips.map(payslip => {
    if (payslip.employer?.trim() || (payslip.employerId && !payslip.employerId.startsWith("unknown:"))) return payslip;
    const paidAt = new Date(payslip.payDate + "T12:00:00Z").getTime();
    const match = transactions
      .filter(transaction => isSalaryTransaction(transaction) && Math.abs(transaction.amount - payslip.netPay) < .01)
      .map(transaction => ({ transaction, employer: taxEmployer(transaction.merchant,"unidentified",aliases), distance: Math.abs(new Date(transaction.date + "T12:00:00Z").getTime() - paidAt) / 86400000 }))
      .filter(candidate => candidate.distance <= 3 && knownIds.has(candidate.employer.id))
      .sort((left, right) => left.distance - right.distance)[0];
    return match ? { ...payslip, employer: match.employer.displayName, employerId: match.employer.id } : payslip;
  });
}

/** Only creates facts from transactions explicitly linked to a rental property. */
export function rentalFactsFromTransactions(transactions: Tx[]): TaxFact[] {
  return transactions.flatMap<TaxFact>(transaction => {
    const taxYear = taxYearForDate(transaction.date);
    const sourceId = `transaction:${transaction.id}`;
    if (transaction.amount > 0 && isRentalIncome(transaction)) return [{
      id: `${sourceId}:rental-income`, taxYear, type: "rental-income" as const, amount: round(transaction.amount), date: transaction.date,
      sourceType: "transaction" as const, sourceId, linkedTransactionIds: [transaction.id], confidence: "high" as const, status: "active" as const,
      provider: transaction.merchant, explanation: "Rental receipt classified in the bank feed.",
    }];
    if (transaction.amount < 0 && transaction.categoryGroup === "property") return [{
      id: `${sourceId}:rental-expense-uncertain`, taxYear, type: "rental-expense-uncertain" as const, amount: round(-transaction.amount), date: transaction.date,
      sourceType: "transaction" as const, sourceId, linkedTransactionIds: [transaction.id], confidence: "medium" as const, status: "active" as const,
      provider: transaction.merchant, explanation: "Rental property cost from the bank feed. Confirm tax treatment before deducting it from rental profit.",
    }];
    return [];
  });
}

export function derivedTaxFacts(payslips: PayslipRecord[], transactions: Tx[], aliases: readonly EmployerAlias[] = []) {
  return [...payslipFacts(inferPayslipEmployers(payslips, transactions,aliases),aliases), ...rentalFactsFromTransactions(transactions)];
}

export function p60Fingerprint(input: { taxYear: string; employer: string; taxablePay: number; taxPaid: number; date: string }, aliases: readonly EmployerAlias[] = []) {
  return ["p60", input.taxYear, taxEmployer(input.employer,"unidentified",aliases).id, input.taxablePay.toFixed(2), input.taxPaid.toFixed(2)].join("|");
}

export function createP60Evidence(input: { id: string; title?: string; fileName?: string; taxYear: string; employer: string; date: string; taxablePay: number; taxPaid: number; notes?: string; importedAt: string; employerAliases?: readonly EmployerAlias[] }): { document: TaxDocument; facts: TaxFact[] } {
  const fingerprint = p60Fingerprint(input,input.employerAliases);
  const document: TaxDocument = { id: input.id, type: "p60", title: input.title || `P60 — ${input.employer}`, fileName: input.fileName, taxYear: input.taxYear, provider: input.employer, date: input.date, importedAt: input.importedAt, processingStatus: "manual", fingerprint, notes: input.notes };
  const common = { taxYear: input.taxYear, date: input.date, sourceType: "p60" as const, sourceId: input.id, documentId: input.id, confidence: "verified" as const, status: "active" as const, employer: input.employer, employerId: taxEmployer(input.employer,"unidentified",input.employerAliases).id, provenance: { document: "P60", fingerprint } };
  return { document, facts: [
    { ...common, id: `${input.id}:employment-taxable-pay`, type: "employment-taxable-pay", amount: round(input.taxablePay), explanation: "P60 year-end taxable pay. This reconciles payslip totals for this employment." },
    { ...common, id: `${input.id}:income-tax-deducted`, type: "income-tax-deducted", amount: round(input.taxPaid), explanation: "P60 year-end PAYE tax deducted. This reconciles payslip totals for this employment." },
  ] };
}

export function p45Fingerprint(input: { taxYear: string; employer: string; taxablePay: number; taxPaid: number; leavingDate: string }, aliases: readonly EmployerAlias[] = []) {
  return ["p45", input.taxYear, taxEmployer(input.employer,"unidentified",aliases).id, input.leavingDate, input.taxablePay.toFixed(2), input.taxPaid.toFixed(2)].join("|");
}

export function createP45Evidence(input: { id: string; fileName?: string; taxYear: string; employer: string; leavingDate: string; taxablePay: number; taxPaid: number; taxCode?: string; payeReference?: string; notes?: string; importedAt: string; employerAliases?: readonly EmployerAlias[] }): { document: TaxDocument; facts: TaxFact[] } {
  const fingerprint = p45Fingerprint(input,input.employerAliases);
  const document: TaxDocument = { id: input.id, type: "p45", title: `P45 — ${input.employer}`, fileName: input.fileName, taxYear: input.taxYear, provider: input.employer, date: input.leavingDate, importedAt: input.importedAt, processingStatus: "manual", fingerprint, notes: input.notes };
  const provenance = { document: "P45", fingerprint, taxCode: input.taxCode, payeReference: input.payeReference };
  const common = { taxYear: input.taxYear, date: input.leavingDate, sourceType: "p45" as const, sourceId: input.id, documentId: input.id, confidence: "verified" as const, status: "active" as const, employer: input.employer, employerId: taxEmployer(input.employer,"unidentified",input.employerAliases).id, provenance };
  return { document, facts: [
    { ...common, id: `${input.id}:employment-taxable-pay`, type: "employment-taxable-pay", amount: round(input.taxablePay), explanation: "P45 taxable pay for this ended employment. This reconciles its payslip totals." },
    { ...common, id: `${input.id}:income-tax-deducted`, type: "income-tax-deducted", amount: round(input.taxPaid), explanation: "P45 PAYE tax deducted for this ended employment. This reconciles its payslip totals." },
  ] };
}

export function documentFingerprintExists(documents: TaxDocument[], fingerprint: string, aliases: readonly EmployerAlias[] = []) {
  return documents.some(document => {
    if (document.fingerprint === fingerprint) return true;
    // V1 fingerprints included the raw employer spelling and document date.
    // Preserve stored evidence while recognising the same P60 under the new identity.
    const parts = document.fingerprint.split("|");
    if (document.type !== "p60" || !fingerprint.startsWith("p60|") || parts.length < 5 || !document.provider) return false;
    parts[2] = taxEmployer(document.provider,"unidentified",aliases).id;
    return parts.slice(0, 5).join("|") === fingerprint;
  });
}

export function sourceFactKey(fact: TaxFact) { return `${employerKey(fact)}|${fact.type}`; }
export function factsForTaxYear(facts: TaxFact[], taxYear: string) { return facts.filter(fact => fact.taxYear === taxYear && (fact.status === "active" || fact.status === "reconciled")); }
