import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ListChecks, Clock, Play, Trash, PencilSimple, ClockCounterClockwise, PencilLine } from "@phosphor-icons/react"
import type { Template, TaskRun } from "@/types"

interface TemplateCardProps {
  template: Template
  runs: TaskRun[]
  onEdit: (tpl: Template) => void
  onDelete: (id: string) => void
  onTrigger: (tpl: Template) => void
  onViewHistory: (tpl: Template) => void
}

export function TemplateCard({ template, runs, onEdit, onDelete, onTrigger, onViewHistory }: TemplateCardProps) {
  const runCount = runs.filter(r => r.templateId === template.id).length
  const lastRun = template.lastTriggeredAt
    ? new Date(template.lastTriggeredAt).toLocaleString()
    : 'Never'

  const typeLabels: Record<string, string> = {
    'code-check': 'Code Check',
    'code-analysis': 'Code Analysis',
    'code-generation': 'Code Generation',
    'custom': 'Custom',
  }

  const scheduleLabel = (): string => {
    if (template.scheduleMode === 'manual' || !template.scheduleEnabled) return 'Manual only'
    switch (template.scheduleMode) {
      case 'interval':
        return `Every ${template.scheduleInterval} min`
      case 'daily':
        return `Daily at ${template.scheduleTime}`
      case 'weekly':
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        return `Weekly ${days[template.scheduleDayOfWeek] ?? '?'} at ${template.scheduleTime}`
      default:
        return 'Manual only'
    }
  }

  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-violet-500/10 rounded-lg">
            <ListChecks size={24} className="text-violet-500" />
          </div>
          <div>
            <h3 className="font-semibold text-base">{template.name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {typeLabels[template.type] ?? template.type}
              </span>
              {template.scheduleEnabled && template.scheduleMode !== 'manual' && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                  <Clock size={10} />
                  {scheduleLabel()}
                </span>
              )}
              {template.advancedConfig?.useCustomPrompts && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded">
                  <PencilLine size={10} />
                  Custom prompts
                </span>
              )}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(template.id)}
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <Trash size={18} />
        </Button>
      </div>

      {/* Subtargets */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {template.subtargets.map((t, i) => (
          <code key={i} className="text-xs bg-muted/50 px-1.5 py-0.5 rounded font-mono">{t}</code>
        ))}
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
        <span>{runCount} execution{runCount !== 1 ? 's' : ''}</span>
        <span>·</span>
        <span>Last: {lastRun}</span>
        {template.description && (
          <>
            <span>·</span>
            <span className="truncate max-w-[120px]">{template.description}</span>
          </>
        )}
      </div>

      <div className="flex gap-2">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => onViewHistory(template)}>
          <ClockCounterClockwise size={14} />
          History
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onEdit(template)}>
          <PencilSimple size={14} />
          Edit
        </Button>
        <Button size="sm" className="gap-1.5" onClick={() => onTrigger(template)}>
          <Play size={14} weight="fill" />
          Run
        </Button>
      </div>
    </Card>
  )
}
