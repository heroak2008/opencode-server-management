import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StatusIndicator } from "@/components/StatusIndicator"
import { Progress } from "@/components/ui/progress"
import { Play, Pause, X, ListBullets } from "@phosphor-icons/react"
import type { Task } from "@/types"
import { formatTimestamp } from "@/lib/task-utils"

interface TaskCardProps {
  task: Task
  onStart: (id: string) => void
  onPause: (id: string) => void
  onCancel: (id: string) => void
  onViewDetails: (id: string) => void
}

export function TaskCard({ task, onStart, onPause, onCancel, onViewDetails }: TaskCardProps) {
  const canStart = task.status === 'queued' || task.status === 'paused'
  const canPause = task.status === 'running'
  const canCancel = task.status === 'running' || task.status === 'queued' || task.status === 'paused'

  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-base">{task.name}</h3>
              <StatusIndicator status={task.status} showPulse={task.status === 'running'} />
            </div>
            {task.description && (
              <p className="text-sm text-muted-foreground">{task.description}</p>
            )}
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span className="uppercase tracking-wide font-medium">{task.type}</span>
              <code className="font-mono">{task.subTasks.length} subtasks</code>
              <span>{formatTimestamp(task.createdAt)}</span>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <code className="font-mono font-medium">{task.progress}%</code>
          </div>
          <Progress value={task.progress} className="h-2" />
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onViewDetails(task.id)}
            className="gap-1.5"
          >
            <ListBullets size={16} />
            Details
          </Button>
          
          {canStart && (
            <Button
              size="sm"
              onClick={() => onStart(task.id)}
              className="gap-1.5"
            >
              <Play size={16} weight="fill" />
              Start
            </Button>
          )}
          
          {canPause && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onPause(task.id)}
              className="gap-1.5"
            >
              <Pause size={16} weight="fill" />
              Pause
            </Button>
          )}
          
          {canCancel && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onCancel(task.id)}
              className="gap-1.5"
            >
              <X size={16} weight="bold" />
              Cancel
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}
