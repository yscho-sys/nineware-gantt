import { useMemo } from 'react'
import type { Task } from '../types'
import { parseDate, daysBetween } from '../lib/dates'
import { projectColor } from '../lib/palette'

interface Props {
  tasks: Task[]
  today: Date
}

interface ProjectStat {
  name: string
  total: number
  done: number
  avg: number
  overdue: number
  color: string
}

// 프로젝트별로 전체 진행도를 분리해 카드로 보여준다.
export function ProjectSummary({ tasks, today }: Props) {
  const stats = useMemo<ProjectStat[]>(() => {
    const map = new Map<string, Task[]>()
    for (const t of tasks) {
      const key = t.project || '(미지정)'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'ko'))
      .map(([name, items], i) => {
        const total = items.length
        const avg = Math.round(items.reduce((s, t) => s + t.progress, 0) / total)
        const done = items.filter((t) => t.status === 'done').length
        const overdue = items.filter(
          (t) => t.status !== 'done' && daysBetween(today, parseDate(t.due_date)) < 0,
        ).length
        return { name, total, done, avg, overdue, color: projectColor(i) }
      })
  }, [tasks, today])

  if (stats.length === 0) return null

  return (
    <div className="summary-grid">
      {stats.map((s) => (
        <div className="summary-card" key={s.name}>
          <span className="card-accent" style={{ background: s.color }} />
          <div className="proj-head">
            <span className="proj-dot" style={{ background: s.color }} />
            <span className="proj-name" title={s.name}>
              {s.name}
            </span>
          </div>
          <div className="value" style={{ color: s.color }}>
            {s.avg}%
          </div>
          <div className="mini-bar">
            <div style={{ width: `${s.avg}%`, background: s.color }} />
          </div>
          <div className="sub">
            태스크 {s.total} · 완료 {s.done}
            {s.overdue > 0 && <span className="sub-overdue"> · 지연 {s.overdue}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
