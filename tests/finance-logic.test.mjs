import assert from "node:assert/strict";
import test from "node:test";

import { categories, classifyWithRules, inferCategory, inferSubcategory, isInternalPotTransfer, subcategories } from "../lib/classification.ts";
import { backupAgeInDays, parseBackup, serialiseBackup, storeWithBackupTimestamp } from "../lib/backup.ts";
import { normaliseDate, parseBarclaycardCsv, parseCsv, parsePayslipText, statementMoney } from "../lib/imports.ts";
import { baselineMortgagePlanner, futureValueOfContributions, mortgageProjection } from "../lib/mortgage.ts";
import { applyPaydayRules, cycleBounds, expectedPayDate, payCycleAnchorDates, payCycleKey, transactionCycleKey } from "../lib/pay-cycles.ts";
import { cycleCoverageStatus } from "../lib/coverage.ts";
import { businessExpensePosition, isBusinessExpenseActivity, isExcludedFromSpending, reconcileImportedTransactions, savingsFundingUsed, savingsMovementBreakdown, spendingTreatmentFor, spendingTreatmentSummary, transactionKey } from "../lib/transactions.ts";
import { HEALTH_SCORE_VERSION, assessHealthReadiness, calculateHealthScore, explainHealthMovement, healthComponents } from "../lib/health.ts";
import { linkedGoalSource, syncGoalsWithBalances } from "../lib/goals.ts";
import { cashAfterCardDebt, cashBalance, isaBalance } from "../lib/balances.ts";
import { groupPayslipsByMonth, latestPayslipRecord, payrollFallbackByCycle, payrollFallbackEntries, payslipForCycle, salaryIncomeForMonth } from "../lib/payslips.ts";
import { buildCashRunway } from "../lib/cash-runway.ts";
import { calculateTaxPosition, createP60Evidence, documentFingerprintExists, payslipFacts, reconcileTaxEvidence, taxYearForDate } from "../lib/tax/index.ts";

test("pay cycles follow the actual salary date and keep salary in its named cycle", () => {
  const salaryDates = { "2026-07": "2026-07-24", "2026-08": "2026-08-26" };
  assert.equal(expectedPayDate("2026-07", 26), "2026-07-24");
  assert.deepEqual(cycleBounds("2026-07", 26, salaryDates), { start: "2026-07-24", end: "2026-08-25" });
  assert.equal(payCycleKey("2026-08-02", 26, salaryDates), "2026-07");
  assert.equal(transactionCycleKey({ date: "2026-07-24", merchant: "Previous Systems payroll", category: "Income", subcategory: "Salary", amount: 4100 }, 26, salaryDates), "2026-07");
});

test("UK tax years change on 6 April, not 1 April", () => {
  assert.equal(taxYearForDate("2026-04-05"), "2025/26");
  assert.equal(taxYearForDate("2026-04-06"), "2026/27");
});

test("P60 evidence reconciles payslips instead of adding a second employment total", () => {
  const payslips = [
    { id: "apr", taxYear: "2026/27", type: "employment-taxable-pay", amount: 10_000, sourceType: "payslip", confidence: "high", status: "active", employer: "Northstar Systems Limited" },
    { id: "may", taxYear: "2026/27", type: "employment-taxable-pay", amount: 10_000, sourceType: "payslip", confidence: "high", status: "active", employer: "Northstar Systems Limited" },
    { id: "apr-tax", taxYear: "2026/27", type: "income-tax-deducted", amount: 3_000, sourceType: "payslip", confidence: "high", status: "active", employer: "Northstar Systems Limited" },
    { id: "may-tax", taxYear: "2026/27", type: "income-tax-deducted", amount: 3_000, sourceType: "payslip", confidence: "high", status: "active", employer: "Northstar Systems Limited" },
  ];
  const p60 = createP60Evidence({ id: "p60-currentEmployer", taxYear: "2026/27", employer: "Northstar Systems Limited", date: "2027-04-05", taxablePay: 20_000, taxPaid: 6_000, importedAt: "2027-04-06T10:00:00.000Z" });
  const position = calculateTaxPosition({ taxYear: "2026/27", facts: [...payslips, ...p60.facts], documents: [p60.document] });
  assert.equal(position.income.employment, 20_000);
  assert.equal(position.taxPaid.paye, 6_000);
});

test("latest payslip YTD figures are used once instead of being summed across months", () => {
  const common = { fileName: "payslip.pdf", employer: "Northstar Systems Limited", salary: 10_000, cashEarnings: 10_000, tax: 3_000, ni: 500, netPay: 6_500, employeePension: 0, employerPension: 0, espp: 0, rsuGain: 0, rsuTaxCredit: 0, taxCode: "1257L" };
  const facts = payslipFacts([
    { ...common, id: "apr", payDate: "2026-04-28", ytdTaxablePay: 10_000, ytdTaxPaid: 3_000 },
    { ...common, id: "may", payDate: "2026-05-28", ytdTaxablePay: 20_000, ytdTaxPaid: 6_000 },
  ]);
  assert.equal(facts.filter(fact => fact.type === "employment-taxable-pay").reduce((sum, fact) => sum + fact.amount, 0), 20_000);
  assert.equal(facts.filter(fact => fact.type === "income-tax-deducted").reduce((sum, fact) => sum + fact.amount, 0), 6_000);
});

