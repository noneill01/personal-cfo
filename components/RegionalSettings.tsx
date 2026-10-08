"use client";
import { useState, type Dispatch, type SetStateAction } from "react";
import { isValidCurrency, isValidLocale, normaliseRegion, REGION_PRESETS } from "../lib/region.ts";
import type { RegionalConfig, Store } from "../lib/types.ts";

export default function RegionalSettings({store,setStore,compact=false}:{store:Store;setStore:Dispatch<SetStateAction<Store>>;compact?:boolean}) {
  const saved=normaliseRegion(store.profile?.region);
  const preset=REGION_PRESETS.find(item=>item.country===saved.country&&item.currency===saved.currency&&item.locale===saved.locale)?.id??"custom";
  const [choice,setChoice]=useState(preset),[country,setCountry]=useState(saved.country),[currency,setCurrency]=useState(saved.currency),[locale,setLocale]=useState(saved.locale),[error,setError]=useState("");
  const apply=(next:RegionalConfig)=>setStore(current=>current.profile?{...current,profile:{...current.profile,region:normaliseRegion(next)}}:current);
  const choose=(id:string)=>{setChoice(id);setError("");const found=REGION_PRESETS.find(item=>item.id===id);if(found){setCountry(found.country);setCurrency(found.currency);setLocale(found.locale);apply(found)}};
  const save=()=>{if(!/^[A-Za-z]{2}$/.test(country.trim()))return setError("Enter a two-letter country code.");if(!isValidCurrency(currency))return setError("Enter a valid three-letter ISO currency code.");if(!isValidLocale(locale))return setError("Enter a valid BCP-47 locale, such as en-US or de-DE.");apply({country,currency,locale});setError("")};
  return <article className={compact?"regional-settings compact":"panel regional-settings"}><div><h3>Region and currency</h3><p>Controls presentation only. Personal CFO does not convert currencies.</p></div><div className="onboarding-fields"><label>Region<select value={choice} onChange={event=>choose(event.target.value)}>{REGION_PRESETS.map(item=><option key={item.id} value={item.id}>{item.label} · {item.currency}</option>)}<option value="custom">Custom</option></select></label>{choice==="custom"&&<><label>Country code<input maxLength={2} value={country} onChange={event=>setCountry(event.target.value.toUpperCase())} placeholder="US"/></label><label>ISO currency<input maxLength={3} value={currency} onChange={event=>setCurrency(event.target.value.toUpperCase())} placeholder="USD"/></label><label>Locale<input value={locale} onChange={event=>setLocale(event.target.value)} placeholder="en-US"/></label><button type="button" className="ghost" onClick={save}>Save regional settings</button></>}</div>{error&&<p className="import-error" role="alert">{error}</p>}</article>;
}
