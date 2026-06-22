import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Plus,
  ExternalLink,
  ChevronsLeft,
  ChevronsRight,
  CalendarClock,
  Eye,
  EyeOff,
  Pencil,
} from 'lucide-react'
import type { Task, TaskStep } from '../types'
import { STATUS_META, stepProgress, stepLinks } from '../types'
import { STEP_COLORS } from '../lib/palette'
import { packLanes } from '../lib/lanes'
import { usePermit } from '../lib/permit'
import { ConfirmDialog } from './ConfirmDialog'
import { StepPopover } from './StepPopover'

// 드래그로 조정한 변경 — 확인 팝업에서 확정/취소
type PendingChange =
  | { kind: 'task'; task: Task; start: string; due: string }
  | { kind: 'step'; task: Task; stepId: string; stepTitle: string; start: string; due: string }
  | { kind: 'ms'; task: Task; stepId: string; msId: string; date: string }
import {
  parseDate,
  daysBetween,
  addDays,
  toISODate,
  isWeekend,
  isSameDay,
  weekdayLabel,
  rangeLabel,
  shortLabel,
} from '../lib/dates'

// 보기 단위별 하루 칸 너비(px) — 일(기본)/주/월
type ZoomLevel = 'day' | 'week' | 'month'
const ZOOM_DAY_W: Record<ZoomLevel, number> = { day: 34, week: 14, month: 6 }
const ZOOM_ORDER: ZoomLevel[] = ['day', 'week', 'month'] // 일(기본) → 주 → 월
const ZOOM_LABEL: Record<ZoomLevel, string> = { day: '일', week: '주', month: '월' }

// 서브 태스크 고유색 — color 지정 시 그 값, 없으면 인덱스 기반 자동색
function stepColor(s: TaskStep, index: number): string {
  return s.color || STEP_COLORS[index % STEP_COLORS.length]
}

type DragMode = 'move' | 'start' | 'end'
interface DragState {
  id: string // 상위 태스크 id
  stepId?: string // 서브 태스크면 그 id
  mode: DragMode
  startClientX: number
  origStart: string
  origDue: string
  deltaDays: number
  moved: boolean
  editable: boolean // 권한 없으면 false → 드래그(이동/기간조절) 무시, 클릭 선택만
}

interface Props {
  tasks: Task[]
  teams: string[] // 팀 표시 순서(사용자 지정)
  rangeStart: Date
  rangeEnd: Date
  today: Date
  selectedId: string | null
  collapsed: Set<string>
  hidden: Set<string>
  hiddenTasks: Set<string>
  colorOf: (team: string) => string
  onToggleTeam: (team: string) => void
  onToggleHiddenTask: (taskId: string) => void
  onReorderTask: (fromId: string, toId: string) => void
  onSelect: (task: Task) => void
  onReschedule: (task: Task, startISO: string, dueISO: string) => void
  onRescheduleStep: (task: Task, stepId: string, startISO: string, dueISO: string) => void
  onTaskContextMenu: (task: Task, x: number, y: number) => void
  onMoveMilestone: (task: Task, stepId: string, milestoneId: string, date: string) => void
  onToggleMilestone: (task: Task, stepId: string, milestoneId: string) => void
  onCreateNew: () => void
  onAddStep: (task: Task, title: string) => void
  onUpdateStep: (task: Task, stepId: string, patch: Partial<TaskStep>) => void
  onDeleteStep: (task: Task, stepId: string) => void
}

function previewDates(d: DragState): { start: string; due: string } {
  const oStart = parseDate(d.origStart)
  const oDue = parseDate(d.origDue)
  if (d.mode === 'move') {
    return { start: toISODate(addDays(oStart, d.deltaDays)), due: toISODate(addDays(oDue, d.deltaDays)) }
  }
  if (d.mode === 'start') {
    let ns = addDays(oStart, d.deltaDays)
    if (ns > oDue) ns = oDue
    return { start: toISODate(ns), due: d.origDue }
  }
  let nd = addDays(oDue, d.deltaDays)
  if (nd < oStart) nd = oStart
  return { start: d.origStart, due: toISODate(nd) }
}

