import {
  Plus,
  Settings2,
  Eye,
  EyeOff,
  ExternalLink,
  Database,
  Cloud,
} from 'lucide-react'
import type { QuickLink } from '../types'

export type ViewMode = 'timeline' | 'calendar' | 'board' | 'list'

interface Props {
  teams: string[]
  taskCounts: Record<string, number>
  hidden: Set<string>
  colorOf: (team: string) => string
  links: QuickLink[]
  demoMode: boolean
  onNewTask: () => void
  onToggleHidden: (team: string) => void
  onManageTeams: () => void
  onManageLinks: () => void
}

// 용량 게이지 (현재는 표시용 예시값 — Supabase/Firebase 연결 후 실제 수치로 교체 예정)
const USAGE = {
  db: { used: 18, total: 500, unit: 'MB' }, // Supabase 무료 500MB
  hosting: { used: 0.4, total: 10, unit: 'GB' }, // Firebase Hosting 10GB
}

function UsageBar({
  icon,
  label,
  used,
  total,
  unit,
}: {
  icon: React.ReactNode
  label: string
  used: number
  total: number
  unit: string
}) {
  const pct = Math.min(100, Math.round((used / total) * 100))
  const warn = pct >= 80
  return (
    <div className="usage-row" title={`${label}: ${used}${unit} / ${total}${unit} (${pct}%)`}>
      <span className="usage-icon">{icon}</span>
      <div className="usage-main">
        <div className="usage-top">
          <span>{label}</span>
          <span className="usage-num">
            {used}
            <span className="usage-unit">/{total}{unit}</span>
          </span>
        </div>
        <div className="usage-bar">
          <div style={{ width: `${pct}%`, background: warn ? '#f0502a' : '#2f6bff' }} />
        </div>
      </div>
    </div>
  )
}

export function Sidebar({
  teams,
  taskCounts,
  hidden,
  colorOf,
  links,
  demoMode,
  onNewTask,
  onToggleHidden,
  onManageTeams,
  onManageLinks,
}: Props) {
  return (
    <aside className="sidebar">
      <button className="new-task-btn" onClick={onNewTask}>
        <Plus size={16} /> 새 태스크
      </button>

      <div className="side-scroll">
        <div className="side-section">
          <div className="side-label">
            <span>팀</span>
            <button className="side-manage" onClick={onManageTeams} title="팀 관리">
              <Settings2 size={14} />
            </button>
          </div>
          {teams.map((team) => {
            const isHidden = hidden.has(team)
            return (
              <button
                key={team}
                className={'side-item team-item' + (isHidden ? ' muted' : '')}
                onClick={() => onToggleHidden(team)}
                title={isHidden ? '타임라인에 표시' : '타임라인에서 숨기기'}
              >
                <span className="team-dot" style={{ background: colorOf(team) }} />
                <span className="team-item-name">{team}</span>
                <span className="team-item-count">{taskCounts[team] ?? 0}</span>
                {isHidden ? (
                  <EyeOff size={14} className="eye" />
                ) : (
                  <Eye size={14} className="eye" />
                )}
              </button>
            )
          })}
          {teams.length === 0 && <div className="side-empty">팀이 없습니다</div>}
        </div>
      </div>

      {/* 바로가기 — 사이드바 하단(용량 패널 위)에 고정 */}
      <div className="side-section side-links">
        <div className="side-label">
          <span>바로가기</span>
          <button className="side-manage" onClick={onManageLinks} title="바로가기 관리">
            <Settings2 size={14} />
          </button>
        </div>
        {links.map((l) => (
          <a
            key={l.id}
            className="side-item link-item"
            href={l.url}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={13} className="link-ico" style={{ color: l.color }} />
            <span className="team-item-name">{l.name}</span>
          </a>
        ))}
        {links.length === 0 && <div className="side-empty">링크가 없습니다</div>}
      </div>

      {demoMode && (
        <div className="sidebar-demo" title="Supabase 미연결 — 샘플 데이터로 동작 중">
          데모 모드 · Supabase 미연결
        </div>
      )}

      <div className="usage-panel">
        <UsageBar
          icon={<Database size={13} />}
          label="DB"
          used={USAGE.db.used}
          total={USAGE.db.total}
          unit={USAGE.db.unit}
        />
        <UsageBar
          icon={<Cloud size={13} />}
          label="Hosting"
          used={USAGE.hosting.used}
          total={USAGE.hosting.total}
          unit={USAGE.hosting.unit}
        />
      </div>
    </aside>
  )
}
