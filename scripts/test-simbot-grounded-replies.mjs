import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

// Exercise the actual shared engine and Lite adapter with synthetic provider
// replies. No network, provider credentials, or live student data are used.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      return { url: pathToFileURL(path.join(root, `${specifier.slice(2)}.ts`)).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && url.endsWith('.ts')) {
      return {
        format: 'module',
        source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
          compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        }).outputText,
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const { createLiteEnginePlan, finalizeLiteEngineReply } = await import('../lib/lite-engine-plan.ts');
const articles = JSON.parse(readFileSync(path.join(root, 'evals/questioning-chatbot/fixtures/articles.json'), 'utf8'));

// Teacher's 347-character demonstration passage from the reported incident.
// It is deliberately kept separate from engine code, so matching one passage
// cannot make unrelated fixtures pass.
const cafeteriaSentences = {
  methods: '푸른초등학교는 급식 잔반을 줄이기 위해 학생들이 반찬 양을 스스로 고르는 선택제와 잔반 게시판을 운영했다.',
  before: '예전에는 하루에 큰 통 세 통이 넘는 잔반이 나왔고, 처리 비용도 적지 않았다.',
  choice: '학교는 반찬을 받을 때 조금, 보통, 많이 가운데 먹을 양을 고르게 하고, 학급별 잔반 무게를 게시판에 붙였다.',
  result: '그 결과 하루 세 통이 넘던 잔반이 한 통 반으로 줄었고, 학생들은 먹을 만큼만 받으면 다 먹기 쉽다는 점을 알게 되었다.',
  dessert: '학교는 음식 낭비가 줄어든 만큼 아낀 돈으로 과일 후식을 늘릴 계획이며, 전문가는 잔반 줄이기가 학교와 지구를 함께 지키는 실천이라고 설명했다.',
};
const cafeteria = {
  id: 'teacher-cafeteria-regression',
  title: '[점검용] 급식실 남은 음식, 석 달 만에 절반으로',
  text: `이 자료는 기존 웹 챗봇의 동작 점검용 예시입니다.\n\n${Object.values(cafeteriaSentences).join(' ')}`,
};
const rooftop = articles.find((article) => article.id === 'article-b');
assert.ok(rooftop, 'the independent rooftop fixture must exist');
assert.equal(cafeteria.text.length, 347, 'preserve the incident passage exactly');

function inputFor(question, article = cafeteria, options = {}) {
  return {
    schemaVersion: 1,
    requestId: 'synthetic-grounded-regression',
    sessionKey: 'synthetic-grounded-regression',
    activityMode: 'exploration',
    supportedOutputContracts: ['grounded_answer_v2', 'lead_evidence_quote_v1'],
    studentMessage: question,
    history: [],
    lesson: {
      lessonId: article.id,
      subject: '국어',
      grade: '초등 4학년',
      lessonTitle: article.title,
      lessonGoal: '',
      achievementStandard: '',
      assessmentCriteria: '',
      rubricHigh: '',
      rubricMeet: '',
      rubricDeveloping: '',
      evidenceDescription: '',
      materialTitle: article.title,
      materialText: article.text,
      startQuestion: '자료를 읽고 궁금한 점을 물어보세요.',
      version: 'v1',
      sourceHash: 'synthetic-fixture-source-hash',
      lessonRevision: 1,
    },
    ...options,
  };
}

function finalize(input, plan, answer, evidenceQuote) {
  return finalizeLiteEngineReply({
    ...input,
    policyVersion: plan.policyVersion,
    planDigest: plan.planDigest,
    candidateReply: answer,
    candidateEvidenceQuote: evidenceQuote,
  });
}

function assertDirectAnswer(input, answer, evidenceQuote, sourcePattern) {
  const plan = createLiteEnginePlan(input);
  assert.equal(plan.modelRequest.outputContract, 'grounded_answer_v2');
  assert.equal(plan.skipModel, false, `model must be allowed: ${JSON.stringify(plan.observation)}`);
  assert.match(plan.observation.sourceCue, sourcePattern);
  assert.ok(input.lesson.materialText.includes(evidenceQuote), 'fixture evidence must be verbatim');
  assert.ok(plan.observation.sourceCue.includes(evidenceQuote), `relevant excerpt omitted answer evidence: ${plan.observation.sourceCue}`);
  const result = finalize(input, plan, answer, evidenceQuote);
  assert.equal(result.localFallback, false, 'a relevant, safe provider answer must be accepted');
  assert.ok(result.studentReply.startsWith(answer), `direct answer must come first: ${result.studentReply}`);
  assert.doesNotMatch(result.studentReply, /자료로 확인되는 건 여기까지|이 근거로 한 가지 가능성|자료에서 함께 확인해 볼게요/);
  assert.equal(result.observation.sourceCue, evidenceQuote);
  assert.equal(result.observation.sourceStatus, plan.observation.sourceStatus, 'a paraphrase cannot increase evidence certainty');
  return { plan, result };
}