export function GanttChart({
  tasks,
  teams,
  rangeStart,
  rangeEnd,
  today,
  selectedId,
  collapsed,
  hidden,
  hiddenTasks,
  colorOf,
  onToggleTeam,
  onToggleHiddenTask,
  onReorderTask,
  onSelect,
  onReschedule,
  onRescheduleStep,
  onTaskContextMenu,
  onMoveMilestone,
  onToggleMilestone,
  onCreateNew,
  onAddStep,
  onUpdateStep,
  onDeleteStep,
}: Props) {
  const { canEdit } = usePermit() // 권한 없으면 드래그·생성 비활성
  const [pending, setPending] = useState<PendingChange | null>(null) // 드래그 조정 확인 대기
  const [zoom, setZoom] = useState<ZoomLevel>('day') // 보기 단위 (일/주/월)
  const DAY_W = ZOOM_DAY_W[zoom] // 기존 DAY_W 참조를 줌에 따라 가변
  const totalDays = daysBetween(rangeStart, rangeEnd) + 1
  const timelineWidth = totalDays * DAY_W

  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  dragRef.current = drag
  const dragging = !!drag

  // 메인태스크 라벨 드래그(순서 변경)
  const taskDragId = useRef<string | null>(null)
  const [taskDragOver, setTaskDragOver] = useState<string | null>(null)

  // 서브태스크 칩 팝업 (fixed — 차트 overflow에 안 잘림)
  const [subPop, setSubPop] = useState<{ taskId: string; x: number; y: number; subs: TaskStep[]; task: Task } | null>(null)
  const subPopTimer = useRef<number | null>(null)
  function openSubPop(e: React.PointerEvent, task: Task, subs: TaskStep[]) {
    if (subPopTimer.current) { clearTimeout(subPopTimer.current); subPopTimer.current = null }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setSubPop({ taskId: task.id, x: r.left, y: r.bottom + 4, subs, task })
  }
  function closeSubPop() {
    if (subPopTimer.current) clearTimeout(subPopTimer.current)
    subPopTimer.current = window.setTimeout(() => setSubPop(null), 120)
  }
  function keepSubPop() {
    if (subPopTimer.current) { clearTimeout(subPopTimer.current); subPopTimer.current = null }
  }

  // 마일스톤(점) 드래그 — 날짜 이동
  interface MsDrag {
    task: Task
    stepId: string
    msId: string
    origDate: string
    minDate: string
    maxDate: string
    startClientX: number
    deltaDays: number
    moved: boolean
  }
  const [msDrag, setMsDrag] = useState<MsDrag | null>(null)
  const msDragRef = useRef<MsDrag | null>(null)
  msDragRef.current = msDrag

  // 서브 태스크를 접은 상위 태스크 id
  const [closedTasks, setClosedTasks] = useState<Set<string>>(new Set())
  const toggleTask = (id: string) =>
    setClosedTasks((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // #3 기본 접힘 — 처음 등장하는 메인태스크(세부 보유)는 접은 채 시작.
  //  이미 본(seen) 태스크는 다시 접지 않음 → 사용자가 펼친 상태 유지.
  const seenTasksRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const fresh = tasks
      .filter((t) => (t.steps?.length ?? 0) > 0 && !seenTasksRef.current.has(t.id))
      .map((t) => t.id)
    if (!fresh.length) return
    fresh.forEach((id) => seenTasksRef.current.add(id))
    setClosedTasks((prev) => {
      const next = new Set(prev)
      fresh.forEach((id) => next.add(id))
      return next
    })
  }, [tasks])

  // #5 세부 태스크 인라인 편집 팝업 (fixed — 차트 overflow에 안 잘림)
  const [stepPop, setStepPop] = useState<{ taskId: string; stepId: string; x: number; y: number } | null>(null)
  const openStepPop = (e: React.MouseEvent, task: Task, step: TaskStep) => {
    e.preventDefault()
    e.stopPropagation()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setStepPop({ taskId: task.id, stepId: step.id, x: r.left, y: r.bottom + 6 })
  }

  // 행 인라인 서브 태스크 추가
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const [addText, setAddText] = useState('')


  useEffect(() => {
    if (!dragging) return
    function onMove(e: PointerEvent) {
      const d = dragRef.current
      if (!d) return
      if (!d.editable) return // 권한 없음 → 이동 누적 안 함(클릭 선택만 유지)
      const delta = Math.round((e.clientX - d.startClientX) / DAY_W)
      setDrag((prev) =>
        prev && delta !== prev.deltaDays
          ? { ...prev, deltaDays: delta, moved: prev.moved || delta !== 0 }
          : prev,
      )
    }
    function onUp() {
      const d = dragRef.current
      if (!d) return
      const task = tasks.find((t) => t.id === d.id)
      if (task) {
        if (d.moved && d.editable) {
          const { start, due } = previewDates(d)
          if (d.stepId) {
            const st = task.steps.find((s) => s.id === d.stepId)
            setPending({
              kind: 'step',
              task,
              stepId: d.stepId,
              stepTitle: st?.title || '서브태스크',
              start,
              due,
            })
          } else {
            setPending({ kind: 'task', task, start, due })
          }
        } else if (d.mode === 'move') {
          onSelect(task)
        }
      }
      setDrag(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragging, tasks, onReschedule, onRescheduleStep, onSelect])

  // 마일스톤 점 드래그
  useEffect(() => {
    if (!msDrag) return
    function onMove(e: PointerEvent) {
      const d = msDragRef.current
      if (!d) return
      const delta = Math.round((e.clientX - d.startClientX) / DAY_W)
      setMsDrag((prev) =>
        prev && delta !== prev.deltaDays
          ? { ...prev, deltaDays: delta, moved: prev.moved || delta !== 0 }
          : prev,
      )
    }
    function onUp() {
      const d = msDragRef.current
      if (!d) return
      if (d.moved && canEdit(d.task)) {
        // 막대 기간(min~max) 안으로 클램프
        let nd = addDays(parseDate(d.origDate), d.deltaDays)
        if (nd < parseDate(d.minDate)) nd = parseDate(d.minDate)
        if (nd > parseDate(d.maxDate)) nd = parseDate(d.maxDate)
        setPending({ kind: 'ms', task: d.task, stepId: d.stepId, msId: d.msId, date: toISODate(nd) })
      }
      setMsDrag(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [msDrag, onMoveMilestone, canEdit])

  // 차트 가로 스크롤 네비게이션
  function scrollToToday() {
    const c = scrollRef.current
    if (c) c.scrollTo({ left: Math.max(0, todayLeft - DAY_W * 5), behavior: 'smooth' })
  }
  // 특정 날짜의 막대 시작점으로 스크롤(서브태스크 칩 클릭)
  function scrollToDate(dateISO: string) {
    const c = scrollRef.current
    if (!c) return
    const left = daysBetween(rangeStart, parseDate(dateISO)) * DAY_W
    c.scrollTo({ left: Math.max(0, left - DAY_W * 2), behavior: 'smooth' })
  }
  function scrollToStart() {
    scrollRef.current?.scrollTo({ left: 0, behavior: 'smooth' })
  }
  function scrollToEnd() {
    scrollRef.current?.scrollTo({ left: timelineWidth, behavior: 'smooth' })
  }

  function startDrag(e: React.PointerEvent, t: Task, mode: DragMode, step?: TaskStep) {
    e.stopPropagation()
    const origStart = step ? step.start_date || t.start_date : t.start_date
    const origDue = step ? step.due_date || t.due_date : t.due_date
    setDrag({
      id: t.id,
      stepId: step?.id,
      mode,
      startClientX: e.clientX,
      origStart,
      origDue,
      deltaDays: 0,
      moved: false,
      editable: canEdit(t),
    })
  }

  const groups = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of tasks) {
      if (hidden.has(t.team)) continue
      if (!map.has(t.team)) map.set(t.team, [])
      map.get(t.team)!.push(t)
    }
    return [...map.entries()]
      // teams 배열(사용자 지정 순서) 기준 정렬, 목록에 없는 팀은 뒤로
      .sort((a, b) => {
        const ia = teams.indexOf(a[0])
        const ib = teams.indexOf(b[0])
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a[0].localeCompare(b[0], 'ko')
      })
      .map(([team, items]) => ({
        team,
        items: [...items].sort((a, b) => a.sort_order - b.sort_order),
      }))
  }, [tasks, hidden, teams])

  const ticks = useMemo(() => {
    const arr: { date: Date; left: number }[] = []
    for (let i = 0; i < totalDays; i++) arr.push({ date: addDays(rangeStart, i), left: i * DAY_W })
    return arr
  }, [rangeStart, totalDays])

  // 헤더 월 행 구간 — 각 월의 left·width·라벨('6월')
  const monthSpans = useMemo(() => {
    const spans: { label: string; left: number; width: number }[] = []
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(rangeStart, i)
      if (i === 0 || d.getDate() === 1) {
        const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0)
        const daysToEnd = Math.min(daysBetween(d, monthEnd), totalDays - 1 - i)
        spans.push({
          label: `${d.getFullYear()}.${d.getMonth() + 1}`,
          left: i * DAY_W,
          width: (daysToEnd + 1) * DAY_W,
        })
      }
    }
    return spans
  }, [rangeStart, totalDays, DAY_W])

  const todayCol = daysBetween(rangeStart, today)
  const todayLeft = todayCol * DAY_W
  const todayVisible = todayCol >= 0 && todayCol < totalDays

  // ── 패닝 ──
  const scrollRef = useRef<HTMLDivElement>(null)
  const panRef = useRef<{ startX: number; startScroll: number; moved: boolean } | null>(null)
  const [panning, setPanning] = useState(false)

  // 가로 스크롤 위치 추적 — 막대 시작이 화면 밖이면 막대 안 이름을 안쪽으로 밀기
  const [scrollLeft, setScrollLeft] = useState(0)

  // 최초 1회만 오늘 기준으로 스크롤(과거로 안 가게). 이후 드래그/저장 시엔 스크롤 유지.
  const didInitScroll = useRef(false)
  useEffect(() => {
    if (didInitScroll.current) return
    const c = scrollRef.current
    if (!c || !todayVisible) return
    c.scrollLeft = Math.max(0, todayLeft - DAY_W * 5)
    didInitScroll.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayVisible, todayLeft])

  function onGanttPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return
    const el = e.target as HTMLElement
    if (
      el.closest('.task-bar') ||
      el.closest('.gantt-label') ||
      el.closest('.team-header') ||
      el.closest('button') ||
      el.closest('input') ||
      el.closest('a') ||
      el.closest('.gantt-add-zone')
    )
      return
    const c = scrollRef.current
    if (!c) return
    c.setPointerCapture(e.pointerId)
    panRef.current = { startX: e.clientX, startScroll: c.scrollLeft, moved: false }
    setPanning(true)
  }
  function onGanttPointerMove(e: React.PointerEvent) {
    const pan = panRef.current
    const c = scrollRef.current
    if (!pan || !c) return
    const dx = e.clientX - pan.startX
    if (Math.abs(dx) > 4) pan.moved = true
    c.scrollLeft = pan.startScroll - dx
  }
  function onGanttPointerUp(e: React.PointerEvent) {
    const pan = panRef.current
    if (!pan) return
    scrollRef.current?.releasePointerCapture(e.pointerId)
    panRef.current = null
    setPanning(false)
  }

  function geom(start: string, due: string) {
    const left = daysBetween(rangeStart, parseDate(start)) * DAY_W
    const span = Math.max(1, daysBetween(parseDate(start), parseDate(due)) + 1)
    return { left: left + 3, width: span * DAY_W - 6 }
  }

  const shades = (
    <>
      {ticks.map(({ date, left }, i) =>
        isWeekend(date) ? (
          <div key={'w' + i} className="col-shade weekend" style={{ left, width: DAY_W }} />
        ) : null,
      )}
      {/* 월이 바뀌는 세로 점선 (월 첫날 칸 왼쪽 모서리) */}
      {ticks.map(({ date, left }, i) =>
        date.getDate() === 1 && i !== 0 ? (
          <div key={'m' + i} className="month-line" style={{ left }} />
        ) : null,
      )}
      {todayVisible && <div className="col-shade today" style={{ left: todayLeft, width: DAY_W }} />}
      {todayVisible && <div className="today-line" style={{ left: todayLeft + DAY_W / 2 }} />}
    </>
  )

  // 인라인 추가 입력창 (행 타임라인 좌측)
  function addControl(t: Task) {
    if (addingFor === t.id) {
      return (
        <input
          className="row-sub-input"
          autoFocus
          value={addText}
          placeholder="서브 태스크 이름 입력 후 Enter"
          onChange={(e) => setAddText(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && addText.trim()) {
              onAddStep(t, addText.trim())
              setAddText('')
            } else if (e.key === 'Escape') {
              setAddingFor(null)
            }
          }}
          onBlur={() => setAddingFor(null)}
        />
      )
    }
    return (
      <button
        className="row-sub-add"
        onClick={(e) => {
          e.stopPropagation()
          setAddText('')
          setAddingFor(t.id)
        }}
        title="서브 태스크 추가"
      >
        <Plus size={13} /> 서브 태스크
      </button>
    )
  }

  return (
    <>
    <div
      ref={scrollRef}
      className={'gantt' + (dragging ? ' dragging' : '') + (panning ? ' panning' : '')}
      onPointerDown={onGanttPointerDown}
      onPointerMove={onGanttPointerMove}
      onPointerUp={onGanttPointerUp}
      onScroll={(e) => setScrollLeft((e.currentTarget as HTMLElement).scrollLeft)}
    >
      {/* 헤더: 날짜 눈금 */}
      <div className="gantt-row gantt-head">
        <div className="gantt-label gantt-head-label">
          <span>팀 / 태스크</span>
          <div className="zoom-toggle">
            {ZOOM_ORDER.map((z) => (
              <button
                key={z}
                className={'zoom-btn' + (zoom === z ? ' active' : '')}
                onClick={() => setZoom(z)}
                title={`${ZOOM_LABEL[z]} 단위 보기`}
              >
                {ZOOM_LABEL[z]}
              </button>
            ))}
          </div>
        </div>
        <div className="gantt-timeline gantt-head-cols" style={{ width: timelineWidth }}>
          {/* 위: 월 표시 행 */}
          <div className="head-month-row">
            {monthSpans.map((m, i) => {
              // 구간이 화면 좌측으로 가려진 만큼 라벨을 안쪽으로 밀어 따라오게(구간 끝에서 멈춤)
              const shift = Math.max(0, Math.min(scrollLeft - m.left, m.width - 70))
              return (
                <div className="head-month" key={i} style={{ left: m.left, width: m.width }}>
                  <span className="head-month-label" style={{ transform: `translateX(${shift}px)` }}>
                    {m.label}
                  </span>
                </div>
              )
            })}
          </div>
          {/* 아래: 요일/날짜 행 */}
          <div className="head-day-row">
            {ticks.map(({ date, left }, i) => {
              const isToday = isSameDay(date, today)
              return (
                <div
                  key={i}
                  className={
                    'day-tick' + (isWeekend(date) ? ' weekend' : '') + (isToday ? ' is-today' : '')
                  }
                  style={{ left, width: DAY_W }}
                >
                  <span className="tick-dow">{weekdayLabel(date)}</span>
                  <span className="tick-day">{date.getDate()}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* 팀 그룹 */}
      {groups.map((group) => {
        const teamClosed = collapsed.has(group.team)
        const teamCol = colorOf(group.team)
        return (
          <div
            className="team-group"
            key={group.team}
            style={{ '--team-color': teamCol } as React.CSSProperties}
          >
            <div className="team-header" onClick={() => onToggleTeam(group.team)}>
              <div className="gantt-label">
                <span className="label-bar" style={{ background: teamCol }} />
                {teamClosed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                <span className="team-name">{group.team}</span>
                <span className="team-count">{group.items.length}</span>
              </div>
              <div className="gantt-timeline" style={{ width: timelineWidth }}>
                {shades}
              </div>
            </div>

            {!teamClosed &&
              group.items.map((t) => {
                const meta = STATUS_META[t.status]
                const subs = t.steps ?? []
                const hasSubs = subs.length > 0
                const stepDone = subs.filter((s) => s.done).length
                const subStart = (s: TaskStep) => s.start_date || t.start_date
                const subDue = (s: TaskStep) => s.due_date || t.due_date

                // ── 서브 태스크가 없는 태스크: 단일 막대 행 ──
                if (!hasSubs) {
                  const isDragged = drag?.id === t.id && !drag.stepId
                  const eff = isDragged
                    ? previewDates(drag)
                    : { start: t.start_date, due: t.due_date }
                  const { left, width } = geom(eff.start, eff.due)
                  const overdue = t.status !== 'done' && daysBetween(today, parseDate(eff.due)) < 0
                  const soloHidden = hiddenTasks.has(t.id)
                  return (
                    <div className="gantt-row" key={t.id}>
                      <div
                        className={'gantt-label task-label' + (taskDragOver === t.id ? ' task-drop' : '')}
                        draggable
                        onDragStart={(e) => {
                          taskDragId.current = t.id
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        onDragOver={(e) => {
                          if (taskDragId.current && taskDragId.current !== t.id) {
                            e.preventDefault()
                            setTaskDragOver(t.id)
                          }
                        }}
                        onDragLeave={() => setTaskDragOver((d) => (d === t.id ? null : d))}
                        onDrop={(e) => {
                          e.preventDefault()
                          if (taskDragId.current) onReorderTask(taskDragId.current, t.id)
                          taskDragId.current = null
                          setTaskDragOver(null)
                        }}
                        onDragEnd={() => {
                          taskDragId.current = null
                          setTaskDragOver(null)
                        }}
                      >
                        <span className="nest-guide" style={{ background: teamCol }} />
                        <span className="label-bar" style={{ background: t.color ?? meta.color }} />
                        <span className="title" title={t.title}>
                          {t.title}
                        </span>
                        {overdue && <span className="overdue-flag">지연</span>}
                        <button
                          className={'task-eye' + (soloHidden ? ' muted' : '')}
                          onClick={(e) => {
                            e.stopPropagation()
                            onToggleHiddenTask(t.id)
                          }}
                          title={soloHidden ? '타임라인에 표시' : '타임라인에서 숨기기'}
                        >
                          {soloHidden ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                      <div
                        className="gantt-timeline"
                        style={{ width: timelineWidth }}
                        onDoubleClick={() => {
                          setAddText('')
                          setAddingFor(t.id)
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          onTaskContextMenu(t, e.clientX, e.clientY)
                        }}
                        title="빈 곳 더블클릭 또는 + → 서브 태스크 추가"
                      >
                        {shades}
                        {addControl(t)}
                        {!soloHidden && (
                          <div
                            className={'task-bar' + (selectedId === t.id ? ' selected' : '') + (isDragged ? ' dragged' : '')}
                            style={{ left, width, background: meta.color + '2e' }}
                            onPointerDown={(e) => startDrag(e, t, 'move')}
                            onClick={(e) => e.stopPropagation()}
                            onContextMenu={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              onTaskContextMenu(t, e.clientX, e.clientY)
                            }}
                            title={`${t.title} · ${meta.label} · ${t.progress}%`}
                          >
                            <span className="bar-accent" style={{ background: meta.color }} />
                            <div className="bar-progress">
                              <div className="bar-progress-fill" style={{ width: `${t.progress}%`, background: meta.color }} />
                            </div>
                            <span className="bar-handle left" onPointerDown={(e) => startDrag(e, t, 'start')} />
                            <div className="bar-body">
                              <span className="bar-title">{t.title}</span>
                              <span className="bar-sub">
                                {rangeLabel(eff.start, eff.due)} · {t.progress}%
                              </span>
                            </div>
                            <span className="bar-handle right" onPointerDown={(e) => startDrag(e, t, 'end')} />
                          </div>
                        )}
                      </div>
                    </div>
                  )
                }

                // ── 서브 태스크가 있는 태스크(메인태스크): 그룹 헤더 + 압축 레인 ──
                // 메인태스크는 자기 막대를 그리지 않고 접기/펼치기 묶음 역할만 한다.
                const taskHidden = hiddenTasks.has(t.id)
                const taskClosed = closedTasks.has(t.id) || taskHidden
                // 레인 패킹: 일정이 안 겹치는 서브 태스크끼리 같은 행에 모은다.
                const { laneOf, laneCount } = packLanes(
                  subs.map((s) => ({ start: subStart(s), due: subDue(s) })),
                )
                // 레인별 서브 태스크 묶음 (원본 인덱스 보존 → 고유색 계산용)
                const lanes: { step: TaskStep; index: number }[][] = Array.from(
                  { length: laneCount },
                  () => [],
                )
                subs.forEach((s, i) => lanes[laneOf[i]].push({ step: s, index: i }))
                return (
                  <div className="task-group" key={t.id}>
                    {/* 메인태스크(그룹) 헤더 행 — 타임라인엔 막대 없음 */}
                    <div className="gantt-row task-group-row">
                      <div
                        className={'gantt-label task-label' + (taskDragOver === t.id ? ' task-drop' : '')}
                        onClick={() => toggleTask(t.id)}
                        style={{ cursor: 'pointer' }}
                        draggable
                        onDragStart={(e) => {
                          taskDragId.current = t.id
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        onDragOver={(e) => {
                          if (taskDragId.current && taskDragId.current !== t.id) {
                            e.preventDefault()
                            setTaskDragOver(t.id)
                          }
                        }}
                        onDragLeave={() => setTaskDragOver((d) => (d === t.id ? null : d))}
                        onDrop={(e) => {
                          e.preventDefault()
                          if (taskDragId.current) onReorderTask(taskDragId.current, t.id)
                          taskDragId.current = null
                          setTaskDragOver(null)
                        }}
                        onDragEnd={() => {
                          taskDragId.current = null
                          setTaskDragOver(null)
                        }}
                      >
                        <span className="nest-guide" style={{ background: teamCol }} />
                        {taskClosed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                        <span className="label-bar" style={{ background: t.color ?? meta.color }} />
                        <span className="title" title={t.title}>
                          {t.title}
                        </span>
                        <span className="step-chip" title={`전체 ${t.progress}% · 완료 ${stepDone}/${subs.length}`}>
                          {t.progress}% · {stepDone}/{subs.length}
                        </span>
                        <button
                          className={'task-eye' + (taskHidden ? ' muted' : '')}
                          onClick={(e) => {
                            e.stopPropagation()
                            onToggleHiddenTask(t.id)
                          }}
                          title={taskHidden ? '타임라인에 표시' : '타임라인에서 숨기기'}
                        >
                          {taskHidden ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                      <div
                        className="gantt-timeline"
                        style={{ width: timelineWidth }}
                        onDoubleClick={() => {
                          setAddText('')
                          setAddingFor(t.id)
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          onTaskContextMenu(t, e.clientX, e.clientY)
                        }}
                        title="빈 곳 더블클릭 또는 + → 서브 태스크 추가"
                      >
                        {shades}
                        {addControl(t)}
                      </div>
                    </div>

                    {/* 서브 태스크 레인 행들 — 항상 펼쳐진 한 줄 막대 */}
                    {!taskClosed &&
                      lanes.map((lane, laneIdx) => (
                        <div className="gantt-row lane-row" key={t.id + '-lane-' + laneIdx}>
                          <div className="gantt-label sub-label">
                            <span className="nest-guide" style={{ background: teamCol }} />
                            {laneIdx === 0 && (
                              <>
                                <span
                                  className="sub-pill"
                                  onPointerEnter={(e) => openSubPop(e, t, subs)}
                                  onPointerLeave={closeSubPop}
                                >
                                  서브태스크 {subs.length}개
                                  <ChevronDown size={11} className="sub-pill-caret" />
                                </span>
                                {t.owner && <span className="owner-pill">{t.owner}</span>}
                              </>
                            )}
                          </div>
                          <div className="gantt-timeline" style={{ width: timelineWidth }}>
                            {shades}
                            {lane.map(({ step: s, index }) => {
                              const isDragged = drag?.id === t.id && drag.stepId === s.id
                              const eff = isDragged
                                ? previewDates(drag)
                                : { start: subStart(s), due: subDue(s) }
                              const { left, width } = geom(eff.start, eff.due)
                              // 지정한 고유색을 항상 사용(완료는 색 대신 반투명+체크로 구분)
                              const lineColor = stepColor(s, index)
                              const pct = stepProgress(s)
                              return (
                                <div
                                  className={'lane-bar' + (isDragged ? ' dragged' : '') + (s.done ? ' done' : '')}
                                  key={s.id}
                                  style={{ left, width, '--line-color': lineColor } as React.CSSProperties}
                                  onPointerDown={(e) => startDrag(e, t, 'move', s)}
                                  onClick={(e) => e.stopPropagation()}
                                  onContextMenu={(e) => openStepPop(e, t, s)}
                                  title={`${s.title} · ${rangeLabel(eff.start, eff.due)} · ${pct}% · 우클릭/✎ 편집`}
                                >
                                  {/* 호버 시 나타나는 인라인 편집 버튼 (우클릭과 동일 팝업) */}
                                  <button
                                    className="lane-edit"
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => openStepPop(e, t, s)}
                                    title="세부 태스크 편집"
                                  >
                                    <Pencil size={11} />
                                  </button>
                                  {/* 진행도 시각 띠 제거 — 진행률은 라벨의 "· N%" 숫자로 표시 */}
                                  {/* 마일스톤 점들 (점 + 위 제목 텍스트, 드래그로 날짜 이동) */}
                                  {(s.milestones ?? []).map((m) => {
                                    // 드래그 중인 점은 미리보기 날짜로 위치 반영
                                    const isMsDragged =
                                      msDrag?.msId === m.id && msDrag.stepId === s.id
                                    let effDate = m.date
                                    if (isMsDragged && msDrag) {
                                      let nd = addDays(parseDate(m.date), msDrag.deltaDays)
                                      if (nd < parseDate(eff.start)) nd = parseDate(eff.start)
                                      if (nd > parseDate(eff.due)) nd = parseDate(eff.due)
                                      effDate = toISODate(nd)
                                    }
                                    const off = daysBetween(parseDate(eff.start), parseDate(effDate))
                                    const span = Math.max(1, daysBetween(parseDate(eff.start), parseDate(eff.due)) + 1)
                                    // +0.5: 날짜 칸의 좌측 경계가 아니라 해당일 칸 '중앙'에 정렬
                                    const leftPct = Math.min(100, Math.max(0, ((off + 0.5) / span) * 100))
                                    // 기한 지났는데 미완료면 경고(강한 레드)
                                    const overdue = !m.done && daysBetween(today, parseDate(effDate)) < 0
                                    const msColor = m.done ? '#22b455' : overdue ? '#ff2d2d' : lineColor
                                    return (
                                      <span
                                        key={m.id}
                                        className={
                                          'lane-ms' +
                                          (isMsDragged ? ' dragging' : '') +
                                          (overdue ? ' overdue' : '') +
                                          (m.done ? ' done' : '')
                                        }
                                        style={{ left: `${leftPct}%` }}
                                        title={`${t.team} › ${t.title} › ${s.title || '서브태스크'} › ${m.title}\n${shortLabel(parseDate(effDate))}${m.done ? ' · 완료' : overdue ? ' · ⚠ 기한 초과(미완료)' : ''} · 클릭: 완료 토글`}
                                        onPointerDown={(e) => {
                                          e.stopPropagation()
                                          setMsDrag({
                                            task: t,
                                            stepId: s.id,
                                            msId: m.id,
                                            origDate: m.date,
                                            minDate: eff.start,
                                            maxDate: eff.due,
                                            startClientX: e.clientX,
                                            deltaDays: 0,
                                            moved: false,
                                          })
                                        }}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          if (!msDrag?.moved) onToggleMilestone(t, s.id, m.id)
                                        }}
                                      >
                                        {m.title && (
                                          <span className="lane-ms-label" style={overdue ? { color: '#ff2d2d' } : undefined}>
                                            {overdue && '⚠ '}
                                            {m.title}
                                          </span>
                                        )}
                                        <span
                                          className="lane-ms-tri"
                                          style={{ borderTopColor: msColor }}
                                        />
                                      </span>
                                    )
                                  })}
                                  <span
                                    className="bar-handle left"
                                    onPointerDown={(e) => startDrag(e, t, 'start', s)}
                                  />
                                  {/* 한 줄 정보: 제목 · 기간/% · 링크
                                      클리핑 박스(막대 크기) 안에서 스크롤 따라 이동 → 넘치면 막대 경계에서 잘림 */}
                                  <div className="lane-clip">
                                    <div
                                      className="lane-row-content"
                                      style={{
                                        transform: `translate(${Math.max(0, Math.min(scrollLeft - left, width - 44))}px, -50%)`,
                                      }}
                                    >
                                      <span className={'lane-title' + (s.done ? ' sub-done' : '')}>
                                        {s.title}
                                      </span>
                                      <span className="lane-meta">
                                        {rangeLabel(eff.start, eff.due)} · {pct}%
                                      </span>
                                      {(() => {
                                        const links = stepLinks(s)
                                        if (!links.length) return null
                                        return (
                                          <button
                                            className="lane-link"
                                            onPointerDown={(e) => e.stopPropagation()}
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              const u = links[0].url
                                              window.open(/^https?:\/\//.test(u) ? u : 'https://' + u, '_blank', 'noopener')
                                            }}
                                            title={
                                              links.length > 1
                                                ? `문서 링크 ${links.length}개 — 클릭: 첫 링크 / ✎로 전체`
                                                : '링크 열기'
                                            }
                                          >
                                            <ExternalLink size={12} />
                                            {links.length > 1 && <span className="lane-link-badge">{links.length}</span>}
                                          </button>
                                        )
                                      })()}
                                    </div>
                                  </div>
                                  <span
                                    className="bar-handle right"
                                    onPointerDown={(e) => startDrag(e, t, 'end', s)}
                                  />
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                  </div>
                )
              })}
          </div>
        )
      })}

      {/* 맨 아래 — 새 태스크 추가 + 차트 네비게이션 */}
      <div className="gantt-footer">
        <div
          className="gantt-add-zone"
          onClick={onCreateNew}
          onContextMenu={(e) => {
            e.preventDefault()
            onCreateNew()
          }}
          title="여기를 눌러 새 태스크 추가"
        >
          <Plus size={15} /> 새 태스크 추가
        </div>
        <div className="gantt-nav">
          <button className="gantt-nav-btn" onClick={scrollToStart} title="태스크 처음으로">
            <ChevronsLeft size={15} /> 처음
          </button>
          <button className="gantt-nav-btn" onClick={scrollToToday} title="오늘로 이동">
            <CalendarClock size={15} /> 오늘
          </button>
          <button className="gantt-nav-btn" onClick={scrollToEnd} title="태스크 끝으로 이동">
            끝 <ChevronsRight size={15} />
          </button>
        </div>
      </div>
    </div>

    {/* 서브태스크 칩 팝업 — fixed라 차트 overflow에 안 잘림 */}
    {subPop && (
      <div
        className="sub-pop-fixed"
        style={{ left: subPop.x, top: subPop.y }}
        onPointerEnter={keepSubPop}
        onPointerLeave={closeSubPop}
      >
        {subPop.subs.map((sub, si) => (
          <button
            key={sub.id}
            className="sub-chip"
            style={{ '--chip-color': stepColor(sub, si) } as React.CSSProperties}
            onClick={() => {
              scrollToDate(sub.start_date || subPop.task.start_date)
              setSubPop(null)
            }}
            title={`${sub.title} — 시작점으로 이동`}
          >
            <span className="sub-chip-dot" />
            <span className="sub-chip-name">{sub.title || `세부 ${si + 1}`}</span>
          </button>
        ))}
      </div>
    )}

    {/* #5 세부 태스크 인라인 편집 팝업 */}
    {(() => {
      if (!stepPop) return null
      const t = tasks.find((x) => x.id === stepPop.taskId)
      const s = t?.steps?.find((x) => x.id === stepPop.stepId)
      if (!t || !s) return null
      return (
        <StepPopover
          task={t}
          step={s}
          x={stepPop.x}
          y={stepPop.y}
          canEdit={canEdit(t)}
          onUpdate={(patch) => onUpdateStep(t, s.id, patch)}
          onDelete={() => onDeleteStep(t, s.id)}
          onClose={() => setStepPop(null)}
        />
      )
    })()}

    {pending && (
      <ConfirmDialog
        title="일정 변경 확인"
        message={
          pending.kind === 'task'
            ? `"${pending.task.title}" 일정을 ${shortLabel(parseDate(pending.start))} ~ ${shortLabel(parseDate(pending.due))} 로 변경할까요?`
            : pending.kind === 'step'
              ? `"${pending.stepTitle}" 일정을 ${shortLabel(parseDate(pending.start))} ~ ${shortLabel(parseDate(pending.due))} 로 변경할까요?`
              : `마일스톤을 ${shortLabel(parseDate(pending.date))} (으)로 이동할까요?`
        }
        onConfirm={() => {
          if (pending.kind === 'task') onReschedule(pending.task, pending.start, pending.due)
          else if (pending.kind === 'step')
            onRescheduleStep(pending.task, pending.stepId, pending.start, pending.due)
          else onMoveMilestone(pending.task, pending.stepId, pending.msId, pending.date)
          setPending(null)
        }}
        onCancel={() => setPending(null)}
      />
    )}
    </>
  )
}
