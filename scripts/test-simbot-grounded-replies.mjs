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

const lionRescue = {
  id: 'lion-rescue-causal-chain',
  title: '사자 바람이의 새 보금자리',
  text: [
    '바람이는 좁은 실내동물원에서 오랫동안 살았다.',
    '바람이는 갈비뼈가 드러날 만큼 말랐고 시민들이 그 모습을 알렸다.',
    '청주동물원은 바람이를 데려오겠다고 먼저 제안했다.',
    '바람이는 청주동물원의 넓은 야생동물보호시설에서 지내게 되었다.',
    '청주동물원에는 코끼리와 기린이 없다. 이 동물들은 우리나라 기후에 적응하기 어렵기 때문이다.',
  ].join(' '),
};

test('inference can connect an earlier condition to a later rescue without borrowing an unrelated reason', () => {
  const input = inputFor('바람이가 청주동물원에 온 이유는 뭐야?', lionRescue);
  const plan = createLiteEnginePlan(input);
  assert.equal(plan.observation.questionType, 'inference');
  assert.equal(plan.skipModel, false);
  assert.match(plan.observation.sourceCue, /갈비뼈가 드러날 만큼 말랐고/);
  assert.match(plan.observation.sourceCue, /청주동물원은 바람이를 데려오겠다고 먼저 제안/);
  assert.match(plan.modelRequest.instructions, /원래 순서대로|상태, 행동, 결과/);
  const answer = '바람이가 좁은 곳에서 지내다 몹시 마른 모습이 알려지자 청주동물원이 먼저 데려오겠다고 제안했어요. 더 나은 환경에서 보호하려는 취지로 볼 수 있지만, 글이 그 동기를 직접 밝힌 것은 아니에요.';
  const evidence = '바람이는 갈비뼈가 드러날 만큼 말랐고 시민들이 그 모습을 알렸다.';
  const result = finalize(input, plan, answer, evidence);
  assert.equal(result.localFallback, false, 'the answer may synthesize selected sentences beyond its one verbatim anchor');
  assert.equal(result.observation.sourceStatus, 'reasonable_inference');
  assert.deepEqual(result.observation.evidenceIds, []);
  assert.ok(result.studentReply.startsWith(answer));
  assert.doesNotMatch(result.studentReply, /코끼리|기린|기후/);

  const denial = finalize(input, plan, '글에는 바람이가 옮겨 온 이유가 나오지 않아요.', evidence);
  assert.equal(denial.localFallback, true, 'a blanket no-reason answer must not override the selected event chain');
});

