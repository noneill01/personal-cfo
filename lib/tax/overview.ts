import type { Store } from "../types.ts";
import { derivedTaxFacts, inferPayslipEmployers } from "./facts.ts";
import { normalisePensionFacts } from "./pensions.ts";
import { withEmployerIdentity } from "./employers.ts";
import { calculateTaxPosition } from "./calculate.ts";
import { currentTaxYear, FIRST_TRACKED_TAX_YEAR, taxYearForDate, trackedTaxYears } from "./tax-year.ts";
import { reconcileTaxEvidence } from "./reconciliation.ts";

/** Pure view model shared by the screen and behavioral tests. */
export function taxOverview(store: Store, selectedYear?: string, today = new Date().toISOString().slice(0, 10)) {
  const aliases=store.profile?.taxEmployers??[];
  const payslips = inferPayslipEmployers(store.payslips ?? [], store.transactions,aliases);
  const facts = normalisePensionFacts([...derivedTaxFacts(payslips, store.transactions,aliases), ...(store.taxFacts ?? [])]).map(fact=>withEmployerIdentity(fact,aliases));
  const years = trackedTaxYears([...facts.map(fact => fact.taxYear), ...(store.taxDocuments ?? []).map(document => document.taxYear)], today);
  const activeTaxYear = selectedYear && years.includes(selectedYear) ? selectedYear : years.includes(currentTaxYear(today)) ? currentTaxYear(today) : FIRST_TRACKED_TAX_YEAR;
  const storedDocuments = (store.taxDocuments ?? []).filter(document => document.taxYear === activeTaxYear);
  const payslipDocuments = payslips.filter(payslip => taxYearForDate(payslip.payDate) === activeTaxYear).map(payslip => ({
    id: `payslip-${payslip.id}`, type: "payslip" as const, title: `Payslip — ${payslip.employer || "Employer"}`,
    fileName: payslip.fileName, taxYear: activeTaxYear, provider: payslip.employer, date: payslip.payDate,
    importedAt: payslip.payDate, processingStatus: "processed" as const, fingerprint: payslip.id,
  }));
  const documents = [...storedDocuments, ...payslipDocuments].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const reconciliation = reconcileTaxEvidence(activeTaxYear, facts, storedDocuments);
  const superseded = facts.filter(fact => fact.taxYear === activeTaxYear && fact.status === "superseded");
  return { facts, years, activeTaxYear, documents, reconciliation, superseded,
    activeFacts: reconciliation.facts,
    position: calculateTaxPosition({ taxYear: activeTaxYear, facts, documents: storedDocuments, today }) };
}
