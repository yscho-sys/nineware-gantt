import { useMemo, useState } from 'react'
import { Link2 } from 'lucide-react'
import type { Task, TaskStatus } from '../types'
import { STATUS_ORDER, STATUS_META } from '../types'
import { rangeLabel } from '../lib/dates'

interface Props {
  tasks: Task[]
  colorOf: (team: string) => string
  onSelect: (task: Task) => void
  onContextMenu: (task: Task, x: number, y: number) => void
  onSetStatus: (task: Task, status: TaskStatus) => void
}

// 상태별 칸반 보드 — 카드를 다른 칼럼으로 드래그하면 상태 변경
export function BoardView({ tasks, colorOf, onSelect, onContextMenu, onSetStatus }: Props) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<TaskStatus | null>(null)

  const byStatus = useMemo(() => {
    const m: Record<TaskStatus, Task[]> = { planned: [], in_progress: [], done: [], hold: [] }
    for (const t of tasks) m[t.status].push(t)
    for (const s of STATUS_ORDER) m[s].sort((a, b) => a.sort_order - b.sort_order)
    return m
  }, [tasks])

  function drop(status: TaskStatus) {
    const task = tasks.find((t) => t.id === dragId)
    if (task && task.status !== status) onSetStatus(task, status)
    setDragId(null)
    setOverCol(null)
  }

  return (
    <div className="board">
      {STATUS_ORDER.map((status) => {
        const meta = STATUS_META[status]
        const items = byStatus[status]
        return (
          <div
            key={status}
            className={'board-col' + (overCol === status ? ' over' : '')}
            onDragOver={(e) => {
              e.preventDefault()
              setOverCol(status)
            }}
            onDrop={() => drop(status)}
          >
            <div className="board-col-head">
              <span className="status-dot" style={{ background: meta.color }} />
              <span className="board-col-title">{meta.label}</span>
              <span className="board-col-count">{items.length}</span>
            </div>
            <div className="board-col-body">
              {items.map((t) => (
                <div
                  key={t.id}
                  className="board-card"
                  style={{ borderLeftColor: meta.color }}
                  draggable
                  onDragStart={() => setDragId(t.id)}
                  onDragEnd={() => {
                    setDragId(null)
                    setOverCol(null)
                  }}
                  onClick={() => onSelect(t)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    onContextMenu(t, e.clientX, e.clientY)
                  }}
                >
                  <div className="board-card-title">{t.title}</div>
                  <div className="board-card-meta">
                    <span className="board-card-team">
                      <span className="team-dot sm" style={{ background: colorOf(t.team) }} />
                      {t.team}
                    </span>
                  </div>
                  <div className="board-card-sub">
                    <span>{t.project}</span>
                  </div>
                  <div className="board-progress">
                    <div
                      className="board-progress-fill"
                      style={{ width: `${t.progress}%`, background: meta.color }}
                    />
                  </div>
                  <div className="board-card-foot">
                    <span>{rangeLabel(t.start_date, t.due_date)}</span>
                    {(t.steps?.length ?? 0) > 0 && (
                      <span className="step-chip">
                        <Link2 size={11} />
                        {t.steps.filter((s) => s.done).length}/{t.steps.length}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {items.length === 0 && <div className="board-empty">없음</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
