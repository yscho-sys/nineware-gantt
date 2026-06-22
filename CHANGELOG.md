# 변경 이력 (업무진행대시보드 · TPT · nw-task)

## 2026-06-22 — 이름 변경(TPT) · 권한 ACL 재설계 · 인라인 편집

### ✨ 이름/브랜드
- 툴 이름을 **업무진행대시보드 - Task Progress Tracker(TPT)** 로 명명.
  - 브라우저 탭 제목: `업무진행대시보드(TPT)`
  - 상단 로고 아래 + 로그인 화면: `업무진행대시보드 - Task Progress Tracker(TPT)`
  - PWA manifest name/short_name 갱신. (`index.html`, `vite.config.ts`, `App.tsx`, `LoginScreen.tsx`)

### 🔐 권한 모델 재설계 (메인태스크별 ACL)
- **DB**: `tasks`에 `view_emails[]`·`edit_emails[]` 컬럼 추가(`supabase/acl.sql`). 기존 팀 권한은 일회성 SQL로 이관.
- **게이팅 재작성**(`lib/permits.ts`, `lib/permit.tsx`, `App.tsx`): 보기/수정 판정을 **태스크에 박힌 이메일 + 로그인 이메일 + 하드코딩 관리자**만으로 수행. `app_members` 로드 여부에 의존하지 않아, 역할이 viewer로 잘못 떨어져 **편집이 잠기던 버그 해결**(권한 로직 단위테스트 통과).
  - 관리자(yscho)=전체 / 담당자(owner_email)=본인 태스크 / edit_emails=수정 / view_emails=보기(수정은 보기 포함).
- **기본 숨김**: 관리자가 아니면 권한 받은 태스크만 표시(타임라인·보드·목록·달력·요약·라벨폭 전부 필터). 신규 생성 시 작성자 자동 포함.
- **권한 부여 UI**: 태스크 편집 패널에 ‘접근 권한’ 섹션(사람별 보기/수정 칩). 관리자·담당자만 부여.

### 🧩 사용성
- **기본 접힘**: 세부 보유 메인태스크는 접은 채 시작(펼치면 유지). (`GanttChart`)
- **세부 태스크 풀 인라인 편집**: 막대 우클릭/호버 ✎ → 팝업에서 제목·기간·진행률·비중·색·완료·삭제·마일스톤까지 측면 패널 없이 처리(`StepPopover`). 화면 높이 자동 보정으로 스크롤 최소화.
- **마일스톤 카드형**: 제목 입력 한 줄 전체 폭 + 완료·날짜·삭제 한 줄.
- **세부 태스크 문서 링크 여러 개**: 이름+URL 다중 등록/삭제/열기(`StepLinksEditor`, 팝업·편집패널 공용). 막대 끝 링크 아이콘에 개수 배지. 기존 단일 링크 자동 호환. (steps jsonb 내 저장 — DB 변경 없음)

### 🚀 배포
- Firebase Hosting site `nw-task`: https://nw-task.web.app
