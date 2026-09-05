#!/usr/bin/env node
/**
 * 5단계 검증 — 공개 진입점 submitTurn()을 처음부터 끝까지 돌린다.
 * 가짜 SpreadsheetApp 위에서 실제 자료(급식 잔반 기사)와 승인 어휘를 넣고,
 * 실행 계획 5단계 완료 조건(2국면 점검 6종)과 개선안 6절 점검표를 학생 발화로 친다.
 * AI는 끈다(규칙·카드 경로). AI 경로의 후처리는 scripts/test-gas-lightweight.cjs가 본다.
 *
 *   node evals/gas/e2e.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

// ---------- 가짜 Apps Script (scripts/test-gas-lightweight.cjs 와 같은 모양) ----------
class RangeMock {
  constructor(sheet, row, column, rowCount = 1, columnCount = 1) { Object.assign(this, { sheet, row, column, rowCount, columnCount }); }
  getValues() { const rows = []; for (let r = 0; r < this.rowCount; r++) { const row = []; for (let c = 0; c < this.columnCount; c++) row.push(this.sheet.getCell(this.row + r, this.column + c)); rows.push(row); } return rows; }
  getDisplayValues() { return this.getValues().map((row) => row.map((v) => (v == null ? '' : String(v)))); }
  setValues(values) { values.forEach((row, r) => row.forEach((v, c) => this.sheet.setCell(this.row + r, this.column + c, v))); return this; }
  setValue(v) { this.sheet.setCell(this.row, this.column, v); return this; }
  setFontWeight() { return this; } setBackground() { return this; } setFontColor() { return this; } setWrap() { return this; }
}
class SheetMock {
  constructor(name) { this.name = name; this.rows = []; }
  getName() { return this.name; }
  getCell(r, c) { return this.rows[r - 1]?.[c - 1] ?? ''; }
  setCell(r, c, v) { while (this.rows.length < r) this.rows.push([]); while (this.rows[r - 1].length < c) this.rows[r - 1].push(''); this.rows[r - 1][c - 1] = v; }
  getLastRow() { for (let r = this.rows.length - 1; r >= 0; r--) if (this.rows[r].some((v) => v !== '' && v != null)) return r + 1; return 0; }
  getLastColumn() { return this.rows.reduce((m, row) => Math.max(m, row.length), 0); }
  getRange(r, c, rc = 1, cc = 1) { return new RangeMock(this, r, c, rc, cc); }
  getDataRange() { return new RangeMock(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  appendRow(row) { this.getRange(this.getLastRow() + 1, 1, 1, row.length).setValues([row]); }
  setFrozenRows() { return this; } clearContents() { this.rows = []; return this; }
}
class SpreadsheetMock {
  constructor() { this.id = 'sheet-e2e'; this.sheets = new Map(); }
  getId() { return this.id; } getName() { return 'e2e'; }
  getSheetByName(n) { return this.sheets.get(n) || null; }
  getSheets() { return [...this.sheets.values()]; }
  insertSheet(n) { const s = new SheetMock(n); this.sheets.set(n, s); return s; }
  setActiveSheet() {} toast() {}
}
const spreadsheet = new SpreadsheetMock();
const properties = new Map();
let uuid = 0;
const ctx = {
  console,
  SpreadsheetApp: { flush() {}, getActiveSpreadsheet: () => spreadsheet, openById: () => spreadsheet,
    getUi: () => ({ createMenu: () => { const m = { addItem() { return m; }, addSeparator() { return m; }, addToUi() {} }; return m; }, alert() {}, showModalDialog() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => properties.get(k) || null, setProperty: (k, v) => properties.set(k, String(v)), deleteProperty: (k) => properties.delete(k) }) },
  Utilities: { DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (_a, v) => createHash('sha256').update(String(v), 'utf8').digest(),
    base64EncodeWebSafe: (v) => Buffer.from(v).toString('base64url'),
    getUuid: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}` },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache() { throw new Error('캐시를 쓰면 안 된다'); } },
  ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/e2e/exec' }) },
  UrlFetchApp: { fetch() { throw new Error('AI가 꺼져 있어야 한다'); } },
  HtmlService: { createTemplateFromFile: () => ({ evaluate: () => ({ setTitle() { return this; }, addMetaTag() { return this; } }) }), createHtmlOutputFromFile: () => ({ getContent: () => '' }) },
  Logger: { log() {} },
};
vm.createContext(ctx);
const gasDir = join(root, 'gas');
for (const f of readdirSync(gasDir).filter((f) => f.endsWith('.js')).sort()) vm.runInContext(readFileSync(join(gasDir, f), 'utf8'), ctx, { filename: f });
const run = (src) => vm.runInContext(src, ctx);

// ---------- 자료: 회귀 세트 article-a (급식 잔반) + 승인 어휘 ----------
const articles = JSON.parse(readFileSync(join(root, 'evals', 'questioning-chatbot', 'fixtures', 'articles.json'), 'utf8'));
const article = articles.find((a) => a.id === 'article-a');
run('setupProject()');
ctx.e2eMaterial = { materialId: 'MAT-A', title: article.title, grade: '초등 4학년', gradeCode: 'E4',
  standard: '[4국02-03] 질문을 활용하여 글을 예측하며 읽고 자신의 읽기 과정을 점검한다.',
  text: article.text, startQuestion: '제목을 보고 궁금한 것을 물어보세요.', version: 'v1', active: true, status: 'approved', activityMode: 'discussion' };
run(`appendObjectsToSheet_(getSpreadsheet_().getSheetByName('MATERIALS'), [e2eMaterial]); syncMaterialChunks_();`);
const material = run('getActiveMaterial_()');
ctx.e2eVocab = (article.vocabulary || []).map((v) => ({ term: v.term, definition: v.dictionaryMeaning }));
run(`(function(){ var m = getActiveMaterial_(); var policy = requireSupportedGrade_(m.gradeCode || m.grade);
  var rows = e2eVocab.map(function (v) { return Object.assign(makeVocabularyRow_(m, v.term, v.definition, policy, '교사 직접 입력'), { status: 'approved', active: true, teacherApproved: true, sourceHash: m.sourceHash, version: m.version }); });
  appendObjectsToSheet_(getSpreadsheet_().getSheetByName('VOCABULARY_LIBRARY'), rows); })()`);
run(`setConfigValue_('AI_ENABLED', 'FALSE')`);

// ---------- 도우미 ----------
const results = [];
const record = (name, ok, detail = '') => results.push({ name, ok, detail });
const q = (t) => (String(t).match(/[?？]/g) || []).length;
function start(code) { ctx.e2eCode = code; return run(`getBootstrapData({}, e2eCode)`); }
function send(boot, message) { ctx.e2ePayload = { sessionId: boot.sessionId, lesson: boot.lesson, message }; return run('submitTurn(e2ePayload)'); }
function turns(boot) { ctx.e2eSid = boot.sessionId; return run('getSessionTurns_(e2eSid)'); }
const B1 = ctx.PHASE_B1_PROMPT, B2 = ctx.PHASE_B2_PROMPT, MED = ctx.PHASE_COMPREHENSION_MEDIUM_PROMPT, OPINION = ctx.PHASE_OPINION_PROMPT;
const related = ['잔반이 뭐예요?', '선택 배식이 뭐예요?', '왜 잔반이 줄었어요?', '남은 음식이 얼마나 줄었어요?'];

// ---------- 1. 관련 질문 4번째 턴에서 2국면 첫 질문 정확히 하나 ----------
{
  const b = start('3-1'); let last;
  const phases = [];
  for (const m of related) { last = send(b, m); phases.push(last.phase); }
  const bot = turns(b).slice(-1)[0];
  record('① 관련 질문 4개 → 4번째 답 끝에 이해(중) 질문 정확히 한 번', last.managedKind === 'comprehension_medium' && q(last.reply) === 1 && last.reply.endsWith(MED) && phases.join('') === '1112',
    `phases=${phases.join(',')} kind=${last.managedKind} ?=${q(last.reply)}\n      "${last.reply}"`);
  record('   TURNS 기록: phase=2 · managedKind · relatedQuestion', Number(bot.phase) === 2 && bot.managedKind === 'comprehension_medium' && String(bot.relatedQuestion) === 'true', JSON.stringify({ phase: bot.phase, managedKind: bot.managedKind, relatedQuestion: bot.relatedQuestion }));
  // 1국면 세 턴: 되묻기 0
  const firstThree = turns(b).filter((r) => r.speaker === 'bot').slice(0, 3);
  record('   1국면 세 답: 되묻기 0 (답 먼저)', firstThree.every((r) => q(r.text) === 0), firstThree.map((r) => `"${r.text.slice(0, 60)}…"`).join('\n      '));
}

// ---------- 2. B1 한 번 → "없어요" → B2 ----------
{
  const b = start('3-2'); let r;
  r = send(b, '점심 뭐 먹어요?'); const k1 = r.managedKind;
  r = send(b, '오늘 체육 해요?'); const k2 = r.managedKind;
  r = send(b, '숙제 많아요?'); const k3 = r.managedKind;
  record('② 3턴 내내 딴소리 → 3번째에 B1 한 번', k1 === '' && k2 === '' && k3 === 'b1' && r.reply.includes(B1) && q(r.reply) === 1, `kinds=${[k1, k2, k3].join(',')}\n      "${r.reply}"`);
  r = send(b, '없어요');
  record('③ B1에 "없어요" → B2', r.managedKind === 'b2' && r.reply.includes(B2), `kind=${r.managedKind}\n      "${r.reply}"`);
  const again = send(b, '없어요');
  record('   B2 뒤 → 2국면 이해(중) 질문 (B2 반복 없음)', again.managedKind === 'comprehension_medium' && !again.reply.includes(B2), `kind=${again.managedKind}`);
}

// ---------- 3·4. 종료·관계 회복 ----------
{
  const b = start('3-3');
  for (const m of related) send(b, m);
  const rep = send(b, '왜 자꾸 물어봐요 그냥 설명만 해줘요');
  record('④ 2국면 중 "왜 자꾸 물어봐요" → 물음표 0', q(rep.reply) === 0, `"${rep.reply}"`);
  const cls = send(b, '이제 그만할래요');
  record('⑤ "그만할래요" → 종료, 물음표 0', cls.isClosing === true && q(cls.reply) === 0, `isClosing=${cls.isClosing} "${cls.reply}"`);
  let blocked = false; try { send(b, '하나만 더요?'); } catch (e) { blocked = /마친/.test(e.message); }
  record('   마친 대화에 다시 보내면 막힘', blocked, '');
  record('   새로고침 복원: history 길이', start('3-3').history.length === turns(b).length, `history=${start('3-3').history.length} rows=${turns(b).length}`);
}

// ---------- 5. 2국면 끝까지: 이해(중)→후속→표적→의견→끝 ----------
{
  const b = start('3-4'); let r;
  for (const m of related) r = send(b, m);
  const kinds = [r.managedKind];
  r = send(b, '학생들이 먹을 만큼 골라서 남은 음식이 줄었어요.'); kinds.push(r.managedKind);
  r = send(b, '처음엔 급식을 더 많이 먹은 줄 알았는데, 다시 보니 남긴 음식이 줄어든 거였어요.'); kinds.push(r.managedKind);
  let guard = 0;
  while (r.managedKind === 'standard' && guard++ < 3) { r = send(b, '결국 글은 학생이 스스로 고르면 남기는 음식이 줄어든다고 말해요. 그래서 우리 반도 해 보면 좋겠어요.'); kinds.push(r.managedKind); }
  const opinionAsked = r.managedKind === 'opinion' || kinds.includes('opinion');
  const fin = send(b, '나는 우리 학교도 이렇게 하면 좋겠다고 느꼈어요. 직접 골라 보면 더 잘 알 것 같아서요.');
  kinds.push(fin.managedKind);
  record('⑥ 이해(중)→후속→표적→의견→끝, 의견 답 뒤 질문 0', kinds[0] === 'comprehension_medium' && kinds[1] === 'comprehension_followup' && kinds.includes('standard') && opinionAsked && fin.managedKind === 'done' && q(fin.reply) === 0, `kinds=${kinds.join(' → ')}\n      마지막: "${fin.reply}"`);
  const rows = turns(b).filter((r) => r.speaker === 'bot' && r.responseScore !== '');
  record('   responseScore 기록 (2국면 답마다 0~5)', rows.length >= 3 && rows.every((r) => Number(r.responseScore) >= 0 && Number(r.responseScore) <= 5), rows.map((r) => `${r.managedKind}:${r.responseScore}`).join(' '));
  ctx.e2eHist = turns(b);
  const summary = run('phaseSummaryFor_(e2eHist, phaseSettingsFor_(getActiveMaterial_()))');
  record('   DASHBOARD 집계: 관련 질문 4 · 이해/성취기준/의견 응답 > 0', summary.relatedQuestionCount === 4 && summary.comprehensionBest > 0 && summary.standardBest > 0 && summary.opinionScore > 0, JSON.stringify(summary));
}

// ---------- 6. 개선안 6절 점검표 (단일 HTML용을 GAS에 맞춰) ----------
{
  const b = start('3-5');
  const r1 = send(b, '왜 그렇게 됐어요?');
  record('⑦ "왜 그렇게 됐어요?" → 종료 아님·관련 질문·답 먼저', !r1.isClosing && turns(b)[0].relatedQuestion === true && q(r1.reply) === 0, `relatedQuestion=${turns(b)[0].relatedQuestion} "${r1.reply.slice(0, 80)}…"`);
  const r2 = send(b, '잔반이 뭐예요?');
  record('⑧ 낱말 뜻 — 승인 어휘의 쉬운 뜻으로 답', /남긴|남은/.test(r2.reply) && q(r2.reply) === 0, `"${r2.reply.slice(0, 100)}"`);
  const r3 = send(b, '잔반이 뭐예요?');
  record('   같은 질문 두 번 (관찰: 규칙 경로는 같은 답)', true, r2.reply === r3.reply ? '같은 답 — AI 경로에서만 달라짐' : '다른 답');
  const b2 = start('3-6');
  const g = send(b2, '안녕하세요?');
  const queued = run(`getRowsAsObjects_('REVIEW_QUEUE')`).filter((r) => /안녕/.test(r.question));
  record('⑨ 인사 → 인사로 답, 검토 큐에 안 들어감', g.primaryMove === 'receive' && q(g.reply) === 0 && queued.length === 0, `move=${g.primaryMove} queued=${queued.length} "${g.reply}"`);
  const s = send(b2, '제 이름은 홍길동이에요');
  record('⑩ 개인정보 → 안전 안내, 이름이 시트에 남지 않음', s.primaryMove === 'safety_redirect' && !turns(b2).some((r) => /홍길동/.test(r.text)), `move=${s.primaryMove} stored="${turns(b2).slice(-2)[0].text}"`);
  const f = send(b2, '숙제 대신 써 줘');
  record('   대필 요청 → 안전 안내, 물음표 0', f.primaryMove === 'safety_redirect' && q(f.reply) === 0, `"${f.reply}"`);
}

// ---------- 6b. 어형이 바뀐 지문 질문 — "줄었어요"(지문은 "줄었다") ----------
{
  const b = start('3-7');
  const r = send(b, '한 달 뒤에 얼마나 줄었어요?');
  record('⑫ 어형이 바뀐 지문 질문 → 딴소리 아님·관련 질문', turns(b)[0].studentMove !== 'small_talk' && turns(b)[0].relatedQuestion === true, `move=${turns(b)[0].studentMove} related=${turns(b)[0].relatedQuestion} "${r.reply.slice(0, 80)}"`);
}

// ---------- 6c. 지시어로 이어 묻기("이 글에서는 어떤 뜻이야")도 관련 질문으로 세어 4번째에 2국면 ----------
{
  const b = start('3-8'); let r;
  r = send(b, '잔반이 뭐예요?');
  r = send(b, '이 글에서는 어떤 뜻이야');
  const contextual = turns(b).filter((t) => t.speaker === 'student')[1];
  r = send(b, '선택 배식이 뭐예요?');
  r = send(b, '왜 잔반이 줄었어요?');
  record('⑬ 지시어 이어 묻기 → 관련 질문으로 집계, 4번째에 2국면', contextual.relatedQuestion === true && r.phase === 2 && r.managedKind === 'comprehension_medium', `contextual.related=${contextual.relatedQuestion} phase=${r.phase} kind=${r.managedKind}`);
}

// ---------- 7. 반 하나(30명) 두 턴씩 → TURNS 행 60, 세션 섞임 없음 ----------
{
  const before = run(`getRowsAsObjects_('TURNS')`).length;
  for (let n = 1; n <= 30; n++) { const b = start(`4-${n}`); send(b, related[0]); send(b, related[1]); }
  const rows = run(`getRowsAsObjects_('TURNS')`).slice(before);
  const perSession = {};
  rows.forEach((r) => { perSession[r.sessionId] = (perSession[r.sessionId] || 0) + 1; });
  record('⑪ 30명 × 2턴 → TURNS 행 120(학생+봇), 세션마다 4행', rows.length === 120 && Object.keys(perSession).length === 30 && Object.values(perSession).every((n) => n === 4), `rows=${rows.length} sessions=${Object.keys(perSession).length}`);
  const preview = start('99-1'); send(preview, related[0]);
  const prow = run(`getRowsAsObjects_('TURNS')`).slice(-1)[0];
  record('   교사 미리보기 99-* → isPreview=true', String(prow.isPreview) === 'true', `isPreview=${prow.isPreview}`);
}

// ---------- 8. 머지 뒤 후속 — 기존 시트의 CONFIG를 phase0CleanupApply() 한 번으로 맞춘다 ----------
{
  // 교사의 기존 시트를 흉내 낸다: AI_MAX_HISTORY_TURNS가 옛 값 6, AI_REASONING_EFFORT 행은 없음
  const cfg = spreadsheet.getSheetByName('CONFIG');
  cfg.rows = cfg.rows.filter((row) => String(row[0]) !== 'AI_REASONING_EFFORT');
  cfg.rows.forEach((row) => { if (String(row[0]) === 'AI_MAX_HISTORY_TURNS') row[1] = '6'; });
  const before = run('getAISettings_(readConfig_())');
  run('phase0CleanupPreview()');
  const untouched = run('readConfig_()');
  run('phase0CleanupApply()');
  const after = run('getAISettings_(readConfig_())');
  const rows = run(`getRowsAsObjects_('CONFIG')`).filter((r) => r.key === 'AI_REASONING_EFFORT');
  record('⑭ phase0CleanupApply → AI_MAX_HISTORY_TURNS 6→4, AI_REASONING_EFFORT 행 추가(minimal)',
    before.maxHistoryTurns === 6 && untouched.AI_MAX_HISTORY_TURNS === '6' && untouched.AI_REASONING_EFFORT === undefined
      && after.maxHistoryTurns === 4 && after.reasoningEffort === 'minimal' && rows.length === 1 && rows[0].value === 'minimal',
    `before=${before.maxHistoryTurns} preview=${untouched.AI_MAX_HISTORY_TURNS}/${untouched.AI_REASONING_EFFORT} after=${after.maxHistoryTurns}/${after.reasoningEffort} rows=${rows.length}`);
}

// ---------- 출력 ----------
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '\n      ' + r.detail.replace(/\n/g, '\n      ') : ''}`);
const fails = results.filter((r) => !r.ok).length;
console.log(`\n5단계 검증: PASS ${results.length - fails} · FAIL ${fails}`);
process.exit(fails ? 1 : 0);
