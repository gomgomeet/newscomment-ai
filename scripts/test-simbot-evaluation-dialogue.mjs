import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

// Replays public demonstration content and a synthetic teacher test dialogue.
// The fixture is embedded so CI does not need local reports, a Sheet, or API keys.
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
} = await import('../lib/lite-engine-plan.ts');
const { runQuestioningLocalEngine } = await import('../lib/questioning-engine-core.ts');
const { getQuestioningTurnMetadata } = await import('../lib/questioning-conversation-phase.ts');

// Evaluation setup and text from the 2026-09-17 teacher-authored demonstration.
const lesson = {
  lessonId: 'evaluation-dialogue-regression',
  subject: '국어',
  grade: '초등 4학년',
  lessonTitle: '[점검용] 급식 잔반 줄이기',
  lessonGoal: '글에서 잔반을 줄인 방법과 결과를 찾아 설명하고, 자료를 근거로 자신의 실천 의견을 이유와 함께 말할 수 있다.',
  achievementStandard: '[점검용 기술형 기준] 글에 제시된 사실과 근거를 바르게 파악하고, 자신의 생각을 이유와 함께 설명한다.',
  assessmentCriteria: '잔반을 줄인 두 가지 방법과 변화된 수량을 정확히 설명한다. 선택제가 도움이 되는 이유를 자료에 근거해 설명한다. 자신의 실천 의견에 이유를 덧붙인다.',
  rubricHigh: '선택제와 잔반 게시판, 하루 한 통 반으로 줄어든 결과를 정확히 설명하고 자료의 근거를 자신의 실천 의견과 연결한다.',
  rubricMeet: '글의 주요 방법과 결과를 대체로 파악하지만, 근거를 들어 이유나 의견을 설명하는 데 일부 도움이 필요하다.',
  rubricDeveloping: '방법이나 결과를 혼동하거나 근거를 찾기 어려워, 관련 문장을 함께 읽고 질문을 나누는 도움이 필요하다.',
  evidenceDescription: '스스로 만든 자료 관련 질문, 방법·수량 확인 답변, 근거와 이유를 연결한 설명, 자신의 실천 의견과 이유, 대화 뒤 생각의 변화.',
  materialTitle: '[점검용] 급식실 남은 음식, 석 달 만에 절반으로',
  materialText: '이 자료는 기존 웹 챗봇의 동작 점검용 예시입니다.\n\n푸른초등학교는 급식 잔반을 줄이기 위해 학생들이 반찬 양을 스스로 고르는 선택제와 잔반 게시판을 운영했다. 예전에는 하루에 큰 통 세 통이 넘는 잔반이 나왔고, 처리 비용도 적지 않았다. 학교는 반찬을 받을 때 조금, 보통, 많이 가운데 먹을 양을 고르게 하고, 학급별 잔반 무게를 게시판에 붙였다. 그 결과 하루 세 통이 넘던 잔반이 한 통 반으로 줄었고, 학생들은 먹을 만큼만 받으면 다 먹기 쉽다는 점을 알게 되었다. 학교는 음식 낭비가 줄어든 만큼 아낀 돈으로 과일 후식을 늘릴 계획이며, 전문가는 잔반 줄이기가 학교와 지구를 함께 지키는 실천이라고 설명했다.',
  startQuestion: '푸른초등학교는 잔반을 줄이기 위해 어떤 방법을 사용했나요?',
  version: 'v1',
  sourceHash: 'synthetic-evaluation-source-hash',
  lessonRevision: 2,
};
assert.equal(lesson.materialText.length, 347);

