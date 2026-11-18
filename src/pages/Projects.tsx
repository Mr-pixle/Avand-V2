import { projectTypeLabel } from '@/lib/displayLabels'
import { ProjectCover } from '@/components/ProjectCover'
import { taskScope } from '@/lib/organization'
import { canViewBoard } from '@/lib/whiteboards'
import { TeamName } from '@/components/ItemIcon'
import {teamOutline} from '@/lib/brand'
import {projectProgressStyle} from '@/lib/brand'
import { MindMapView } from '@/components/MindMap'
import { projectProgress, taskStage } from '@/lib/projectProgress'
import { ProjectStages, StageSummary } from '@/components/ProjectStages'
import { ManualProjectTaskDialog } from '@/components/ManualProjectTaskDialog'
import { lazy, Suspense, useMemo, useState } from 'react'
import { ArrowLeft, FileSpreadsheet, Plus, RefreshCw } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { useFmt, useStore } from '@/lib/store'
import { navigationSelection } from '@/lib/navigation'
import { cn } from '@/lib/utils'
import { TaskViews, TreeView } from '@/components/TaskViews'
import { Empty, PageHeader, ProgressRing, Segmented, TitleBlock } from '@/components/common'
import { runManualSync } from './SyncRuns'
import { SupervisionPanel } from '@/components/FlowViews'
import { MdrButton, useMdrShortcut } from '@/components/MdrLink'
import { ProjectEditor, ProjectResponsibilities } from '@/components/ProjectEditor'

export function useProjectProgress() {
  const { state } = useStore()
  return (pid: string) => {
    const result = projectProgress(state, pid)
    return { ...result, total: result.total ?? 0 }
  }
}

const Whiteboards = lazy(() => import('@/components/Whiteboards'))

export function Projects() {
  const store = useStore()
  const { state, dispatch, teamById, workItems, can } = store
  const { n, time } = useFmt()
  const progress = useProjectProgress()
  const { value: mode, onChange: setMode } = navigationSelection(state.nav, dispatch, 'tab', 'cards', ['cards', 'tree'])
  const [newOpen, setNewOpen] = useState(false)
  const pending = (pid: string) => state.syncItems.filter((x) => x.projectId === pid && x.state === 'pending').length

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Projects" title="Active Projects" actions={
        <>
          <Segmented value={mode} onChange={setMode} options={[{ value: 'cards', label: 'List' }, { value: 'tree', label: 'All WBS' }]} />
          {can.perm('project.define') && can.perm('project.create') && <Button onClick={() => setNewOpen(true)}><Plus className="h-4 w-4" /> New Project</Button>}
        </>
      }>
        {n(state.projects.length)} projects · Stage progress is calculated from its tasks. A dash indicates that no tasks have been assigned to the stage.
      </PageHeader>

      {mode === 'tree' ? <TreeView tasks={workItems} depth={1} /> : (
        <div className="overflow-hidden glass-card">
          {state.projects.map((p) => {
            const pr = progress(p.id)
            const docs = workItems.filter((t) => t.projectId === p.id)
            const un = docs.filter((t) => !t.assigneeUserId && !t.assigneeTeamId).length
            const pend = pending(p.id)
            return (
              <button key={p.id} onClick={() => dispatch({ type: 'nav', nav: { page: 'project', projectId: p.id } })}
                className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 border-b px-4 py-4 text-start last:border-0 hover:bg-foreground/[0.035] xl:grid-cols-[auto_minmax(0,1fr)_minmax(300px,1.5fr)_auto]">
                <ProjectCover image={p.coverImage} className="w-20 rounded-lg sm:w-28" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><span className="mono text-[11.5px] text-muted-foreground">{p.code}</span><span className="text-[11.5px] text-muted-foreground">{projectTypeLabel(p.type)}</span></div>
                  <div className="flex items-center gap-2"><span className="truncate text-[15px] font-bold">{p.name}</span><ProgressRing project value={pr.total} size={30} stroke={2.5} /></div>
                  <div className="text-[12px] text-muted-foreground"><TeamName team={teamById[p.phase1TeamId]} /> / <TeamName team={teamById[p.phase2TeamId]} /></div>
                </div>
                <div className="col-span-2 flex flex-col gap-1.5 xl:col-span-1">
                  <StageSummary projectId={p.id} />
                </div>
                <div className="col-span-2 grid grid-cols-3 gap-2 text-[12px] md:col-span-1">
                  <div><div className="eyebrow">Document</div><div className="num font-semibold">{n(docs.length)}</div></div>
                  <div><div className="eyebrow">Unassigned</div><div className="num font-semibold">{n(un)}</div></div>
                  {can.control ? <div><div className="eyebrow">Sync Review</div><div className={pend ? 'num font-semibold text-azure' : 'num font-semibold'}>{n(pend)}</div></div>
                    : <div><div className="eyebrow">Completed</div><div className="num font-semibold">{n(docs.filter((t) => t.actualFinish).length)}</div></div>}
                </div>
                <div className="col-span-2 flex items-center gap-1.5 text-[11.5px] text-muted-foreground md:col-span-1">
                  <FileSpreadsheet className="h-3.5 w-3.5" /> {p.lastSync ? time(p.lastSync) : 'Never synced'}
                </div>
              </button>
            )
          })}
        </div>
      )}
      <NewProjectDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  )
}