test("tax reconciliation retains separate employments and lets a P45 replace its own payslips", () => {
  const facts = [
    { id: "rapid-slip", taxYear: "2026/27", type: "employment-taxable-pay", amount: 30_000, sourceType: "payslip", confidence: "high", status: "active", employer: "Previous Systems Limited" },
    { id: "rapid-p45", taxYear: "2026/27", type: "employment-taxable-pay", amount: 31_000, sourceType: "p45", confidence: "verified", status: "active", employer: "Previous Systems Limited" },
    { id: "currentEmployer-slip", taxYear: "2026/27", type: "employment-taxable-pay", amount: 40_000, sourceType: "payslip", confidence: "high", status: "active", employer: "Northstar Systems Limited" },
  ];
  const reconciled = reconcileTaxEvidence("2026/27", facts);
  assert.equal(reconciled.facts.filter(fact => fact.type === "employment-taxable-pay").reduce((sum, fact) => sum + fact.amount, 0), 71_000);
});

test("manual facts remain manual, can contribute to a calculation and linked transactions are not double counted", () => {
  const facts = [
    { id: "bank-rent", taxYear: "2026/27", type: "rental-income", amount: 660, sourceType: "transaction", sourceId: "transaction:rent", linkedTransactionIds: ["rent"], confidence: "high", status: "active" },
    { id: "confirmed-rent", taxYear: "2026/27", type: "rental-income", amount: 660, sourceType: "manual", linkedTransactionIds: ["rent"], confidence: "medium", status: "active", explanation: "Manual confirmation" },
    { id: "manual-other", taxYear: "2026/27", type: "other-taxable-income", amount: 100, sourceType: "manual", confidence: "medium", status: "active" },
  ];
  const position = calculateTaxPosition({ taxYear: "2026/27", facts });
  assert.equal(position.income.property, 660);
  assert.equal(position.income.other, 100);
  assert.equal(facts.find(fact => fact.id === "manual-other")?.sourceType, "manual");
});

test("tax readiness separates an empty installation from partial evidence", () => {
  assert.equal(calculateTaxPosition({ taxYear: "2026/27", facts: [] }).readiness.status, "Setup needed");
  const partial = calculateTaxPosition({ taxYear: "2026/27", facts: [{ id: "income", taxYear: "2026/27", type: "employment-taxable-pay", amount: 20_000, sourceType: "payslip", confidence: "high", status: "active", employer: "Northstar Systems Limited" }] });
  assert.equal(partial.readiness.status, "Partial");
});

test("P60 document fingerprints prevent importing identical year-end evidence twice", () => {
  const p60 = createP60Evidence({ id: "p60", taxYear: "2026/27", employer: "Northstar Systems Limited", date: "2027-04-05", taxablePay: 180_000, taxPaid: 60_000, importedAt: "2027-04-06T10:00:00.000Z" });
  assert.equal(documentFingerprintExists([p60.document], p60.document.fingerprint), true);
});

test("salary deposits use pay-cycle bounds rather than their calendar month or amount", () => {
  const salaryDates = { "2026-07": "2026-07-28", "2026-08": "2026-08-28" };
  const earlyAugustSalary = { date: "2026-08-01", merchant: "current employer payroll adjustment", category: "Income", subcategory: "Salary", amount: 999.99 };
  assert.equal(transactionCycleKey(earlyAugustSalary, 28, salaryDates), "2026-07");
  assert.equal(transactionCycleKey({ ...earlyAugustSalary, amount: 1000 }, 28, salaryDates), "2026-07");
});

test("salary reporting stays strict and calendar-month based across an employer handover", () => {
  const salaryDates = { "2026-07": "2026-07-24", "2026-08": "2026-08-28" };
  const transactions = [
    { date: "2026-07-24", merchant: "Previous Systems payroll", category: "Income", subcategory: "Salary", amount: 4100 },
    { date: "2026-08-26", merchant: "Previous Systems payroll", category: "Income", subcategory: "Salary", amount: 7200 },
    { date: "2026-08-27", merchant: "Northstar Systems payroll", category: "Income", subcategory: "Salary", amount: 3000 },
    { date: "2026-08-29", merchant: "Navan reimbursement", category: "Income", subcategory: "Refund", amount: 500 },
    { date: "2026-08-30", merchant: "Example Tenant", category: "Income", subcategory: "Rental income", amount: 660 },
  ];
  assert.equal(salaryIncomeForMonth(transactions, "2026-07"), 4100);
  assert.equal(Number(salaryIncomeForMonth(transactions, "2026-08").toFixed(2)), 10200);
  assert.equal(transactionCycleKey(transactions[1], 28, salaryDates), "2026-07");
  assert.equal(transactionCycleKey(transactions[2], 28, salaryDates), "2026-07");
});

