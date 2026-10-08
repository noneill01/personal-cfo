import type { EmployerAlias, PayslipDraft, PayslipRecord } from "../types.ts";
import { taxEmployer } from "./employers.ts";
import type { PensionTaxTreatment } from "./types.ts";

const money = "(-?£?\\s*[\\d,]+\\.\\d{2})";
const ytd = "(?:YTD|Y\\s*[/.-]?\\s*T\\s*[/.-]?\\s*D|Year\\s+to\\s+Date)";
const number = (value?: string) => value === undefined ? undefined : Number(value.replace(/[£,\s]/g, ""));

/** Extract only labelled amounts. Ambiguous gross pay is kept as an estimate in Tax,
 * never persisted as reported taxable pay. Previous-employment totals are excluded.
 */
export function extractPayslipTaxEvidence(raw: string) {
  const text = raw.replace(/\s+/g, " ");
  const current = text.split(/Previous\s+Employment/i)[0];
  const labelled = (label: string) => {
    const match = current.match(new RegExp(label + "\\s*[:£]?\\s*" + money, "i"));
    if (!match || /^\s+-?£?[\d,]+\.\d{2}/.test(current.slice((match.index ?? 0) + match[0].length))) return undefined;
    return number(match[1]);
  };
  const taxableLabel = "Taxable\\s+(?:Pay|Earnings)";
  const paidLabel = "(?:PAYE(?:\\s+Tax)?|Tax\\s+(?:Paid|Deducted))";
  const ytdValue = (label: string) => labelled(label + "\\s*\\(?"+ ytd + "\\)?") ?? labelled(ytd + "\\s+" + label);
  let taxablePay = labelled(taxableLabel + "\\s*(?:This\\s+(?:Period|Month)|Current\\s+Period)");
  let periodTax = labelled(paidLabel + "\\s*(?:This\\s+(?:Period|Month)|Current\\s+Period)");
  let ytdTaxablePay = ytdValue(taxableLabel);
  let ytdTaxPaid = ytdValue(paidLabel);
  // Labelled two-column summaries: values follow the stated Period / YTD order.
  const periodHeading = "(?:This\\s+Period|Current\\s+Period|Period)";
  const pair = (label: string) => current.match(new RegExp(label + "\\s+" + periodHeading + "\\s+" + ytd + "\\s+" + money + "\\s+" + money, "i"));
  const payPair = pair(taxableLabel);
  const taxPair = pair(paidLabel);
  if (payPair) { taxablePay = number(payPair[1]); ytdTaxablePay = number(payPair[2]); }
  if (taxPair) { periodTax = number(taxPair[1]); ytdTaxPaid = number(taxPair[2]); }
  const columns = current.match(new RegExp(periodHeading + "\\s+" + ytd, "i"));
  const reversed = current.match(new RegExp(ytd + "\\s+" + periodHeading, "i"));
  if (columns || reversed) {
    const columnSection = current.slice((columns ?? reversed)!.index);
    const row = (label: string) => columnSection.match(new RegExp(label + "\\s+" + money + "\\s+" + money, "i"));
    const pay = row(taxableLabel); const tax = row(paidLabel);
    const periodColumn = columns ? 1 : 2; const ytdColumn = columns ? 2 : 1;
    if (pay) { taxablePay = number(pay[periodColumn]); ytdTaxablePay = number(pay[ytdColumn]); }
    if (tax) { periodTax = number(tax[periodColumn]); ytdTaxPaid = number(tax[ytdColumn]); }
  }
  // Unqualified Taxable Pay under no YTD heading is a period value.
  // With a YTD heading, the same label belongs to the cumulative section.
  const heading = current.search(new RegExp(ytd, "i"));
  const periodSection = heading >= 0 ? current.slice(0, heading) : current;
  taxablePay ??= number(periodSection.match(new RegExp(taxableLabel + "\\s*[:£]?\\s*" + money, "i"))?.[1]);
  periodTax ??= number(periodSection.match(new RegExp(paidLabel + "\\s*[:£]?\\s*" + money, "i"))?.[1]);
  if (heading >= 0) {
    const section = current.slice(heading);
    const single = (label: string) => {
      const match = section.match(new RegExp(label + "\\s*[:£]?\\s*" + money, "i"));
      if (!match || /^\s+-?£?[\d,]+\.\d{2}/.test(section.slice((match.index ?? 0) + match[0].length))) return undefined;
      return number(match[1]);
    };
    ytdTaxablePay ??= single(taxableLabel);
    ytdTaxPaid ??= single(paidLabel);
  }
  const treatments: PensionTaxTreatment[] = [];
  if (/SS[-\s]*Employee\s+Pension|Pension\s+Salary\s+Sacrifice|Salary\s+Sacrifice\s+Pension/i.test(current)) treatments.push("salary-sacrifice");
  if (/Pension\s*(?:Tax\s+Treatment\s*)?[:(-]?\s*Net[ -]Pay|Net[ -]Pay\s+(?:Pension|Arrangement)/i.test(current)) treatments.push("net-pay");
  if (/Relief[ -]at[ -]Source/i.test(current)) treatments.push("relief-at-source");
  return { taxablePay, ytdTaxablePay, ytdTaxPaid, periodTax, pensionTaxTreatment: treatments.length === 1 ? treatments[0] : "unknown" as PensionTaxTreatment };
}

export function enrichPayslipTaxEvidence(payslip: PayslipRecord, raw: string, taxReported: boolean, aliases: readonly EmployerAlias[] = []): PayslipRecord {
  const evidence = extractPayslipTaxEvidence(raw);
  const employer = payslip.employer || raw.match(/Employer\s*:\s*([^\r\n]+)/i)?.[1]?.trim();
  const employerId = taxEmployer(employer, payslip.id, aliases).id;
  return { ...payslip, employer, employerId,
    taxablePay: evidence.taxablePay, taxablePaySource: evidence.taxablePay !== undefined ? "reported" : "estimated",
    ytdTaxablePay: evidence.ytdTaxablePay, ytdTaxPaid: evidence.ytdTaxPaid,
    tax: evidence.periodTax ?? payslip.tax, taxEvidence: evidence.periodTax !== undefined || taxReported ? "reported" : "missing",
    pensionTaxTreatment: evidence.pensionTaxTreatment };
}

/** Re-import replaces that employer's payslip only; another employer on the same day survives. */
export function mergeImportedPayslip(existing: PayslipRecord[], incoming: PayslipRecord, aliases: readonly EmployerAlias[] = []) {
  const identity = (row: PayslipRecord) => row.employerId ?? taxEmployer(row.employer, row.id, aliases).id;
  const prior = existing.find(row => row.payDate === incoming.payDate && identity(row) === identity(incoming));
  const id = prior?.id ?? `payslip:${identity(incoming)}:${incoming.payDate}`;
  return [{ ...incoming, id }, ...existing.filter(row => row !== prior)].sort((a, b) => b.payDate.localeCompare(a.payDate));
}

export function manualPayslipTaxEvidence(draft: PayslipDraft, aliases: readonly EmployerAlias[] = []): Partial<PayslipRecord> {
  const optional = (value?: string) => {
    if (value === undefined || value.trim() === "") return undefined;
    const amount = Number(value.replace(/[£,\s]/g, ""));
    if (!Number.isFinite(amount)) throw Error("Enter a valid amount for the tax evidence, or leave it blank.");
    return amount;
  };
  const taxablePay = optional(draft.taxablePay);
  return { employer: draft.employer?.trim() || undefined,
    employerId: taxEmployer(draft.employer, `payslip-${draft.payDate}`, aliases).id,
    taxablePay, taxablePaySource: taxablePay === undefined ? "estimated" : "reported",
    ytdTaxablePay: optional(draft.ytdTaxablePay), ytdTaxPaid: optional(draft.ytdTaxPaid),
    tax: optional(draft.tax) ?? 0,
    taxEvidence: draft.tax.trim() === "" ? "missing" : "reported",
    pensionTaxTreatment: draft.pensionTaxTreatment ?? "unknown" };
}
