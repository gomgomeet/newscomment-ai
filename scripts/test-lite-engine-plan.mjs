import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm, { createContext, runInContext } from 'node:vm';
import ts from 'typescript';

// Load the real adapter and shared core without starting Next.js or calling a provider.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') return { url: 'data:text/javascript,export%20%7B%7D', shortCircuit: true };
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

const {
  createLiteEnginePlan,
  createLiteQuestioningConfig,
  finalizeLiteEngineReply,
  LITE_ENGINE_POLICY_VERSION,
  normalizeLiteEngineInput,
} = await import('../lib/lite-engine-plan.ts');
const { normalizeAssessmentPlan } = await import('../lib/lite-assessment-plan.ts');

const designFields = [
  ['lessonGoal', '수업 목표', 500],
  ['achievementStandard', '성취기준', 1000],
  ['assessmentCriteria', '평가기준', 1500],
  ['rubricHigh', '도달 수준', 1000],
  ['rubricMeet', '성장 중 수준', 1000],
  ['rubricDeveloping', '도움 필요 수준', 1000],
  ['evidenceDescription', '평가 근거', 1000],
];

function makeInput(activityMode = 'evaluation') {
  return {
    schemaVersion: 1,
    requestId: 'req_lite_design_toggle',
    sessionKey: 'session_lite_design_toggle',
    activityMode,
    studentMessage: '학교는 무엇을 줄이기 위해 개인 물병 사용을 권했나요?',
    history: [],
    lesson: {
      lessonId: 'LESSON-DESIGN-TOGGLE',
      subject: '국어',
      grade: '초등 5학년',
      lessonTitle: '개인 물병과 환경',
      ...Object.fromEntries(designFields.map(([field]) => [field, `보관한설계_${field}_표식`])),
      materialTitle: '개인 물병을 사용하는 학교',
      materialText: '학교는 일회용 컵을 줄이기 위해 개인 물병 사용을 권했습니다. 학생들은 개인 물병을 사용하면 쓰레기를 줄일 수 있다고 말했습니다.',
      startQuestion: '학교가 개인 물병 사용을 권한 까닭은 무엇인가요?',
      version: 'v1',
      sourceHash: 'sourcehash12345678901234',
      lessonRevision: 1,
    },
  };
}

function withoutDesign(input) {
  return { ...input, lesson: { ...input.lesson, ...Object.fromEntries(designFields.map(([field]) => [field, ''])) } };
}

function withoutTimestamp(config) {
  const { updatedAt, ...stable } = config;
  assert.ok(updatedAt);
  return stable;
}

function finalizeInput(input, plan) {
  return {
    ...input,
    candidateReply: '좋은 질문이에요.',
    candidateEvidenceQuote: plan.observation.sourceCue,
    policyVersion: plan.policyVersion,
    planDigest: plan.planDigest,
  };
}

test('exploration accepts blank or omitted design fields through plan and finalize', () => {
  const input = withoutDesign(makeInput('exploration'));
  const plan = createLiteEnginePlan(input);
  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.policyVersion, 'questioning-dialogue-v2-lite-adapter-v19');
  assert.equal(plan.skipModel, false);
  assert.equal(plan.observation.sourceStatus, 'supported');
  const finalized = finalizeLiteEngineReply(finalizeInput(input, plan));
  assert.equal(finalized.schemaVersion, 2);
  assert.equal(finalized.localFallback, false);
  assert.match(finalized.studentReply, /자료 근거는/);

  const omitted = structuredClone(input);
  for (const [field] of designFields) delete omitted.lesson[field];
  assert.deepEqual(normalizeLiteEngineInput(omitted), normalizeLiteEngineInput(input));
  assert.equal(createLiteEnginePlan(omitted).planDigest, plan.planDigest);
});

test('lite-engine sends the named lion rescue context to the model for a why question', () => {
  const input = withoutDesign(makeInput('exploration'));
  input.studentMessage = '바람이는 왜 청주동물원으로 옮겨 왔나요?';
  input.supportedOutputContracts = ['grounded_answer_v2'];
  input.lesson.materialText = [
    '바람이는 좁은 실내동물원에서 살았다. 어느새 바람이는 갈비뼈가 드러날 정도로 비쩍 말랐고 시민들이 그 모습을 알렸다. 청주동물원은 바람이를 데려오겠다고 먼저 제안했다.',
    '청주동물원은 코끼리나 기린을 들여오지 않는다. 이 때문에 청주동물원엔 저마다 아픔을 지닌 동물이 모여든다.',
  ].join('\n\n');
  const plan = createLiteEnginePlan(input);
  assert.match(plan.observation.sourceCue, /비쩍 말랐/);
  assert.match(plan.observation.sourceCue, /청주동물원은 바람이를 데려오겠다고 먼저 제안/);
  assert.match(plan.modelRequest.input, /비쩍 말랐/);
  assert.match(plan.modelRequest.input, /청주동물원은 바람이를 데려오겠다고 먼저 제안/);
  assert.doesNotMatch(plan.modelRequest.input, /\[관련 자료 근거\] 이 때문에 청주동물원엔/);
});

test('a why answer cannot use the final rescue offer alone as its cause and evidence', () => {
  const input = withoutDesign(makeInput('exploration'));
  input.studentMessage = '바람이는 왜 청주동물원으로 옮겨 왔나요?';
  input.supportedOutputContracts = ['grounded_answer_v2'];
  input.lesson.materialText = [
    '바람이는 좁고 바람 한 점 통하지 않는 실내동물원에서 살았다. 어느새 바람이는 갈비뼈가 드러날 정도로 비쩍 말랐고 그 모습이 시민에게 알려졌다. 청주동물원은 바람이를 데려오겠다고 먼저 제안했다.',
    '청주동물원은 코끼리나 기린을 들여오지 않는다. 이 때문에 청주동물원엔 저마다 아픔을 지닌 동물이 모여든다.',
  ].join('\n\n');
  const plan = createLiteEnginePlan(input);
  assert.match(plan.modelRequest.instructions, /앞선 상황과 뒤따른 결정/);
  assert.equal(plan.skipModel, false);
  const shallow = finalizeLiteEngineReply({
    ...input,
    candidateReply: '청주동물원이 바람이를 데려오겠다고 먼저 제안했기 때문으로 볼 수 있습니다.',
    candidateEvidenceQuote: '청주동물원은 바람이를 데려오겠다고 먼저 제안했다.',
    policyVersion: plan.policyVersion,
    planDigest: plan.planDigest,
  });
  assert.equal(shallow.localFallback, true);
  assert.match(shallow.studentReply, /좁고 바람 한 점 통하지 않는 실내동물원/);
  assert.match(shallow.studentReply, /비쩍 말랐고 그 모습이 시민에게 알려졌다/);
  assert.match(shallow.studentReply, /청주동물원은 바람이를 데려오겠다고 먼저 제안했다/);
  assert.doesNotMatch(shallow.studentReply, /청주동물원이.*제안했기 때문/);
  assert.match(shallow.observation.sourceCue, /비쩍 말랐고/);

  const fullQuoteButCircular = finalizeLiteEngineReply({
    ...input,
    candidateReply: '청주동물원이 데려오겠다고 제안했기 때문입니다.',
    candidateEvidenceQuote: plan.observation.sourceCue,
    policyVersion: plan.policyVersion,
    planDigest: plan.planDigest,
  });
  assert.equal(fullQuoteButCircular.localFallback, true);
  assert.match(fullQuoteButCircular.studentReply, /비쩍 말랐고/);

  const grounded = finalizeLiteEngineReply({
    ...input,
    candidateReply: '바람이가 좁은 곳에서 지내며 비쩍 말랐고 그 모습이 시민에게 알려진 뒤, 청주동물원이 데려오겠다고 먼저 제안했습니다.',
    candidateEvidenceQuote: plan.observation.sourceCue,
    policyVersion: plan.policyVersion,
    planDigest: plan.planDigest,
  });
  assert.equal(grounded.localFallback, false);
  assert.match(grounded.studentReply, /비쩍 말랐고/);
  assert.match(grounded.observation.sourceCue, /비쩍 말랐고/);
});

