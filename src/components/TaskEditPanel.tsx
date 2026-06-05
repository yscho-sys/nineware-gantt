import { useEffect, useState } from 'react'
import { X, Trash2, ExternalLink, Plus, Save } from 'lucide-react'
import type { Task, TaskDraft, TaskStatus, TaskStep, ProcessTemplate } from '../types'
import { STATUS_ORDER, STATUS_META, progressFromSteps } from '../types'

function newStepId(): string {
  return 'step-' + crypto.randomUUID()
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
    setSteps(task?.steps ?? [])
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
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }
  function removeStep(id: string) {
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
  const weightTotal = steps.reduce((s, x) => s + (x.weight && x.weight > 0 ? x.weight : 1), 0)

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
        start_date: startDate,
        due_date: dueDate,
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
                <span className="progress-auto-note">세부 단계 비중 기준 자동 계산</span>
              </div>
            ) : (
              <div className="range-row">
                <input
                  type="range"
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

          <div className="row-2">
            <div className="field">
              <label>시작일 *</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="field">
              <label>목표일 *</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

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

          {/* 세부 단계 — 단계명 + 구글 워크스페이스 링크 */}
          <div className="field">
            <div className="steps-head">
              <label>세부 단계</label>
              <div className="steps-head-actions">
                <button className="add-step-btn" onClick={saveAsTemplate} type="button" title="현재 단계를 팀 프로세스 템플릿으로 저장">
                  <Save size={13} /> 템플릿 저장
                </button>
                <button className="add-step-btn" onClick={addStep} type="button">
                  <Plus size={14} /> 단계 추가
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
                  단계를 추가하고 구글 시트·슬라이드·문서 링크를 연결하세요.
                </div>
              )}
              {steps.map((s, i) => (
                <div className="step-edit" key={s.id}>
                  <input
                    type="checkbox"
                    checked={s.done}
                    onChange={(e) => updateStep(s.id, { done: e.target.checked })}
                    title="완료 표시"
                  />
                  <div className="step-edit-fields">
                    <input
                      className="step-title-input"
                      value={s.title}
                      onChange={(e) => updateStep(s.id, { title: e.target.value })}
                      placeholder={`단계 ${i + 1} 이름`}
                    />
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
                    <div className="step-weight-row">
                      <span className="step-weight-label">업무 비중</span>
                      <input
                        className="step-weight-input"
                        type="number"
                        min={0}
                        value={s.weight ?? 1}
                        onChange={(e) =>
                          updateStep(s.id, { weight: Math.max(0, Number(e.target.value) || 0) })
                        }
                      />
                      <span className="step-weight-pct">
                        = {weightTotal > 0
                          ? Math.round(((s.weight && s.weight > 0 ? s.weight : 1) / weightTotal) * 100)
                          : 0}
                        %
                      </span>
                    </div>
                  </div>
                  <button
                    className="icon-btn danger"
                    type="button"
                    onClick={() => removeStep(s.id)}
                    title="단계 삭제"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

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
