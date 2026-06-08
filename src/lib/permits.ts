// 권한 판단 — 멤버 명부(app_members) + 부트스트랩 관리자 기준.
// 강제 수준: 클라이언트(화면 게이팅). RLS 하드 강제는 후속 과제.
import type { AppRole, Member, Task } from '../types'

// 부트스트랩 관리자: 멤버 명부와 무관하게 항상 관리자.
export const ADMIN_EMAIL = 'yscho@nineware.co.kr'

const lc = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

// 이메일의 역할. 명부에 없으면 기본 'viewer'. 부트스트랩 관리자는 항상 'admin'.
export function roleOf(
  email: string | null | undefined,
  members: Record<string, Member>,
): AppRole {
  const e = lc(email)
  if (!e) return 'viewer'
  if (e === ADMIN_EMAIL) return 'admin'
  return members[e]?.role ?? 'viewer'
}

export function canManageMembers(role: AppRole): boolean {
  return role === 'admin'
}

// 새 태스크 생성: 관리자 또는 (담당 팀이 하나라도 있는) 편집자.
export function canCreate(role: AppRole, myTeams: string[]): boolean {
  if (role === 'admin') return true
  if (role === 'editor') return myTeams.length > 0
  return false
}

// 특정 태스크 편집 가능 여부.
//  admin: 전체 / editor: 담당 팀이거나 본인이 담당자(owner_email) / viewer: 불가
export function canEditTask(
  email: string | null | undefined,
  role: AppRole,
  myTeams: string[],
  task: Pick<Task, 'team' | 'owner_email'>,
): boolean {
  if (role === 'admin') return true
  if (role === 'viewer') return false
  // editor
  if (myTeams.includes(task.team)) return true
  if (task.owner_email && lc(task.owner_email) === lc(email)) return true
  return false
}
