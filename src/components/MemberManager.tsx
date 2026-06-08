import { useState } from 'react'
import { X, UserPlus, Trash2 } from 'lucide-react'
import type { AppRole, Member } from '../types'
import { ROLE_LABELS } from '../types'
import { ADMIN_EMAIL } from '../lib/permits'

interface Props {
  members: Record<string, Member>
  teams: string[]
  onAdd: (email: string, role: AppRole, teams: string[], name?: string) => Promise<void>
  onUpdate: (email: string, patch: Partial<Member>) => Promise<void>
  onRemove: (email: string) => Promise<void>
  onClose: () => void
}

const ROLES: AppRole[] = ['viewer', 'editor', 'admin']

export function MemberManager({ members, teams, onAdd, onUpdate, onRemove, onClose }: Props) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<AppRole>('editor')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  const lc = (e: string) => e.trim().toLowerCase()

  const add = async () => {
    const e = lc(email)
    setStatus(null)
    if (!e || !e.includes('@')) {
      setStatus({ kind: 'err', msg: '올바른 이메일을 입력하세요.' })
      return
    }
    if (e === ADMIN_EMAIL) {
      setStatus({ kind: 'err', msg: '관리자 계정은 기본 포함되어 있습니다.' })
      return
    }
    if (members[e]) {
      setStatus({ kind: 'err', msg: '이미 추가된 사용자입니다.' })
      return
    }
    setBusy(true)
    try {
      await onAdd(e, role, [])
      setEmail('')
      setStatus({ kind: 'ok', msg: `${e} 님을 ${ROLE_LABELS[role]} 권한으로 추가했습니다.` })
    } catch (err) {
      setStatus({ kind: 'err', msg: `추가 실패: ${(err as Error).message}` })
    } finally {
      setBusy(false)
    }
  }

  const changeRole = async (e: string, r: AppRole) => {
    setBusy(true)
    try {
      await onUpdate(e, { role: r })
    } catch (err) {
      setStatus({ kind: 'err', msg: `변경 실패: ${(err as Error).message}` })
    } finally {
      setBusy(false)
    }
  }

  const toggleTeam = async (e: string, team: string) => {
    const cur = members[e]?.teams ?? []
    const next = cur.includes(team) ? cur.filter((t) => t !== team) : [...cur, team]
    setBusy(true)
    try {
      await onUpdate(e, { teams: next })
    } catch (err) {
      setStatus({ kind: 'err', msg: `변경 실패: ${(err as Error).message}` })
    } finally {
      setBusy(false)
    }
  }

  const remove = async (e: string) => {
    if (!confirm(`${e} 님의 접근 권한을 제거할까요? (제거 시 보기 전용으로 돌아갑니다)`)) return
    setBusy(true)
    try {
      await onRemove(e)
      setStatus({ kind: 'ok', msg: `${e} 님을 제거했습니다.` })
    } catch (err) {
      setStatus({ kind: 'err', msg: `제거 실패: ${(err as Error).message}` })
    } finally {
      setBusy(false)
    }
  }

  const entries = Object.values(members).sort((a, b) => a.email.localeCompare(b.email))

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="modal">
        <div className="drawer-head">
          <h2>멤버 · 권한 관리</h2>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            <X size={20} />
          </button>
        </div>

        <div className="drawer-body">
          <p className="member-hint">
            사내 구글 계정을 등록해 권한을 부여합니다. 등록되지 않은 사용자는 <b>보기 전용</b>입니다.
            <br />
            <b>관리자</b>: 전체 편집·멤버 관리 / <b>편집</b>: 담당 팀·담당 태스크 편집 / <b>보기</b>: 읽기만
          </p>

          <div className="add-team-row">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일 추가 (예: hong@nineware.co.kr)"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void add()
              }}
            />
            <select value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <button className="btn-primary" disabled={busy} onClick={() => void add()}>
              <UserPlus size={16} /> 추가
            </button>
          </div>

          {status && <div className={`member-status ${status.kind}`}>{status.msg}</div>}

          <div className="member-list">
            {/* 관리자(부트스트랩) — 고정 표시 */}
            <div className="member-row fixed">
              <div className="member-main">
                <span className="member-email">{ADMIN_EMAIL}</span>
                <span className="role-badge admin">{ROLE_LABELS.admin}</span>
              </div>
              <span className="member-fixed-note">기본 관리자</span>
            </div>

            {entries.map((m) => (
              <div key={m.email} className="member-row">
                <div className="member-main">
                  <span className="member-email">{m.email}</span>
                  <select
                    value={m.role}
                    onChange={(e) => void changeRole(m.email, e.target.value as AppRole)}
                    disabled={busy}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                  <button
                    className="icon-btn danger"
                    onClick={() => void remove(m.email)}
                    disabled={busy}
                    title="제거"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                {/* 편집자만 담당 팀 지정 */}
                {m.role === 'editor' && (
                  <div className="member-teams">
                    <span className="member-teams-label">담당 팀:</span>
                    {teams.map((t) => {
                      const on = (m.teams ?? []).includes(t)
                      return (
                        <button
                          key={t}
                          className={'team-chip' + (on ? ' on' : '')}
                          onClick={() => void toggleTeam(m.email, t)}
                          disabled={busy}
                        >
                          {t}
                        </button>
                      )
                    })}
                    {teams.length === 0 && <span className="member-fixed-note">팀이 없습니다</span>}
                  </div>
                )}
              </div>
            ))}
            {entries.length === 0 && (
              <div className="side-empty">등록된 멤버가 없습니다. 위에서 추가하세요.</div>
            )}
          </div>
        </div>

        <div className="drawer-foot">
          <button
            className="btn-primary"
            onClick={onClose}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            완료
          </button>
        </div>
      </div>
    </>
  )
}