test('reflection and application may use a source fact without demanding one exact student opinion', () => {
  for (const [question, type, answer, evidence] of [
    ['내 생각을 돌아보면 음식 낭비를 줄이기 위해 무엇을 바꿀 수 있을까?', 'reflection',
      '음식 낭비를 줄이는 일이 학교와 지구를 함께 지키는 실천인지 생각해 볼 수 있어요. 우리 학교에서 어떤 변화가 생길지는 직접 살펴봐야 해요.',
      cafeteriaSentences.dessert],
    ['우리 학교에도 이 방법을 적용하려면 어떻게 하면 좋을까?', 'application',
      '우리 학교에서도 먹을 양을 스스로 고르게 해 볼 수 있어요. 실제로 잔반이 줄지는 확인해 봐야 해요.',
      cafeteriaSentences.methods],
  ]) {
    const input = inputFor(question);
    const plan = createLiteEnginePlan(input);
    assert.equal(plan.observation.questionType, type);
    assert.equal(plan.skipModel, false, `${type} should be answerable from relevant selected facts`);
    assert.match(plan.modelRequest.instructions, /하나의 정답이나 정확한 인용문을 요구하지 마세요/);
    assert.ok(plan.observation.sourceCue.includes(evidence), `${type}: ${plan.observation.sourceCue}`);
    const result = finalize(input, plan, answer, evidence);
    assert.equal(result.localFallback, false);
    assert.equal(result.observation.sourceStatus, plan.observation.sourceStatus);
    assert.ok(result.studentReply.startsWith(answer));
  }
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

for (const evidenceQuote of ['한 통 반으로 줄었고', '한 통 반']) {
  test(`a short final-quantity quote supports a concise answer: ${evidenceQuote}`, () => {
    assertDirectAnswer(
      inputFor('글에서 줄어든 잔반은 최종적으로 하루 몇 통인가요?'),
      '하루 한 통 반이에요.',
      evidenceQuote,
      /한 통 반/,
    );
  });
}

for (const [label, answer, evidenceQuote] of [
  ['past quantity', '하루 세 통이에요.', '세 통'],
  ['fraction truncated from the actual quantity', '하루 한 통이에요.', '한 통'],
]) {
  test(`a short quote cannot disguise the wrong final quantity: ${label}`, () => {
    const input = inputFor('글에서 줄어든 잔반은 최종적으로 하루 몇 통인가요?');
    const plan = createLiteEnginePlan(input);
    assert.equal(plan.skipModel, false, 'exercise the quote and quantity guards');
    assert.ok(plan.observation.sourceCue.includes(evidenceQuote), 'the short quote really occurs in the selected evidence');
    const result = finalize(input, plan, answer, evidenceQuote);
    assert.equal(result.localFallback, true, 'quantity role and full fractional value come from the source sentence');
    assert.notEqual(result.studentReply, answer);
    assert.match(result.studentReply, /하루 한 통 반/);
    assert.ok(result.studentReply.length <= 80, 'rejected candidates should still receive a concise, correct quantity answer');
    assert.doesNotMatch(result.studentReply, /과일|후식|“|”|그 결과 하루 세 통/);
  });
}

for (const article of [
  {
    id: 'missing-final-measurement',
    title: '선택제를 운영한 학교',
    text: '학교에서는 예전에 하루 세 통의 잔반이 나왔다. 학교는 학생들이 먹을 양을 고르는 선택제를 운영했다. 선택제를 운영한 뒤 최종 잔반의 양은 측정하지 않았다.',
  },
  {
    id: 'multiple-final-measurements',
    title: '서로 다른 학급의 잔반',
    text: '학교가 함께 조사한 두 학급에서 첫 학급의 잔반은 하루 두 통으로 줄었고, 다른 학급의 잔반은 하루 한 통으로 줄었다. 학교 전체 잔반의 합계는 조사하지 않았다.',
  },
  {
    id: 'planned-final-measurement',
    title: '잔반 감축 계획',
    text: '학교 전체 잔반은 현재 하루 두 통이며, 학생들은 선택제를 통해 앞으로 잔반을 하루 한 통으로 줄일 계획이다.',
  },
  {
    id: 'unconfirmed-final-measurement',
    title: '아직 확인하지 못한 잔반 양',
    text: '학교 전체 잔반은 현재 하루 두 통이며, 선택제를 시행한 뒤 하루 한 통으로 줄었는지는 아직 확인하지 못했다.',
  },
  {
    id: 'hypothetical-final-measurement',
    title: '가정한 잔반 감축 결과',
    text: '만약 학교 전체 잔반이 하루 한 통으로 줄었다면 성공이겠지만, 실제로 선택제를 운영한 뒤 남은 양은 아직 측정하지 않았다.',
  },
]) {
  test(`concise numeric fallback does not invent one final measurement: ${article.id}`, () => {
    const input = inputFor('학교 전체 잔반은 최종적으로 하루 몇 통인가요?', article);
    const plan = createLiteEnginePlan(input);
    assert.doesNotMatch(plan.fallbackReply, /^자료에 따르면 최종 수량은/,
      'a missing result or several distinct class results cannot be extracted as a single final quantity');
    const result = finalize(input, plan, '하루 999통이에요.', '999통');
    assert.equal(result.localFallback, true);
    assert.doesNotMatch(result.studentReply, /^자료에 따르면 최종 수량은|999/);
  });
}

for (const [label, article, question, answer, partialQuote, completeQuote] of [
  [
    'numeric suffix',
    {
      id: 'complete-arabic-quantity',
      title: '학교 급식실 용기',
      text: '학교 급식실에서 보관하는 용기는 12통이다. 학생들은 깨끗이 씻은 용기에 필요한 물품을 넣어 두었다.',
    },
    '용기는 몇 통인가요?',
    '용기는 2통이에요.',
    '2통',
    '12통',
  ],
  [
    'omitted fractional suffix',
    {
      id: 'complete-fractional-quantity',
      title: '학교 급식실 잔반',
      text: '학교 급식실에서 조사한 하루 잔반은 한 통 반이다. 학생들은 남기지 않고 먹을 수 있는 만큼 반찬을 받기로 했다.',
    },
    '잔반은 하루 몇 통인가요?',
    '잔반은 하루 한 통이에요.',
    '한 통',
    '한 통 반',
  ],
]) {
  test(`quantity quote boundaries remain enforced without a final-result question: ${label}`, () => {
    assert.doesNotMatch(question, /최종|결과|현재|지금|줄어든|늘어난/);
    const input = inputFor(question, article);
    const plan = createLiteEnginePlan(input);
    assert.equal(plan.skipModel, false, 'exercise finalization rather than a missing-source fallback');
    assert.ok(plan.observation.sourceCue.includes(completeQuote));
    assert.ok(completeQuote.includes(partialQuote), 'the tempting substring really occurs in the complete number');
    const result = finalize(input, plan, answer, partialQuote);
    assert.equal(result.localFallback, true, 'a quantity substring is not the source quantity');
  });

  test(`complete quantity quote remains usable without a final-result question: ${label}`, () => {
    const input = inputFor(question, article);
    const plan = createLiteEnginePlan(input);
    const result = finalize(input, plan, `자료의 수량은 ${completeQuote}이에요.`, completeQuote);
    assert.equal(result.localFallback, false, 'the complete source quantity remains a valid short quote');
    assert.match(result.studentReply, new RegExp(completeQuote));
  });
}

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

const substation = {
  id:'resident-position-incident', title:'감일동 변전소 문제',
  text:`경기도 하남시 감일동에서는 발전소에서 만들어진 전기를 필요한 곳에 보내는 시설인 동서울변전소를 더 크게 만드는 사업이 진행되고 있습니다. 하지만 주변 주민들이 오랫동안 반대하고 있어 이 사업은 2년 넘게 제대로 진행되지 못하고 있습니다.

정부와 국회의원은 이 문제를 해결하기 위해 주민 참여 공청회를 열었습니다. 주민 참여 공청회는 주민들이 직접 참여하여 자신의 생각과 의견을 이야기하고, 서로의 생각을 들어보는 자리입니다.

공청회에서는 변전소를 지금의 장소에 더 크게 만들 것인지, 다른 장소를 찾아볼 것인지에 대해 여러 의견이 나왔습니다. 정부는 주민들과 함께 두 달 동안 더 이야기를 나누어 보자고 했습니다.

감일동 주민들은 변전소를 더 크게 만들기 전에 주민들이 안전하게 생활할 수 있는 방법과 편의시설을 마련해야 한다고 주장하고 있습니다. 하남시도 주민들의 안전과 의견이 충분히 반영되지 않으면 건축허가를 내주지 않겠다는 입장입니다. 이 공사를 담당하고 있는 한국전력공사는 주민들이 사용할 수 있는 편의시설과 120명 이상이 사용할 수 있는 사무실을 만들어주는 등의 주민과 하남시의 구체적인 보완 요구를 들어주는 것에 망설이고 있습니다.

정부는 동해안에서 만든 전기를 수도권으로 보내기 위해 동서울변전소를 더 크게 만드는 일이 꼭 필요하다고 말합니다. 따라서 두 달 동안 합의가 진행되지 않으면 그대로 변전소 공사를 시작하겠다고 강력하게 이야기 했습니다. 반면 주민들은 나라에 필요한 사업이라도 주민들의 안전과 생활을 먼저 생각해야 한다고 말하고 있습니다.

앞으로 이 문제를 해결하기 위해서는 주민 참여 공청회와 충분한 대화를 통해 정부, 한국전력, 하남시, 주민들이 서로의 의견을 듣고 모두가 납득할 수 있는 방법을 찾는 것이 중요합니다.`,
};

for (const activityMode of ['evaluation', 'exploration']) {
  test(`a follow-up about residents' opposition receives their stated concerns in ${activityMode}`, () => {
    const input = inputFor('주민들은 왜 반대하고 있나요?', substation, {activityMode,
      history:[
        {speaker:'bot',text:'감일동에서 어떤 일이 생겼을까요?'},
        {speaker:'student',text:'동서울 변전소 사업이 진행되고 있는데 주민들이 반대하고 있어요'},
        {speaker:'bot',text:'답변을 남겼어요. 자료에서 더 궁금한 낱말이나 내용을 질문해 주세요.'},
      ],
    });
    Object.assign(input.lesson, {
      lessonGoal:'지역 문제에 대한 서로 다른 입장과 주민 참여의 중요성을 설명한다.',
      assessmentCriteria:'주민의 요구를 지문에서 찾아 설명한다.',
      rubricHigh:'요구와 이유를 연결한다.',rubricMeet:'주민의 요구를 설명한다.',
      rubricDeveloping:'관련 사실의 일부를 설명한다.',evidenceDescription:'학생의 근거와 설명',
      startQuestion:'감일동에서 어떤 일이 생겼을까요?',
    });
    const plan = createLiteEnginePlan(input);
    assert.equal(plan.skipModel,false);
    assert.equal(plan.observation.safetyFlag,false);
    assert.match(plan.observation.sourceCue,/주민들.*안전/);
    const quote = plan.observation.sourceCue.split(/(?<=\.)\s*/).find(sentence=>/주민들.*안전/.test(sentence));
    assert.ok(quote && substation.text.includes(quote));
    const answer = '주민들은 안전하게 생활할 수 있는 방법을 먼저 마련해야 한다고 생각하기 때문이에요.';
    const final = finalize(input,plan,answer,quote);
    assert.equal(final.localFallback,false);
    assert.ok(final.studentReply.startsWith(answer));
    assert.doesNotMatch(final.studentReply,/자료에는.*이유가.*않|완성된 답이나 문단/);
    const wrong = finalize(input,plan,'자료에는 주민들이 반대하는 이유가 나오지 않습니다.',
      '하지만 주변 주민들이 오랫동안 반대하고 있어 이 사업은 2년 넘게 제대로 진행되지 못하고 있습니다.');
    assert.equal(wrong.localFallback,true,'a statement that opposition happened cannot replace the available concern evidence');
  });
}
