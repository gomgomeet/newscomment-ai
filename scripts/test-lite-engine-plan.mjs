import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
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
  assert.equal(plan.policyVersion, 'questioning-dialogue-v2-lite-adapter-v6');
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

test('evaluation still requires each design field, including when switched back on', () => {
  for (const [field, label] of designFields) {
    const input = makeInput();
    input.lesson[field] = '  ';
    assert.throws(() => createLiteEnginePlan(input), new RegExp(label));
  }
  const input = withoutDesign(makeInput('exploration'));
  input.activityMode = 'evaluation';
  assert.throws(() => createLiteEnginePlan(input), /수업 목표/);
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