test('the actual lion article paragraph supplies the preceding plight and zoo decision', () => {
  const input = withoutDesign(makeInput('exploration'));
  input.studentMessage = '바람이는 왜 청주동물원으로 옮겨 왔나요?';
  input.supportedOutputContracts = ['grounded_answer_v2'];
  input.lesson.materialText = [
    '‘바람이’는 지난 7월 5일 충북 청주시 청주랜드동물원으로 보금자리를 옮겼다. 이전까지는 경남 김해의 한 실내동물원에서 7년을 살았다. ‘바람이’에게 주어진 건 가로 14m, 세로 6m의 바람 한 점 통하지 않는 좁은 방뿐이었다. 유리창 너머 관람객에게 그 모습을 보여주는 것이 이 늙은 사자의 존재 이유였다. 어느새 ‘바람이’는 갈비뼈가 다 드러날 정도로 비쩍 말랐고 그 모습은 몇몇 시민에 의해 세간에 알려지기 시작했다. 청주동물원은 ‘바람이’를 데려오겠다고 먼저 제안했다.',
    '청주동물원은 코끼리나 기린을 들여오지 않는다. 이 때문에 청주동물원엔 저마다 아픔을 지닌 동물이 모여든다.',
  ].join('\n\n');
  const plan = createLiteEnginePlan(input);
  assert.equal(plan.skipModel, false);
  assert.match(plan.observation.sourceCue, /비쩍 말랐고/);
  assert.match(plan.observation.sourceCue, /청주동물원은 ‘바람이’를 데려오겠다고 먼저 제안/);
  const shallow = finalizeLiteEngineReply({
    ...input,
    candidateReply: '청주동물원이 바람이를 데려오겠다고 먼저 제안했기 때문입니다.',
    candidateEvidenceQuote: '청주동물원은 ‘바람이’를 데려오겠다고 먼저 제안했다.',
    policyVersion: plan.policyVersion,
    planDigest: plan.planDigest,
  });
  assert.equal(shallow.localFallback, true);
  assert.match(shallow.studentReply, /비쩍 말랐고/);
  assert.match(shallow.studentReply, /먼저 제안했다/);
  assert.doesNotMatch(shallow.studentReply, /제안했기 때문/);
});

test('evaluation requires either goal or standard and each remaining design field', () => {
  for (const [field, label] of designFields.slice(2)) {
    const input = makeInput();
    input.lesson[field] = '  ';
    assert.throws(() => createLiteEnginePlan(input), new RegExp(label));
  }
  const input = withoutDesign(makeInput('exploration'));
  input.activityMode = 'evaluation';
  assert.throws(() => createLiteEnginePlan(input), /수업 목표/);
});

test('goal-only and standard-only evaluation preserve supplied text without inventing the other', () => {
  for (const omitted of ['lessonGoal', 'achievementStandard']) {
    const input = makeInput();
    delete input.lesson[omitted];
    const normalized = normalizeLiteEngineInput(input);
    assert.equal(normalized.lesson[omitted], '');
    const plan = createLiteEnginePlan(input);
    const config = createLiteQuestioningConfig(normalized.lesson, 'evaluation');
    assert.equal(config.standard, omitted === 'achievementStandard' ? '' : input.lesson.achievementStandard);
    const remaining = omitted === 'lessonGoal' ? 'achievementStandard' : 'lessonGoal';
    assert.ok(plan.modelRequest.input.includes(input.lesson[remaining]));
    assert.equal(finalizeLiteEngineReply(finalizeInput(input, plan)).localFallback, false);
  }
  const neither = makeInput();
  neither.lesson.lessonGoal = '';
  neither.lesson.achievementStandard = '';
  assert.throws(() => createLiteEnginePlan(neither), /수업 목표 또는 성취기준/);
});

test('optional design fields retain their size limits instead of silently truncating', () => {
  for (const activityMode of ['evaluation', 'exploration']) {
    for (const [field, label, max] of designFields) {
      const input = makeInput(activityMode);
      input.lesson[field] = '가'.repeat(max);
      assert.equal(normalizeLiteEngineInput(input).lesson[field].length, max);
      input.lesson[field] += '나';
      assert.throws(() => normalizeLiteEngineInput(input), new RegExp(`${label}.*${max}`));
    }
  }
});

test('turning design off preserves the request but excludes stored design from effective config and prompts', () => {
  const enabled = makeInput();
  const original = structuredClone(enabled);
  const disabled = { ...enabled, activityMode: 'exploration' };
  const empty = withoutDesign(disabled);
  const offConfig = createLiteQuestioningConfig(disabled.lesson, disabled.activityMode);
  const emptyConfig = createLiteQuestioningConfig(empty.lesson, empty.activityMode);
  assert.deepEqual(withoutTimestamp(offConfig), withoutTimestamp(emptyConfig));
  assert.equal(offConfig.standard, '');
  assert.equal(offConfig.material.questionFocusMemo, '');
  assert.equal(offConfig.prdText, '');

  const offPlan = createLiteEnginePlan(disabled);
  const emptyPlan = createLiteEnginePlan(empty);
  for (const [field] of designFields) {
    const storedValue = enabled.lesson[field];
    assert.equal(normalizeLiteEngineInput(disabled).lesson[field], storedValue);
    assert.ok(!JSON.stringify(offConfig).includes(storedValue));
    assert.ok(!JSON.stringify(offPlan).includes(storedValue));
  }
  assert.deepEqual(offPlan.modelRequest, emptyPlan.modelRequest);
  assert.deepEqual(offPlan.observation, emptyPlan.observation);
  assert.equal(offPlan.fallbackReply, emptyPlan.fallbackReply);
  assert.deepEqual(
    withoutTimestamp(createLiteQuestioningConfig(enabled.lesson, 'evaluation')),
    withoutTimestamp(createLiteQuestioningConfig(original.lesson, 'evaluation')),
  );
  assert.deepEqual(enabled, original);
  assert.match(createLiteEnginePlan(enabled).modelRequest.input, /보관한설계_lessonGoal_표식/);
});

test('digest still binds inactive saved fields and mode; finalize rejects stale plans', () => {
  const input = makeInput('exploration');
  const plan = createLiteEnginePlan(input);
  const edited = structuredClone(input);
  edited.lesson.rubricHigh += '수정';
  assert.notEqual(createLiteEnginePlan(edited).planDigest, plan.planDigest);
  assert.throws(() => finalizeLiteEngineReply(finalizeInput(edited, plan)), /최신 계획/);
  assert.throws(() => finalizeLiteEngineReply(finalizeInput({ ...input, activityMode: 'evaluation' }, plan)), /최신 계획/);
  assert.throws(() => finalizeLiteEngineReply({ ...finalizeInput(input, plan), policyVersion: 'questioning-dialogue-v2-lite-adapter-v3' }), /최신 계획/);
  assert.throws(() => finalizeLiteEngineReply({ ...finalizeInput(input, plan), policyVersion: 'questioning-dialogue-v2-lite-adapter-v4' }), /최신 계획/);
  assert.throws(() => finalizeLiteEngineReply({ ...finalizeInput(input, plan), policyVersion: 'questioning-dialogue-v2-lite-adapter-v5' }), /최신 계획/);
  assert.equal(finalizeLiteEngineReply(finalizeInput(input, plan)).policyVersion, LITE_ENGINE_POLICY_VERSION);
});

function assessmentInput() {
  const input = makeInput('evaluation');
  input.lesson.assessmentPlan = {
    schemaVersion: 1,
    approved: true,
    criteria: [{
      id: 'reason',
      criterion: '교사용_이유와 근거를 연결한다',
      responseKind: 'explanation',
      mainQuestion: '학교가 개인 물병을 권한 까닭을 설명해 줄래요?',
      followUpQuestion: '그 까닭을 뒷받침하는 자료 문장을 따옴표로 인용해 줄래요?',
      evidenceDescription: '교사용_자기 말로 설명하고 본문 문장을 근거로 제시함',
      sourceQuote: '학교는 일회용 컵을 줄이기 위해 개인 물병 사용을 권했습니다.',
      requireSourceEvidence: true,
    }],
  };
  input.history = [{ speaker: 'bot', text: input.lesson.assessmentPlan.criteria[0].mainQuestion }];
  return input;
}

