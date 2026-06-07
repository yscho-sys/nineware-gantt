import { useMemo } from 'react'
import type { Task } from '../types'
import { STATUS_META } from '../types'
import { parseDate, isSameDay, daysBetween } from '../lib/dates'

interface Props {
  tasks: Task[]
  today: Date
  onSelect: (task: Task) => void
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const MONTHS_BACK = 2
const MONTHS_FWD = 9

function monthKey(y: number, m: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}`
}
function taskColor(t: Task): string {
  return t.color ?? STATUS_META[t.status].color
}

interface MsItem {
  task: Task
  title: string
  done: boolean
  color: string
  path: string // 팀 > 메인 > 서브 > 마일스톤
}

export function CalendarView({ tasks, today, onSelect }: Props) {
  const months = useMemo(() => {
    const arr: { year: number; month: number }[] = []
    const base = new Date(today.getFullYear(), today.getMonth(), 1)
    for (let i = -MONTHS_BACK; i <= MONTHS_FWD; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() + i, 1)
      arr.push({ year: d.getFullYear(), month: d.getMonth() })
    }
    return arr
  }, [today])

  // 날짜별 마일스톤 묶음
  function milestonesOn(date: Date): MsItem[] {
    const out: MsItem[] = []
    for (const t of tasks) {
      for (const s of t.steps ?? []) {
        for (const m of s.milestones ?? []) {
          if (isSameDay(parseDate(m.date), date)) {
            const overdue = !m.done && daysBetween(today, parseDate(m.date)) < 0
            const msName = m.title || '(이름 없음)'
            out.push({
              task: t,
              title: msName,
              done: !!m.done,
              color: m.done ? '#22b455' : overdue ? '#ff2d2d' : taskColor(t),
              path: `${t.team} › ${t.title} › ${s.title || '서브태스크'} › ${msName}`,
            })
          }
        }
      }
    }
    return out
  }

  return (
    <div className="cal-view">
      {months.map(({ year, month }) => {
        const first = new Date(year, month, 1)
        const startWeekday = first.getDay()
        const daysInMonth = new Date(year, month + 1, 0).getDate()
        const cells: (Date | null)[] = []
        for (let i = 0; i < startWeekday; i++) cells.push(null)
        for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
        while (cells.length % 7 !== 0) cells.push(null)

        return (
          <div className="cal-month" key={monthKey(year, month)}>
            <div className="cal-month-head">
              {year}년 {month + 1}월
            </div>
            <div className="cal-weekdays">
              {WEEKDAYS.map((w, i) => (
                <div key={w} className={'cal-wd' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '')}>
                  {w}
                </div>
              ))}
            </div>
            <div className="cal-grid">
              {cells.map((date, i) => {
                if (!date) return <div className="cal-cell empty" key={'e' + i} />
                const isToday = isSameDay(date, today)
                const dow = date.getDay()
                const ms = milestonesOn(date)
                return (
                  <div className={'cal-cell' + (isToday ? ' today' : '')} key={date.toISOString()}>
                    <div className={'cal-daynum' + (dow === 0 ? ' sun' : dow === 6 ? ' sat' : '')}>
                      {date.getDate()}
                    </div>
                    <div className="cal-ms-list">
                      {ms.map((m, mi) => (
                        <button
                          key={mi}
                          className={'cal-ms' + (m.done ? ' done' : '')}
                          style={{ '--ms-color': m.color } as React.CSSProperties}
                          title={`${m.path}${m.done ? ' · 완료' : ''}`}
                          onClick={() => onSelect(m.task)}
                        >
                          <span className="cal-ms-dot" />
                          <span className="cal-ms-name">{m.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
