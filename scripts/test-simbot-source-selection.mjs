import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real shared local engine without a server, model, or database.
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

const { buildRubric, createLocalQuestionResult, normalizeQuestioningChatbotConfig } = await import('../lib/questioning-board.ts');
const { runQuestioningLocalEngine } = await import('../lib/questioning-engine-core.ts');

function ask(text, question) {
  return createLocalQuestionResult({
    studentTurn: question,
    material: {
      materialTitle: '근거 선택 검사', summary: text, visibleText: text,
      keyConcepts: [], vocabulary: [], possibleMisconceptions: [], questionSeeds: [],
      questionFocusMemo: '', sourceLimit: '', safetyNotice: '',
    },
    rubric: buildRubric(''),
    conversation: [],
  });
}

const food = '이 자료는 기존 웹 챗봇의 동작 점검용 예시입니다.\n\n푸른초등학교는 급식 잔반을 줄이기 위해 학생들이 반찬 양을 스스로 고르는 선택제와 잔반 게시판을 운영했다. 예전에는 하루에 큰 통 세 통이 넘는 잔반이 나왔고, 처리 비용도 적지 않았다. 학교는 반찬을 받을 때 조금, 보통, 많이 가운데 먹을 양을 고르게 하고, 학급별 잔반 무게를 게시판에 붙였다. 그 결과 하루 세 통이 넘던 잔반이 한 통 반으로 줄었고, 학생들은 먹을 만큼만 받으면 다 먹기 쉽다는 점을 알게 되었다. 학교는 음식 낭비가 줄어든 만큼 아낀 돈으로 과일 후식을 늘릴 계획이며, 전문가는 잔반 줄이기가 학교와 지구를 함께 지키는 실천이라고 설명했다.';

test('why selects the relevant mechanism rather than an unrelated reported explanation', () => {
  const result = ask(food, '선택제를 하면 잔반을 줄이는데 왜 도움이 될까?');
  assert.match(result.studentReply, /먹을 만큼만 받으면 다 먹기 쉽다/);
  assert.doesNotMatch(result.studentReply, /과일|자료가 모든 조건|추론한 부분|가능성은 설명/);
  assert.equal(result.sourceStatus, 'reasonable_inference');
});

test('final quantity survives both excerpt and final sentence selection', () => {
  const result = ask(food, '글에서 줄어든 잔반은 최종적으로 하루 몇 통인가요?');
  assert.match(result.sourceCue, /한 통 반/);
  assert.match(result.studentReply, /한 통 반/);
  assert.doesNotMatch(result.studentReply, /과일|여기까지|더 알고 싶은/);
  assert.equal(result.sourceStatus, 'supported');
});

test('the previously distracting sentence remains available when it answers the question', () => {
  const result = ask(food, '학교는 아낀 돈을 어디에 쓸 계획인가요?');
  assert.match(result.studentReply, /과일 후식을 늘릴 계획/);
});

test('selection-method questions prefer the actual options to a general introduction', () => {
  const result = ask(food, '학생들은 반찬 양을 어떻게 고를 수 있었나요?');
  assert.match(result.sourceCue, /조금, 보통, 많이/);
  assert.match(result.studentReply, /조금, 보통, 많이/);
});

test('a causal certainty request still receives a limitation', () => {
  const result = ask(food, '선택제 하나 때문에 잔반이 줄었다고 확실히 말할 수 있나요?');
  assert.match(result.studentReply, /한 가지 원인으로 확정할 수 있는지는 따로 확인/);
  assert.equal(result.sourceStatus, 'reasonable_inference');
});

test('a different subject uses its actual causal sentence, not a closing expert quote', () => {
  const text = '학교는 창가 책상의 빛 반사 때문에 칠판 글씨가 잘 보이지 않는다고 조사했다. 차양을 설치하면 빛 반사가 줄어 칠판 글씨를 보기 쉽다. 전문가는 남은 예산으로 새 책을 살 계획이라고 설명했다.';
  const result = ask(text, '차양을 설치하면 칠판을 보는 데 왜 도움이 될까요?');
  assert.match(result.studentReply, /차양을 설치하면 빛 반사가 줄어/);
  assert.doesNotMatch(result.studentReply, /새 책|예산|자료가 모든 조건/);
});

