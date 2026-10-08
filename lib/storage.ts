import type { Store } from "./types.ts";

export const FINANCE_DB_NAME = "personal-cfo";
export const FINANCE_DB_VERSION = 3;
export const INDEXED_DB_MIGRATION_BACKUP_KEY = "personal-cfo-before-indexeddb-v1";

const META_STORE = "application";
const META_KEY = "store";
const AUTO_BACKUP_STORE = "automaticBackup";
const AUTO_BACKUP_KEY = "directory";
const COLLECTIONS = [
  "transactions",
  "balances",
  "goals",
  "sinkingFunds",
  "balanceReconciliations",
  "cycleCloseouts",
  "reviewedSpendingSignals",
  "snapshots",
  "imports",
  "payslips",
  "mortgageStatements",
  "taxDocuments",
  "taxFacts",
  "merchantRules",
] as const;

type StoredRecord = { key: string; order: number; value: unknown };

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction was cancelled."));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
}

function collectionKey(item: unknown, index: number) {
  if (item && typeof item === "object") {
    const record = item as Record<string, unknown>;
    const natural = record.id ?? record.key ?? record.date ?? record.cycle ?? record.name;
    if (typeof natural === "string" && natural) return `${natural}:${index}`;
  }
  return String(index).padStart(10, "0");
}

export function indexedDbAvailable() {
  return typeof indexedDB !== "undefined";
}

export function openFinanceDatabase() {
  if (!indexedDbAvailable()) return Promise.reject(new Error("IndexedDB is not available in this browser."));
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(FINANCE_DB_NAME, FINANCE_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(META_STORE)) database.createObjectStore(META_STORE, { keyPath: "key" });
      if (!database.objectStoreNames.contains(AUTO_BACKUP_STORE)) database.createObjectStore(AUTO_BACKUP_STORE, { keyPath: "key" });
      for (const name of COLLECTIONS) {
        if (!database.objectStoreNames.contains(name)) database.createObjectStore(name, { keyPath: "key" });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onblocked = () => reject(new Error("The finance database is open in another tab. Close the other tab and try again."));
    request.onerror = () => reject(request.error ?? new Error("The finance database could not be opened."));
  });
}

type AutomaticBackupDirectoryRecord = { key: string; handle: FileSystemDirectoryHandle };

export async function loadAutomaticBackupDirectory(): Promise<FileSystemDirectoryHandle | null> {
  const database = await openFinanceDatabase();
  try {
    const transaction = database.transaction(AUTO_BACKUP_STORE, "readonly");
    const record = await requestResult<AutomaticBackupDirectoryRecord | undefined>(transaction.objectStore(AUTO_BACKUP_STORE).get(AUTO_BACKUP_KEY));
    await transactionComplete(transaction);
    return record?.handle ?? null;
  } finally {
    database.close();
  }
}

