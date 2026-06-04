import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { SealCheck, CopySimple, PencilSimple, Trash, Code } from "@phosphor-icons/react"
import type { PromptTemplate, TaskType } from "@/types"
import { isBuiltinId } from "@/lib/prompt-templates"

interface PromptTemplateCardProps {
  template: PromptTemplate
  onUpdate: (t: PromptTemplate) => void
  onDelete: (id: string) => void
}

export function PromptTemplateCard({ template, onUpdate, onDelete }: PromptTemplateCardProps) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(template.name)
  const [editSystemPrompt, setEditSystemPrompt] = useState(template.systemPrompt)
  const [editSynthesisPrompt, setEditSynthesisPrompt] = useState(template.synthesisPrompt)

  const builtin = isBuiltinId(template.id)

  const typeLabels: Record<TaskType, string> = {
    'code-check': 'Code Check',
    'code-analysis': 'Code Analysis',
    'code-generation': 'Code Generation',
    'custom': 'Custom',
  }

  const handleSave = () => {
    if (!editName.trim()) return
    onUpdate({
      ...template,
      name: editName.trim(),
      systemPrompt: editSystemPrompt,
      synthesisPrompt: editSynthesisPrompt,
    })
    setEditing(false)
  }

  return (
    <>
      <Card className={`p-4 hover:shadow-md transition-shadow ${builtin ? 'border-primary/20' : ''}`}>
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${builtin ? 'bg-amber-500/10' : 'bg-blue-500/10'}`}>
              {builtin
                ? <SealCheck size={22} className="text-amber-500" />
                : <Code size={22} className="text-blue-500" />
              }
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-base">{template.name}</h3>
                {builtin && (
                  <span className="text-[9px] uppercase tracking-wider font-semibold bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded">
                    Built-in
                  </span>
                )}
              </div>
              <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {typeLabels[template.taskType] ?? template.taskType}
              </span>
            </div>
          </div>
          {!builtin && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(template.id)}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash size={18} />
            </Button>
          )}
        </div>

        {/* Prompt previews */}
        <div className="space-y-2 text-xs mt-3">
          <div>
            <div className="text-muted-foreground font-medium mb-0.5">System prompt:</div>
            <pre className="bg-muted/40 p-2 rounded font-mono text-[11px] leading-relaxed whitespace-pre-wrap max-h-20 overflow-y-auto">
              {template.systemPrompt.slice(0, 300)}{template.systemPrompt.length > 300 ? '…' : ''}
            </pre>
          </div>
          <div>
            <div className="text-muted-foreground font-medium mb-0.5">Synthesis prompt:</div>
            <pre className="bg-muted/40 p-2 rounded font-mono text-[11px] leading-relaxed whitespace-pre-wrap max-h-16 overflow-y-auto">
              {template.synthesisPrompt.slice(0, 200)}{template.synthesisPrompt.length > 200 ? '…' : ''}
            </pre>
          </div>
        </div>

        <div className="flex gap-2 mt-3">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setEditName(template.name); setEditSystemPrompt(template.systemPrompt); setEditSynthesisPrompt(template.synthesisPrompt); setEditing(true) }}>
            <PencilSimple size={14} />
            Edit
          </Button>
          {builtin && (
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => onDelete(template.id)} title="Clone as custom template">
              <CopySimple size={14} />
              Clone
            </Button>
          )}
        </div>
      </Card>

      {/* Edit dialog */}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {builtin ? <SealCheck size={18} className="text-amber-500" /> : <Code size={18} />}
              {builtin ? 'Clone Built-in Template' : 'Edit Prompt Template'}
            </DialogTitle>
            <DialogDescription>
              Customise the prompts sent to workers for this task type.
              Use <code className="font-mono text-[11px] bg-muted px-1 rounded">{'{{target}}'}</code> for the subtask target,
              <code className="font-mono text-[11px] bg-muted px-1 rounded">{'{{taskName}}'}</code> for the task name, and
              <code className="font-mono text-[11px] bg-muted px-1 rounded">{'{{reports}}'}</code> (synthesis only) for subtask reports.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Template Name</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="My Code Check" className="font-mono text-sm h-9" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Task Type</Label>
              <div className="text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded font-medium">
                {typeLabels[template.taskType] ?? template.taskType}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">System Prompt</Label>
                <span className="text-[10px] text-muted-foreground">Sent per subtask</span>
              </div>
              <Textarea
                value={editSystemPrompt}
                onChange={e => setEditSystemPrompt(e.target.value)}
                rows={12}
                className="font-mono text-xs leading-relaxed"
                placeholder="Enter the prompt sent to the worker for each subtask…"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Synthesis Prompt</Label>
                <span className="text-[10px] text-muted-foreground">Used to aggregate subtask reports</span>
              </div>
              <Textarea
                value={editSynthesisPrompt}
                onChange={e => setEditSynthesisPrompt(e.target.value)}
                rows={10}
                className="font-mono text-xs leading-relaxed"
                placeholder="Enter the prompt for aggregating subtask results into an integrated report…"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            <Button onClick={handleSave}>{builtin ? 'Clone & Save' : 'Save'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
