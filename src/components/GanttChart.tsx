import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Link2 } from 'lucide-react'
import type { Task } from '../types'
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
  id: string
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
  colorOf: (team: string) => string
  onToggleTeam: (team: string) => void
  onSelect: (task: Task) => void
  onReschedule: (task: Task, startISO: string, dueISO: string) => void
  onTaskContextMenu: (task: Task, x: number, y: number) => void
  onCreateAt: (team: string, startISO: string) => void
}

// 드래그 중인 태스크의 미리보기 시작/목표일 계산
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
  colorOf,
  onToggleTeam,
  onSelect,
  onReschedule,
  onTaskContextMenu,
  onCreateAt,
}: Props) {
  const totalDays = daysBetween(rangeStart, rangeEnd) + 1
  const timelineWidth = totalDays * DAY_W

  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  dragRef.current = drag
  const dragging = !!drag

  // 드래그 동안 window 에서 pointer 이동/해제 추적
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
          onReschedule(task, start, due)
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
  }, [dragging, tasks, onReschedule, onSelect])

  function startDrag(e: React.PointerEvent, t: Task, mode: DragMode) {
    e.stopPropagation()
    setDrag({
      id: t.id,
      mode,
      startClientX: e.clientX,
      origStart: t.start_date,
      origDue: t.due_date,
      deltaDays: 0,
      moved: false,
    })
  }

  const groups = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of tasks) {
      if (!map.has(t.team)) map.set(t.team, [])
      map.get(t.team)!.push(t)
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'ko'))
      .map(([team, items]) => ({
        team,
        items: [...items].sort((a, b) => a.sort_order - b.sort_order),
      }))
  }, [tasks])

  const ticks = useMemo(() => {
    const arr: { date: Date; left: number }[] = []
    for (let i = 0; i < totalDays; i++) arr.push({ date: addDays(rangeStart, i), left: i * DAY_W })
    return arr
  }, [rangeStart, totalDays])

  const todayCol = daysBetween(rangeStart, today)
  const todayLeft = todayCol * DAY_W
  const todayVisible = todayCol >= 0 && todayCol < totalDays

  // ── 타임라인 좌우 드래그(패닝) ──
  const scrollRef = useRef<HTMLDivElement>(null)
  const panRef = useRef<{ startX: number; startScroll: number; moved: boolean } | null>(null)
  const suppressClickRef = useRef(false)
  const [panning, setPanning] = useState(false)

  function onGanttPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return
    const el = e.target as HTMLElement
    // 막대/라벨/팀헤더 위에서는 패닝하지 않음 (각자 동작 보유)
    if (el.closest('.task-bar') || el.closest('.gantt-label') || el.closest('.team-header')) return
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
    if (pan.moved) suppressClickRef.current = true // 패닝 직후 클릭(생성) 억제
    scrollRef.current?.releasePointerCapture(e.pointerId)
    panRef.current = null
    setPanning(false)
  }

  // 빈 타임라인 클릭 → 해당 날짜/팀으로 새 태스크
  function handleTimelineClick(e: React.MouseEvent, team: string) {
    if (dragRef.current) return
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const dayIndex = Math.floor((e.clientX - rect.left) / DAY_W)
    if (dayIndex < 0) return
    onCreateAt(team, toISODate(addDays(rangeStart, dayIndex)))
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
        <div className="gantt-label">팀 / 태스크</div>
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

      {/* 팀 그룹 + 태스크 행 */}
      {groups.map((group) => {
        const isClosed = collapsed.has(group.team)
        const teamCol = colorOf(group.team)
        return (
          <div key={group.team}>
            <div className="team-header" onClick={() => onToggleTeam(group.team)}>
              <div className="gantt-label">
                <span className="label-bar" style={{ background: teamCol }} />
                {isClosed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                <span className="team-name">{group.team}</span>
                <span className="team-count">{group.items.length}</span>
              </div>
              <div className="gantt-timeline" style={{ width: timelineWidth }}>
                {shades}
              </div>
            </div>

            {!isClosed &&
              group.items.map((t) => {
                const meta = STATUS_META[t.status]
                const isDragged = drag?.id === t.id
                const eff = isDragged ? previewDates(drag) : { start: t.start_date, due: t.due_date }
                const { left, width } = geom(eff.start, eff.due)
                const overdue =
                  t.status !== 'done' && daysBetween(today, parseDate(eff.due)) < 0
                const stepTotal = t.steps?.length ?? 0
                const stepDone = t.steps?.filter((s) => s.done).length ?? 0
                return (
                  <div className="gantt-row" key={t.id}>
                    <div className="gantt-label task-label">
                      <span className="label-bar" style={{ background: meta.color }} />
                      <span className="title" title={t.title}>
                        {t.title}
                      </span>
                      {stepTotal > 0 && (
                        <span className="step-chip" title={`세부 단계 ${stepDone}/${stepTotal}`}>
                          <Link2 size={11} />
                          {stepDone}/{stepTotal}
                        </span>
                      )}
                      {overdue && <span className="overdue-flag">지연</span>}
                    </div>
                    <div
                      className="gantt-timeline clickable"
                      style={{ width: timelineWidth }}
                      onClick={(e) => handleTimelineClick(e, group.team)}
                      title="빈 곳을 클릭하면 이 팀에 새 태스크가 생성됩니다"
                    >
                      {shades}
                      <div
                        className={
                          'task-bar' +
                          (selectedId === t.id ? ' selected' : '') +
                          (isDragged ? ' dragged' : '')
                        }
                        style={{
                          left,
                          width,
                          background: meta.color + '2e',
                        }}
                        onPointerDown={(e) => startDrag(e, t, 'move')}
                        onClick={(e) => e.stopPropagation()}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          onTaskContextMenu(t, e.clientX, e.clientY)
                        }}
                        title={`${t.title} · ${meta.label} · ${t.progress}% (드래그로 일정 변경 · 우클릭 메뉴)`}
                      >
                        <span className="bar-accent" style={{ background: meta.color }} />
                        <div
                          className="bar-fill"
                          style={{ width: `${t.progress}%`, background: meta.color + '33' }}
                        />
                        <span
                          className="bar-handle left"
                          onPointerDown={(e) => startDrag(e, t, 'start')}
                        />
                        <div className="bar-body">
                          <span className="bar-title">{t.title}</span>
                          <span className="bar-sub">
                            {rangeLabel(eff.start, eff.due)} · {t.progress}%
                            {stepTotal > 0 && ` · 단계 ${stepDone}/${stepTotal}`}
                          </span>
                        </div>
                        <span
                          className="bar-handle right"
                          onPointerDown={(e) => startDrag(e, t, 'end')}
                        />
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
}