test("payslip-backed salary ignores an employer reimbursement classified as salary", () => {
  const base = { salary: 0, cashEarnings: 0, tax: 0, ni: 0, employeePension: 0, employerPension: 0, espp: 0, rsuGain: 0, rsuTaxCredit: 0, taxCode: "" };
  const payslips = [{ ...base, id: "rapid-july", fileName: "rapid.pdf", employer: "Previous Systems Limited", payDate: "2026-07-24", netPay: 4100 }];
  const transactions = [
    { date: "2026-07-02", merchant: "Northstar Systems", category: "Income", subcategory: "Salary", amount: 242.98 },
    { date: "2026-07-24", merchant: "Previous Systems", category: "Income", subcategory: "Salary", amount: 4100 },
  ];
  assert.equal(salaryIncomeForMonth(transactions, "2026-07", payslips), 4100);
});

test("unmatched payroll fallback follows its payslip date rather than the handover month", () => {
  const base = { salary: 0, cashEarnings: 0, tax: 0, ni: 0, employeePension: 0, employerPension: 0, espp: 0, rsuGain: 0, rsuTaxCredit: 0, taxCode: "" };
  const slips = [
    { ...base, id: "rapid", fileName: "rapid.pdf", employer: "Previous Systems Limited", payDate: "2026-08-26", netPay: 7200 },
    { ...base, id: "currentEmployer", fileName: "currentEmployer.pdf", employer: "Northstar Systems Limited", payDate: "2026-08-28", netPay: 3000 },
  ];
  const deposits = [{ date: "2026-08-28", merchant: "Northstar Systems payroll", category: "Income", subcategory: "Salary", amount: 3000 }];
  assert.deepEqual(payrollFallbackEntries(slips, deposits, 28, { "2026-08": "2026-08-28" }), [{ payrollMonth: "2026-08", cycleKey: "2026-07", amount: 7200 }]);
});

test("payday rules preserve actual pay dates and clamp dates beyond a month end", () => {
  assert.equal(expectedPayDate("2026-04", 31), "2026-04-30");
  assert.equal(expectedPayDate("2026-02", 31), "2026-02-27");
  const dates = applyPaydayRules({ "2026-08": "2026-08-27" }, [{ effectiveFrom: "2026-08", payday: 28 }], 28, "2026-09");
  assert.equal(dates["2026-08"], "2026-08-27");
  assert.equal(dates["2026-09"], "2026-09-28");
});

test("a final outgoing-employer payment cannot override the incoming employer payday", () => {
  const anchors=payCycleAnchorDates([
    {date:"2026-08-24",employer:"Previous Systems"},
    {date:"2026-08-28",employer:"Northstar Systems"},
  ],[{effectiveFrom:"2026-08",payday:28,employer:"Northstar Systems"}],28,"2026-09");
  assert.equal(anchors["2026-08"],"2026-08-28");
  assert.deepEqual(cycleBounds("2026-07",28,anchors),{start:"2026-07-28",end:"2026-08-27"});
  assert.equal(payCycleKey("2026-08-24",28,anchors),"2026-07");
  assert.equal(payCycleKey("2026-08-28",28,anchors),"2026-08");
});

test("a fixed new-employer cadence keeps an early transition payment in the prior cycle", () => {
  const anchors=payCycleAnchorDates([
    {date:"2026-08-26",employer:"Previous Systems"},
    {date:"2026-08-27",employer:"Northstar Systems"},
  ],[{effectiveFrom:"2026-08",payday:28,employer:"Northstar Systems",strictStart:true}],28,"2026-09");
  assert.equal(anchors["2026-08"],"2026-08-28");
  assert.equal(payCycleKey("2026-08-27",28,anchors),"2026-07");
});

test("cash runway follows the Monzo balance and treats savings transfers as top-ups", () => {
  const transactions = [
    { id: "salary", date: "2026-08-28", merchant: "current employer payroll", category: "Income", amount: 2000, account: "Monzo" },
    { id: "groceries", date: "2026-08-29", merchant: "Tesco", category: "Groceries", amount: -100, account: "Monzo" },
    { id: "topup", date: "2026-08-30", merchant: "Savings transfer", category: "Savings", amount: 400, account: "Monzo" },
    { id: "bills", date: "2026-08-31", merchant: "Mortgage", category: "Housing", amount: -500, account: "Monzo" },
  ];
  const runway = buildCashRunway({ allTransactions: transactions, personalTransactions: [transactions[1]], start: "2026-08-28", end: "2026-09-27", cashAccounts:[{accountId:"monzo-current",balance:2800,balanceThrough:"2026-08-31"}], spendingPlan: 930, live: true });
  assert.equal(runway.openingBalance, 1000);
  assert.equal(runway.balanceAtEnd, 2800);
  assert.equal(runway.savingsTopUps, 400);
  assert.equal(runway.points.at(-1)?.actual, 2800);
  assert.ok((runway.points.at(-1)?.onTrack ?? 0) < 2800, "cash is ahead after the savings top-up and bills movement");
});

