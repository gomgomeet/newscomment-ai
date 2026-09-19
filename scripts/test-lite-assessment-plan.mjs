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
    if (specifier.startsWith('@/')) return { url: pathToFileURL(path.join(root, `${specifier.slice(2)}.ts`)).href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && url.endsWith('.ts')) return {
      format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText,
    };
    return nextLoad(url, context);
  },
});

const { normalizeAssessmentPlan, normalizeAssessmentProgress, createAssessmentPlanId, runLiteAssessmentTurn } = await import('../lib/lite-assessment-plan.ts');

const materialText = '정부는 전기를 보내기 위해 변전소를 크게 지으려고 합니다. 주민들은 소음과 안전을 걱정하며 반대합니다. 주민들의 반대로 사업이 두 해 동안 지연됐습니다.';
const lessonIdentity = JSON.stringify(['LOCAL-LESSON', 2, 'synthetic-material-hash']);
function criterion(id = 'criterion_1', overrides = {}) {
  return {
    id, criterion: '자료에서 입장과 그 이유를 구분하여 설명한다.', responseKind: 'explanation',
    mainQuestion: '정부와 주민의 입장은 어떻게 다른가요?',
    followUpQuestion: '글에서 답을 뒷받침하는 부분을 찾아 적어 줄래요?',
    evidenceDescription: '서로 다른 입장과 그 이유를 학생 스스로 구분한 실제 발화',
    sourceQuote: '주민들은 소음과 안전을 걱정하며 반대합니다.', requireSourceEvidence: true,
    ...overrides,
  };
}
function plan(items = [criterion()]) { return { schemaVersion: 1, approved: true, criteria: items }; }
function base(overrides = {}) {
  return {
    studentReply: '자료에서 주민들은 소음과 안전을 걱정한다고 설명해요. 어떤 부분이 눈에 띄나요?',
    safetyFlag: false, isClosing: false, primaryMove: 'receive', sourceStatus: 'supported',
    sourceCue: '주민들은 소음과 안전을 걱정하며 반대합니다.', questionType: 'fact', curriculumRelation: 'direct',
    ...overrides,
  };
}
function run(currentTurn, overrides = {}) {
  const configuredPlan = overrides.plan || plan();
  return runLiteAssessmentTurn({
    plan: configuredPlan, lessonIdentity, materialText, currentTurn, requestId: 'request_1',
    baseResult: base(), history: [{ role: 'assistant', content: configuredPlan.criteria[0]?.mainQuestion || '' }],
    ...overrides,
  });
}
const evidenceAnswer = '“주민들은 소음과 안전을 걱정하며 반대합니다.”라는 구절에서 주민들이 안전을 우려한다는 것을 알 수 있어요.';

test('missing plan is backward-compatible, drafts remain non-executable', () => {
  assert.deepEqual(normalizeAssessmentPlan(undefined, materialText), { schemaVersion: 1, approved: false, criteria: [] });
  const draft = plan([criterion('c', { criterion: '', mainQuestion: '', followUpQuestion: '', evidenceDescription: '', sourceQuote: '' })]);
  draft.approved = false;
  assert.equal(normalizeAssessmentPlan(draft, materialText).criteria[0].criterion, '');
  assert.equal(run('안녕', { plan: draft }), null);
  assert.equal(run('안녕', { plan: normalizeAssessmentPlan(undefined, materialText) }), null);
});

test('plan schema, types, count, IDs and all text bounds are checked even for drafts', () => {
  for (const value of [[], 1, true, '{broken', { schemaVersion: 2, approved: false, criteria: [] }, { schemaVersion: 1, approved: 'yes', criteria: [] }]) {
    assert.throws(() => normalizeAssessmentPlan(value, materialText));
  }
  assert.throws(() => normalizeAssessmentPlan(plan(Array.from({ length: 6 }, (_, i) => criterion(`c${i}`))), materialText));
  assert.throws(() => normalizeAssessmentPlan(plan([criterion('same'), criterion('same')]), materialText), /ID/);
  for (const id of ['', '한글', 'contains space', ' padded', 'padded ', 'x'.repeat(41)]) assert.throws(() => normalizeAssessmentPlan(plan([criterion(id)]), materialText), /ID/);
  for (const [field, limit] of Object.entries({ criterion: 180, mainQuestion: 250, followUpQuestion: 250, evidenceDescription: 300, sourceQuote: 240 })) {
    const p = plan([criterion('c', { [field]: '가'.repeat(limit + 1) })]);
    p.approved = false;
    assert.throws(() => normalizeAssessmentPlan(p, materialText), /문자열/);
  }
  for (const overrides of [{ responseKind: 'score' }, { requireSourceEvidence: 1 }, { criterion: 4 }]) {
    assert.throws(() => normalizeAssessmentPlan(plan([criterion('c', overrides)]), materialText));
  }
});

