import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { taxYearBounds, taxYearForDate, taxYearCompleted, isTaxYearOpen, FIRST_TRACKED_TAX_YEAR, trackedTaxYears, taxEmployer, payslipFacts, inferPayslipEmployers, calculateTaxPosition, createP60Evidence, createP45Evidence, documentFingerprintExists, parseP45Text, reconcileTaxEvidence, migrateTaxStore, normalisePensionFacts } from "../lib/tax/index.ts";
import { extractPayslipTaxEvidence, mergeImportedPayslip, manualPayslipTaxEvidence } from "../lib/tax/payslip-evidence.ts";
import { taxOverview } from "../lib/tax/overview.ts";
import { parsePayslipText } from "../lib/imports.ts";
import { serialiseBackup, parseBackup } from "../lib/backup.ts";
import { financeStoresMatch } from "../lib/storage.ts";
import { migrateUserProfile } from "../lib/profile.ts";

const year = "2026/27";
const today = "2026-09-25";
const base = { id: "aug", payDate: "2026-08-28", employer: "Northstar Systems", fileName: "fixture.pdf", salary: 4000, cashEarnings: 4000, taxablePay: 3800, tax: 600, ni: 200, netPay: 3000, employeePension: 200, employerPension: 200, espp: 0, rsuGain: 0, rsuTaxCredit: 0, taxCode: "1257L" };
const emptyStore = { version: 2, transactions: [], balances: [], goals: [], budget: [], updatedAt: today };
const aliases = [
  {id:"northstar-systems",displayName:"Northstar Systems",aliases:["Northstar Systems","Northstar Systems Ltd","Northstar Systems Limited"]},
  {id:"previous-systems",displayName:"Previous Systems",aliases:["Previous Systems","Previous Systems Ltd","Previous Systems Limited"]},
];
const fact = (type, amount, extra = {}) => ({ id: type, type, amount, taxYear: year, employer: "Northstar Systems", employerId: "northstar-systems", sourceType: "payslip", confidence: "high", status: "active", date: "2026-08-28", ...extra });
const position = facts => calculateTaxPosition({ taxYear: year, facts, today });
const p60 = (employer = "Northstar Systems Limited", taxablePay = 20000, taxPaid = 6000, id = "p60") => createP60Evidence({ id, taxYear: year, employer, taxablePay, taxPaid, date: taxYearBounds(year).end, importedAt: "2027-04-06", employerAliases:aliases });

test("Tax starts at 2026/27 without losing the generic April boundary or historical records", () => {
  assert.equal(FIRST_TRACKED_TAX_YEAR, year);
  assert.deepEqual(taxYearBounds(year), { start: "2026-04-06", end: "2027-04-05" });
  assert.equal(taxYearForDate("2026-04-05"), "2025/26");
  assert.equal(taxYearForDate("2026-04-06"), year);
  assert.deepEqual(trackedTaxYears(["2025/26", year], today), [year]);
  assert.deepEqual(trackedTaxYears(["2025/26"], "2028-05-01"), ["2028/29", "2027/28", year]);
  const store = { ...emptyStore, payslips: [{ ...base, payDate: "2026-03-26" }] };
  const view = taxOverview(store, "2025/26", today);
  assert.equal(view.activeTaxYear, year);
  assert.equal(view.documents.length, 0);
  assert.equal(store.payslips.length, 1);
  assert.equal(taxYearCompleted(year, "2027-04-05"), false);
  assert.equal(taxYearCompleted(year, "2027-04-06"), true);
  assert.throws(() => taxYearForDate("2026-02-30"));
  assert.throws(() => taxYearBounds("2026/26"));
});

for (const treatment of ["salary-sacrifice", "net-pay", "relief-at-source", "unknown"]) {
  test(`£200 pension with ${treatment} treatment is represented once`, () => {
    const facts = payslipFacts([{ ...base, pensionTaxTreatment: treatment }]);
    const pensions = facts.filter(row => row.type === "pension-contribution");
    assert.equal(pensions.length, 1);
    assert.equal(pensions[0].amount, 200);
    assert.equal(pensions[0].treatment, treatment);
    assert.equal(facts.some(row => row.type === "salary-sacrifice"), false);
    assert.equal(position(facts).adjustments.pensions, 200);
    assert.equal(position(facts).income.employment, 3800);
    if (treatment === "unknown") {
      assert.equal(position(facts).calculationStatus, "not-available");
      assert.equal(position(facts).readiness.status, "Partial");
      assert.ok(position(facts).issues.some(row => row.id === "pension-unknown"));
    }
  });
}

