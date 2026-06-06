// 프로젝트별 요약 카드에 순환 적용하는 색 — 프로젝트는 멀티컬러 유지
// (틸·블루·핑크·오렌지·퍼플·라임 계열)
export const PROJECT_COLORS = [
  '#2f6bff', // blue
  '#1fb89a', // teal/green
  '#e294d4', // pink
  '#8b7ff0', // purple
  '#f0a23a', // amber
  '#3ad0c0', // cyan
]

export function projectColor(index: number): string {
  return PROJECT_COLORS[index % PROJECT_COLORS.length]
}

// 팀 색 — 기본 UI는 블루+그레이 톤으로 단순화 (오렌지 등 포인트색 제외)
export const TEAM_COLORS = [
  '#2f6bff', // blue
  '#7d8694', // gray
  '#5b8def', // sky blue
  '#9aa3b2', // light gray
  '#3f5fb0', // deep blue
  '#5b6472', // slate gray
]

export function teamColor(index: number): string {
  return TEAM_COLORS[index % TEAM_COLORS.length]
}

// 팀/항목 색을 직접 고를 때 제공하는 스와치 (블루·그레이 위주 + 구분용 포인트색)
export const SELECTABLE_COLORS = [
  '#2f6bff', // blue
  '#5b8def', // sky blue
  '#3f5fb0', // deep blue
  '#7d8694', // gray
  '#9aa3b2', // light gray
  '#5b6472', // slate gray
  '#1fb89a', // teal
  '#3ad0c0', // cyan
  '#8b7ff0', // purple
  '#e294d4', // pink
  '#f0a23a', // amber
  '#f0502a', // orange
]

// 서브 태스크 색 — 색상환 고르게 분포한 다양한 팔레트 (비슷한 색 최소화)
export const STEP_COLORS = [
  '#2f6bff', // 파랑
  '#5b8def', // 하늘
  '#1fb89a', // 청록
  '#3ad0c0', // 시안
  '#22b455', // 초록
  '#8fce4a', // 라임
  '#f0a23a', // 주황
  '#f0c93a', // 노랑
  '#8b5a2b', // 브라운 (신규 추가)
  '#f0502a', // 빨강
  '#e2548a', // 핑크
  '#d24bd2', // 마젠타
  '#8b7ff0', // 보라
  '#7d8694', // 그레이
  '#cfd6e0', // 라이트그레이
]
