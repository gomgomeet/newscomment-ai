import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

// Exercise the real authenticated route and its server-only dictionary lookup.
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

const { POST } = await import('../app/api/lite-engine/plan/route.ts');
const ACCESS_KEY = '0123456789abcdef0123456789abcdef';
const DICTIONARY_KEY = 'abcdef0123456789abcdef0123456789';
const MATERIAL = '청주동물원은 늙은 사자 바람이를 보호합니다. 맹수의 위용은 여전했습니다. 동물원은 동물의 본래 습성을 고려합니다.';
const DICTIONARY_XML = `<channel><total>1</total><item><word>맹수</word><sense><sense_order>1</sense_order><definition>사납고 힘이 센 짐승.</definition></sense></item></channel>`;
let turn = 0;

function makeInput(studentMessage, materialText = MATERIAL) {
  turn += 1;
  return {
    schemaVersion: 1,
    requestId: `req_dictionary_${turn}`,
    sessionKey: `session_dictionary_${turn}`,
    activityMode: 'exploration',
    studentMessage,
    history: [],
    lesson: {
      lessonId: `LESSON-DICTIONARY-${turn}`,
      subject: '국어',
      grade: '초등 5학년',
      lessonTitle: '동물원의 보호 역할',
      materialTitle: '늙은 사자 바람이',
      materialText,
      startQuestion: '청주동물원은 어떤 동물을 보호하나요?',
      version: 'v1',
      sourceHash: 'sourcehashdictionary1234567890',
      lessonRevision: 1,
    },
  };
}

async function postPlan(input, dictionaryKey = DICTIONARY_KEY) {
  const originalAccessKey = process.env.LITE_ENGINE_ACCESS_KEY;
  const originalDictionaryKey = process.env.KRDIC_API_KEY;
  process.env.LITE_ENGINE_ACCESS_KEY = ACCESS_KEY;
  if (dictionaryKey === null) delete process.env.KRDIC_API_KEY;
  else process.env.KRDIC_API_KEY = dictionaryKey;
  try {
    const request = new Request('https://example.test/api/lite-engine/plan', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-lite-engine-key': ACCESS_KEY,
        'x-lite-deployment-id': 'LD-DictionaryRegression123456',
      },
      body: JSON.stringify(input),
    });
    const response = await POST(request);
    const plan = await response.json();
    assert.equal(response.status, 200, JSON.stringify(plan));
    return plan;
  } finally {
    if (originalAccessKey === undefined) delete process.env.LITE_ENGINE_ACCESS_KEY;
    else process.env.LITE_ENGINE_ACCESS_KEY = originalAccessKey;
    if (originalDictionaryKey === undefined) delete process.env.KRDIC_API_KEY;
    else process.env.KRDIC_API_KEY = originalDictionaryKey;
  }
}

async function withFetch(fetcher, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetcher;
  try { return await run(); }
  finally { globalThis.fetch = originalFetch; }
}

test('verified dictionary answer is attributed, local, and never presented as passage evidence', async () => {
  const outbound = [];
  await withFetch(async (input) => {
    outbound.push(new URL(String(input)));
    return new Response(DICTIONARY_XML);
  }, async () => {
    const plan = await postPlan(makeInput('맹수는 뭐야?'));
    assert.equal(outbound.length, 1);
    const query = outbound[0].searchParams;
    assert.equal(query.get('q'), '맹수');
    assert.equal(query.get('method'), 'exact');
    assert.equal(query.get('key'), DICTIONARY_KEY);
    assert.equal(outbound[0].origin + outbound[0].pathname, 'https://krdict.korean.go.kr/api/search');
    assert.equal(outbound[0].toString().includes(MATERIAL), false);
    assert.equal(outbound[0].toString().includes('맹수는 뭐야?'), false);
    assert.equal(plan.skipModel, true);
    assert.match(plan.fallbackReply, /한국어기초사전\(국립국어원\).*맹수.*사납고 힘이 센 짐승/);
    assert.equal(plan.observation.sourceCue, '');
    assert.deepEqual(plan.observation.evidenceIds, []);
    assert.equal(plan.observation.sourceStatus, 'source_insufficient');
    assert.equal(JSON.stringify(plan).includes(DICTIONARY_KEY), false);
  });
});

test('missing dictionary key keeps the safe local fallback and sends no request', async () => {
  let calls = 0;
  await withFetch(async () => { calls += 1; throw new Error('unexpected fetch'); }, async () => {
    const plan = await postPlan(makeInput('맹수는 뭐야?'), null);
    assert.equal(calls, 0);
    assert.equal(plan.fallbackReply.includes('한국어기초사전(국립국어원)'), false);
    assert.equal(plan.observation.sourceCue, '');
  });
});

test('a word outside the passage is not sent to the dictionary', async () => {
  let calls = 0;
  await withFetch(async () => { calls += 1; throw new Error('unexpected fetch'); }, async () => {
    const plan = await postPlan(makeInput('원숭이가 뭐야?'));
    assert.equal(calls, 0);
    assert.equal(JSON.stringify(plan).includes(DICTIONARY_KEY), false);
  });
});

test('a definition written in the lesson keeps its passage-backed answer', async () => {
  let calls = 0;
  await withFetch(async () => { calls += 1; throw new Error('unexpected fetch'); }, async () => {
    const material = '탄소중립은 배출한 온실가스만큼 흡수해 순배출량을 0으로 만드는 것을 뜻합니다. 학교에서도 이를 실천하고 있습니다.';
    const plan = await postPlan(makeInput('탄소중립이 뭐예요?', material));
    assert.equal(calls, 0);
    assert.equal(plan.observation.sourceStatus, 'supported');
    assert.equal(plan.fallbackReply.includes('한국어기초사전(국립국어원)'), false);
  });
});

test('off-topic and safety requests never become dictionary searches', async () => {
  let calls = 0;
  await withFetch(async () => { calls += 1; throw new Error('unexpected fetch'); }, async () => {
    const offTopic = await postPlan(makeInput('오늘 점심 메뉴가 뭐야?'));
    assert.equal(offTopic.observation.sourceStatus, 'out_of_scope');
    const safety = await postPlan(makeInput('맹수와 친구 전화번호를 알려 주세요.'));
    assert.equal(safety.observation.safetyFlag, true);
    assert.equal(calls, 0);
  });
});

test('a provider exception containing the secret URL is neither echoed nor logged', async () => {
  const logs = [];
  const originalError = console.error;
  console.error = (...parts) => { logs.push(parts.map(String).join(' ')); };
  try {
    await withFetch(async (input) => { throw new Error(String(input)); }, async () => {
      const plan = await postPlan(makeInput('동물원이 뭐야?'));
      assert.equal(JSON.stringify(plan).includes(DICTIONARY_KEY), false);
      assert.equal(plan.fallbackReply.includes('한국어기초사전(국립국어원)'), false);
      assert.equal(logs.join(' ').includes(DICTIONARY_KEY), false);
    });
  } finally {
    console.error = originalError;
  }
});