test("successive YTD values are selected independently per measure and extended only by later periods", () => {
  const records = [
    { ...base, id: "apr", payDate: "2026-04-28", taxablePay: 10000, ytdTaxablePay: 10000, ytdTaxPaid: 2000, tax: 2000 },
    { ...base, id: "may", payDate: "2026-05-28", taxablePay: 10000, ytdTaxablePay: 20000, ytdTaxPaid: undefined, tax: 2500 },
    { ...base, id: "jun", payDate: "2026-06-28", taxablePay: 10000, ytdTaxablePay: undefined, ytdTaxPaid: 7000, tax: 2500 },
    { ...base, id: "jul", payDate: "2026-07-28", taxablePay: 10000, tax: 2500 },
  ];
  const result = position(payslipFacts(records));
  assert.equal(result.income.employment, 40000);
  assert.equal(result.taxPaid.paye, 9500);
  assert.equal(position(payslipFacts(records.slice(0, 2))).taxPaid.paye, 4500);
  assert.equal(position(payslipFacts(records.map(row => ({ ...row, ytdTaxablePay: undefined, ytdTaxPaid: undefined })))).income.employment, 40000);
});

test("fallback cash/gross is visibly estimated rather than verified taxable pay", () => {
  const result = position(payslipFacts([{ ...base, taxablePay: undefined, pensionTaxTreatment: "salary-sacrifice" }]));
  assert.equal(result.income.employment, 4000);
  assert.equal(result.evidence[0].confidence, "low");
  assert.equal(result.readiness.employments[0].status, "incomplete");
  assert.match(result.evidence[0].facts[0].explanation, /Estimated/);
  assert.equal(result.calculationStatus, "not-available");
});

test("labelled taxable pay, YTD values and explicit treatment are extracted from payslip text", () => {
  const evidence = extractPayslipTaxEvidence("Taxable Pay This Period 3,800.00 Taxable Pay YTD 8,000.00 Tax Paid This Period 600.00 Tax Paid YTD 1,127.20 Pension Salary Sacrifice 200");
  assert.deepEqual(evidence, { taxablePay: 3800, ytdTaxablePay: 8000, periodTax: 600, ytdTaxPaid: 1127.2, pensionTaxTreatment: "salary-sacrifice" });
  assert.equal(extractPayslipTaxEvidence("Workplace Pension 200").pensionTaxTreatment, "unknown");
  assert.equal(extractPayslipTaxEvidence("Pension Net Pay 200").pensionTaxTreatment, "net-pay");
  assert.equal(extractPayslipTaxEvidence("Pension Relief at Source 200").pensionTaxTreatment, "relief-at-source");
  assert.equal(extractPayslipTaxEvidence("Pension Salary Sacrifice Pension Relief at Source").pensionTaxTreatment, "unknown");
});

test("column headings determine Period/YTD order and ambiguous columns are not invented", () => {
  const normal = extractPayslipTaxEvidence("This Period Year to Date Taxable Pay 3000.00 18000.00 Tax Paid 400.00 2400.00");
  assert.equal(normal.taxablePay, 3000); assert.equal(normal.ytdTaxablePay, 18000);
  assert.equal(normal.periodTax, 400); assert.equal(normal.ytdTaxPaid, 2400);
  const reverse = extractPayslipTaxEvidence("Year to Date This Period Taxable Pay 18000.00 3000.00 Tax Paid 2400.00 400.00");
  assert.equal(reverse.taxablePay, 3000); assert.equal(reverse.ytdTaxablePay, 18000);
  const ambiguous = extractPayslipTaxEvidence("Year to Date Taxable Pay 3000.00 18000.00");
  assert.equal(ambiguous.ytdTaxablePay, undefined);
  const prior = extractPayslipTaxEvidence("Taxable Pay 3000.00 Previous Employment Taxable Pay YTD 80000.00 Tax Paid YTD 20000.00");
  assert.equal(prior.taxablePay, 3000); assert.equal(prior.ytdTaxablePay, undefined);
});

