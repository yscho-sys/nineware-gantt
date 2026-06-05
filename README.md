# 나인웨어 업무 대시보드 (nineware-gantt)

사내 진행 업무를 **팀별 간트차트**로 한눈에 보고, 각 태스크의 진행상황·목표일정을 확인하며,
연결된 **구글 슬라이드 문서로 바로 이동**할 수 있는 대시보드 웹앱.

## 스택
Vite + React + TypeScript + Supabase(DB) + Firebase Hosting

## 화면
- **상단 요약 카드**: 전체 진행률 / 전체 태스크 / 임박(7일 내) / 지연
- **간트 타임라인**: 팀별로 묶인 태스크 막대 (상태별 색, 진행률 채움, 오늘 빨간선)
- **편집 패널**: 막대/＋버튼 클릭 → 추가·수정·삭제, 슬라이드 링크 열기

## 로컬 실행
```bash
npm install
npm run dev          # http://localhost:5173
```
> `.env.local` 의 Supabase 값이 비어 있으면 **데모 모드**(샘플 데이터, localStorage 저장)로 동작합니다.
> 실데이터를 쓰려면 아래 Supabase 설정을 먼저 하세요.

## Supabase 설정 (실데이터 모드)
1. https://supabase.com 에서 새 프로젝트 생성
2. **SQL Editor** 에 [`supabase/schema.sql`](supabase/schema.sql) 내용을 붙여넣고 실행 (tasks 테이블 생성)
3. **Project Settings > API** 에서 두 값 복사
4. `.env.local` 에 채우기:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGc...
   ```
5. `npm run dev` 재시작 → 상단 '데모 모드' 배지가 사라지면 연결 성공

## 배포 (Firebase Hosting)
```bash
npm run build
firebase.cmd deploy --only hosting
```
> Firebase 프로젝트/사이트는 별도 설정 필요 (firebase init hosting).

## 데이터 구조 (tasks)
| 컬럼 | 의미 |
|------|------|
| team | 팀 (행 그룹화) |
| title | 태스크명 |
| status | planned / in_progress / done / hold |
| progress | 진행률 0~100 |
| start_date / due_date | 시작일 / 목표일 |
| slides_url | 구글 슬라이드 링크 |
| owner / notes | 담당자 / 메모 (선택) |
| sort_order | 팀 내 정렬 순서 |
