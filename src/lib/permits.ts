// 권한 판단 — 메인태스크별 보기/수정 ACL(view_emails/edit_emails) + 부트스트랩 관리자.
// 강제 수준: 클라이언트(화면 게이팅). RLS 하드 강제는 후속 과제.
//
// 핵심 설계: 보기/수정 게이팅은 '태스크에 박힌 이메일 목록 + 로그인 이메일 + 하드코딩 관리자'만으로
// 판단한다. app_members(멤버 명부) 로드 성공 여부에 의존하지 않으므로, 명부가 비어도
// 권한이 viewer로 잘못 떨어져 편집이 잠기는 문제가 생기지 않는다.
import type { AppRole, Member, Task } from '../types'

// 부트스트랩 관리자: 멤버 명부와 무관하게 항상 관리자.
export const ADMIN_EMAIL = 'yscho@nineware.co.kr'

const lc = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()
const has = (list: string[] | null | undefined, email: string) =>
  !!list && list.some((x) => lc(x) === email)

export function isAdminEmail(email: string | null | undefined): boolean {
  return lc(email) === ADMIN_EMAIL
}

// 이메일의 역할(멤버 관리 UI·생성권한 판단용). 명부에 없으면 'viewer'. 관리자는 항상 'admin'.
export function roleOf(
  email: string | null | undefined,
  members: Record<string, Member>,
): AppRole {
  const e = lc(email)
  if (!e) return 'viewer'
  if (e === ADMIN_EMAIL) return 'admin'
  return members[e]?.role ?? 'viewer'
}

export function canManageMembers(email: string | null | undefined): boolean {
  return isAdminEmail(email)
}

// 태스크 보기 가능 여부.
//  관리자 / 담당자(owner_email) / view_emails·edit_emails 에 포함 → 보기 가능. 그 외 숨김.
export function canViewTask(
  email: string | null | undefined,
  task: Pick<Task, 'owner_email' | 'view_emails' | 'edit_emails'>,
): boolean {
  if (isAdminEmail(email)) return true
  const e = lc(email)
  if (!e) return false
  if (task.owner_email && lc(task.owner_email) === e) return true
  if (has(task.edit_emails, e)) return true // 수정 권한은 보기 포함
  if (has(task.view_emails, e)) return true
  return false
}

// 태스크 수정 가능 여부.
//  관리자 / 담당자(owner_email) / edit_emails 에 포함 → 수정 가능. 그 외 불가.
export function canEditTask(
  email: string | null | undefined,
  task: Pick<Task, 'owner_email' | 'edit_emails'>,
): boolean {
  if (isAdminEmail(email)) return true
  const e = lc(email)
  if (!e) return false
  if (task.owner_email && lc(task.owner_email) === e) return true
  if (has(task.edit_emails, e)) return true
  return false
}

// 권한(보기/수정 대상)을 부여·변경할 수 있는 사람: 관리자 또는 해당 태스크 담당자.
export function canGrantTask(
  email: string | null | undefined,
  task: Pick<Task, 'owner_email'>,
): boolean {
  if (isAdminEmail(email)) return true
  const e = lc(email)
  return !!e && !!task.owner_email && lc(task.owner_email) === e
}

// 새 태스크 생성: 관리자 또는 명부상 editor(담당 팀 보유) — 생성은 명부 기반 유지(보고된 버그와 무관).
export function canCreate(role: AppRole, myTeams: string[]): boolean {
  if (role === 'admin') return true
  if (role === 'editor') return myTeams.length > 0
  return false
}
