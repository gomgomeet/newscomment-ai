-- 교사 미리보기 발화 표시
--
-- 연수생이 학생인 척 챗봇을 돌려 보면 그 발화가 학생 기록과 같은 표에 쌓인다.
-- 그대로 두면 참여 현황에 없는 학생이 잡히고, 질문 분석 평가에 연습 기록이 섞인다.
-- 미리보기 발화는 남기되(고칠 거리를 찾는 데 쓰인다) 집계에서는 뺀다.

alter table public.questioning_student_questions
  add column if not exists is_preview boolean not null default false;

-- 집계는 항상 실제 학생 기록만 본다.
create index if not exists questioning_student_questions_real_idx
  on public.questioning_student_questions (lesson_code, is_preview, created_at desc);
