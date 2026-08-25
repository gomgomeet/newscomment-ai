-- 생각 카드 의미 검색 가속 (선택)
--
-- 004는 임베딩을 embedding_json에 저장하고 앱에서 유사도를 계산한다. 지문당 카드가
-- 수십 개인 지금 규모에서는 그것으로 충분하다. 카드가 크게 늘어 검색이 느려질 때만
-- 이 마이그레이션을 적용한다.
--
-- pgvector를 쓸 수 없는 환경에서는 적용하지 않아도 된다. 004만으로 동작한다.

create extension if not exists vector;

alter table public.questioning_thinking_cards
  add column if not exists embedding vector(768);

-- 카드 수가 적을 때는 인덱스 없이도 빠르다. 수천 장을 넘어설 때 아래를 켠다.
-- create index if not exists questioning_thinking_cards_embedding_idx
--   on public.questioning_thinking_cards using hnsw (embedding vector_cosine_ops);