const currentEmployer = "Employer: Northstar Systems Limited Pay Date 28/08/2026 1257L W1/M1 Basic Pay Tax Paid EE NI Contribution Workplace Pension 4,000.00 600.00 200.00 200.00 ER's Pension 200.00";
test("full import pipeline populates reported pay/YTD fields without changing existing payroll figures", () => {
  const parsed = parsePayslipText(currentEmployer + " Taxable Pay This Period 3,800.00 Taxable Pay YTD 3,800.00 Tax Paid YTD 600.00 Pension Salary Sacrifice");
  assert.equal(parsed.taxablePay, 3800); assert.equal(parsed.ytdTaxablePay, 3800);
  assert.equal(parsed.ytdTaxPaid, 600); assert.equal(parsed.taxablePaySource, "reported");
  assert.equal(parsed.employeePension, 200); assert.equal(parsed.netPay, 3000);
  assert.equal(parsed.pensionTaxTreatment, "salary-sacrifice");
  assert.equal(taxEmployer(parsed.employer,parsed.id,aliases).id, "northstar-systems");
  const missing = parsePayslipText(currentEmployer);
  assert.equal(missing.taxablePay, undefined); assert.equal(missing.taxablePaySource, "estimated");
  assert.equal(missing.pensionTaxTreatment, "unknown");
});

test("explicit zero PAYE, income and zero YTD are evidence rather than absence", () => {
  const parsed = parsePayslipText(currentEmployer.replace("600.00", "0.00") + " Taxable Pay 0.00 Tax Paid YTD 0.00");
  assert.equal(parsed.tax, 0); assert.equal(parsed.ytdTaxPaid, 0);
  const result = position(payslipFacts([{ ...parsed, employeePension: 0 }]));
  assert.equal(result.income.employment, 0);
  assert.equal(result.taxPaid.total, 0);
  assert.equal(result.hasTaxPaidEvidence, true);
  assert.equal(result.evidence.find(row => row.label === "Employment").facts.length, 1);
  assert.equal(result.evidence.find(row => row.label === "PAYE tax paid").facts.length, 1);
  assert.equal(result.evidence.find(row => row.label === "Pension contributions").facts.length, 1);
  assert.equal(result.estimatedLiability, undefined);
  assert.equal(result.estimatedBalance, undefined);
  assert.equal(result.readiness.employments[0].taxPaid, 0);
  assert.equal(result.readiness.checks.find(row => row.label === "PAYE tax").status, "complete");
  const absent = position(payslipFacts([{ ...base, tax: 0, taxEvidence: "missing" }]));
  assert.equal(absent.hasTaxPaidEvidence, false);
  assert.equal(absent.readiness.employments[0].taxPaid, undefined);
  assert.equal(absent.estimatedBalance, undefined);
  assert.equal(manualPayslipTaxEvidence({ payDate: today, tax: "", taxablePay: "", ytdTaxPaid: "0" }).ytdTaxPaid, 0);
  const closed = calculateTaxPosition({ taxYear: year, facts: payslipFacts([{ ...parsed, employeePension: 0 }]), today: "2027-04-06" });
  assert.equal(closed.estimatedLiability, 0);
  assert.equal(closed.estimatedBalance, 0);
});

test("open years expose YTD evidence without deriving an annual liability or refund-style balance", () => {
  assert.equal(isTaxYearOpen(year, today), true);
  const result = calculateTaxPosition({ taxYear: year, today, facts: [fact("employment-taxable-pay", 90000), fact("income-tax-deducted", 33600)] });
  assert.equal(result.taxYearStatus, "open");
  assert.equal(result.income.employment, 90000);
  assert.equal(result.taxPaid.paye, 33600);
  assert.equal(result.taxableIncome, undefined);
  assert.equal(result.estimatedLiability, undefined);
  assert.equal(result.estimatedBalance, undefined);
  assert.equal(result.calculationStatus, "not-available");
  assert.match(result.calculationNote, /does not compare them with annual allowances or bands/);
});

test("closed years retain the annual tax calculation", () => {
  const result = calculateTaxPosition({ taxYear: year, today: "2027-04-06", facts: [fact("employment-taxable-pay", 90000), fact("income-tax-deducted", 23600)] });
  assert.equal(result.taxYearStatus, "closed");
  assert.equal(typeof result.estimatedLiability, "number");
  assert.equal(typeof result.estimatedBalance, "number");
});

test("known employer aliases reconcile but unrelated similar names stay separate", () => {
  for (const name of ["Northstar Systems", "Northstar Systems Ltd", "Northstar Systems Limited"]) assert.equal(taxEmployer(name,"unidentified",aliases).id, "northstar-systems");
  assert.equal(taxEmployer("Previous Systems Limited","unidentified",aliases).id, taxEmployer("Previous Systems","unidentified",aliases).id);
  assert.notEqual(taxEmployer("Northstar Systems Consulting","unidentified",aliases).id, "northstar-systems");
  assert.notEqual(taxEmployer("Example Ltd").id, taxEmployer("Example Holdings Ltd").id);
});