test("cash runway schedules fixed commitments instead of pacing them as daily spending", () => {
  const transactions = [
    { id: "salary", date: "2026-08-28", merchant: "current employer payroll", category: "Income", amount: 5000, account: "Monzo" },
    { id: "mortgage", date: "2026-09-01", merchant: "Mortgage", category: "Housing", amount: -2000, account: "Monzo" },
    { id: "groceries", date: "2026-09-02", merchant: "Tesco", category: "Groceries", amount: -100, account: "Monzo" },
  ];
  const runway = buildCashRunway({
    allTransactions: transactions,
    personalTransactions: [transactions[1], transactions[2]],
    start: "2026-08-28",
    end: "2026-09-27",
    cashAccounts:[{accountId:"monzo-current",balance:2900,balanceThrough:"2026-09-02"}],
    spendingPlan: 3000,
    fixedCommitments: [{ key: "mortgage", expected: 2000, scheduledAmount: 2000, lastDate: "2026-09-01", frequency: "monthly" }],
    live: true,
  });
  const mortgageDay = runway.points.find(point => point.date === "2026-09-01");
  assert.equal(mortgageDay?.expectedFixedSpend, 2000);
  assert.ok(Math.abs((mortgageDay?.actual ?? 0) - (mortgageDay?.onTrack ?? 0)) < 200, "a known mortgage payment should not make the cash path look materially behind plan");
});

test("backup metadata is dated and can trigger a 30-day freshness warning", () => {
  const store = { transactions: [], balances: [], goals: [], monthlyBudget: 0, updatedAt: "2026-09-01" };
  const backedUp = storeWithBackupTimestamp(store, "2026-09-03T10:00:00.000Z");
  assert.equal(backedUp.lastBackupAt, "2026-09-03T10:00:00.000Z");
  assert.equal(backupAgeInDays(backedUp.lastBackupAt, "2026-09-03"), 0);
  assert.equal(backupAgeInDays("2026-07-20T10:00:00.000Z", "2026-09-03"), 45);
  assert.equal(backupAgeInDays(undefined, "2026-09-03"), null);
});

test("card review confirmation closes statement-timing gaps without changing raw coverage", () => {
  const salaryDates = { "2026-07": "2026-07-24", "2026-08": "2026-08-26" };
  const coverage = {required:[{accountId:"current-a",name:"Current",kind:"current",requirement:"required",from:"2026-01-01",to:"2026-08-25",gaps:[],count:1},{accountId:"card-a",name:"Card",kind:"credit-card",requirement:"required",from:"2026-01-01",to:"2026-08-20",gaps:[],count:1}]};
  const waiting = cycleCoverageStatus("2026-07", 26, salaryDates, coverage);
  assert.equal(waiting.currentComplete, true);
  assert.equal(waiting.creditComplete, false);
  assert.equal(waiting.complete, false);
  const reviewed = cycleCoverageStatus("2026-07", 26, salaryDates, coverage, [], {}, {"2026-07":{"card-a":{ through: "2026-08-25", confirmedAt: "2026-08-27T12:00:00.000Z" }}});
  assert.equal(reviewed.creditComplete, true);
  assert.equal(reviewed.complete, true);
  assert.equal(reviewed.effectiveCreditTo, "2026-08-25");
  assert.equal(coverage.required[1].to, "2026-08-20");
});

test("dual-employer payroll is combined monthly but reconciled without double counting deposits", () => {
  const base = { salary: 0, cashEarnings: 0, tax: 0, ni: 0, employeePension: 0, employerPension: 0, espp: 0, rsuGain: 0, rsuTaxCredit: 0, taxCode: "" };
  const previousEmployer = { ...base, id: "previousEmployer-aug", fileName: "previousEmployer.pdf", employer: "Previous Systems Limited", payDate: "2026-08-26", netPay: 7200 };
  const currentEmployer = { ...base, id: "currentEmployer-aug", fileName: "currentEmployer.pdf", employer: "Northstar Systems Limited", payDate: "2026-08-28", netPay: 3000 };
  const months = groupPayslipsByMonth([previousEmployer, currentEmployer]);
  assert.equal(months.length, 1);
  assert.equal(months[0].key, "2026-08");
  assert.equal(Number(months[0].netPay.toFixed(2)), 10200);
  assert.equal(months[0].records.length, 2);
  assert.equal(Number(payrollFallbackByCycle([previousEmployer, currentEmployer], { "2026-08": 7200 })["2026-08"].toFixed(2)), 3000);
  assert.equal(payrollFallbackByCycle([previousEmployer, currentEmployer], { "2026-08": 10200 })["2026-08"], 0);
});