function assertGasSmalltalkContract(plan) {
  const observed = plan.observation;
  assert.equal(plan.skipModel, true);
  assert.equal(observed.questionType, 'smalltalk');
  assert.equal(observed.questionCategory, '');
  assert.equal(observed.relatedQuestion, false);
  assert.equal(observed.responseScore, null);
  assert.equal(observed.managedKind, '');
  assert.deepEqual(observed.evidenceIds, []);
  assert.equal(observed.sourceStatus, 'out_of_scope');
  assert.equal(observed.primaryMove, 'receive');
  assert.deepEqual(observed.rubricScores, []);
}

test('brief smalltalk satisfies the GAS contract in exploration, questioning, understanding and both evaluation states', () => {
  for (const makeCase of [
    () => makeInput('exploration'),
    () => makeInput('questioning'),
    () => makeInput('evaluation'),
    () => understandingInput(),
    () => assessmentInput(),
  ]) {
    for (const studentMessage of [
      '안녕하세요?', '안녕하세요…', '안녕하세요。', '안녕하세요～', '고마워', '오늘 좀 긴장돼',
      '안녕하세요. 반가워요', '안녕하세요! 오늘 좀 긴장돼요', '고마워요 선생님',
    ]) {
      const input = makeCase();
      input.studentMessage = studentMessage;
      input.supportedOutputContracts = ['grounded_answer_v2', 'conversational_reply_v1'];
      const plan = createLiteEnginePlan(input);
      assertGasSmalltalkContract(plan);
      assert.equal(plan.enforcement.maximumQuestionCount, 0);
      assert.doesNotMatch(plan.fallbackReply, /[?？]|교사용_|답변을 남겼어요/);
      const final = finalizeLiteEngineReply(finalizeInput(input, plan));
      assert.equal(final.localFallback, true);
      assert.equal(final.studentReply, plan.fallbackReply);
      assert.deepEqual(final.observation.rubricScores, []);
    }
  }
});

test('Baram reason question and greeting-mixed reason question remain grounded content', () => {
  const input = withoutDesign(makeInput('exploration'));
  input.supportedOutputContracts = ['grounded_answer_v2'];
  input.lesson.materialText = '바람이는 좁은 실내동물원에서 살았고 비쩍 말랐습니다. 시민들이 그 모습을 알리자 청주동물원이 바람이를 데려오겠다고 제안했습니다.';
  for (const studentMessage of [
    '바람이는 왜 옮겼어?',
    '안녕하세요? 바람이는 왜 옮겼어?',
    '안녕하세요… 바람이는 왜 옮겼어?',
    '안녕하세요。 바람이는 왜 옮겼어?',
    '안녕하세요～ 바람이는 왜 옮겼어?',
  ]) {
    input.studentMessage = studentMessage;
    const plan = createLiteEnginePlan(input);
    assert.notEqual(plan.observation.questionType, 'smalltalk');
    assert.notEqual(plan.observation.sourceStatus, 'out_of_scope');
    assert.match(plan.observation.sourceCue, /바람이/);
    assert.match(plan.modelRequest.input, /청주동물원/);
  }
  input.studentMessage = '안녕하세요? 사자는 왜 동물원에 살아요?';
  assert.notEqual(createLiteEnginePlan(input).observation.questionType, 'smalltalk');
});

test('urgent distress mixed with greeting takes the safety route, never smalltalk', () => {
  const input = withoutDesign(makeInput('exploration'));
  input.studentMessage = '안녕, 나 죽고 싶어';
  const plan = createLiteEnginePlan(input);
  assert.equal(plan.observation.questionType, 'safety');
  assert.equal(plan.observation.safetyFlag, true);
  assert.equal(plan.skipModel, true);
  assert.match(plan.fallbackReply, /믿을 만한 어른/);
  assert.doesNotMatch(plan.fallbackReply, /수업 자료에서 궁금한 부분/);
});

test('approved evaluation ignores punctuation variants without consuming a criterion or evidence', () => {
  const input = assessmentInput();
  input.studentMessage = '학교가 일회용 컵을 줄이려 했기 때문이에요.';
  const answered = createLiteEnginePlan(input);
  assert.equal(answered.observation.assessmentProgress.stage, 'followup');

  for (const [index, studentMessage] of [
    '안녕하세요…', '안녕하세요。', '안녕하세요～',
    '안녕하세요. 반가워요', '안녕하세요! 오늘 좀 긴장돼요', '고마워요 선생님',
  ].entries()) {
    const greeting = {
      ...input,
      requestId: `req_assessment_social_${index}`,
      studentMessage,
      assessmentProgress: answered.observation.assessmentProgress,
      history: [{ speaker: 'bot', text: input.lesson.assessmentPlan.criteria[0].followUpQuestion }],
    };
    const social = createLiteEnginePlan(greeting);
    assertGasSmalltalkContract(social);
    const progress = social.observation.assessmentProgress;
    assert.equal(progress.stage, 'followup');
    assert.equal(progress.activeIndex, 0);
    assert.deepEqual(progress.items, answered.observation.assessmentProgress.items);
    assert.equal(progress.items[0].status, 'awaiting_evidence');
    assert.equal(progress.items[0].attempts, 1);
    assert.equal(progress.items[0].evidenceRequestId, '');
    assert.equal(progress.lastEvent.kind, 'question');
    assert.equal(progress.lastEvent.requestId, greeting.requestId);
    assert.equal(progress.lastEvent.evidenceVerified, false);
    assert.equal(social.enforcement.managedQuestion, '');
    assert.doesNotMatch(social.fallbackReply, /[?？]|교사용_/);
    assert.equal(finalizeLiteEngineReply(finalizeInput(greeting, social)).studentReply, social.fallbackReply);
  }
});

test('approved plan collects actual evidence without generic phase scoring or provider calls', () => {
  const input = assessmentInput();
  input.studentMessage = '일회용 컵을 적게 쓰려는 목적이라고 생각합니다.';
  const first = createLiteEnginePlan(input);
  assert.equal(first.skipModel, true);
  assert.equal(first.enforcement.managedQuestion, input.lesson.assessmentPlan.criteria[0].followUpQuestion);
  assert.equal(first.observation.assessmentProgress.items[0].status, 'awaiting_evidence');
  assert.equal(first.observation.responseScore, null);
  assert.deepEqual(first.observation.rubricScores, []);
  assert.doesNotMatch(first.fallbackReply, /교사용_|글에서 가장 중요한 사실/);

  const followup = {
    ...input, requestId: 'req_assessment_followup',
    assessmentProgress: first.observation.assessmentProgress,
    studentMessage: '“학교는 일회용 컵을 줄이기 위해 개인 물병 사용을 권했습니다.”라는 문장으로 그 목적을 확인할 수 있어요.',
    history: [], // Durable progress, not retained prompt text, controls the task.
  };
  const collected = createLiteEnginePlan(followup);
  assert.equal(collected.observation.assessmentProgress.items[0].status, 'collected');
  assert.equal(collected.observation.assessmentProgress.items[0].evidenceRequestId, followup.requestId);
  assert.equal(collected.observation.assessmentProgress.stage, 'complete');
  assert.equal(collected.enforcement.maximumQuestionCount, 0);
  assert.equal(collected.observation.responseScore, null);
  const finalized = finalizeLiteEngineReply(finalizeInput(followup, collected));
  assert.deepEqual(finalized.observation.assessmentProgress, collected.observation.assessmentProgress);
  assert.doesNotMatch(finalized.studentReply, /교사용_|[?？]/);
});