test('incident: quantity answer starts with the final amount, without the dessert draft', () => {
  const input = inputFor('글에서 줄어든 잔반은 최종적으로 하루 몇 통인가요?');
  const { result } = assertDirectAnswer(input, '하루 한 통 반으로 줄었어요.', cafeteriaSentences.result, /한 통 반/);
  assert.doesNotMatch(result.studentReply, /과일|후식|아낀 돈/);
});

test('incident: why question can explain eating only the selected portion', () => {
  const input = inputFor('선택제를 하면 잔반을 줄이는데 왜 도움이 될까?');
  const { plan, result } = assertDirectAnswer(
    input,
    '먹을 만큼만 받으면 다 먹기 쉬워져 잔반을 줄이는 데 도움이 될 수 있어요.',
    cafeteriaSentences.result,
    /먹을 만큼/,
  );
  assert.equal(plan.observation.sourceStatus, 'reasonable_inference');
  assert.equal(result.observation.sourceStatus, 'reasonable_inference');
  assert.deepEqual(result.observation.evidenceIds, [], 'an inference is not promoted to directly supported evidence');
  assert.doesNotMatch(result.studentReply, /과일|후식|모든 조건/);
});

test('incident: how-to question identifies all three portion choices', () => {
  assertDirectAnswer(
    inputFor('학생들은 반찬 양을 어떻게 고를 수 있었나요?'),
    '조금, 보통, 많이 가운데 먹을 양을 골랐어요.',
    cafeteriaSentences.choice,
    /조금, 보통, 많이/,
  );
});

test('incident: dessert remains valid evidence when that is the question', () => {
  assertDirectAnswer(
    inputFor('학교는 아낀 돈을 어디에 쓸 계획인가요?'),
    '아낀 돈으로 과일 후식을 늘릴 계획이에요.',
    cafeteriaSentences.dessert,
    /과일 후식/,
  );
});

test('incident: cost mention does not invent a monetary amount', () => {
  const input = inputFor('잔반 처리 비용은 정확히 몇 원 줄었나요?');
  const plan = createLiteEnginePlan(input);
  assert.equal(plan.skipModel, true);
  assert.equal(plan.observation.sourceStatus, 'source_insufficient');
  assert.match(plan.fallbackReply, /금액.*(?:나와 있지|없)/);
  assert.deepEqual(plan.observation.evidenceIds, []);
  const result = finalize(input, plan, '처리 비용은 1000원 줄었어요.', cafeteriaSentences.before);
  assert.equal(result.localFallback, true);
  assert.doesNotMatch(result.studentReply, /1000/);
});

test('incident: simultaneous methods require a cautious causal answer', () => {
  const input = inputFor('선택제 하나 때문에 잔반이 줄었다고 확실히 말할 수 있나요?');
  const { result } = assertDirectAnswer(
    input,
    '선택제 하나 때문이라고 확실히 말할 수는 없어요. 학교는 선택제와 잔반 게시판을 함께 운영했어요.',
    cafeteriaSentences.methods,
    /선택제와 잔반 게시판/,
  );
  assert.match(result.studentReply, /확실히 말할 수는 없/);
});

test('independent passage: decimal quantity keeps its unit and final value', () => {
  assertDirectAnswer(
    inputFor('위층 교실의 평균 온도는 최종적으로 몇 도였나요?', rooftop),
    '평균 온도는 29.3도였어요.',
    '평균 온도는 지난해 같은 달 기록 30.8도보다 1.5도 낮은 29.3도였다.',
    /29\.3도/,
  );
});

test('independent passage: unmeasured weather prevents a certain causal claim', () => {
  assertDirectAnswer(
    inputFor('교실 온도가 낮아진 게 텃밭 때문이라고 확실히 말할 수 있나요?', rooftop),
    '텃밭만의 효과라고 확실히 말할 수는 없어요. 학교는 날씨 차이가 온도에 미친 영향을 아직 확인하지 못했어요.',
    '학교는 텃밭 이외의 날씨 차이가 온도에 미친 영향은 아직 확인하지 못했다.',
    /날씨 차이/,
  );
});

test('independent passage: a mentioned construction cost is still not an amount', () => {
  const input = inputFor('방수 공사 비용은 정확히 몇 원인가요?', rooftop);
  const plan = createLiteEnginePlan(input);
  assert.equal(plan.skipModel, true);
  assert.equal(plan.observation.sourceStatus, 'source_insufficient');
  assert.match(plan.fallbackReply, /금액.*(?:나와 있지|없)/);
});

test('legacy client continues to receive v1 evidence, without a stale local draft', () => {
  const input = inputFor('글에서 줄어든 잔반은 최종적으로 하루 몇 통인가요?');
  delete input.supportedOutputContracts;
  const plan = createLiteEnginePlan(input);
  assert.equal(plan.modelRequest.outputContract, 'lead_evidence_quote_v1');
  assert.match(plan.modelRequest.instructions, /lead와 evidenceQuote/);
  const result = finalize(input, plan, '자료에서 함께 확인해 볼게요.', cafeteriaSentences.result);
  assert.equal(result.localFallback, false);
  assert.match(result.studentReply, /^자료 근거는.*한 통 반/);
  assert.doesNotMatch(result.studentReply, /과일|후식|여기까지/);
});

