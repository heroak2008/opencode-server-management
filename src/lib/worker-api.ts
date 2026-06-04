/**
 * OpenCode Server HTTP API client.
 *
 * OpenCode Server exposes a REST API via `opencode serve`.
 * Auth: HTTP Basic (username=opencode, password=OPENCODE_SERVER_PASSWORD).
 * Docs: https://opencode.ai/docs/zh-cn/server/
 */

import type { Worker } from '@/types'

// ---------------------------------------------------------------------------
// API log types
// ---------------------------------------------------------------------------

export interface ApiLogEntry {
  timestamp: string
  method: string
  path: string
  status: number
  durationMs: number
  error?: string
}

// ---------------------------------------------------------------------------
// Generic request helpers
// ---------------------------------------------------------------------------

function basicAuth(password?: string): string {
  if (!password) return ''
  return 'Basic ' + btoa(`opencode:${password}`)
}

const DEFAULT_TIMEOUT = 120_000        // default for health checks, quick ops
const LONG_TIMEOUT    = 600_000         // 10 min for AI message/shell execution

async function request<T>(
  worker: { host: string; port: number; password?: string },
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
  logCollector?: ApiLogEntry[],
  timeoutMs: number = DEFAULT_TIMEOUT,
): Promise<T> {
  const url = `http://${worker.host}:${worker.port}${path}`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const pw = worker.password
  if (pw) headers['Authorization'] = basicAuth(pw)

  const start = performance.now()
  let status = 0
  let error: string | undefined

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
      signal: signal ?? AbortSignal.timeout(timeoutMs),
    })
    status = res.status

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      error = `${res.status} ${res.statusText}${text ? ': ' + text.slice(0, 200) : ''}`
      throw new Error(`Worker ${worker.host}:${worker.port} — ${method} ${path} — ${error}`)
    }

    if (res.status === 204) return true as unknown as T
    return (await res.json()) as Promise<T>
  } catch (err) {
    if (!error) error = String(err)
    throw err
  } finally {
    const durationMs = Math.round(performance.now() - start)
    logCollector?.push({
      timestamp: new Date().toLocaleTimeString(),
      method,
      path,
      status,
      durationMs,
      error,
    })
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** GET /global/health — check worker is alive and get version */
export function healthCheck(
  worker: { host: string; port: number; password?: string },
  signal?: AbortSignal,
  logCollector?: ApiLogEntry[],
): Promise<{ healthy: boolean; version: string }> {
  return request(worker, 'GET', '/global/health', undefined, signal, logCollector)
}

/** GET /agent — list available agents on the worker */
export interface AgentInfo {
  id: string
  name?: string
  [key: string]: unknown
}
export function listAgents(
  worker: { host: string; port: number; password?: string },
  signal?: AbortSignal,
  logCollector?: ApiLogEntry[],
): Promise<AgentInfo[]> {
  return request<AgentInfo[]>(worker, 'GET', '/agent', undefined, signal, logCollector)
}

/** POST /session — create a new session */
export function createSession(
  worker: { host: string; port: number; password?: string },
  title: string,
  signal?: AbortSignal,
  logCollector?: ApiLogEntry[],
): Promise<any> {
  return request(worker, 'POST', '/session', { title }, signal, logCollector)
}

/** GET /session/:id — get session details */
export function getSession(
  worker: { host: string; port: number; password?: string },
  sessionId: string,
  signal?: AbortSignal,
  logCollector?: ApiLogEntry[],
): Promise<any> {
  return request(worker, 'GET', `/session/${sessionId}`, undefined, signal, logCollector)
}

/** DELETE /session/:id — delete session and all its data */
export function deleteSession(
  worker: { host: string; port: number; password?: string },
  sessionId: string,
  signal?: AbortSignal,
  logCollector?: ApiLogEntry[],
): Promise<boolean> {
  return request<boolean>(worker, 'DELETE', `/session/${sessionId}`, undefined, signal, logCollector)
}

/** POST /session/:id/abort — abort a running session */
export function abortSession(
  worker: { host: string; port: number; password?: string },
  sessionId: string,
  signal?: AbortSignal,
  logCollector?: ApiLogEntry[],
): Promise<boolean> {
  return request<boolean>(worker, 'POST', `/session/${sessionId}/abort`, undefined, signal, logCollector)
}

/** POST /session/:id/shell — run a shell command in a session (waits for completion) */
export function executeShell(
  worker: { host: string; port: number; password?: string },
  sessionId: string,
  command: string,
  signal?: AbortSignal,
  logCollector?: ApiLogEntry[],
): Promise<any> {
  return request(worker, 'POST', `/session/${sessionId}/shell`, { command, agent: 'build' }, signal, logCollector, LONG_TIMEOUT)
}

/** POST /session/:id/message — send a message with parts and wait for AI response */
export function sendMessage(
  worker: { host: string; port: number; password?: string },
  sessionId: string,
  parts: { type: string; text: string }[],
  signal?: AbortSignal,
  logCollector?: ApiLogEntry[],
  agent: string = 'build',
  extra?: Record<string, unknown>,
): Promise<any> {
  const body: Record<string, unknown> = { agent, parts }
  if (extra) Object.assign(body, extra)
  return request(worker, 'POST', `/session/${sessionId}/message`, body, signal, logCollector, LONG_TIMEOUT)
}

// ---------------------------------------------------------------------------
// High-level execution helpers
// ---------------------------------------------------------------------------

export type ExecutionMode = 'shell' | 'message'

export interface SubtaskResult {
  subtaskId: string
  success: boolean
  output?: string
  error?: string
  sessionId?: string
  logs?: ApiLogEntry[]
  report?: string
}

/** Extract ALL content from an OpenCode API response into a readable report.
 *  The `build` agent generates text parts (analysis), tool parts (bash/read
 *  commands + their output), and reasoning parts — we capture everything. */
function extractOutput(result: any): string {
  const parts: any[] = result?.parts ?? result?.message?.parts ?? []
  if (!parts.length) return JSON.stringify(result).slice(0, 2000)

  const lines: string[] = []
  for (const p of parts) {
    switch (p.type) {
      case 'text':
      case 'content':
        if (p.text) lines.push(p.text)
        break
      case 'reasoning':
        if (p.content || p.signature) {
          lines.push('── thinking ──')
          lines.push(p.content ?? p.signature)
          lines.push('──────────────')
        }
        break
      case 'tool': {
        const toolName = p.tool ?? 'tool'
        const input = typeof p.input === 'string' ? p.input : JSON.stringify(p.input ?? '')
        const output = typeof p.output === 'string' ? p.output
          : p.output?.content ?? (p.output ? JSON.stringify(p.output).slice(0, 2000) : '')

        if (p.state?.status === 'completed' || p.state?.status === 'error') {
          lines.push(`\n── ${toolName} ${p.state.status === 'error' ? '(failed)' : ''} ──`)
          if (input) lines.push(`$ ${input}`)
          if (output) lines.push(output)
          lines.push(`── end ${toolName} ──\n`)
        }
        break
      }
      case 'step_start':
        if (p.title) lines.push(`\n── step: ${p.title} ──`)
        break
      case 'step_finish':
        if (p.title) lines.push(`── step-finish: ${p.title} ──\n`)
        break
      case 'agent':
        if (p.name) lines.push(`\n── agent: ${p.name} ──`)
        if (p.source?.value) lines.push(p.source.value)
        break
      case 'file':
        if (p.url) lines.push(`[file] ${p.name ?? p.url}${p.content ? '\n' + p.content : ''}`)
        break
      default:
        // Skip metadata-only types (snapshot, patch, retry, compaction, subtask)
        break
    }
  }

  return lines.join('\n').trim() || JSON.stringify(result).slice(0, 2000)
}

/**
 * Execute one subtask on a worker.
 *
 * Two execution modes:
 *   - **shell** (`mode='shell'`): run the subtask target as a shell command
 *     via `POST /session/:id/shell`. Best for `custom` tasks.
 *   - **message** (`mode='message'`): send a natural-language prompt to the
 *     worker's AI via `POST /session/:id/message` with `agent: 'build'`.
 *     Best for `code-check` and `code-analysis` tasks.
 *
 * `onLog` — optional callback invoked whenever a new API log entry is
 * added, enabling the caller to stream logs progressively to the UI.
 *
 * Common flow:
 * 1. Health-check the worker
 * 2. Create a session
 * 3. Execute (shell or message depending on mode)
 * 4. Delete the session (best-effort)
 * 5. Return the result (including API call logs)
 */
export async function executeSubtaskOnWorker(
  worker: Worker,
  subtask: { id: string; target: string },
  taskName: string,
  mode: ExecutionMode,
  prompt: string,
  onLog?: (logs: ApiLogEntry[]) => void,
  advancedConfig?: Record<string, unknown>,
): Promise<SubtaskResult> {
  const w = { host: worker.host, port: worker.port, password: worker.password }
  const apiLogs: ApiLogEntry[] = []

  // Helper: push entry then fire onLog callback
  const pushLog = (method: string, path: string, status: number, duration: number, errText?: string) => {
    apiLogs.push({
      timestamp: new Date().toLocaleTimeString(),
      method,
      path,
      status,
      durationMs: duration,
      error: errText,
    })
    onLog?.([...apiLogs])
  }

  // 1. Health check
  let hc: { healthy: boolean; version: string }
  try {
    hc = await healthCheck(w, undefined, apiLogs)
  } catch (err) {
    pushLog('GET', '/global/health', 0, 0, String(err))
    return { subtaskId: subtask.id, success: false, error: `Health check failed: ${err}`, logs: apiLogs }
  }
  if (!hc.healthy) {
    return { subtaskId: subtask.id, success: false, error: 'Worker health check returned unhealthy', logs: apiLogs }
  }

  // 1.5 Agent discovery — pick the best agent for this subtask
  let selectedAgent = advancedConfig?.agent as string | undefined ?? 'build'
  if (mode === 'message') {
    try {
      const agents = await listAgents(w, undefined, apiLogs)
      if (agents.length > 0) {
        const agentNames = agents.map(a => a.id ?? a.name ?? '').filter(Boolean)
        // Prefer the desired agent if it's in the list, otherwise use the first available
        selectedAgent = agentNames.includes(selectedAgent!) ? selectedAgent! : agentNames[0]
      }
    } catch {
      // Agent discovery is best-effort — fall back to default
    }
  }

  // 2. Create session
  const sessionTitle = mode === 'message'
    ? `[${taskName}] ${subtask.target}`
    : `Shell: ${subtask.target}`
  let session: any
  try {
    session = await createSession(w, sessionTitle, undefined, apiLogs)
  } catch (err) {
    pushLog('POST', '/session', 0, 0, String(err))
    return { subtaskId: subtask.id, success: false, error: `Create session failed: ${err}`, logs: apiLogs }
  }
  const sessionId: string = session?.id ?? session?.sessionId
  if (!sessionId) {
    return { subtaskId: subtask.id, success: false, error: 'Create session returned no session ID', logs: apiLogs }
  }

  try {
    let result: any

    if (mode === 'message') {
      // 3a. POST /session/:id/message with selected agent + optional advanced config
      result = await sendMessage(w, sessionId, [{ type: 'text', text: prompt }], undefined, apiLogs, selectedAgent, advancedConfig ?? undefined)
    } else {
      // 3b. POST /session/:id/shell — run shell command
      result = await executeShell(w, sessionId, prompt, undefined, apiLogs)
    }

    const report = extractOutput(result)
    return { subtaskId: subtask.id, success: true, output: 'ok', report, sessionId, logs: apiLogs }
  } catch (err) {
    return { subtaskId: subtask.id, success: false, error: String(err), sessionId, logs: apiLogs }
  } finally {
    // 4. Cleanup session (best-effort, don't block)
    //    Abort first to stop the AI loop, then delete to free resources.
    abortSession(w, sessionId, undefined, apiLogs).catch(() => {})
    deleteSession(w, sessionId, undefined, apiLogs).catch(() => {})
  }
}