test("reconciliation treats an end-of-month payslip as current for its active salary cycle", () => {
  const base = { fileName: "payslip.pdf", salary: 1000, cashEarnings: 1000, tax: 100, ni: 50, netPay: 850, employeePension: 0, employerPension: 0, espp: 0, rsuGain: 0, rsuTaxCredit: 0, taxCode: "1257L" };
  const july = { ...base, id: "july", payDate: "2026-07-24" };
  const august = { ...base, id: "august", employer: "Northstar Systems Limited", payDate: "2026-08-28" };

  assert.equal(payslipForCycle([july, august], "2026-08")?.id, "august");
  assert.equal(payslipForCycle([july, august], "2026-09"), undefined);
  assert.equal(latestPayslipRecord([july, august])?.id, "august");
});

test("mortgage projections are deterministic and distinguish overpaying", () => {
  const scenario = { ...baselineMortgagePlanner, balance: 250000, annualRate: 5, monthlyPayment: 1500, monthlyOverpayment: 250 };
  const baseline = mortgageProjection(scenario, 0, 0);
  const overpaying = mortgageProjection(scenario);
  assert.equal(baseline.valid, true);
  assert.equal(overpaying.valid, true);
  assert.ok(overpaying.months < baseline.months);
  assert.ok(overpaying.interest < baseline.interest);
  assert.ok(futureValueOfContributions(250, 0, 120, 7) > 30_000);
});

test("pot movements remain savings and never become spending", () => {
  const transaction = { id: "pot-1", date: "2026-08-01", merchant: "Motorbike pot", category: "Cycling", amount: -134.44, account: "Monzo", transactionType: "Pot transfer" };
  const classified = classifyWithRules(transaction, []);
  assert.equal(isInternalPotTransfer(transaction), true);
  assert.equal(classified.category, "Savings");
  assert.equal(classified.subcategory, "Bills pot");
  assert.equal(isExcludedFromSpending(classified), true);
  assert.equal(inferCategory("Previous Systems payroll"), "Income");
});

test("Rental property costs have dedicated tax-friendly categories", () => {
  assert.ok(categories.includes("Rental property"));
  assert.ok(subcategories["Rental property"].includes("Safety & compliance"));
  assert.ok(subcategories["Rental property"].includes("Heating"));
  assert.ok(subcategories["Rental property"].includes("Capital improvements — review"));
  assert.equal(inferSubcategory("Rental property", "Fire alarm purchase"), "Safety & compliance");
  assert.equal(inferSubcategory("Rental property", "Annual boiler service"), "Heating");
});

test("savings movement explains the net total and excludes bills-pot funding", () => {
  const transactions = [
    { id: "cash-in", date: "2026-08-01", merchant: "Cash savings pot", category: "Savings", subcategory: "Cash savings", amount: -400, account: "Monzo", transactionType: "Pot transfer" },
    { id: "cash-out", date: "2026-08-02", merchant: "Cash savings pot", category: "Savings", subcategory: "Cash savings", amount: 100, account: "Monzo", transactionType: "Pot transfer" },
    { id: "challenge", date: "2026-08-03", merchant: "1p Saving Challenge", category: "Savings", subcategory: "Savings challenge", amount: -12.5, account: "Monzo", transactionType: "Pot transfer" },
    { id: "isa", date: "2026-08-04", merchant: "Trading 212", category: "Savings", subcategory: "ISA", amount: -50, account: "Monzo" },
    { id: "bills", date: "2026-08-05", merchant: "Mortgage pot", category: "Savings", subcategory: "Bills pot", amount: -2400, account: "Monzo", transactionType: "Pot transfer" },
  ];
  assert.deepEqual(savingsMovementBreakdown(transactions), [["Cash savings", 300], ["ISA", 50], ["Savings challenge", 12.5]]);
  assert.equal(savingsMovementBreakdown(transactions).reduce((sum, [, value]) => sum + value, 0), 362.5);
  assert.equal(savingsFundingUsed(transactions), 0);
  assert.equal(savingsFundingUsed([
    { ...transactions[0], amount: -200 },
    { ...transactions[1], amount: 1000 },
    { ...transactions[4], amount: 2400 },
  ]), 800);
});