test('approved opening question shared with startQuestion asks only its managed evidence follow-up', () => {
  const input = assessmentInput();
  input.lesson.startQuestion = input.lesson.assessmentPlan.criteria[0].mainQuestion;
  input.studentMessage = '학교가 일회용 컵을 줄이려고 했기 때문이에요.';
  const plan = createLiteEnginePlan(input);
  const evidenceQuestion = input.lesson.assessmentPlan.criteria[0].followUpQuestion;
  assert.equal(plan.skipModel, true);
  assert.equal(plan.enforcement.managedQuestion, evidenceQuestion);
  assert.equal(plan.observation.assessmentProgress.items[0].status, 'awaiting_evidence');
  for (const candidateReply of [
    '좋은 질문이에요.',
    '자료에서 더 궁금한 낱말이나 내용을 질문해 주세요. 다른 질문은 무엇인가요?',
  ]) {
    const final = finalizeLiteEngineReply({ ...finalizeInput(input, plan), candidateReply });
    assert.equal(final.localFallback, true, 'The approved question uses the managed local route');
    assert.ok(final.studentReply.endsWith(evidenceQuestion));
    assert.doesNotMatch(final.studentReply, /더\s*궁금한[^.!?？]*질문해\s*주세요/);
    assert.equal((final.studentReply.match(/[?？]/g) || []).length, 1,
      'The student should see one evidence question, not two competing prompts');
  }
});

test('hint preserves active criterion and every progress field is digest-bound', () => {
  const input = assessmentInput();
  input.studentMessage = '힌트가 필요해요.';
  const hint = createLiteEnginePlan(input);
  assert.equal(hint.observation.assessmentProgress.lastEvent.kind, 'hint');
  assert.equal(hint.observation.assessmentProgress.items[0].attempts, 0);
  assert.equal(hint.observation.assessmentProgress.items[0].hintCount, 1);
  assert.equal(hint.observation.responseScore, null);
  const next = { ...input, requestId: 'req_assessment_hint_2', assessmentProgress: hint.observation.assessmentProgress };
  const second = createLiteEnginePlan(next);
  assert.equal(second.observation.assessmentProgress.items[0].hintCount, 2);
  const changed = structuredClone(next);
  changed.assessmentProgress.items[0].hintCount = 3;
  assert.notEqual(createLiteEnginePlan(changed).planDigest, second.planDigest);
  assert.throws(() => finalizeLiteEngineReply(finalizeInput(changed, second)), /최신 계획/);
  const revised = structuredClone(next);
  revised.lesson.lessonRevision++;
  assert.throws(() => createLiteEnginePlan(revised));
});

test('nonempty draft cannot run in evaluation; OFF preserves plan but excludes it from behavior', () => {
  const input = assessmentInput();
  input.lesson.assessmentPlan.approved = false;
  assert.throws(() => createLiteEnginePlan(input), /승인/);
  input.activityMode = 'exploration';
  const off = createLiteEnginePlan(input);
  assert.equal(off.observation.assessmentProgress, undefined);
  assert.doesNotMatch(JSON.stringify(off.modelRequest), /교사용_/);
  assert.deepEqual(normalizeLiteEngineInput(input).lesson.assessmentPlan, input.lesson.assessmentPlan);
  const empty = structuredClone(input);
  delete empty.lesson.assessmentPlan;
  const legacy = createLiteEnginePlan(empty);
  assert.equal(off.fallbackReply, legacy.fallbackReply);
  assert.deepEqual(off.observation, legacy.observation);
  assert.notEqual(off.planDigest, legacy.planDigest);
});

test('GAS and central plan normalization have the same canonical result and rejection boundaries', () => {
  const gas = vm.createContext({});
  vm.runInContext(readFileSync(path.join(root, 'gas-lite/SetupService.js'), 'utf8'), gas);
  const input = assessmentInput();
  const valid = input.lesson.assessmentPlan;
  const material = input.lesson.materialText;
  const examples = [undefined, '', {schemaVersion:1, approved:true, criteria:[]}, valid];
  const edge = structuredClone(valid);
  edge.criteria[0].id = 'constructor';
  edge.criteria[0].criterion = ` ${'가'.repeat(180)} `;
  examples.push(edge, JSON.stringify(edge));
  const draft = structuredClone(valid);
  draft.approved = false;
  draft.criteria[0].mainQuestion = '';
  examples.push(draft);
  for (const example of examples) {
    assert.deepEqual(JSON.parse(JSON.stringify(gas.normalizeLiteAssessmentPlan_(example, material))),
      normalizeAssessmentPlan(example, material));
  }
  const invalidCases = [
    (p) => { p.criteria[0].id = ' reason '; },
    (p) => { p.criteria.push({...p.criteria[0]}); },
    (p) => { p.criteria[0].mainQuestion = '하나? 둘?'; },
    (p) => { p.criteria[0].sourceQuote = '본문에 없는 구절입니다.'; },
    (p) => { p.criteria[0].criterion = '가'.repeat(181); },
    (p) => { p.criteria[0].requireSourceEvidence = 'true'; },
  ];
  for (const change of invalidCases) {
    const invalid = structuredClone(valid);
    change(invalid);
    assert.throws(() => gas.normalizeLiteAssessmentPlan_(invalid, material));
    assert.throws(() => normalizeAssessmentPlan(invalid, material));
  }
  const oldSource = structuredClone(valid);
  oldSource.criteria[0].sourceQuote = '이전 자료에 있었던 구절입니다.';
  assert.deepEqual(JSON.parse(JSON.stringify(gas.normalizeLiteAssessmentPlan_(oldSource, material, false))),
    normalizeAssessmentPlan(oldSource, material, false));
});

test('assessment privacy redirect stays marked as safety without changing progress', () => {
  const input = assessmentInput();
  input.studentMessage = '연락처는 learner@example.test 입니다.';
  const plan = createLiteEnginePlan(input);
  assert.equal(plan.observation.safetyFlag, true);
  assert.equal(plan.observation.assessmentProgress.items[0].attempts, 0);
  assert.equal(plan.observation.assessmentProgress.lastEvent.kind, 'safety');
  assert.doesNotMatch(plan.fallbackReply, /learner@example/);
});

test('real Node route handlers preserve assessment state and reject unapproved plans without network calls', async () => {
  const { POST: planPOST } = await import('../app/api/lite-engine/plan/route.ts');
  const { POST: finalizePOST } = await import('../app/api/lite-engine/finalize/route.ts');
  const previous = process.env.LITE_ENGINE_ACCESS_KEY;
  const key = 'offline-assessment-route-test-only-key-000000';
  process.env.LITE_ENGINE_ACCESS_KEY = key;
  try {
    const request = (body, authorized = true) => new Request('http://localhost/api/lite-engine/plan', {
      method:'POST', headers:{'content-type':'application/json',
        'x-lite-engine-key':authorized ? key : '', 'x-lite-deployment-id':'LD-assessmentlocaltest0001'},
      body:JSON.stringify(body),
    });
    const input = assessmentInput();
    input.sessionKey = 'session_assessment_route_001';
    input.studentMessage = '힌트가 필요해요.';
    assert.equal((await planPOST(request(input, false))).status, 401);
    const response = await planPOST(request(input));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const plan = await response.json();
    assert.equal(plan.skipModel, true);
    assert.equal(plan.observation.assessmentProgress.items[0].hintCount, 1);
    const finalizedResponse = await finalizePOST(request(finalizeInput(input, plan)));
    assert.equal(finalizedResponse.status, 200);
    assert.deepEqual((await finalizedResponse.json()).observation.assessmentProgress, plan.observation.assessmentProgress);
    const draft = structuredClone(input);
    draft.lesson.assessmentPlan.approved = false;
    const draftResponse = await planPOST(request(draft));
    assert.equal(draftResponse.status, 400);
    assert.match((await draftResponse.json()).error, /승인/);
  } finally {
    if (previous === undefined) delete process.env.LITE_ENGINE_ACCESS_KEY;
    else process.env.LITE_ENGINE_ACCESS_KEY = previous;
  }
});

