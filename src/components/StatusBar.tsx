import { useMemo } from 'react'
import type { Task } from '../types'
import { parseDate, daysBetween } from '../lib/dates'

interface Props {
  tasks: Task[]
  today: Date
}

// 배터리 눈금 스타일 바 — fillPct 만큼 진한 눈금으로 채운다.
function TickBar({ pct, accent }: { pct: number; accent: string }) {
  const TICKS = 22
  const filled = Math.round((pct / 100) * TICKS)
  return (
    <div className="tick-bar">
      {Array.from({ length: TICKS }, (_, i) => (
        <span
          key={i}
          className="tick"
          style={{ background: i < filled ? accent : 'rgba(0,0,0,0.18)' }}
        />
      ))}
    </div>
  )
}

// 가로 진행 바
function MiniBar({ pct, accent }: { pct: number; accent: string }) {
  return (
    <div className="widget-bar">
      <div style={{ width: `${pct}%`, background: accent }} />
    </div>
  )
}

// 상단 한 줄 위젯형 현황판 (첨부 위젯 레퍼런스 톤: 라이트 카드 + 볼드 숫자 + 오렌지 포인트)
export function StatusBar({ tasks, today }: Props) {
  const stat = useMemo(() => {
    const total = tasks.length
    const avg = total === 0 ? 0 : Math.round(tasks.reduce((s, t) => s + t.progress, 0) / total)
    const inProgress = tasks.filter((t) => t.status === 'in_progress').length
    const done = tasks.filter((t) => t.status === 'done').length
    const donePct = total === 0 ? 0 : Math.round((done / total) * 100)
    const overdue = tasks.filter(
      (t) => t.status !== 'done' && daysBetween(today, parseDate(t.due_date)) < 0,
    ).length
    return { total, avg, inProgress, done, donePct, overdue }
  }, [tasks, today])

  const ORANGE = '#d4542a'
  const DARK = '#1a1a1a'

  return (
    <div className="statusbar">
      <div className="widget">
        <div className="widget-info">
          <div className="widget-label">전체 진행률</div>
          <div className="widget-value">
            {stat.avg}
            <span className="widget-unit">%</span>
          </div>
        </div>
        <TickBar pct={stat.avg} accent={DARK} />
      </div>

      <div className="widget">
        <div className="widget-info">
          <div className="widget-label">진행중</div>
          <div className="widget-value">
            {stat.inProgress}
            <span className="widget-unit">건</span>
          </div>
        </div>
        <MiniBar pct={stat.total ? (stat.inProgress / stat.total) * 100 : 0} accent={DARK} />
      </div>

      <div className="widget">
        <div className="widget-info">
          <div className="widget-label">완료</div>
          <div className="widget-value">
            {stat.done}
            <span className="widget-unit">/{stat.total}</span>
          </div>
        </div>
        <MiniBar pct={stat.donePct} accent={DARK} />
      </div>

      <div className={'widget' + (stat.overdue > 0 ? ' alert' : '')}>
        <div className="widget-info">
          <div className="widget-label">일정 지연</div>
          <div className="widget-value" style={{ color: stat.overdue > 0 ? ORANGE : undefined }}>
            {stat.overdue}
            <span className="widget-unit">건</span>
          </div>
        </div>
        <div className="widget-flag" style={{ background: stat.overdue > 0 ? ORANGE : '#cfd2d6' }} />
      </div>
    </div>
  )
}
