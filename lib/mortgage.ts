import type { MortgagePlanner, MortgageProjection } from "./types.ts";

export const baselineMortgagePlanner: MortgagePlanner = {
  balance: 0,
  annualRate: 0,
  monthlyPayment: 0,
  monthlyOverpayment: 0,
  annualOverpayment: 0,
  investmentReturn: 7,
};

export function mortgageProjection(settings: MortgagePlanner, monthlyExtra = settings.monthlyOverpayment, annualExtra = settings.annualOverpayment): MortgageProjection {
  let balance = Math.max(0, settings.balance);
  const rate = Math.max(0, settings.annualRate) / 1200;
  let months = 0;
  let interest = 0;
  let totalPaid = 0;
  const balances = [balance];
  if (balance <= 0) return { months: 0, interest: 0, totalPaid: 0, balances: [0], valid: true };
  if (settings.monthlyPayment + monthlyExtra <= balance * rate) return { months: 0, interest: 0, totalPaid: 0, balances, valid: false };
  while (balance > 0.01 && months < 1200) {
    months++;
    const monthlyInterest = balance * rate;
    interest += monthlyInterest;
    balance += monthlyInterest;
    const regular = Math.min(balance, Math.max(0, settings.monthlyPayment + monthlyExtra));
    balance -= regular;
    totalPaid += regular;
    if (annualExtra > 0 && months % 12 === 0 && balance > 0) {
      const lump = Math.min(balance, annualExtra);
      balance -= lump;
      totalPaid += lump;
    }
    if (months % 12 === 0 || balance <= 0.01) balances.push(Math.max(0, balance));
  }
  return { months, interest, totalPaid, balances, valid: balance <= 0.01 };
}

export function futureValueOfContributions(monthly: number, annual: number, months: number, annualReturn: number) {
  const rate = Math.max(0, annualReturn) / 1200;
  let value = 0;
  for (let month = 1; month <= months; month++) {
    value *= 1 + rate;
    value += Math.max(0, monthly);
    if (month % 12 === 0) value += Math.max(0, annual);
  }
  return value;
}
