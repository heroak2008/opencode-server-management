/**
 * Storage-backend-agnostic persistent state hook.
 *
 * Internally calls both `useKV` (for IndexedDB) and `useState` (for in-memory
 * fallback) unconditionally — satisfying the Rules of Hooks — but at runtime
 * only the active backend's value is returned / updated.
 *
 * When switching backends, data is migrated automatically: the hook reads
 * from the old backend on first render and writes to the new one.
 *
 * For `database` mode, the hook falls back to IndexedDB (via `useKV`), since
 * actual external database I/O requires the worker proxy and is async-only.
 * The database config is managed separately through `SettingsDialog`.
 */

import { useState, useEffect, useCallback, useRef } from "react"
import { useKV } from "@github/spark/hooks"
import { getStorageMode, type StorageMode } from "@/lib/storage"

type Setter<T> = (value: T | ((prev?: T) => T)) => void

/**
 * Like `useKV` from Spark, but honours the app-wide storage mode.
 *
 * Returns `[value, setValue, deleteValue]` — same shape as `useKV`.
 */
export function usePersistentState<T = string>(
  key: string,
  initialValue: T,
): readonly [T | undefined, Setter<T>, () => void] {
  const mode = useStorageModeRef()

  // Always call both hooks (Rules of Hooks).
  const [kvValue, setKvValue, deleteKvValue] = useKV<T>(key, initialValue)
  const [memValue, setMemValue] = useState<T | undefined>(initialValue)

  const modeRef = useRef(mode)
  modeRef.current = mode

  // ── Return the value from the active backend ──────────────────────────
  const activeValue = mode === 'memory' ? memValue : kvValue

  // ── Setter ────────────────────────────────────────────────────────────
  const setValue: Setter<T> = useCallback((val) => {
    const m = modeRef.current
    if (m === 'memory') {
      setMemValue(val)
    } else {
      setKvValue(val)
    }
  }, [setKvValue])

  // ── Delete ────────────────────────────────────────────────────────────
  const deleteValue = useCallback(() => {
    const m = modeRef.current
    if (m === 'memory') {
      setMemValue(undefined)
    } else {
      deleteKvValue()
    }
  }, [deleteKvValue])

  // ── Migrate from old backend on mode switch ───────────────────────────
  const prevModeRef = useRef<StorageMode>(mode)
  useEffect(() => {
    const prev = prevModeRef.current
    const curr = mode
    if (prev === curr) return
    prevModeRef.current = curr

    if (curr === 'memory' && prev !== 'memory' && kvValue !== undefined) {
      // IndexedDB → memory: copy the persisted value
      setMemValue(kvValue)
    } else if (curr !== 'memory' && prev === 'memory' && memValue !== undefined) {
      // memory → IndexedDB: push the in-memory value to KV
      setKvValue(memValue as T)
    }
  }, [mode, kvValue, memValue, setKvValue])

  return [activeValue, setValue, deleteValue] as const
}

/** Read the current storage mode (updated reactively). */
function useStorageModeRef(): StorageMode {
  const [mode, setMode] = useState<StorageMode>(getStorageMode)

  useEffect(() => {
    // Listen for mode changes from other tabs (or the settings dialog).
    const handler = () => setMode(getStorageMode())
    window.addEventListener('storage', handler)
    // Also poll every 2s as a fallback (the settings dialog sets via
    // direct call, so the change is not cross-tab).
    const interval = setInterval(handler, 2000)
    return () => {
      window.removeEventListener('storage', handler)
      clearInterval(interval)
    }
  }, [])

  return mode
}
