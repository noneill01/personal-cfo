import { reconcileTaxEvidence } from "./reconciliation.ts";
import { assessTaxReadiness } from "./readiness.ts";
import { rulesForTaxYear } from "./rules.ts";
import type { TaxDocument, TaxFact, TaxPosition } from "./types.ts";
import { taxYearCompleted } from "./tax-year.ts";
import { rentalDuplicateIssues } from "./rental.ts";

const total = (facts: TaxFact[], types: TaxFact["type"][]) => facts.filter(fact => types.includes(fact.type)).reduce((sum, fact) => sum + fact.amount, 0);
const round = (value: number) => Math.round(value * 100) / 100;

function estimateMainRateIncomeTax(income: number, taxYear: string) {
  const rules = rulesForTaxYear(taxYear);
  if (!rules) return undefined;
  const allowance = Math.max(0, rules.personalAllowance - Math.max(0, income - rules.personalAllowanceTaperStart) / 2);
  const taxable = Math.max(0, income - allowance);
  const basic = Math.min(taxable, rules.basicRateBand);
  const higher = Math.min(Math.max(0, taxable - rules.basicRateBand), rules.higherRateBandCeiling - rules.basicRateBand);
  const additional = Math.max(0, taxable - rules.higherRateBandCeiling);
  return { allowance, taxable, liability: round(basic * rules.basicRate + higher * rules.higherRate + additional * rules.additionalRate), rules };
}

/**
 * V1 intentionally estimates only UK-main-rates, non-Scottish income tax on
 * evidence it can categorise. NI, CGT, dividend taxation and pension relief
 * mechanics remain visible as evidence but are not guessed.
 */