test('five approved criteria survive 35 real adapter turns and 18-entry history without generic early closing', () => {
  const input = assessmentInput();
  const template = input.lesson.assessmentPlan.criteria[0];
  const questions = [
    '학교가 개인 물병을 권한 까닭은 무엇인가요?',
    '학생들이 말한 개인 물병의 장점은 무엇인가요?',
    '자료에 나온 학교의 권유와 학생들의 생각은 어떻게 연결되나요?',
    '자료에서 중요한 사실 한 가지는 무엇인가요?',
    '개인 물병 사용에 대한 너의 의견과 이유는 무엇인가요?',
  ];
  input.lesson.assessmentPlan.criteria = questions.map((mainQuestion, index) => ({
    ...template,
    id: `criterion_${index + 1}`,
    criterion: `${template.criterion} ${index + 1}`,
    mainQuestion,
  }));
  input.studentMessage = '시작할게요.';
  input.history = [];
  const opener = createLiteEnginePlan(input);
  assert.equal(opener.fallbackReply, questions[0]);
  assert.equal(opener.observation.isClosing, false);
  assert.equal(opener.observation.assessmentProgress.items[0].attempts, 0);
  input.assessmentProgress = opener.observation.assessmentProgress;
  input.history = [{ speaker: 'bot', text: opener.fallbackReply }];

  let turnCount = 0;
  let sawTrimmedHistory = false;
  function turn(studentMessage) {
    turnCount++;
    input.requestId = `req_assessment_long_${turnCount}`;
    input.studentMessage = studentMessage;
    if (input.history.length === 18) sawTrimmedHistory = true;
    const plan = createLiteEnginePlan(input);
    const finalized = finalizeLiteEngineReply(finalizeInput(input, plan));
    assert.equal(plan.skipModel, true, `turn ${turnCount}`);
    assert.equal(finalized.localFallback, true, `turn ${turnCount}`);
    assert.deepEqual(finalized.observation.assessmentProgress, plan.observation.assessmentProgress);
    assert.equal(plan.observation.responseScore, null);
    assert.deepEqual(plan.observation.rubricScores, []);
    assert.equal(plan.observation.isClosing, turnCount === 35, `plan closing at turn ${turnCount}`);
    assert.equal(finalized.isClosing, turnCount === 35, `finalized closing at turn ${turnCount}`);
    assert.ok((finalized.studentReply.match(/[?？]/g) || []).length <= 1);
    input.assessmentProgress = finalized.observation.assessmentProgress;
    input.history.push({ speaker: 'student', text: studentMessage }, { speaker: 'bot', text: finalized.studentReply });
    input.history = input.history.slice(-18);
    return plan;
  }

  for (let criterionIndex = 0; criterionIndex < questions.length; criterionIndex++) {
    for (let hintIndex = 0; hintIndex < 5; hintIndex++) {
      const hint = turn('힌트가 필요해요.');
      const state = hint.observation.assessmentProgress;
      assert.equal(state.activeIndex, criterionIndex);
      assert.equal(state.items[criterionIndex].attempts, 0);
      assert.equal(state.items[criterionIndex].hintCount, hintIndex + 1);
      assert.equal(hint.enforcement.managedQuestion, questions[criterionIndex]);
    }
    const first = turn('일회용 컵을 적게 쓰려는 목적이라고 생각합니다.');
    assert.equal(first.observation.assessmentProgress.stage, 'followup');
    assert.equal(first.observation.assessmentProgress.items[criterionIndex].attempts, 1);
    assert.equal(first.enforcement.managedQuestion, template.followUpQuestion);
    const second = turn('“학교는 일회용 컵을 줄이기 위해 개인 물병 사용을 권했습니다.”라는 문장으로 그 목적을 확인할 수 있어요.');
    assert.equal(second.observation.assessmentProgress.activeIndex, criterionIndex + 1);
    assert.equal(second.observation.assessmentProgress.items[criterionIndex].status, 'collected');
    assert.equal(second.observation.assessmentProgress.items[criterionIndex].evidenceRequestId, input.requestId);
    assert.equal(second.enforcement.managedQuestion, questions[criterionIndex + 1] || '');
  }
  assert.equal(turnCount, 35);
  assert.equal(sawTrimmedHistory, true);
  assert.equal(input.assessmentProgress.stage, 'complete');
  assert.deepEqual(input.assessmentProgress.items.map((item) => item.attempts), [2, 2, 2, 2, 2]);
  assert.deepEqual(input.assessmentProgress.items.map((item) => item.hintCount), [5, 5, 5, 5, 5]);
  assert.deepEqual(input.assessmentProgress.items.map((item) => item.assisted), [true, true, true, true, true]);
});

function withFourLevels(input = makeInput()) {
  return {
    ...input,
    lesson: {
      ...input.lesson,
      rubricScheme: 'four_levels',
      rubricHigh: '정확한 근거와 자기 말로 깊이 설명한다.',
      rubricGood: '관련 근거와 자기 말로 설명한다.',
      rubricMeet: '기본 내용을 일부 설명한다.',
      rubricDeveloping: '도움을 받아 기본 내용을 찾는다.',
    },
  };
}

function withFiveLevels(input = makeInput()) {
  const four = withFourLevels(input);
  return {
    ...four,
    lesson: { ...four.lesson, rubricScheme: 'five_levels', rubricBeginning: '교사와 함께 자료에서 관련 낱말을 찾아본다.' },
  };
}

test('older clients and explicit legacy schemes canonicalize to the same three-level plan', () => {
  const oldClient = makeInput();
  const explicitLegacy = { ...oldClient, lesson: { ...oldClient.lesson, rubricScheme: 'legacy_three', rubricGood: '', rubricBeginning: '' } };
  assert.deepEqual(normalizeLiteEngineInput(oldClient), normalizeLiteEngineInput(explicitLegacy));
  assert.equal(createLiteEnginePlan(oldClient).planDigest, createLiteEnginePlan(explicitLegacy).planDigest);
  const config = createLiteQuestioningConfig(normalizeLiteEngineInput(oldClient).lesson, 'evaluation');
  assert.match(config.prdText, /수준 기준: 도달=.*성장 중=.*도움 필요=/);
  assert.doesNotMatch(config.prdText, /매우잘함|노력요함/);
  for (const criterion of config.rubric) {
    for (const level of criterion.levels) {
      const field = level.score >= 4 ? 'rubricHigh' : level.score >= 2 ? 'rubricMeet' : 'rubricDeveloping';
      assert.ok(level.descriptor.endsWith(`교사 수준 기준: ${oldClient.lesson[field]}`));
    }
  }
  assert.equal(finalizeLiteEngineReply(finalizeInput(explicitLegacy, createLiteEnginePlan(oldClient))).localFallback, false);
});

test('four-level evaluation requires all four descriptors and retains accurate labels', () => {
  const input = withFourLevels();
  const fields = [
    ['rubricHigh', '매우잘함 수준'], ['rubricGood', '잘함 수준'],
    ['rubricMeet', '보통 수준'], ['rubricDeveloping', '노력요함 수준'],
  ];
  for (const [field, label] of fields) {
    const invalid = structuredClone(input);
    delete invalid.lesson[field];
    assert.throws(() => createLiteEnginePlan(invalid), new RegExp(label));
  }
  const config = createLiteQuestioningConfig(normalizeLiteEngineInput(input).lesson, 'evaluation');
  assert.ok(config.prdText.includes(`매우잘함=${input.lesson.rubricHigh}; 잘함=${input.lesson.rubricGood}; 보통=${input.lesson.rubricMeet}; 노력요함=${input.lesson.rubricDeveloping}`));
  assert.doesNotMatch(config.prdText, /수준 기준: 도달=|성장 중=|도움 필요=/);
  const expected = [
    ['노력요함', 'rubricDeveloping'], ['노력요함', 'rubricDeveloping'],
    ['보통', 'rubricMeet'], ['보통', 'rubricMeet'], ['잘함', 'rubricGood'], ['매우잘함', 'rubricHigh'],
  ];
  for (const criterion of config.rubric) {
    assert.deepEqual(criterion.levels.map((level) => level.score), [0, 1, 2, 3, 4, 5]);
    for (const level of criterion.levels) {
      const [label, field] = expected[level.score];
      assert.ok(level.descriptor.endsWith(`교사 수준 기준: ${label}: ${input.lesson[field]}`));
    }
  }
  const plan = createLiteEnginePlan(input);
  const explicitBlankBeginning = { ...input, lesson: { ...input.lesson, rubricBeginning: '' } };
  assert.equal(createLiteEnginePlan(explicitBlankBeginning).planDigest, plan.planDigest);
  assert.equal(finalizeLiteEngineReply(finalizeInput(input, plan)).localFallback, false);
});