test("CSV and locale parsing reject ambiguity instead of inventing money", () => {
  const rows = parseCsv("\uFEFFDate,Description,Amount\n01/08/2026,Coffee,-3.50\n");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].description, "Coffee");
  assert.equal(normaliseDate(rows[0].date), "2026-08-01");
  assert.equal(statementMoney("£1.234,56"), 1234.56);
  assert.equal(Number.isNaN(statementMoney("not money")), true);
});

test("Barclaycard CSV imports purchases, credits and reports invalid rows", () => {
  const parsed = parseBarclaycardCsv("\uFEFFTransaction Date,Transaction Description,Debit Amount,Credit Amount\n01/08/2026,Tesco,42.18,\n02/08/2026,Hotel refund,,25.00\n03/08/2026,Payment Thank You,,500.00\nnot-a-date,Broken row,abc,\n", "August card.csv");
  assert.equal(parsed.format, "CSV");
  assert.deepEqual(parsed.transactions, [
    { date: "2026-08-01", merchant: "Tesco", amount: -42.18 },
    { date: "2026-08-02", merchant: "Hotel refund", amount: 25 },
  ]);
  assert.equal(parsed.rejected, 1);
  assert.match(parsed.issues[0], /Row 5/);
});

test("Barclaycard CSV recognises common single-amount and statement summary columns", () => {
  const parsed = parseBarclaycardCsv("Date,Description,Amount,Statement Balance,Statement Date,Minimum Payment,Due Date,Credit Limit\n05/08/2026,Example Shop,18.50,2890.28,07/08/2026,28.90,28/08/2026,9500\n06/08/2026,Reversal CR,7.25,,,,\n");
  assert.deepEqual(parsed.transactions.map(transaction => transaction.amount), [-18.5, 7.25]);
  assert.equal(parsed.summary?.balance, 2890.28);
  assert.equal(parsed.summary?.statementDate, "2026-08-07");
  assert.equal(parsed.summary?.dueDate, "2026-08-28");
});

test("Barclaycard headerless CSV keeps the first row and supplied category", () => {
  const parsed = parseBarclaycardCsv("03 Aug 26,EXAMPLE BISTRO,TEST LOCATION TRANSACTION FEE £0.71,VISA,TEST USER,Entertainment,24.55\n04 Aug 26,EXAMPLE MARKET,TEST TOWN,VISA,TEST USER,Groceries,42.18\n");
  assert.deepEqual(parsed.transactions, [
    { date: "2026-08-03", merchant: "EXAMPLE BISTRO", amount: -24.55, sourceCategory: "Entertainment" },
    { date: "2026-08-04", merchant: "EXAMPLE MARKET", amount: -42.18, sourceCategory: "Groceries" },
  ]);
  assert.equal(parsed.rejected, 0);
});

test("final ADP payslips import annual leave and an ESPP refund", () => {
  const parsed = parsePayslipText(`
    Previous Systems Limited
    Salary
    SALARY SACRIFICE
    *CI BIK
    *PMI BIK
    *Travel BIK
    *Cash Plan BIK
    Annual Leave Payout Days
    8,000.00
    -400.00
    20.00
    80.00
    2.00
    18.00
    3,000.00
    Tax (Code 2461T)
    ESPP Refund
    NI (Category A)
    2,500.00
    -2,000.00
    400.00
    Pay Day 26/08/2026
    Earnings Deductions Net pay B/forward Amount paid C/forward Payment method
    10,720.00 2,900.00 7,820.00 7,820.00
    Employer's Contributions
    NI (Category A)
    SS-Employee Pension
    ER-Employer Pension
    1,700.00
    400.00
    560.00
  `, "Payslip_2026-08-26.pdf");
  assert.deepEqual({
    payDate: parsed.payDate,
    employer: parsed.employer,
    salary: parsed.salary,
    cashEarnings: parsed.cashEarnings,
    tax: parsed.tax,
    ni: parsed.ni,
    netPay: parsed.netPay,
    employeePension: parsed.employeePension,
    employerPension: parsed.employerPension,
    espp: parsed.espp,
    esppRefund: parsed.esppRefund,
    annualLeavePayout: parsed.annualLeavePayout,
    taxCode: parsed.taxCode,
  }, {
    payDate: "2026-08-26",
    employer: "Previous Systems Limited",
    salary: 8000,
    cashEarnings: 10720,
    tax: 2500,
    ni: 400,
    netPay: 7820,
    employeePension: 400,
    employerPension: 560,
    espp: 0,
    esppRefund: 2000,
    annualLeavePayout: 3000,
    taxCode: "2461T",
  });
});

