import { useMemo } from 'react'
import type { Task } from '../types'
import { parseDate, daysBetween } from '../lib/dates'

interface Props {
  tasks: Task[]
  today: Date
}

// 한 줄 텍스트 + 1px 회색 트랙(진행분만 색상). 시선을 빼앗지 않는 미니멀 현황.
function Stat({
  label,
  value,
  pct,
  accent,
}: {
  label: string
  value: string
  pct: number
  accent: string
}) {
  return (
    <div className="stat">
      <div className="stat-line">
        <span className="stat-label">{label}</span>
        <span className="stat-value">{value}</span>
      </div>
      <div className="stat-track">
        <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: accent }} />
      </div>
    </div>
  )
}

// 상단 미니멀 현황 — 텍스트 한 줄 + 1px 막대
export function StatusBar({ tasks, today }: Props) {
  const stat = useMemo(() => {
    const total = tasks.length
    const avg = total === 0 ? 0 : Math.round(tasks.reduce((s, t) => s + t.progress, 0) / total)
    const inProgress = tasks.filter((t) => t.status === 'in_progress').length
    const done = tasks.filter((t) => t.status === 'done').length
    const donePct = total === 0 ? 0 : Math.round((done / total) * 100)
    const overdue = tasks.filter(
      (t) => t.status !== 'done' && daysBetween(today, parseDate(t.due_date)) < 0,
    ).length
    return { total, avg, inProgress, done, donePct, overdue }
  }, [tasks, today])

  const BLUE = '#5b8def'
  const ORANGE = '#f0502a'

  return (
    <div className="statusbar">
      <Stat label="전체 진행률" value={`${stat.avg}%`} pct={stat.avg} accent={BLUE} />
      <Stat
        label="진행중"
        value={`${stat.inProgress}건`}
        pct={stat.total ? (stat.inProgress / stat.total) * 100 : 0}
        accent={BLUE}
      />
      <Stat label="완료" value={`${stat.done}/${stat.total}`} pct={stat.donePct} accent={BLUE} />
      <Stat
        label="일정 지연"
        value={`${stat.overdue}건`}
        pct={stat.overdue > 0 ? 100 : 0}
        accent={ORANGE}
      />
    </div>
  )
}