for (const taxablePay of [20000, 20000.5]) {
  test(`P60 legal name reconciles an employer's payslips at £${taxablePay}`, () => {
    const annual = p60("Northstar Systems Limited", taxablePay);
    const slips = [fact("employment-taxable-pay", 20000), fact("income-tax-deducted", 6000)];
    const result = calculateTaxPosition({ taxYear: year, today: "2027-05-01", facts: [...slips, ...annual.facts], documents: [annual.document] });
    assert.equal(result.income.employment, taxablePay); assert.equal(result.taxPaid.paye, 6000);
    assert.equal(result.readiness.employments[0].status, "verified");
    const audit = reconcileTaxEvidence(year, [...slips, ...annual.facts], [annual.document]);
    assert.equal(audit.reconciled[0].difference, taxablePay - 20000);
    assert.equal(audit.reconciled[0].replaced.length, 1);
    assert.equal(slips[0].amount, 20000);
  });
}

test("P45/P60 reconcile only their employment; another employer's readiness stays independent", () => {
  const a = p60("Previous Systems Limited", 30000, 7000);
  const b = [fact("employment-taxable-pay", 12000), fact("income-tax-deducted", 2000)];
  const result = calculateTaxPosition({ taxYear: year, facts: [...a.facts, ...b], documents: [a.document], today: "2027-05-01" });
  assert.equal(result.income.employment, 42000);
  assert.equal(result.readiness.employments.find(row => row.employerId === "previous-systems").status, "verified");
  assert.equal(result.readiness.employments.find(row => row.employerId === "northstar-systems").status, "incomplete");
  assert.equal(result.readiness.status, "Partial");
  const p45 = a.facts.map(row => ({ ...row, sourceType: "p45", documentId: undefined }));
  const current = calculateTaxPosition({ taxYear: year, facts: [...p45, ...b], today });
  assert.equal(current.income.employment, 42000);
  assert.equal(current.readiness.status, "Good");
  assert.equal(current.readiness.employments.find(row => row.employerId === "northstar-systems").status, "current");
});

test("multiple year-end documents do not add another copy of employment income", () => {
  const old = p60("Northstar Systems", 19000, 5000, "old");
  const latest = p60("Northstar Systems Ltd", 20000, 6000, "latest");
  latest.facts.forEach(row => { row.date = "2027-04-06"; });
  const p45 = fact("employment-taxable-pay", 18000, { id: "p45", sourceType: "p45", confidence: "verified" });
  const result = calculateTaxPosition({ taxYear: year, facts: [...old.facts, ...latest.facts, p45], documents: [old.document, latest.document] });
  assert.equal(result.income.employment, 20000); assert.equal(result.taxPaid.paye, 6000);
});

test("unknown pension treatment prevents complete readiness even with reconciled year-end evidence", () => {
  const annual = p60();
  const result = calculateTaxPosition({ taxYear: year, facts: [...annual.facts, fact("pension-contribution", 4500, { treatment: "unknown" })], documents: [annual.document], today: "2027-06-01" });
  assert.equal(result.calculationStatus, "partial");
  assert.equal(result.readiness.status, "Partial");
  assert.equal(result.adjustments.pensions, 4500);
});

test("Tax V2 migration is idempotent, preserves originals and keeps duplicate pension evidence for audit", () => {
  const pension = fact("employee-pension", 200, { sourceId: "payslip:aug", explanation: "Employee contribution" });
  const duplicate = fact("salary-sacrifice", 200, { sourceId: "payslip:aug", explanation: "Possible salary sacrifice", provenance: { fileName: "fixture.pdf" } });
  const original = { ...migrateUserProfile(emptyStore), taxSchemaVersion: 1, payslips: [base], taxFacts: [pension, duplicate, fact("savings-interest", 0)], taxDocuments: [p60().document] };
  const before = structuredClone(original);
  const migrated = migrateTaxStore(original);
  assert.deepEqual(original, before);
  assert.equal(migrated.taxFacts.length, 3);
  assert.equal(migrated.taxFacts[1].status, "superseded");
  assert.equal(migrated.taxFacts[1].provenance.supersededBy, pension.id);
  assert.equal(migrated.taxFacts[1].provenance.fileName, "fixture.pdf");
  assert.equal(migrated.taxFacts[0].treatment, "unknown");
  assert.equal(migrated.taxFacts[0].employerId, "northstar-systems");
  assert.equal(position(migrated.taxFacts).adjustments.pensions, 200);
  assert.deepEqual(migrateTaxStore(migrated), migrated);
  assert.equal(financeStoresMatch(migrated, parseBackup(serialiseBackup(migrated))), true);
  assert.deepEqual(parseBackup(serialiseBackup(migrated)).taxFacts, migrated.taxFacts);
  assert.equal(normalisePensionFacts([pension, { ...duplicate, sourceId: "another-slip" }]).filter(row => row.status === "active").length, 2);
});

