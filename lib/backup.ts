import type { Store } from "./types.ts";

export const LOCAL_STORE_KEY = "personal-cfo-v2";

const financeStoreShape = (value: unknown): value is Store => Boolean(value && typeof value === "object" && Array.isArray((value as Store).balances) && Array.isArray((value as Store).transactions));

/** Locate an older local-browser store by schema shape, not a private key. */
export function discoverLocalFinanceStore(storage: Pick<Storage,"length"|"key"|"getItem">): {key:string;raw:string;store:Store}|null {
  const preferred=storage.getItem(LOCAL_STORE_KEY);
  if(preferred)try{const store=JSON.parse(preferred);if(financeStoreShape(store))return {key:LOCAL_STORE_KEY,raw:preferred,store}}catch{}
  for(let index=0;index<storage.length;index++){
    const key=storage.key(index);if(!key||key===LOCAL_STORE_KEY)continue;
    const raw=storage.getItem(key);if(!raw)continue;
    try{const store=JSON.parse(raw);if(financeStoreShape(store))return {key,raw,store}}catch{}
  }
  return null;
}

export function storeWithBackupTimestamp(store: Store, timestamp: string): Store {
  return { ...store, lastBackupAt: timestamp };
}

export function backupAgeInDays(lastBackupAt: string | undefined, today: string) {
  if (!lastBackupAt) return null;
  const last = new Date(lastBackupAt);
  const current = new Date(`${today}T12:00:00`);
  if (Number.isNaN(last.getTime()) || Number.isNaN(current.getTime())) return null;
  return Math.max(0, Math.floor((current.getTime() - last.getTime()) / 86_400_000));
}

export function serialiseBackup(store: Store) {
  return JSON.stringify(store, null, 2);
}

export function parseBackup(text: string): Store {
  const restored = JSON.parse(text) as Store;
  if (!restored.balances || !restored.transactions || !Array.isArray(restored.balances) || !Array.isArray(restored.transactions)) {
    throw new Error("That backup does not contain valid finance data.");
  }
  return restored;
}