test('a relevant verbatim sentence fragment remains usable as evidence', () => {
  assertDirectAnswer(
    inputFor('글에서 줄어든 잔반은 최종적으로 하루 몇 통인가요?'),
    '하루 한 통 반으로 줄었어요.',
    '그 결과 하루 세 통이 넘던 잔반이 한 통 반으로 줄었고',
    /한 통 반/,
  );
});

test('output contract negotiation is bound into the plan digest', () => {
  const input = inputFor('글에서 줄어든 잔반은 최종적으로 하루 몇 통인가요?');
  const plan = createLiteEnginePlan(input);
  assert.throws(() => finalizeLiteEngineReply({
    ...input,
    supportedOutputContracts: ['lead_evidence_quote_v1'],
    policyVersion: plan.policyVersion,
    planDigest: plan.planDigest,
    candidateReply: '좋은 질문이에요.',
    candidateEvidenceQuote: cafeteriaSentences.result,
  }), /최신 계획/);
});

for (const [label, answer] of [
  ['invented Arabic quantity', '하루 999통으로 줄었어요.'],
  ['invented Korean quantity', '하루 아홉 통으로 줄었어요.'],
  ['fraction dropped from the final quantity', '하루 한 통으로 줄었어요.'],
  ['original quantity mistaken for the final quantity', '하루 세 통으로 줄었어요.'],
  ['invented money', '잔반 처리 비용이 1000원 줄었어요.'],
  ['personal email', '잔반 담당자의 이메일은 teacher@example.test예요.'],
  ['personal phone', '잔반 담당자에게 010-1234-5678로 전화하세요.'],
  ['internal rubric label', '잔반 질문의 평가 기준은 성취기준 도달입니다.'],
  ['internal observation field', '잔반 질문의 sourceStatus는 supported입니다.'],
]) {
  test(`unsafe provider output falls back: ${label}`, () => {
    const input = inputFor('글에서 줄어든 잔반은 최종적으로 하루 몇 통인가요?');
    const plan = createLiteEnginePlan(input);
    assert.equal(plan.skipModel, false, 'exercise finalization, not the skip-model guard');
    const result = finalize(input, plan, answer, cafeteriaSentences.result);
    assert.equal(result.localFallback, true);
    assert.notEqual(result.studentReply, answer);
    assert.doesNotMatch(result.studentReply, /999|아홉 통|1000|teacher@example|010-1234|sourceStatus|평가 기준/);
  });
}

test('student history is not evidence for an invented quantity', () => {
  const input = inputFor('글에서 줄어든 잔반은 최종적으로 하루 몇 통인가요?', cafeteria, {
    history: [
      { speaker: 'student', text: '최종 잔반은 999통이라고 들었어요.' },
      { speaker: 'bot', text: '하루 999통이라는 말이군요.' },
    ],
  });
  const plan = createLiteEnginePlan(input);
  const result = finalize(input, plan, '하루 999통으로 줄었어요.', cafeteriaSentences.result);
  assert.equal(result.localFallback, true);
  assert.doesNotMatch(result.studentReply, /999/);
});

test('fabricated quote is rejected even when its answer is plausible', () => {
  const input = inputFor('글에서 줄어든 잔반은 최종적으로 하루 몇 통인가요?');
  const plan = createLiteEnginePlan(input);
  const result = finalize(input, plan, '하루 한 통 반으로 줄었어요.', '잔반은 최종적으로 하루 한 통 반이 되었다.');
  assert.equal(result.localFallback, true);
});

test('verbatim but irrelevant dessert quote cannot validate a quantity answer', () => {
  const input = inputFor('글에서 줄어든 잔반은 최종적으로 하루 몇 통인가요?');
  const plan = createLiteEnginePlan(input);
  const result = finalize(input, plan, '하루 한 통 반으로 줄었어요.', cafeteriaSentences.dessert);
  assert.equal(result.localFallback, true);
});

test('verbatim neighboring evidence cannot replace the requested quantity with a dessert answer', () => {
  const input = inputFor('글에서 줄어든 잔반은 최종적으로 하루 몇 통인가요?');
  const plan = createLiteEnginePlan(input);
  const result = finalize(input, plan, '아낀 돈으로 과일 후식을 늘릴 계획이에요.', cafeteriaSentences.dessert);
  assert.equal(result.localFallback, true, 'a true sentence is not automatically an answer to this question');
});

test('tampered plan digest cannot be finalized', () => {
  const input = inputFor('글에서 줄어든 잔반은 최종적으로 하루 몇 통인가요?');
  const plan = createLiteEnginePlan(input);
  assert.throws(() => finalizeLiteEngineReply({
    ...input,
    policyVersion: plan.policyVersion,
    planDigest: `${plan.planDigest.slice(0, -1)}${plan.planDigest.endsWith('x') ? 'y' : 'x'}`,
    candidateReply: '하루 한 통 반으로 줄었어요.',
    candidateEvidenceQuote: cafeteriaSentences.result,
  }), /최신 계획/);
});
