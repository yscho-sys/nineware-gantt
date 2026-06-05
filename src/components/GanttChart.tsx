import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Link2, Plus, Check } from 'lucide-react'
import type { Task, TaskStep } from '../types'
import { STATUS_META } from '../types'
import {
  parseDate,
  daysBetween,
  addDays,
  toISODate,
  isWeekend,
  isSameDay,
  weekdayLabel,
  rangeLabel,
} from '../lib/dates'

const DAY_W = 34 // 하루 칸 너비(px)

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
  colorOf: (team: string) => string
  onToggleTeam: (team: string) => void
  onSelect: (task: Task) => void
  onReschedule: (task: Task, startISO: string, dueISO: string) => void
  onRescheduleStep: (task: Task, stepId: string, startISO: string, dueISO: string) => void
  onToggleStep: (task: Task, stepId: string) => void
  onTaskContextMenu: (task: Task, x: number, y: number) => void
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
  colorOf,
  onToggleTeam,
  onSelect,
  onReschedule,
  onRescheduleStep,
  onToggleStep,
  onTaskContextMenu,
  onCreateNew,
  onAddStep,
}: Props) {
  const totalDays = daysBetween(rangeStart, rangeEnd) + 1
  const timelineWidth = totalDays * DAY_W

  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  dragRef.current = drag
  const dragging = !!drag

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
        <div className="gantt-label">팀 / 테스크</div>
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
          <div key={group.team}>
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
                  return (
                    <div className="gantt-row" key={t.id}>
                      <div className="gantt-label task-label">
                        <span className="nest-guide" style={{ background: teamCol }} />
                        <span className="label-bar" style={{ background: meta.color }} />
                        <span className="title" title={t.title}>
                          {t.title}
                        </span>
                        {overdue && <span className="overdue-flag">지연</span>}
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
                      </div>
                    </div>
                  )
                }

                // ── 세부 테스크가 있는 테스크: 그룹 헤더 + 세부 막대 행들 ──
                const taskClosed = closedTasks.has(t.id)
                const starts = subs.map((s) => parseDate(subStart(s)).getTime())
                const dues = subs.map((s) => parseDate(subDue(s)).getTime())
                const sumStart = toISODate(new Date(Math.min(...starts)))
                const sumDue = toISODate(new Date(Math.max(...dues)))
                const sg = geom(sumStart, sumDue)
                return (
                  <div key={t.id}>
                    {/* 테스크(그룹) 헤더 행 */}
                    <div className="gantt-row task-group-row">
                      <div className="gantt-label task-label" onClick={() => toggleTask(t.id)} style={{ cursor: 'pointer' }}>
                        <span className="nest-guide" style={{ background: teamCol }} />
                        {taskClosed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                        <span className="label-bar" style={{ background: meta.color }} />
                        <span className="title" title={t.title}>
                          {t.title}
                        </span>
                        <span className="step-chip" title={`세부 테스크 ${stepDone}/${subs.length}`}>
                          <Link2 size={11} />
                          {stepDone}/{subs.length}
                        </span>
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
                        {/* 요약 막대 (세부 테스크 전체 범위) */}
                        <div
                          className="summary-bar"
                          style={{ left: sg.left, width: sg.width, borderColor: meta.color }}
                          onClick={(e) => {
                            e.stopPropagation()
                            onSelect(t)
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            onTaskContextMenu(t, e.clientX, e.clientY)
                          }}
                          title={`${t.title} · 전체 ${t.progress}%`}
                        >
                          <div className="summary-fill" style={{ width: `${t.progress}%`, background: meta.color }} />
                          <span className="summary-text">{t.progress}%</span>
                        </div>
                      </div>
                    </div>

                    {/* 세부 테스크 막대 행들 */}
                    {!taskClosed &&
                      subs.map((s) => {
                        const isDragged = drag?.id === t.id && drag.stepId === s.id
                        const eff = isDragged
                          ? previewDates(drag)
                          : { start: subStart(s), due: subDue(s) }
                        const { left, width } = geom(eff.start, eff.due)
                        const subColor = s.done ? STATUS_META.done.color : meta.color
                        return (
                          <div className="gantt-row sub-row" key={s.id}>
                            <div className="gantt-label sub-label">
                              <span className="nest-guide" style={{ background: teamCol }} />
                              <button
                                className={'sub-check' + (s.done ? ' done' : '')}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onToggleStep(t, s.id)
                                }}
                                title={s.done ? '완료 해제' : '완료'}
                              >
                                {s.done && <Check size={11} />}
                              </button>
                              <span className={'title' + (s.done ? ' sub-done' : '')} title={s.title}>
                                {s.title}
                              </span>
                            </div>
                            <div className="gantt-timeline" style={{ width: timelineWidth }}>
                              {shades}
                              <div
                                className={'task-bar sub-bar' + (isDragged ? ' dragged' : '')}
                                style={{ left, width, background: subColor + '33' }}
                                onPointerDown={(e) => startDrag(e, t, 'move', s)}
                                onClick={(e) => e.stopPropagation()}
                                onContextMenu={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  onTaskContextMenu(t, e.clientX, e.clientY)
                                }}
                                title={`${s.title} · ${rangeLabel(eff.start, eff.due)}`}
                              >
                                <span className="bar-accent" style={{ background: subColor }} />
                                <span className="bar-handle left" onPointerDown={(e) => startDrag(e, t, 'start', s)} />
                                <div className="bar-body">
                                  <span className="bar-title">{s.title}</span>
                                  <span className="bar-sub">{rangeLabel(eff.start, eff.due)}</span>
                                </div>
                                <span className="bar-handle right" onPointerDown={(e) => startDrag(e, t, 'end', s)} />
                              </div>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                )
              })}
          </div>
        )
      })}

      {/* 맨 아래 — 새 테스크 추가 */}
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
    </div>
  )
}
