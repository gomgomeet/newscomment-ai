-- 루브릭 자동 생성 메타데이터
-- 원래 003으로 작성했으나 003~005를 질문 챗봇이 이미 쓰고 있어 006으로 옮겼다.
-- 열을 더하기만 하므로 이미 적용한 환경에서 다시 돌려도 안전하다.
alter table public.rubrics
add column if not exists auto_generated boolean not null default false,
add column if not exists generation_context jsonb not null default '{}'::jsonb;
