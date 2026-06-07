# 나인웨어 업무 대시보드 (nineware-gantt)

사내 진행 업무를 **팀별 간트차트**로 한눈에 보고, 각 태스크·세부테스크의 진행상황·일정·마일스톤을 관리하며,
연결된 **구글 워크스페이스 문서로 바로 이동**할 수 있는 대시보드 웹앱.

## 아키텍처 (중요: Firebase ≠ DB)

```
브라우저 (https://nw-task.web.app)
  └ React 앱 (Vite 빌드 정적 파일)
       │
       ├─ ① 정적 파일 서빙 ──▶ Firebase Hosting (site: nw-task)   ← "배포 대상"일 뿐, 코드 연결 없음
       │
       └─ ② 데이터 CRUD ─────▶ Supabase (tasks 테이블)            ← 앱이 코드로 연결하는 유일한 백엔드
```

- **데이터(실데이터)는 Supabase에만** 저장된다. 앱이 코드로 연결하는 백엔드는 Supabase 하나뿐(`src/lib/supabase.ts`, `@supabase/supabase-js`).
- **Firebase는 호스팅(정적 웹 배포)만** 담당한다. 앱 코드에 Firebase SDK는 없다. `dist/` 빌드 결과를 올리는 서버일 뿐.
- Supabase 키가 없으면(`.env.local` 비면) 자동으로 **데모 모드**(localStorage 샘플)로 동작 — `isSupabaseConfigured`로 판단.

## 스택
Vite + React + TypeScript + Supabase(DB) + Firebase Hosting

## 주요 기능
- **보기 4종**(헤더 세그먼트): 타임라인 · 달력 · 보드 · 목록.
- **간트 타임라인**: 팀 → 메인태스크(그룹 헤더) → 서브태스크(레인 압축 막대). 일/주/월 줌, 헤더 2단(월 행+요일/일자)·좌측 라벨·팀 헤더 sticky 고정. 드래그 편집해도 화면 리셋 안 됨.
- **메인태스크** = 막대 없는 묶음. 일정은 서브태스크 범위로 자동 계산. 진행률 = 서브 progress 가중평균. 좌측 컬러 바 색 지정(`color`), 라벨 드래그로 순서 변경.
- **서브태스크** = 겹치지 않으면 같은 레인에 패킹. 막대 안에 제목·기간·% 표시(스크롤해도 이름 따라옴), 완료는 검정 해치, 고유색(15색 팔레트). 끝점 드래그로 기간 조절.
- **마일스톤**: 막대 위 삼각형(▼, 날짜 칸 중앙)+텍스트. 우클릭 추가 / 드래그로 날짜 이동 / 편집창·우클릭·마커 클릭으로 **완료 토글**. 기한 지난 미완료는 **빨간 ⚠ + 점멸 경고**. 호버 시 `팀›메인›서브›마일스톤` 경로 툴팁.
- **달력 보기**: 월간 그리드(상하 스크롤로 월 이동). 마일스톤만 점+이름으로 표시(완료=초록·취소선, 기한초과=빨강).
- **편집 패널**: 서브태스크 카드형(접기·펼치기, 드래그 순서변경), 색 팝업, 진행률 슬라이더, 삭제 확인.
- **"서브태스크 N개 ▼"** 호버 시 칩 팝업(fixed, 안 잘림) → 클릭하면 해당 시작점으로 스크롤. 담당자 알약 표시.
- 구분선: 팀=흰 실선 / 프로젝트=흰 점선 / 월=세로 점선 / 오늘=빨간 선.

## 로컬 실행
```bash
npm install
npm run dev          # http://localhost:5173
```
> `.env.local` 의 Supabase 값이 비어 있으면 **데모 모드**(샘플 데이터)로 동작. 실데이터는 아래 설정.

## Supabase 설정 (실데이터 모드)
1. Supabase 프로젝트 > **SQL Editor** 에 [`supabase/schema.sql`](supabase/schema.sql) 실행 (tasks 테이블)
2. **Project Settings > API** 에서 두 값 복사 → `.env.local`:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGc...
   ```
3. `npm run dev` 재시작 → '데모 모드' 배지가 사라지면 연결 성공

## 배포 (Firebase Hosting)
```bash
npm run deploy   # = build + firebase deploy --only hosting:nw-task --project nineware-ai-app
```
> ⚠️ **호스팅 구분**: Firebase 프로젝트 `nineware-ai-app` 하나에 사이트가 여러 개 공존한다.
> - `nw-task` → **이 간트차트** (이 폴더, firebase.json에 고정)
> - `nw-mpt` / `nineware-ai-app` → **MPT(flowmap)** — 별도 레포
>
> 같은 Firebase 프로젝트를 공유하므로 **반드시 site 타겟(`nw-task`)을 명시**해 배포할 것. 타겟 없는 `firebase deploy`는 금지(서로 덮어쓸 위험). `npm run deploy`에 이미 타겟이 박혀 있어 안전.
> 인증 만료 시: `firebase login --reauth` (nineware-ai-app 권한 계정).

## 데이터 구조 (tasks)
| 컬럼 | 의미 |
|------|------|
| project / team | 프로젝트 / 팀 (행 그룹화) |
| title | 태스크명 |
| status | planned / in_progress / done / hold |
| progress | 진행률 0~100 (세부테스크 있으면 자동 계산) |
| start_date / due_date | 시작일 / 목표일 |
| slides_url | 구글 슬라이드 링크 |
| owner / notes | 담당자 / 메모 (선택) |
| steps | 세부테스크 배열(JSON): title·url·done·progress·color·weight·start_date·due_date·milestones |
| sort_order | 팀 내 정렬 순서 |
