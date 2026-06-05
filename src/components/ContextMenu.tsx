import { useEffect } from 'react'
import { Pencil, Copy, Trash2, ExternalLink } from 'lucide-react'
import type { Task, TaskStatus } from '../types'
import { STATUS_ORDER, STATUS_META } from '../types'

interface Props {
  task: Task
  x: number
  y: number
  onEdit: (task: Task) => void
  onDuplicate: (task: Task) => void
  onDelete: (task: Task) => void
  onSetStatus: (task: Task, status: TaskStatus) => void
  onClose: () => void
}

// 테스크 우클릭 컨텍스트 메뉴 — 상태 즉시 변경 + 편집/복제/삭제
export function ContextMenu({
  task,
  x,
  y,
  onEdit,
  onDuplicate,
  onDelete,
  onSetStatus,
  onClose,
}: Props) {
  useEffect(() => {
    const close = () => onClose()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const left = Math.min(x, window.innerWidth - 210)
  const top = Math.min(y, window.innerHeight - 280)

  const slides = task.slides_url?.trim()

  return (
    <div className="context-menu" style={{ left, top }} onClick={(e) => e.stopPropagation()}>
      <div className="ctx-title" title={task.title}>
        {task.title}
      </div>

      <button className="ctx-item" onClick={() => onEdit(task)}>
        <Pencil size={14} /> 편집 / 세부 단계
      </button>

      {slides && (
        <button
          className="ctx-item"
          onClick={() => window.open(slides, '_blank', 'noopener')}
        >
          <ExternalLink size={14} /> 슬라이드 열기
        </button>
      )}

      <div className="ctx-sep" />
      <div className="ctx-label">상태 변경</div>
      <div className="ctx-status-row">
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            className={'ctx-status' + (task.status === s ? ' active' : '')}
            style={{ borderColor: STATUS_META[s].color }}
            onClick={() => onSetStatus(task, s)}
            title={STATUS_META[s].label}
          >
            <span className="ctx-status-dot" style={{ background: STATUS_META[s].color }} />
            {STATUS_META[s].label}
          </button>
        ))}
      </div>

      <div className="ctx-sep" />
      <button className="ctx-item" onClick={() => onDuplicate(task)}>
        <Copy size={14} /> 복제 (분리 생성)
      </button>
      <button className="ctx-item danger" onClick={() => onDelete(task)}>
        <Trash2 size={14} /> 삭제
      </button>
    </div>
  )
}
