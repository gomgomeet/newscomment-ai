import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
  assert.equal(plan.policyVersion, 'questioning-dialogue-v2-lite-adapter-v8');
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

test('older clients and explicit legacy schemes canonicalize to the same three-level plan', () => {
  const oldClient = makeInput();
  const explicitLegacy = { ...oldClient, lesson: { ...oldClient.lesson, rubricScheme: 'legacy_three', rubricGood: '' } };
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
  assert.equal(finalizeLiteEngineReply(finalizeInput(input, plan)).localFallback, false);
});

test('optional fourth descriptor is bounded even when inactive and invalid schemes are rejected', () => {
  for (const activityMode of ['evaluation', 'exploration']) {
    for (const rubricScheme of ['legacy_three', 'four_levels']) {
      const input = withFourLevels(makeInput(activityMode));
      input.lesson.rubricScheme = rubricScheme;
      input.lesson.rubricGood = '가'.repeat(1000);
      assert.equal(normalizeLiteEngineInput(input).lesson.rubricGood.length, 1000);
      input.lesson.rubricGood += '나';
      assert.throws(() => normalizeLiteEngineInput(input), /잘함 수준.*1000/);
    }
  }
  for (const rubricScheme of ['five_levels', 'FOUR_LEVELS', 4, {}]) {
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
