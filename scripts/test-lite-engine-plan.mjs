import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';

// Load the real adapter and shared core without starting Next.js or calling a provider.
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

const {
  createLiteEnginePlan,
  createLiteQuestioningConfig,
  finalizeLiteEngineReply,
  LITE_ENGINE_POLICY_VERSION,
  normalizeLiteEngineInput,
} = await import('../lib/lite-engine-plan.ts');

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
  assert.equal(plan.policyVersion, 'questioning-dialogue-v2-lite-adapter-v12');
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
  assert.equal(finalizeLiteEngineReply(finalizeInput(input, plan)).policyVersion, LITE_ENGINE_POLICY_VERSION);
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

test('saved generated assessment question is the real GAS opening turn and stays in subsequent engine context', () => {
  const input = withFourLevels();
  const settings = {
    ...input.lesson, activityMode: 'evaluation',
    startQuestion: '개인 물병 사용이 쓰레기를 줄이는 까닭을 자료의 근거로 설명해 보세요.',
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
  assert.equal(session.history[0].text, settings.startQuestion);
  assert.equal(session.lesson.startQuestion, settings.startQuestion);
  assert.ok(!JSON.stringify(session).includes('교사전용'));
  assert.equal(Object.hasOwn(session.lesson, 'expectedAnswer'), false);
  assert.equal(Object.hasOwn(session.lesson, 'assessmentEvidence'), false);
  assert.equal(Object.hasOwn(session.lesson, 'answerExamples'), false);

  const firstAnswer = '개인 물병을 쓰면 일회용 컵을 덜 쓰기 때문이에요.';
  const payload = gas.buildLiteEnginePayload_({
    requestId: input.requestId, sessionId: session.sessionId, activityMode: 'evaluation', message: firstAnswer,
  }, settings, session.history);
  assert.equal(payload.history[0].text, settings.startQuestion);
  assert.equal(Object.hasOwn(payload.lesson, 'expectedAnswer'), false);
  assert.equal(Object.hasOwn(payload.lesson, 'assessmentEvidence'), false);
  assert.equal(Object.hasOwn(payload.lesson, 'answerExamples'), false);
  assert.ok(!JSON.stringify(payload).includes('교사전용'));
  const plan = createLiteEnginePlan(payload);
  assert.ok(plan.modelRequest.input.includes(settings.startQuestion));
  assert.ok(plan.modelRequest.input.includes(firstAnswer));
  assert.ok(!JSON.stringify(plan).includes('교사전용'));
  assert.equal(plan.observation.responseScore, null,
    'an arbitrary generated opening question must not be misrepresented as an automatically graded managed question');

  const continued = {
    ...payload, requestId: 'req_generated_assessment_followup', studentMessage: '일회용 컵을 줄이면 왜 좋은가요?',
    history: [...payload.history, { speaker: 'student', text: firstAnswer }, { speaker: 'bot', text: plan.fallbackReply }],
  };
  const next = createLiteEnginePlan(continued);
  assert.ok(next.modelRequest.input.includes(continued.studentMessage));
  assert.ok(!JSON.stringify(next).includes('교사전용'));
  assert.equal(next.observation.isClosing, false);
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
