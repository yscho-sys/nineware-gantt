import { useEffect, useRef, useState } from 'react'
import {
  X,
  Trash2,
  ExternalLink,
  Plus,
  Save,
  MapPin,
  GripVertical,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import type { Task, TaskDraft, TaskStatus, TaskStep, ProcessTemplate } from '../types'
import { STATUS_ORDER, STATUS_META, progressFromSteps, stepProgress } from '../types'
import { STEP_COLORS } from '../lib/palette'

function newStepId(): string {
  return 'step-' + crypto.randomUUID()
}

// '2026-03-02' → '3/2' (짧은 날짜 표기)
function shortDate(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}`
}

interface Props {
  // 편집 대상 Task, 또는 신규 작성 시 null
  task: Task | null
  isNew: boolean
  teams: string[] // 팀 드롭다운 목록
  projects: string[] // 프로젝트 자동완성 목록
  defaultStart: string
  defaultDue: string
  defaultTeam?: string // 빈공간 클릭 생성 시 채울 팀
  templates: ProcessTemplate[]
  onSave: (draft: TaskDraft) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onSaveTemplate: (name: string, team: string, steps: { title: string; url: string }[]) => void
  onClose: () => void
}

export function TaskEditPanel({
  task,
  isNew,
  teams,
  projects,
  defaultStart,
  defaultDue,
  defaultTeam,
  templates,
  onSave,
  onDelete,
  onSaveTemplate,
  onClose,
}: Props) {
  const [project, setProject] = useState('')
  const [team, setTeam] = useState('')
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<TaskStatus>('planned')
  const [progress, setProgress] = useState(0)
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [slidesUrl, setSlidesUrl] = useState('')
  const [owner, setOwner] = useState('')
  const [notes, setNotes] = useState('')
  const [steps, setSteps] = useState<TaskStep[]>([])
  const [saving, setSaving] = useState(false)
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null) // 색 팝업 열린 step id
  const [openSteps, setOpenSteps] = useState<Set<string>>(new Set()) // 펼친 카드 id
  const dragId = useRef<string | null>(null) // 드래그 중인 step id
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  function toggleOpen(id: string) {
    setOpenSteps((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 드래그로 순서 재정렬 — 드롭 대상 카드의 상/하 절반으로 삽입 위치 결정(위·아래 모두)
  function handleDrop(targetId: string, e: React.DragEvent) {
    const from = dragId.current
    dragId.current = null
    setDragOverId(null)
    if (!from || from === targetId) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const after = e.clientY > rect.top + rect.height / 2 // 대상 카드 아래쪽에 드롭 → 뒤에 삽입
    setSteps((prev) => {
      const arr = [...prev]
      const fromIdx = arr.findIndex((s) => s.id === from)
      let toIdx = arr.findIndex((s) => s.id === targetId)
      if (fromIdx < 0 || toIdx < 0) return prev
      const [moved] = arr.splice(fromIdx, 1)
      // 제거 후 대상 인덱스 재계산
      toIdx = arr.findIndex((s) => s.id === targetId)
      const insertIdx = after ? toIdx + 1 : toIdx
      arr.splice(insertIdx, 0, moved)
      return arr
    })
  }

  // 대상이 바뀌면 폼을 채운다
  useEffect(() => {
    setProject(task?.project ?? '')
    setTeam(task?.team ?? defaultTeam ?? teams[0] ?? '')
    setTitle(task?.title ?? '')
    setStatus(task?.status ?? 'planned')
    setProgress(task?.progress ?? 0)
    setStartDate(task?.start_date ?? defaultStart)
    setDueDate(task?.due_date ?? defaultDue)
    setSlidesUrl(task?.slides_url ?? '')
    setOwner(task?.owner ?? '')
    setNotes(task?.notes ?? '')
    // 서브 태스크 날짜가 비어 있으면 상위 태스크 일정으로 채워, 화면 표시값 = 저장될 값 이 되도록 한다.
    const baseStart = task?.start_date ?? defaultStart
    const baseDue = task?.due_date ?? defaultDue
    setSteps(
      (task?.steps ?? []).map((s) => ({
        ...s,
        start_date: s.start_date ?? baseStart,
        due_date: s.due_date ?? baseDue,
      })),
    )
  }, [task, defaultStart, defaultDue, defaultTeam, teams])

  function loadTemplate(id: string) {
    const tpl = templates.find((t) => t.id === id)
    if (!tpl) return
    const tplSteps = tpl.steps.map((s) => ({
      id: newStepId(),
      title: s.title,
      url: s.url,
      done: false,
      weight: 1,
    }))
    setSteps((prev) => {
      // 기존에 입력한 단계가 있으면 뒤에 이어 붙이고, 없으면 교체
      const meaningful = prev.filter((s) => s.title.trim() || s.url.trim())
      return meaningful.length ? [...meaningful, ...tplSteps] : tplSteps
    })
  }

  function saveAsTemplate() {
    const valid = steps.filter((s) => s.title.trim())
    if (valid.length === 0) {
      alert('저장할 단계가 없습니다. 단계를 먼저 추가하세요.')
      return
    }
    const name = prompt('템플릿 이름을 입력하세요', title.trim() || '새 프로세스')
    if (!name) return
    onSaveTemplate(
      name,
      team,
      valid.map((s) => ({ title: s.title.trim(), url: s.url.trim() })),
    )
    alert(`'${name}' 템플릿을 저장했습니다.`)
  }

  function addStep() {
    setSteps((prev) => [...prev, { id: newStepId(), title: '', url: '', done: false, weight: 1 }])
  }
  function updateStep(id: string, patch: Partial<TaskStep>) {
    setSteps((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s
        const next = { ...s, ...patch }
        // 완료 체크 ↔ 진행률 동기화: 체크 시 100, 진행률 100 입력 시 완료
        if (patch.done !== undefined) next.progress = patch.done ? 100 : 0
        else if (patch.progress !== undefined) next.done = patch.progress >= 100
        return next
      }),
    )
  }
  function removeStep(id: string) {
    const target = steps.find((s) => s.id === id)
    const name = target?.title.trim()
    if (!confirm(`'${name || '이 서브 태스크'}'를 삭제할까요?`)) return
    setSteps((prev) => prev.filter((s) => s.id !== id))
  }
  function openStep(url: string) {
    const u = url.trim()
    if (u) window.open(u, '_blank', 'noopener')
  }

  const canSave = project.trim() && team.trim() && title.trim() && startDate && dueDate && !saving

  // 세부 단계가 있으면 진행률은 비중 기반으로 자동 계산
  const hasSteps = steps.length > 0
  const derivedProgress = progressFromSteps(steps)
  const effectiveProgress = status === 'done' ? 100 : hasSteps ? derivedProgress : progress

  // 서브 태스크 일정의 최소 시작 ~ 최대 종료 (메인 기간 자동 계산용)
  const autoStart = hasSteps
    ? steps.map((s) => s.start_date || startDate).sort()[0]
    : startDate
  const autoDue = hasSteps
    ? steps.map((s) => s.due_date || dueDate).sort().slice(-1)[0]
    : dueDate
  const autoRangeLabel = `${autoStart} ~ ${autoDue}`

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      const draft: TaskDraft = {
        project: project.trim(),
        team: team.trim(),
        title: title.trim(),
        status,
        progress: effectiveProgress,
        // 서브 태스크가 있으면 메인 기간 = 세부 범위(자동). 없으면 입력값.
        start_date: hasSteps ? autoStart : startDate,
        due_date: hasSteps ? autoDue : dueDate,
        slides_url: slidesUrl.trim() || null,
        owner: owner.trim() || null,
        notes: notes.trim() || null,
        steps: steps
          .filter((s) => s.title.trim() || s.url.trim())
          .map((s) => ({ ...s, title: s.title.trim(), url: s.url.trim() })),
        // 시작일 기준 정렬값(epoch 일수) — integer 범위 내 작은 값
        sort_order: task?.sort_order ?? Math.floor((Date.parse(startDate) || 0) / 86400000),
      }
      await onSave(draft)
      onClose()
    } catch (e) {
      alert('저장 중 오류가 발생했습니다: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!task) return
    if (!confirm(`'${task.title}' 태스크를 삭제할까요?`)) return
    setSaving(true)
    try {
      await onDelete(task.id)
      onClose()
    } catch (e) {
      alert('삭제 중 오류가 발생했습니다: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-head">
          <h2>{isNew ? '새 태스크' : '태스크 편집'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            <X size={20} />
          </button>
        </div>

        <div className="drawer-body">
          <div className="field">
            <label>프로젝트 *</label>
            <input
              value={project}
              onChange={(e) => setProject(e.target.value)}
              list="project-list"
              placeholder="예: 6월 신제품 런칭"
            />
            <datalist id="project-list">
              {projects.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>

          <div className="field">
            <label>팀 *</label>
            <select value={team} onChange={(e) => setTeam(e.target.value)}>
              {!teams.includes(team) && team && <option value={team}>{team}</option>}
              {teams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>태스크명 *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="업무 이름"
            />
          </div>

          <div className="row-2">
            <div className="field">
              <label>상태</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_META[s].label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>담당자</label>
              <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="(선택)" />
            </div>
          </div>

          <div className="field">
            <label>진행률 — {effectiveProgress}%</label>
            {hasSteps && status !== 'done' ? (
              <div className="progress-auto">
                <div className="progress-auto-bar">
                  <div style={{ width: `${derivedProgress}%` }} />
                </div>
                <span className="progress-auto-note">서브 태스크 비중 기준 자동 계산</span>
              </div>
            ) : (
              <div className="range-row">
                <input
                  type="range"
                  className="range-fill"
                  style={{ '--fill': `${status === 'done' ? 100 : progress}%` } as React.CSSProperties}
                  min={0}
                  max={100}
                  step={5}
                  value={status === 'done' ? 100 : progress}
                  disabled={status === 'done'}
                  onChange={(e) => setProgress(Number(e.target.value))}
                />
              </div>
            )}
          </div>

          {/* 서브 태스크가 있으면 메인 일정은 세부 범위로 자동 계산되므로 입력란을 숨긴다.
              (메인태스크는 '프로젝트 묶음'일 뿐 — 차트 막대는 서브 태스크 일정으로만 그려진다) */}
          {hasSteps ? (
            <div className="field">
              <label>기간</label>
              <div className="auto-range-note">
                서브 태스크 일정으로 자동 계산 ({autoRangeLabel})
              </div>
            </div>
          ) : (
            <div className="row-2">
              <div className="field">
                <label>시작일 *</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                />
              </div>
              <div className="field">
                <label>목표일 *</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                />
              </div>
            </div>
          )}

          <div className="field">
            <label>구글 슬라이드 링크</label>
            <input
              value={slidesUrl}
              onChange={(e) => setSlidesUrl(e.target.value)}
              placeholder="https://docs.google.com/presentation/..."
            />
            {slidesUrl.trim() && (
              <a className="slides-link" href={slidesUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={14} /> 슬라이드 열기
              </a>
            )}
          </div>

          {/* 서브 태스크 — 생성 시 숨김, 편집 시에만 관리 (행에서 인라인 추가) */}
          {!isNew && (
          <div className="field">
            <div className="steps-head">
              <label>서브 태스크</label>
              <div className="steps-head-actions">
                <button className="add-step-btn" onClick={saveAsTemplate} type="button" title="현재 서브 태스크를 팀 프로세스 템플릿으로 저장">
                  <Save size={13} /> 템플릿 저장
                </button>
                <button className="add-step-btn" onClick={addStep} type="button">
                  <Plus size={14} /> 서브 태스크 추가
                </button>
              </div>
            </div>

            {templates.length > 0 && (
              <select
                className="tpl-select"
                value=""
                onChange={(e) => {
                  if (e.target.value) loadTemplate(e.target.value)
                }}
              >
                <option value="">＋ 프로세스 템플릿 불러오기…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.team ? ` · ${t.team}` : ''}
                  </option>
                ))}
              </select>
            )}
            <div className="steps-list">
              {steps.length === 0 && (
                <div className="steps-empty">
                  서브 태스크를 추가하고 구글 시트·슬라이드·문서 링크를 연결하세요.
                </div>
              )}
              {steps.map((s, i) => {
                const isOpen = openSteps.has(s.id)
                const sStart = s.start_date ?? startDate
                const sDue = s.due_date ?? dueDate
                return (
                <div
                  className={
                    'step-card' +
                    (isOpen ? ' open' : '') +
                    (dragOverId === s.id ? ' drag-over' : '') +
                    (colorPickerFor === s.id ? ' color-open' : '')
                  }
                  key={s.id}
                  onDragOver={(e) => {
                    if (dragId.current && dragId.current !== s.id) {
                      e.preventDefault()
                      setDragOverId(s.id)
                    }
                  }}
                  onDragLeave={() => setDragOverId((d) => (d === s.id ? null : d))}
                  onDrop={(e) => handleDrop(s.id, e)}
                >
                  {/* 헤더 — 항상 표시 (색·제목·날짜) */}
                  <div className="step-card-head">
                    <span
                      className="step-drag-handle"
                      draggable
                      onDragStart={() => {
                        dragId.current = s.id
                      }}
                      onDragEnd={() => {
                        dragId.current = null
                        setDragOverId(null)
                      }}
                      title="드래그로 순서 변경"
                    >
                      <GripVertical size={14} />
                    </span>
                    <div className="color-pick">
                      <button
                        type="button"
                        className="color-pick-current"
                        style={{ background: s.color ?? STEP_COLORS[0] }}
                        onClick={() => setColorPickerFor((p) => (p === s.id ? null : s.id))}
                        title="색상 선택"
                      />
                      {colorPickerFor === s.id && (
                        <>
                          <div className="color-pop-backdrop" onClick={() => setColorPickerFor(null)} />
                          <div className="color-pop">
                            {STEP_COLORS.map((c) => (
                              <button
                                key={c}
                                type="button"
                                className={'color-pop-swatch' + ((s.color ?? STEP_COLORS[0]) === c ? ' active' : '')}
                                style={{ background: c }}
                                onClick={() => {
                                  updateStep(s.id, { color: c })
                                  setColorPickerFor(null)
                                }}
                                title={c}
                              />
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                    <input
                      className={'step-title-input' + (s.done ? ' done' : '')}
                      value={s.title}
                      onChange={(e) => updateStep(s.id, { title: e.target.value })}
                      placeholder={`서브 태스크 ${i + 1} 이름`}
                    />
                    {!isOpen && (
                      <span className="step-card-dates">
                        {shortDate(sStart)}~{shortDate(sDue)}
                      </span>
                    )}
                    <button
                      className="step-card-toggle"
                      type="button"
                      onClick={() => toggleOpen(s.id)}
                      title={isOpen ? '접기' : '펼치기'}
                    >
                      {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </button>
                    <button
                      className="icon-btn danger"
                      type="button"
                      onClick={() => removeStep(s.id)}
                      title="서브 태스크 삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* 본문 — 펼침 시만 */}
                  {isOpen && (
                    <div className="step-card-body">
                      <div className="step-url-row">
                        <input
                          className="step-url-input"
                          value={s.url}
                          onChange={(e) => updateStep(s.id, { url: e.target.value })}
                          placeholder="구글 워크스페이스 링크 (시트/슬라이드/문서)"
                        />
                        <button
                          className="icon-btn"
                          type="button"
                          disabled={!s.url.trim()}
                          onClick={() => openStep(s.url)}
                          title="링크 열기"
                        >
                          <ExternalLink size={15} />
                        </button>
                      </div>
                      <div className="step-progress-row">
                        <span className="step-weight-label">진행률 {stepProgress(s)}%</span>
                        <input
                          type="range"
                          className="range-fill"
                          style={{ '--fill': `${stepProgress(s)}%` } as React.CSSProperties}
                          min={0}
                          max={100}
                          step={5}
                          value={stepProgress(s)}
                          onChange={(e) => updateStep(s.id, { progress: Number(e.target.value) })}
                        />
                      </div>
                      <div className="step-date-row">
                        <input
                          className="step-date-input"
                          type="date"
                          value={sStart}
                          onChange={(e) => updateStep(s.id, { start_date: e.target.value })}
                          onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                          title="서브 태스크 시작일"
                        />
                        <span className="step-date-sep">~</span>
                        <input
                          className="step-date-input"
                          type="date"
                          value={sDue}
                          onChange={(e) => updateStep(s.id, { due_date: e.target.value })}
                          onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                          title="서브 태스크 목표일"
                        />
                      </div>

                      {/* 마일스톤 목록 */}
                      <div className="ms-section">
                        <div className="ms-head">
                          <span className="step-weight-label">
                            <MapPin size={11} style={{ verticalAlign: '-1px' }} /> 마일스톤
                          </span>
                          <button
                            type="button"
                            className="add-step-btn"
                            onClick={() =>
                              updateStep(s.id, {
                                milestones: [
                                  ...(s.milestones ?? []),
                                  { id: 'ms-' + crypto.randomUUID(), title: '', date: sStart },
                                ],
                              })
                            }
                          >
                            <Plus size={12} /> 추가
                          </button>
                        </div>
                        {(s.milestones ?? []).map((m) => (
                          <div className="ms-row" key={m.id}>
                            <input
                              className="ms-title-input"
                              value={m.title}
                              placeholder="이정표 이름"
                              onChange={(e) =>
                                updateStep(s.id, {
                                  milestones: (s.milestones ?? []).map((x) =>
                                    x.id === m.id ? { ...x, title: e.target.value } : x,
                                  ),
                                })
                              }
                            />
                            <input
                              className="step-date-input ms-date-input"
                              type="date"
                              value={m.date}
                              onChange={(e) =>
                                updateStep(s.id, {
                                  milestones: (s.milestones ?? []).map((x) =>
                                    x.id === m.id ? { ...x, date: e.target.value } : x,
                                  ),
                                })
                              }
                              onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                            />
                            <button
                              className="icon-btn danger"
                              type="button"
                              onClick={() =>
                                updateStep(s.id, {
                                  milestones: (s.milestones ?? []).filter((x) => x.id !== m.id),
                                })
                              }
                              title="마일스톤 삭제"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                )
              })}
            </div>
          </div>
          )}

          <div className="field">
            <label>메모</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="(선택)" />
          </div>

          {!isNew && task && (
            <button className="btn-danger" onClick={handleDelete} disabled={saving}>
              <Trash2 size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />
              태스크 삭제
            </button>
          )}
        </div>

        <div className="drawer-foot">
          <button className="btn-ghost" onClick={onClose}>
            취소
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={!canSave}>
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </>
  )
}
