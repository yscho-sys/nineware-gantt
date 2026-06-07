import { useCallback, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useTasks } from './lib/useTasks'
import { useTeams } from './lib/useTeams'
import { Sidebar } from './components/Sidebar'
import type { ViewMode } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { GanttChart } from './components/GanttChart'
import { BoardView } from './components/BoardView'
import { CalendarView } from './components/CalendarView'
import { ListView } from './components/ListView'
import { TaskEditPanel } from './components/TaskEditPanel'
import { TeamManager } from './components/TeamManager'
import { LinkManager } from './components/LinkManager'
import { ContextMenu } from './components/ContextMenu'
import { useTemplates } from './lib/useTemplates'
import { useLinks } from './lib/useLinks'
import { parseDate, addDays, toISODate, daysBetween } from './lib/dates'
import { STATUS_ORDER, STATUS_META, progressFromSteps } from './types'
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
  const { teams, colorOf, addTeam, renameTeam, removeTeam, setTeamColor, reorderTeams } =
    useTeams(onRename)
  const { templates, addTemplate } = useTemplates()
  const { links, addLink, updateLink, removeLink, reorderLinks } = useLinks()

  const [editing, setEditing] = useState<Editing | null>(null)
  const [menu, setMenu] = useState<{
    task: Task
    x: number
    y: number
    stepId?: string // 서브 태스크 막대 우클릭 시
    msDate?: string // 그 막대에서 우클릭한 위치의 날짜(마일스톤 추가용)
  } | null>(null)
  const [showTeams, setShowTeams] = useState(false)
  const [showLinks, setShowLinks] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set()) // 간트 내 접기
  const [hidden, setHidden] = useState<Set<string>>(new Set()) // 사이드바 눈: 팀 단위 타임라인 숨김
  const [hiddenTasks, setHiddenTasks] = useState<Set<string>>(new Set()) // 메인태스크 단위 숨김
  const [view, setView] = useState<ViewMode>('timeline')
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [sidebarOpen, setSidebarOpen] = useState(true) // 좌측 패널 여닫기

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

  const toggleHidden = useCallback(
    (team: string) =>
      setHidden((prev) => {
        const next = new Set(prev)
        if (next.has(team)) next.delete(team)
        else next.add(team)
        return next
      }),
    [],
  )

  // 메인태스크 단위 타임라인 숨김 토글
  const toggleHiddenTask = useCallback(
    (taskId: string) =>
      setHiddenTasks((prev) => {
        const next = new Set(prev)
        if (next.has(taskId)) next.delete(taskId)
        else next.add(taskId)
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
      const starts: number[] = []
      const dues: number[] = []
      for (const t of tasks) {
        starts.push(parseDate(t.start_date).getTime())
        dues.push(parseDate(t.due_date).getTime())
        for (const s of t.steps ?? []) {
          if (s.start_date) starts.push(parseDate(s.start_date).getTime())
          if (s.due_date) dues.push(parseDate(s.due_date).getTime())
        }
      }
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

  // 좌측 라벨 칸 폭을 가장 긴 태스크/팀명에 맞춰 자동 계산 (한글 기준 글자폭 추정)
  const labelWidth = useMemo(() => {
    let maxLen = 0
    for (const t of tasks) {
      maxLen = Math.max(maxLen, t.title.length, t.team.length)
    }
    // 제목 글자수 × 한글폭(13.5) + 들여쓰기·칩·아이콘 고정 여백(150)
    const w = Math.round(maxLen * 13.5 + 150)
    return Math.min(440, Math.max(220, w)) // 220~440px 사이로 클램프
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

  // 메인태스크 순서 변경(같은 팀 내 라벨 드래그) → sort_order 재할당해 저장
  const handleReorderTask = useCallback(
    (fromId: string, toId: string) => {
      if (fromId === toId) return
      const from = tasks.find((t) => t.id === fromId)
      const to = tasks.find((t) => t.id === toId)
      if (!from || !to || from.team !== to.team) return // 같은 팀 안에서만
      const teamTasks = tasks
        .filter((t) => t.team === from.team)
        .sort((a, b) => a.sort_order - b.sort_order)
      const fromIdx = teamTasks.findIndex((t) => t.id === fromId)
      const toIdx = teamTasks.findIndex((t) => t.id === toId)
      const [moved] = teamTasks.splice(fromIdx, 1)
      teamTasks.splice(toIdx, 0, moved)
      // 새 순서대로 sort_order 0,1,2… 재할당 후 변경된 것만 저장
      teamTasks.forEach((t, i) => {
        if (t.sort_order !== i) {
          const { id: _id, created_at: _c, updated_at: _u, ...rest } = t
          void editTask(t.id, { ...rest, sort_order: i })
        }
      })
    },
    [tasks, editTask],
  )

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

  // 행에서 서브 태스크 인라인 추가 → 즉시 저장 + 진행률 재계산 (상위 일정으로 기본 배치)
  const handleAddStep = useCallback(
    (task: Task, title: string) => {
      const step = {
        id: 'step-' + crypto.randomUUID(),
        title,
        url: '',
        done: false,
        weight: 1,
        start_date: task.start_date,
        due_date: task.due_date,
      }
      const steps = [...(task.steps ?? []), step]
      void editTask(task.id, {
        ...taskToDraft(task),
        steps,
        progress: task.status === 'done' ? 100 : progressFromSteps(steps),
      })
    },
    [editTask],
  )

  // 서브 태스크 막대 드래그 → 그 서브 태스크 일정만 변경
  const handleRescheduleStep = useCallback(
    (task: Task, stepId: string, startISO: string, dueISO: string) => {
      const steps = (task.steps ?? []).map((s) =>
        s.id === stepId ? { ...s, start_date: startISO, due_date: dueISO } : s,
      )
      void editTask(task.id, { ...taskToDraft(task), steps })
    },
    [editTask],
  )

  // 서브 태스크에 마일스톤(점) 추가 — 지정 날짜에 새 이정표
  const handleAddMilestone = useCallback(
    (task: Task, stepId: string, date: string) => {
      const title = prompt('마일스톤 이름', '')?.trim()
      if (!title) return
      const ms = { id: 'ms-' + crypto.randomUUID(), title, date }
      const steps = (task.steps ?? []).map((s) =>
        s.id === stepId ? { ...s, milestones: [...(s.milestones ?? []), ms] } : s,
      )
      void editTask(task.id, { ...taskToDraft(task), steps })
    },
    [editTask],
  )

  // 마일스톤 날짜 이동(점 드래그)
  const handleMoveMilestone = useCallback(
    (task: Task, stepId: string, milestoneId: string, date: string) => {
      const steps = (task.steps ?? []).map((s) =>
        s.id === stepId
          ? {
              ...s,
              milestones: (s.milestones ?? []).map((m) =>
                m.id === milestoneId ? { ...m, date } : m,
              ),
            }
          : s,
      )
      void editTask(task.id, { ...taskToDraft(task), steps })
    },
    [editTask],
  )

  // 마일스톤 완료 토글(점 클릭) — 기한 지나도 완료 처리하면 경고 해제
  const handleToggleMilestone = useCallback(
    (task: Task, stepId: string, milestoneId: string) => {
      const steps = (task.steps ?? []).map((s) =>
        s.id === stepId
          ? {
              ...s,
              milestones: (s.milestones ?? []).map((m) =>
                m.id === milestoneId ? { ...m, done: !m.done } : m,
              ),
            }
          : s,
      )
      void editTask(task.id, { ...taskToDraft(task), steps })
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

  // 보기별 표시 대상 (숨긴 팀 제외)
  const boardTasks = tasks.filter((t) => !hidden.has(t.team)) // 보드: 모든 상태
  const listTasks = filteredTasks.filter((t) => !hidden.has(t.team)) // 목록: 상태 필터 반영

  return (
    <div
      className={'app' + (sidebarOpen ? '' : ' sidebar-collapsed')}
      style={{ '--label-w': `${labelWidth}px` } as CSSProperties}
    >
      <Sidebar
        teams={teams}
        taskCounts={taskCounts}
        hidden={hidden}
        colorOf={colorOf}
        links={links}
        demoMode={demoMode}
        onNewTask={() => setEditing({ task: null })}
        onToggleHidden={toggleHidden}
        onManageTeams={() => setShowTeams(true)}
        onManageLinks={() => setShowLinks(true)}
      />

      <main className="main">
        <header className="main-header">
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? '좌측 패널 접기' : '좌측 패널 펼치기'}
            aria-label={sidebarOpen ? '좌측 패널 접기' : '좌측 패널 펼치기'}
          >
            {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>
          <div className="header-brand">
            <img src="/logo-wh.svg" alt="NINEWARE" className="brand-logo" />
            <span className="brand-sub">업무진행 통합 대시보드</span>
          </div>
          <div className="spacer" />
          {/* 보기 전환 세그먼트 (타임라인/보드/목록) — 중앙寄り */}
          <div className="seg-toggle">
            {([
              { key: 'timeline', label: '타임라인' },
              { key: 'calendar', label: '달력' },
              { key: 'board', label: '보드' },
              { key: 'list', label: '목록' },
            ] as { key: ViewMode; label: string }[]).map((v) => (
              <button
                key={v.key}
                className={'seg-btn' + (view === v.key ? ' active' : '')}
                onClick={() => setView(v.key)}
              >
                {v.label}
              </button>
            ))}
          </div>
          <div className="spacer" />
          {/* 보드 보기에선 필터 숨기되 공간은 유지(visibility) → 보기 세그먼트 위치 고정 */}
          <div className="seg-toggle" style={{ visibility: view === 'board' ? 'hidden' : 'visible' }}>
            {filterChips.map((c) => (
              <button
                key={c.key}
                className={'seg-btn' + (filter === c.key ? ' active' : '')}
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

          {loading ? (
            <div className="empty-state">불러오는 중…</div>
          ) : tasks.length === 0 ? (
            <div className="empty-state">
              아직 등록된 태스크가 없습니다.
              <br />
              왼쪽 <b>＋ 새 태스크</b> 버튼으로 추가해 보세요.
            </div>
          ) : view === 'calendar' ? (
            <CalendarView
              tasks={boardTasks}
              today={today}
              onSelect={(task) => setEditing({ task })}
            />
          ) : view === 'board' ? (
            <BoardView
              tasks={boardTasks}
              colorOf={colorOf}
              onSelect={(task) => setEditing({ task })}
              onContextMenu={(task, x, y) => setMenu({ task, x, y })}
              onSetStatus={handleSetStatus}
            />
          ) : view === 'list' ? (
            <ListView
              tasks={listTasks}
              today={today}
              colorOf={colorOf}
              onSelect={(task) => setEditing({ task })}
              onContextMenu={(task, x, y) => setMenu({ task, x, y })}
            />
          ) : filteredTasks.length === 0 ? (
            <div className="empty-state">해당 조건의 태스크가 없습니다.</div>
          ) : (
            <GanttChart
              tasks={filteredTasks}
              teams={teams}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              today={today}
              selectedId={editing?.task?.id ?? null}
              collapsed={collapsed}
              hidden={hidden}
              hiddenTasks={hiddenTasks}
              colorOf={colorOf}
              onToggleTeam={toggleTeam}
              onToggleHiddenTask={toggleHiddenTask}
              onReorderTask={handleReorderTask}
              onSelect={(task) => setEditing({ task })}
              onReschedule={handleReschedule}
              onRescheduleStep={handleRescheduleStep}
              onTaskContextMenu={(task, x, y) => setMenu({ task, x, y })}
              onStepContextMenu={(task, stepId, date, x, y) =>
                setMenu({ task, x, y, stepId, msDate: date })
              }
              onMoveMilestone={handleMoveMilestone}
              onToggleMilestone={handleToggleMilestone}
              onCreateNew={() => setEditing({ task: null })}
              onAddStep={handleAddStep}
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
          milestoneDate={menu.stepId ? menu.msDate : undefined}
          milestones={
            menu.stepId
              ? menu.task.steps?.find((s) => s.id === menu.stepId)?.milestones
              : undefined
          }
          onToggleMilestone={
            menu.stepId
              ? (msId) => handleToggleMilestone(menu.task, menu.stepId!, msId)
              : undefined
          }
          onAddMilestone={
            menu.stepId && menu.msDate
              ? () => {
                  handleAddMilestone(menu.task, menu.stepId!, menu.msDate!)
                  setMenu(null)
                }
              : undefined
          }
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
          onReorder={reorderTeams}
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