test('decimal quantities remain intact and requested units beat unrelated numbers', () => {
  const text = '관측에 참여한 학생은 24명이다. 정수 장치를 설치한 뒤 물 사용량은 하루 18리터에서 10.4리터로 줄었다. 전문가는 새 실험실을 소개할 계획이라고 설명했다.';
  const result = ask(text, '물 사용량은 최종적으로 하루 몇 리터인가요?');
  assert.match(result.studentReply, /10\.4리터/);
  assert.doesNotMatch(result.studentReply, /24명|실험실/);
});

test('adjacent sentence terms do not make a distracting preceding sentence the answer', () => {
  const text = '전시관은 내년에 안내판을 바꿀 계획이다. 전시관은 겨울에 방문 시간이 짧아져 관람 시간을 저녁 여덟 시까지 늘렸다. 학생들은 안내 지도를 받아 전시관을 둘러보았다.';
  const result = ask(text, '전시관은 왜 관람 시간을 늘렸나요?');
  assert.match(result.studentReply, /방문 시간이 짧아져/);
  assert.doesNotMatch(result.studentReply, /안내판/);
});

test('explicit transfer uncertainty and private information behavior stay intact', () => {
  const transfer = ask(food, '다른 학교에서도 똑같은 결과가 나올까요?');
  assert.match(transfer.studentReply, /장담할 수는 없|알 수는 없/);
  assert.equal(transfer.sourceStatus, 'source_insufficient');
  const privateTurn = ask(food, '제 전화번호는 010-1234-5678이에요');
  assert.doesNotMatch(privateTurn.studentReply, /010-1234-5678/);
  assert.ok(privateTurn.safetyFlag);
});

test('a causal-certainty excerpt includes the material limitation as well as the result', () => {
  const text = '안내판을 세운 뒤 지각 횟수는 12번에서 7번으로 줄었다. 학교는 다음 달에 안내판을 더 설치할 계획이다. 다만 같은 기간 버스 시간도 바뀌어 안내판만의 효과는 확인하지 못했다.';
  const result = ask(text, '지각이 줄어든 게 안내판 때문이라고 확실히 말할 수 있나요?');
  assert.match(result.sourceCue, /12번에서 7번/);
  assert.match(result.sourceCue, /버스 시간도 바뀌어/);
  assert.match(result.studentReply, /확인하지 못했다|확정할 수/);
});

test('existing development and holdout dialogue expectations survive the shared-core change', () => {
  // Reuse only the existing runner's pure expectation checks. Its HTTP client and
  // file-writing main function are deliberately not evaluated or invoked.
  const runner = readFileSync(path.join(root, 'scripts/run-questioning-dialogue-eval.mjs'), 'utf8');
  const pureStart = runner.indexOf('const rubric =');
  const pureEnd = runner.indexOf('async function loadJson');
  assert.ok(pureStart >= 0 && pureEnd > pureStart);
  const checks = vm.runInNewContext(`(function () {
    ${runner.slice(pureStart, pureEnd)}
    return { rubric, materialFromArticle, inspectTurn };
  })()`);
  const fixtureRoot = path.join(root, 'evals/questioning-chatbot/fixtures');
  const articles = new Map(JSON.parse(readFileSync(path.join(fixtureRoot, 'articles.json'), 'utf8'))
    .map((article) => [article.id, article]));
  const sessions = ['sessions.json', 'holdout-sessions.json']
    .flatMap((file) => JSON.parse(readFileSync(path.join(fixtureRoot, file), 'utf8')));
  const failures = [];
  for (const session of sessions) {
    const config = normalizeQuestioningChatbotConfig({
      standard: session.standard, targetGrade: session.targetGrade,
      subjectUnit: '질문 중심 기사 읽기',
      material: checks.materialFromArticle(articles.get(session.articleId)), rubric: checks.rubric,
    });
    const conversation = [];
    const previousReplies = [];
    for (const [index, studentTurn] of session.turns.entries()) {
      const { result } = runQuestioningLocalEngine({ config, question: studentTurn, conversation });
      const inspection = checks.inspectTurn({
        response: result, session, turnNumber: index + 1, studentTurn, previousReplies,
      });
      for (const failure of inspection.failures) failures.push(`${session.id}#${index + 1}: ${failure}`);
      conversation.push({ role: 'student', content: studentTurn }, { role: 'assistant', content: result.studentReply });
      previousReplies.push(result.studentReply.trim());
    }
  }
  assert.deepEqual(failures, []);
});
