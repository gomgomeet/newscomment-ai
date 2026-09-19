/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const harnessSource = fs.readFileSync(path.join(__dirname, 'test-gas-lite-teacher-setup-ui.cjs'), 'utf8').split('\nconst settings = {')[0];
const harnessContext = vm.createContext({ require, __dirname, console });
vm.runInContext(harnessSource + '\nthis.testHarness = { parseForm, Element };', harnessContext);
const { parseForm, Element } = harnessContext.testHarness;

const html = fs.readFileSync(path.join(__dirname, '..', 'gas-lite', 'TeacherDashboard.html'), 'utf8');
const elements = parseForm(html);
const byId = (id) => elements.find((element) => element.id === id);
const document = {
  body:elements.find((element) => element.tagName === 'body'),
  getElementById:byId,
  createElement:(tag) => new Element(tag),
  createTextNode:(value) => { const node = new Element('text'); node.textContent = value; return node; },
};
const dashboard = vm.createContext({ document, window:{addEventListener() {}} });
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], dashboard);

const base = { lesson:{lessonTitle:'테스트 수업'}, students:[], evaluations:[] };
dashboard.renderDashboard(base);
assert.equal(byId('source-review-count').textContent, '0개');
assert.match(byId('source-review-questions').textContent, /검토할 질문이 없습니다/);

const literal = '<img src=x onerror="alert(1)">';
dashboard.renderDashboard({ ...base, sourceReviewQuestions:[
  { questionText:'자료에서 동물이 쉬는 공간의 근거는?', count:3, lastAskedAt:'2026-09-19T08:10:00Z' },
  { questionText:literal, count:1, lastAskedAt:'' },
] });
const root = byId('source-review-questions');
assert.equal(byId('source-review-count').textContent, '2개');
assert.equal(root.children.length, 2);
assert.ok(root.textContent.includes('질문 기록 3회'));
assert.ok(root.textContent.includes('최근'));
assert.ok(root.textContent.includes(literal));
assert.equal(root.descendants().some((element) => element.tagName === 'img'), false,
  'Question text must not become executable HTML');
assert.equal(root.textContent.includes('학생 4-12'), false,
  'Review list does not add student identifiers');
assert.match(byId('source-review-title').textContent, /근거 보충이 필요한 질문/);

dashboard.renderDashboard({ ...base, sourceReviewQuestions:[null, {}, {questionText:'   '}] });
assert.equal(byId('source-review-count').textContent, '0개');
assert.equal(root.children.length, 1, 'Refresh removes stale questions');
assert.match(root.textContent, /검토할 질문이 없습니다/);

console.log('Teacher dashboard source-review UI: empty, safe questions, count, recency and refresh passed');
