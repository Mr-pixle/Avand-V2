import {newId} from '@/lib/id'
import {PROJECT_NODE_LABELS, acceptsProjectParent, type ProjectNodeChoice} from '@/lib/projectNodes'
import { useState } from 'react'
import { toast } from 'sonner'
import { useStore, statusesFor } from '@/lib/store'
import { guard } from '@/lib/policy'
import { WORK_SCOPES, SCOPE_FA, managedScopes } from '@/lib/organization'
import { PROJECT_STAGES, STAGE_FA } from '@/lib/projectProgress'
import type { Task, WorkScope, ProjectStage } from '@/lib/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Button } from './ui/button'

export function ManualProjectTaskDialog({ projectId, onOpenChange }: { projectId: string; onOpenChange: (o: boolean) => void }) {
  const { state, me, can, dispatch, activeUsers } = useStore()
  const project = state.projects.find((p) => p.id === projectId)
  const scopes = can.perm('plan.all') || (!project?.staffing && can.createProjectTask(projectId)) ? WORK_SCOPES : managedScopes(project, me.id)
  const [name, setName] = useState('')
  const [kind,setKind]=useState<ProjectNodeChoice>('manual')
  const [scope, setScope] = useState<WorkScope>(scopes[0] ?? 'phase1')
  const [stage, setStage] = useState<ProjectStage | ''>('')
  const [parent, setParent] = useState('')
  const [assignee, setAssignee] = useState('')
  const candidate: Task = { id: 'draft', projectId, parentId: parent || null, name, kind: kind==='subtask'?'manual':kind, source: 'manual', order: 99999, workScope: scope, projectStage: stage || undefined }
  const users = activeUsers.filter((u) => can.assignTo(candidate, { kind: 'user', id: u.id }))
  const nodes = Object.values(state.tasks).filter(t=>t.projectId===projectId&&!t.removedFromMdr&&acceptsProjectParent(kind,t)&&can.viewTask(t))
  const structural=kind==='phase'||kind==='stage'||kind==='doctype'
  const save = () => {
    if (!structural&&!stage) { toast.error("Choose the architectural stage."); return }
    const task = { ...candidate, id: `M-${newId()}`, name: name.trim(), assigneeUserId: structural?undefined:assignee || undefined, statusId: structural?undefined:statusesFor(state, candidate)[0].id }
    const action = { type: 'addTask', task } as const
    const error = guard(state, action)
    if (error) { toast.error(error); return }
    dispatch(action); dispatch({ type: 'openTask', id: task.id }); onOpenChange(false)
  }
  const css = 'mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm'
  return <Dialog open onOpenChange={onOpenChange}><DialogContent dir="ltr"><DialogHeader className="text-start"><DialogTitle>Definition of structure and comfort</DialogTitle><DialogDescription>Choose the level, responsible phase and parent. Phase, stage and Doc Type progression are calculated from sub-sections.</DialogDescription></DialogHeader>
    <div><Label htmlFor="mt-kind">Item Type</Label><select id="mt-kind" className={css} value={kind} onChange={e=>{setKind(e.target.value as ProjectNodeChoice);setParent('');setAssignee('')}}>{Object.entries(PROJECT_NODE_LABELS).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></div>
    <div><Label htmlFor="mt-name">Task Name</Label><Input id="mt-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
    <div><Label htmlFor="mt-scope">Responsible Phase</Label><select id="mt-scope" className={css} value={scope} onChange={(e) => { setScope(e.target.value as WorkScope); setAssignee('') }}>{scopes.map((s) => <option key={s} value={s}>{SCOPE_FA[s]}</option>)}</select></div>
    <div><Label htmlFor="mt-stage">Stage of architecture</Label><select id="mt-stage" className={css} value={stage} onChange={(e) => setStage(e.target.value as ProjectStage)}><option value="" disabled>Select stage</option>{PROJECT_STAGES.map((s) => <option key={s} value={s}>{STAGE_FA[s]}</option>)}</select></div>
    {!structural&&<div><Label htmlFor="mt-assignee">Task Force</Label><select id="mt-assignee" className={css} value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">No allocation</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>}
    <div><Label htmlFor="mt-parent">Location in Project Tree</Label><select id="mt-parent" className={css} value={parent} onChange={(e) => setParent(e.target.value)}><option value="">{acceptsProjectParent(kind,undefined)?"Project Root":"The choice of parents is mandatory"}</option>{nodes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
    <DialogFooter><Button onClick={save}>Construction and opening</Button><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button></DialogFooter>
  </DialogContent></Dialog>
}
