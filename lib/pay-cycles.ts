import type { Tx, UserProfile } from "./types.ts";
import { transactionRole } from "./transaction-roles.ts";

export type SalaryDateMap = Record<string, string>;
export type PaydayRule = { effectiveFrom: string; payday: number; employer?: string; strictStart?: boolean };
export type PayCycleAnchor = { date: string; employer?: string };

export function previousMonthKey(key: string) { const [year, month] = key.split("-").map(Number); const date = new Date(year, month - 2, 1, 12); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }
export function nextMonthKey(key: string) { const [year, month] = key.split("-").map(Number); const date = new Date(year, month, 1, 12); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }
export function shiftIsoDate(value: string, days: number) { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); }
export function ordinalDay(value: string) { const day = Number(value.slice(-2)); const suffix = day % 100 >= 11 && day % 100 <= 13 ? "th" : day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th"; return `${day}${suffix}`; }
export function expectedPayDate(key: string, payday = 26) {
  const [year, month] = key.split("-").map(Number);
  const lastDay = new Date(year, month, 0, 12).getDate();
  const safePayday = Math.min(lastDay, Math.max(1, Math.floor(payday)));
  const date = new Date(year, month - 1, safePayday, 12);
  if (date.getDay() === 6) date.setDate(date.getDate() - 1);
  if (date.getDay() === 0) date.setDate(date.getDate() - 2);
  return date.toISOString().slice(0, 10);
}
export function paydayForMonth(key: string, fallbackPayday = 26, rules: PaydayRule[] = []) { return [...rules].filter(rule=>/^\d{4}-\d{2}$/.test(rule.effectiveFrom)&&rule.effectiveFrom<=key).sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom)).at(-1)?.payday??fallbackPayday; }
export function applyPaydayRules(actualDates: SalaryDateMap, rules: PaydayRule[], fallbackPayday = 26, throughKey?: string) {
  const dates={...actualDates};
  const firstRule=[...rules].sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom))[0];
  if(!firstRule)return dates;
  let key=firstRule.effectiveFrom;
  const lastKey=throughKey??nextMonthKey(new Date().toISOString().slice(0,7));
  while(key<=lastKey){dates[key]??=expectedPayDate(key,paydayForMonth(key,fallbackPayday,rules));key=nextMonthKey(key)}
  return dates;
}
function normaliseEmployer(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function matchesEmployer(actual: string, expected: string) {
  const actualName=normaliseEmployer(actual);const expectedName=normaliseEmployer(expected);
  if(!actualName||!expectedName)return true;
  if(actualName===expectedName||actualName.includes(expectedName)||expectedName.includes(actualName))return true;
  const expectedWords=new Set(expectedName.split(" ").filter(word=>word.length>=4));
  return actualName.split(" ").some(word=>word.length>=4&&expectedWords.has(word));
}
/**
 * Derive salary-cycle anchors without allowing an outgoing employer's final
 * payment to move a new employer's configured payday. A transition payment is
 * still retained as income; it simply remains inside the previous cycle.
 */
export function payCycleAnchorDates(records: PayCycleAnchor[], rules: PaydayRule[], fallbackPayday = 26, throughKey?: string) {
  const dates:SalaryDateMap={};
  for(const record of records){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(record.date))continue;
    const key=record.date.slice(0,7);
    const activeRule=[...rules].filter(rule=>/^\d{4}-\d{2}$/.test(rule.effectiveFrom)&&rule.effectiveFrom<=key).sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom)).at(-1);
    if(activeRule?.employer&&record.employer&&!matchesEmployer(record.employer,activeRule.employer))continue;
    // A deliberate new-employer cadence may be fixed from its start date. In
    // that case a one-off early transition payment is income in the prior
    // cycle, rather than redefining the schedule for all future reporting.
    if(activeRule?.strictStart&&record.date<expectedPayDate(key,activeRule.payday))continue;
    if(!dates[key]||record.date>dates[key])dates[key]=record.date;
  }
  return applyPaydayRules(dates,rules,fallbackPayday,throughKey);
}
export function cycleStartDate(key: string, payday = 26, salaryDates: SalaryDateMap = {}) { return salaryDates[key] ?? expectedPayDate(key, payday); }
export function payCycleKey(date: string, payday = 26, salaryDates: SalaryDateMap = {}) { const monthKey = date.slice(0, 7); return date >= cycleStartDate(monthKey, payday, salaryDates) ? monthKey : previousMonthKey(monthKey); }
type IncomeSources = UserProfile["incomeSources"];
const sourceMatches = (merchant: string, kind: "salary" | "rental", sources?: IncomeSources) => sources?.some(source => source.kind === kind && source.merchantContains.some(alias => alias && merchant.toLowerCase().includes(alias.toLowerCase()))) ?? false;
export function isSalaryTransaction(transaction: Pick<Tx, "merchant" | "category" | "amount"> & Partial<Pick<Tx,"account"|"subcategory"|"categoryGroup"|"subcategoryId"|"role">>, sources?: IncomeSources) { return transaction.amount > 0 && (transactionRole(transaction)==="salary" || transaction.role===undefined&&transactionRole(transaction)==="none"&&sourceMatches(transaction.merchant,"salary",sources)); }
export function isRentalIncome(transaction: Pick<Tx, "merchant" | "category" | "amount"> & Partial<Pick<Tx,"account"|"subcategory"|"categoryGroup"|"subcategoryId"|"role">>, sources?: IncomeSources) { return transaction.amount > 0 && (transactionRole(transaction)==="rental-income" || transaction.role===undefined&&transactionRole(transaction)==="none"&&sourceMatches(transaction.merchant,"rental",sources)); }
/** Every transaction, including salary, belongs to the actual pay-cycle bounds. */
export function transactionCycleKey(transaction: Pick<Tx, "date" | "merchant" | "category" | "subcategory" | "amount">, payday = 26, salaryDates: SalaryDateMap = {}) { return payCycleKey(transaction.date, payday, salaryDates); }
export function cycleBounds(key: string, payday = 26, salaryDates: SalaryDateMap = {}) { const start = cycleStartDate(key, payday, salaryDates); const nextStart = cycleStartDate(nextMonthKey(key), payday, salaryDates); const endDate = new Date(`${nextStart}T12:00:00`); endDate.setDate(endDate.getDate() - 1); return { start, end: endDate.toISOString().slice(0, 10) }; }
export function cycleLabel(key: string, payday = 26, salaryDates: SalaryDateMap = {}) { const bounds = cycleBounds(key, payday, salaryDates); const start = new Date(`${bounds.start}T12:00:00`); const end = new Date(`${bounds.end}T12:00:00`); return `${start.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${end.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`; }
