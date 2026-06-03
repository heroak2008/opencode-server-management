import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { WorkerStatus, TaskStatus } from "@/types"

interface StatusIndicatorProps {
  status: WorkerStatus | TaskStatus
  showPulse?: boolean
  className?: string
}

export function StatusIndicator({ status, showPulse = false, className }: StatusIndicatorProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'online':
      case 'completed':
        return { color: 'bg-success text-success-foreground', label: status }
      case 'running':
      case 'busy':
        return { color: 'bg-warning text-warning-foreground', label: status, pulse: true }
      case 'offline':
      case 'failed':
      case 'cancelled':
        return { color: 'bg-destructive text-destructive-foreground', label: status }
      case 'idle':
      case 'queued':
      case 'paused':
        return { color: 'bg-idle text-idle-foreground', label: status }
      default:
        return { color: 'bg-muted text-muted-foreground', label: status }
    }
  }

  const config = getStatusConfig()
  const shouldPulse = showPulse && config.pulse

  return (
    <Badge className={cn(config.color, "flex items-center gap-1.5", className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full bg-current", shouldPulse && "pulse-glow")} />
      {config.label}
    </Badge>
  )
}
