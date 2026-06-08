-- 나인웨어 업무 대시보드 — 멤버/권한 스키마 (v2 공유·권한)
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.

-- 앱 멤버 명부: 로그인 이메일 → 역할/담당팀
--  role: admin(전체 편집+멤버관리) / editor(담당 팀·담당 태스크 편집) / viewer(보기)
--  teams: editor 가 편집할 수 있는 팀 이름 목록
create table if not exists public.app_members (
  email      text primary key,
  name       text,
  role       text not null default 'viewer' check (role in ('admin','editor','viewer')),
  teams      text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.app_members enable row level security;

-- 권한 강제는 v2에서 클라이언트(화면 게이팅)로 처리 → 읽기/쓰기 모두 허용.
-- (UI에서 관리자만 쓰기 가능하도록 제한. RLS 하드 강제는 후속 과제.)
drop policy if exists "app_members_rw" on public.app_members;
create policy "app_members_rw"
  on public.app_members
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- 태스크 담당자를 로그인 계정(이메일)과 연결 — 담당자 본인 편집 권한 판단용.
alter table public.tasks add column if not exists owner_email text;
