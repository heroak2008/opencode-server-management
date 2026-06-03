export type WorkerStatus = 'online' | 'offline' | 'busy' | 'idle'

export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'paused' | 'cancelled'

export type TaskType = 'code-check' | 'code-analysis' | 'custom'

export interface Worker {
  id: string
  name: string
  host: string
  port: number
  status: WorkerStatus
  currentTasks: number
  maxConcurrency: number
  lastHeartbeat: number
  createdAt: number
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
}

export interface TaskFormData {
  name: string
  type: TaskType
  description?: string
  maxConcurrency: number
  targets: string[]
}

export interface WorkerFormData {
  name: string
  host: string
  port: number
}