test('approval requires complete cards, one terminal question and literal source quote', () => {
  for (const question of ['설명해 주세요.', '어떤가요? 이유는요?', '어떤가요? 뒤에 말']) {
    assert.throws(() => normalizeAssessmentPlan(plan([criterion('c', { mainQuestion: question })]), materialText), /물음표/);
  }
  assert.throws(() => normalizeAssessmentPlan(plan([criterion('c', { evidenceDescription: '' })]), materialText), /빈 항목/);
  assert.throws(() => normalizeAssessmentPlan(plan([criterion('c', { sourceQuote: '본문에 없는 자료' })]), materialText), /본문/);
  assert.equal(normalizeAssessmentPlan(plan([criterion('c', { mainQuestion: '무엇인가요？', sourceQuote: '주민들은  소음과\n안전을 걱정하며 반대합니다.' })]), materialText).criteria.length, 1);
  const saved = plan([criterion('c', { sourceQuote: '예전 본문의 구절' })]);
  assert.deepEqual(normalizeAssessmentPlan(saved, materialText, false), saved);
});

test('plan normalization is canonical and identity binds content and lesson revision', () => {
  const p = plan();
  assert.deepEqual(normalizeAssessmentPlan(JSON.stringify(p), materialText), p);
  const normalized = normalizeAssessmentPlan({ extra: 'ignored', ...p }, materialText);
  assert.equal(createAssessmentPlanId(normalized, lessonIdentity), createAssessmentPlanId(p, lessonIdentity));
  assert.notEqual(createAssessmentPlanId(p, lessonIdentity), createAssessmentPlanId(p, lessonIdentity + 'new'));
  assert.notEqual(createAssessmentPlanId(p, lessonIdentity), createAssessmentPlanId(plan([criterion('c')]), lessonIdentity));
});

test('canonical plan parity: trim text before limits, cap JSON at 12000 and disapprove empty plans', () => {
  const p = plan([criterion('c', { criterion: `  ${'가'.repeat(180)}  ` })]);
  assert.equal(normalizeAssessmentPlan(p, materialText).criteria[0].criterion, '가'.repeat(180));
  assert.deepEqual(normalizeAssessmentPlan({ schemaVersion: 1, approved: true, criteria: [] }, materialText), {
    schemaVersion: 1, approved: false, criteria: [],
  });
  const json = JSON.stringify(plan());
  assert.deepEqual(normalizeAssessmentPlan(json.padEnd(12000, ' '), materialText), plan());
  assert.throws(() => normalizeAssessmentPlan(json.padEnd(12001, ' '), materialText), /너무 큽니다/);
});

test('no prior task means show first teacher question, not score greeting or arbitrary answer', () => {
  const result = run('안녕하세요. 시작할게요.', { history: [] });
  assert.equal(result.reply, plan().criteria[0].mainQuestion);
  assert.equal(result.progress.items[0].attempts, 0);
  assert.equal(result.progress.lastEvent.kind, 'prompt');
  assert.equal(result.allowQuestion, true);
});

test('a real answer without a matching source passage gets exactly one teacher follow-up', () => {
  const result = run('정부에서는 변전소를 크게 지으려고 하고 주민들은 반대하고 있습니다.');
  assert.equal(result.progress.stage, 'followup');
  assert.equal(result.progress.items[0].status, 'awaiting_evidence');
  assert.equal(result.progress.items[0].attempts, 1);
  assert.equal(result.managedQuestion, plan().criteria[0].followUpQuestion);
  assert.equal((result.reply.match(/[?？]/g) || []).length, 1);
  assert.equal(result.reply, '네 답변을 남겼어요. ' + result.managedQuestion);
  assert.doesNotMatch(result.reply, /따옴표|구절을.*묶|질문해 주세요/);
});

test('two actual answers lacking a verified quote close as teacher review, not failure or mastery', () => {
  const first = run('정부와 주민의 입장이 서로 다릅니다.');
  const second = run('주민들이 싫다고 말했습니다.', { requestId: 'request_2', progress: first.progress, history: [] });
  assert.equal(second.progress.stage, 'complete');
  assert.equal(second.progress.items[0].status, 'needs_review');
  assert.equal(second.progress.items[0].attempts, 2);
  assert.equal(second.isClosing, true);
  assert.match(second.reply, /더 확인할 내용/);
  assert.doesNotMatch(second.reply, /통과|미달|성취했|점수|정답/);
});

