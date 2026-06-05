import { useMemo } from 'react'
import { ExternalLink, Link2 } from 'lucide-react'
import type { Task } from '../types'
import { STATUS_META } from '../types'
import { parseDate, daysBetween, shortLabel } from '../lib/dates'

interface Props {
  tasks: Task[]
  today: Date
  colorOf: (team: string) => string
  onSelect: (task: Task) => void
  onContextMenu: (task: Task, x: number, y: number) => void
}

// 목록(표) 뷰 — 목표일 기준 정렬
export function ListView({ tasks, today, colorOf, onSelect, onContextMenu }: Props) {
  const rows = useMemo(
    () => [...tasks].sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [tasks],
  )

  return (
    <div className="listview">
      <table className="list-table">
        <thead>
          <tr>
            <th>상태</th>
            <th>테스크</th>
            <th>프로젝트</th>
            <th>팀</th>
            <th>진행률</th>
            <th>기간</th>
            <th>단계</th>
            <th>링크</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const meta = STATUS_META[t.status]
            const overdue = t.status !== 'done' && daysBetween(today, parseDate(t.due_date)) < 0
            const stepTotal = t.steps?.length ?? 0
            const stepDone = t.steps?.filter((s) => s.done).length ?? 0
            return (
              <tr
                key={t.id}
                onClick={() => onSelect(t)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  onContextMenu(t, e.clientX, e.clientY)
                }}
              >
                <td>
                  <span className="list-status" style={{ color: meta.color }}>
                    <span className="status-dot" style={{ background: meta.color }} />
                    {meta.label}
                  </span>
                </td>
                <td className="list-title">{t.title}</td>
                <td className="list-muted">{t.project}</td>
                <td>
                  <span className="board-card-team">
                    <span className="team-dot sm" style={{ background: colorOf(t.team) }} />
                    {t.team}
                  </span>
                </td>
                <td>
                  <div className="list-progress">
                    <div className="list-progress-bar">
                      <div style={{ width: `${t.progress}%`, background: meta.color }} />
                    </div>
                    <span>{t.progress}%</span>
                  </div>
                </td>
                <td className={'list-muted' + (overdue ? ' list-overdue' : '')}>
                  {shortLabel(parseDate(t.start_date))} ~ {shortLabel(parseDate(t.due_date))}
                  {overdue && ' (지연)'}
                </td>
                <td className="list-muted">
                  {stepTotal > 0 ? (
                    <span className="step-chip">
                      <Link2 size={11} />
                      {stepDone}/{stepTotal}
                    </span>
                  ) : (
                    '–'
                  )}
                </td>
                <td>
                  {t.slides_url ? (
                    <a
                      href={t.slides_url}
                      target="_blank"
                      rel="noreferrer"
                      className="slides-link"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink size={14} />
                    </a>
                  ) : (
                    <span className="list-muted">–</span>
                  )}
                </td>
              </tr>
            )
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className="list-empty">
                표시할 테스크가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
