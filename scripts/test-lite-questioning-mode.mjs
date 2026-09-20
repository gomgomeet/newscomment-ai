import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

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
  classifyLiteQuestionCategory,
  createLiteEnginePlan,
  normalizeLiteEngineInput,
} = await import('../lib/lite-engine-plan.ts');

const materialText = [
  '청주동물원은 좁은 곳에서 살던 사자 바람이를 구조했습니다.',
  '바람이는 넓은 야생동물보호시설에서 생활합니다.',
  '동물원은 동물의 본래 습성을 고려한 환경을 만들었습니다.',
].join(' ');

function input(studentMessage) {
  return {
    schemaVersion: 1,
    requestId: `req_questioning_${studentMessage.length}`,
    sessionKey: 'session_questioning_1',
    activityMode: 'questioning',
    studentMessage,
    history: [],
    lesson: {
      lessonId: 'LESSON-QUESTIONING',
      subject: '국어',
      grade: '초등 5학년',
      lessonTitle: '동물원과 보호',
      materialTitle: '늙은 사자 바람이',
      materialText,
      startQuestion: '글을 읽고 궁금한 점을 물어보세요.',
      sourceHash: 'questioning-source-hash',
      lessonRevision: 1,
    },
  };
}

test('questioning mode accepts a lesson without evaluation design and does not start assessment', () => {
  const normalized = normalizeLiteEngineInput(input('바람이는 어디에서 생활하나요?'));
  assert.equal(normalized.activityMode, 'questioning');
  const plan = createLiteEnginePlan(input('바람이는 어디에서 생활하나요?'));
  assert.equal(plan.observation.questionCategory, 'fact');
  assert.equal(plan.observation.conversationPhase, 1);
  assert.equal(plan.observation.assessmentProgress, undefined);
  assert.equal(plan.enforcement.managedQuestion, '');
});

test('four classroom labels follow the game concepts, with 추론 renamed 탐구', () => {
  const base = { safetyFlag: false, isClosing: false, sourceStatus: 'supported' };
  const cases = [
    ['무엇이 나와 있나요?', 'fact', 'fact'],
    ['글에 나온 사람은 누구인가요', 'fact', 'fact'],
    ['맹수는 무슨 뜻이에요?', 'vocabulary', 'fact'],
    ['왜 그랬을까요?', 'inference', 'inquiry'],
    ['더 알아볼 것은 무엇인가요?', 'extension', 'inquiry'],
    ['우리 반에서는 어떻게 할까요?', 'application', 'application'],
    ['내 생각은 어떻게 달라졌나요?', 'reflection', 'reflection'],
    ['왜?', 'fact', 'inquiry'],
    ['우리 지역 동물원에는 곰이 몇 마리 있나요?', 'application', 'fact'],
    ['우리 지역에서 어떻게 바꿀까요?', 'fact', 'application'],
    ['맹수 뜻 알려줘', 'vocabulary', 'fact'],
    ['처음 질문을 어떻게 고쳤나요?', 'inference', 'reflection'],
  ];
  for (const [message, questionType, expected] of cases) {
    assert.equal(classifyLiteQuestionCategory(message, { ...base, questionType }), expected, message);
  }
});

test('statements, unsafe turns and off-topic turns do not receive a four-type label', () => {
  const base = { questionType: 'fact', safetyFlag: false, isClosing: false, sourceStatus: 'supported' };
  assert.equal(classifyLiteQuestionCategory('동물원 이야기가 인상적이에요.', base), '');
  assert.equal(classifyLiteQuestionCategory('나는 왜 그랬는지 모르겠어요.', base), '');
  assert.equal(classifyLiteQuestionCategory('나는 왜 그랬는지 몰랐어.', base), '');
  assert.equal(classifyLiteQuestionCategory('바람이는 몇 살인가요? 왜 좁은 곳에 살았나요?', base), '',
    'two questions in one message require teacher review rather than one misleading label');
  assert.equal(classifyLiteQuestionCategory('무엇이 나와 있나요?', { ...base, safetyFlag: true }), '');
  assert.equal(classifyLiteQuestionCategory('무엇이 나와 있나요?', { ...base, sourceStatus: 'out_of_scope' }), '');
  assert.equal(classifyLiteQuestionCategory('무엇이 나와 있나요?', { ...base, isClosing: true }), '');
});