test('an exact passage is verified without quotation marks, but a short overlap or paraphrase is not', () => {
  for (const answer of ['주민들은', '주민들은 소음과 안전을', '주민들은 변전소를 좋아하고 모두 찬성합니다.', '“주민들은”이란 말이 나와 있습니다.', '“주민들은 변전소를 좋아하고 모두 찬성합니다.”라고 나옵니다.']) {
    assert.equal(run(answer).progress.lastEvent.evidenceVerified, false, answer);
  }
  for (const answer of [evidenceAnswer, '주민들은 소음과 안전을 걱정하며 반대합니다.', '주민들은 소음과 안전을 걱정하며 반대합니다. 그래서 안전이 중요해요.', '"주민들은  소음과\t안전을 걱정하며 반대합니다."라고 나옵니다.', "'주민들은 소음과 안전을 걱정하며 반대합니다.'라는 문장입니다."]) {
    const result = run(answer);
    assert.equal(result.progress.lastEvent.evidenceVerified, true);
    assert.equal(result.progress.items[0].evidenceRequestId, 'request_1');
    assert.equal(result.progress.items[0].status, 'collected');
    assert.doesNotMatch(result.reply, /성취했|통과|훌륭한|정답/);
  }
});

test('optional source evidence collects an actual explanation without asserting semantic validity', () => {
  const result = run('정부의 입장과 주민들의 입장이 다릅니다.', { plan: plan([criterion('c', { requireSourceEvidence: false })]) });
  assert.equal(result.progress.items[0].status, 'collected');
  assert.equal(result.progress.items[0].evidenceRequestId, '');
  assert.equal(result.progress.lastEvent.evidenceVerified, false);
  assert.match(result.reply, /선생님/);
});

test('hint uses current approved quote, maintains task, does not count as an attempt', () => {
  const p = plan([criterion('c1', { requireSourceEvidence: false }), criterion('c2', { sourceQuote: '정부는 전기를 보내기 위해', mainQuestion: '정부가 변전소를 크게 지으려는 이유는 무엇인가요?' })]);
  const first = run('정부와 주민은 서로 다른 입장입니다.', { plan: p });
  const hint = run('힌트가 필요해요.', { plan: p, requestId: 'request_hint', progress: first.progress, history: [] });
  assert.equal(hint.progress.activeIndex, 1);
  assert.equal(hint.progress.items[1].attempts, 0);
  assert.equal(hint.progress.items[1].hintCount, 1);
  assert.equal(hint.progress.items[1].assisted, true);
  assert.equal(hint.managedQuestion, p.criteria[1].mainQuestion);
  assert.match(hint.reply, /정부는 전기를 보내기 위해/);
  assert.doesNotMatch(hint.reply, /걱정하며 반대합니다/);
  const retry = run('힌트가 필요해요.', { plan: p, requestId: 'request_hint', progress: hint.progress, history: [] });
  assert.deepEqual(retry.progress, hint.progress);
});

test('hint following first answer stays at follow-up and next genuine answer can collect evidence', () => {
  const first = run('주민들이 반대하고 있습니다.');
  const hint = run('힌트 주세요.', { requestId: 'hint', progress: first.progress });
  assert.equal(hint.progress.items[0].attempts, 1);
  assert.equal(hint.managedQuestion, plan().criteria[0].followUpQuestion);
  const answer = run(evidenceAnswer, { requestId: 'answer_after_hint', progress: hint.progress });
  assert.equal(answer.progress.items[0].status, 'collected');
  assert.equal(answer.progress.items[0].attempts, 2);
  assert.equal(answer.progress.items[0].assisted, true);
});

test('student clarification receives source answer without replacing or advancing the task', () => {
  const question = run('주민들은 왜 반대하나요?');
  assert.match(question.reply, /소음과 안전/);
  assert.equal(question.managedQuestion, plan().criteria[0].mainQuestion);
  assert.equal(question.progress.items[0].attempts, 0);
  assert.equal(question.progress.items[0].assisted, true);
  assert.equal(question.progress.lastEvent.kind, 'question');
  assert.equal((question.reply.match(/[?？]/g) || []).length, 1);
});

