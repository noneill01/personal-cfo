import { serialiseBackup } from "./backup";
import type { Store } from "./types";

export const AUTOMATIC_BACKUP_PREFIX = "personal-cfo-auto-";
export const AUTOMATIC_BACKUP_LIMIT = 20;

/** Chromium exposes these File System Access members before all TypeScript DOM bundles model them. */
export type WritableDirectoryHandle = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  queryPermission(options?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission(options?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
};
type ReadableFileHandle = FileSystemHandle & { getFile(): Promise<File> };

export type AutomaticBackupRecord = {
  fileName: string;
  savedAt: string;
};

function safeTimestamp(now: Date) {
  return now.toISOString().replace(/[:.]/g, "-");
}

export function automaticBackupFileName(now = new Date()) {
  return `${AUTOMATIC_BACKUP_PREFIX}${safeTimestamp(now)}.json`;
}

function isAutomaticBackup(name: string) {
  return name.startsWith(AUTOMATIC_BACKUP_PREFIX) && name.endsWith(".json");
}

export async function latestAutomaticBackup(directory: WritableDirectoryHandle): Promise<AutomaticBackupRecord | null> {
  const backups: AutomaticBackupRecord[] = [];
  for await (const [name, handle] of directory.entries()) {
    if (handle.kind !== "file" || !isAutomaticBackup(name)) continue;
    const file = await (handle as ReadableFileHandle).getFile();
    backups.push({ fileName: name, savedAt: new Date(file.lastModified).toISOString() });
  }
  return backups.sort((left, right) => right.savedAt.localeCompare(left.savedAt))[0] ?? null;
}

async function retainNewestBackups(directory: WritableDirectoryHandle) {
  const backups: { name: string; savedAt: number }[] = [];
  for await (const [name, handle] of directory.entries()) {
    if (handle.kind !== "file" || !isAutomaticBackup(name)) continue;
    const file = await (handle as ReadableFileHandle).getFile();
    backups.push({ name, savedAt: file.lastModified });
  }
  const stale = backups.sort((left, right) => right.savedAt - left.savedAt).slice(AUTOMATIC_BACKUP_LIMIT);
  await Promise.all(stale.map(backup => directory.removeEntry(backup.name)));
  return Math.min(backups.length, AUTOMATIC_BACKUP_LIMIT);
}

/** Writes a private recovery point into the folder the person explicitly selected. */
export async function writeAutomaticBackup(directory: WritableDirectoryHandle, store: Store): Promise<AutomaticBackupRecord & { retained: number }> {
  const now = new Date();
  const fileName = automaticBackupFileName(now);
  const fileHandle = await directory.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(serialiseBackup(store));
  } finally {
    await writable.close();
  }
  const retained = await retainNewestBackups(directory);
  return { fileName, savedAt: now.toISOString(), retained };
}
