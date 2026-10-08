import { employerKey } from "./employers.ts";
import { taxYearCompleted } from "./tax-year.ts";
import type { TaxFact, TaxIssue, TaxReadiness } from "./types.ts";

export function assessTaxReadiness(facts: TaxFact[], taxYear: string, today?: string): { readiness: TaxReadiness; issues: TaxIssue[] } {
  const active = facts.filter(fact => fact.status === "active" || fact.status === "reconciled");
  const issues: TaxIssue[] = [];
  const income = active.filter(fact => fact.type === "employment-taxable-pay");
  const paye = active.filter(fact => fact.type === "income-tax-deducted");
  const keys = [...new Set([...income, ...paye].map(fact=>employerKey(fact)))];
  const reliable = (row: TaxFact) => row.confidence === "high" || row.confidence === "verified";
  const isYearEnd = (row: TaxFact) => ["p60", "p45"].includes(row.sourceType) && reliable(row);
  const employments: TaxReadiness["employments"] = keys.map(key => {
    const rows = active.filter(fact => employerKey(fact) === key);
    const pay = rows.filter(fact => fact.type === "employment-taxable-pay");
    const tax = rows.filter(fact => fact.type === "income-tax-deducted");
    const employer = rows[0].employer || "Unknown employer";
    const identified = !key.startsWith("unknown:");
    const verified = identified && pay.length > 0 && tax.length > 0 && pay.every(isYearEnd) && tax.every(isYearEnd);
    const good = identified && pay.length > 0 && tax.length > 0 && [...pay, ...tax].every(reliable);
    const status = verified ? "verified" : good && !taxYearCompleted(taxYear, today) ? "current" : "incomplete";
    const lastDate = [...pay, ...tax].map(row => row.date ?? "").sort().at(-1);
    const detail = verified ? `Verified — ${[...new Set([...pay, ...tax].map(row => row.sourceType.toUpperCase()))].join(" / ")}`
      : !pay.length ? "Taxable-pay evidence missing"
      : !tax.length ? "PAYE evidence missing"
      : !identified ? "Confirm employer identity"
      : !good ? "Estimated taxable pay or low-confidence evidence — needs review"
      : taxYearCompleted(taxYear, today) ? "Missing year-end reconciliation"
      : `Payslips through ${lastDate || "an unrecorded date"} · High confidence`;
    if (status === "incomplete") issues.push({ id: `employment-${key}`, severity: "attention", category: "evidence", title: `${employer}: evidence needs review`, explanation: detail, action: "Review employment evidence" });
    return { employerId: key, employer, status, detail,
      taxablePay: pay.length ? pay.reduce((sum, row) => sum + row.amount, 0) : undefined,
      taxPaid: tax.length ? tax.reduce((sum, row) => sum + row.amount, 0) : undefined };
  });
  const pensions = active.filter(fact => fact.type === "pension-contribution");
  const unknownPension = pensions.some(fact => fact.amount !== 0 && (!fact.treatment || fact.treatment === "unknown"));
  const property = active.filter(fact => fact.type.startsWith("rental-"));
  const investments = active.filter(fact => ["savings-interest", "dividend-income", "capital-gain", "vct-subscription", "vct-relief"].includes(fact.type));
  if (!income.length) issues.push({ id: "employment-missing", severity: "blocking", category: "evidence", title: "Add employment evidence", explanation: "No taxable-pay evidence is recorded for this tax year.", action: "Add or review a payslip" });
  if (unknownPension) issues.push({ id: "pension-unknown", severity: "attention", category: "relief", title: "Pension treatment needs review", explanation: "A contribution is recorded but its tax treatment is unknown. No extra relief is assumed.", action: "Confirm the treatment from payroll or pension evidence" });
  if (pensions.some(fact => fact.amount !== 0 && fact.treatment === "relief-at-source")) issues.push({ id: "pension-relief-uncomputed", severity: "attention", category: "relief", title: "Pension relief is not calculated", explanation: "Relief-at-source contributions are recorded once. Their gross-up and effect on tax bands are outside this estimate." });
  if (property.some(fact => fact.type === "rental-expense-uncertain")) issues.push({ id: "rental-review", severity: "attention", category: "income", title: "Review rental expense treatment", explanation: "Property costs need confirmation before they can be deducted." });
  if (!investments.length) issues.push({ id: "investments-review", severity: "info", category: "income", title: "Review savings and investments", explanation: "Interest, dividends and reliefs have not been reviewed for this year." });
  const checks: TaxReadiness["checks"] = [
    { label: "Employment", status: !income.length ? "missing" : employments.every(item => item.status !== "incomplete") ? "complete" : "partial", detail: employments.length ? "Assessed separately for each employer below." : "Add payslip evidence." },
    { label: "PAYE tax", status: !paye.length ? "missing" : employments.every(item => item.taxPaid !== undefined && item.status !== "incomplete") ? "complete" : "partial", detail: "Zero tax paid is valid evidence. Missing evidence is shown separately." },
    { label: "Pension", status: !pensions.length ? "missing" : unknownPension ? "partial" : "complete", detail: unknownPension ? "Contributions recorded; tax treatment needs review." : pensions.length ? "Treatment recorded; each contribution counted once." : "Not reviewed." },
    { label: "Rental property", status: property.length ? "partial" : "missing", detail: property.length ? "Known receipts and costs only; completeness and deductibility need review." : "Not reviewed." },
    { label: "Savings & investments", status: investments.length ? "partial" : "missing", detail: investments.length ? "Evidence recorded; detailed tax treatment is outside V1." : "Not reviewed." },
  ];
  const coreGood = employments.length > 0 && employments.every(item => item.status !== "incomplete") && !unknownPension;
  const status: TaxReadiness["status"] = coreGood ? "Good" : active.length ? "Partial" : "Setup needed";
  return { readiness: { status, checks, employments, summary: coreGood ? "Employment evidence is usable. Other sources still need review; this is not a final tax position." : active.length ? "Some evidence is recorded. Review the unresolved sources before relying on the estimate." : "Add evidence to build an estimated tax position." }, issues };
}