test('student-question task records original student questions, not an ordinary declarative answer', () => {
  const p = plan([criterion('ask', { responseKind: 'student_question', requireSourceEvidence: false, mainQuestion: '자료를 읽고 더 알아보고 싶은 질문 하나를 만들어 줄래요?', followUpQuestion: '네가 궁금한 점을 질문으로 바꾸어 줄래요?' })]);
  const first = run('주민들은 반대하고 있어요.', { plan: p });
  assert.equal(first.progress.stage, 'followup');
  const second = run('주민들의 소음 걱정을 줄이려면 어떤 방법을 쓸 수 있나요?', { plan: p, progress: first.progress, requestId: 'own_question' });
  assert.equal(second.progress.items[0].status, 'collected');
  assert.equal(second.progress.items[0].evidenceRequestId, '');
  assert.equal(second.progress.items[0].answerRequestId, 'own_question');
});

test('student-question criteria with required evidence need both the own question and a matching passage', () => {
  const p = plan([criterion('ask_with_quote', { responseKind: 'student_question', mainQuestion: '자료를 읽고 더 알아보고 싶은 질문 하나를 만들어 줄래요?' })]);
  const first = run('주민들의 소음 걱정을 줄이려면 어떤 방법을 쓸 수 있나요?', { plan: p });
  assert.equal(first.progress.items[0].status, 'awaiting_evidence');
  assert.equal(first.progress.items[0].evidenceRequestId, '');
  assert.doesNotMatch(first.reply, /따옴표/);
  assert.equal((first.reply.match(/[?？]/g) || []).length, 1);
  const second = run('주민들은 소음과 안전을 걱정하며 반대합니다. 소음 걱정을 줄일 방법은 무엇인가요?', {
    plan: p, progress: first.progress, requestId: 'own_question_with_quote',
  });
  assert.equal(second.progress.items[0].status, 'collected');
  assert.equal(second.progress.items[0].evidenceRequestId, 'own_question_with_quote');
  assert.equal(second.progress.lastEvent.evidenceVerified, true);
  const corrupted = structuredClone(second.progress);
  corrupted.items[0].evidenceRequestId = '';
  assert.throws(() => normalizeAssessmentProgress(corrupted, p, lessonIdentity), /수집한 응답의 근거/);
  const wrong = run('“주민들은 변전소 건설에 모두 찬성합니다.”라는 말의 이유는 무엇인가요?', { plan: p });
  assert.equal(wrong.progress.items[0].status, 'awaiting_evidence');
  const justQuote = run('주민들은 소음과 안전을 걱정하며 반대합니다.', { plan: p });
  assert.equal(justQuote.progress.items[0].status, 'awaiting_evidence');
});

test('copied bot or teacher question and requests to generate questions are not student evidence', () => {
  const p = plan([criterion('ask', { responseKind: 'student_question', mainQuestion: '궁금한 질문을 하나 만들어 줄래요?' })]);
  for (const turn of ['질문 하나 만들어 주세요.', '질문을 어떻게 만들어야 해요?', '주민들은 왜 반대할까요?', p.criteria[0].mainQuestion]) {
    const result = run(turn, { plan: p, history: [{ role: 'assistant', content: p.criteria[0].mainQuestion }, { role: 'assistant', content: '이런 것도 궁금할 수 있어요. 주민들은 왜 반대할까요?' }] });
    assert.equal(result.progress.items[0].attempts, 0, turn);
    assert.equal(result.progress.items[0].assisted, true, turn);
    assert.equal(result.progress.lastEvent.kind, 'question');
  }
});

test('skip means teacher review and moves forward without inventing answer evidence', () => {
  const p = plan([criterion('first'), criterion('second', { mainQuestion: '정부의 입장은 무엇인가요?' })]);
  const result = run('넘어갈래요.', { plan: p });
  assert.equal(result.progress.items[0].status, 'needs_review');
  assert.equal(result.progress.items[0].attempts, 0);
  assert.equal(result.progress.items[0].answerRequestId, '');
  assert.equal(result.progress.activeIndex, 1);
  assert.equal(result.managedQuestion, p.criteria[1].mainQuestion);
  assert.doesNotMatch(result.reply, /못했|실패|미달/);
});

test('safety, off-topic, repair and closing take precedence and do not count evidence', () => {
  for (const [overrides, turn, eventKind] of [
    [{ safetyFlag: true, primaryMove: 'safety_redirect', studentReply: '개인정보는 빼 주세요.' }, evidenceAnswer, 'safety'],
    [{ sourceStatus: 'out_of_scope', questionType: 'off_topic', studentReply: '수업자료로 돌아와 주세요.' }, '게임 이야기를 할까요?', 'question'],
    [{ primaryMove: 'repair', studentReply: '질문을 잠시 멈출게요.' }, '질문이 너무 많아요.', 'question'],
    [{ isClosing: true, primaryMove: 'close', studentReply: '여기서 마칠게요.' }, '그만할래요.', 'closing'],
  ]) {
    const result = run(turn, { baseResult: base(overrides) });
    assert.equal(result.reply, overrides.studentReply);
    assert.equal(result.progress.items[0].attempts, 0);
    assert.equal(result.progress.lastEvent.kind, eventKind);
  }
  const privacy = run('010-1234-5678 제 연락처예요.');
  assert.equal(privacy.primaryMove, 'safety_redirect');
  assert.doesNotMatch(privacy.reply, /010-1234-5678/);
  assert.equal(privacy.progress.items[0].answerRequestId, '');
});

