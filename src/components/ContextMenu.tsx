import { useEffect } from 'react'
import { Pencil, Copy, Trash2, ExternalLink, MapPin, Check } from 'lucide-react'
import type { Task, TaskStatus, Milestone } from '../types'
import { STATUS_ORDER, STATUS_META } from '../types'
import { parseDate, shortLabel } from '../lib/dates'
import { usePermit } from '../lib/permit'

interface Props {
  task: Task
  x: number
  y: number
  milestoneDate?: string // 세부 막대 우클릭 시 그 날짜 (마일스톤 추가용)
  milestones?: Milestone[] // 우클릭한 서브태스크의 마일스톤들 (완료 토글용)
  onAddMilestone?: () => void
  onToggleMilestone?: (milestoneId: string) => void
  onEdit: (task: Task) => void
  onDuplicate: (task: Task) => void
  onDelete: (task: Task) => void
  onSetStatus: (task: Task, status: TaskStatus) => void
  onClose: () => void
}

// 태스크 우클릭 컨텍스트 메뉴 — 마일스톤 추가 + 상태 변경 + 편집/복제/삭제
export function ContextMenu({
  task,
  x,
  y,
  milestoneDate,
  milestones,
  onAddMilestone,
  onToggleMilestone,
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

  const { canEdit } = usePermit()
  const editable = canEdit(task)

  const left = Math.min(x, window.innerWidth - 210)
  const top = Math.min(y, window.innerHeight - 280)

  const slides = task.slides_url?.trim()

  return (
    <div className="context-menu" style={{ left, top }} onClick={(e) => e.stopPropagation()}>
      <div className="ctx-title" title={task.title}>
        {task.title}
      </div>

      {editable && onAddMilestone && milestoneDate && (
        <>
          <button className="ctx-item" onClick={onAddMilestone}>
            <MapPin size={14} /> 마일스톤 추가 ({shortLabel(parseDate(milestoneDate))})
          </button>
          <div className="ctx-sep" />
        </>
      )}

      {/* 마일스톤 완료 확인 체크 */}
      {editable && onToggleMilestone && milestones && milestones.length > 0 && (
        <>
          <div className="ctx-label">마일스톤 완료 확인</div>
          {milestones.map((m) => (
            <button
              key={m.id}
              className={'ctx-item ctx-ms' + (m.done ? ' done' : '')}
              onClick={() => onToggleMilestone(m.id)}
            >
              <span className={'ctx-ms-check' + (m.done ? ' done' : '')}>
                {m.done && <Check size={11} />}
              </span>
              {m.title || '(이름 없음)'} · {shortLabel(parseDate(m.date))}
            </button>
          ))}
          <div className="ctx-sep" />
        </>
      )}

      {editable && (
        <button className="ctx-item" onClick={() => onEdit(task)}>
          <Pencil size={14} /> 편집 / 세부 단계
        </button>
      )}

      {slides && (
        <button
          className="ctx-item"
          onClick={() => window.open(slides, '_blank', 'noopener')}
        >
          <ExternalLink size={14} /> 슬라이드 열기
        </button>
      )}

      {editable ? (
        <>
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
        </>
      ) : (
        <>
          <div className="ctx-sep" />
          <div className="ctx-label">보기 권한 — 편집할 수 없습니다</div>
        </>
      )}
    </div>
  )
}
