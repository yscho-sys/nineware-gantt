-- 나인웨어 업무 대시보드 — 버전 스냅샷 (v2 수동 저장/버전관리)
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.
-- [저장]을 누를 때마다 현재 전체 태스크를 1개 행(JSON)으로 보관 → 되돌리기(복원)용.
-- 무료 용량 절약을 위해 앱에서 최근 30개만 유지(초과분 자동 삭제).

create table if not exists public.task_versions (
  id         uuid primary key default gen_random_uuid(),
  snapshot   jsonb not null,        -- 저장 시점의 전체 tasks 배열
  label      text,                  -- 표시용 라벨(저장 시각 등)
  author     text,                  -- 저장한 사람 이메일
  created_at timestamptz not null default now()
);

alter table public.task_versions enable row level security;

drop policy if exists "task_versions_rw" on public.task_versions;
create policy "task_versions_rw"
  on public.task_versions
  for all
  to anon, authenticated
  using (true)
  with check (true);