test("Northstar Systems payslips import Workplace Pension and grouped deductions", () => {
  const parsed = parsePayslipText(`
    Test Employee
    28/08/2026
    Monthly Paid
    1257L W1/M1ASG255950C
    Northstar Systems Limited
    Payments
    Basic Pay Tax Paid
    EE NI Contribution
    Workplace Pension
    4,000.00 600.00
    200.00
    200.00
    Gross Pay Deductions
    Net Pay
    Payment Method
    1,103.03
    EE's Pension 200.00 200.00
    ER's Pension 200.00 200.00
  `, "Payslip-202605.pdf");
  assert.deepEqual({
    payDate: parsed.payDate,
    employer: parsed.employer,
    salary: parsed.salary,
    cashEarnings: parsed.cashEarnings,
    tax: parsed.tax,
    ni: parsed.ni,
    netPay: parsed.netPay,
    employeePension: parsed.employeePension,
    employerPension: parsed.employerPension,
    espp: parsed.espp,
    rsuGain: parsed.rsuGain,
    taxCode: parsed.taxCode,
  }, {
    payDate: "2026-08-28",
    employer: "Northstar Systems Limited",
    salary: 4000,
    cashEarnings: 4000,
    tax: 600,
    ni: 200,
    netPay: 3000,
    employeePension: 200,
    employerPension: 200,
    espp: 0,
    rsuGain: 0,
    taxCode: "1257L W1/M1",
  });
});

test("transaction fingerprints and backups round-trip without changing data", () => {
  const transaction = { id: "1", date: "2026-08-01", merchant: "Tesco", category: "Groceries", amount: -10, account: "Monzo" };
  assert.equal(transactionKey(transaction), "2026-08-01|tesco|-10.00|monzo");
  const store = { transactions: [transaction], balances: [], goals: [], monthlyBudget: 6000, updatedAt: "2026-08-01" };
  assert.deepEqual(parseBackup(serialiseBackup(store)), store);
  assert.throws(() => parseBackup('{"transactions":[]}'));
});

test("keeps two real same-value Monzo transactions when their provider IDs differ", () => {
  const first = { id: "one", sourceId: "tx-one", date: "2026-09-01", transactionTime: "10:15:00", merchant: "Same merchant", category: "Shopping", amount: -129.5, account: "Monzo" };
  const second = { ...first, id: "two", sourceId: "tx-two", transactionTime: "10:18:00" };
  assert.notEqual(transactionKey(first), transactionKey(second));
  assert.deepEqual(reconcileImportedTransactions([], [first, second]).fresh.map(transaction=>transaction.id), ["one", "two"]);
});

test("matches one legacy transaction once and restores the second real Monzo payment", () => {
  const legacy = { id: "legacy", date: "2026-09-01", merchant: "Same merchant", category: "Shopping", amount: -129.5, account: "Monzo" };
  const first = { ...legacy, id: "one", sourceId: "tx-one", transactionTime: "10:15:00", reference: "First child" };
  const second = { ...legacy, id: "two", sourceId: "tx-two", transactionTime: "10:18:00", reference: "Second child" };
  const result=reconcileImportedTransactions([legacy],[first,second]);
  assert.equal(result.skipped,1);
  assert.equal(result.base[0].sourceId,"tx-one");
  assert.equal(result.base[0].reference,"First child");
  assert.deepEqual(result.fresh.map(transaction=>transaction.id),["two"]);
});

test("an import fingerprint prevents a repeat card-file import without merging a real repeat purchase", () => {
  const first = { id: "card-one", fingerprint: "statement-aug|row-3", date: "2026-08-03", merchant: "Hotel", category: "Travel", amount: -129.5, account: "Barclaycard" };
  const second = { ...first, id: "card-two", fingerprint: "statement-aug|row-4" };
  assert.equal(reconcileImportedTransactions([], [first, second]).fresh.length, 2);
  assert.equal(reconcileImportedTransactions([first, second], [first, second]).skipped, 2);
});

test("account balances are the single source of truth for linked goals", () => {
  const goals = [
    { id: "ef", name: "Emergency fund", target: 30000, current: 1, colour: "green" },
    { id: "isa", name: "ISA", target: 25000, current: 2, colour: "blue" },
    { id: "pension", name: "Pension", target: 500000, current: 3, colour: "gold" },
  ];
  const balances = [
    { id: "savings", name: "Cash savings", group: "asset", type: "Cash", value: 9000 },
    { id: "t212", name: "Trading 212", group: "asset", type: "ISA", value: 750 },
    { id: "rl", name: "Legacy Pension", group: "asset", type: "Pension", value: 180000 },
    { id: "hl", name: "HL", group: "asset", type: "Pension", value: 96000 },
  ];
  assert.deepEqual(syncGoalsWithBalances(goals, balances).map(goal => goal.current), [9000, 750, 276000]);
  assert.equal(linkedGoalSource("ef"), "Current account + cash savings + Cash ISAs − card debt");
});

