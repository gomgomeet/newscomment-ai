-- Supabase 대시보드에 손으로 붙여 넣기 위한 합본 — 마이그레이션 파일이 아니다.
--
-- migrations/ 밖에 두는 이유: 여기 두면 마이그레이션 도구가 003·004를 두 번
-- 적용하려 든다. 이 파일은 대시보드 SQL 편집기에 사람이 직접 붙여 넣을 때만 쓴다.
-- 정본은 migrations/003_*.sql과 migrations/004_*.sql이며, 스키마를 고칠 때는
-- 그쪽을 고치고 이 파일을 다시 만들어야 한다.
--
-- 003(수업 연결)과 004(생각 카드)를 합쳤다. 몇 번을 다시 돌려도 안전하도록
-- 트리거는 지웠다 다시 만든다. 이미 003이 적용된 환경에서도 그대로 돌아간다.
-- pgvector는 여기 없다. 필요해질 때 migrations/005를 따로 적용하면 된다.

-- updated_at 자동 갱신 함수 (001에 이미 있지만, 없을 때를 대비해 다시 만든다)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ===========================================================================
-- 003. 수업 연결 (004가 참조하므로 먼저)
-- ===========================================================================
create table if not exists public.questioning_lesson_connections (
  id uuid primary key default gen_random_uuid(),
  lesson_code text not null unique check (lesson_code ~ '^[A-Z0-9-]{4,32}$'),
  teacher_label text,
  lesson_title text,
  gemini_model text not null default 'gemini-2.5-flash',
  gemini_api_key_ciphertext text not null,
  notion_api_key_ciphertext text not null,
  notion_prep_database_id text not null,
  notion_result_database_id text not null,
  chatbot_config jsonb not null default '{}'::jsonb,
  student_chatbot_path text not null default '/questioning-chatbot',
  status text not null default 'active' check (status in ('active', 'archived')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists questioning_lesson_connections_lesson_code_idx
  on public.questioning_lesson_connections (lesson_code);

create index if not exists questioning_lesson_connections_status_idx
  on public.questioning_lesson_connections (status);

drop trigger if exists questioning_lesson_connections_set_updated_at on public.questioning_lesson_connections;
create trigger questioning_lesson_connections_set_updated_at
before update on public.questioning_lesson_connections
for each row execute function public.set_updated_at();

alter table public.questioning_lesson_connections enable row level security;

revoke all on table public.questioning_lesson_connections from anon, authenticated;
grant select, insert, update, delete on table public.questioning_lesson_connections to service_role;


-- ===========================================================================
-- 004. 생각 카드
-- ===========================================================================
-- ---------------------------------------------------------------------------
-- 1. 원본 지문
-- ---------------------------------------------------------------------------
create table if not exists public.questioning_documents (
  id uuid primary key default gen_random_uuid(),
  lesson_code text references public.questioning_lesson_connections (lesson_code) on delete set null,
  title text not null,
  body_text text not null default '',
  summary text not null default '',
  target_grade text,
  subject_unit text,
  standard text,
  -- 교사가 적은 대화 방향 메모. 대화설계 카드의 원본이 된다.
  teacher_memo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists questioning_documents_lesson_code_idx
  on public.questioning_documents (lesson_code);

drop trigger if exists questioning_documents_set_updated_at on public.questioning_documents;
create trigger questioning_documents_set_updated_at
before update on public.questioning_documents
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. 생각 카드
-- ---------------------------------------------------------------------------
create table if not exists public.questioning_thinking_cards (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.questioning_documents (id) on delete cascade,

  -- 카드 8종. dialogue_design은 교사 메모에서 나오는 카드로, 나머지 일곱 종과 달리
  -- 지문이 아니라 교사의 수업 의도를 담는다.
  card_type text not null check (
    card_type in (
      'vocabulary',
      'fact',
      'inference',
      'background',
      'research',
      'expected_question',
      'extension',
      'dialogue_design'
    )
  ),

  title text not null,
  summary text not null default '',
  content text not null default '',

  -- 이 정보가 어디서 왔는가. 답변에서 "지문 근거"와 "알려진 내용"을 가르는 기준이다.
  source_type text not null check (source_type in ('passage', 'inference', 'external', 'teacher', 'ai')),
  source_text text not null default '',
  source_location text not null default '',

  reasoning_type text check (
    reasoning_type in (
      'cause_effect',
      'comparison',
      'prediction',
      'intention',
      'generalization',
      'evidence',
      'problem_solution',
      'sequence'
    )
  ),

  -- 1.0 지문에 명확 / 0.8 근거 충분한 추론 / 0.6 여러 가능성 중 하나 / 0.4 확인 필요
  confidence numeric(3, 2) not null default 0.80 check (confidence >= 0 and confidence <= 1),

  -- 승인 대기 상태가 아니라 출처 등급이다. 지문·교사 카드는 검토 없이 바로 쓰고,
  -- 답변에서 verified > researched > inferred > needs_review 순으로 우선한다.
  knowledge_status text not null default 'inferred' check (
    knowledge_status in ('verified', 'researched', 'inferred', 'needs_review', 'outdated')
  ),

  student_level text,
  difficulty smallint check (difficulty between 1 and 5),
  keywords text[] not null default '{}',
  related_questions text[] not null default '{}',

  -- 예상질문카드 전용. 답을 여기 담지 않고 관련 카드를 잇는 라우터로 쓴다.
  question_intent text,
  related_card_ids uuid[] not null default '{}',

  -- 리서치카드 전용. A 정부·국제기구·학술 / B 주요 언론·전문기관 / C 일반 웹 / D 미검증.
  -- 학생 답변에는 A·B만 기본 사용한다.
  external_source_url text,
  external_source_title text,
  external_source_organization text,
  external_source_date date,
  source_reliability text check (source_reliability in ('A', 'B', 'C', 'D')),

  -- 대화설계카드 전용. 언제(trigger) 무엇을(prompt) 왜(goal) 묻는지.
  dialogue_trigger text,
  dialogue_prompt text,
  dialogue_goal text,

  -- 교사가 확인 화면에서 끈 카드는 여기서 false가 된다. 기본은 사용.
  is_enabled boolean not null default true,

  -- 임베딩 벡터를 숫자 배열로 저장한다. 모델을 바꾸면 차원이 달라질 수 있어
  -- 어떤 모델로 만들었는지 함께 남긴다.
  embedding_json jsonb,
  embedding_model text,

  parent_card_id uuid references public.questioning_thinking_cards (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists questioning_thinking_cards_document_idx
  on public.questioning_thinking_cards (document_id);

create index if not exists questioning_thinking_cards_type_idx
  on public.questioning_thinking_cards (document_id, card_type);

-- 답변에 쓸 카드만 빠르게 고르기 위한 인덱스
create index if not exists questioning_thinking_cards_usable_idx
  on public.questioning_thinking_cards (document_id, is_enabled, knowledge_status);

create index if not exists questioning_thinking_cards_keywords_idx
  on public.questioning_thinking_cards using gin (keywords);

drop trigger if exists questioning_thinking_cards_set_updated_at on public.questioning_thinking_cards;
create trigger questioning_thinking_cards_set_updated_at
before update on public.questioning_thinking_cards
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. 카드 간 연결
-- ---------------------------------------------------------------------------
-- related_card_ids로도 잇지만, 연결의 성격을 남기려면 별도 표가 필요하다.
-- 예: 사실카드 --supports--> 추론카드, 낱말카드 --explains--> 사실카드
create table if not exists public.questioning_card_relations (
  id uuid primary key default gen_random_uuid(),
  from_card_id uuid not null references public.questioning_thinking_cards (id) on delete cascade,
  to_card_id uuid not null references public.questioning_thinking_cards (id) on delete cascade,
  relation_type text not null check (
    relation_type in ('supports', 'explains', 'extends', 'contrasts', 'answers', 'follows')
  ),
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (from_card_id, to_card_id, relation_type),
  check (from_card_id <> to_card_id)
);

create index if not exists questioning_card_relations_from_idx
  on public.questioning_card_relations (from_card_id);

create index if not exists questioning_card_relations_to_idx
  on public.questioning_card_relations (to_card_id);

-- ---------------------------------------------------------------------------
-- 4. 학생 질문 기록
-- ---------------------------------------------------------------------------
-- 실제 학생 질문이 쌓이면 "생각 카드가 학생 궁금증을 얼마나 잘 예상했는가"를
-- 평가할 수 있고, 카드 생성 품질을 개선하는 근거가 된다.
create table if not exists public.questioning_student_questions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.questioning_documents (id) on delete set null,
  lesson_code text,
  -- 학생 실명은 저장하지 않는다. 학교_반_번호 형태의 식별값만 쓴다.
  student_key text,
  raw_question text not null,
  normalized_question text not null default '',
  question_intent text,
  used_card_ids uuid[] not null default '{}',
  answer_text text not null default '',
  answer_confidence numeric(3, 2) check (answer_confidence >= 0 and answer_confidence <= 1),
  answerable boolean,
  missing_information text,
  created_at timestamptz not null default now()
);

create index if not exists questioning_student_questions_document_idx
  on public.questioning_student_questions (document_id, created_at desc);

create index if not exists questioning_student_questions_lesson_idx
  on public.questioning_student_questions (lesson_code, created_at desc);

-- ---------------------------------------------------------------------------
-- 접근 제어
-- ---------------------------------------------------------------------------
-- 학생 브라우저는 이 표들에 직접 접근하지 않는다. 웹앱 서버(API)만 접근한다.
alter table public.questioning_documents enable row level security;
alter table public.questioning_thinking_cards enable row level security;
alter table public.questioning_card_relations enable row level security;
alter table public.questioning_student_questions enable row level security;

revoke all on table public.questioning_documents from anon, authenticated;
revoke all on table public.questioning_thinking_cards from anon, authenticated;
revoke all on table public.questioning_card_relations from anon, authenticated;
revoke all on table public.questioning_student_questions from anon, authenticated;

grant select, insert, update, delete on table public.questioning_documents to service_role;
grant select, insert, update, delete on table public.questioning_thinking_cards to service_role;
grant select, insert, update, delete on table public.questioning_card_relations to service_role;
grant select, insert, update, delete on table public.questioning_student_questions to service_role;
