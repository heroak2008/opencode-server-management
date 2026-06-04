import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Gear, Database, HardDrives, Clock, PlugsConnected, CheckCircle, XCircle } from "@phosphor-icons/react"
import { getStorageMode, setStorageMode, storageModeLabels, engineLabels, engineDefaultPorts, getDatabaseConfig, setDatabaseConfig, buildConnectionString, type StorageMode } from "@/lib/storage"
import { testDatabaseConnection } from "@/lib/db-service"
import type { Worker, DatabaseConfig, DatabaseEngine } from "@/types"

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  stats: {
    workers: number
    tasks: number
    templates: number
  }
  workers: Worker[]
  onClearAllData: () => void
}

export function SettingsDialog({ open, onOpenChange, stats, workers, onClearAllData }: SettingsDialogProps) {
  const [currentMode, setCurrentMode] = useState<StorageMode>(getStorageMode)
  const [pendingMode, setPendingMode] = useState<StorageMode>(currentMode)
  const [confirmClear, setConfirmClear] = useState(false)

  // Database config form state
  const [dbConfig, setDbConfig] = useState<DatabaseConfig>(getDatabaseConfig)
  const [testingDb, setTestingDb] = useState(false)
  const [dbTestResult, setDbTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  // Sync dbConfig when dialog opens
  useEffect(() => {
    if (open) {
      setDbConfig(getDatabaseConfig())
      setDbTestResult(null)
      setCurrentMode(getStorageMode())
      setPendingMode(getStorageMode())
    }
  }, [open])

  const updateDbConfig = (patch: Partial<DatabaseConfig>) => {
    setDbConfig(prev => ({ ...prev, ...patch }))
    setDbTestResult(null)
  }

  const handleEngineChange = (engine: DatabaseEngine) => {
    const defaults: Record<DatabaseEngine, Partial<DatabaseConfig>> = {
      mongodb: { host: 'localhost', port: 27017, database: 'opencode_manager', mongoUri: '' },
      postgresql: { host: 'localhost', port: 5432, database: 'opencode_manager', mongoUri: '' },
      sqlite: { host: '', port: 0, database: '', mongoUri: '', filePath: 'opencode_manager.db' },
    }
    setDbConfig(prev => ({ ...prev, ...defaults[engine], engine }))
    setDbTestResult(null)
  }

  const handleTestConnection = async () => {
    // Pick first idle worker to test through
    const idleWorkers = workers.filter(w => w.status !== 'offline')
    if (idleWorkers.length === 0) {
      toast.error('No workers available to test the connection')
      return
    }
    setTestingDb(true)
    setDbTestResult(null)

    try {
      const result = await testDatabaseConnection(idleWorkers[0], dbConfig)
      if (result.success) {
        setDbTestResult({
          ok: true,
          msg: `Connected (${result.latencyMs}ms)${result.version ? ' — v' + result.version : ''}`,
        })
        updateDbConfig({ connected: true, lastTested: Date.now() })
      } else {
        setDbTestResult({ ok: false, msg: result.error ?? 'Connection failed' })
        updateDbConfig({ connected: false })
      }
    } catch (err: any) {
      setDbTestResult({ ok: false, msg: err?.message ?? String(err) })
    } finally {
      setTestingDb(false)
    }
  }

  const handleApply = () => {
    const oldMode = currentMode
    const newMode = pendingMode

    // Same mode — save DB config if database, otherwise close
    if (newMode === oldMode) {
      if (newMode === 'database') {
        setDatabaseConfig(dbConfig)
        toast.success('Database configuration saved')
      }
      onOpenChange(false)
      return
    }

    // Switching modes
    if (newMode === 'memory') {
      const ok = window.confirm(
        'Switching to Memory Cache will clear all persisted data.\n' +
        'Data currently stored in ' + storageModeLabels[oldMode].label + ' will be lost.\n\n' +
        'Are you sure you want to continue?'
      )
      if (!ok) return
    }

    // Save database config before switching away
    if (newMode === 'database' || oldMode === 'database') {
      setDatabaseConfig(dbConfig)
    }

    setStorageMode(newMode)
    setCurrentMode(newMode)
    toast.info(`Switched to ${storageModeLabels[newMode].label}. Reloading…`)
    setTimeout(() => window.location.reload(), 800)
  }

  const modeOptions: { value: StorageMode; icon: React.ReactNode }[] = [
    { value: 'indexedDB', icon: <Database size={18} /> },
    { value: 'localStorage', icon: <HardDrives size={18} /> },
    { value: 'memory', icon: <Clock size={18} /> },
    { value: 'database', icon: <PlugsConnected size={18} /> },
  ]

  const engines: DatabaseEngine[] = ['mongodb', 'postgresql', 'sqlite']

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gear size={20} />
            Settings
          </DialogTitle>
          <DialogDescription>
            Application configuration and persistence backend
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4 max-h-[65vh] overflow-y-auto">
          {/* ── Persistence backend ── */}
          <div>
            <h4 className="text-sm font-semibold mb-3">Persistence Backend</h4>
            <div className="grid grid-cols-2 gap-2">
              {modeOptions.map(({ value, icon }) => {
                const info = storageModeLabels[value]
                const isActive = pendingMode === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPendingMode(value)}
                    className={`text-left flex items-start gap-2.5 p-3 rounded-lg border transition-colors ${
                      isActive
                        ? 'bg-primary/10 border-primary/40 ring-1 ring-primary/20'
                        : 'bg-card border-border hover:border-primary/30'
                    }`}
                  >
                    <span className={`mt-0.5 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>{icon}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold ${isActive ? 'text-primary' : ''}`}>{info.label}</span>
                        {isActive && (
                          <span className="text-[9px] uppercase tracking-wider font-semibold bg-primary/20 text-primary px-1 py-0.5 rounded shrink-0">Active</span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{info.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Database connection config ── */}
          {(pendingMode === 'database') && (
            <div className="border-t border-border pt-4 space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <PlugsConnected size={15} />
                Database Connection
              </h4>

              {/* Engine selector */}
              <div className="flex gap-2">
                {engines.map(eng => (
                  <button
                    key={eng}
                    type="button"
                    onClick={() => handleEngineChange(eng)}
                    className={`flex-1 text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${
                      dbConfig.engine === eng
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card text-muted-foreground border-border hover:border-primary/50'
                    }`}
                  >
                    {engineLabels[eng]}
                  </button>
                ))}
              </div>

              {/* MongoDB fields */}
              {dbConfig.engine === 'mongodb' && (
                <div className="space-y-2.5">
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-xs">Host</Label>
                      <Input value={dbConfig.host ?? ''} onChange={e => updateDbConfig({ host: e.target.value })} placeholder="localhost" className="font-mono text-sm h-8" />
                    </div>
                    <div className="w-24 space-y-1.5">
                      <Label className="text-xs">Port</Label>
                      <Input value={dbConfig.port ?? 27017} onChange={e => updateDbConfig({ port: parseInt(e.target.value) || 27017 })} type="number" className="font-mono text-sm h-8" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-xs">Database</Label>
                      <Input value={dbConfig.database ?? ''} onChange={e => updateDbConfig({ database: e.target.value })} placeholder="opencode_manager" className="font-mono text-sm h-8" />
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-xs">Username (optional)</Label>
                      <Input value={dbConfig.username ?? ''} onChange={e => updateDbConfig({ username: e.target.value })} placeholder="admin" className="font-mono text-sm h-8" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-xs">Password (optional)</Label>
                      <Input value={dbConfig.password ?? ''} onChange={e => updateDbConfig({ password: e.target.value })} type="password" placeholder="********" className="font-mono text-sm h-8" />
                    </div>
                    <div className="flex items-end pb-1.5">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={!!dbConfig.ssl} onChange={e => updateDbConfig({ ssl: e.target.checked })} className="rounded border-border" />
                        <span className="text-xs text-muted-foreground">SSL</span>
                      </label>
                    </div>
                  </div>
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer hover:text-foreground">Connection string</summary>
                    <code className="block mt-1 p-2 bg-muted/50 rounded font-mono text-[11px] break-all">{buildConnectionString(dbConfig)}</code>
                  </details>
                </div>
              )}

              {/* PostgreSQL fields */}
              {dbConfig.engine === 'postgresql' && (
                <div className="space-y-2.5">
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-xs">Host</Label>
                      <Input value={dbConfig.host ?? ''} onChange={e => updateDbConfig({ host: e.target.value })} placeholder="localhost" className="font-mono text-sm h-8" />
                    </div>
                    <div className="w-24 space-y-1.5">
                      <Label className="text-xs">Port</Label>
                      <Input value={dbConfig.port ?? 5432} onChange={e => updateDbConfig({ port: parseInt(e.target.value) || 5432 })} type="number" className="font-mono text-sm h-8" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-xs">Database</Label>
                      <Input value={dbConfig.database ?? ''} onChange={e => updateDbConfig({ database: e.target.value })} placeholder="opencode_manager" className="font-mono text-sm h-8" />
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-xs">Username (optional)</Label>
                      <Input value={dbConfig.username ?? ''} onChange={e => updateDbConfig({ username: e.target.value })} placeholder="postgres" className="font-mono text-sm h-8" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-xs">Password (optional)</Label>
                      <Input value={dbConfig.password ?? ''} onChange={e => updateDbConfig({ password: e.target.value })} type="password" placeholder="********" className="font-mono text-sm h-8" />
                    </div>
                    <div className="flex items-end pb-1.5">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={!!dbConfig.ssl} onChange={e => updateDbConfig({ ssl: e.target.checked })} className="rounded border-border" />
                        <span className="text-xs text-muted-foreground">SSL</span>
                      </label>
                    </div>
                  </div>
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer hover:text-foreground">Connection string</summary>
                    <code className="block mt-1 p-2 bg-muted/50 rounded font-mono text-[11px] break-all">{buildConnectionString(dbConfig)}</code>
                  </details>
                </div>
              )}

              {/* SQLite fields */}
              {dbConfig.engine === 'sqlite' && (
                <div className="space-y-2.5">
                  <div className="space-y-1.5">
                    <Label className="text-xs">File path (on worker machine)</Label>
                    <Input value={dbConfig.filePath ?? ''} onChange={e => updateDbConfig({ filePath: e.target.value })} placeholder="/data/opencode_manager.db" className="font-mono text-sm h-8" />
                    <p className="text-[11px] text-muted-foreground">Path to the SQLite database file on the worker machine.</p>
                  </div>
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer hover:text-foreground">Connection string</summary>
                    <code className="block mt-1 p-2 bg-muted/50 rounded font-mono text-[11px] break-all">{buildConnectionString(dbConfig)}</code>
                  </details>
                </div>
              )}

              {/* Test connection */}
              <div className="flex items-center gap-3 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={testingDb}
                  className="gap-1.5 h-8"
                >
                  {testingDb ? 'Testing…' : 'Test Connection'}
                </Button>

                {dbTestResult && (
                  <span className={`flex items-center gap-1.5 text-xs font-medium ${dbTestResult.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {dbTestResult.ok ? <CheckCircle size={14} weight="fill" /> : <XCircle size={14} weight="fill" />}
                    {dbTestResult.msg}
                  </span>
                )}
              </div>

              <p className="text-[11px] text-muted-foreground">
                Connection is tested through an available worker using <code className="font-mono text-[11px] text-foreground/60">{dbConfig.engine === 'mongodb' ? 'mongosh' : dbConfig.engine === 'postgresql' ? 'psql' : 'sqlite3'}</code>.
              </p>
            </div>
          )}

          {/* ── Data summary ── */}
          <div className="border-t border-border pt-4">
            <h4 className="text-sm font-semibold mb-3">Data Summary</h4>
            <div className="grid grid-cols-3 gap-3 text-center text-sm">
              <div className="p-3 rounded-lg bg-muted/30 border border-border">
                <div className="font-mono font-bold text-lg">{stats.workers}</div>
                <div className="text-xs text-muted-foreground">Workers</div>
              </div>
              <div className="p-3 rounded-lg bg-muted/30 border border-border">
                <div className="font-mono font-bold text-lg">{stats.tasks}</div>
                <div className="text-xs text-muted-foreground">Tasks</div>
              </div>
              <div className="p-3 rounded-lg bg-muted/30 border border-border">
                <div className="font-mono font-bold text-lg">{stats.templates}</div>
                <div className="text-xs text-muted-foreground">Templates</div>
              </div>
            </div>
          </div>

          {/* ── Danger zone ── */}
          <div className="border-t border-border pt-4">
            <h4 className="text-sm font-semibold text-destructive mb-3">Danger Zone</h4>
            {!confirmClear ? (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive/40 hover:bg-destructive/10 gap-1.5"
                onClick={() => setConfirmClear(true)}
              >
                Clear All Data
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-destructive font-medium">Are you sure?</span>
                <Button variant="destructive" size="sm" onClick={() => { onClearAllData(); setConfirmClear(false); toast.success('All data cleared') }}>
                  Yes, clear everything
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmClear(false)}>Cancel</Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              This will delete all workers, tasks, templates, and execution records from the current storage backend.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleApply}>
            {pendingMode !== currentMode ? 'Switch & Reload' : pendingMode === 'database' ? 'Save DB Config' : 'Close'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
