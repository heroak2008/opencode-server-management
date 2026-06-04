/**
 * Database service — connects to external databases via OpenCode Server workers.
 *
 * Since the app runs in the browser, it cannot directly connect to MongoDB or
 * PostgreSQL. Instead, it uses a configured worker to proxy the connection:
 *
 *    Browser App → Worker (OpenCode Server) → Target Database
 *
 * The worker executes shell commands (mongosh, psql, sqlite3) to interact
 * with the database.
 */

import type { Worker, DatabaseConfig } from "@/types"
import { createSession, executeShell, deleteSession } from "@/lib/worker-api"
import { buildConnectionString } from "@/lib/storage"

export interface DbTestResult {
  success: boolean
  version?: string
  error?: string
  latencyMs?: number
}

/**
 * Test a database connection by running a version-check command through a worker.
 *
 * @param worker - The OpenCode Server worker to proxy through.
 * @param config - The database configuration to test.
 */
export async function testDatabaseConnection(
  worker: Worker,
  config: DatabaseConfig,
): Promise<DbTestResult> {
  const start = performance.now()
  const w = { host: worker.host, port: worker.port, password: worker.password }

  const command = buildTestCommand(config)
  if (!command) {
    return { success: false, error: 'No test command available for this database type' }
  }

  const sessionTitle = `[DB Test] ${config.engine} — ${config.host ?? config.filePath ?? 'unknown'}`

  try {
    const session = await createSession(w, sessionTitle)
    const sessionId: string = session?.id ?? session?.sessionId
    if (!sessionId) {
      return { success: false, error: 'Failed to create worker session' }
    }

    try {
      const result = await executeShell(w, sessionId, command)
      const output = extractOutput(result)

      const latencyMs = Math.round(performance.now() - start)
      const version = parseVersion(output, config.engine)
      return { success: true, version, latencyMs }
    } finally {
      // Cleanup
      deleteSession(w, sessionId).catch(() => {})
    }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err), latencyMs: Math.round(performance.now() - start) }
  }
}

// ── Internals ──────────────────────────────────────────────────────────────

function buildTestCommand(config: DatabaseConfig): string | null {
  const connStr = buildConnectionString(config)

  switch (config.engine) {
    case 'mongodb':
      // mongosh --eval "db.version()" <connection-string> --quiet
      return `mongosh "${connStr}" --eval "db.version()" --quiet 2>&1 || echo "MongoDB not found at ${connStr}"`
    case 'postgresql':
      // psql <conn-string> -c "SELECT version();" -t -A -q
      return `psql "${connStr}" -c "SELECT version();" -t -A -q 2>&1 || echo "PostgreSQL not found at ${connStr}"`
    case 'sqlite':
      return `sqlite3 "${config.filePath || 'opencode_manager.db'}" ".version" 2>&1 || echo "SQLite not found at ${config.filePath}"`
    default:
      return null
  }
}

function extractOutput(result: any): string {
  const parts: any[] = result?.parts ?? result?.message?.parts ?? []
  const lines: string[] = []
  for (const p of parts) {
    if ((p.type === 'text' || p.type === 'content') && p.text) lines.push(p.text)
    if (p.type === 'tool' && p.output) {
      const content = typeof p.output === 'string' ? p.output : p.output?.content
      if (content) lines.push(content)
    }
  }
  return lines.join('\n').trim()
}

function parseVersion(output: string, engine: DatabaseConfig['engine']): string | undefined {
  if (!output) return undefined
  const lines = output.split('\n').filter(Boolean)
  // Try to find a version-like string
  for (const line of lines) {
    const match = line.match(/\d+\.\d+\.\d+/)
    if (match) return match[0]
  }
  // Fallback: return first non-empty line
  return lines[0]?.slice(0, 80) || undefined
}