test("same-day employers survive import while aliases replace only the matching payslip", () => {
  const existing = [base, { ...base, id: "rapid", employer: "Previous Systems", tax: 100 }];
  const imported = mergeImportedPayslip(existing, { ...base, employer: "Northstar Systems Limited", tax: 650 },aliases);
  assert.equal(imported.length, 2);
  assert.equal(imported.find(row => row.id === "rapid").tax, 100);
  assert.equal(imported.find(row => row.id === "aug").tax, 650);
  assert.equal(mergeImportedPayslip(imported, { ...base, employer: "Northstar Systems Ltd", tax: 650 },aliases).length, 2);
});

test("legacy payslips infer known employers from exact nearby salary deposits", () => {
  const unknown = [
    { ...base, id: "rapid-final", employer: undefined, employerId: undefined, payDate: "2026-08-26", netPay: 7200 },
    { ...base, id: "currentEmployer-first", employer: undefined, employerId: undefined, payDate: "2026-08-28", netPay: 3000 },
  ];
  const transactions = [
    { id: "rapid-pay", date: "2026-08-26", merchant: "Previous Systems", category: "Income", subcategory: "Salary", amount: 7200, account: "Monzo" },
    { id: "currentEmployer-pay", date: "2026-08-27", merchant: "Northstar Systems Ltd", category: "Income", subcategory: "Salary", amount: 3000, account: "Monzo" },
  ];
  const inferred = inferPayslipEmployers(unknown, transactions,aliases);
  assert.deepEqual(inferred.map(item => [item.employer, item.employerId]), [["Previous Systems", "previous-systems"], ["Northstar Systems", "northstar-systems"]]);
});

test("legacy P60 fingerprints recognise a re-entry under an employer alias", () => {
  const prior = { ...p60().document, provider: "Northstar Systems", fingerprint: "p60|2026/27|northstar systems|20000.00|6000.00|2027-04-05" };
  assert.equal(documentFingerprintExists([prior], p60("Northstar Systems Limited").document.fingerprint,aliases), true);
  assert.equal(documentFingerprintExists([prior], p60("Northstar Systems Limited", 21000).document.fingerprint,aliases), false);
});

test("PAYE refunds retain their sign in legacy payroll layouts", () => {
  const parsed = parsePayslipText("Previous Systems Limited Pay Day 26/08/2026 Salary 3000.00 Tax (Code 1257L) -100.00 NI (Category A) 100.00 Net pay 3000.00");
  assert.equal(parsed.tax, -100);
  assert.equal(position(payslipFacts([parsed])).taxPaid.paye, -100);
  assert.equal(manualPayslipTaxEvidence({ payDate: today, tax: "-100.00" }).tax, -100);
});

test("P45 reconciles only its employer, survives persistence and rejects an exact duplicate", () => {
  const rapid = createP45Evidence({ id: "p45-rapid", taxYear: year, employer: "Previous Systems Limited", leavingDate: "2026-08-21", taxablePay: 35000, taxPaid: 7500, taxCode: "1257L", payeReference: "123/AB", importedAt: today,employerAliases:aliases });
  const rapidSlips = [fact("employment-taxable-pay", 35000, { id: "rapid-pay", employer: "Previous Systems", employerId: "previous-systems" }), fact("income-tax-deducted", 7500, { id: "rapid-tax", employer: "Previous Systems", employerId: "previous-systems" })];
  const currentEmployer = [fact("employment-taxable-pay", 12000, { id: "currentEmployer-pay" }), fact("income-tax-deducted", 2000, { id: "currentEmployer-tax" })];
  const result = calculateTaxPosition({ taxYear: year, facts: [...rapidSlips, ...rapid.facts, ...currentEmployer], documents: [rapid.document], today });
  assert.equal(result.income.employment, 47000);
  assert.equal(result.taxPaid.paye, 9500);
  assert.equal(result.readiness.employments.find(row => row.employerId === "previous-systems").status, "verified");
  assert.equal(result.readiness.employments.find(row => row.employerId === "northstar-systems").status, "current");
  assert.equal(documentFingerprintExists([rapid.document], createP45Evidence({ ...rapid.document, id: "again", employer: "Previous Systems", leavingDate: "2026-08-21", taxablePay: 35000, taxPaid: 7500, importedAt: today,employerAliases:aliases }).document.fingerprint,aliases), true);
  const stored = migrateTaxStore({ ...migrateUserProfile(emptyStore), taxDocuments: [rapid.document], taxFacts: rapid.facts });
  const restored = parseBackup(serialiseBackup(stored));
  assert.equal(restored.taxDocuments[0].fingerprint, stored.taxDocuments[0].fingerprint);
  assert.equal(restored.taxDocuments[0].type, "p45");
  assert.equal(restored.taxFacts.length, 2);
  assert.equal(restored.taxFacts[0].employerId, "previous-systems");
});