export async function saveAutomaticBackupDirectory(handle: FileSystemDirectoryHandle) {
  const database = await openFinanceDatabase();
  try {
    const transaction = database.transaction(AUTO_BACKUP_STORE, "readwrite");
    transaction.objectStore(AUTO_BACKUP_STORE).put({ key: AUTO_BACKUP_KEY, handle } satisfies AutomaticBackupDirectoryRecord);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function clearAutomaticBackupDirectory() {
  const database = await openFinanceDatabase();
  try {
    const transaction = database.transaction(AUTO_BACKUP_STORE, "readwrite");
    transaction.objectStore(AUTO_BACKUP_STORE).delete(AUTO_BACKUP_KEY);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

function storeMetadata(store: Store) {
  const metadata = { ...store } as Record<string, unknown>;
  for (const name of COLLECTIONS) delete metadata[name];
  return metadata;
}

export async function saveFinanceStore(store: Store) {
  const database = await openFinanceDatabase();
  try {
    const transaction = database.transaction([META_STORE, ...COLLECTIONS], "readwrite");
    const completion = transactionComplete(transaction);
    transaction.objectStore(META_STORE).put({ key: META_KEY, value: storeMetadata(store) });
    for (const name of COLLECTIONS) {
      const objectStore = transaction.objectStore(name);
      objectStore.clear();
      const collection = (store[name] ?? []) as unknown[];
      collection.forEach((value, order) => objectStore.put({ key: collectionKey(value, order), order, value } satisfies StoredRecord));
    }
    await completion;
  } finally {
    database.close();
  }
}

async function loadStoreFromDatabase(database: IDBDatabase): Promise<Store | null> {
  try {
    if (!database.objectStoreNames.contains(META_STORE)) return null;
    const availableCollections = COLLECTIONS.filter(name => database.objectStoreNames.contains(name));
    const transaction = database.transaction([META_STORE, ...availableCollections], "readonly");
    const completion = transactionComplete(transaction);
    const metadataRequest = requestResult<{ key: string; value: Record<string, unknown> } | undefined>(transaction.objectStore(META_STORE).get(META_KEY));
    const collectionRequests = availableCollections.map(name => requestResult<StoredRecord[]>(transaction.objectStore(name).getAll()));
    const metadataRecord = await metadataRequest;
    if (!metadataRecord) {
      await Promise.all(collectionRequests);
      await completion;
      return null;
    }
    const recordsByCollection = await Promise.all(collectionRequests);
    const collections = availableCollections.map((name,index) => [name, recordsByCollection[index].sort((a, b) => a.order - b.order).map(record => record.value)] as const);
    await completion;
    const candidate = { ...metadataRecord.value, ...Object.fromEntries(collections) } as Store;
    return Array.isArray(candidate.transactions) && Array.isArray(candidate.balances) ? candidate : null;
  } finally {
    database.close();
  }
}

async function openExistingDatabase(name: string) {
  return new Promise<IDBDatabase | null>((resolve) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

/**
 * Find a prior compatible database without embedding a private historical
 * database name in distributable source. Browser database enumeration is
 * used only when the canonical database is empty, then the data is copied.
 */
async function loadAutomaticBackupFromDatabase(name: string): Promise<FileSystemDirectoryHandle | null> {
  const database = await openExistingDatabase(name);
  if (!database) return null;
  try {
    if (!database.objectStoreNames.contains(AUTO_BACKUP_STORE)) return null;
    const transaction = database.transaction(AUTO_BACKUP_STORE, "readonly");
    const record = await requestResult<AutomaticBackupDirectoryRecord | undefined>(transaction.objectStore(AUTO_BACKUP_STORE).get(AUTO_BACKUP_KEY));
    await transactionComplete(transaction);
    return record?.handle ?? null;
  } finally {
    database.close();
  }
}

async function discoverCompatibleFinanceStore(): Promise<{ store: Store; automaticBackupDirectory: FileSystemDirectoryHandle | null } | null> {
  if (typeof indexedDB.databases !== "function") return null;
  const candidates = (await indexedDB.databases()).map(item => item.name).filter((name): name is string => Boolean(name && name !== FINANCE_DB_NAME));
  for (const name of candidates) {
    const database = await openExistingDatabase(name);
    if (!database) continue;
    const store = await loadStoreFromDatabase(database);
    if (store) return { store, automaticBackupDirectory: await loadAutomaticBackupFromDatabase(name) };
  }
  return null;
}

export async function loadFinanceStore(): Promise<Store | null> {
  const current = await loadStoreFromDatabase(await openFinanceDatabase());
  if (current) return current;
  const discovered = await discoverCompatibleFinanceStore();
  if (!discovered) return null;
  await saveFinanceStore(discovered.store);
  if (discovered.automaticBackupDirectory) await saveAutomaticBackupDirectory(discovered.automaticBackupDirectory);
  return discovered.store;
}

export async function deleteFinanceDatabase() {
  if (!indexedDbAvailable()) return;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(FINANCE_DB_NAME);
    request.onsuccess = () => resolve();
    request.onblocked = () => reject(new Error("Close other Personal CFO tabs before resetting the database."));
    request.onerror = () => reject(request.error ?? new Error("The finance database could not be reset."));
  });
}

const rounded = (value: number) => Math.round(value * 100) / 100;
const ids = (items: unknown[] | undefined) => (items ?? []).map((item, index) => {
  if (!item || typeof item !== "object") return String(index);
  const record = item as Record<string, unknown>;
  return String(record.id ?? record.key ?? record.date ?? record.cycle ?? record.name ?? index);
}).sort();

/** A compact verification record used to prove that migration kept all important financial records. */
export function financeStoreDigest(store: Store) {
  return {
    transactions: store.transactions.length,
    transactionIds: ids(store.transactions),
    transactionValue: rounded(store.transactions.reduce((sum, transaction) => sum + transaction.amount, 0)),
    balances: store.balances.length,
    balanceIds: ids(store.balances),
    balanceValue: rounded(store.balances.reduce((sum, balance) => sum + balance.value, 0)),
    goals: store.goals.length,
    goalIds: ids(store.goals),
    snapshots: store.snapshots?.length ?? 0,
    imports: store.imports?.length ?? 0,
    payslips: store.payslips?.length ?? 0,
    mortgages: store.mortgageStatements?.length ?? 0,
    taxDocuments: store.taxDocuments?.length ?? 0,
    taxFacts: store.taxFacts?.length ?? 0,
    closeouts: store.cycleCloseouts?.length ?? 0,
    rules: store.merchantRules?.length ?? 0,
    recurringCommitments: store.recurringCommitments === undefined ? null : JSON.stringify(store.recurringCommitments),
    accountCoverageConfirmations: store.accountCoverageConfirmations === undefined ? null : JSON.stringify(store.accountCoverageConfirmations),
    profile: store.profile === undefined ? null : JSON.stringify(store.profile),
    onboarding: store.onboarding === undefined ? null : JSON.stringify(store.onboarding),
  };
}

export function financeStoresMatch(source: Store, destination: Store) {
  return JSON.stringify(financeStoreDigest(source)) === JSON.stringify(financeStoreDigest(destination));
}
