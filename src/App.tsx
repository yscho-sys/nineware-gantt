import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { PanelLeftClose, PanelLeftOpen, LogOut, Undo2, Redo2, History } from 'lucide-react'
import { useAuth } from './lib/auth'
import { LoginScreen } from './components/LoginScreen'
import { MemberManager } from './components/MemberManager'
import { VersionPanel } from './components/VersionPanel'
import { useMembers } from './lib/useMembers'
import {
  roleOf,
  canManageMembers,
  canCreate,
  canEditTask,
  canViewTask,
  canGrantTask,
  isAdminEmail,
} from './lib/permits'
import { PermitProvider, type PermitValue } from './lib/permit'
import { ROLE_LABELS } from './types'
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
import type { Task, TaskDraft, TaskStatus, TaskStep } from './types'

// 편집 패널 상태: 신규 생성 시 팀/시작일 미리채움 지원
interface Editing {
  task: Task | null
  team?: string
  start?: string
}

type StatusFilter = 'all' | TaskStatus | 'overdue'

export default function App() {
  const { user, loading: authLoading, configured, logout } = useAuth()
  const { members, addMember, updateMember, removeMember } = useMembers()
  const {
    tasks,
    loading,
    error,
    demoMode,
    canUndo,
    canRedo,
    addTask,
    editTask,
    removeTask,
    renameTeamInTasks,
    replaceTasks,
    undo,
    redo,
  } = useTasks()

  // 내 역할/권한. 데모 모드(비로그인 로컬)는 전체 권한(admin)으로 취급.
  //  보기/수정 게이팅은 태스크의 view_emails/edit_emails + 내 이메일 + 하드코딩 관리자만으로 판단
  //  → app_members 로드 여부에 의존하지 않음(권한이 잘못 잠기는 #2 버그 방지).
  const myEmail = user?.email ?? ''
  const amAdmin = configured ? isAdminEmail(myEmail) : true
  const myRole = configured ? roleOf(myEmail, members) : 'admin' // 멤버 관리/생성권한 표시용
  const myTeams = members[myEmail.toLowerCase()]?.teams ?? []
  const permit: PermitValue = useMemo(
    () => ({
      email: myEmail,
      isAdmin: amAdmin,
      canCreate: configured ? canCreate(myRole, myTeams) : true,
      canView: (t) => (configured ? canViewTask(myEmail, t) : true),
      canEdit: (t) => (configured ? canEditTask(myEmail, t) : true),
      canGrant: (t) => (configured ? canGrantTask(myEmail, t) : true),
    }),
    // myTeams 는 members 변경 시에만 새 배열 → members 의존으로 충분
    [myEmail, amAdmin, myRole, configured, members],
  )

  // 단축키: Ctrl+Z 실행취소 · Ctrl+Shift+Z/Ctrl+Y 다시실행 (저장은 자동)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const k = e.key.toLowerCase()
      const el = e.target as HTMLElement | null
      const editableField =
        !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if (!editableField && k === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (!editableField && ((k === 'z' && e.shiftKey) || k === 'y')) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

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
  const [showMembers, setShowMembers] = useState(false)
  const [showVersions, setShowVersions] = useState(false)
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

  // 보기 권한 필터(#4) — 관리자가 아니면 권한 있는 태스크만 표시(기본 숨김).
  //  데모 모드/관리자는 전체. 모든 표시용 계산은 이 visibleTasks 기준.
  const visibleTasks = useMemo(
    () => (configured && !amAdmin ? tasks.filter((t) => canViewTask(myEmail, t)) : tasks),
    [tasks, configured, amAdmin, myEmail],
  )

  // 상태 필터 적용 (요약 카드는 전체 기준, 간트만 필터)
  const filteredTasks = useMemo(() => {
    if (filter === 'all') return visibleTasks
    if (filter === 'overdue')
      return visibleTasks.filter(
        (t) => t.status !== 'done' && daysBetween(today, parseDate(t.due_date)) < 0,
      )
    return visibleTasks.filter((t) => t.status === filter)
  }, [visibleTasks, filter, today])

  const { rangeStart, rangeEnd } = useMemo(() => {
    let min = today
    let max = addDays(today, 30)
    if (visibleTasks.length > 0) {
      const starts: number[] = []
      const dues: number[] = []
      for (const t of visibleTasks) {
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
  }, [visibleTasks, today])

  const projects = useMemo(
    () => [...new Set(visibleTasks.map((t) => t.project).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko')),
    [visibleTasks],
  )

  const taskCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const t of visibleTasks) m[t.team] = (m[t.team] ?? 0) + 1
    return m
  }, [visibleTasks])

  // 좌측 라벨 칸 폭을 가장 긴 태스크/팀명에 맞춰 자동 계산 (한글 기준 글자폭 추정)
  const labelWidth = useMemo(() => {
    let maxLen = 0
    for (const t of visibleTasks) {
      maxLen = Math.max(maxLen, t.title.length, t.team.length)
    }
    // 제목 글자수 × 한글폭(13.5) + 들여쓰기·칩·아이콘 고정 여백(150)
    const w = Math.round(maxLen * 13.5 + 150)
    return Math.min(440, Math.max(220, w)) // 220~440px 사이로 클램프
  }, [visibleTasks])

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

  // 메인태스크 순서 변경(같은 팀 내 라벨 드래그) → sort_order 재할당 (undo 1단계)
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
      // 새 순서대로 sort_order 0,1,2… 재할당 → 전체 작업본 한 번에 교체
      const orderMap = new Map(teamTasks.map((t, i) => [t.id, i]))
      const next = tasks.map((t) =>
        orderMap.has(t.id) ? { ...t, sort_order: orderMap.get(t.id) as number } : t,
      )
      replaceTasks(next)
    },
    [tasks, replaceTasks],
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

  // 서브 태스크 인라인 편집 — 제목·기간·색·비중·완료·URL 등 부분 갱신 + 진행률 재계산
  const handleUpdateStep = useCallback(
    (task: Task, stepId: string, patch: Partial<TaskStep>) => {
      const steps = (task.steps ?? []).map((s) => (s.id === stepId ? { ...s, ...patch } : s))
      void editTask(task.id, {
        ...taskToDraft(task),
        steps,
        progress: task.status === 'done' ? 100 : progressFromSteps(steps),
      })
    },
    [editTask],
  )

  // 서브 태스크 삭제 + 진행률 재계산
  const handleDeleteStep = useCallback(
    (task: Task, stepId: string) => {
      const steps = (task.steps ?? []).filter((s) => s.id !== stepId)
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

  // 보기별 표시 대상 (보기 권한 + 숨긴 팀 제외)
  const boardTasks = visibleTasks.filter((t) => !hidden.has(t.team)) // 보드: 모든 상태
  const listTasks = filteredTasks.filter((t) => !hidden.has(t.team)) // 목록: 상태 필터 반영

  // 실데이터 모드(Supabase 연결)에서는 로그인 필수. 데모 모드는 로그인 없이 사용.
  if (configured && authLoading) {
    return <div className="auth-splash">불러오는 중…</div>
  }
  if (configured && !user) {
    return <LoginScreen />
  }

  return (
    <PermitProvider value={permit}>
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
            <span className="brand-sub">업무진행대시보드 - Task Progress Tracker(TPT)</span>
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
          <div className="header-tools">
            <button className="tool-btn" onClick={undo} disabled={!canUndo} title="실행취소 (Ctrl+Z)">
              <Undo2 size={16} />
            </button>
            <button className="tool-btn" onClick={redo} disabled={!canRedo} title="다시실행 (Ctrl+Shift+Z)">
              <Redo2 size={16} />
            </button>
            <button className="tool-btn" onClick={() => setShowVersions(true)} title="버전 기록 · 복원">
              <History size={16} />
            </button>
          </div>
          {user && (
            <span className="user-chip" title={user.email}>
              <button
                type="button"
                className={'user-chip-face' + (canManageMembers(myEmail) ? ' clickable' : '')}
                onClick={canManageMembers(myEmail) ? () => setShowMembers(true) : undefined}
                title={canManageMembers(myEmail) ? '멤버 · 권한 관리' : user.email}
              >
                {user.photoURL ? (
                  <img src={user.photoURL} alt="" width={24} height={24} referrerPolicy="no-referrer" />
                ) : (
                  <span className="user-avatar-fallback">
                    {(user.displayName ?? user.email).charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="user-name">{user.displayName ?? user.email}</span>
                <span className={'role-badge ' + myRole}>{ROLE_LABELS[myRole]}</span>
              </button>
              <button className="user-logout" onClick={() => void logout()} title="로그아웃">
                <LogOut size={14} />
              </button>
            </span>
          )}
        </header>

        <div className="main-body">
          {error && (
            <div className="error-banner">저장/불러오기 오류: {error}</div>
          )}

          <StatusBar tasks={visibleTasks} today={today} />

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
              onMoveMilestone={handleMoveMilestone}
              onToggleMilestone={handleToggleMilestone}
              onCreateNew={() => setEditing({ task: null })}
              onAddStep={handleAddStep}
              onUpdateStep={handleUpdateStep}
              onDeleteStep={handleDeleteStep}
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
          members={members}
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

      {showMembers && (
        <MemberManager
          members={members}
          teams={teams}
          onAdd={addMember}
          onUpdate={updateMember}
          onRemove={removeMember}
          onClose={() => setShowMembers(false)}
        />
      )}

      {showVersions && (
        <VersionPanel
          demoMode={demoMode}
          onRestore={(snap) => replaceTasks(snap)}
          onClose={() => setShowVersions(false)}
        />
      )}
    </div>
    </PermitProvider>
  )
}
