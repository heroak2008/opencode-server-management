export type WorkerStatus = 'online' | 'offline' | 'busy' | 'idle'

export type TaskStatus = 'queued' | 'running' | 'synthesizing' | 'completed' | 'failed' | 'paused' | 'cancelled'

export type TaskType = 'code-check' | 'code-analysis' | 'code-generation' | 'custom'

export interface Worker {
  id: string
  name: string
  host: string
  port: number
  password?: string
  version?: string
  status: WorkerStatus
  currentTasks: number
  maxConcurrency: number
  lastHeartbeat: number
  createdAt: number
}

export interface WorkerFormData {
  name: string
  host: string
  port: number
  password?: string
}

export interface SubTask {
  id: string
  name: string
  target: string
  status: TaskStatus
  workerId?: string
  progress: number
  startTime?: number
  endTime?: number
  error?: string
  logs?: string[]
  report?: string
}

export interface Task {
  id: string
  name: string
  type: TaskType
  description?: string
  status: TaskStatus
  subTasks: SubTask[]
  maxConcurrency: number
  assignedWorkers: string[]
  createdAt: number
  startedAt?: number
  completedAt?: number
  progress: number
  taskReport?: string
  promptTemplateId?: string
  advancedConfig?: ChatInputConfig
}

export type ScheduleMode = 'manual' | 'interval' | 'daily' | 'weekly'

export interface Template {
  id: string
  name: string
  type: TaskType
  description?: string
  subtargets: string[]
  scheduleMode: ScheduleMode
  scheduleInterval: number       // minutes (interval mode)
  scheduleTime: string           // "HH:MM" (daily / weekly mode)
  scheduleDayOfWeek: number      // 0=Sun, 1=Mon … 6=Sat (weekly mode)
  scheduleEnabled: boolean
  lastTriggeredAt?: number
  createdAt: number
  updatedAt: number
  promptTemplateId?: string
  advancedConfig?: ChatInputConfig
}

export interface TaskRun {
  id: string
  templateId: string
  templateName: string
  taskId: string
  triggeredAt: number
  triggerType: 'manual' | 'scheduled'
  status: TaskStatus
}

export type DatabaseEngine = 'mongodb' | 'postgresql' | 'sqlite'

export interface DatabaseConfig {
  engine: DatabaseEngine
  // Common
  host?: string
  port?: number
  database?: string
  username?: string
  password?: string
  ssl?: boolean
  // MongoDB-specific (alternative to host/port)
  mongoUri?: string
  // SQLite-specific
  filePath?: string
  // Connection status
  connected?: boolean
  lastTested?: number
}

// ── Prompt Template ───────────────────────────────────────────────────────

export interface PromptTemplate {
  id: string
  name: string
  taskType: TaskType
  systemPrompt: string
  synthesisPrompt: string
  isBuiltin: boolean
  createdAt: number
  updatedAt: number
}

// ── ChatInput Advanced Config ──────────────────────────────────────────────

/** Optional advanced fields sent in POST /session/:id/message body.
 *  Maps to the OpenCode Server ChatInput type (minus `parts`, which are
 *  injected dynamically).
 *
 *  `useCustomPrompts` / `customSystemPrompt` / `customSynthesisPrompt` are
 *  stored alongside the ChatInput fields for UI cohesion. When
 *  `useCustomPrompts === true` the template ignores its `promptTemplateId`
 *  and uses the inline custom prompts instead. */
export interface ChatInputConfig {
  model?: {
    providerID: string
    modelID: string
  }
  agent?: string
  noReply?: boolean
  /** ChatInput-level system override (sent as-is to the API). */
  system?: string
  tools?: Record<string, unknown>

  // ── Inline prompt overrides (mutually exclusive with promptTemplateId) ──
  /** When true, ignore promptTemplateId and use customSystemPrompt/customSynthesisPrompt. */
  useCustomPrompts?: boolean
  /** Replaces the prompt template's systemPrompt (interpolated with {{target}}/{{taskName}}). */
  customSystemPrompt?: string
  /** Replaces the prompt template's synthesisPrompt (interpolated with {{reports}}). */
  customSynthesisPrompt?: string
}

// ── Task/Template form ─────────────────────────────────────────────────────

export interface TaskFormData {
  name: string
  type: TaskType
  description?: string
  maxConcurrency: number
  targets: string[]
  promptTemplateId?: string
}
