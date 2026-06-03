import type { Worker, Task, SubTask, WorkerStatus, TaskStatus } from '@/types'

export function calculateWorkerStatus(worker: Worker): WorkerStatus {
  const now = Date.now()
  const timeSinceHeartbeat = now - worker.lastHeartbeat
  
  if (timeSinceHeartbeat > 30000) {
    return 'offline'
  }
  
  if (worker.currentTasks >= worker.maxConcurrency) {
    return 'busy'
  }
  
  if (worker.currentTasks > 0) {
    return 'busy'
  }
  
  return 'idle'
}

export function getAvailableWorkers(workers: Worker[]): Worker[] {
  return workers.filter(w => {
    const status = calculateWorkerStatus(w)
    return status === 'idle' || (status === 'busy' && w.currentTasks < w.maxConcurrency)
  })
}

export function calculateTaskProgress(task: Task): number {
  if (task.subTasks.length === 0) return 0
  
  const completedSubTasks = task.subTasks.filter(st => st.status === 'completed').length
  return Math.round((completedSubTasks / task.subTasks.length) * 100)
}

export function updateTaskStatus(task: Task): TaskStatus {
  if (task.subTasks.length === 0) return 'queued'
  
  const statuses = task.subTasks.map(st => st.status)
  
  if (statuses.every(s => s === 'completed')) return 'completed'
  if (statuses.some(s => s === 'failed')) return 'failed'
  if (statuses.some(s => s === 'cancelled')) return 'cancelled'
  if (statuses.some(s => s === 'running')) return 'running'
  if (statuses.some(s => s === 'paused')) return 'paused'
  
  return 'queued'
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${seconds}s`
}

export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function validateWorkerConnection(host: string, port: number): boolean {
  const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/
  const hostnamePattern = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?(\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?)*$/
  
  const isValidHost = ipPattern.test(host) || hostnamePattern.test(host) || host === 'localhost'
  const isValidPort = port > 0 && port <= 65535
  
  return isValidHost && isValidPort
}
