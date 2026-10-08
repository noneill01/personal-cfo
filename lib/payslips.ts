import type { PayslipRecord, Tx, UserProfile } from "./types.ts";
import { isSalaryTransaction, transactionCycleKey, type SalaryDateMap } from "./pay-cycles.ts";

export type PayrollMonth = {
  key: string;
  netPay: number;
  salary: number;
  cashEarnings: number;
  tax: number;
  ni: number;
  employeePension: number;
  employerPension: number;
  records: PayslipRecord[];
};

/** Most recent payslip assigned to a salary cycle, regardless of today's calendar month. */
export function payslipForCycle(payslips: PayslipRecord[], cycleKey: string) {
  return payslips
    .filter((payslip) => payslip.payDate.slice(0, 7) === cycleKey)
    .sort((a, b) => b.payDate.localeCompare(a.payDate))[0];
}

/** Most recent payslip in the complete payroll history. */
export function latestPayslipRecord(payslips: PayslipRecord[]) {
  return [...payslips].sort((a, b) => b.payDate.localeCompare(a.payDate))[0];
}

/** One chart point per calendar payroll month, while preserving every source payslip. */
export function groupPayslipsByMonth(payslips: PayslipRecord[]): PayrollMonth[] {
  const months = payslips.reduce<Record<string, PayrollMonth>>((result, payslip) => {
    const key = payslip.payDate.slice(0, 7);
    result[key] ??= { key, netPay: 0, salary: 0, cashEarnings: 0, tax: 0, ni: 0, employeePension: 0, employerPension: 0, records: [] };
    const month = result[key];
    month.netPay += payslip.netPay;
    month.salary += payslip.salary;
    month.cashEarnings += payslip.cashEarnings;
    month.tax += payslip.tax;
    month.ni += payslip.ni;
    month.employeePension += payslip.employeePension;
    month.employerPension += payslip.employerPension;
    month.records.push(payslip);
    return result;
  }, {});
  return Object.values(months).sort((a, b) => b.key.localeCompare(a.key));
}

/** Add only payroll not yet represented by imported salary deposits. */
export function payrollFallbackByCycle(payslips: PayslipRecord[], salaryIncomeByCycle: Record<string, number>) {
  const payslipNetByCycle = payslips.reduce<Record<string, number>>((result, payslip) => {
    const key = payslip.payDate.slice(0, 7);
    result[key] = (result[key] || 0) + payslip.netPay;
    return result;
  }, {});
  return Object.fromEntries(Object.entries(payslipNetByCycle).map(([key, payslipNet]) => [key, Math.max(0, payslipNet - (salaryIncomeByCycle[key] || 0))]));
}

function payrollMonthRecords(payslips: PayslipRecord[], monthKey: string) {
  return payslips.filter(payslip => payslip.payDate.slice(0, 7) === monthKey);
}

function salaryDepositsForPayrollMonth(
  transactions: Pick<Tx, "date" | "merchant" | "category" | "subcategory" | "amount">[],
  payslips: PayslipRecord[],
  monthKey: string,
  incomeSources?: UserProfile["incomeSources"],
) {
  const payroll = payrollMonthRecords(payslips, monthKey);
  return transactions.filter(transaction => {
    if (transaction.date.slice(0, 7) !== monthKey || !isSalaryTransaction(transaction, incomeSources)) return false;
    // An employer-name-only receipt can be a reimbursement. When payroll
    // evidence exists, accept it only when it reconciles to a net-pay amount.
    return payroll.length === 0 || payroll.some(payslip => Math.abs(payslip.netPay - transaction.amount) < 0.01);
  });
}

/** Salary figures are reported by calendar payroll month, not cash-flow cycle. */
export function salaryIncomeForMonth(transactions: Pick<Tx, "date" | "merchant" | "category" | "subcategory" | "amount">[], monthKey: string, payslips: PayslipRecord[] = [], incomeSources?: UserProfile["incomeSources"]) {
  const payroll = payrollMonthRecords(payslips, monthKey);
  // Payslips are the authoritative source where available. This also keeps a
  // reimbursement from becoming salary merely because it came from an employer.
  if (payroll.length) return payroll.reduce((sum, payslip) => sum + payslip.netPay, 0);
  return salaryDepositsForPayrollMonth(transactions, payslips, monthKey, incomeSources)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

export type PayrollFallbackEntry = { payrollMonth: string; cycleKey: string; amount: number };

/**
 * Add only payroll which has no matching salary deposit. The fallback follows
 * the individual payslip's actual pay date, avoiding a handover-month being
 * silently assigned to the wrong cash-flow cycle.
 */
export function payrollFallbackEntries(
  payslips: PayslipRecord[],
  transactions: Pick<Tx, "date" | "merchant" | "category" | "subcategory" | "amount">[],
  payday: number,
  salaryDates: SalaryDateMap,
  incomeSources?: UserProfile["incomeSources"],
): PayrollFallbackEntry[] {
  const entries: PayrollFallbackEntry[] = [];
  const payrollMonths = [...new Set(payslips.map(payslip => payslip.payDate.slice(0, 7)))];
  for (const payrollMonth of payrollMonths) {
    const slips = payrollMonthRecords(payslips, payrollMonth).sort((a, b) => a.payDate.localeCompare(b.payDate));
    const deposits = salaryDepositsForPayrollMonth(transactions, payslips, payrollMonth, incomeSources)
      .map(transaction => ({ amount: transaction.amount }));
    const unmatchedSlips: PayslipRecord[] = [];
    for (const slip of slips) {
      const exactMatch = deposits.findIndex(deposit => Math.abs(deposit.amount - slip.netPay) < 0.01);
      if (exactMatch >= 0) deposits.splice(exactMatch, 1);
      else unmatchedSlips.push(slip);
    }
    let unmatchedDepositTotal = deposits.reduce((sum, deposit) => sum + deposit.amount, 0);
    for (const slip of unmatchedSlips) {
      const covered = Math.min(slip.netPay, unmatchedDepositTotal);
      unmatchedDepositTotal = Math.max(0, unmatchedDepositTotal - covered);
      const missing = Math.max(0, slip.netPay - covered);
      if (missing > 0.01) entries.push({
        payrollMonth,
        cycleKey: transactionCycleKey({ date: slip.payDate, merchant: slip.employer ?? "Payroll", category: "Income", subcategory: "Salary", amount: missing }, payday, salaryDates),
        amount: missing,
      });
    }
  }
  return entries;
}