// The server transcript's speaker/text columns, including its old malformed
// replies. Replaying real prompt order is important: finalization moved the
// non-question invitation before the question and recognition used to fail.
const recordedTexts = [
  ['bot', '푸른초등학교는 잔반을 줄이기 위해 어떤 방법을 사용했나요?'],
  ['student', '잔반은 최종적으로 하루 몇 통인가요?'],
  ['bot', '한 통 반입니다.'],
  ['student', '학생들은 반찬 양을 어떻게 고를 수 있었나요?'],
  ['bot', '조금, 보통, 많이 가운데에서 먹을 양을 골랐습니다.'],
  ['student', '선택제를 하면 잔반을 줄이는 데 왜 도움이 될까요?'],
  ['bot', '학생들이 먹을 수 있는 만큼 반찬 양을 고르면 남기는 음식이 줄어들 수 있기 때문입니다.'],
  ['student', '아낀 돈은 어디에 쓸 계획인가요?'],
  ['bot', '과일 후식을 늘리는 데 쓸 계획입니다. 글에서 가장 중요한 사실 한 가지를 찾아 자기 말로 말해 줄래요?'],
  ['student', '학교는 먹을 반찬 양을 고르는 선택제와 잔반 게시판을 운영했고, 하루 세 통이 넘던 잔반이 한 통 반으로 줄었어요.'],
  ['bot', '“학교는 먹을 반찬 양을 고르는 선택제와 잔반 게시판을 운영했고, 하루 세 통” — 그렇게 읽었군요. 글에서 “푸른초등학교는 급식 잔반을 줄이기 위해 학생들이 반찬 양을 스스로 고르는 선택제와 잔반 게시판을 운영했다”라는 문장을 찾을 수 있어요. 글에 나온 결과와 그 까닭을 구분해서 말해 줄래요?'],
  ['student', '결과는 하루 세 통이 넘던 잔반이 한 통 반으로 줄어든 것이에요. 까닭은 학생들이 먹을 만큼만 받아 다 먹기 쉬워졌기 때문이라고 볼 수 있어요. 잔반 게시판도 함께 운영했으니 선택제만의 효과라고 단정할 수는 없어요.'],
  ['bot', '그럴 가능성이 있어요. 지금 말한 내용은 결과를 설명하는 하나의 가설이고, 자료에서 그 원인을 직접 확인한 사실과는 구분해야 해요. 직접 조사한 근거가 없다면 ‘영향을 주었을 수 있다’고 표현하는 것이 정확해요. 읽으면서 처음 생각과 달라진 부분이 무엇이었는지 말해 줄래?'],
  ['student', '처음에는 남은 음식을 잘 버리면 된다고 생각했어요. 지금은 먹을 만큼만 받고 잔반의 양을 함께 확인하는 것이 더 중요하다고 생각해요. 잔반이 한 통 반으로 줄었다는 글의 결과를 보고 생각이 달라졌어요.'],
  ['bot', '먹을 만큼만 받고 잔반의 양을 함께 확인하는 것이 더 중요하다는 생각은 글의 결과와 잘 맞아요. 여러 방법을 함께 운영한 뒤 잔반이 한 통 반으로 줄었어요. 이 글이 가장 하고 싶은 말은 뭐라고 생각해?'],
  ['student', '먹을 만큼만 받고 남은 음식의 양을 함께 살피는 작은 실천으로 음식 낭비를 줄일 수 있다는 것이에요. 학교가 선택제와 게시판을 운영한 뒤 잔반이 줄었다는 결과가 그 생각을 뒷받침해요.'],
  ['bot', '“먹을 만큼만 받고 남은 음식의 양을 함께 살피는 작은 실천으로 음식 낭비를 ”처럼 네 상황에 연결한 점이 중요해요. 글에서 “학교는 음식 낭비가 줄어든 만큼 아낀 돈으로 과일 후식을 늘릴 계획이며, 전문가는 잔반 줄이기가 학교와 지구를 함께 지키는 실천이라고 설명했다”라는 문장을 찾을 수 있어요. 자료의 방법을 그대로 복사하기보다 네 상황에서 달라지는 조건을 함께 보면 돼요. 네 생각이 궁금해. 이 글을 읽고 어떤 생각이나 느낌이 들었어?'],
  ['student', '나는 급식에서 처음에는 먹을 만큼만 받고 부족하면 더 받는 방법을 실천하고 싶어요. 글에서 먹을 만큼 받으면 다 먹기 쉽다고 했고 잔반도 줄었기 때문이에요. 친구들과 남긴 음식의 양도 함께 확인하면 좋겠어요.'],
];
const recorded = recordedTexts.map(([speaker, text]) => ({ speaker, text }));