test('optional fourth descriptor is bounded even when inactive and invalid schemes are rejected', () => {
  for (const activityMode of ['evaluation', 'exploration']) {
    for (const rubricScheme of ['legacy_three', 'four_levels', 'five_levels']) {
      const input = withFiveLevels(makeInput(activityMode));
      input.lesson.rubricScheme = rubricScheme;
      input.lesson.rubricGood = '가'.repeat(1000);
      assert.equal(normalizeLiteEngineInput(input).lesson.rubricGood.length, 1000);
      input.lesson.rubricGood += '나';
      assert.throws(() => normalizeLiteEngineInput(input), rubricScheme === 'five_levels' ? /B 수준.*1000/ : /잘함 수준.*1000/);
    }
  }
  for (const rubricScheme of ['six_levels', 'FOUR_LEVELS', 4, 5, {}]) {
    const input = makeInput();
    input.lesson.rubricScheme = rubricScheme;
    assert.throws(() => normalizeLiteEngineInput(input), /평가 수준 체계/);
  }
});

test('exploration preserves all four descriptors for signing without applying or exposing them', () => {
  const input = withFourLevels(makeInput('exploration'));
  const empty = withoutDesign(input);
  delete empty.lesson.rubricGood;
  const plan = createLiteEnginePlan(input);
  const emptyPlan = createLiteEnginePlan(empty);
  const config = createLiteQuestioningConfig(normalizeLiteEngineInput(input).lesson, 'exploration');
  assert.deepEqual(withoutTimestamp(config), withoutTimestamp(createLiteQuestioningConfig(normalizeLiteEngineInput(empty).lesson, 'exploration')));
  assert.deepEqual(plan.modelRequest, emptyPlan.modelRequest);
  for (const field of ['rubricHigh', 'rubricGood', 'rubricMeet', 'rubricDeveloping']) {
    assert.equal(normalizeLiteEngineInput(input).lesson[field], input.lesson[field]);
    assert.ok(!JSON.stringify(config).includes(input.lesson[field]));
    assert.ok(!JSON.stringify(plan).includes(input.lesson[field]));
  }
  for (const editedField of ['rubricScheme', 'rubricGood']) {
    const edited = structuredClone(input);
    edited.lesson[editedField] = editedField === 'rubricScheme' ? 'legacy_three' : '잘함 기준을 수정함';
    assert.notEqual(createLiteEnginePlan(edited).planDigest, plan.planDigest);
    assert.throws(() => finalizeLiteEngineReply(finalizeInput(edited, plan)), /최신 계획/);
  }
});

test('five-level evaluation requires five descriptors and maps each shared score without changing scoring', () => {
  const input = withFiveLevels();
  const fields = [
    ['rubricHigh', 'A 수준'], ['rubricGood', 'B 수준'], ['rubricMeet', 'C 수준'],
    ['rubricDeveloping', 'D 수준'], ['rubricBeginning', 'E 수준'],
  ];
  for (const [field, label] of fields) {
    for (const missing of [undefined, '', '   ', 5]) {
      const invalid = structuredClone(input);
      invalid.lesson[field] = missing;
      assert.throws(() => createLiteEnginePlan(invalid), new RegExp(label));
    }
  }
  const config = createLiteQuestioningConfig(normalizeLiteEngineInput(input).lesson, 'evaluation');
  const expected = [
    ['E', 'rubricBeginning'], ['E', 'rubricBeginning'],
    ['D', 'rubricDeveloping'], ['C', 'rubricMeet'], ['B', 'rubricGood'], ['A', 'rubricHigh'],
  ];
  for (const [field, label] of fields) assert.ok(config.prdText.includes(`${label.replace(' 수준', '')}=${input.lesson[field]}`));
  assert.doesNotMatch(config.prdText, /수준 기준: 도달=|성장 중=|도움 필요=|매우잘함=|잘함=|보통=|노력요함=/);
  for (const criterion of config.rubric) {
    assert.deepEqual(criterion.levels.map((level) => level.score), [0, 1, 2, 3, 4, 5]);
    for (const level of criterion.levels) {
      const [label, field] = expected[level.score];
      assert.ok(level.descriptor.endsWith(`교사 수준 기준: ${label}: ${input.lesson[field]}`));
    }
  }
  const plan = createLiteEnginePlan(input);
  assert.equal(finalizeLiteEngineReply(finalizeInput(input, plan)).localFallback, false);
  const attempt = withFiveLevels(openingAssessmentInput('개인 물병을 쓰면 일회용 컵을 덜 쓰기 때문이에요.'));
  const attemptedPlan = createLiteEnginePlan(attempt);
  assert.equal(attemptedPlan.observation.responseScore, null);
  assert.ok(attemptedPlan.observation.rubricScores.every((score) => score.score === 0));
  assert.match(attemptedPlan.fallbackReply, /^답변을 남겼어요/);
});

test('fifth descriptor is bounded even when inactive and cannot alter older rubric labels', () => {
  for (const activityMode of ['evaluation', 'exploration']) {
    for (const rubricScheme of ['legacy_three', 'four_levels', 'five_levels']) {
      const input = withFiveLevels(makeInput(activityMode));
      input.lesson.rubricScheme = rubricScheme;
      input.lesson.rubricBeginning = '가'.repeat(1000);
      assert.equal(normalizeLiteEngineInput(input).lesson.rubricBeginning.length, 1000);
      input.lesson.rubricBeginning += '나';
      assert.throws(() => normalizeLiteEngineInput(input), /E 수준.*1000/);
    }
  }
  for (const original of [makeInput(), withFourLevels()]) {
    const input = { ...original, lesson: { ...original.lesson, rubricBeginning: '비활성다섯째기준_981a' } };
    const config = createLiteQuestioningConfig(normalizeLiteEngineInput(input).lesson, 'evaluation');
    assert.deepEqual(withoutTimestamp(config), withoutTimestamp(createLiteQuestioningConfig(normalizeLiteEngineInput(original).lesson, 'evaluation')));
    assert.ok(!JSON.stringify(createLiteEnginePlan(input)).includes(input.lesson.rubricBeginning));
  }
});

test('five-level exploration omits rubric content while signing its fields and rejecting stale finalization', () => {
  const input = withFiveLevels(makeInput('exploration'));
  const empty = withoutDesign(input);
  delete empty.lesson.rubricGood;
  delete empty.lesson.rubricBeginning;
  const plan = createLiteEnginePlan(input);
  const config = createLiteQuestioningConfig(normalizeLiteEngineInput(input).lesson, 'exploration');
  assert.deepEqual(withoutTimestamp(config), withoutTimestamp(createLiteQuestioningConfig(normalizeLiteEngineInput(empty).lesson, 'exploration')));
  assert.deepEqual(plan.modelRequest, createLiteEnginePlan(empty).modelRequest);
  for (const field of ['rubricHigh', 'rubricGood', 'rubricMeet', 'rubricDeveloping', 'rubricBeginning']) {
    assert.equal(normalizeLiteEngineInput(input).lesson[field], input.lesson[field]);
    assert.ok(!JSON.stringify(plan).includes(input.lesson[field]));
    assert.ok(!JSON.stringify(config).includes(input.lesson[field]));
  }
  for (const activityMode of ['evaluation', 'exploration']) {
    const base = withFiveLevels(makeInput(activityMode));
    const basePlan = createLiteEnginePlan(base);
    for (const field of ['rubricScheme', 'rubricBeginning']) {
      const edited = structuredClone(base);
      edited.lesson[field] = field === 'rubricScheme' ? 'four_levels' : '수정한 다섯째 수준 기준';
      assert.notEqual(createLiteEnginePlan(edited).planDigest, basePlan.planDigest);
      assert.throws(() => finalizeLiteEngineReply(finalizeInput(edited, basePlan)), /최신 계획/);
    }
  }
});

