import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { X, Trash2, Plus, Check } from 'lucide-react'
import type { Task, TaskStep, Milestone } from '../types'
import { stepLinks } from '../types'
import { STEP_COLORS } from '../lib/palette'
import { StepLinksEditor } from './StepLinksEditor'

interface Props {
  task: Task
  step: TaskStep
  x: number
  y: number
  canEdit: boolean
  onUpdate: (patch: Partial<TaskStep>) => void
  onDelete: () => void
  onClose: () => void
}

const POP_W = 340

// 차트 위 세부 태스크 막대에서 바로 여는 인라인 편집 팝업.
// 제목·기간·진행/완료·비중·색·문서 링크(여러 개)·마일스톤·삭제를 측면 패널 없이 처리.
export function StepPopover({ task, step, x, y, canEdit, onUpdate, onDelete, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  // 텍스트/숫자 입력은 로컬 상태 → onBlur 시 커밋(키 입력마다 undo 기록 쌓이는 것 방지)
  const [title, setTitle] = useState(step.title)
  const [weight, setWeight] = useState(String(step.weight ?? 1))
  const [progress, setProgress] = useState(String(step.progress ?? (step.done ? 100 : 0)))
  const [msTitle, setMsTitle] = useState('')
  const [msDate, setMsDate] = useState(step.start_date || task.start_date)

  useEffect(() => {
    setTitle(step.title)
    setWeight(String(step.weight ?? 1))
    setProgress(String(step.progress ?? (step.done ? 100 : 0)))
  }, [step.id, step.title, step.weight, step.progress, step.done])

  // 바깥 클릭 / ESC 로 닫기
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // 화면 밖으로 나가지 않게 위치 보정 — 렌더 후 실제 높이를 재서 아래로 넘치면 위로 올림
  const [pos, setPos] = useState({ left: x, top: y })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const left = Math.max(8, Math.min(x, window.innerWidth - w - 8))
    let top = y
    if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8)
    setPos({ left, top })
  }, [x, y, step.id])

  const milestones = step.milestones ?? []
  const setMilestones = (next: Milestone[]) => onUpdate({ milestones: next })
  const addMilestone = () => {
    const t = msTitle.trim()
    if (!t) return
    setMilestones([...milestones, { id: 'ms-' + crypto.randomUUID(), title: t, date: msDate }])
    setMsTitle('')
  }

  return (
    <div
      ref={ref}
      className="step-pop"
      style={{ left: pos.left, top: pos.top, width: POP_W }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="step-pop-head">
        <span className="step-pop-dot" style={{ background: step.color || STEP_COLORS[0] }} />
        <span className="step-pop-titletext">세부 태스크 {canEdit ? '편집' : ''}</span>
        <button className="step-pop-x" onClick={onClose} aria-label="닫기">
          <X size={15} />
        </button>
      </div>

      {!canEdit ? (
        <div className="step-pop-body">
          <div className="step-pop-ro">{step.title || '(제목 없음)'}</div>
          <div className="step-pop-ro-meta">
            {step.start_date || task.start_date} ~ {step.due_date || task.due_date} ·{' '}
            {step.progress ?? (step.done ? 100 : 0)}%
          </div>
          <div className="step-pop-field">
            <span>문서 링크</span>
            <StepLinksEditor links={stepLinks(step)} onChange={() => {}} disabled />
          </div>
        </div>
      ) : (
        <div className="step-pop-body">
          {/* 제목 */}
          <input
            className="step-pop-titleinput"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title !== step.title && onUpdate({ title: title.trim() })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            placeholder="세부 태스크명"
          />

          {/* 기간 · 진행률 · 비중 · 완료 */}
          <div className="step-pop-grid">
            <label className="step-pop-field">
              <span>시작</span>
              <input
                type="date"
                value={step.start_date || task.start_date}
                onChange={(e) => onUpdate({ start_date: e.target.value })}
              />
            </label>
            <label className="step-pop-field">
              <span>종료</span>
              <input
                type="date"
                value={step.due_date || task.due_date}
                onChange={(e) => onUpdate({ due_date: e.target.value })}
              />
            </label>
            <label className="step-pop-field sm">
              <span>진행 %</span>
              <input
                type="number"
                min={0}
                max={100}
                value={progress}
                onChange={(e) => setProgress(e.target.value)}
                onBlur={() => {
                  const p = Math.max(0, Math.min(100, Number(progress) || 0))
                  onUpdate({ progress: p, done: p >= 100 })
                  setProgress(String(p))
                }}
              />
            </label>
            <label className="step-pop-field sm">
              <span>비중</span>
              <input
                type="number"
                min={0}
                step={0.5}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                onBlur={() => {
                  const w = Math.max(0, Number(weight) || 1)
                  onUpdate({ weight: w })
                  setWeight(String(w))
                }}
              />
            </label>
            <button
              className={'step-pop-done' + (step.done ? ' on' : '')}
              onClick={() => onUpdate({ done: !step.done, progress: !step.done ? 100 : 0 })}
              title="완료 토글"
            >
              <Check size={13} /> 완료
            </button>
          </div>

          {/* 색 — 한 줄 */}
          <div className="step-pop-swatches">
            {STEP_COLORS.map((c) => (
              <button
                key={c}
                className={'step-pop-sw' + ((step.color || '') === c ? ' on' : '')}
                style={{ background: c }}
                onClick={() => onUpdate({ color: c })}
                title={c}
              />
            ))}
          </div>

          {/* 문서 링크 (여러 개) */}
          <div className="step-pop-field">
            <span>문서 링크</span>
            <StepLinksEditor
              links={stepLinks(step)}
              onChange={(next) => onUpdate({ links: next, url: '' })}
            />
          </div>

          {/* 마일스톤 — 제목 한 줄 크게 + 컨트롤 한 줄 */}
          <div className="step-pop-field">
            <span>마일스톤</span>
            <div className="step-pop-ms-list">
              {milestones.map((m) => (
                <div className="ms-card" key={m.id}>
                  <input
                    className="ms-title"
                    value={m.title}
                    onChange={(e) =>
                      setMilestones(milestones.map((x) => (x.id === m.id ? { ...x, title: e.target.value } : x)))
                    }
                    placeholder="마일스톤 제목"
                  />
                  <div className="ms-ctrls">
                    <button
                      className={'ms-done' + (m.done ? ' on' : '')}
                      onClick={() =>
                        setMilestones(milestones.map((x) => (x.id === m.id ? { ...x, done: !x.done } : x)))
                      }
                      title="완료 토글"
                    >
                      <Check size={12} /> 완료
                    </button>
                    <input
                      className="ms-date"
                      type="date"
                      value={m.date}
                      onChange={(e) =>
                        setMilestones(milestones.map((x) => (x.id === m.id ? { ...x, date: e.target.value } : x)))
                      }
                    />
                    <button
                      className="lnk-iconbtn danger"
                      onClick={() => setMilestones(milestones.filter((x) => x.id !== m.id))}
                      title="마일스톤 삭제"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
              <div className="ms-card add">
                <input
                  className="ms-title"
                  value={msTitle}
                  onChange={(e) => setMsTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addMilestone()
                  }}
                  placeholder="새 마일스톤 제목"
                />
                <div className="ms-ctrls">
                  <input className="ms-date" type="date" value={msDate} onChange={(e) => setMsDate(e.target.value)} />
                  <button className="ms-add" onClick={addMilestone} title="마일스톤 추가">
                    <Plus size={13} /> 추가
                  </button>
                </div>
              </div>
            </div>
          </div>

          <button
            className="step-pop-delete"
            onClick={() => {
              if (confirm(`세부 태스크 "${step.title}" 를 삭제할까요?`)) {
                onDelete()
                onClose()
              }
            }}
          >
            <Trash2 size={14} /> 세부 태스크 삭제
          </button>
        </div>
      )}
    </div>
  )
}
