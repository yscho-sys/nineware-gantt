import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Link2,
  Plus,
  ExternalLink,
  ChevronsLeft,
  ChevronsRight,
  CalendarClock,
  Eye,
  EyeOff,
} from 'lucide-react'
import type { Task, TaskStep } from '../types'
import { STATUS_META, stepProgress } from '../types'
import { STEP_COLORS } from '../lib/palette'
import { packLanes } from '../lib/lanes'
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

// 세부 테스크 고유색 — color 지정 시 그 값, 없으면 인덱스 기반 자동색
function stepColor(s: TaskStep, index: number): string {
  return s.color || STEP_COLORS[index % STEP_COLORS.length]
}

type DragMode = 'move' | 'start' | 'end'
interface DragState {
  id: string // 상위 테스크 id
  stepId?: string // 세부 테스크면 그 id
  mode: DragMode
  startClientX: number
  origStart: string
  origDue: string
  deltaDays: number
  moved: boolean
}

interface Props {
  tasks: Task[]
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
  onSelect: (task: Task) => void
  onReschedule: (task: Task, startISO: string, dueISO: string) => void
  onRescheduleStep: (task: Task, stepId: string, startISO: string, dueISO: string) => void
  onTaskContextMenu: (task: Task, x: number, y: number) => void
  onStepContextMenu: (task: Task, stepId: string, date: string, x: number, y: number) => void
  onMoveMilestone: (task: Task, stepId: string, milestoneId: string, date: string) => void
  onCreateNew: () => void
  onAddStep: (task: Task, title: string) => void
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
  onSelect,
  onReschedule,
  onRescheduleStep,
  onTaskContextMenu,
  onStepContextMenu,
  onMoveMilestone,
  onCreateNew,
  onAddStep,
}: Props) {
  const [zoom, setZoom] = useState<ZoomLevel>('day') // 보기 단위 (일/주/월)
  const DAY_W = ZOOM_DAY_W[zoom] // 기존 DAY_W 참조를 줌에 따라 가변
  const totalDays = daysBetween(rangeStart, rangeEnd) + 1
  const timelineWidth = totalDays * DAY_W

  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  dragRef.current = drag
  const dragging = !!drag

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

  // 세부 테스크를 접은 상위 테스크 id
  const [closedTasks, setClosedTasks] = useState<Set<string>>(new Set())
  const toggleTask = (id: string) =>
    setClosedTasks((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // 행 인라인 세부 테스크 추가
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const [addText, setAddText] = useState('')


  useEffect(() => {
    if (!dragging) return
    function onMove(e: PointerEvent) {
      const d = dragRef.current
      if (!d) return
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
        if (d.moved) {
          const { start, due } = previewDates(d)
          if (d.stepId) onRescheduleStep(task, d.stepId, start, due)
          else onReschedule(task, start, due)
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
      if (d.moved) {
        // 막대 기간(min~max) 안으로 클램프
        let nd = addDays(parseDate(d.origDate), d.deltaDays)
        if (nd < parseDate(d.minDate)) nd = parseDate(d.minDate)
        if (nd > parseDate(d.maxDate)) nd = parseDate(d.maxDate)
        onMoveMilestone(d.task, d.stepId, d.msId, toISODate(nd))
      }
      setMsDrag(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [msDrag, onMoveMilestone])

  // 차트 가로 스크롤 네비게이션
  function scrollToToday() {
    const c = scrollRef.current
    if (c) c.scrollTo({ left: Math.max(0, todayLeft - DAY_W * 5), behavior: 'smooth' })
  }
  // 특정 날짜의 막대 시작점으로 스크롤(세부테스크 칩 클릭)
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
      .sort((a, b) => a[0].localeCompare(b[0], 'ko'))
      .map(([team, items]) => ({
        team,
        items: [...items].sort((a, b) => a.sort_order - b.sort_order),
      }))
  }, [tasks, hidden])

  const ticks = useMemo(() => {
    const arr: { date: Date; left: number }[] = []
    for (let i = 0; i < totalDays; i++) arr.push({ date: addDays(rangeStart, i), left: i * DAY_W })
    return arr
  }, [rangeStart, totalDays])

  const todayCol = daysBetween(rangeStart, today)
  const todayLeft = todayCol * DAY_W
  const todayVisible = todayCol >= 0 && todayCol < totalDays

  // ── 패닝 ──
  const scrollRef = useRef<HTMLDivElement>(null)
  const panRef = useRef<{ startX: number; startScroll: number; moved: boolean } | null>(null)
  const [panning, setPanning] = useState(false)

  // 데이터 범위가 바뀌면(저장/리로드 후) 과거로 가지 않고 오늘 기준으로 스크롤 맞춤.
  // 오늘 칸이 타임라인 좌측에서 약 5일 안쪽에 오도록 배치.
  useEffect(() => {
    const c = scrollRef.current
    if (!c || !todayVisible) return
    const target = Math.max(0, todayLeft - DAY_W * 5)
    c.scrollLeft = target
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart, todayLeft, todayVisible])

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
          placeholder="세부 테스크 이름 입력 후 Enter"
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
        title="세부 테스크 추가"
      >
        <Plus size={13} /> 세부 테스크
      </button>
    )
  }

  return (
    <div
      ref={scrollRef}
      className={'gantt' + (dragging ? ' dragging' : '') + (panning ? ' panning' : '')}
      onPointerDown={onGanttPointerDown}
      onPointerMove={onGanttPointerMove}
      onPointerUp={onGanttPointerUp}
    >
      {/* 헤더: 날짜 눈금 */}
      <div className="gantt-row gantt-head">
        <div className="gantt-label gantt-head-label">
          <span>팀 / 테스크</span>
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
        <div className="gantt-timeline" style={{ width: timelineWidth }}>
          {ticks.map(({ date, left }, i) => {
            const monthStart = date.getDate() === 1 || i === 0
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
                <span className="tick-day">
                  {monthStart ? `${date.getMonth() + 1}/${date.getDate()}` : date.getDate()}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 팀 그룹 */}
      {groups.map((group) => {
        const teamClosed = collapsed.has(group.team)
        const teamCol = colorOf(group.team)
        return (
          <div className="team-group" key={group.team}>
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

                // ── 세부 테스크가 없는 테스크: 단일 막대 행 ──
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
                      <div className="gantt-label task-label">
                        <span className="nest-guide" style={{ background: teamCol }} />
                        <span className="label-bar" style={{ background: meta.color }} />
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
                        title="빈 곳 더블클릭 또는 + → 세부 테스크 추가"
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

                // ── 세부 테스크가 있는 테스크(메인테스크): 그룹 헤더 + 압축 레인 ──
                // 메인테스크는 자기 막대를 그리지 않고 접기/펼치기 묶음 역할만 한다.
                const taskHidden = hiddenTasks.has(t.id)
                const taskClosed = closedTasks.has(t.id) || taskHidden
                // 레인 패킹: 일정이 안 겹치는 세부 테스크끼리 같은 행에 모은다.
                const { laneOf, laneCount } = packLanes(
                  subs.map((s) => ({ start: subStart(s), due: subDue(s) })),
                )
                // 레인별 세부 테스크 묶음 (원본 인덱스 보존 → 고유색 계산용)
                const lanes: { step: TaskStep; index: number }[][] = Array.from(
                  { length: laneCount },
                  () => [],
                )
                subs.forEach((s, i) => lanes[laneOf[i]].push({ step: s, index: i }))
                return (
                  <div className="task-group" key={t.id}>
                    {/* 메인테스크(그룹) 헤더 행 — 타임라인엔 막대 없음 */}
                    <div className="gantt-row task-group-row">
                      <div className="gantt-label task-label" onClick={() => toggleTask(t.id)} style={{ cursor: 'pointer' }}>
                        <span className="nest-guide" style={{ background: teamCol }} />
                        {taskClosed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                        <span className="label-bar" style={{ background: meta.color }} />
                        <span className="title" title={t.title}>
                          {t.title}
                        </span>
                        <span className="step-chip" title={`전체 ${t.progress}% · 완료 ${stepDone}/${subs.length}`}>
                          <Link2 size={11} />
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
                        title="빈 곳 더블클릭 또는 + → 세부 테스크 추가"
                      >
                        {shades}
                        {addControl(t)}
                      </div>
                    </div>

                    {/* 세부 테스크 레인 행들 — 항상 펼쳐진 한 줄 막대 */}
                    {!taskClosed &&
                      lanes.map((lane, laneIdx) => (
                        <div className="gantt-row lane-row" key={t.id + '-lane-' + laneIdx}>
                          <div className="gantt-label sub-label">
                            <span className="nest-guide" style={{ background: teamCol }} />
                            {laneIdx === 0 && (
                              <div className="sub-pill-wrap">
                                <span className="sub-pill">
                                  세부테스크 {subs.length}개
                                  <ChevronDown size={11} className="sub-pill-caret" />
                                </span>
                                {/* 호버 시 칩 목록 팝업 */}
                                <div className="sub-pop">
                                  {subs.map((sub, si) => (
                                    <button
                                      key={sub.id}
                                      className="sub-chip"
                                      style={{ '--chip-color': stepColor(sub, si) } as React.CSSProperties}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        scrollToDate(subStart(sub))
                                      }}
                                      title={`${sub.title} — 시작점으로 이동`}
                                    >
                                      <span className="sub-chip-dot" />
                                      <span className="sub-chip-name">{sub.title || `세부 ${si + 1}`}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
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
                                  onContextMenu={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    // 우클릭한 가로 위치 → 막대 기간 내 날짜로 환산(마일스톤 추가용)
                                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                                    const offDays = Math.round((e.clientX - rect.left) / DAY_W)
                                    let d = addDays(parseDate(eff.start), offDays)
                                    if (d < parseDate(eff.start)) d = parseDate(eff.start)
                                    if (d > parseDate(eff.due)) d = parseDate(eff.due)
                                    onStepContextMenu(t, s.id, toISODate(d), e.clientX, e.clientY)
                                  }}
                                  title={`${s.title} · ${rangeLabel(eff.start, eff.due)} · ${pct}%`}
                                >
                                  {/* 진행도 채움 (막대 내부 띠) */}
                                  <span className="lane-fill" style={{ width: `${pct}%` }} />
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
                                    const leftPct = Math.min(100, Math.max(0, (off / span) * 100))
                                    return (
                                      <span
                                        key={m.id}
                                        className={'lane-ms' + (isMsDragged ? ' dragging' : '')}
                                        style={{ left: `${leftPct}%` }}
                                        title={`${m.title} · ${shortLabel(parseDate(effDate))}`}
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
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {m.title && <span className="lane-ms-label">{m.title}</span>}
                                        <span
                                          className="lane-ms-tri"
                                          style={{ borderTopColor: lineColor }}
                                        />
                                      </span>
                                    )
                                  })}
                                  <span
                                    className="bar-handle left"
                                    onPointerDown={(e) => startDrag(e, t, 'start', s)}
                                  />
                                  {/* 한 줄 정보: 제목 · 기간/% · 링크 */}
                                  <div className="lane-row-content">
                                    <span className={'lane-title' + (s.done ? ' sub-done' : '')}>
                                      {s.title}
                                    </span>
                                    <span className="lane-meta">
                                      {rangeLabel(eff.start, eff.due)} · {pct}%
                                    </span>
                                    {s.url && (
                                      <button
                                        className="lane-link"
                                        onPointerDown={(e) => e.stopPropagation()}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          window.open(s.url, '_blank', 'noopener')
                                        }}
                                        title="링크 열기"
                                      >
                                        <ExternalLink size={12} />
                                      </button>
                                    )}
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

      {/* 맨 아래 — 새 테스크 추가 + 차트 네비게이션 */}
      <div className="gantt-footer">
        <div
          className="gantt-add-zone"
          onClick={onCreateNew}
          onContextMenu={(e) => {
            e.preventDefault()
            onCreateNew()
          }}
          title="여기를 눌러 새 테스크 추가"
        >
          <Plus size={15} /> 새 테스크 추가
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
  )
}
