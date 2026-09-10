/**
 * gas/*.js 를 Node에서 돌리기 위한 가짜 Apps Script 전역.
 * evals/gas/e2e.mjs 와 같은 모양이되, AI 응답을 넣어 둘 수 있게 UrlFetchApp을 큐로 만들었다.
 * 쓰는 곳: scripts/check-new-material.mjs · scripts/suggest-theme-words.mjs
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

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
  constructor(id) { this.id = id; this.sheets = new Map(); }
  getId() { return this.id; } getName() { return this.id; }
  getSheetByName(n) { return this.sheets.get(n) || null; }
  getSheets() { return [...this.sheets.values()]; }
  insertSheet(n) { const s = new SheetMock(n); this.sheets.set(n, s); return s; }
  setActiveSheet() {} toast() {}
}

/** gas/ 를 읽어 넣은 실행 문맥을 만든다. run('소스')로 GAS 함수를 부른다. */
export function createGasContext(gasDir, { id = 'fake-sheet' } = {}) {
  const spreadsheet = new SpreadsheetMock(id);
  const properties = new Map();
  const aiResponses = [];   // 넣어 둔 만큼만 모델이 답한다. 비어 있는데 부르면 실패다.
  const aiRequests = [];
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
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock() { return true; }, releaseLock() {} }) },
    CacheService: { getScriptCache() { throw new Error('캐시를 쓰면 안 된다'); } },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/fake/exec' }) },
    UrlFetchApp: { fetch: (_url, options) => {
      aiRequests.push(JSON.parse(options.payload));
      const next = aiResponses.shift();
      if (!next) throw new Error('AI를 부르면 안 되는 자리에서 불렀다');
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify(next) };
    } },
    HtmlService: { createTemplateFromFile: () => ({ evaluate: () => ({ setTitle() { return this; }, addMetaTag() { return this; } }) }), createHtmlOutputFromFile: () => ({ getContent: () => '' }) },
    Logger: { log() {} },
  };
  vm.createContext(ctx);
  for (const f of readdirSync(gasDir).filter((f) => f.endsWith('.js')).sort()) {
    vm.runInContext(readFileSync(join(gasDir, f), 'utf8'), ctx, { filename: f });
  }
  const run = (src) => vm.runInContext(src, ctx);
  return { ctx, run, spreadsheet, properties, aiResponses, aiRequests };
}

/** 자료·낱말을 넣고 활성 자료를 돌려준다. 교사 화면 "3. 교사 자료 입력"과 같은 자리. */
export function installMaterial({ ctx, run }, material, vocabulary = []) {
  run('setupProject()');
  ctx.fakeMaterial = material;
  run(`appendObjectsToSheet_(getSpreadsheet_().getSheetByName('MATERIALS'), [fakeMaterial]); syncMaterialChunks_();`);
  ctx.fakeVocab = vocabulary;
  run(`(function(){ var m = getActiveMaterial_(); var policy = requireSupportedGrade_(m.gradeCode || m.grade);
    var rows = fakeVocab.map(function (v) { return Object.assign(makeVocabularyRow_(m, v.term, v.definition, policy, '교사 직접 입력'),
      { wordGroup: v.group || '', status: 'approved', active: true, teacherApproved: true, sourceHash: m.sourceHash, version: m.version }); });
    appendObjectsToSheet_(getSpreadsheet_().getSheetByName('VOCABULARY_LIBRARY'), rows); })()`);
  return run('getActiveMaterial_()');
}
