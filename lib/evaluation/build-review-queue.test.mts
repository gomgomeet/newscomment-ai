import assert from "node:assert/strict";
import test from "node:test";
import { buildEvaluationReviewQueue } from "./build-review-queue.ts";
import type { Database } from "@/lib/db/types";

type Project = Database["public"]["Tables"]["projects"]["Row"];
type Comment = Database["public"]["Tables"]["comments"]["Row"];
type Evaluation = Database["public"]["Tables"]["evaluations"]["Row"];
type Criterion = Database["public"]["Tables"]["rubric_criteria"]["Row"];
type Score = Database["public"]["Tables"]["evaluation_scores"]["Row"];

const now = "2026-08-29T00:00:00.000Z";

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    owner_id: "teacher-1",
    rubric_id: "rubric-1",
    title: "논증 평가",
    description: null,
    source_url: null,
    notion_source: {},
    status: "active",
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: "comment-1",
    project_id: "project-1",
    student_name: "김학생",
    content: "주장과 근거를 연결해 자신의 생각을 구체적으로 설명한 학생 결과물입니다.",
    metadata: {},
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function evaluation(overrides: Partial<Evaluation> = {}): Evaluation {
  return {
    id: "evaluation-1",
    project_id: "project-1",
    comment_id: "comment-1",
    evaluator_id: "teacher-1",
    assessment_prep_version_id: null,
    source: "ai-draft",
    status: "draft",
    confidence: 0.8,
    review_reasons: [],
    evaluation_forward: null,
    confirmed_at: null,
    revision: 1,
    change_reason: null,
    model_name: "test-model",
    total_score: 3,
    feedback: "초안 피드백",
    raw_output: {},
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function criterion(overrides: Partial<Criterion> = {}): Criterion {
  return {
    id: "criterion-1",
    rubric_id: "rubric-1",
    label: "근거 활용",
    description: "주장을 뒷받침하는 근거를 사용한다.",
    max_score: 5,
    sort_order: 0,
    created_at: now,
    ...overrides,
  };
}

function score(overrides: Partial<Score> = {}): Score {
  return {
    id: "score-1",
    evaluation_id: "evaluation-1",
    criterion_id: "criterion-1",
    score: 3,
    rationale: "원문 근거",
    created_at: now,
    ...overrides,
  };
}

test("미채점 Notion 결과물도 교사 확인 큐에 포함한다", () => {
  const result = buildEvaluationReviewQueue({
    projects: [project()],
    comments: [comment({ metadata: { notion_page_url: "https://www.notion.so/example" } })],
    evaluations: [],
    scores: [],
    criteria: [criterion()],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].notionPageUrl, "https://www.notion.so/example");
  assert.equal(result[0].signals.teacherReview, true);
  assert.deepEqual(result[0].priorityReasons, ["채점 시작 필요"]);
});

test("낮은 확신도와 근거 부족·재작성 사유를 선별한다", () => {
  const ai = evaluation({
    confidence: 0.45,
    review_reasons: ["원문 근거 부족", "재작성 권장"],
  });
  const result = buildEvaluationReviewQueue({
    projects: [project()],
    comments: [comment()],
    evaluations: [ai],
    scores: [score()],
    criteria: [criterion()],
  });

  assert.equal(result[0].signals.evidenceConcern, true);
  assert.equal(result[0].signals.rewriteRecommended, true);
  assert.ok(result[0].priorityReasons.includes("교사 미확정"));
  assert.ok(result[0].priorityReasons.includes("낮은 AI 확신도"));
});

test("교사 확정 점수·근거와 평가 포워드를 성장 기록 준비 상태로 연결한다", () => {
  const ai = evaluation();
  const teacher = evaluation({
    id: "evaluation-teacher",
    source: "teacher-manual",
    status: "confirmed",
    confidence: null,
    model_name: null,
    total_score: 5,
    feedback: "교사 확정 피드백",
    evaluation_forward: "다음 활동에서 반론 근거를 한 가지 더 제시하기",
    confirmed_at: now,
    change_reason: "원문에 제시된 구체적 근거를 추가로 확인함",
    revision: 2,
  });
  const result = buildEvaluationReviewQueue({
    projects: [project()],
    comments: [comment()],
    evaluations: [ai, teacher],
    scores: [
      score(),
      score({
        id: "score-teacher",
        evaluation_id: teacher.id,
        score: 5,
        rationale: "교사가 확인한 원문 근거",
      }),
    ],
    criteria: [criterion()],
  });

  assert.equal(result[0].signals.teacherReview, false);
  assert.equal(result[0].signals.growthReady, true);
  assert.equal(result[0].scoreDifference, 2);
  assert.equal(result[0].criteria[0].aiScore, 3);
  assert.equal(result[0].criteria[0].teacherScore, 5);
  assert.equal(result[0].criteria[0].teacherRationale, "교사가 확인한 원문 근거");
});

test("안전하지 않은 Notion 링크는 브라우저에 전달하지 않는다", () => {
  const result = buildEvaluationReviewQueue({
    projects: [project()],
    comments: [comment({ metadata: { notion_page_url: "javascript:alert(1)" } })],
    evaluations: [],
    scores: [],
    criteria: [],
  });

  assert.equal(result[0].notionPageUrl, null);
});
