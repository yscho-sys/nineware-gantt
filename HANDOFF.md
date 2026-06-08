# nineware-gantt 인수인계 (HANDOFF)

> 마지막 업데이트: 2026-06-08 / 작성: v2(로그인·권한·수동저장·버전·드래그확인) 작업 직후

## 1. 프로젝트 개요
- **무엇**: 나인웨어 사내 업무 간트 대시보드 웹앱 ("업무진행 통합 대시보드"). 팀별 태스크를 간트/달력/보드/목록으로 보고, 서브태스크·마일스톤·구글워크스페이스 링크 관리.
- **스택**: Vite 6 + React 18 + TypeScript + Supabase(DB/Auth) + Firebase Hosting. 아이콘 lucide-react.
- **배포 URL**: https://nw-task.web.app
- **GitHub**: https://github.com/yscho-sys/nineware-gantt (브랜치 `main`)
- **경로**: `D:\00_AI_DEVELOP\nineware-gantt` (여러 PC에서 작업 — 시작 전 반드시 `git pull`)

## 2. 로컬에서 이어가기
```
cd D:\00_AI_DEVELOP\nineware-gantt
git pull origin main
npm install
# .env.local (git 미포함, 새 PC면 직접 생성):
#   VITE_SUPABASE_URL=https://litoyfjwgwyuiiyaqwkw.supabase.co
#   VITE_SUPABASE_ANON_KEY=<Supabase 대시보드 Settings>API Keys anon public>
#   VITE_ALLOWED_EMAIL_DOMAIN=nineware.co.kr
npm run dev        # http://localhost:5173
```
- `.env.local`이 비면 자동 데모 모드(로컬 샘플 + localStorage, 로그인 불필요, 전체 권한).

## 3. 배포
```
npm run build
firebase login --reauth     # 자격 만료 시(브라우저). 비대화형 환경에선 불가 → VS Code 터미널에서 직접
firebase.cmd deploy --only hosting:nw-task --project nineware-ai-app
git add -A && git -c commit.gpgsign=false commit -m "..." && git push origin main
```
- `gh`/`firebase` 모두 비대화형 로그인 불가 → 자격 만료 시 사용자가 터미널에서 직접 reauth.

## 4. v2에서 추가된 것 (이번 작업)
1. **로그인**: Supabase Google OAuth(`VITE_ALLOWED_EMAIL_DOMAIN`으로 @nineware.co.kr 제한). 실데이터 모드=로그인 필수, 데모 모드=로그인 없음. 상단 우측 계정 칩(아바타·이름·역할 배지·로그아웃). 파일: `src/lib/auth.tsx`, `src/lib/supabase.ts`, `src/components/LoginScreen.tsx`, `src/main.tsx`.
2. **권한(공유)**: 관리자 `yscho@nineware.co.kr`(부트스트랩 하드코딩, `src/lib/permits.ts` `ADMIN_EMAIL`). 역할 admin/editor/viewer, 미등록자=viewer. editor는 담당 팀 또는 본인이 담당자(owner_email)인 태스크만 편집. **강제는 클라이언트 화면 게이팅**(RLS 하드강제 아님). 파일: `src/lib/permit.tsx`(PermitProvider/usePermit), `src/lib/useMembers.ts`, `src/components/MemberManager.tsx`(관리자 멤버관리 모달). 게이팅 적용처: Sidebar 새태스크, GanttChart 드래그/마일스톤, ContextMenu, TaskEditPanel(읽기전용+담당계정 선택).
3. **수동 저장 + 버전 + undo/redo** (동기: **무료 DB 쓰기 절약**): `src/lib/useTasks.ts`를 작업본(working draft) 모델로 재작성. 모든 편집은 로컬에만(즉시저장 제거), 상단 **[저장](Ctrl+S)** 눌러야 일괄 upsert+삭제로 DB 1회 반영 + `task_versions` 스냅샷(최근 30). undo/redo(Ctrl+Z / Ctrl+Shift+Z, ref 기반=StrictMode 이중적재 방지). 미저장분 localStorage 백업→로드 시 복구 배너, 이탈 시 beforeunload 경고. 버전 복원: `src/components/VersionPanel.tsx`. 편집창 버튼 '저장'→'적용'(작업본 반영). 새 태스크 id=클라이언트 uuid.
4. **드래그 확인 팝업**: 막대/서브태스크/마일스톤 일정 드래그 종료 시 확인 후 적용. `src/components/ConfirmDialog.tsx` + GanttChart.
5. **UI 다듬기**: 서브태스크 막대 진행도 시각 띠(`.lane-fill`) 제거 → 단색화(진행률은 라벨 "· N%"). 라벨 텍스트칩(막대색·각진 사각형·`.lane-clip` 클리핑박스로 앞뒤 넘침 방지 + 가로스크롤 추종). 완료 막대 빗금(`.lane-bar.done`) 유지.

## 5. Supabase (DB)
- 프로젝트: `litoyfjwgwyuiiyaqwkw` (region ap-northeast-2). 전용 프로젝트(flowmap과 별개).
- 테이블/정책(모두 적용 완료): `tasks`(RLS `to anon, authenticated`), `app_members`(email/name/role/teams[]), `tasks.owner_email` 컬럼, `task_versions`(snapshot jsonb).
- 스키마 파일: `supabase/schema.sql`, `supabase/members.sql`, `supabase/versions.sql`.
- Auth: Google provider 활성(Client ID/Secret은 Google Cloud "Supabase Auth" OAuth 클라이언트). Redirect URLs: `http://localhost:5173/**`, `https://nw-task.web.app/**`. Site URL: `https://nw-task.web.app`.

## 6. 현재 상태 / 남은 일
- [x] v2 코드 구현, tsc + `npm run build` 통과, GitHub 푸시(commit `c150f6e`)
- [ ] **Firebase 배포** — 자격 만료로 미완. `firebase login --reauth` 후 위 deploy 명령 실행 필요.
- [ ] **브라우저 실테스트**(비개발자=사용자): 로그인 흐름, 권한 게이팅(보기 계정으로 편집 막힘), 수동저장/undo/redo/버전복원, 드래그 확인팝업, 이탈경고.
- 후속 후보: 권한 RLS 하드강제(현재는 화면 게이팅만), 용량 패널 실연동(미구현, 예시값), 실시간 동기화.

## 7. 주의사항(Gotchas)
- **여러 PC 작업** → 시작 전 `git fetch` + `git merge --ff-only origin/main`. 과거 로컬이 8커밋 뒤처져 사고 직전까지 간 적 있음. 온라인/원격이 진실.
- **무료 DB 절약**이 수동저장 도입의 핵심 동기. 편집을 즉시 저장하지 말 것.
- **수동저장**: 편집은 로컬에만, [저장] 눌러야 DB. 미저장 채로 닫으면 경고 + 복구 백업.
- 작업 방식: 검토→계획·컨펌→로컬테스트→컨펌→노트→배포. 비개발자라 검증 안 된 변경을 운영에 바로 올리지 말 것.
