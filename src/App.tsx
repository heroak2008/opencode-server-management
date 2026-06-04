import { useState, useEffect, useRef, useMemo } from "react"
import { usePersistentState } from "@/hooks/usePersistentState"
import { marked } from "marked"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { WorkerCard } from "@/components/WorkerCard"
import { TemplateCard } from "@/components/TemplateCard"
import { PromptTemplateCard } from "@/components/PromptTemplateCard"
import { SettingsDialog } from "@/components/SettingsDialog"
import { TaskCard } from "@/components/TaskCard"
import { Plus, X, CaretRight, HardDrives, ListChecks, ChartLine, Download, Clock, ClockCounterClockwise, Play, Gear, Code, CopySimple } from "@phosphor-icons/react"
import type { Worker, Task, SubTask, TaskType, TaskStatus, ScheduleMode, Template, TaskRun, PromptTemplate, ChatInputConfig } from "@/types"
import { validateWorkerConnection, getAvailableWorkers } from "@/lib/task-utils"
import { healthCheck, executeSubtaskOnWorker, createSession, sendMessage, abortSession, deleteSession } from "@/lib/worker-api"
import { resolvePromptTemplate, interpolatePrompt, getBuiltinTemplates, createPromptTemplate, updatePromptTemplateInList, removePromptTemplateFromList, getBuiltinIdForTaskType } from "@/lib/prompt-templates"
import { toast, Toaster } from "sonner"
import { v4 as uuidv4 } from "uuid"

// ── Pipeline visual helpers ────────────────────────────────────────────────

