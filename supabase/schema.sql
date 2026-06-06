-- 나인웨어 업무 대시보드 — tasks 테이블 스키마
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.

create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  project     text not null default '',
  team        text not null,
  title       text not null,
  status      text not null default 'planned'
              check (status in ('planned', 'in_progress', 'done', 'hold')),
  progress    int  not null default 0 check (progress between 0 and 100),
  start_date  date not null,
  due_date    date not null,
  slides_url  text,
  owner       text,
  notes       text,
  color       text,  -- 메인태스크 좌측 컬러 바 색 (미지정 시 상태색)
  -- 세부 단계: [{ id, title, url, done, progress, color, milestones }] 형태의 JSON 배열
  steps       jsonb not null default '[]'::jsonb,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 기존 테이블에 color 컬럼이 없으면 추가 (마이그레이션)
alter table public.tasks add column if not exists color text;

-- updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- RLS(행 수준 보안) 활성화
alter table public.tasks enable row level security;

-- v1: '나만 사용' 단계 — anon 키로 읽기/쓰기 허용.
-- (이후 팀 로그인 도입 시 이 정책을 인증 사용자 한정으로 교체)
drop policy if exists "tasks_anon_all" on public.tasks;
create policy "tasks_anon_all"
  on public.tasks
  for all
  to anon
  using (true)
  with check (true);
