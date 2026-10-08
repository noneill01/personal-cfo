import type { RegionalConfig, UserProfile } from "./types.ts";

export const DEFAULT_REGION: RegionalConfig = { country: "GB", currency: "GBP", locale: "en-GB" };

export const REGION_PRESETS = [
  { id: "GB", label: "United Kingdom", country: "GB", currency: "GBP", locale: "en-GB" },
  { id: "IE", label: "Ireland", country: "IE", currency: "EUR", locale: "en-IE" },
  { id: "US", label: "United States", country: "US", currency: "USD", locale: "en-US" },
  { id: "CA", label: "Canada", country: "CA", currency: "CAD", locale: "en-CA" },
  { id: "AU", label: "Australia", country: "AU", currency: "AUD", locale: "en-AU" },
  { id: "NZ", label: "New Zealand", country: "NZ", currency: "NZD", locale: "en-NZ" },
] as const;

export function isValidLocale(locale: string) {
  try { return Intl.getCanonicalLocales(locale.trim()).length === 1; } catch { return false; }
}

export function isValidCurrency(currency: string) {
  const code=currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return false;
  try { new Intl.NumberFormat("en", { style: "currency", currency: code }).format(0); return true; } catch { return false; }
}

export function normaliseRegion(value?: Partial<RegionalConfig>): RegionalConfig {
  const country=(value?.country||DEFAULT_REGION.country).trim().toUpperCase();
  const currency=(value?.currency||DEFAULT_REGION.currency).trim().toUpperCase();
  const locale=(value?.locale||DEFAULT_REGION.locale).trim();
  return {
    country: /^[A-Z]{2}$/.test(country) ? country : DEFAULT_REGION.country,
    currency: isValidCurrency(currency) ? currency : DEFAULT_REGION.currency,
    locale: isValidLocale(locale) ? Intl.getCanonicalLocales(locale)[0] : DEFAULT_REGION.locale,
  };
}

export const regionFor=(profile?:Pick<UserProfile,"region">)=>normaliseRegion(profile?.region);

export function moneyFormatter(region:RegionalConfig,exact=false) {
  return new Intl.NumberFormat(region.locale,{style:"currency",currency:region.currency,...(exact?{minimumFractionDigits:2,maximumFractionDigits:2}:{maximumFractionDigits:0})});
}

export const formatMoney=(value:number,region:RegionalConfig,exact=false)=>moneyFormatter(region,exact).format(value);

export function formatDate(value:string|Date,region:RegionalConfig,options:Intl.DateTimeFormatOptions={}) {
  const date=typeof value==="string"?new Date(value.includes("T")?value:`${value}T12:00:00`):value;
  return new Intl.DateTimeFormat(region.locale,options).format(date);
}

export const formatNumber=(value:number,region:RegionalConfig,options:Intl.NumberFormatOptions={})=>new Intl.NumberFormat(region.locale,options).format(value);

export function currencySymbol(region:RegionalConfig) {
  return new Intl.NumberFormat(region.locale,{style:"currency",currency:region.currency,currencyDisplay:"narrowSymbol",maximumFractionDigits:0}).formatToParts(0).find(part=>part.type==="currency")?.value??region.currency;
}

export const defaultCsvDateFormat=(region:RegionalConfig):"US"|"UK"=>region.country==="US"||region.locale.toLowerCase().startsWith("en-us")?"US":"UK";

export function regionalFormatters(profile?:Pick<UserProfile,"region">) {
  const region=regionFor(profile);
  return {region,money:moneyFormatter(region),moneyExact:moneyFormatter(region,true),currencySymbol:currencySymbol(region),formatDate:(value:string|Date,options?:Intl.DateTimeFormatOptions)=>formatDate(value,region,options),formatNumber:(value:number,options?:Intl.NumberFormatOptions)=>formatNumber(value,region,options),csvDateFormat:defaultCsvDateFormat(region)};
}