function StatusDot({ status, pulse = false, size = 'sm' }: { status: string; pulse?: boolean; size?: 'sm' | 'md' }) {
  const sz = size === 'md' ? 'w-3.5 h-3.5' : 'w-2.5 h-2.5'
  const colors: Record<string, string> = {
    queued:       'bg-muted-foreground/30',
    running:      'bg-blue-500',
    synthesizing: 'bg-amber-500',
    completed:    'bg-green-500',
    failed:       'bg-red-500',
    cancelled:    'bg-yellow-600',
    paused:       'bg-amber-500',
  }
  const c = colors[status] ?? 'bg-muted-foreground/30'
  return (
    <span className="relative inline-flex items-center justify-center">
      {pulse && (
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${c} opacity-60`} style={{ aspectRatio: 1 }} />
      )}
      <span className={`relative inline-flex rounded-full ${sz} ${c}`} />
    </span>
  )
}

function StatusLabel({ status }: { status: string }) {
  const labels: Record<string, string> = {
    queued:       'Queued',
    running:      'Running',
    synthesizing: 'Synthesizing',
    completed:    'Completed',
    failed:       'Failed',
    paused:       'Paused',
    cancelled:    'Cancelled',
  }
  const colors: Record<string, string> = {
    queued:       'text-muted-foreground',
    running:      'text-blue-500',
    synthesizing: 'text-amber-500',
    completed:    'text-green-500',
    failed:       'text-red-500',
    paused:       'text-amber-500',
    cancelled:    'text-yellow-600',
  }
  return <span className={`font-medium text-xs ${colors[status] ?? 'text-muted-foreground'}`}>{labels[status] ?? status}</span>
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    queued:    'Queued',
    running:   'Running',
    completed: 'Completed',
    failed:    'Failed',
    paused:    'Paused',
    cancelled: 'Cancelled',
  }
  const colors: Record<string, string> = {
    queued:    'bg-muted text-muted-foreground',
    running:   'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    completed: 'bg-green-500/10 text-green-600 dark:text-green-400',
    failed:    'bg-red-500/10 text-red-600 dark:text-red-400',
    paused:    'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    cancelled: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  }
  return <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${colors[status] ?? 'bg-muted text-muted-foreground'}`}>{labels[status] ?? status}</span>
}

function App() {
  const [workers, setWorkers] = usePersistentState<Worker[]>("workers", [])
  const [tasks, setTasks] = usePersistentState<Task[]>("tasks", [])
  const [activeTab, setActiveTab] = useState("workers")

  const [workerDialogOpen, setWorkerDialogOpen] = useState(false)
  const [workerName, setWorkerName] = useState("")
  const [workerHost, setWorkerHost] = useState("")
  const [workerPort, setWorkerPort] = useState("")
  const [workerPassword, setWorkerPassword] = useState("")
  const [workerMaxConcurrency, setWorkerMaxConcurrency] = useState("3")
  const [checkingWorker, setCheckingWorker] = useState(false)

  const [taskDialogOpen, setTaskDialogOpen] = useState(false)
  const [taskName, setTaskName] = useState("")
  const [taskType, setTaskType] = useState<TaskType>("code-check")
  const [taskDescription, setTaskDescription] = useState("")
  const [taskSubtargets, setTaskSubtargets] = useState<string[]>([""])

  const [templates, setTemplates] = usePersistentState<Template[]>("templates", [])
  const [taskRuns, setTaskRuns] = usePersistentState<TaskRun[]>("taskRuns", [])
  const [promptTemplates, setPromptTemplates] = usePersistentState<PromptTemplate[]>("promptTemplates", [])

  // Template form state
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [templateName, setTemplateName] = useState("")
  const [templateType, setTemplateType] = useState<TaskType>("code-check")
  const [templateDescription, setTemplateDescription] = useState("")
  const [templateSubtargets, setTemplateSubtargets] = useState<string[]>([""])
  const [templateScheduleMode, setTemplateScheduleMode] = useState<ScheduleMode>('manual')
  const [templateScheduleInterval, setTemplateScheduleInterval] = useState(60)
  const [templateScheduleTime, setTemplateScheduleTime] = useState("09:00")
  const [templateScheduleDayOfWeek, setTemplateScheduleDayOfWeek] = useState(1)

  // Prompt template selector state (task & template forms)
  const [taskPromptTemplateId, setTaskPromptTemplateId] = useState("")
  const [templatePromptTemplateId, setTemplatePromptTemplateId] = useState("")

  // Template advanced config (ChatInput overrides)
  const [templateAdvancedConfig, setTemplateAdvancedConfig] = useState<ChatInputConfig>({})

  // Compute the full template list (builtins + custom)
  const allPromptTemplates = useMemo<PromptTemplate[]>(
    () => [...getBuiltinTemplates(), ...(promptTemplates || [])],
    [promptTemplates],
  )

  // When taskType changes, auto-select the matching built-in template
  useEffect(() => {
    setTaskPromptTemplateId(getBuiltinIdForTaskType(taskType))
  }, [taskType])
  useEffect(() => {
    setTemplatePromptTemplateId(getBuiltinIdForTaskType(templateType))
  }, [templateType])

  // Template detail (show execution history)
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)

  const clearAllData = () => {
    setWorkers([])
    setTasks([])
    setTemplates([])
    setTaskRuns([])
    setPromptTemplates([])
  }

  const [detailTemplateId, setDetailTemplateId] = useState<string | null>(null)

  const [detailsTaskId, setDetailsTaskId] = useState<string | null>(null)
  const [expandedSubtasks, setExpandedSubtasks] = useState<Set<string>>(new Set())
  const toggleSubtaskExpand = (id: string) => {
    setExpandedSubtasks(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // Refs for background execution (avoid stale closures in async code)
  const workersRef = useRef(workers)
  workersRef.current = workers
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks
  const templatesRef = useRef(templates)
  templatesRef.current = templates
  const taskRunsRef = useRef(taskRuns)
  taskRunsRef.current = taskRuns
  const promptTemplatesRef = useRef(promptTemplates)
  promptTemplatesRef.current = promptTemplates
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map())

  // Simulate heartbeats every 15s to keep workers from appearing offline
  useEffect(() => {
    const interval = setInterval(() => {
      setWorkers((current) =>
        (current || []).map(worker => ({
          ...worker,
          lastHeartbeat: Date.now(),
        }))
      )
    }, 15000)
    return () => clearInterval(interval)
  }, [setWorkers])

  // Poll every 2s:
  // 1. Advance tasks to synthesizing → completed when reports are in
  // 2. Recalculate worker loads from actual task state (self-healing for stuck busy)
  useEffect(() => {
    const interval = setInterval(() => {
      // Step 1 — advance tasks through terminal states
      const taskSnapshot = tasksRef.current ?? []
      for (const task of taskSnapshot) {
        if (task.status === 'running') {
          const terminal = task.subTasks.every(st =>
            st.status === 'completed' || st.status === 'failed' || st.status === 'cancelled'
          )
          if (!terminal) continue

          const hasAnyReport = task.subTasks.some(st => st.report)
          if (hasAnyReport) {
            // There are reports to integrate — kick off synthesis
            setTasks(prev => (prev || []).map(t =>
              t.id === task.id ? { ...t, status: 'synthesizing' as Task['status'] } : t
            ))
            synthesizeTaskReport(task.id)
          } else {
            // No reports — mark completed/failed directly
            const hasFailed = task.subTasks.some(st => st.status === 'failed' || st.status === 'cancelled')
            setTasks(prev => (prev || []).map(t =>
              t.id === task.id
                ? { ...t, status: (hasFailed ? 'failed' : 'completed') as Task['status'], completedAt: Date.now(), progress: 100 }
                : t
            ))
          }
        } else if (task.status === 'synthesizing') {
          if (task.taskReport) {
            // Synthesis result received → task is complete
            setTasks(prev => (prev || []).map(t =>
              t.id === task.id ? { ...t, status: 'completed' as Task['status'], completedAt: Date.now(), progress: 100 } : t
            ))
          } else if (task.startedAt && Date.now() - task.startedAt > 600_000) {
            // Synthesis timed out (10 min) — complete without integrated report
            setTasks(prev => (prev || []).map(t =>
              t.id === task.id ? { ...t, status: 'completed' as Task['status'], completedAt: Date.now(), progress: 100 } : t
            ))
          }
        }
      }

      // Step 2 — recalculate worker loads from actual subtask state
      // This automatically fixes any desync between increment/decrement
      const loadSnapshot = tasksRef.current ?? []
      setWorkers((current) => {
        if (!current) return [] as Worker[]
        return current.map(w => {
          const activeCount = loadSnapshot.reduce((sum, t) => {
            if (t.status !== 'running') return sum
            return sum + t.subTasks.filter(st =>
              st.workerId === w.id && (st.status === 'running' || st.status === 'queued')
            ).length
          }, 0)
          return { ...w, currentTasks: activeCount }
        })
      })

      // Step 3 — sync TaskRun statuses from completed tasks
      const runsSnapshot = taskRunsRef.current ?? []
      const tasksSnapshot = tasksRef.current ?? []
      for (const run of runsSnapshot) {
        const linkedTask = tasksSnapshot.find(t => t.id === run.taskId)
        if (linkedTask && linkedTask.status !== run.status) {
          // Only update if the task reached a terminal state
          if (['completed', 'failed', 'cancelled'].includes(linkedTask.status)) {
            setTaskRuns(prev => (prev || []).map(r =>
              r.id === run.id ? { ...r, status: linkedTask.status as TaskStatus } : r
            ))
          }
        }
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [setTasks, setWorkers, setTaskRuns])

  // -----------------------------------------------------------------------
  // Prompt builder — resolves the configured template and interpolates vars
  // -----------------------------------------------------------------------
  function buildPrompt(taskType: TaskType, target: string, taskName: string, templateId?: string, advancedConfig?: ChatInputConfig): string {
    // Check for inline custom prompt in advanced config
    if (advancedConfig?.useCustomPrompts && advancedConfig.customSystemPrompt) {
      return interpolatePrompt(advancedConfig.customSystemPrompt, { target, taskName })
    }
    // Otherwise resolve from prompt template system
    const tmpl = resolvePromptTemplate(templateId, taskType, promptTemplates || [])
    return interpolatePrompt(tmpl.systemPrompt, { target, taskName })
  }

  // -----------------------------------------------------------------------
  // Background execution engine — calls worker API for each assigned subtask
  // -----------------------------------------------------------------------
  const executeTaskRemotely = async (taskId: string, workerMapping: Record<string, string>) => {
    const ac = new AbortController()
    abortControllersRef.current.set(taskId, ac)

    try {
      const task = tasksRef.current?.find(t => t.id === taskId)
      if (!task) return

      // Process subtasks in concurrency batches
      for (let i = 0; i < task.subTasks.length; i += task.maxConcurrency) {
        if (ac.signal.aborted) return
        const batch = task.subTasks.slice(i, i + task.maxConcurrency)

        await Promise.all(batch.map(async (st) => {
          if (ac.signal.aborted) return

          // Use pre-computed mapping (NOT st.workerId — that's stale until re-render)
          const assignedWorkerId = workerMapping[st.id]
          if (!assignedWorkerId) return
          const worker = workersRef.current?.find(w => w.id === assignedWorkerId)
          if (!worker) return

          // Mark subtask as running
          setTasks(prev => (prev || []).map(t =>
            t.id === taskId
              ? { ...t, subTasks: t.subTasks.map(s => s.id === st.id ? { ...s, status: 'running' as const, startTime: Date.now() } : s) }
              : t
          ))

          try {
            const mode = task.type === 'custom' ? 'shell' : 'message'
            const prompt = buildPrompt(task.type, st.target, task.name, task.promptTemplateId, task.advancedConfig)

            // Format ApiLogEntry[] → string[] for display
            const fmtLogs = (ents: any[]) =>
              ents.map(
                (log: any) => `[${log.timestamp}] ${log.method} ${log.path} → ${log.error ? '❌ ' + log.error : log.status} (${log.durationMs}ms)`
              )

            // Progressive log streaming: update subtask logs as each API call completes
            const result = await executeSubtaskOnWorker(
              worker,
              { id: st.id, target: st.target },
              task.name,
              mode,
              prompt,
              (logs) => {
                setTasks(prev => (prev || []).map(t =>
                  t.id === taskId
                    ? {
                        ...t,
                        subTasks: t.subTasks.map(s =>
                          s.id === st.id ? { ...s, logs: fmtLogs(logs) } : s
                        ),
                      }
                    : t
                ))
              },
              task.advancedConfig as Record<string, unknown> | undefined,
            )

            if (ac.signal.aborted) return

            setTasks(prev => (prev || []).map(t =>
              t.id === taskId
                ? {
                    ...t,
                    subTasks: t.subTasks.map(s =>
                      s.id !== st.id ? s
                        : result.success
                          ? { ...s, status: 'completed' as const, progress: 100, endTime: Date.now(), logs: fmtLogs(result.logs ?? []), report: result.report }
                          : { ...s, status: 'failed' as const, error: result.error, endTime: Date.now(), logs: fmtLogs(result.logs ?? []), report: result.report }
                    ),
                  }
                : t
            ))

            setWorkers(prev => (prev || []).map(w =>
              w.id === worker.id ? { ...w, currentTasks: Math.max(0, w.currentTasks - 1) } : w
            ))
          } catch (err) {
            if (ac.signal.aborted) return

            const errStr = String(err)
            setTasks(prev => (prev || []).map(t =>
              t.id === taskId
                ? { ...t, subTasks: t.subTasks.map(s => s.id === st.id ? { ...s, status: 'failed' as const, error: errStr, endTime: Date.now(), logs: ['--- UNEXPECTED ERROR ---', errStr] } : s) }
                : t
            ))

            setWorkers(prev => (prev || []).map(w =>
              w.id === worker.id ? { ...w, currentTasks: Math.max(0, w.currentTasks - 1) } : w
            ))
          }
        }))
      }
    } finally {
      abortControllersRef.current.delete(taskId)
    }
  }

  // -----------------------------------------------------------------------
  // Report synthesis — integrates all subtask reports into one unified report
  // -----------------------------------------------------------------------
  const synthesizeTaskReport = async (taskId: string) => {
    const task = tasksRef.current?.find(t => t.id === taskId)
    if (!task) return

    const reports = task.subTasks
      .filter(st => st.report && st.status === 'completed')
      .map(st => ({ target: st.target, report: st.report! }))

    if (reports.length === 0) return

    // Pick the first idle worker for synthesis
    const available = getAvailableWorkers(workersRef.current ?? [])
    if (available.length === 0) return
    const worker = available[0]

    // Build synthesis prompt from configured template or inline custom prompt
    const reportsBlock = reports.map(r =>
      `## Target: ${r.target}\n\n${r.report}`
    ).join('\n\n---\n\n')

    let prompt: string
    if (task.advancedConfig?.useCustomPrompts && task.advancedConfig.customSynthesisPrompt) {
      prompt = interpolatePrompt(task.advancedConfig.customSynthesisPrompt, { reports: reportsBlock })
    } else {
      const synthesisTmpl = resolvePromptTemplate(task.promptTemplateId, task.type, promptTemplatesRef.current ?? [])
      prompt = interpolatePrompt(synthesisTmpl.synthesisPrompt, { reports: reportsBlock })
    }

    const w = { host: worker.host, port: worker.port, password: worker.password }
    let sessionId: string | undefined

    try {
      const session = await createSession(w, `[Synthesis] ${task.name}`, undefined)
      sessionId = session?.id ?? session?.sessionId
      if (!sessionId) return

      const result = await sendMessage(w, sessionId, [{ type: 'text', text: prompt }], undefined, undefined, 'build')

      // Extract report using the same extractOutput logic
      const parts: any[] = result?.parts ?? result?.message?.parts ?? []
      const lines: string[] = []
      for (const p of parts) {
        if ((p.type === 'text' || p.type === 'content') && p.text) {
          lines.push(p.text)
        }
      }
      const integratedReport = lines.join('\n').trim()

      if (integratedReport) {
        setTasks(prev => (prev || []).map(t =>
          t.id === taskId ? { ...t, taskReport: integratedReport } : t
        ))
      }
    } catch {
      // Synthesis is best-effort; don't fail the task if it errors
    } finally {
      // Cleanup session (best-effort)
      if (sessionId) {
        abortSession(w, sessionId).catch(() => {})
        deleteSession(w, sessionId).catch(() => {})
      }
    }
  }

  const addWorker = async () => {
    const port = parseInt(workerPort)
    
    if (!workerName.trim()) {
      toast.error("Worker name is required")
      return
    }
    
    if (!validateWorkerConnection(workerHost, port)) {
      toast.error("Invalid host or port")
      return
    }

    // Verify worker is a reachable OpenCode Server before saving
    setCheckingWorker(true)
    let version: string | undefined
    try {
      const hc = await healthCheck({ host: workerHost, port, password: workerPassword || undefined })
      if (!hc.healthy) {
        toast.error(`Worker at ${workerHost}:${port} is not healthy`)
        setCheckingWorker(false)
        return
      }
      version = hc.version
    } catch (err: any) {
      toast.error(`Cannot reach worker at ${workerHost}:${port} — ${err?.message ?? String(err)}`)
      setCheckingWorker(false)
      return
    }
    setCheckingWorker(false)

    const newWorker: Worker = {
      id: uuidv4(),
      name: workerName,
      host: workerHost,
      port,
      password: workerPassword || undefined,
      version,
      status: 'idle',
      currentTasks: 0,
      maxConcurrency: parseInt(workerMaxConcurrency) || 3,
      lastHeartbeat: Date.now(),
      createdAt: Date.now(),
    }

    setWorkers((current) => [...(current || []), newWorker])
    toast.success(`Worker "${workerName}" added (v${version ?? '?'})`)
    setActiveTab("workers")
    
    setWorkerName("")
    setWorkerHost("")
    setWorkerPort("")
    setWorkerPassword("")
    setWorkerMaxConcurrency("3")
    setWorkerDialogOpen(false)
  }

  const deleteWorker = (id: string) => {
    setWorkers((current) => (current || []).filter(w => w.id !== id))
    toast.success("Worker removed")
  }

  const createTask = () => {
    if (!taskName.trim()) {
      toast.error("Task name is required")
      return
    }

    const targets = taskSubtargets.map(t => t.trim()).filter(Boolean)
    if (targets.length === 0) {
      toast.error("At least one target is required")
      return
    }

    const subTasks: SubTask[] = targets.map((target, index) => ({
      id: uuidv4(),
      name: `Subtask ${index + 1}`,
      target,
      status: 'queued',
      progress: 0,
    }))

    const newTask: Task = {
      id: uuidv4(),
      name: taskName,
      type: taskType,
      description: taskDescription || undefined,
      status: 'queued',
      subTasks,
      maxConcurrency: targets.length,
      assignedWorkers: [],
      createdAt: Date.now(),
      progress: 0,
      promptTemplateId: taskPromptTemplateId || undefined,
    }

    setTasks((current) => [...(current || []), newTask])
    toast.success(`Task "${taskName}" created`)
    setActiveTab("tasks")
    
    setTaskName("")
    setTaskDescription("")
    setTaskSubtargets([""])
    setTaskDialogOpen(false)
  }

  const startTask = (id: string) => {
    const availableWorkers = getAvailableWorkers(workers || [])
    if (availableWorkers.length === 0 && (workers?.length || 0) > 0) {
      toast.error("All workers are busy or offline")
      return
    }
    if ((workers?.length || 0) === 0) {
      toast.error("No workers registered")
      return
    }

    const task = tasks?.find(t => t.id === id)
    const concurrency = Math.min(task?.maxConcurrency ?? 1, availableWorkers.length)
    const assignedWorkers = availableWorkers.slice(0, concurrency)
    const assignedIds = assignedWorkers.map(w => w.id)

    // Build worker mapping HERE (before setTasks — avoid stale closure in
    // executeTaskRemotely which reads tasksRef before React re-render)
    const workerMapping: Record<string, string> = {}
    if (task) {
      task.subTasks.forEach((st, idx) => {
        if (idx < assignedIds.length) {
          workerMapping[st.id] = assignedIds[idx]
        }
      })
    }

    setTasks((current) =>
      (current || []).map(t => {
        if (t.id === id) {
          // Assign first batch of subtasks to workers
          const updatedSubTasks = t.subTasks.map((st, idx) => ({
            ...st,
            status: idx < concurrency ? ('queued' as const) : ('queued' as const),
            startTime: idx < concurrency ? Date.now() : undefined,
            workerId: idx < assignedIds.length ? assignedIds[idx] : undefined,
          }))

          return {
            ...t,
            status: 'running' as const,
            startedAt: Date.now(),
            subTasks: updatedSubTasks,
            assignedWorkers: assignedIds,
            progress: 0,
          }
        }
        return t
      })
    )

    // Mark assigned workers as busy
    setWorkers((current) =>
      (current || []).map(w =>
        assignedIds.includes(w.id) ? { ...w, currentTasks: w.currentTasks + 1 } : w
      )
    )

    toast.success(`Task started — assigned to ${assignedWorkers.map(w => w.name).join(', ')}`)

    // Kick off background execution with the pre-computed mapping
    executeTaskRemotely(id, workerMapping)
  }

  const pauseTask = (id: string) => {
    // Abort any in-flight API calls
    abortControllersRef.current.get(id)?.abort()

    const task = tasks?.find(t => t.id === id)
    const runningWorkerIds = task?.subTasks.filter(st => st.status === 'running').map(st => st.workerId).filter(Boolean) as string[] || []

    setTasks((current) =>
      (current || []).map(t => {
        if (t.id === id) {
          const updatedSubTasks = t.subTasks.map(st => ({
            ...st,
            status: st.status === 'running' ? ('paused' as const) : st.status,
          }))
          
          return {
            ...t,
            status: 'paused' as const,
            subTasks: updatedSubTasks as SubTask[],
          }
        }
        return t
      })
    )

    setWorkers((current) =>
      (current || []).map(w =>
        runningWorkerIds.includes(w.id) ? { ...w, currentTasks: Math.max(0, w.currentTasks - 1) } : w
      )
    )

    toast.info("Task paused")
  }

  const cancelTask = (id: string) => {
    // Abort any in-flight API calls
    abortControllersRef.current.get(id)?.abort()

    const task = tasks?.find(t => t.id === id)
    const activeWorkerIds = task?.subTasks.filter(st => st.status === 'running' || st.status === 'queued').map(st => st.workerId).filter(Boolean) as string[] || []

    setTasks((current) =>
      (current || []).map(t => {
        if (t.id === id) {
          return {
            ...t,
            status: 'cancelled' as const,
            subTasks: t.subTasks.map(st => ({
              ...st,
              status: st.status === 'completed' ? ('completed' as const) : ('cancelled' as const),
            })),
          }
        }
        return t
      })
    )

    setWorkers((current) =>
      (current || []).map(w =>
        activeWorkerIds.includes(w.id) ? { ...w, currentTasks: Math.max(0, w.currentTasks - 1) } : w
      )
    )

    toast.warning("Task cancelled")
  }

  // -----------------------------------------------------------------------
  // Template CRUD
  // -----------------------------------------------------------------------
  const resetTemplateForm = () => {
    setEditingTemplateId(null)
    setTemplateName("")
    setTemplateType("code-check")
    setTemplateDescription("")
    setTemplateSubtargets([""])
    setTemplateScheduleMode('manual')
    setTemplateScheduleInterval(60)
    setTemplateScheduleTime("09:00")
    setTemplateScheduleDayOfWeek(1)
    setTemplateAdvancedConfig({})
  }

  const openCreateTemplate = () => {
    resetTemplateForm()
    setTemplateDialogOpen(true)
  }

  const openEditTemplate = (tpl: Template) => {
    setEditingTemplateId(tpl.id)
    setTemplateName(tpl.name)
    setTemplateType(tpl.type)
    setTemplateDescription(tpl.description ?? "")
    setTemplateSubtargets(tpl.subtargets.length > 0 ? [...tpl.subtargets] : [""])
    setTemplateScheduleMode(tpl.scheduleMode)
    setTemplateScheduleInterval(tpl.scheduleInterval)
    setTemplateScheduleTime(tpl.scheduleTime)
    setTemplateScheduleDayOfWeek(tpl.scheduleDayOfWeek)
    setTemplatePromptTemplateId(tpl.promptTemplateId ?? getBuiltinIdForTaskType(tpl.type))
    setTemplateAdvancedConfig(tpl.advancedConfig ?? {})
    setTemplateDialogOpen(true)
  }

  const saveTemplate = () => {
    if (!templateName.trim()) {
      toast.error("Template name is required")
      return
    }
    const targets = templateSubtargets.map(t => t.trim()).filter(Boolean)
    if (targets.length === 0) {
      toast.error("At least one target is required")
      return
    }

    // Clean up empty advanced config fields before saving
    const cleanConfig = (cfg: ChatInputConfig): ChatInputConfig | undefined => {
      const cleaned: ChatInputConfig = {}
      if (cfg.model?.providerID || cfg.model?.modelID) {
        cleaned.model = { providerID: cfg.model.providerID || '', modelID: cfg.model.modelID || '' }
        if (!cleaned.model.providerID && !cleaned.model.modelID) delete cleaned.model
      }
      if (cfg.agent) cleaned.agent = cfg.agent
      if (cfg.noReply) cleaned.noReply = true
      if (cfg.system) cleaned.system = cfg.system
      if (cfg.tools && Object.keys(cfg.tools).length > 0) cleaned.tools = cfg.tools
      if (cfg.useCustomPrompts) {
        cleaned.useCustomPrompts = true
        if (cfg.customSystemPrompt) cleaned.customSystemPrompt = cfg.customSystemPrompt
        if (cfg.customSynthesisPrompt) cleaned.customSynthesisPrompt = cfg.customSynthesisPrompt
      }
      return Object.keys(cleaned).length > 0 ? cleaned : undefined
    }

    if (editingTemplateId) {
      // Update existing
      setTemplates(prev => (prev || []).map(t =>
        t.id === editingTemplateId
          ? {
              ...t,
              name: templateName,
              type: templateType,
              description: templateDescription || undefined,
              subtargets: targets,
              scheduleMode: templateScheduleMode,
              scheduleInterval: templateScheduleMode === 'interval' ? templateScheduleInterval : 0,
              scheduleTime: templateScheduleMode === 'daily' || templateScheduleMode === 'weekly' ? templateScheduleTime : "09:00",
              scheduleDayOfWeek: templateScheduleMode === 'weekly' ? templateScheduleDayOfWeek : 0,
              scheduleEnabled: templateScheduleMode !== 'manual',
              promptTemplateId: templatePromptTemplateId || undefined,
              advancedConfig: cleanConfig(templateAdvancedConfig),
              updatedAt: Date.now(),
            }
          : t
      ))
      toast.success(`Template "${templateName}" updated`)
    } else {
      // Create new
      const newTemplate: Template = {
        id: uuidv4(),
        name: templateName,
        type: templateType,
        description: templateDescription || undefined,
        subtargets: targets,
        scheduleMode: templateScheduleMode,
        scheduleInterval: templateScheduleMode === 'interval' ? templateScheduleInterval : 0,
        scheduleTime: templateScheduleMode === 'daily' || templateScheduleMode === 'weekly' ? templateScheduleTime : "09:00",
        scheduleDayOfWeek: templateScheduleMode === 'weekly' ? templateScheduleDayOfWeek : 0,
        scheduleEnabled: templateScheduleMode !== 'manual',
        promptTemplateId: templatePromptTemplateId || undefined,
        advancedConfig: cleanConfig(templateAdvancedConfig),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      setTemplates(prev => [...(prev || []), newTemplate])
      toast.success(`Template "${templateName}" created`)
      setActiveTab("templates")
    }
    setTemplateDialogOpen(false)
    resetTemplateForm()
  }

  const deleteTemplate = (id: string) => {
    setTemplates(prev => (prev || []).filter(t => t.id !== id))
    // Also clean up orphaned task runs
    setTaskRuns(prev => (prev || []).filter(r => r.templateId !== id))
    toast.success("Template deleted")
  }

  // -----------------------------------------------------------------------
  // Prompt Template CRUD
  // -----------------------------------------------------------------------
  const savePromptTemplate = (updated: PromptTemplate) => {
    if (updated.isBuiltin) {
      // Cloning a built-in → create a custom copy
      const clone = createPromptTemplate(
        updated.name + ' (Custom)',
        updated.taskType,
        updated.systemPrompt,
        updated.synthesisPrompt,
      )
      setPromptTemplates(prev => [...(prev || []), clone])
      toast.success(`Prompt template cloned as "${clone.name}"`)
    } else {
      setPromptTemplates(prev => updatePromptTemplateInList(prev || [], updated))
      toast.success('Prompt template updated')
    }
  }

  const deletePromptTemplate = (id: string) => {
    setPromptTemplates(prev => removePromptTemplateFromList(prev || [], id))
    toast.success('Prompt template deleted')
  }

  // -----------------------------------------------------------------------
  // Trigger template → create task + record run
  // -----------------------------------------------------------------------
  const triggerTemplate = (tpl: Template) => {
    const targets = tpl.subtargets.filter(Boolean)
    if (targets.length === 0) {
      toast.error("Template has no targets")
      return
    }

    // Create subtasks
    const subTasks: SubTask[] = targets.map((target, index) => ({
      id: uuidv4(),
      name: `Subtask ${index + 1}`,
      target,
      status: 'queued',
      progress: 0,
    }))

    const taskId = uuidv4()
    const taskLabel = `${tpl.name} — ${new Date().toISOString().slice(0, 16).replace('T', ' ')} (${taskId.slice(0, 6)})`
    const newTask: Task = {
      id: taskId,
      name: taskLabel,
      type: tpl.type,
      description: tpl.description,
      status: 'queued',
      subTasks,
      maxConcurrency: targets.length,
      assignedWorkers: [],
      createdAt: Date.now(),
      progress: 0,
      promptTemplateId: tpl.promptTemplateId,
      advancedConfig: tpl.advancedConfig,
    }

    // Record the run
    const run: TaskRun = {
      id: uuidv4(),
      templateId: tpl.id,
      templateName: tpl.name,
      taskId,
      triggeredAt: Date.now(),
      triggerType: 'manual',
      status: 'queued',
    }

    setTasks(prev => [...(prev || []), newTask])
    setTaskRuns(prev => [...(prev || []), run])
    setTemplates(prev => (prev || []).map(t =>
      t.id === tpl.id ? { ...t, lastTriggeredAt: Date.now(), updatedAt: Date.now() } : t
    ))

    toast.success(`Task created from template "${tpl.name}"`)
    setActiveTab("tasks")

    // Auto-start if workers available
    const availableWorkers = getAvailableWorkers(workers || [])
    if (availableWorkers.length > 0) {
      // Small delay to let React process the new task before starting it
      setTimeout(() => startTask(taskId), 100)
    }
  }

  // -----------------------------------------------------------------------
  // Scheduler — check every 15s for templates due for auto-trigger
  // -----------------------------------------------------------------------
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      const tpls = templatesRef.current ?? []
      const runs = taskRunsRef.current ?? []

      for (const tpl of tpls) {
        if (!tpl.scheduleEnabled || tpl.scheduleMode === 'manual') continue

        let shouldTrigger = false

        switch (tpl.scheduleMode) {
          case 'interval': {
            if (tpl.scheduleInterval <= 0) continue
            const lastRun = tpl.lastTriggeredAt ?? tpl.createdAt
            const dueMs = tpl.scheduleInterval * 60 * 1000
            // Debounce: only trigger if last run + interval has passed,
            // and we haven't already created a scheduled run in this window
            if (now - lastRun >= dueMs) {
              const recentRun = runs.some(r =>
                r.templateId === tpl.id && r.triggerType === 'scheduled' && now - r.triggeredAt < dueMs
              )
              if (!recentRun) shouldTrigger = true
            }
            break
          }
          case 'daily': {
            if (!tpl.scheduleTime) continue
            const [h, m] = tpl.scheduleTime.split(':').map(Number)
            const todayTarget = new Date()
            todayTarget.setHours(h, m, 0, 0)

            // Only trigger if target time is within the last 15s window
            // and we haven't triggered today (checked via lastTriggeredAt date)
            if (now >= todayTarget.getTime() && now - todayTarget.getTime() < 20_000) {
              const lastDate = tpl.lastTriggeredAt
                ? new Date(tpl.lastTriggeredAt).toDateString()
                : null
              if (lastDate !== todayTarget.toDateString()) {
                shouldTrigger = true
              }
            }
            break
          }
          case 'weekly': {
            if (!tpl.scheduleTime) continue
            const [h2, m2] = tpl.scheduleTime.split(':').map(Number)
            const nowDay = new Date().getDay() // 0=Sun
            if (nowDay !== tpl.scheduleDayOfWeek) continue

            const todayTarget2 = new Date()
            todayTarget2.setHours(h2, m2, 0, 0)

            if (now >= todayTarget2.getTime() && now - todayTarget2.getTime() < 20_000) {
              const lastDate = tpl.lastTriggeredAt
                ? new Date(tpl.lastTriggeredAt).toDateString()
                : null
              if (lastDate !== todayTarget2.toDateString()) {
                shouldTrigger = true
              }
            }
            break
          }
        }

        if (!shouldTrigger) continue

        // Create subtasks
        const targets = tpl.subtargets.filter(Boolean)
        if (targets.length === 0) continue

        const subTasks: SubTask[] = targets.map((target, index) => ({
          id: uuidv4(),
          name: `Subtask ${index + 1}`,
          target,
          status: 'queued',
          progress: 0,
        }))

        const taskId = uuidv4()
        const taskLabel = `${tpl.name} — ${new Date().toISOString().slice(0, 16).replace('T', ' ')} (${taskId.slice(0, 6)})`
        const newTask: Task = {
          id: taskId,
          name: taskLabel,
          type: tpl.type,
          description: tpl.description,
          status: 'queued',
          subTasks,
          maxConcurrency: targets.length,
          assignedWorkers: [],
          createdAt: Date.now(),
          progress: 0,
          promptTemplateId: tpl.promptTemplateId,
          advancedConfig: tpl.advancedConfig,
        }

        const run: TaskRun = {
          id: uuidv4(),
          templateId: tpl.id,
          templateName: tpl.name,
          taskId,
          triggeredAt: now,
          triggerType: 'scheduled',
          status: 'queued',
        }

        // Use functional updaters to avoid stale closures
        setTasks(prev => [...(prev || []), newTask])
        setTaskRuns(prev => [...(prev || []), run])
        setTemplates(prev => (prev || []).map(t =>
          t.id === tpl.id ? { ...t, lastTriggeredAt: now, updatedAt: now } : t
        ))

        // Auto-start
        const available = getAvailableWorkers(workersRef.current ?? [])
        if (available.length > 0) {
          setTimeout(() => startTask(taskId), 100)
        }
      }
    }, 15_000)
    return () => clearInterval(interval)
  }, [setTasks, setTaskRuns, setTemplates])

  const viewTaskDetails = (id: string) => {
    setDetailsTaskId(id)
  }

  const viewTemplateHistory = (tpl: Template) => {
    setDetailTemplateId(tpl.id)
  }

  const selectedTemplate = templates?.find(t => t.id === detailTemplateId)
  const templateRuns = taskRuns?.filter(r => r.templateId === detailTemplateId) ?? []

  const selectedTask = tasks?.find(t => t.id === detailsTaskId)

  const totalWorkers = workers?.length || 0
  const onlineWorkers = workers?.filter(w => w.status !== 'offline').length || 0
  const runningTasks = tasks?.filter(t => t.status === 'running').length || 0
  const completedTasks = tasks?.filter(t => t.status === 'completed').length || 0

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">OpenCode Task Manager</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Distributed task orchestration system</p>
            </div>
              <div className="flex items-center gap-4">
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <HardDrives size={18} className="text-muted-foreground" />
                  <code className="font-mono">{onlineWorkers}/{totalWorkers}</code>
                </div>
                <div className="flex items-center gap-2">
                  <ChartLine size={18} className="text-muted-foreground" />
                  <code className="font-mono">{runningTasks} running</code>
                </div>
                <div className="flex items-center gap-2">
                  <ListChecks size={18} className="text-muted-foreground" />
                  <code className="font-mono">{completedTasks} completed</code>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSettingsDialogOpen(true)} className="text-muted-foreground hover:text-foreground">
                <Gear size={19} />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-6">
            <TabsList>
              <TabsTrigger value="workers" className="gap-2">
                <HardDrives size={18} />
                Workers
              </TabsTrigger>
              <TabsTrigger value="templates" className="gap-2">
                <Clock size={18} />
                Templates
              </TabsTrigger>
              <TabsTrigger value="tasks" className="gap-2">
                <ListChecks size={18} />
                Tasks
              </TabsTrigger>
              <TabsTrigger value="prompts" className="gap-2">
                <Code size={18} />
                Prompts
              </TabsTrigger>
            </TabsList>

            <div className="flex gap-2">
              <Dialog open={workerDialogOpen} onOpenChange={setWorkerDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus size={18} weight="bold" />
                    Add Worker
                  </Button>
                </DialogTrigger>
                <DialogContent onPointerDownOutside={checkingWorker ? (e) => e.preventDefault() : undefined}>
                  <DialogHeader>
                    <DialogTitle>Add Worker</DialogTitle>
                    <DialogDescription>
                      Register a new OpenCode Server worker to the task pool
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="worker-name">Worker Name</Label>
                      <Input
                        id="worker-name"
                        value={workerName}
                        onChange={(e) => setWorkerName(e.target.value)}
                        placeholder="Production Worker 1"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="worker-host">Host / IP Address</Label>
                      <Input
                        id="worker-host"
                        value={workerHost}
                        onChange={(e) => setWorkerHost(e.target.value)}
                        placeholder="192.168.1.100 or localhost"
                        className="font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="worker-port">Port</Label>
                      <Input
                        id="worker-port"
                        type="number"
                        value={workerPort}
                        onChange={(e) => setWorkerPort(e.target.value)}
                        placeholder="4096"
                        className="font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="worker-concurrency">Max Load</Label>
                      <Input
                        id="worker-concurrency"
                        type="number"
                        min={1}
                        value={workerMaxConcurrency}
                        onChange={(e) => setWorkerMaxConcurrency(e.target.value)}
                        placeholder="3"
                        className="w-32 font-mono"
                      />
                      <p className="text-xs text-muted-foreground">
                        Number of concurrent tasks this worker can handle
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="worker-password">Password (optional)</Label>
                      <Input
                        id="worker-password"
                        type="password"
                        value={workerPassword}
                        onChange={(e) => setWorkerPassword(e.target.value)}
                        placeholder="OPENCODE_SERVER_PASSWORD"
                        className="font-mono"
                      />
                      <p className="text-xs text-muted-foreground">
                        Required if the server has OPENCODE_SERVER_PASSWORD set
                      </p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setWorkerDialogOpen(false)} disabled={checkingWorker}>
                      Cancel
                    </Button>
                    <Button onClick={addWorker} disabled={checkingWorker}>
                      {checkingWorker ? 'Connecting…' : 'Add Worker'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus size={18} weight="bold" />
                    Create Task
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Create Task</DialogTitle>
                    <DialogDescription>
                      Configure a new task with multiple subtasks for distributed execution
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                    <div className="space-y-2">
                      <Label htmlFor="task-name">Task Name</Label>
                      <Input
                        id="task-name"
                        value={taskName}
                        onChange={(e) => setTaskName(e.target.value)}
                        placeholder="Repository Code Check"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="task-type">Task Type</Label>
                      <Select value={taskType} onValueChange={(v) => setTaskType(v as TaskType)}>
                        <SelectTrigger id="task-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="code-check">Code Check</SelectItem>
                          <SelectItem value="code-analysis">Code Analysis</SelectItem>
                          <SelectItem value="code-generation">Code Generation</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Prompt Template</Label>
                      <Select value={taskPromptTemplateId} onValueChange={setTaskPromptTemplateId}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {allPromptTemplates
                            .filter(t => t.taskType === taskType)
                            .map(tmpl => (
                              <SelectItem key={tmpl.id} value={tmpl.id}>
                                {tmpl.name}{tmpl.isBuiltin ? ' (built-in)' : ''}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="task-description">Description (Optional)</Label>
                      <Input
                        id="task-description"
                        value={taskDescription}
                        onChange={(e) => setTaskDescription(e.target.value)}
                        placeholder="Full repository lint check"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Subtask Targets</Label>
                      <div className="space-y-2">
                        {taskSubtargets.map((target, idx) => (
                          <div key={idx} className="flex gap-2 items-start">
                            <span className="mt-2 text-xs text-muted-foreground font-mono min-w-[1.5rem]">{idx + 1}.</span>
                            <Input
                              value={target}
                              onChange={(e) => {
                                const next = [...taskSubtargets]
                                next[idx] = e.target.value
                                setTaskSubtargets(next)
                              }}
                              placeholder={idx === 0 ? "src/components" : "src/utils"}
                              className="font-mono text-sm flex-1"
                            />
                            {taskSubtargets.length > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 w-9 shrink-0"
                                onClick={() => setTaskSubtargets(taskSubtargets.filter((_, i) => i !== idx))}
                              >
                                <X size={16} />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setTaskSubtargets([...taskSubtargets, ""])}
                        className="gap-1 mt-1"
                      >
                        <Plus size={14} />
                        Add Target
                      </Button>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setTaskDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={createTask}>Create Task</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* ── Create/Edit Template button ── */}
              <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2" variant="outline" onClick={() => openCreateTemplate()}>
                    <Clock size={18} />
                    Create Template
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>{editingTemplateId ? 'Edit Template' : 'Create Template'}</DialogTitle>
                    <DialogDescription>
                      Configure a reusable task template with optional scheduled triggers
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                    <div className="space-y-2">
                      <Label htmlFor="tpl-name">Template Name</Label>
                      <Input
                        id="tpl-name"
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        placeholder="Weekly Code Check"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tpl-type">Task Type</Label>
                      <Select value={templateType} onValueChange={(v) => setTemplateType(v as TaskType)}>
                        <SelectTrigger id="tpl-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="code-check">Code Check</SelectItem>
                          <SelectItem value="code-analysis">Code Analysis</SelectItem>
                          <SelectItem value="code-generation">Code Generation</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Prompt Template</Label>
                      <Select value={templatePromptTemplateId} onValueChange={setTemplatePromptTemplateId}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {allPromptTemplates
                            .filter(t => t.taskType === templateType)
                            .map(tmpl => (
                              <SelectItem key={tmpl.id} value={tmpl.id}>
                                {tmpl.name}{tmpl.isBuiltin ? ' (built-in)' : ''}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tpl-description">Description (Optional)</Label>
                      <Input
                        id="tpl-description"
                        value={templateDescription}
                        onChange={(e) => setTemplateDescription(e.target.value)}
                        placeholder="Full repository lint check — runs daily"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Subtask Targets</Label>
                      <div className="space-y-2">
                        {templateSubtargets.map((target, idx) => (
                          <div key={idx} className="flex gap-2 items-start">
                            <span className="mt-2 text-xs text-muted-foreground font-mono min-w-[1.5rem]">{idx + 1}.</span>
                            <Input
                              value={target}
                              onChange={(e) => {
                                const next = [...templateSubtargets]
                                next[idx] = e.target.value
                                setTemplateSubtargets(next)
                              }}
                              placeholder={idx === 0 ? "src/components" : "src/utils"}
                              className="font-mono text-sm flex-1"
                            />
                            {templateSubtargets.length > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 w-9 shrink-0"
                                onClick={() => setTemplateSubtargets(templateSubtargets.filter((_, i) => i !== idx))}
                              >
                                <X size={16} />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setTemplateSubtargets([...templateSubtargets, ""])}
                        className="gap-1 mt-1"
                      >
                        <Plus size={14} />
                        Add Target
                      </Button>
                    </div>

                    {/* ── Advanced Config ── */}
                    <div className="border-t border-border pt-4">
                      <details className="group">
                        <summary className="flex items-center gap-2 text-sm font-semibold cursor-pointer hover:text-foreground/80 list-none [&::-webkit-details-marker]:hidden">
                          <span className="inline-block transition-transform group-open:rotate-90 text-muted-foreground">▶</span>
                          Advanced Configuration
                        </summary>
                        <div className="mt-3 space-y-4">

                          {/* ── Prompt mode toggle ── */}
                          <div>
                            <Label className="text-xs font-semibold mb-2 block">Prompt Source</Label>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setTemplateAdvancedConfig(prev => ({ ...prev, useCustomPrompts: false, customSystemPrompt: undefined, customSynthesisPrompt: undefined }))}
                                className={`flex-1 text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${
                                  !templateAdvancedConfig.useCustomPrompts
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'bg-card text-muted-foreground border-border hover:border-primary/50'
                                }`}
                              >
                                Use Prompt Template
                              </button>
                              <button
                                type="button"
                                onClick={() => setTemplateAdvancedConfig(prev => ({ ...prev, useCustomPrompts: true }))}
                                className={`flex-1 text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${
                                  templateAdvancedConfig.useCustomPrompts
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'bg-card text-muted-foreground border-border hover:border-primary/50'
                                }`}
                              >
                                Custom Prompts
                              </button>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-1">
                              {templateAdvancedConfig.useCustomPrompts
                                ? 'Custom prompts below override the Prompt Template selection above.'
                                : 'Uses the Prompt Template selected above. No additional prompt configuration needed.'}
                            </p>
                          </div>

                          {/* ── Custom prompt editors ── */}
                          {templateAdvancedConfig.useCustomPrompts && (
                            <div className="space-y-3 pl-3 border-l-2 border-primary/30">
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <Label className="text-xs">System Prompt</Label>
                                  <span className="text-[10px] text-muted-foreground">Use {'{{target}}'} &amp; {'{{taskName}}'}</span>
                                </div>
                                <textarea
                                  value={templateAdvancedConfig.customSystemPrompt ?? ''}
                                  onChange={e => setTemplateAdvancedConfig(prev => ({ ...prev, customSystemPrompt: e.target.value }))}
                                  rows={8}
                                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs font-mono leading-relaxed resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                  placeholder="Enter the system prompt sent per subtask…"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <Label className="text-xs">Synthesis Prompt</Label>
                                  <span className="text-[10px] text-muted-foreground">Use {'{{reports}}'}</span>
                                </div>
                                <textarea
                                  value={templateAdvancedConfig.customSynthesisPrompt ?? ''}
                                  onChange={e => setTemplateAdvancedConfig(prev => ({ ...prev, customSynthesisPrompt: e.target.value }))}
                                  rows={6}
                                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs font-mono leading-relaxed resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                  placeholder="Enter the prompt for aggregating subtask reports…"
                                />
                              </div>
                            </div>
                          )}

                          {/* ── Divider ── */}
                          <div className="border-t border-border pt-3">
                            <p className="text-[11px] font-semibold text-muted-foreground mb-2">ChatInput Overrides</p>

                            {/* Model */}
                            <div className="flex gap-2 mb-3">
                              <div className="flex-1 space-y-1.5">
                                <Label className="text-xs">Model Provider ID</Label>
                                <Input
                                  value={templateAdvancedConfig.model?.providerID ?? ''}
                                  onChange={e => setTemplateAdvancedConfig(prev => ({ ...prev, model: { ...(prev.model ?? { providerID: '', modelID: '' }), providerID: e.target.value } }))}
                                  placeholder="anthropic"
                                  className="font-mono text-sm h-8"
                                />
                              </div>
                              <div className="flex-1 space-y-1.5">
                                <Label className="text-xs">Model ID</Label>
                                <Input
                                  value={templateAdvancedConfig.model?.modelID ?? ''}
                                  onChange={e => setTemplateAdvancedConfig(prev => ({ ...prev, model: { ...(prev.model ?? { providerID: '', modelID: '' }), modelID: e.target.value } }))}
                                  placeholder="claude-sonnet-4-20250514"
                                  className="font-mono text-sm h-8"
                                />
                              </div>
                            </div>

                            {/* Agent */}
                            <div className="space-y-1.5 mb-3">
                              <Label className="text-xs">Agent</Label>
                              <Input
                                value={templateAdvancedConfig.agent ?? ''}
                                onChange={e => setTemplateAdvancedConfig(prev => ({ ...prev, agent: e.target.value || undefined }))}
                                placeholder="build"
                                className="font-mono text-sm h-8"
                              />
                            </div>

                            {/* System (ChatInput-level override) */}
                            <div className="space-y-1.5 mb-3">
                              <Label className="text-xs">System (ChatInput-level)</Label>
                              <textarea
                                value={templateAdvancedConfig.system ?? ''}
                                onChange={e => setTemplateAdvancedConfig(prev => ({ ...prev, system: e.target.value || undefined }))}
                                rows={2}
                                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs font-mono leading-relaxed resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                placeholder="Sent as-is in the message body — different from the task prompt above"
                              />
                            </div>

                            {/* No Reply */}
                            <label className="flex items-center gap-2 cursor-pointer mb-3">
                              <input
                                type="checkbox"
                                checked={!!templateAdvancedConfig.noReply}
                                onChange={e => setTemplateAdvancedConfig(prev => ({ ...prev, noReply: e.target.checked || undefined }))}
                                className="rounded border-border"
                              />
                              <span className="text-xs font-medium">No Reply — skip waiting for AI response</span>
                            </label>

                            {/* Tools (JSON) */}
                            <div className="space-y-1.5">
                              <Label className="text-xs">Tools (JSON)</Label>
                              <textarea
                                value={templateAdvancedConfig.tools ? JSON.stringify(templateAdvancedConfig.tools, null, 2) : ''}
                                onChange={e => {
                                  const val = e.target.value.trim()
                                  if (!val) {
                                    setTemplateAdvancedConfig(prev => ({ ...prev, tools: undefined }))
                                    return
                                  }
                                  try {
                                    const parsed = JSON.parse(val)
                                    setTemplateAdvancedConfig(prev => ({ ...prev, tools: parsed }))
                                  } catch {
                                    // Don't update on invalid JSON
                                  }
                                }}
                                rows={4}
                                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs font-mono leading-relaxed resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                placeholder='[{"type": "function", "function": {"name": "myTool", "description": "…"}}]'
                              />
                            </div>

                            <p className="text-[11px] text-muted-foreground mt-3">
                              These fields are passed directly in the <code className="font-mono text-[11px]">POST /session/:id/message</code> body.
                            </p>
                          </div>
                        </div>
                      </details>
                    </div>

                    {/* Schedule config */}
                    <div className="border-t border-border pt-4">
                      <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <Clock size={15} />
                        Schedule
                      </h4>

                      <div className="space-y-3">
                        {/* Mode selector */}
                        <div className="flex gap-2">
                          {([
                            { value: 'manual', label: 'Manual' },
                            { value: 'interval', label: 'Interval' },
                            { value: 'daily', label: 'Daily' },
                            { value: 'weekly', label: 'Weekly' },
                          ] as { value: ScheduleMode; label: string }[]).map(opt => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setTemplateScheduleMode(opt.value)}
                              className={`flex-1 text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${
                                templateScheduleMode === opt.value
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-card text-muted-foreground border-border hover:border-primary/50'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>

                        {/* Interval config */}
                        {templateScheduleMode === 'interval' && (
                          <div className="flex items-center gap-3 pt-1">
                            <Label htmlFor="tpl-interval" className="shrink-0 text-sm">Every</Label>
                            <Input
                              id="tpl-interval"
                              type="number"
                              min={1}
                              value={templateScheduleInterval || ''}
                              onChange={(e) => setTemplateScheduleInterval(parseInt(e.target.value) || 0)}
                              placeholder="60"
                              className="w-24 font-mono"
                            />
                            <span className="text-sm text-muted-foreground">minutes</span>
                          </div>
                        )}

                        {/* Daily / Weekly time picker */}
                        {(templateScheduleMode === 'daily' || templateScheduleMode === 'weekly') && (
                          <div className="space-y-3 pt-1">
                            {templateScheduleMode === 'weekly' && (
                              <div className="flex items-center gap-2">
                                <Label className="text-sm shrink-0">On</Label>
                                <select
                                  value={templateScheduleDayOfWeek}
                                  onChange={(e) => setTemplateScheduleDayOfWeek(parseInt(e.target.value))}
                                  className="flex h-9 w-full rounded-lg border border-border bg-card px-3 py-1 text-sm font-mono shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                >
                                  {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, i) => (
                                    <option key={i} value={i}>{day}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <Label className="text-sm shrink-0">At</Label>
                              <Input
                                type="time"
                                value={templateScheduleTime}
                                onChange={(e) => setTemplateScheduleTime(e.target.value)}
                                className="w-32 font-mono"
                              />
                            </div>
                          </div>
                        )}

                        {/* Helper text */}
                        {templateScheduleMode === 'manual' && (
                          <p className="text-xs text-muted-foreground">This template will only run when triggered manually.</p>
                        )}
                        {templateScheduleMode === 'interval' && templateScheduleInterval > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Task will auto-trigger every {templateScheduleInterval} minute{templateScheduleInterval > 1 ? 's' : ''}.
                          </p>
                        )}
                        {templateScheduleMode === 'daily' && templateScheduleTime && (
                          <p className="text-xs text-muted-foreground">
                            Task will auto-trigger every day at {templateScheduleTime}.
                          </p>
                        )}
                        {templateScheduleMode === 'weekly' && templateScheduleTime && (
                          <p className="text-xs text-muted-foreground">
                            Task will auto-trigger every {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][templateScheduleDayOfWeek]} at {templateScheduleTime}.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => { setTemplateDialogOpen(false); resetTemplateForm() }}>
                      Cancel
                    </Button>
                    <Button onClick={saveTemplate}>
                      {editingTemplateId ? 'Update Template' : 'Create Template'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <TabsContent value="workers" className="mt-0">
            {(workers?.length || 0) === 0 ? (
              <div className="text-center py-16 px-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
                  <HardDrives size={32} className="text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No Workers Registered</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                  Add your first OpenCode Server worker to start distributing tasks across your infrastructure
                </p>
                <Button onClick={() => setWorkerDialogOpen(true)} className="gap-2">
                  <Plus size={18} weight="bold" />
                  Add First Worker
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {workers?.map(worker => (
                  <WorkerCard
                    key={worker.id}
                    worker={worker}
                    onDelete={deleteWorker}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="templates" className="mt-0">
            {(templates?.length || 0) === 0 ? (
              <div className="text-center py-16 px-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
                  <Clock size={32} className="text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No Templates Created</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                  Create reusable task templates that can be triggered manually or on a schedule
                </p>
                <Button onClick={() => { resetTemplateForm(); setTemplateDialogOpen(true) }} className="gap-2">
                  <Plus size={18} weight="bold" />
                  Create First Template
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates?.map(tpl => (
                  <TemplateCard
                    key={tpl.id}
                    template={tpl}
                    runs={taskRuns || []}
                    onEdit={openEditTemplate}
                    onDelete={deleteTemplate}
                    onTrigger={triggerTemplate}
                    onViewHistory={viewTemplateHistory}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="tasks" className="mt-0">
            {(tasks?.length || 0) === 0 ? (
              <div className="text-center py-16 px-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
                  <ListChecks size={32} className="text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No Tasks Created</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                  Create your first task to orchestrate code checks and analysis across your workers
                </p>
                <Button onClick={() => setTaskDialogOpen(true)} className="gap-2">
                  <Plus size={18} weight="bold" />
                  Create First Task
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {tasks?.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onStart={startTask}
                    onPause={pauseTask}
                    onCancel={cancelTask}
                    onViewDetails={viewTaskDetails}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Prompt Templates tab ── */}
          <TabsContent value="prompts" className="mt-0">
            {(promptTemplates?.length || 0) === 0 ? (
              <div className="text-center py-16 px-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
                  <Code size={32} className="text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Default Prompts Only</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                  Built-in prompt templates are always available. Clone one to create a custom template.
                </p>
                <div className="flex gap-3 justify-center">
                  {getBuiltinTemplates().map(bt => (
                    <Button key={bt.id} variant="outline" size="sm" className="gap-1.5" onClick={() => {
                      const clone = createPromptTemplate(bt.name + ' (Custom)', bt.taskType, bt.systemPrompt, bt.synthesisPrompt)
                      setPromptTemplates(prev => [...(prev || []), clone])
                      toast.success(`Cloned as "${clone.name}"`)
                    }}>
                      <CopySimple size={14} />
                      Clone {bt.taskType === 'code-check' ? 'Check' : bt.taskType === 'code-analysis' ? 'Analysis' : 'Custom'}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {allPromptTemplates.map(tmpl => (
                  <PromptTemplateCard
                    key={tmpl.id}
                    template={tmpl}
                    onUpdate={savePromptTemplate}
                    onDelete={deletePromptTemplate}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={!!detailsTaskId} onOpenChange={(open) => !open && setDetailsTaskId(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{selectedTask?.name}</DialogTitle>
            <DialogDescription>
              Workflow pipeline — task and subtask execution status
            </DialogDescription>
          </DialogHeader>
          {selectedTask && (
            <div className="py-4 max-h-[65vh] overflow-y-auto">

              {/* ── Pipeline header: task-level summary ── */}
              <div className="flex items-center gap-4 px-1 mb-6 text-sm">
                <StatusDot status={selectedTask.status} pulse={selectedTask.status === 'running' || selectedTask.status === 'synthesizing'} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold capitalize">{selectedTask.type}</span>
                    <span className="text-muted-foreground">·</span>
                    <StatusLabel status={selectedTask.status} />
                    <span className="text-muted-foreground">·</span>
                    <span className="font-mono text-xs text-muted-foreground">{selectedTask.subTasks.length} subtask{selectedTask.subTasks.length > 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden max-w-xs">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          selectedTask.status === 'completed' ? 'bg-green-500'
                          : selectedTask.status === 'failed' || selectedTask.status === 'cancelled' ? 'bg-red-500'
                          : 'bg-blue-500'
                        }`}
                        style={{ width: `${selectedTask.progress}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">{selectedTask.progress}%</span>
                  </div>
                </div>
                {selectedTask.description && (
                  <span className="text-xs text-muted-foreground max-w-[200px] truncate">{selectedTask.description}</span>
                )}
              </div>

              {/* ── Pipeline vertical timeline ── */}
              <div className="relative pl-9">
                {/* Vertical line */}
                <div className="absolute left-[13px] top-2 bottom-2 w-0.5 bg-border" />

                {/* Subtask nodes */}
                {selectedTask.subTasks.map((subtask, idx) => {
                  const isExpanded = expandedSubtasks.has(subtask.id)
                  const hasReport = !!subtask.report
                  const hasError = subtask.status === 'failed' && !!subtask.error
                  const hasLogs = subtask.logs && subtask.logs.length > 0
                  const canExpand = hasReport || hasError || hasLogs

                  return (
                    <div key={subtask.id} className="relative pb-4 last:pb-0">
                      {/* Timeline dot */}
                      <div className="absolute -left-[21px] top-3.5 flex items-center justify-center">
                        <StatusDot status={subtask.status} pulse={subtask.status === 'running'} size="md" />
                      </div>

                      {/* Connector line to content */}
                      <div className="pl-5">
                        {/* Subtask header — clickable to toggle details */}
                        <div
                          className={`flex items-center gap-2 py-2 px-3 rounded-lg border cursor-pointer select-none transition-colors ${
                            isExpanded ? 'border-border bg-card' : 'border-transparent hover:border-border hover:bg-card/50'
                          } ${subtask.status === 'failed' ? 'border-red-500/30' : ''}`}
                          onClick={() => canExpand && toggleSubtaskExpand(subtask.id)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-medium">{subtask.target}</span>
                              <StatusBadge status={subtask.status} />
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {subtask.name}
                              {subtask.workerId && (
                                <> · worker: <span className="font-mono">{subtask.workerId.slice(0, 8)}</span></>
                              )}
                              {subtask.startTime && subtask.endTime && (
                                <> · {(subtask.endTime - subtask.startTime) / 1000}s</>
                              )}
                            </div>
                          </div>
                          {canExpand && (
                            <CaretRight
                              size={14}
                              className={`text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                            />
                          )}
                        </div>

                        {/* ── Expanded details ── */}
                        {isExpanded && (
                          <div className="ml-3 mt-1 space-y-2 border-l-2 border-border/50 pl-4">
                            {/* Error */}
                            {hasError && (
                              <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                                <div className="text-xs font-semibold text-destructive mb-1">Error</div>
                                <pre className="text-xs text-destructive/80 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">{subtask.error}</pre>
                              </div>
                            )}

                            {/* Report */}
                            {hasReport && (
                              <div className="p-3 rounded-lg bg-card border">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="text-xs font-semibold text-muted-foreground">Report</div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-xs gap-1"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      const blob = new Blob([subtask.report ?? ''], { type: 'text/markdown' })
                                      const url = URL.createObjectURL(blob)
                                      const a = document.createElement('a')
                                      a.href = url
                                      a.download = `${selectedTask.name.replace(/[^a-zA-Z0-9]/g, '_')}-${subtask.target.replace(/[^a-zA-Z0-9]/g, '_')}.md`
                                      a.click()
                                      URL.revokeObjectURL(url)
                                    }}
                                  >
                                    <Download size={12} />
                                    .md
                                  </Button>
                                </div>
                                <div
                                  className="text-sm text-foreground/80 prose prose-sm dark:prose-invert max-w-none max-h-72 overflow-y-auto"
                                  dangerouslySetInnerHTML={{ __html: marked.parse(subtask.report!, { async: false }) as string }}
                                />
                              </div>
                            )}

                            {/* API Logs */}
                            {hasLogs && (
                              <div className="p-3 rounded-lg bg-card border">
                                <div className="text-xs font-semibold text-muted-foreground mb-1">API Logs</div>
                                <pre className="text-xs text-muted-foreground/70 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">{subtask.logs!.join('\n')}</pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* ── Synthesis node ── */}
                {selectedTask.status === 'synthesizing' && !selectedTask.taskReport && (
                  <div className="relative pb-4">
                    <div className="absolute -left-[21px] top-3.5">
                      <div className="relative flex h-3.5 w-3.5 items-center justify-center">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                      </div>
                    </div>
                    <div className="pl-5">
                      <div className="flex items-center gap-2 py-2 px-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
                        <span className="text-sm text-muted-foreground">Synthesizing full report from subtask results…</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Integrated report node ── */}
                {selectedTask.taskReport && (
                  <div className="relative pb-4">
                    <div className="absolute -left-[21px] top-3.5">
                      <div className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-green-500 shadow-sm" />
                    </div>
                    <div className="pl-5">
                      <div className="p-3 rounded-lg border bg-card border-green-500/20">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-green-600 dark:text-green-400">Integrated Report</span>
                            {selectedTask.status === 'completed' && (
                              <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Final</span>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs gap-1"
                              onClick={() => {
                                const blob = new Blob([selectedTask.taskReport ?? ''], { type: 'text/markdown' })
                                const url = URL.createObjectURL(blob)
                                const a = document.createElement('a')
                                a.href = url
                                a.download = `${selectedTask.name.replace(/[^a-zA-Z0-9]/g, '_')}-full-report.md`
                                a.click()
                                URL.revokeObjectURL(url)
                              }}
                            >
                              <Download size={12} />
                              Download
                            </Button>
                          </div>
                        </div>
                        <div
                          className="text-sm text-foreground/80 prose prose-sm dark:prose-invert max-w-none max-h-96 overflow-y-auto"
                          dangerouslySetInnerHTML={{ __html: marked.parse(selectedTask.taskReport, { async: false }) as string }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Template execution history dialog ── */}
      <Dialog open={!!detailTemplateId} onOpenChange={(open) => !open && setDetailTemplateId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedTemplate?.name ?? 'Template'} — Execution History</DialogTitle>
            <DialogDescription>
              All task runs triggered from this template
            </DialogDescription>
          </DialogHeader>
          {selectedTemplate && (
            <div className="py-4 max-h-[60vh] overflow-y-auto">
              {templateRuns.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No executions yet. Click "Run" to trigger the first one.
                </div>
              ) : (
                <div className="space-y-2">
                  {templateRuns.sort((a, b) => b.triggeredAt - a.triggeredAt).map(run => {
                    const linkedTask = tasks?.find(t => t.id === run.taskId)
                    return (
                      <div key={run.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                        <StatusDot status={run.status} pulse={run.status === 'running'} size="md" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <StatusBadge status={run.status} />
                            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              {run.triggerType}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {new Date(run.triggeredAt).toLocaleString()}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs shrink-0"
                          onClick={() => { setDetailTemplateId(null); setDetailsTaskId(run.taskId) }}
                        >
                          View Details
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <SettingsDialog
        open={settingsDialogOpen}
        onOpenChange={setSettingsDialogOpen}
        stats={{ workers: workers?.length ?? 0, tasks: tasks?.length ?? 0, templates: templates?.length ?? 0 }}
        workers={workers ?? []}
        onClearAllData={clearAllData}
      />
      <Toaster />
    </div>
  )
}

export default App
