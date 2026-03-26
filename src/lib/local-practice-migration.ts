import {
  ATTEMPTS_STORAGE_KEY,
  CURRENT_TOPIC_STORAGE_KEY,
  DRAFT_HISTORY_STORAGE_KEY,
} from '@/lib/practice/storage';
import {
  COACH_ROUND_HISTORY_STORAGE_KEY,
  LATEST_COACH_ROUND_STORAGE_KEY,
} from '@/lib/coach-round-storage';

export const LOCAL_MIGRATION_MESSAGE_TYPE = 'speakonimage:local-migration-export';
export const LOCAL_MIGRATION_DONE_KEY = 'speakonimage-local-migration-done-v1';
const LOCAL_MIGRATION_ALLOWED_PORTS = new Set(['3000', '3002', '3003']);
const LOCAL_MIGRATION_ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1']);

const LEVEL_HISTORY_STORAGE_KEY = 'speakonimage_level_history';
const COACH_PREFERENCES_STORAGE_KEY = 'speakonimage-coach-preferences';
const COACH_PREFERENCES_MIGRATION_KEY = 'speakonimage-coach-preferences-migrated-v2';
const TEACHER_CHARACTER_STORAGE_KEY = 'speakonimage-teacher-character';

const EXACT_STORAGE_KEYS = [
  CURRENT_TOPIC_STORAGE_KEY,
  LATEST_COACH_ROUND_STORAGE_KEY,
  COACH_ROUND_HISTORY_STORAGE_KEY,
  LEVEL_HISTORY_STORAGE_KEY,
  COACH_PREFERENCES_STORAGE_KEY,
  COACH_PREFERENCES_MIGRATION_KEY,
  TEACHER_CHARACTER_STORAGE_KEY,
];

const PREFIX_STORAGE_KEYS = [
  `${ATTEMPTS_STORAGE_KEY}:`,
  `${DRAFT_HISTORY_STORAGE_KEY}:`,
];

export interface MigratableStorageEntries {
  local: Record<string, string>;
  session: Record<string, string>;
}

export interface MigrationMergeResult {
  importedKeys: string[];
  updatedKeys: string[];
}

function shouldMigrateStorageKey(key: string): boolean {
  const matchesExact = EXACT_STORAGE_KEYS.includes(key);
  const matchesPrefix = PREFIX_STORAGE_KEYS.some((prefix) => key.startsWith(prefix));
  return matchesExact || matchesPrefix;
}

export function isLocalMigrationHost(hostname: string): boolean {
  return LOCAL_MIGRATION_ALLOWED_HOSTS.has(hostname);
}

export function isAllowedLocalMigrationOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return isLocalMigrationHost(url.hostname) && LOCAL_MIGRATION_ALLOWED_PORTS.has(url.port);
  } catch {
    return false;
  }
}

function isJsonArray(raw: string | null): boolean {
  if (!raw) return false;

  try {
    return Array.isArray(JSON.parse(raw));
  } catch {
    return false;
  }
}

function mergeJsonArrays(existingRaw: string | null, incomingRaw: string): string {
  const existing = existingRaw ? JSON.parse(existingRaw) : [];
  const incoming = JSON.parse(incomingRaw);
  const seen = new Set<string>();
  const merged = [...existing, ...incoming].filter((item) => {
    const signature = JSON.stringify(item);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });

  return JSON.stringify(merged);
}

function resolvePreferredScalar(existingRaw: string | null, incomingRaw: string): string {
  if (!existingRaw) return incomingRaw;

  try {
    const existing = JSON.parse(existingRaw) as { lastUpdated?: string; createdAt?: string } | null;
    const incoming = JSON.parse(incomingRaw) as { lastUpdated?: string; createdAt?: string } | null;
    const existingDate = existing?.lastUpdated || existing?.createdAt;
    const incomingDate = incoming?.lastUpdated || incoming?.createdAt;
    if (incomingDate && (!existingDate || incomingDate > existingDate)) {
      return incomingRaw;
    }
  } catch {
    // Fall through to keeping the existing value.
  }

  return existingRaw;
}

export function collectMigratableEntries(
  localStorageLike: Pick<Storage, 'length' | 'key' | 'getItem'>,
  sessionStorageLike?: Pick<Storage, 'length' | 'key' | 'getItem'>
): MigratableStorageEntries {
  const local: Record<string, string> = {};
  for (let index = 0; index < localStorageLike.length; index += 1) {
    const key = localStorageLike.key(index);
    if (!key) continue;

    if (!shouldMigrateStorageKey(key)) continue;

    const value = localStorageLike.getItem(key);
    if (value !== null) {
      local[key] = value;
    }
  }

  const session: Record<string, string> = {};
  if (sessionStorageLike) {
    for (let index = 0; index < sessionStorageLike.length; index += 1) {
      const key = sessionStorageLike.key(index);
      if (!key) continue;
      if (!shouldMigrateStorageKey(key)) continue;
      const value = sessionStorageLike.getItem(key);
      if (value !== null) {
        session[key] = value;
      }
    }
  }

  return { local, session };
}

export function mergeMigratedEntries(
  targetLocalStorage: Pick<Storage, 'getItem' | 'setItem'>,
  sourceEntries: Record<string, string>
): MigrationMergeResult {
  const importedKeys: string[] = [];
  const updatedKeys: string[] = [];

  for (const [key, incomingRaw] of Object.entries(sourceEntries)) {
    const existingRaw = targetLocalStorage.getItem(key);
    let nextRaw = incomingRaw;

    if (isJsonArray(existingRaw) && isJsonArray(incomingRaw)) {
      nextRaw = mergeJsonArrays(existingRaw, incomingRaw);
    } else if (key === COACH_ROUND_HISTORY_STORAGE_KEY) {
      nextRaw = mergeJsonArrays(existingRaw, incomingRaw);
    } else if (
      key === LEVEL_HISTORY_STORAGE_KEY ||
      key === LATEST_COACH_ROUND_STORAGE_KEY ||
      key === CURRENT_TOPIC_STORAGE_KEY
    ) {
      nextRaw = resolvePreferredScalar(existingRaw, incomingRaw);
    } else if (existingRaw) {
      nextRaw = existingRaw;
    }

    if (!existingRaw) {
      importedKeys.push(key);
    } else if (existingRaw !== nextRaw) {
      updatedKeys.push(key);
    } else {
      continue;
    }

    targetLocalStorage.setItem(key, nextRaw);
  }

  targetLocalStorage.setItem(LOCAL_MIGRATION_DONE_KEY, new Date().toISOString());

  return { importedKeys, updatedKeys };
}

export function shouldOfferLocalMigration(currentPort: string, hostname = 'localhost'): boolean {
  return currentPort === '3003' && isLocalMigrationHost(hostname);
}