test("cash after card debt excludes ISA investments", () => {
  const balances = [
    { id: "monzo-current", name: "Monzo current", group: "asset", type: "Current account", value: 1500 },
    { id: "savings", name: "Cash savings", group: "asset", type: "Cash", value: 12000 },
    { id: "t212", name: "Trading 212", group: "asset", type: "ISA", value: 750 },
    { id: "barclaycard-debt", name: "Barclaycard", group: "liability", type: "Credit card", value: 1200 },
  ];
  assert.equal(cashBalance(balances), 13500);
  assert.equal(isaBalance(balances), 750);
  assert.equal(cashAfterCardDebt(balances), 12300);
});

test("financial health is directional and explains component movement", () => {
  const previous = { cashProgress: 20, savingsRate: 12, debtRatio: 49 };
  const current = { cashProgress: 28, savingsRate: 15, debtRatio: 47 };
  const movement = explainHealthMovement(current, previous);
  assert.equal(movement.score, calculateHealthScore(current));
  assert.equal(movement.direction, "improving");
  assert.ok(movement.change > 0);
  assert.ok(movement.movements.some(component => component.change > 0));
});

test("financial health v3 has the published 0–100 meaning", () => {
  assert.equal(HEALTH_SCORE_VERSION, 3);
  assert.equal(calculateHealthScore({ cashProgress: 0, savingsRate: 0, cashFlowMargin: 0, debtRatio: 0 }), 40);
  assert.equal(calculateHealthScore({ cashProgress: 0, savingsRate: 0, cashFlowMargin: -20, debtRatio: 0 }), 25);
  assert.equal(calculateHealthScore({ cashProgress: 100, savingsRate: 20, cashFlowMargin: 20, debtRatio: 0 }), 100);
  const reserve = healthComponents({ cashProgress: 72, savingsRate: 0, cashFlowMargin: 0, debtRatio: 75 }).find(component => component.key === "cash");
  assert.equal(reserve?.points, 25.2);
});

test("health score readiness distinguishes missing data from a healthy zero-debt position", () => {
  const empty=assessHealthReadiness({hasAssetBalance:false,hasCashBalance:false,hasDebtBalance:false,completeCycles:0});
  assert.equal(empty.ready,false);
  assert.equal(empty.confidence,"Setup needed");
  const partial=assessHealthReadiness({hasAssetBalance:true,hasCashBalance:true,hasDebtBalance:true,completeCycles:0});
  assert.equal(partial.ready,false);
  assert.equal(partial.confidence,"Partial");
  const complete=assessHealthReadiness({hasAssetBalance:true,hasCashBalance:true,hasDebtBalance:true,completeCycles:1});
  assert.equal(complete.ready,true);
  assert.equal(complete.confidence,"Complete");
});

test("spending treatment separates one-offs from underlying costs", () => {
  const transactions = [
    { id: "dd", date: "2026-08-01", merchant: "Mortgage", category: "Housing", amount: -2000, account: "Monzo", transactionType: "Direct Debit" },
    { id: "food", date: "2026-08-02", merchant: "Tesco", category: "Groceries", amount: -100, account: "Monzo" },
    { id: "trip", date: "2026-08-03", merchant: "Hotel", category: "Travel", amount: -500, account: "Barclaycard", spendingTreatment: "Planned one-off" },
    { id: "pot", date: "2026-08-04", merchant: "Savings pot", category: "Savings", amount: -200, account: "Monzo" },
  ];
  const summary = spendingTreatmentSummary(transactions);
  assert.equal(spendingTreatmentFor(transactions[0]), "Recurring");
  assert.equal(summary.Recurring, 2000);
  assert.equal(summary["Normal variable"], 100);
  assert.equal(summary["Planned one-off"], 500);
  assert.equal(Object.values(summary).reduce((sum, value) => sum + value, 0), 2600);
});

test("reimbursable work costs stay visible without distorting personal spending or income", () => {
  const transactions = [
    { id: "flight", date: "2026-08-20", merchant: "EasyJet", category: "Travel", subcategory: "Flights", amount: -420, account: "Barclaycard", spendingTreatment: "Reimbursable business" },
    { id: "hotel", date: "2026-08-20", merchant: "Hotel", category: "Business expenses", subcategory: "Hotels", amount: -580, account: "Barclaycard" },
    { id: "repayment", date: "2026-09-02", merchant: "current employer expenses", category: "Business expenses", subcategory: "Reimbursement", amount: 750, account: "Monzo" },
  ];
  assert.equal(isExcludedFromSpending(transactions[0]), true);
  assert.equal(isExcludedFromSpending(transactions[1]), true);
  assert.equal(spendingTreatmentFor(transactions[0]), "Reimbursable business");
  assert.ok(transactions.every(isBusinessExpenseActivity));
  assert.deepEqual(businessExpensePosition(transactions), { spent: 1000, reimbursed: 750, outstanding: 250, net: -250 });
  assert.deepEqual(spendingTreatmentSummary(transactions), { Recurring: 0, "Normal variable": 0, "Planned one-off": 0, "Unplanned one-off": 0 });
});
