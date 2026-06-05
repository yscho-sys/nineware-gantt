// 날짜 관련 유틸 — 'YYYY-MM-DD' 문자열 기준으로 다룬다.

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function parseDate(s: string): Date {
  // 'YYYY-MM-DD' → 로컬 자정 기준 Date
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 두 날짜 사이의 일수 (b - a). 같은 날이면 0.
export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY)
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

// 'M/D' 짧은 표기
export function shortLabel(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function isWeekend(d: Date): boolean {
  const day = d.getDay()
  return day === 0 || day === 6
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export function weekdayLabel(d: Date): string {
  return WEEKDAYS[d.getDay()]
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

// 'M/D ~ M/D' 기간 표기
export function rangeLabel(start: string, due: string): string {
  return `${shortLabel(parseDate(start))} ~ ${shortLabel(parseDate(due))}`
}
