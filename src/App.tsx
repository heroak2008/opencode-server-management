import { useState } from "react"
import { useKV } from "@github/spark/hooks"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { WorkerCard } from "@/components/WorkerCard"
import { TaskCard } from "@/components/TaskCard"
import { StatusIndicator } from "@/components/StatusIndicator"
import { Plus, HardDrives, ListChecks, ChartLine } from "@phosphor-icons/react"
import type { Worker, Task, SubTask, TaskType } from "@/types"
import { validateWorkerConnection, calculateTaskProgress, updateTaskStatus } from "@/lib/task-utils"
import { toast } from "sonner"
import { v4 as uuidv4 } from "uuid"

function App() {
  const [workers, setWorkers] = useKV<Worker[]>("workers", [])
  const [tasks, setTasks] = useKV<Task[]>("tasks", [])
  const [activeTab, setActiveTab] = useState("workers")

  const [workerDialogOpen, setWorkerDialogOpen] = useState(false)
  const [workerName, setWorkerName] = useState("")
  const [workerHost, setWorkerHost] = useState("")
  const [workerPort, setWorkerPort] = useState("")

  const [taskDialogOpen, setTaskDialogOpen] = useState(false)
  const [taskName, setTaskName] = useState("")
  const [taskType, setTaskType] = useState<TaskType>("code-check")
  const [taskDescription, setTaskDescription] = useState("")
  const [taskConcurrency, setTaskConcurrency] = useState("2")
  const [taskTargets, setTaskTargets] = useState("")

  const [detailsTaskId, setDetailsTaskId] = useState<string | null>(null)

  const addWorker = () => {
    const port = parseInt(workerPort)
    
    if (!workerName.trim()) {
      toast.error("Worker name is required")
      return
    }
    
    if (!validateWorkerConnection(workerHost, port)) {
      toast.error("Invalid host or port")
      return
    }

    const newWorker: Worker = {
      id: uuidv4(),
      name: workerName,
      host: workerHost,
      port,
      status: 'idle',
      currentTasks: 0,
      maxConcurrency: 3,
      lastHeartbeat: Date.now(),
      createdAt: Date.now(),
    }

    setWorkers((current) => [...(current || []), newWorker])
    toast.success(`Worker "${workerName}" added successfully`)
    
    setWorkerName("")
    setWorkerHost("")
    setWorkerPort("")
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

    if (!taskTargets.trim()) {
      toast.error("At least one target is required")
      return
    }

    const targets = taskTargets.split('\n').filter(t => t.trim())
    const concurrency = parseInt(taskConcurrency) || 2

    const subTasks: SubTask[] = targets.map((target, index) => ({
      id: uuidv4(),
      name: `Subtask ${index + 1}`,
      target: target.trim(),
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
      maxConcurrency: concurrency,
      assignedWorkers: [],
      createdAt: Date.now(),
      progress: 0,
    }

    setTasks((current) => [...(current || []), newTask])
    toast.success(`Task "${taskName}" created`)
    
    setTaskName("")
    setTaskDescription("")
    setTaskTargets("")
    setTaskConcurrency("2")
    setTaskDialogOpen(false)
  }

  const startTask = (id: string) => {
    setTasks((current) =>
      (current || []).map(task => {
        if (task.id === id) {
          const updatedSubTasks = task.subTasks.map((st, idx) => ({
            ...st,
            status: idx === 0 ? 'running' : 'queued',
            startTime: idx === 0 ? Date.now() : undefined,
          } as SubTask))
          
          return {
            ...task,
            status: 'running',
            startedAt: Date.now(),
            subTasks: updatedSubTasks,
          }
        }
        return task
      })
    )
    toast.success("Task started")
  }

  const pauseTask = (id: string) => {
    setTasks((current) =>
      (current || []).map(task => {
        if (task.id === id) {
          const updatedSubTasks = task.subTasks.map(st => ({
            ...st,
            status: st.status === 'running' ? 'paused' : st.status,
          } as SubTask))
          
          return {
            ...task,
            status: 'paused',
            subTasks: updatedSubTasks,
          }
        }
        return task
      })
    )
    toast.info("Task paused")
  }

  const cancelTask = (id: string) => {
    setTasks((current) =>
      (current || []).map(task => {
        if (task.id === id) {
          return {
            ...task,
            status: 'cancelled',
            subTasks: task.subTasks.map(st => ({
              ...st,
              status: st.status === 'completed' ? 'completed' : 'cancelled',
            } as SubTask)),
          }
        }
        return task
      })
    )
    toast.warning("Task cancelled")
  }

  const viewTaskDetails = (id: string) => {
    setDetailsTaskId(id)
  }

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
            <div className="flex items-center gap-6">
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
              <TabsTrigger value="tasks" className="gap-2">
                <ListChecks size={18} />
                Tasks
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
                <DialogContent>
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
                        placeholder="8080"
                        className="font-mono"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setWorkerDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={addWorker}>Add Worker</Button>
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
                          <SelectItem value="custom">Custom</SelectItem>
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
                      <Label htmlFor="task-concurrency">Max Concurrency</Label>
                      <Input
                        id="task-concurrency"
                        type="number"
                        value={taskConcurrency}
                        onChange={(e) => setTaskConcurrency(e.target.value)}
                        placeholder="2"
                        min="1"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="task-targets">Targets (one per line)</Label>
                      <Textarea
                        id="task-targets"
                        value={taskTargets}
                        onChange={(e) => setTaskTargets(e.target.value)}
                        placeholder="src/components&#10;src/utils&#10;src/lib"
                        rows={6}
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        Each line becomes a subtask (directory, file, or custom target)
                      </p>
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
        </Tabs>
      </div>

      <Dialog open={!!detailsTaskId} onOpenChange={(open) => !open && setDetailsTaskId(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selectedTask?.name}</DialogTitle>
            <DialogDescription>
              Task details and subtask execution status
            </DialogDescription>
          </DialogHeader>
          {selectedTask && (
            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Status</span>
                  <div className="mt-1">
                    <StatusIndicator status={selectedTask.status} showPulse />
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Type</span>
                  <div className="mt-1 uppercase tracking-wide font-medium">{selectedTask.type}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Progress</span>
                  <div className="mt-1 font-mono font-semibold">{selectedTask.progress}%</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Subtasks</span>
                  <div className="mt-1 font-mono">{selectedTask.subTasks.length} total</div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Subtasks</h4>
                <div className="space-y-2">
                  {selectedTask.subTasks.map((subtask) => (
                    <div key={subtask.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                      <div className="flex-1">
                        <div className="font-mono text-sm">{subtask.target}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{subtask.name}</div>
                      </div>
                      <StatusIndicator status={subtask.status} showPulse={subtask.status === 'running'} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default App