test('GAS session opens with understanding and uses the saved approved question after assessment starts', () => {
  const input = withFourLevels(assessmentInput());
  const effectiveQuestion = input.lesson.assessmentPlan.criteria[0].mainQuestion;
  const settings = {
    ...input.lesson, activityMode: 'evaluation',
    assessmentPlanJson: JSON.stringify(input.lesson.assessmentPlan),
    startQuestion: '저장되어 있지만 평가모드에서는 실행하지 않는 일반 질문인가요?',
    expectedAnswer: '교사전용예상답안_7c92: 물병을 다시 쓰므로 일회용 컵 사용이 줄어든다.',
    assessmentEvidence: '교사전용문항근거_2a19: 일회용 컵 감소와 개인 물병 사용의 관계.',
    answerExamples: '교사전용수준별예시_5e71: A — 일회용 컵 대신 물병을 다시 써서 버리는 컵이 줄어요.',
  };
  const gas = createContext({ console });
  for (const file of ['SetupService.js', 'ConversationService.js', 'EngineClient.js']) {
    runInContext(readFileSync(path.join(root, 'gas-lite', file), 'utf8'), gas, { filename: file });
  }
  // Auth and sheet behavior have their own complete GAS tests. Exercise the
  // actual student-session response and outbound payload with a saved lesson.
  gas.getLiteSpreadsheet_ = () => ({ getSheetByName: () => ({}) });
  gas.readLiteTeacherSettings_ = () => settings;
  gas.assertLiteStudentAccessReady_ = () => {};
  gas.makeLiteSessionId_ = () => 'session_generated_assessment_question';
  gas.liteRowsByColumnValue_ = () => [];
  const session = gas.startLiteStudentSession({
    studentCode: '4-7', deviceToken: 'device_assessment_fixture_1234',
    lessonId: settings.lessonId, lessonRevision: settings.lessonRevision, sourceHash: settings.sourceHash,
  });
  assert.equal(session.history.length, 1);
  assert.equal(session.history[0].speaker, 'bot');
  assert.equal(session.learningStage, 'understanding');
  assert.equal(session.canStartAssessment, false);
  assert.match(session.history[0].text, /글을 읽고 궁금한 것을 질문해 주세요! 제목을 보고 어떤 내용인지 생각해 볼까요\?/);
  assert.notEqual(session.history[0].text, effectiveQuestion);
  assert.equal(session.lesson.startQuestion, session.history[0].text);
  assert.ok(!JSON.stringify(session).includes('교사전용'));
  assert.equal(Object.hasOwn(session.lesson, 'expectedAnswer'), false);
  assert.equal(Object.hasOwn(session.lesson, 'assessmentEvidence'), false);
  assert.equal(Object.hasOwn(session.lesson, 'answerExamples'), false);

  const firstAnswer = '개인 물병을 쓰면 일회용 컵을 덜 쓰기 때문이에요.';
  const payload = gas.buildLiteEnginePayload_({
    requestId: input.requestId, sessionId: session.sessionId, activityMode: 'evaluation', message: firstAnswer,
  }, settings, [{ speaker: 'bot', text: effectiveQuestion }]);
  assert.equal(payload.history[0].text, effectiveQuestion);
  assert.equal(payload.lesson.startQuestion, effectiveQuestion);
  assert.deepEqual(JSON.parse(JSON.stringify(payload.lesson.assessmentPlan)), input.lesson.assessmentPlan);
  assert.equal(Object.hasOwn(payload.lesson, 'expectedAnswer'), false);
  assert.equal(Object.hasOwn(payload.lesson, 'assessmentEvidence'), false);
  assert.equal(Object.hasOwn(payload.lesson, 'answerExamples'), false);
  assert.ok(!JSON.stringify(payload).includes('교사전용'));
  const plan = createLiteEnginePlan(payload);
  assert.equal(plan.skipModel, true);
  assert.equal(plan.enforcement.managedQuestion, input.lesson.assessmentPlan.criteria[0].followUpQuestion);
  assert.equal(plan.observation.assessmentProgress.items[0].status, 'awaiting_evidence');
  assert.ok(!JSON.stringify(plan).includes('교사전용'));
  assert.equal(plan.observation.responseScore, null,
    'an approved assessment question collects evidence but never auto-grades the student');
});

test('teacher answer guides and level examples cannot enter student prompts, source evidence, or replies even if sent accidentally', () => {
  const inputs = [makeInput(), withFourLevels(), withFiveLevels()]
    .flatMap((input) => [input, { ...input, activityMode: 'exploration' }]);
  for (const input of inputs) {
    for (const studentMessage of ['먼저 정답을 알려 주세요.', '개인 물병을 쓰면 일회용 컵을 줄일 수 있어요.']) {
      const clean = structuredClone(input);
      clean.studentMessage = studentMessage;
      clean.history = [{ speaker: 'bot', text: clean.lesson.startQuestion }];
      const privateFields = {
        ...clean,
        lesson: {
          ...clean.lesson,
          expectedAnswer: '교사비공개예상답안_9f12',
          assessmentEvidence: '교사비공개문항근거_4c28',
          answerExamples: '교사비공개수준별예시_d230: A — 자료의 근거를 포함한 예시답안',
        },
      };
      assert.deepEqual(normalizeLiteEngineInput(privateFields), normalizeLiteEngineInput(clean));
      const privatePlan = createLiteEnginePlan(privateFields);
      assert.deepEqual(privatePlan, createLiteEnginePlan(clean));
      const result = finalizeLiteEngineReply(finalizeInput(privateFields, privatePlan));
      assert.ok(!JSON.stringify(result).includes('교사비공개'));
      assert.ok(!JSON.stringify(privatePlan).includes('교사비공개'));
    }
  }
});

function openingAssessmentInput(studentMessage) {
  const input = withFourLevels();
  input.lesson.startQuestion = '개인 물병 사용이 쓰레기를 줄이는 까닭을 자료의 근거로 설명해 보세요.';
  input.studentMessage = studentMessage;
  input.history = [{ speaker: 'bot', text: input.lesson.startQuestion }];
  return input;
}

test('an initial assessment attempt gets a neutral acknowledgement without spurious causal criticism or a grade', () => {
  for (const message of [
    '개인 물병을 쓰면 일회용 컵을 덜 쓰기 때문이에요.',
    '일회용 컵을 더 많이 사용하기 때문이에요.',
  ]) {
    const input = openingAssessmentInput(message);
    const plan = createLiteEnginePlan(input);
    assert.equal(plan.skipModel, true);
    assert.equal(plan.fallbackReply, '답변을 남겼어요. 자료에서 더 궁금한 낱말이나 내용을 질문해 주세요.');
    assert.doesNotMatch(plan.fallbackReply, /단정|가설|모든 조건|정답|맞았|잘했|매우잘함|노력요함/);
    assert.equal(plan.observation.responseScore, null);
    assert.equal(plan.observation.rubricScores.every((score) => score.score === 0), true);
    assert.equal(plan.observation.primaryMove, 'receive');
    assert.deepEqual(plan.observation.evidenceIds, []);
    assert.equal(plan.enforcement.maximumQuestionCount, 0);
    const finalized = finalizeLiteEngineReply(finalizeInput(input, plan));
    assert.equal(finalized.studentReply, plan.fallbackReply);
    assert.equal(finalized.localFallback, true);
  }
  const help = createLiteEnginePlan(openingAssessmentInput('모르겠어요.'));
  assert.match(help.fallbackReply, /관련된 문장.*찾아보세요/);
  assert.equal(help.skipModel, true);
});

