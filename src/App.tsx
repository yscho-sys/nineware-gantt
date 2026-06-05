import { useCallback, useMemo, useState } from 'react'
import { useTasks } from './lib/useTasks'
import { useTeams } from './lib/useTeams'
import { Sidebar } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { ProjectSummary } from './components/ProjectSummary'
import { GanttChart } from './components/GanttChart'
import { TaskEditPanel } from './components/TaskEditPanel'
import { TeamManager } from './components/TeamManager'
import { LinkManager } from './components/LinkManager'
import { ContextMenu } from './components/ContextMenu'
import { useTemplates } from './lib/useTemplates'
import { useLinks } from './lib/useLinks'
import { parseDate, addDays, toISODate, daysBetween } from './lib/dates'
import { STATUS_ORDER, STATUS_META } from './types'
import type { Task, TaskDraft, TaskStatus } from './types'

// 편집 패널 상태: 신규 생성 시 팀/시작일 미리채움 지원
interface Editing {
  task: Task | null
  team?: string
  start?: string
}

type StatusFilter = 'all' | TaskStatus | 'overdue'

export default function App() {
  const { tasks, loading, error, demoMode, addTask, editTask, removeTask, renameTeamInTasks } =
    useTasks()
  const onRename = useCallback(
    (oldName: string, newName: string) => void renameTeamInTasks(oldName, newName),
    [renameTeamInTasks],
  )
  const { teams, colorOf, addTeam, renameTeam, removeTeam, setTeamColor } = useTeams(onRename)
  const { templates, addTemplate } = useTemplates()
  const { links, addLink, updateLink, removeLink, reorderLinks } = useLinks()

  const [editing, setEditing] = useState<Editing | null>(null)
  const [menu, setMenu] = useState<{ task: Task; x: number; y: number } | null>(null)
  const [showTeams, setShowTeams] = useState(false)
  const [showLinks, setShowLinks] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<StatusFilter>('all')

  const today = useMemo(() => {
    const n = new Date()
    return new Date(n.getFullYear(), n.getMonth(), n.getDate())
  }, [])

  const toggleTeam = useCallback(
    (team: string) =>
      setCollapsed((prev) => {
        const next = new Set(prev)
        if (next.has(team)) next.delete(team)
        else next.add(team)
        return next
      }),
    [],
  )

  // 상태 필터 적용 (요약 카드는 전체 기준, 간트만 필터)
  const filteredTasks = useMemo(() => {
    if (filter === 'all') return tasks
    if (filter === 'overdue')
      return tasks.filter(
        (t) => t.status !== 'done' && daysBetween(today, parseDate(t.due_date)) < 0,
      )
    return tasks.filter((t) => t.status === filter)
  }, [tasks, filter, today])

  const { rangeStart, rangeEnd } = useMemo(() => {
    let min = today
    let max = addDays(today, 30)
    if (tasks.length > 0) {
      const starts = tasks.map((t) => parseDate(t.start_date).getTime())
      const dues = tasks.map((t) => parseDate(t.due_date).getTime())
      min = new Date(Math.min(...starts, today.getTime()))
      max = new Date(Math.max(...dues, today.getTime()))
    }
    return { rangeStart: addDays(min, -3), rangeEnd: addDays(max, 4) }
  }, [tasks, today])

  const projects = useMemo(
    () => [...new Set(tasks.map((t) => t.project).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko')),
    [tasks],
  )

  const taskCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const t of tasks) m[t.team] = (m[t.team] ?? 0) + 1
    return m
  }, [tasks])

  async function handleSave(draft: TaskDraft) {
    if (editing?.task) await editTask(editing.task.id, draft)
    else await addTask(draft)
  }

  // 간트에서 막대를 드래그하면 시작/목표일만 갱신
  const handleReschedule = useCallback(
    (task: Task, startISO: string, dueISO: string) => {
      const { id: _id, created_at: _c, updated_at: _u, ...rest } = task
      void editTask(task.id, { ...rest, start_date: startISO, due_date: dueISO })
    },
    [editTask],
  )

  // 빈 공간 클릭 → 해당 팀/날짜로 새 태스크
  const handleCreateAt = useCallback((team: string, startISO: string) => {
    setEditing({ task: null, team, start: startISO })
  }, [])

  function taskToDraft(task: Task): TaskDraft {
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = task
    return rest
  }

  // 컨텍스트 메뉴 동작
  const handleDuplicate = useCallback(
    (task: Task) => {
      void addTask({
        ...taskToDraft(task),
        title: task.title + ' (복사)',
        steps: task.steps.map((s) => ({ ...s })),
      })
      setMenu(null)
    },
    [addTask],
  )

  const handleSetStatus = useCallback(
    (task: Task, status: TaskStatus) => {
      void editTask(task.id, {
        ...taskToDraft(task),
        status,
        progress: status === 'done' ? 100 : task.progress,
      })
      setMenu(null)
    },
    [editTask],
  )

  const handleMenuDelete = useCallback(
    (task: Task) => {
      if (confirm(`'${task.title}' 태스크를 삭제할까요?`)) void removeTask(task.id)
      setMenu(null)
    },
    [removeTask],
  )

  const filterChips: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: '전체' },
    ...STATUS_ORDER.map((s) => ({ key: s as StatusFilter, label: STATUS_META[s].label })),
    { key: 'overdue', label: '지연' },
  ]

  return (
    <div className="app">
      <Sidebar
        teams={teams}
        taskCounts={taskCounts}
        collapsed={collapsed}
        colorOf={colorOf}
        links={links}
        onNewTask={() => setEditing({ task: null })}
        onToggleTeam={toggleTeam}
        onManageTeams={() => setShowTeams(true)}
        onManageLinks={() => setShowLinks(true)}
      />

      <main className="main">
        <header className="main-header">
          {demoMode && <span className="demo-badge">데모 모드 (Supabase 미연결)</span>}
          <div className="spacer" />
          <div className="filter-chips">
            {filterChips.map((c) => (
              <button
                key={c.key}
                className={'chip' + (filter === c.key ? ' active' : '')}
                onClick={() => setFilter(c.key)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </header>

        <div className="main-body">
          {error && (
            <div className="error-banner">데이터를 불러오지 못했습니다: {error}</div>
          )}

          <StatusBar tasks={tasks} today={today} />

          <ProjectSummary tasks={tasks} today={today} />

          {loading ? (
            <div className="empty-state">불러오는 중…</div>
          ) : tasks.length === 0 ? (
            <div className="empty-state">
              아직 등록된 태스크가 없습니다.
              <br />
              왼쪽 <b>＋ 새 태스크</b> 버튼으로 추가해 보세요.
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="empty-state">해당 조건의 태스크가 없습니다.</div>
          ) : (
            <GanttChart
              tasks={filteredTasks}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              today={today}
              selectedId={editing?.task?.id ?? null}
              collapsed={collapsed}
              colorOf={colorOf}
              onToggleTeam={toggleTeam}
              onSelect={(task) => setEditing({ task })}
              onReschedule={handleReschedule}
              onTaskContextMenu={(task, x, y) => setMenu({ task, x, y })}
              onCreateAt={handleCreateAt}
            />
          )}
        </div>
      </main>

      {editing && (
        <TaskEditPanel
          task={editing.task}
          isNew={!editing.task}
          teams={teams}
          projects={projects}
          defaultStart={editing.start ?? toISODate(today)}
          defaultDue={toISODate(addDays(parseDate(editing.start ?? toISODate(today)), 14))}
          defaultTeam={editing.team}
          templates={templates}
          onSave={handleSave}
          onDelete={removeTask}
          onSaveTemplate={addTemplate}
          onClose={() => setEditing(null)}
        />
      )}

      {menu && (
        <ContextMenu
          task={menu.task}
          x={menu.x}
          y={menu.y}
          onEdit={(task) => {
            setEditing({ task })
            setMenu(null)
          }}
          onDuplicate={handleDuplicate}
          onDelete={handleMenuDelete}
          onSetStatus={handleSetStatus}
          onClose={() => setMenu(null)}
        />
      )}

      {showTeams && (
        <TeamManager
          teams={teams}
          taskCounts={taskCounts}
          colorOf={colorOf}
          onAdd={addTeam}
          onRename={renameTeam}
          onRemove={removeTeam}
          onSetColor={setTeamColor}
          onClose={() => setShowTeams(false)}
        />
      )}

      {showLinks && (
        <LinkManager
          links={links}
          onAdd={addLink}
          onUpdate={updateLink}
          onRemove={removeLink}
          onReorder={reorderLinks}
          onClose={() => setShowLinks(false)}
        />
      )}
    </div>
  )
}
