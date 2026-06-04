/**
 * Persistence storage service.
 *
 * Manages the storage mode and provides helpers for data migration and
 * database connection configuration.
 */

import type { DatabaseConfig, DatabaseEngine } from "@/types"

export type StorageMode = 'memory' | 'localStorage' | 'indexedDB' | 'database'

const STORAGE_MODE_KEY = 'app-storage-mode'
const DB_CONFIG_KEY = 'app-database-config'

// ── Storage mode ───────────────────────────────────────────────────────────

/** Get the currently configured storage mode (defaults to indexedDB). */
export function getStorageMode(): StorageMode {
  try {
    const v = localStorage.getItem(STORAGE_MODE_KEY)
    if (v === 'memory' || v === 'localStorage' || v === 'indexedDB' || v === 'database') return v
  } catch { /* localStorage not available */ }
  return 'indexedDB'
}

/** Persist the storage mode choice. */
export function setStorageMode(mode: StorageMode): void {
  try {
    localStorage.setItem(STORAGE_MODE_KEY, mode)
  } catch { /* ignore */ }
}

/** Human-readable labels for each mode. */
export const storageModeLabels: Record<StorageMode, { label: string; desc: string }> = {
  indexedDB: {
    label: 'IndexedDB',
    desc: 'Persistent — uses the browser built-in IndexedDB database. Survives restarts.',
  },
  localStorage: {
    label: 'Local Storage',
    desc: 'Persistent — data stored as JSON in browser localStorage. Survives restarts (limited quota).',
  },
  memory: {
    label: 'Memory Cache',
    desc: 'Ephemeral — data is lost when the page is refreshed or the app restarts.',
  },
  database: {
    label: 'External Database',
    desc: 'Connect to MongoDB, PostgreSQL, or SQLite. Connection info is saved locally.',
  },
}

/** Engine labels. */
export const engineLabels: Record<DatabaseEngine, string> = {
  mongodb: 'MongoDB',
  postgresql: 'PostgreSQL',
  sqlite: 'SQLite',
}

/** Default connection ports per engine. */
export const engineDefaultPorts: Record<DatabaseEngine, number> = {
  mongodb: 27017,
  postgresql: 5432,
  sqlite: 0,
}

// ── Database connection config ─────────────────────────────────────────────

export const defaultDatabaseConfig: DatabaseConfig = {
  engine: 'mongodb',
  host: 'localhost',
  port: 27017,
  database: 'opencode_manager',
  ssl: false,
}

/** Read the saved database configuration. */
export function getDatabaseConfig(): DatabaseConfig {
  try {
    const raw = localStorage.getItem(DB_CONFIG_KEY)
    if (raw) return JSON.parse(raw) as DatabaseConfig
  } catch { /* ignore */ }
  return { ...defaultDatabaseConfig }
}

/** Save database configuration. */
export function setDatabaseConfig(config: DatabaseConfig): void {
  try {
    localStorage.setItem(DB_CONFIG_KEY, JSON.stringify(config))
  } catch { /* ignore */ }
}

/** Build a connection string from config (for display / CLI use). */
export function buildConnectionString(config: DatabaseConfig): string {
  switch (config.engine) {
    case 'mongodb':
      if (config.mongoUri) return config.mongoUri
      const mongoAuth = config.username && config.password ? `${config.username}:${config.password}@` : ''
      return `mongodb://${mongoAuth}${config.host ?? 'localhost'}:${config.port ?? 27017}/${config.database ?? 'admin'}${config.ssl ? '?ssl=true' : ''}`
    case 'postgresql':
      const pgAuth = config.username ? `${config.username}${config.password ? ':' + config.password : ''}@` : ''
      return `postgresql://${pgAuth}${config.host ?? 'localhost'}:${config.port ?? 5432}/${config.database ?? 'postgres'}${config.ssl ? '?sslmode=require' : ''}`
    case 'sqlite':
      return config.filePath || 'opencode_manager.db'
  }
}

// ── Data export / import for mode switching ────────────────────────────────

export async function exportAllData(
  mode: StorageMode,
  keys: string[],
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {}
  for (const key of keys) {
    const val = await readKey(mode, key)
    if (val !== undefined) result[key] = val
  }
  return result
}

export async function importAllData(
  mode: StorageMode,
  data: Record<string, unknown>,
): Promise<void> {
  for (const [key, val] of Object.entries(data)) {
    await writeKey(mode, key, val)
  }
}

export async function clearMode(mode: StorageMode, keys: string[]): Promise<void> {
  for (const key of keys) {
    await deleteKey(mode, key)
  }
}

// ── Low-level key ops per mode ────────────────────────────────────────────

function readKey(mode: StorageMode, key: string): Promise<unknown> | unknown {
  switch (mode) {
    case 'indexedDB':
    case 'database':
      return undefined // handled by usePersistentState / useKV
    case 'localStorage': {
      try {
        const raw = localStorage.getItem(key)
        return raw ? JSON.parse(raw) : undefined
      } catch { return undefined }
    }
    case 'memory':
      return undefined
  }
}

function writeKey(_mode: StorageMode, _key: string, _value: unknown): Promise<void> | void {
  // handled by usePersistentState at the hook level
}

function deleteKey(_mode: StorageMode, _key: string): Promise<void> | void {
  // handled by usePersistentState at the hook level
}

