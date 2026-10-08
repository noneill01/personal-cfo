import type { TaxYearId } from "./types.ts";

export const FIRST_TRACKED_TAX_YEAR = "2026/27";
const firstTrackedYear = Number(FIRST_TRACKED_TAX_YEAR.slice(0, 4));
export function isTrackedTaxYear(year: string) { return Number(year.slice(0, 4)) >= firstTrackedYear; }
export function trackedTaxYears(evidenceYears: string[], today = new Date().toISOString().slice(0, 10)) {
  const current = Math.max(firstTrackedYear, Number(currentTaxYear(today).slice(0, 4)));
  const elapsed = Array.from({ length: current - firstTrackedYear + 1 }, (_, index) => taxYearForDate(`${firstTrackedYear + index}-04-06`));
  return [...new Set([...elapsed, ...evidenceYears.filter(isTrackedTaxYear)])].sort().reverse();
}
export function taxYearCompleted(year: string, today = new Date().toISOString().slice(0, 10)) { return today > taxYearBounds(year).end; }
export function isTaxYearOpen(year: string, today = new Date().toISOString().slice(0, 10)) { return !taxYearCompleted(year, today); }

/** UK tax years run from 6 April to 5 April. */
export function taxYearForDate(date: string): TaxYearId {
  const matched = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) throw new Error(`A tax fact needs an ISO date. Received: ${date || "empty"}.`);
  const parsed = new Date(date + "T12:00:00Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error(`Invalid tax date: ${date}`);
  const year = Number(matched[1]);
  const beginsNewYear = Number(matched[2]) > 4 || (Number(matched[2]) === 4 && Number(matched[3]) >= 6);
  const start = beginsNewYear ? year : year - 1;
  return `${start}/${String(start + 1).slice(-2)}`;
}

export function taxYearBounds(taxYear: TaxYearId) {
  const matched = taxYear.match(/^(\d{4})\/(\d{2}|\d{4})$/);
  if (!matched) throw new Error(`Invalid tax year: ${taxYear}`);
  const start = Number(matched[1]);
  if (Number(matched[2]) !== (matched[2].length === 2 ? (start + 1) % 100 : start + 1)) throw new Error(`Invalid tax year: ${taxYear}`);
  return { start: `${start}-04-06`, end: `${start + 1}-04-05` };
}

export function taxYearLabel(taxYear: TaxYearId) {
  const { start, end } = taxYearBounds(taxYear);
  return `${new Date(`${start}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} – ${new Date(`${end}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
}

export function currentTaxYear(today = new Date().toISOString().slice(0, 10)) { return taxYearForDate(today); }
