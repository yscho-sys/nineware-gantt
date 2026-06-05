// 테스크 상태 — 간트바 색상과 요약 카드 분류의 기준
export type TaskStatus = 'planned' | 'in_progress' | 'done' | 'hold'

// 다크 테마용 색. 기본은 블루+그레이, 오렌지는 좁은 포인트(보류/지연)만 사용.
// color=막대 배경/점, text=막대 위 글자색
export const STATUS_META: Record<
  TaskStatus,
  { label: string; color: string; text: string }
> = {
  planned: { label: '예정', color: '#5b6472', text: '#ffffff' }, // 그레이
  in_progress: { label: '진행중', color: '#2f6bff', text: '#ffffff' }, // 블루(주색)
  done: { label: '완료', color: '#98a2b3', text: '#0c0d11' }, // 라이트 그레이
  hold: { label: '보류', color: '#f0502a', text: '#ffffff' }, // 오렌지(포인트)
}

export const STATUS_ORDER: TaskStatus[] = ['planned', 'in_progress', 'done', 'hold']

// 테스크의 세부 단계(과정). 클릭하면 link(구글 시트/슬라이드 등)로 이동.
export interface TaskStep {
  id: string
  title: string // 단계명 (예: 시장조사, 시안 검토)
  url: string // 구글 워크스페이스 링크 (시트/슬라이드/문서 등)
  done: boolean // 완료 여부
  weight?: number // 업무 비중 (상대값) — 전체 진행률 계산에 사용. 미지정 시 1(균등)
}

// 세부 단계 기준 진행률(%) — 완료된 단계의 비중 합 / 전체 비중 합.
// 비중 미지정(또는 0)이면 1로 간주해 균등 분배.
export function progressFromSteps(steps: TaskStep[]): number {
  if (!steps || steps.length === 0) return 0
  const w = (s: TaskStep) => (s.weight && s.weight > 0 ? s.weight : 1)
  const total = steps.reduce((sum, s) => sum + w(s), 0)
  if (total <= 0) return 0
  const done = steps.reduce((sum, s) => sum + (s.done ? w(s) : 0), 0)
  return Math.round((done / total) * 100)
}

// 하나의 업무 테스크
export interface Task {
  id: string
  project: string // 프로젝트 (요약 카드 분류 기준)
  team: string // 팀 (간트 행 그룹화 기준)
  title: string // 테스크명
  status: TaskStatus
  progress: number // 0~100
  start_date: string // 'YYYY-MM-DD'
  due_date: string // 'YYYY-MM-DD'
  slides_url: string | null // 대표 구글 슬라이드 링크
  owner: string | null // 담당자 (선택)
  notes: string | null // 메모 (선택)
  steps: TaskStep[] // 세부 단계 목록
  sort_order: number
  created_at?: string
  updated_at?: string
}

// 신규 작성/수정 시 폼에서 다루는 값 (id/타임스탬프 제외)
export type TaskDraft = Omit<Task, 'id' | 'created_at' | 'updated_at'>

// 사이드바 바로가기 링크 (추가/수정/삭제 가능)
export interface QuickLink {
  id: string
  name: string
  url: string
  color: string
}

// 팀별 기본 프로세스 템플릿 — 세부 단계 묶음을 저장해 두고 새 테스크에 불러와 사용
export interface ProcessTemplate {
  id: string
  name: string // 예: 신제품 개발 프로세스
  team: string // 소속 팀 ('' = 전체 공통)
  steps: { title: string; url: string }[]
}

// 기본 팀 목록 (팀 관리에서 추가/수정/삭제 가능)
export const DEFAULT_TEAMS = [
  '영업-마케팅(온라인)',
  '영업-마케팅(오프라인)',
  '디자인연구소(개발)',
  '제조본부',
]