function inputForTurn(turn, overrides = {}) {
  const current = recorded[turn - 1];
  assert.equal(current.speaker, 'student');
  return {
    schemaVersion: 1,
    requestId: `synthetic-evaluation-turn-${turn}`,
    sessionKey: 'synthetic-evaluation-dialogue',
    activityMode: 'evaluation',
    supportedOutputContracts: ['grounded_answer_v2', 'lead_evidence_quote_v1'],
    studentMessage: current.text,
    history: structuredClone(recorded.slice(0, turn - 1)),
    lesson,
    ...overrides,
  };
}

function coreTurn(input) {
  const config = createLiteQuestioningConfig(input.lesson, input.activityMode);
  const conversation = input.history.map(({ speaker, text }) => ({
    role: speaker === 'bot' ? 'assistant' : 'student', content: text,
  }));
  const { result } = runQuestioningLocalEngine({ config, question: input.studentMessage, conversation });
  const metadata = getQuestioningTurnMetadata({
    result,
    currentTurn: input.studentMessage,
    conversation,
    material: config.material,
    standard: config.standard,
    teacherMemo: config.material.questionFocusMemo,
  });
  return { result, metadata };
}

function finalizeFallback(input, plan) {
  // Force the provider-rejection path without a real provider call. Managed
  // phase completion must survive local fallback as well as provider success.
  return finalizeLiteEngineReply({
    ...input,
    policyVersion: plan.policyVersion,
    planDigest: plan.planDigest,
    candidateReply: '자료에 없는 999통입니다.',
    candidateEvidenceQuote: '자료에 없는 근거',
  });
}

function assertUncutStudentQuotes(reply, studentMessage) {
  assert.ok(studentMessage.length > 42, 'exercise the reported long-answer boundary');
  assert.ok(!reply.includes(`“${studentMessage.slice(0, 42)}”`), 'do not present the arbitrary 42-character prefix as a quotation');
  for (const match of reply.matchAll(/“([^”]+)”/g)) {
    const quoted = match[1].trim();
    if (!studentMessage.startsWith(quoted) || quoted.length === studentMessage.length) continue;
    const nextCharacter = studentMessage.slice(quoted.length).trimStart()[0] || '';
    assert.ok(/[.!?。！？…]$/.test(quoted) || /^[.!?。！？]$/.test(nextCharacter),
      `student quotation cuts a clause mid-sentence: ${quoted}`);
  }
}

test('recorded evaluation conversation observes the opinion response and completes', () => {
  const input = inputForTurn(18);
  const { result, metadata } = coreTurn(input);
  assert.equal(result.conversationPhase, 2);
  assert.equal(metadata.managedKind, 'done');
  assert.ok(metadata.responseScore > 0, 'the actual opinion response must be scored');
  assert.equal(result.expectsStudentReply, false);
  assert.doesNotMatch(result.studentReply, /[?？]/);
  assert.ok(result.rubricScores.find((item) => item.criterionKey === 'reflection_opinion')?.score > 1,
    'observed opinion evidence must replace the waiting-for-an-answer score');

  const plan = createLiteEnginePlan(input);
  assert.equal(plan.observation.managedKind, 'done');
  assert.ok(plan.observation.responseScore > 0);
  assert.equal(plan.enforcement.allowQuestion, false);
  const final = finalizeFallback(input, plan);
  assert.equal(final.observation.managedKind, 'done');
  assert.equal(final.expectsStudentReply, false);
  assert.doesNotMatch(final.studentReply, /[?？]|999/);
});