test('saved progress works across five criteria despite >18 turns and empty trimmed history', () => {
  const p = plan(Array.from({ length: 5 }, (_, i) => criterion(`c${i}`, { mainQuestion: `자료의 ${i + 1}번째 관점은 무엇인가요?` })));
  let result;
  for (let i = 0; i < 5; i += 1) {
    for (let hint = 0; hint < 5; hint += 1) {
      result = run('힌트가 필요해요.', { plan: p, requestId: `hint_${i}_${hint}`, progress: result?.progress, history: [] });
    }
    result = run(evidenceAnswer, { plan: p, requestId: `answer_${i}`, progress: result.progress, history: [] });
    assert.equal(result.progress.activeIndex, i + 1);
  }
  assert.equal(result.progress.stage, 'complete');
  assert.deepEqual(result.progress.items.map((item) => item.status), Array(5).fill('collected'));
  assert.deepEqual(result.progress.items.map((item) => item.hintCount), Array(5).fill(5));
  assert.deepEqual(result.progress.items.map((item) => item.answerRequestId), ['answer_0', 'answer_1', 'answer_2', 'answer_3', 'answer_4']);
  assert.ok(Buffer.byteLength(JSON.stringify(result.progress)) < 8500);
});

test('reusing an answer request does not advance another criterion or mutate caller state', () => {
  const p = plan([criterion('first'), criterion('second')]);
  const result = run(evidenceAnswer, { plan: p });
  const before = structuredClone(result.progress);
  const retry = run(evidenceAnswer, { plan: p, progress: result.progress });
  assert.deepEqual(retry.progress, before);
  assert.deepEqual(result.progress, before);
  const hinted = run('힌트 주세요.', { plan: p, progress: result.progress, requestId: 'intervening_hint' });
  const oldRetry = run(evidenceAnswer, { plan: p, progress: hinted.progress });
  assert.deepEqual(oldRetry.progress, hinted.progress);
});

test('progress rejects stale lesson/plan, malformed bounds, state order and impossible records', () => {
  const p = plan([criterion('first'), criterion('second')]);
  const initial = run('', { plan: p }).progress;
  assert.equal(normalizeAssessmentProgress(undefined, p, lessonIdentity), undefined);
  assert.throws(() => normalizeAssessmentProgress(initial, p, lessonIdentity + '_changed'), /바뀌었습니다/);
  assert.throws(() => normalizeAssessmentProgress(initial, plan([criterion('different'), criterion('second')]), lessonIdentity), /바뀌었습니다/);
  const mutations = [
    (s) => { s.activeIndex = 6; },
    (s) => { s.stage = 'complete'; },
    (s) => { s.items.reverse(); },
    (s) => { s.items[0].label = '변조'; },
    (s) => { s.items[0].attempts = 3; },
    (s) => { s.items[0].hintCount = 100; },
    (s) => { s.items[0].hintCount = 1; },
    (s) => { s.items[0].answerRequestId = 'fake'; },
    (s) => { s.items[0].evidenceRequestId = 'fake'; },
    (s) => { s.items[1].status = 'collected'; },
    (s) => { s.lastEvent.kind = 'score'; },
    (s) => { s.lastEvent.evidenceVerified = true; },
    (s) => { s.lastEvent.requestId = 'x'.repeat(101); },
    (s) => { s.items.pop(); },
  ];
  for (const mutate of mutations) {
    const s = structuredClone(initial);
    mutate(s);
    assert.throws(() => normalizeAssessmentProgress(s, p, lessonIdentity));
  }
});

test('progress never stores student content, scores, private details or teacher evidence descriptions', () => {
  const p = plan();
  const result = run(evidenceAnswer, { plan: p });
  assert.ok(!JSON.stringify(result.progress).includes(evidenceAnswer));
  assert.ok(!JSON.stringify(result.progress).includes(p.criteria[0].evidenceDescription));
  assert.equal(Object.hasOwn(result.progress.items[0], 'score'), false);
  assert.ok(!result.reply.includes(p.criteria[0].criterion));
  assert.ok(!result.reply.includes(p.criteria[0].evidenceDescription));
});