export function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return open ? <ProjectEditor open={open} onOpenChange={onOpenChange} /> : null
}

export function ProjectPage({ projectId }: { projectId: string }) {
  const store = useStore()
  const { state, dispatch, projectById, teamById, workItems, teamOf, can, me } = store
  const { n, time, pct } = useFmt()
  const p = projectById[projectId]
  const progress = useProjectProgress()
  const [manualOpen, setManualOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [selectedStage, setSelectedStage] = useState('all')
  const tasks = useMemo(() => workItems.filter((t) => t.projectId === projectId && (selectedStage === 'all' || (selectedStage === 'unclassified' ? !taskStage(state.tasks, t) : taskStage(state.tasks, t) === selectedStage))), [workItems, projectId, selectedStage, state.tasks])
  useMdrShortcut(p)
  if (!p) return <Empty title="Project not found" hint="Select a project from the Projects list." />
  const pr = progress(p.id)
  const teamTabs = [...new Set(['ctl', 'rd', 'int', 'prs', 'ren', p.phase1TeamId, p.phase2TeamId, ...(p.teamIds ?? [])])].filter((id) => teamById[id] && teamById[id].kind !== 'management')
  const pool = tasks.filter((t) => !t.assigneeUserId && !t.assigneeTeamId)
  const pend = state.syncItems.filter((x) => x.projectId === p.id && x.state === 'pending').length
  const syncing = state.syncRuns.some((r) => r.state === 'running' && (r.projectId === p.id || r.projectId === 'all'))
  const supOpen = Object.values(state.tasks).filter((t) => t.kind === 'supervision' && t.projectId === p.id && t.flow !== 'closed').length
  const supTasks = Object.values(state.tasks).filter((t) => t.kind === 'supervision' && t.projectId === p.id && can.viewTask(t))
  const supGantt = supTasks.length ? { key: 'sup', label: 'Site Supervision', tasks: supTasks } : undefined
  const showWhiteboard = canViewBoard(state, me, p.id)
  const showSupervision = can.viewSupervision(p.id)
  const showPool = can.createProjectTask(p.id)
  const tabs = navigationSelection(state.nav, dispatch, 'tab', 'wbs', [
    'wbs', 'mindmap', ...teamTabs,
    ...(showWhiteboard ? ['whiteboard'] : []),
    ...(showSupervision ? ['sup'] : []),
    ...(showPool ? ['pool'] : []),
  ])
  return (
    <div className="flex flex-col gap-5">
      <div>
        <button className="mb-3 inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground" onClick={() => dispatch({ type: 'nav', nav: { page: 'projects' } })}>
          <ArrowLeft className="h-3.5 w-3.5" /> Projects
        </button>
        <PageHeader eyebrow={`${p.code}, ${projectTypeLabel(p.type)}`} title={p.name} actions={(
          <>
            <MdrButton project={p} />
            {can.perm('project.define') && can.perm('project.edit') && <Button variant="outline" onClick={() => setEditOpen(true)}>Details and Responsibilities</Button>}
            {can.syncProject(p.id) && <Button variant="outline" onClick={() => runManualSync(store, p.id)} disabled={syncing} aria-busy={syncing}><RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} /> {syncing ? 'Syncing…' : 'MDR Sync'}</Button>}
            {showPool && <Button onClick={() => setManualOpen(true)}><Plus className="h-4 w-4" /> New Manual Task</Button>}
          </>
        )} />
      </div>
      <TitleBlock cells={[
        { label: 'Progress by Assigned Stage', value: <span className="num" style={projectProgressStyle(pr.total)}>{pct(pr.total)}</span> },
        { label: 'Project Manager', value: p.managerId ? store.userById[p.managerId]?.name : '—' },
        { label: 'CD', value: <TeamName team={teamById[p.phase1TeamId]} /> },
        { label: 'DD', value: <TeamName team={teamById[p.phase2TeamId]} /> },
        { label: 'MDR / Tab', value: `${p.mdrTab}`, mono: true },
        { label: 'Last Sync', value: p.lastSync ? time(p.lastSync) : '—' },
        can.control
          ? { label: 'Pending Sync Review', value: pend ? <button className="num text-azure hover:underline" onClick={() => dispatch({ type: 'nav', nav: { page: 'review' } })}>{n(pend)} rows</button> : <span className="num">{n(0)}</span> }
          : { label: 'Project Tasks', value: <span className="num">{n(tasks.length)}</span> },
      ]} />
      <ProjectResponsibilities project={p} />
      <ProjectStages projectId={p.id} selected={selectedStage} onSelect={setSelectedStage} />
      {editOpen && <ProjectEditor project={p} open onOpenChange={setEditOpen} />}
      <Tabs value={tabs.value} onValueChange={tabs.onChange} dir="ltr">
        <div className="scroll-x thin-scroll -mx-1 px-1">
          <TabsList className="h-auto w-max justify-start gap-0.5">
            {showWhiteboard && <TabsTrigger value="whiteboard">Whiteboard</TabsTrigger>}
            <TabsTrigger value="mindmap">Mind Map</TabsTrigger>
            <TabsTrigger value="wbs" className="text-[13px]">WBS</TabsTrigger>
            {teamTabs.map((id) => <TabsTrigger key={id} value={id} style={teamOutline(teamById[id])} className="team-tab text-[13px]"><TeamName team={teamById[id]} label={id === p.phase1TeamId ? 'CD' : id === p.phase2TeamId ? (teamById[id]?.kind === 'revit' ? 'DD / Revit' : 'DD') : undefined} /></TabsTrigger>)}
            {showSupervision && <TabsTrigger value="sup" style={teamOutline(teamById.sup)} className="team-tab text-[13px]"><TeamName team={teamById.sup} label="CA" />{supOpen > 0 && <span className="num ms-1.5 rounded-full bg-azure px-1.5 text-[10.5px] font-semibold text-azure-foreground">{n(supOpen)}</span>}</TabsTrigger>}
            {showPool && <TabsTrigger value="pool" className="text-[13px]">Unassigned <span className="num ms-1.5 text-[11px] text-muted-foreground">{n(pool.length)}</span></TabsTrigger>}
          </TabsList>
        </div>
        {showWhiteboard && <TabsContent value="whiteboard"><Suspense fallback={<p role="status">Loading whiteboard…</p>}><Whiteboards projectId={p.id} /></Suspense></TabsContent>}
        <TabsContent value="mindmap"><MindMapView key={p.id} projectId={p.id} /></TabsContent>
        <TabsContent value="wbs" className="mt-4">
          <TaskViews tasks={tasks} structuralTasks={Object.values(state.tasks).filter(t=>t.projectId===p.id&&t.source==='manual'&&['phase','stage','doctype'].includes(t.kind)&&!t.removedFromMdr&&can.viewTask(t))} idPrefix={`p-${p.id}-wbs`} defaultView="tree" hideProject treeDepth={4} ganttExtras={supGantt} />
        </TabsContent>
        {teamTabs.map((id) => {
          const list = tasks.filter((t) => {
            const scope = taskScope(state.tasks, t)
            const team = teamOf(t)
            if (scope === 'phase2' && team && ['phase2', 'revit'].includes(teamById[team]?.kind)) return id === p.phase2TeamId
            return team === id
          })
          return (
            <TabsContent key={id} value={id} className="mt-4">
              {list.length ? <TaskViews tasks={list} colorTeamId={id} idPrefix={`p-${p.id}-${id}`} defaultView="kanban" hideProject hideTeam treeDepth={4} />
                : <Empty title={`Team ${teamById[id]?.name} has no assigned tasks on this project.`} hint="Teams can see work assigned to them and their members." />}
            </TabsContent>
          )
        })}
        {showSupervision && (
          <TabsContent value="sup" className="mt-4"><SupervisionPanel projectId={p.id} /></TabsContent>
        )}
        {showPool && (
          <TabsContent value="pool" className="mt-4">
            {pool.length ? <TaskViews tasks={pool} idPrefix={`p-${p.id}-pool`} defaultView="list" hideProject treeDepth={4} />
              : <Empty title="All tasks in this project have been assigned." />}
          </TabsContent>
        )}
      </Tabs>
      {manualOpen && <ManualProjectTaskDialog projectId={p.id} onOpenChange={setManualOpen} />}
    </div>
  )
}