export function calculateTaxPosition(input: { taxYear: string; facts: TaxFact[]; documents?: TaxDocument[]; today?: string }): TaxPosition {
  const reconciled = reconcileTaxEvidence(input.taxYear, input.facts, input.documents);
  const facts = reconciled.facts;
  const { readiness, issues } = assessTaxReadiness(facts, input.taxYear, input.today);
  issues.push(...rentalDuplicateIssues(facts));
  for (const item of reconciled.reconciled.filter(item => Math.abs(item.difference) > .01)) issues.push({ id: `reconciliation-${item.employer}-${item.type}`, severity: "attention", category: "reconciliation", title: `${item.employer} evidence differs`, explanation: `The P60/P45 differs from accumulated payslips by £${Math.abs(item.difference).toFixed(2)}. The year-end document is used for this estimate.`, action: "Inspect evidence" });
  const employment = total(facts, ["employment-taxable-pay"]);
  const rsuTaxableIncome = total(facts, ["rsu-taxable-income"]);
  const propertyIncome = total(facts, ["rental-income"]);
  const propertyExpense = total(facts, ["rental-expense"]);
  const propertyUnknownCost = total(facts, ["rental-expense-uncertain"]);
  const property = Math.max(0, propertyIncome - propertyExpense);
  const savings = total(facts, ["savings-interest"]);
  const dividends = total(facts, ["dividend-income"]);
  const other = total(facts, ["other-taxable-income"]);
  const pensions = total(facts, ["pension-contribution"]);
  const vctRelief = total(facts, ["vct-relief"]);
  const paye = total(facts, ["income-tax-deducted"]);
  const selfAssessment = total(facts, ["self-assessment-payment"]);
  const supportedIncome = employment + property + other;
  const hasIncomeEvidence = facts.some(fact => ["employment-taxable-pay", "rental-income", "other-taxable-income"].includes(fact.type));
  const closedYear = taxYearCompleted(input.taxYear, input.today);
  const estimate = closedYear && hasIncomeEvidence ? estimateMainRateIncomeTax(supportedIncome, input.taxYear) : undefined;
  const unsupportedIncome = savings + dividends + propertyUnknownCost + rsuTaxableIncome > 0;
  if (savings || dividends) issues.push({ id: "unsupported-investment-income", severity: "info", category: "calculation", title: "Investment income is not included in the estimate", explanation: "Savings and dividend evidence is shown but V1 does not calculate its detailed tax treatment.", action: "Review with HMRC guidance or an adviser" });
  if (propertyUnknownCost) issues.push({ id: "property-costs-excluded", severity: "info", category: "calculation", title: "Unreviewed property costs are excluded", explanation: `£${propertyUnknownCost.toFixed(2)} of rental property costs is visible but not deducted until you confirm it is allowable.`, action: "Review rental costs" });
  if (pensions !== 0) issues.push({ id: "pension-treatment", severity: "info", category: "relief", title: "Pension evidence", explanation: "Reported taxable pay already reflects payroll deductions. Contributions are shown once and are not deducted again.", action: "Inspect pension evidence" });
  if (rsuTaxableIncome) issues.push({ id: "rsu-treatment", severity: "attention", category: "income", title: "Review RSU tax treatment", explanation: "RSU income is visible in payslip evidence but excluded from the estimate until confirmed as separate from taxable pay, preventing double counting.", action: "Review share-award evidence" });
  const estimatedLiability = estimate?.liability;
  const taxPaid = { paye: round(paye), selfAssessment: round(selfAssessment), other: 0, total: round(paye + selfAssessment) };
  const hasTaxPaidEvidence = facts.some(fact => ["income-tax-deducted", "self-assessment-payment"].includes(fact.type));
  const taxPaidKnown = hasTaxPaidEvidence && readiness.employments.every(item => item.taxPaid !== undefined);
  const estimatedBalance = estimatedLiability === undefined || !taxPaidKnown ? undefined : round(estimatedLiability - taxPaid.total - vctRelief);
  const confidence = (rows: TaxFact[]) => rows.length === 0 ? "low" as const : rows.every(row => row.confidence === "verified") ? "verified" as const : rows.every(row => ["high", "verified"].includes(row.confidence)) ? "high" as const : "low" as const;
  const employmentFacts = facts.filter(fact => fact.type === "employment-taxable-pay");
  const taxFacts = facts.filter(fact => fact.type === "income-tax-deducted");
  return {
    taxYear: input.taxYear,
    taxYearStatus: closedYear ? "closed" : "open",
    income: { employment: round(employment), property: round(property), savings: round(savings), dividends: round(dividends), other: round(other), total: round(employment + property + savings + dividends + other) },
    adjustments: { pensions: round(pensions), vctRelief: round(vctRelief), other: 0 },
    taxableIncome: estimate?.taxable,
    taxPaid,
    hasTaxPaidEvidence,
    estimatedLiability,
    estimatedBalance,
    calculationStatus: !closedYear ? "not-available" : estimate ? (unsupportedIncome || readiness.status !== "Good" || issues.some(issue => issue.severity !== "info") ? "partial" : "estimated") : "not-available",
    calculationNote: !closedYear
      ? "This tax year is open. The app shows recorded taxable pay and PAYE year to date, but does not compare them with annual allowances or bands. Full-year liability is not projected."
      : estimate ? `UK main rates for ${input.taxYear} are applied to reconciled recorded income using the annual allowance. Other sources and uncalculated reliefs may change the result.`
      : "Add supported taxable-income evidence. An estimate also needs published rules for this tax year.",
    readiness, issues,
    evidence: [
      { label: "Employment", amount: round(employment), facts: employmentFacts, confidence: confidence(employmentFacts) },
      { label: "PAYE tax paid", amount: round(paye), facts: taxFacts, confidence: confidence(taxFacts) },
      { label: "Pension contributions", amount: round(pensions), facts: facts.filter(fact => fact.type === "pension-contribution"), confidence: confidence(facts.filter(fact => fact.type === "pension-contribution")) },
      { label: "Rental income", amount: round(propertyIncome), facts: facts.filter(fact => fact.type.startsWith("rental-")), confidence: propertyUnknownCost ? "medium" : "high" },
    ],
  };
}