test("P45 upload extraction prefers HMRC Box 8 employment values over Box 7 totals", () => {
  const fixture = readFileSync(new URL("./fixtures/p45-hmrc-extracted.txt", import.meta.url), "utf8");
  const parsed = parseP45Text(fixture, "synthetic-p45.pdf");
  assert.deepEqual(parsed, { employer: "Example Software Limited", leavingDate: "2026-08-21", taxablePay: 35000, taxPaid: 7500, taxCode: "2461T", payeReference: "123/FA456", fileName: "synthetic-p45.pdf", warnings: [] });
});

test("P45 upload extraction falls back to Box 7 when Box 8 is missing", () => {
  const parsed = parseP45Text("P45 Employer's name: Example Software Limited Employer PAYE reference: 123/FA456 Date of leaving: 21/08/2026 Tax code: 2461T 7 Total pay to date: £70,000.00 Total tax to date: £18,000.00", "box7-only.pdf");
  assert.deepEqual(parsed, { employer: "Example Software Limited", leavingDate: "2026-08-21", taxablePay: 70000, taxPaid: 18000, taxCode: "2461T", payeReference: "123/FA456", fileName: "box7-only.pdf", warnings: [] });
  const incomplete = parseP45Text("P45 Date of leaving: 21/08/2026", "partial.pdf");
  assert.ok(incomplete.warnings.some(item => /taxable pay/i.test(item)));
});

test("linked rental evidence counts once, explicit separate evidence counts twice and probable duplicates warn", () => {
  const transaction = fact("rental-income", 660, { id: "rent-bank", employer: undefined, employerId: undefined, sourceType: "transaction", date: "2026-09-02", provider: "Example Tenant", linkedTransactionIds: ["tx-rent"] });
  const linked = fact("rental-income", 660, { id: "rent-manual-linked", employer: undefined, employerId: undefined, sourceType: "manual", date: "2026-09-02", linkedTransactionIds: ["tx-rent"] });
  const once = calculateTaxPosition({ taxYear: year, facts: [transaction, linked], today });
  assert.equal(once.income.property, 660);
  assert.equal(reconcileTaxEvidence(year, [transaction, linked]).linked.length, 1);
  const separate = fact("rental-income", 660, { id: "rent-manual-separate", employer: undefined, employerId: undefined, sourceType: "manual", date: "2026-09-02", provenance: { separateEconomicEvent: true } });
  assert.equal(calculateTaxPosition({ taxYear: year, facts: [transaction, separate], today }).income.property, 1320);
  const probable = fact("rental-income", 660, { id: "rent-manual-probable", employer: undefined, employerId: undefined, sourceType: "manual", date: "2026-09-03" });
  const warned = calculateTaxPosition({ taxYear: year, facts: [transaction, probable], today });
  assert.equal(warned.income.property, 1320);
  assert.ok(warned.issues.some(issue => issue.id.startsWith("rental-possible-duplicate")));
  const unrelated = { ...probable, id: "other-rent", amount: 700 };
  assert.equal(calculateTaxPosition({ taxYear: year, facts: [transaction, unrelated], today }).issues.some(issue => issue.id.startsWith("rental-possible-duplicate")), false);
});

test("legacy Complete readiness labels migrate safely to Good", () => {
  const migrated = migrateTaxStore({ ...emptyStore, taxReadiness: "Complete" });
  assert.equal(migrated.taxReadiness, "Good");
});