for (const prompt of [
  '이 글을 읽고 어떤 생각이나 느낌이 들었어? 네 생각이 궁금해.',
  '네 생각이 궁금해. 이 글을 읽고 어떤 생각이나 느낌이 들었어?',
  '이 글을 읽고 어떤 생각이나 느낌이 들었어?',
]) {
  test(`opinion completion recognizes the same prompt after reordering: ${prompt}`, () => {
    const input = inputForTurn(18);
    input.history.at(-1).text = prompt;
    const plan = createLiteEnginePlan(input);
    assert.equal(plan.observation.managedKind, 'done');
    assert.ok(plan.observation.responseScore > 0);
    assert.equal(plan.enforcement.maximumQuestionCount, 0);
    assert.doesNotMatch(plan.fallbackReply, /[?？]/);
  });
}

test('the finalized opinion prompt survives the next request history round trip', () => {
  const priorInput = inputForTurn(16);
  const priorPlan = createLiteEnginePlan(priorInput);
  const priorFinal = finalizeFallback(priorInput, priorPlan);
  assert.equal(priorFinal.observation.managedKind, 'opinion');
  assert.equal(priorFinal.expectsStudentReply, true);

  const nextInput = inputForTurn(18, {
    history: [
      ...priorInput.history,
      { speaker: 'student', text: priorInput.studentMessage },
      { speaker: 'bot', text: priorFinal.studentReply },
    ],
  });
  const nextPlan = createLiteEnginePlan(nextInput);
  assert.equal(nextPlan.observation.managedKind, 'done');
  assert.ok(nextPlan.observation.responseScore > 0);
  assert.equal(nextPlan.enforcement.maximumQuestionCount, 0);
  const nextFinal = finalizeFallback(nextInput, nextPlan);
  assert.equal(nextFinal.observation.managedKind, 'done');
  assert.equal(nextFinal.expectsStudentReply, false);
  assert.doesNotMatch(nextFinal.studentReply, /[?？]/);
});

for (const turn of [10, 16, 18]) {
  test(`long student answer is not quoted with a chopped clause: turn ${turn}`, () => {
    const input = inputForTurn(turn);
    const { result } = coreTurn(input);
    assertUncutStudentQuotes(result.studentReply, input.studentMessage);
    const plan = createLiteEnginePlan(input);
    assertUncutStudentQuotes(plan.fallbackReply, input.studentMessage);
    assertUncutStudentQuotes(finalizeFallback(input, plan).studentReply, input.studentMessage);
  });
}

test('a reason for a personal practice is not rebuked as a definite causal claim', () => {
  const input = inputForTurn(18);
  const { result } = coreTurn(input);
  const plan = createLiteEnginePlan(input);
  for (const reply of [result.studentReply, plan.fallbackReply, finalizeFallback(input, plan).studentReply]) {
    assert.doesNotMatch(reply, /한 가지 원인으로 단정|원인으로 확정|결과를 설명하는 하나의 가설|자료가 모든 조건을/);
    assert.match(reply, /실천|먹을 만큼|부족하면|네 상황|생각/);
  }
});

test('a genuine causal-certainty question retains the need for caution', () => {
  const input = inputForTurn(18, {
    studentMessage: '선택제 하나 때문에 잔반이 줄었다고 확신할 수 있나요?',
    history: [],
  });
  const { result } = coreTurn(input);
  const plan = createLiteEnginePlan(input);
  assert.equal(plan.observation.sourceStatus, 'reasonable_inference');
  assert.match(plan.observation.sourceCue, /선택제와 잔반 게시판/);
  for (const reply of [result.studentReply, plan.fallbackReply, finalizeFallback(input, plan).studentReply]) {
    assert.match(reply, /단정|확정|다른 조건|따로 확인|가능성/);
    assert.doesNotMatch(reply, /선택제 하나 때문에 줄었다는 것이 확실/);
  }
});