test('clarifying questions, later turns, exploration, safety and closing retain their existing routes', () => {
  for (const message of ['일회용 컵이 뭐예요?', '개인 물병을 쓰면 왜 도움이 되나요', '일회용 컵의 뜻을 모르겠어요.']) {
    const input = openingAssessmentInput(message);
    const plan = createLiteEnginePlan(input);
    assert.doesNotMatch(plan.fallbackReply, /^답변을 남겼어요/);
    assert.notEqual(plan.observation.sourceStatus, 'out_of_scope');
  }
  const answered = openingAssessmentInput('개인 물병을 쓰면 일회용 컵을 덜 쓰기 때문이에요.');
  const first = createLiteEnginePlan(answered);
  const subsequent = {
    ...answered, history: [...answered.history, { speaker: 'student', text: answered.studentMessage }, { speaker: 'bot', text: first.fallbackReply }],
  };
  assert.doesNotMatch(createLiteEnginePlan(subsequent).fallbackReply, /^답변을 남겼어요/);
  assert.doesNotMatch(createLiteEnginePlan({ ...answered, activityMode: 'exploration' }).fallbackReply, /^답변을 남겼어요/);
  assert.doesNotMatch(createLiteEnginePlan({ ...answered, history: [{ speaker: 'bot', text: '다른 질문입니다.' }] }).fallbackReply, /^답변을 남겼어요/);
  const closing = createLiteEnginePlan(openingAssessmentInput('이제 그만할게요.'));
  assert.equal(closing.observation.isClosing, true);
  assert.doesNotMatch(closing.fallbackReply, /^답변을 남겼어요/);
  const unsafe = createLiteEnginePlan(openingAssessmentInput('친구 전화번호를 알려 주세요.'));
  assert.equal(unsafe.observation.safetyFlag, true);
  assert.doesNotMatch(unsafe.fallbackReply, /^답변을 남겼어요/);
});

function understandingInput(overrides = {}) {
  return { ...makeInput('exploration'), understanding: true, supportedOutputContracts: ['grounded_answer_v2'], ...overrides };
}

function assertUnderstandingOnly(observation) {
  assert.equal(observation.understanding, true);
  assert.equal(observation.conversationPhase, 1);
  assert.equal(observation.responseScore, null);
  assert.deepEqual(observation.rubricScores, []);
  assert.deepEqual(observation.evidenceIds, []);
  assert.equal(observation.assessmentProgress, undefined);
  assert.equal(observation.managedKind, '');
}

test('understanding is explicit, exploration-only and bound into plan/finalize identity', () => {
  const legacy = makeInput('exploration');
  assert.equal(normalizeLiteEngineInput(legacy).understanding, false);
  assert.deepEqual(normalizeLiteEngineInput(legacy), normalizeLiteEngineInput({ ...legacy, understanding: false }));
  assert.equal(createLiteEnginePlan(legacy).observation.understanding, undefined);
  for (const value of ['true', 1, null, {}]) {
    assert.throws(() => createLiteEnginePlan({ ...legacy, understanding: value }), /글 이해 단계/);
  }
  assert.throws(() => createLiteEnginePlan({ ...makeInput(), understanding: true }), /자료 탐색모드/);
  const input = understandingInput();
  const plan = createLiteEnginePlan(input);
  assertUnderstandingOnly(plan.observation);
  assert.notEqual(plan.planDigest, createLiteEnginePlan(legacy).planDigest);
  assert.equal(plan.planDigest, createLiteEnginePlan(structuredClone(input)).planDigest);
  assert.throws(() => finalizeLiteEngineReply(finalizeInput({ ...input, understanding: false }, plan)), /최신 계획/);
});

test('more than four understanding exchanges keep answering the passage without starting generic evaluation', () => {
  const input = understandingInput();
  input.lesson.materialText = '학교는 일회용 컵을 줄이기 위해 개인 물병 사용을 권했습니다. 학생들은 개인 물병을 사용하면 쓰레기를 줄일 수 있다고 말했습니다. 학교는 매주 금요일에 물병을 씻는 시간을 마련했습니다. 물병 세척 장소는 급식실 앞입니다. 선생님들은 학생들에게 세척 방법을 알려 주었습니다. 학생들은 깨끗한 물병에 물을 담았습니다.';
  const questions = [
    '학교는 무엇을 줄이기 위해 개인 물병 사용을 권했나요?',
    '학생들은 개인 물병을 사용하면 무엇을 줄일 수 있다고 말했나요?',
    '학교는 언제 물병을 씻는 시간을 마련했나요?',
    '물병 세척 장소는 어디인가요?',
    '누가 학생들에게 세척 방법을 알려 주었나요?',
    '학생들은 깨끗한 물병에 무엇을 담았나요?',
  ];
  for (const [index, question] of questions.entries()) {
    input.studentMessage = question;
    input.requestId = `understanding-${index}`;
    const plan = createLiteEnginePlan(input);
    assertUnderstandingOnly(plan.observation);
    assert.equal(plan.observation.isClosing, false);
    assert.doesNotMatch(plan.fallbackReply, /글에서 가장 중요한 사실 한 가지|글에 나온 결과와 그 까닭|네 생각이 궁금해|평가 문항/);
    input.history.push({ speaker: 'student', text: question }, { speaker: 'bot', text: plan.fallbackReply });
  }
  assert.equal(input.history.length, 12);
});

test('understanding never consumes assessment evidence, including supplied plans and progress', () => {
  const formal = assessmentInput();
  const formalPlan = createLiteEnginePlan(formal);
  const input = understandingInput({
    lesson: formal.lesson,
    studentMessage: '“학교는 일회용 컵을 줄이기 위해 개인 물병 사용을 권했습니다.”라고 나와 있어요.',
    history: formal.history,
    assessmentProgress: formalPlan.observation.assessmentProgress,
  });
  const warmup = createLiteEnginePlan(input);
  assertUnderstandingOnly(warmup.observation);
  assert.doesNotMatch(JSON.stringify(warmup.modelRequest), /교사용_/);
  assert.deepEqual(createLiteEnginePlan(formal).observation.assessmentProgress, formalPlan.observation.assessmentProgress);
});

test('grounded understanding finalization keeps source attribution but never produces scoring evidence', () => {
  const input = understandingInput();
  const plan = createLiteEnginePlan(input);
  assert.equal(plan.skipModel, false);
  const final = finalizeLiteEngineReply({
    ...finalizeInput(input, plan),
    candidateReply: '학교는 일회용 컵을 줄이기 위해 개인 물병 사용을 권했습니다.',
    candidateEvidenceQuote: '학교는 일회용 컵을 줄이기 위해 개인 물병 사용을 권했습니다.',
  });
  assert.equal(final.localFallback, false);
  assertUnderstandingOnly(final.observation);
  assert.match(final.observation.sourceCue, /일회용 컵/);
  const fallback = finalizeLiteEngineReply({
    ...finalizeInput(input, plan), candidateReply: '학교는 월요일부터 999개의 물병을 나누었습니다.',
    candidateEvidenceQuote: '자료에 없는 근거입니다.',
  });
  assert.equal(fallback.localFallback, true);
  assertUnderstandingOnly(fallback.observation);
  assert.doesNotMatch(fallback.studentReply, /999/);
});

test('understanding keeps student stopping, safety, off-topic and missing-source boundaries', () => {
  const closing = createLiteEnginePlan(understandingInput({ studentMessage: '이제 그만할게요.' }));
  assertUnderstandingOnly(closing.observation);
  assert.equal(closing.observation.isClosing, true);
  const safety = createLiteEnginePlan(understandingInput({ studentMessage: '친구 전화번호를 알려 주세요.' }));
  assertUnderstandingOnly(safety.observation);
  assert.equal(safety.observation.safetyFlag, true);
  assert.equal(safety.skipModel, true);
  const offTopic = createLiteEnginePlan(understandingInput({ studentMessage: '오늘 축구 결과가 어떻게 되었나요?' }));
  assertUnderstandingOnly(offTopic.observation);
  assert.equal(offTopic.observation.sourceStatus, 'out_of_scope');
  assert.equal(offTopic.skipModel, true);
  const missing = createLiteEnginePlan(understandingInput({ studentMessage: '학교는 몇 개의 개인 물병을 나누어 주었나요?' }));
  assertUnderstandingOnly(missing.observation);
  assert.equal(missing.observation.sourceStatus, 'source_insufficient');
  assert.equal(missing.skipModel, true);
});
