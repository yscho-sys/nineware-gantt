// 태스크 상태 — 간트바 색상과 요약 카드 분류의 기준
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

// 마일스톤(키스톤) — 서브 태스크 기간 안의 중간 이정표. 막대 위 점으로 표시.
export interface Milestone {
  id: string
  title: string
  date: string // 'YYYY-MM-DD'
}

// 서브 태스크(과정). 각자 일정을 가지며 간트에서 레인 막대로 표시.
export interface TaskStep {
  id: string
  title: string // 서브 태스크명
  url: string // 구글 워크스페이스 링크 (시트/슬라이드/문서 등)
  done: boolean // 완료 여부
  progress?: number // 진행률 0~100. 미지정 시 done ? 100 : 0 으로 폴백
  color?: string // 서브 태스크 고유색. 미지정 시 간트에서 인덱스 기반 자동색
  weight?: number // 업무 비중 (상대값) — 전체 진행률 계산에 사용. 미지정 시 1(균등)
  start_date?: string // 'YYYY-MM-DD' (미지정 시 상위 태스크 일정 사용)
  due_date?: string // 'YYYY-MM-DD'
  milestones?: Milestone[] // 기간 내 중간 이정표(점)
}

// 서브 태스크 진행률(%) — progress 우선, 없으면 done 기준 폴백(하위호환).
export function stepProgress(s: TaskStep): number {
  if (s.progress != null) return s.progress
  return s.done ? 100 : 0
}

// 세부 단계 기준 전체 진행률(%) — 각 단계 진행률 × 비중의 가중평균.
// 비중 미지정(또는 0)이면 1로 간주해 균등 분배.
export function progressFromSteps(steps: TaskStep[]): number {
  if (!steps || steps.length === 0) return 0
  const w = (s: TaskStep) => (s.weight && s.weight > 0 ? s.weight : 1)
  const total = steps.reduce((sum, s) => sum + w(s), 0)
  if (total <= 0) return 0
  const done = steps.reduce((sum, s) => sum + (stepProgress(s) / 100) * w(s), 0)
  return Math.round((done / total) * 100)
}

// 하나의 업무 태스크
export interface Task {
  id: string
  project: string // 프로젝트 (요약 카드 분류 기준)
  team: string // 팀 (간트 행 그룹화 기준)
  title: string // 태스크명
  status: TaskStatus
  progress: number // 0~100
  start_date: string // 'YYYY-MM-DD'
  due_date: string // 'YYYY-MM-DD'
  slides_url: string | null // 대표 구글 슬라이드 링크
  owner: string | null // 담당자 (선택)
  notes: string | null // 메모 (선택)
  color?: string // 메인태스크 좌측 컬러 바 색 (미지정 시 상태색)
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

// 팀별 기본 프로세스 템플릿 — 세부 단계 묶음을 저장해 두고 새 태스크에 불러와 사용
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
