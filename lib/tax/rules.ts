import type { TaxYearId } from "./types.ts";

export type UkMainRateRules = {
  taxYear: TaxYearId;
  personalAllowance: number;
  personalAllowanceTaperStart: number;
  basicRateBand: number;
  higherRateBandCeiling: number;
  basicRate: number;
  higherRate: number;
  additionalRate: number;
  source: string;
};

/*
 * England, Wales and Northern Ireland main income-tax rates. Source verified
 * against HMRC's published rates and allowances, 6 April 2026. Scotland has
 * different earned-income bands and is intentionally not estimated in V1.
 */
const RULES: Record<string, UkMainRateRules> = {
  "2025/26": { taxYear: "2025/26", personalAllowance: 12_570, personalAllowanceTaperStart: 100_000, basicRateBand: 37_700, higherRateBandCeiling: 125_140, basicRate: .20, higherRate: .40, additionalRate: .45, source: "HMRC income tax rates and allowances" },
  "2026/27": { taxYear: "2026/27", personalAllowance: 12_570, personalAllowanceTaperStart: 100_000, basicRateBand: 37_700, higherRateBandCeiling: 125_140, basicRate: .20, higherRate: .40, additionalRate: .45, source: "HMRC income tax rates and allowances" },
};

export function rulesForTaxYear(taxYear: TaxYearId) { return RULES[taxYear]; }
