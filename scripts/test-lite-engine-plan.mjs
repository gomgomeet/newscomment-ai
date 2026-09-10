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
  assert.equal(plan.policyVersion, 'questioning-dialogue-v2-lite-adapter-v4');
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
  assert.equal(finalizeLiteEngineReply(finalizeInput(input, plan)).policyVersion, LITE_ENGINE_POLICY_VERSION);
});
