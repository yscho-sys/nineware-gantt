-- 나인웨어 업무진행대시보드(TPT) — 메인태스크별 보기/수정 권한(ACL)
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요. (1회)
--
-- 모델: 태스크마다 '볼 사람(view_emails)'·'수정할 사람(edit_emails)'을 이메일로 지정.
--  - 관리자(yscho@nineware.co.kr)는 항상 전체 보기/수정.
--  - 담당자(owner_email)는 본인 태스크 보기/수정 가능.
--  - 그 외 사용자는 view_emails/edit_emails 에 포함될 때만 보임/수정 (기본 숨김).
--  강제 수준은 v2와 동일하게 클라이언트(화면 게이팅). RLS 하드 강제는 후속 과제.

alter table public.tasks add column if not exists view_emails text[] not null default '{}';
alter table public.tasks add column if not exists edit_emails text[] not null default '{}';

-- (참고) 기존 RLS 정책(tasks_all_access, to anon+authenticated)은 그대로 둡니다.
--  읽기/쓰기는 허용하되, 어떤 태스크를 '보여줄지'는 앱이 위 컬럼으로 필터링합니다.
