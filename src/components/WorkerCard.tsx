import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StatusIndicator } from "@/components/StatusIndicator"
import { HardDrives, Trash } from "@phosphor-icons/react"
import type { Worker } from "@/types"
import { calculateWorkerStatus } from "@/lib/task-utils"
import { Progress } from "@/components/ui/progress"

interface WorkerCardProps {
  worker: Worker
  onDelete: (id: string) => void
}

export function WorkerCard({ worker, onDelete }: WorkerCardProps) {
  const status = calculateWorkerStatus(worker)
  const loadPercentage = (worker.currentTasks / worker.maxConcurrency) * 100

  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <HardDrives size={24} className="text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-base">{worker.name}</h3>
            <div className="flex items-center gap-2">
              <code className="text-sm text-muted-foreground font-mono">
                {worker.host}:{worker.port}
              </code>
              {worker.version && (
                <span className="text-[10px] text-muted-foreground/60 bg-muted/50 px-1.5 py-0.5 rounded font-mono">
                  v{worker.version}
                </span>
              )}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(worker.id)}
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <Trash size={18} />
        </Button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Status</span>
          <StatusIndicator status={status} showPulse={status === 'busy'} />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Load</span>
            <code className="font-mono">
              {worker.currentTasks}/{worker.maxConcurrency}
            </code>
          </div>
          <Progress value={loadPercentage} className="h-1.5" />
        </div>
      </div>
    </Card>
  )
}
