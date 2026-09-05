#!/usr/bin/env node
/**
 * gas/*.gs 를 Node에서 읽어 돌리는 회귀 점검.
 * Apps Script 전역(SpreadsheetApp 등)은 가짜로 댄다. GAS는 V8이라 문법이 같다.
 *
 *   node evals/gas/run.mjs           # 전부
 *   node evals/gas/run.mjs --only=phase
 *
 * 결과: PASS / FAIL / SKIP(아직 없는 함수). FAIL이 하나라도 있으면 종료 코드 1.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const gasDir = join(here, '..', '..', 'gas');
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);

// ---------- Apps Script 가짜 전역 ----------
const props = new Map();
const sheets = new Map();
function fakeSheet(name) {
  if (!sheets.has(name)) {
    const rows = [];
    sheets.set(name, {
      getName: () => name,
      appendRow: (r) => rows.push(r),
      getDataRange: () => ({ getValues: () => rows.map((r) => [...r]) }),
      getRange: () => ({ setValues: () => {}, getValues: () => [[]] , setValue: () => {} }),
      getLastRow: () => rows.length,
      getLastColumn: () => (rows[0] || []).length,
      clear: () => { rows.length = 0; },
      _rows: rows,
    });
  }
  return sheets.get(name);
}
const context = {
  console,
  SpreadsheetApp: {
    getActiveSpreadsheet: () => spreadsheet,
    openById: () => spreadsheet,
    getUi: () => ({ alert() {}, showModalDialog() {}, createMenu: () => ({ addItem() { return this; }, addSeparator() { return this; }, addToUi() {} }) }),
    flush() {},
  },
  PropertiesService: {
    getScriptProperties: () => ({ getProperty: (k) => props.get(k) ?? null, setProperty: (k, v) => props.set(k, String(v)), deleteProperty: (k) => props.delete(k) }),
  },
  Utilities: { getUuid: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, () => Math.floor(Math.random() * 16).toString(16)), sleep() {}, base64Encode: (s) => Buffer.from(s).toString('base64'), computeDigest: () => [] , DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' } },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {}, tryLock: () => true }) },
  UrlFetchApp: { fetch: () => ({ getResponseCode: () => 503, getContentText: () => '{}' }) },
  HtmlService: { createTemplateFromFile: () => ({ evaluate: () => ({ setTitle() { return this; }, addMetaTag() { return this; }, setWidth() { return this; }, setHeight() { return this; } }) }), createHtmlOutputFromFile: () => ({ getContent: () => '' }), createHtmlOutput: () => ({ setWidth() { return this; }, setHeight() { return this; } }) },
  ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TEST/exec' }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  Logger: { log: () => {} },
  Session: { getScriptTimeZone: () => 'Asia/Seoul' },
};
const spreadsheet = {
  getId: () => 'TEST-SHEET',
  getSheetByName: (n) => fakeSheet(n),
  insertSheet: (n) => fakeSheet(n),
  getSheets: () => [...sheets.values()],
  setActiveSheet() {},
  toast() {},
};
vm.createContext(context);

// ---------- .gs 읽기 ----------
const files = readdirSync(gasDir).filter((f) => f.endsWith('.gs') || f.endsWith('.js')).sort();
const results = [];
function record(name, status, detail = '') { results.push({ name, status, detail }); }

for (const f of files) {
  try {
    vm.runInContext(readFileSync(join(gasDir, f), 'utf8'), context, { filename: f });
    record(`load ${f}`, 'PASS');
  } catch (e) {
    record(`load ${f}`, 'FAIL', String(e.message));
  }
}
const has = (fn) => typeof context[fn] === 'function';

// ---------- 2국면 점검 ----------
const fixtures = JSON.parse(readFileSync(join(here, 'fixtures', 'phase-cases.json'), 'utf8'));
const settings = fixtures.settings;

function runPhaseCases() {
  if (!has('decidePhase')) { record('phase: decidePhase', 'SKIP', 'Phase.gs 아직 없음'); return; }
  for (const c of fixtures.cases) {
    const history = [];
    let decision = null;
    let ok = true; let why = '';
    for (const step of c.turns) {
      decision = context.decidePhase(history, step.student, settings);
      history.push({ speaker: 'student', text: step.student });
      const botText = has('enforceManagedQuestion')
        ? context.enforceManagedQuestion(step.botDraft || '네, 그렇게 나와 있어요.', decision)
        : (decision.managedQuestion || '');
      history.push({ speaker: 'bot', text: botText, managedKind: decision.kind || '' });
    }
    const last = history[history.length - 1].text;
    for (const [k, v] of Object.entries(c.expect)) {
      if (k === 'phase' && decision.phase !== v) { ok = false; why += ` phase=${decision.phase}≠${v}`; }
      if (k === 'kind' && (decision.kind || '') !== v) { ok = false; why += ` kind=${decision.kind}≠${v}`; }
      if (k === 'questionMarks' && (last.match(/[?？]/g) || []).length !== v) { ok = false; why += ` ?=${(last.match(/[?？]/g) || []).length}≠${v}`; }
      if (k === 'contains' && !last.includes(v)) { ok = false; why += ` "${v}" 없음`; }
      if (k === 'allowQuestion' && decision.allowQuestion !== v) { ok = false; why += ` allowQuestion=${decision.allowQuestion}`; }
    }
    record(`phase: ${c.name}`, ok ? 'PASS' : 'FAIL', why.trim());
  }
}

function runEnforceCases() {
  if (!has('enforceManagedQuestion')) { record('enforce: enforceManagedQuestion', 'SKIP', 'Phase.gs 아직 없음'); return; }
  const q = '글에서 가장 중요한 사실 한 가지를 찾아 자기 말로 말해 줄래요?';
  const cases = [
    ['모델이 물음표 셋 → 상태기 질문 하나', '조청을 섞었어요. 왜 그럴까요? 더 볼까요? 어때요?', { allowQuestion: true, managedQuestion: q, feedback: '' }, (t) => (t.match(/[?？]/g) || []).length === 1 && t.endsWith(q)],
    ['질문 없이 → 물음표 0', '알겠어요. 더 물어볼까요?', { allowQuestion: false, managedQuestion: '' }, (t) => !/[?？]/.test(t)],
    ['1국면 → 모델 질문 하나까지만', '조청이에요. 또 궁금한 게 있나요? 다른 건요?', { allowQuestion: true, managedQuestion: '' }, (t) => (t.match(/[?？]/g) || []).length <= 1],
  ];
  for (const [name, text, decision, check] of cases) {
    let out; try { out = context.enforceManagedQuestion(text, decision); } catch (e) { record(`enforce: ${name}`, 'FAIL', e.message); continue; }
    record(`enforce: ${name}`, check(out) ? 'PASS' : 'FAIL', check(out) ? '' : JSON.stringify(out));
  }
}

function runSignalCases() {
  if (!has('isPassageRelatedQuestion')) { record('signals: isPassageRelatedQuestion', 'SKIP', 'Signals.gs 아직 없음'); return; }
  for (const c of fixtures.related) {
    const got = context.isPassageRelatedQuestion(c.text, settings);
    record(`signals: 관련 질문 "${c.text}"`, got === c.related ? 'PASS' : 'FAIL', got === c.related ? '' : `got ${got}`);
  }
}

if (!only || only === 'phase') runPhaseCases();
if (!only || only === 'enforce') runEnforceCases();
if (!only || only === 'signals') runSignalCases();

// ---------- 출력 ----------
const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
for (const r of results) console.log(`${pad(r.status, 5)} ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
const counts = results.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
console.log(`\nPASS ${counts.PASS || 0} · FAIL ${counts.FAIL || 0} · SKIP ${counts.SKIP || 0}`);
process.exit(counts.FAIL ? 1 : 0);
