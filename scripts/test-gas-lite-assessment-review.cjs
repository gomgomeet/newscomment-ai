/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const context = vm.createContext({});
for (const name of ['SetupService.js', 'ConversationService.js', 'EvaluationService.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'gas-lite', name), 'utf8'), context, { filename:name });
}
const identity = { sessionId:'old-session', lessonId:'lesson-review', lessonRevision:1, studentCode:'01-001' };
const firstQuestion = '학교가 개인 물병을 권한 까닭을 설명해 줄래요?';
const followupQuestion = '그 설명의 자료 근거를 인용해 줄래요?';
const firstAnswer = '일회용 컵 쓰레기를 줄이려는 목적입니다.';
const secondAnswer = '“학교는 일회용 컵을 줄이기 위해 개인 물병 사용을 권했습니다.”';
const item = (id, overrides = {}) => ({
  id, label:id === 'reason' ? '당시 기준: 이유와 근거 연결' : '당시 기준: 자기 질문', status:'pending',
  attempts:0, hintCount:0, assisted:false, answerRequestId:'', evidenceRequestId:'', ...overrides,
});
const progress = (requestId, criterionId, kind, items, activeIndex, stage, verified = false) => ({
  schemaVersion:1, planId:'old-plan-id', activeIndex, stage, items,
  lastEvent:{ requestId, criterionId, kind, evidenceVerified:verified },
});
const rows = [];
const addRow = (speaker, requestId, text, state, extra = {}) => {
  const row = { ...identity, speaker, requestId, text, turnNo:rows.length + 1,
    engineStatus:'ok:test', assessmentProgressJson:state ? JSON.stringify(state) : '', ...extra };
  rows.push(row);
  return row;
};
addRow('bot', 'opening', firstQuestion);
addRow('student', 'hint-1', '힌트가 필요해요.');
const hint = progress('hint-1', 'reason', 'hint', [item('reason', { hintCount:1, assisted:true }), item('ask')], 0, 'main');
addRow('bot', 'hint-1', '자료의 이 부분을 살펴보세요. ' + firstQuestion, hint);
addRow('student', 'answer-1', firstAnswer);
const first = progress('answer-1', 'reason', 'answer', [item('reason', {
  status:'awaiting_evidence', attempts:1, hintCount:1, assisted:true, answerRequestId:'answer-1',
}), item('ask')], 0, 'followup');
addRow('bot', 'answer-1', followupQuestion, first);
addRow('student', 'help-1', '인용은 어떻게 하나요?');
const help = { ...first, lastEvent:{ requestId:'help-1', criterionId:'reason', kind:'question', evidenceVerified:false } };
addRow('bot', 'help-1', '자료 문장을 따옴표로 묶으면 돼요. ' + followupQuestion, help);
addRow('student', 'answer-2', secondAnswer);
const collectedItem = item('reason', { status:'collected', attempts:2, hintCount:1, assisted:true,
  answerRequestId:'answer-2', evidenceRequestId:'answer-2' });
const second = progress('answer-2', 'reason', 'answer', [collectedItem, item('ask')], 1, 'main', true);
addRow('bot', 'answer-2', '네 답변을 남겼어요. 궁금한 질문을 하나 만들어 줄래요?', second);
addRow('student', 'skip-1', '넘어갈래요.');
const completed = progress('skip-1', 'ask', 'skip', [collectedItem, item('ask', { status:'needs_review' })], 2, 'complete');
addRow('bot', 'skip-1', '더 확인할 내용은 선생님이 살펴볼 거예요.', completed);
const evaluation = { ...identity, criterionEvidenceJson:JSON.stringify(completed), finalStatus:'검수 필요' };
const review = (evaluationRow = evaluation, allRows = rows) => JSON.parse(JSON.stringify(
  context.buildLiteCriterionReviewRows_(evaluationRow, allRows)));

const result = review();
assert.equal(result.length, 2);
assert.equal(result[0].label, '당시 기준: 이유와 근거 연결');
assert.deepEqual(result[0].responses.map((response) => response.answerText), [firstAnswer, secondAnswer]);
assert.deepEqual(result[0].responses.map((response) => response.evidenceVerified), [false, true]);
assert.equal(result[0].responses[0].questionText, rows[2].text);
assert.equal(result[0].responses[1].questionText, rows[6].text);
assert.equal(result[0].answerText, secondAnswer);
assert.equal(result[0].evidenceText, secondAnswer);
assert.deepEqual(result[0].nonAnswerEvents.map((event) => event.kind), ['hint', 'question']);
assert.equal(result[1].responses.length, 0, 'Skipping is never manufactured into a student performance answer');
assert.equal(result[1].nonAnswerEvents[0].kind, 'skip');
assert.equal(result[1].answerRequestId, '');
assert.equal(result[1].status, 'needs_review');
assert.equal(Object.hasOwn(result[0], 'score'), false, 'Review assembly must not generate a grade');

// Same request IDs from a newer lesson revision/session/student cannot replace historical evidence.
const unrelated = [
  ...rows.map((row) => ({ ...row, lessonRevision:2, text:'새 개정의 다른 학생 발화' })),
  ...rows.map((row) => ({ ...row, sessionId:'different-session', text:'다른 세션 발화' })),
  ...rows.map((row) => ({ ...row, studentCode:'02-999', text:'다른 학생 발화' })),
];
assert.deepEqual(review(evaluation, [...unrelated, ...rows]), result);
const duplicateRows = [...rows, { ...rows[4], turnNo:100 }];
assert.equal(review(evaluation, duplicateRows)[0].responses.length, 2, 'Retries do not duplicate evidence');
const missingSecond = rows.filter((row) => !(row.speaker === 'student' && row.requestId === 'answer-2'));
assert.equal(review(evaluation, missingSecond)[0].responses.length, 1);
assert.equal(review(evaluation, missingSecond)[0].evidenceText, '원본 발화 기록을 확인해 주세요.');
const invalidSnapshots = rows.map((row) => row.speaker === 'bot' ? { ...row, assessmentProgressJson:'{broken' } : row);
assert.equal(review(evaluation, invalidSnapshots)[0].responses.length, 0, 'Missing events are not inferred from the latest plan');
assert.equal(review(evaluation, invalidSnapshots)[0].answerText, secondAnswer, 'The explicit saved last-answer pointer remains available');
const differentPlan = rows.map((row) => row.assessmentProgressJson ? {
  ...row, assessmentProgressJson:JSON.stringify({ ...JSON.parse(row.assessmentProgressJson), planId:'new-plan-id' }),
} : row);
assert.equal(review(evaluation, differentPlan)[0].responses.length, 0);
const wrongRequest = rows.map((row) => row.assessmentProgressJson ? {
  ...row, assessmentProgressJson:JSON.stringify({ ...JSON.parse(row.assessmentProgressJson),
    lastEvent:{ ...JSON.parse(row.assessmentProgressJson).lastEvent, requestId:'not-this-row' } }),
} : row);
assert.equal(review(evaluation, wrongRequest)[0].responses.length, 0);
assert.deepEqual(review({ ...evaluation, criterionEvidenceJson:'' }), []);
const extraHints = [];
for (let index = 0; index < 8; index += 1) {
  const requestId = 'extra-hint-' + index;
  const state = { ...hint, lastEvent:{ ...hint.lastEvent, requestId } };
  extraHints.push({ ...identity, speaker:'student', requestId, turnNo:20 + index * 2, text:'힌트 요청' });
  extraHints.push({ ...identity, speaker:'bot', requestId, turnNo:21 + index * 2, text:firstQuestion,
    assessmentProgressJson:JSON.stringify(state) });
}
assert.equal(review(evaluation, [...rows, ...extraHints])[0].nonAnswerEvents.length, 3,
  'Non-answer support logs have a bounded recent display');

// Execute the actual dashboard rendering in a small inert DOM, without Google access.
class Element {
  constructor(tagName) { this.tagName = tagName; this.children = []; this.dataset = {}; this.style = {}; this.attributes = {}; this._text = ''; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  addEventListener() {}
  descendants() { return this.children.flatMap((child) => [child, ...child.descendants()]); }
}
const dashboardHtml = fs.readFileSync(path.join(root, 'gas-lite', 'TeacherDashboard.html'), 'utf8');
const browser = vm.createContext({
  window:{ addEventListener() {} },
  document:{
    body:{ dataset:{ teacherAccessToken:'not-a-live-token' } },
    createElement:(tagName) => new Element(tagName),
    createTextNode:(text) => { const element = new Element('#text'); element.textContent = text; return element; },
  },
});
vm.runInContext(dashboardHtml.match(/<script>([\s\S]*?)<\/script>/)[1], browser);
const rendered = browser.evaluationCard({ ...evaluation, criterionEvidence:result });
assert.ok(rendered.textContent.includes(firstAnswer), 'The first explanation remains visible after a quote-only followup');
assert.ok(rendered.textContent.includes(secondAnswer));
assert.ok(rendered.textContent.includes(firstQuestion));
assert.ok(rendered.textContent.includes(followupQuestion));
assert.match(rendered.textContent, /도움 요청·건너뛰기.*평가 답변 아님/);
assert.match(rendered.textContent, /성적·성취 판정 아님/);
assert.match(rendered.textContent, /낮은 성취를 뜻하지 않습니다/);
assert.doesNotMatch(rendered.textContent, /자동 판단 근거 확인|아직 근거가 없습니다/);
assert.match(rendered.textContent, /교사 판단/);
assert.match(rendered.textContent, /교사 검수 저장/);
const injection = '<img src=x onerror=alert(1)>';
const malicious = structuredClone(result);
malicious[0].label = injection;
malicious[0].responses[0].answerText = injection;
malicious[0].responses[0].questionText = injection;
malicious[0].nonAnswerEvents[0].answerText = injection;
const escaped = browser.evaluationCard({ ...evaluation, criterionEvidence:malicious });
assert.ok(escaped.textContent.includes(injection));
assert.equal(escaped.descendants().some((element) => element.tagName === 'img'), false);
const fallback = browser.evaluationCard({ ...evaluation, criterionEvidence:review(evaluation, invalidSnapshots) });
assert.match(fallback.textContent, /개별 답변 사건 기록을 확인/);
const legacy = browser.evaluationCard({ ...identity, automaticJudgment:'공통 관찰 초안', evidenceSummary:'기존 관찰 근거' });
assert.match(legacy.textContent, /공통 관찰 근거 확인/);
assert.match(legacy.textContent, /기존 관찰 근거/);

console.log('GAS lite assessment review: linked prompts, both answers, evidence events, revision isolation, bounded help logs, and inert teacher rendering passed');
