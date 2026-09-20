/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createHmac} = require('node:crypto');

class RangeMock {
  constructor(sheet, row, column, rowCount = 1, columnCount = 1) {
    Object.assign(this, {sheet, row, column, rowCount, columnCount});
  }
  getValues() {
    return Array.from({length:this.rowCount}, (_, r) =>
      Array.from({length:this.columnCount}, (_, c) => this.sheet.getCell(this.row + r, this.column + c)));
  }
  getDisplayValues() {
    return this.getValues().map((row) => row.map((value) => value == null ? '' : String(value)));
  }
  setValues(values) {
    values.forEach((row, r) => row.forEach((value, c) => this.sheet.setCell(this.row + r, this.column + c, value)));
    return this;
  }
}

class SheetMock {
  constructor(name) { this.name = name; this.rows = []; }
  getCell(row, column) { return this.rows[row - 1]?.[column - 1] ?? ''; }
  setCell(row, column, value) {
    while (this.rows.length < row) this.rows.push([]);
    while (this.rows[row - 1].length < column) this.rows[row - 1].push('');
    this.rows[row - 1][column - 1] = value;
  }
  getLastRow() {
    for (let index = this.rows.length - 1; index >= 0; index -= 1) {
      if (this.rows[index].some((value) => value !== '' && value != null)) return index + 1;
    }
    return 0;
  }
  getLastColumn() { return this.rows.reduce((max, row) => Math.max(max, row.length), 0); }
  getRange(row, column, rowCount = 1, columnCount = 1) {
    return new RangeMock(this, row, column, rowCount, columnCount);
  }
  getDataRange() {
    return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn()));
  }
  setFrozenRows() { return this; }
}

class SpreadsheetMock {
  constructor() { this.sheets = new Map(); }
  getSheetByName(name) { return this.sheets.get(name) || null; }
  insertSheet(name) {
    const sheet = new SheetMock(name);
    this.sheets.set(name, sheet);
    return sheet;
  }
}

const properties = new Map([['LITE_SESSION_SECRET', 'local-questioning-test-secret']]);
const context = vm.createContext({
  console,
  SpreadsheetApp:{flush() {}},
  LockService:{getScriptLock:() => ({tryLock:() => true, waitLock() {}, releaseLock() {}})},
  PropertiesService:{getScriptProperties:() => ({
    getProperty:(key) => properties.get(key) || null,
    setProperty:(key, value) => properties.set(key, String(value))
  })},
  Utilities:{
    Charset:{UTF_8:'utf8'},
    getUuid:() => '00000000-0000-4000-8000-000000000001',
    computeHmacSha256Signature:(value, secret) => createHmac('sha256', secret).update(value).digest(),
    base64EncodeWebSafe:(value) => Buffer.from(value).toString('base64url')
  }
});
const root = path.resolve(__dirname, '..');
for (const name of ['SetupService.js', 'ConversationService.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'gas-lite', name), 'utf8'), context, {filename:name});
}
const headers = vm.runInContext('LITE_SHEET_HEADERS_', context);
assert.equal(context.isLiteQuestioningRequest_('나는 왜 그랬는지 모르겠어요.'), false,
  'a declarative thought with 왜 is not a new student question');
assert.equal(context.isLiteQuestioningRequest_('나는 왜 그랬는지 몰랐어.'), false);
assert.equal(context.isLiteQuestioningRequest_('맹수 뜻 알려줘'), true);
assert.equal(context.isLiteQuestioningRequest_('글에 나온 사람은 누구인가요'), true);
const spreadsheet = new SpreadsheetMock();
for (const name of ['질문과 답변', '학생별 현황']) {
  context.ensureLiteSheet_(spreadsheet, name, headers[name]);
}
// Older teacher copies acquire the new columns and sheet without losing their existing data.
const summarySheet = spreadsheet.getSheetByName('학생별 현황');
summarySheet.setCell(1, summarySheet.getLastColumn() + 1, 'teacherCustomNote');
const sessionId = 'session-questioning-1';
const lessonId = 'lesson-questioning-1';
const sourceHash = 'abcdefgh1234567890abcdef';
const recovered = context.prepareLiteRecoveryTurn_({
  lessonId, lessonRevision:1, sourceHash, studentCode:'01-001',
  deviceToken:'questioning-device-012345', requestId:'questioning-retry-00001',
  message:'왜 보호해야 할까요?'
}, {lessonId, lessonRevision:1, sourceHash, activityMode:'questioning'});
assert.equal(recovered.activityMode, 'questioning', 'recovery must not coerce questioning to evaluation');
let requestIndex = 0;
function turn(message, extra = {}) {
  requestIndex += 1;
  return {
    requestId:`questioning_test_${String(requestIndex).padStart(3, '0')}`,
    studentCode:'01-001', sessionId, lessonId, lessonRevision:1, sourceHash,
    activityMode:'questioning', message, startQuestion:'', isPreview:false,
    ...extra
  };
}
function result(category, extra = {}) {
  return {
    text:'수업 자료에서 다시 살펴볼까요?', questionType:category, questionCategory:category,
    sourceStatus:'supported', sourceCue:'동물은 저마다 다른 환경에서 산다.',
    engineStatus:'ok:test', isClosing:false, ...extra
  };
}
function append(studentTurn, botResult) {
  return context.appendLiteTurnPair_(studentTurn, botResult, {spreadsheet, workbookReady:true});
}
function rows(name) { return context.liteRowsAsObjects_(spreadsheet.getSheetByName(name)); }
function plain(value) { return JSON.parse(JSON.stringify(value)); }

assert.equal(context.normalizeLiteMode_('questioning'), 'questioning');
assert.equal(context.sanitizeLiteSettingsForStudent_({activityMode:'questioning'}).activityMode, 'questioning');
assert.equal(context.sanitizeLiteSettingsForStudent_({}).activityMode, 'evaluation',
  'an old teacher copy without the mode column keeps its previous default');
assert.equal(context.liteAssessmentStartQuestion_({activityMode:'questioning'}),
  '자료를 읽고 궁금한 점을 한 가지씩 질문해 주세요.');
assert.equal(context.sanitizeLiteSettingsForStudent_({activityMode:'questioning'}).startQuestion,
  '자료를 읽고 궁금한 점을 한 가지씩 질문해 주세요.');
assert.deepEqual(plain(context.sanitizeLiteSettingsForStudent_({
  activityMode:'questioning', requiredAssessment:{items:[{id:'old',question:'이전 평가 질문'}]}
}).requiredQuestions), [], 'saved evaluation questions stay inactive in questioning lessons');
assert.match(context.liteQuestionClaritySignal_('왜 그런가요?', 'repair'), /질문 다듬기/);

const fact = turn('바람이는 몇 살인가요?');
let saved = append(fact, result('fact'));
assert.equal(saved.duplicate, false);
assert.equal(saved.questionCategory, 'fact');
assert.deepEqual(plain(saved.questionCounts), {fact:1, inquiry:0, application:0, reflection:0, unclassified:0});
assert.equal(saved.questionClassificationStatus, 'classified');
assert.deepEqual(rows('학생별 현황').length, 1);
assert.equal(rows('학생 질문 분석').length, 1);
assert.equal(rows('학생 질문 분석')[0].studentQuestion, '바람이는 몇 살인가요?');
assert.match(rows('학생 질문 분석')[0].automaticDraftNotice, /자동 분류 초안/);
assert.match(rows('학생 질문 분석')[0].claritySignal, /교사 확인/);
assert.match(rows('학생 질문 분석')[0].materialConnectionSignal, /교사 확인/);
assert.equal(rows('학생 질문 분석')[0].teacherQualityReview, '');
assert.equal(rows('학생 질문 분석')[0].teacherClarity, '');
assert.equal(rows('학생 질문 분석')[0].teacherMaterialConnection, '');
assert.equal(rows('학생 질문 분석')[0].teacherExplorationValue, '');

summarySheet.setCell(2, summarySheet.getLastColumn(), '교사 메모 보존');
const reviewSheet = spreadsheet.getSheetByName('학생 질문 분석');
const reviewHeaders = reviewSheet.rows[0];
reviewSheet.setCell(2, reviewHeaders.indexOf('teacherQuestionCategory') + 1, 'inquiry');
reviewSheet.setCell(2, reviewHeaders.indexOf('teacherClarity') + 1, 0);
reviewSheet.setCell(2, reviewHeaders.indexOf('teacherMaterialConnection') + 1, '근거 있음');
reviewSheet.setCell(2, reviewHeaders.indexOf('teacherExplorationValue') + 1, '높음');
reviewSheet.setCell(2, reviewHeaders.indexOf('teacherQualityReview') + 1, '교사 확인 완료');
reviewSheet.setCell(2, reviewHeaders.indexOf('teacherMemo') + 1, '좋은 질문');
saved = append(fact, result('fact'));
assert.equal(saved.duplicate, true);
assert.deepEqual(plain(saved.questionCounts), {fact:1, inquiry:0, application:0, reflection:0, unclassified:0});
assert.equal(rows('질문과 답변').length, 2, 'retry never appends another pair');
assert.equal(rows('학생 질문 분석').length, 1, 'retry never appends another review');
assert.equal(rows('학생 질문 분석')[0].teacherQuestionCategory, 'inquiry');
assert.equal(rows('학생 질문 분석')[0].teacherClarity, 0, 'a teacher-entered zero is not erased');
assert.equal(rows('학생 질문 분석')[0].teacherMaterialConnection, '근거 있음');
assert.equal(rows('학생 질문 분석')[0].teacherExplorationValue, '높음');
assert.equal(rows('학생 질문 분석')[0].teacherQualityReview, '교사 확인 완료');
assert.equal(rows('학생 질문 분석')[0].teacherMemo, '좋은 질문');

const inquiry = turn('왜 야생 동물을 보호해야 할까요?');
append(inquiry, result('inquiry', {questionType:'inference', sourceStatus:'reasonable_inference'}));
const application = turn('우리 동네에서는 어떻게 적용할 수 있나요?');
append(application, result('application'));
const reflection = turn('내 생각이 왜 바뀌었을까요?');
saved = append(reflection, result('reflection'));
assert.deepEqual(plain(saved.questionCounts), {fact:1, inquiry:1, application:1, reflection:1, unclassified:0});
assert.equal(rows('학생별 현황')[0].factQuestionCount, 1);
assert.equal(rows('학생별 현황')[0].inquiryQuestionCount, 1);
assert.equal(rows('학생별 현황')[0].applicationQuestionCount, 1);
assert.equal(rows('학생별 현황')[0].reflectionQuestionCount, 1);
assert.equal(rows('학생별 현황')[0].unclassifiedQuestionCount, 0);
assert.equal(rows('학생별 현황')[0].questionCount, 4, 'questioning total matches four counted categories');
assert.equal(rows('학생별 현황')[0].teacherCustomNote, '교사 메모 보존');
assert.equal(rows('학생 질문 분석').length, 4);

const outOfScope = turn('오늘 점심은 무엇인가요?');
saved = append(outOfScope, result('fact', {questionType:'off_topic', sourceStatus:'out_of_scope', sourceCue:''}));
assert.equal(saved.questionCategory, '');
assert.equal(saved.questionClassificationStatus, 'unclassified');
assert.equal(saved.questionCounts.unclassified, 1);
assert.equal(rows('학생 질문 분석')[4].classificationStatus, '분류 보류');
assert.equal(rows('학생 질문 분석')[4].teacherQuestionCategory, '');
assert.match(rows('학생 질문 분석')[4].materialConnectionSignal, /범위 밖/);
const unclear = turn('이것은 왜 그럴까요?');
saved = append(unclear, result('', {questionType:'inference', sourceStatus:'source_insufficient'}));
assert.equal(saved.questionClassificationStatus, 'unclassified');
assert.equal(saved.questionCounts.unclassified, 2);
assert.equal(context.liteQuestionClassificationStatusForRequest_(rows('질문과 답변'), unclear.requestId), 'unclassified');
const history = context.getLiteSessionHistory_(sessionId, spreadsheet, rows('질문과 답변'));
assert.equal(history.find((row) => row.requestId === unclear.requestId && row.speaker === 'bot').questionClassificationStatus,
  'unclassified');
const statement = turn('내 생각이 바뀌었어요.');
append(statement, result('reflection'));
assert.equal(context.liteQuestionClassificationStatusForRequest_(rows('질문과 답변'), statement.requestId), '',
  'a non-question has no pending-classification status');
append(turn('내 전화번호를 알려 줄까요?'), result('', {questionType:'safety', safetyFlag:true}));
append(turn('왜 답이 없나요?'), result('fact', {engineStatus:'engine_failed:temporary'}));
append(turn('이름이 무엇인가요?', {studentCode:'99-999', sessionId:'preview-session', isPreview:true}), result('fact'));
assert.deepEqual(plain(context.liteQuestionCountsForSession_(rows('질문과 답변'))), {
  fact:1, inquiry:1, application:1, reflection:1, unclassified:2
});
assert.equal(rows('학생별 현황')[0].unclassifiedQuestionCount, 2);
assert.equal(rows('학생별 현황')[0].questionCount, 6, 'four classified and two pending questions');
assert.equal(rows('학생 질문 분석').length, 6, 'safe unclassified questions are retained');
assert.equal(append(unclear, result('fact')).duplicate, true, 'retry uses stored empty classification');
assert.equal(rows('학생 질문 분석').length, 6, 'retry keeps one review row per requestId');
assert.equal(rows('학생 질문 분석')[5].classificationStatus, '분류 보류');
assert.equal(rows('학생 질문 분석')[5].teacherQuestionCategory, '');
assert.equal(rows('학생별 현황')[0].teacherCustomNote, '교사 메모 보존');

const legacy = new SpreadsheetMock();
const legacySummary = legacy.insertSheet('학생별 현황');
const oldSummaryHeaders = headers['학생별 현황'].filter((header) =>
  !/^(fact|inquiry|application|reflection|unclassified)QuestionCount$/.test(header));
legacySummary.getRange(1, 1, 1, oldSummaryHeaders.length + 1)
  .setValues([[...oldSummaryHeaders, 'teacherCustomNote']]);
const legacySession = 'legacy-questioning-session';
const oldRow = Object.fromEntries(oldSummaryHeaders.map((header) => [header, '']));
Object.assign(oldRow, {studentCode:'01-002', lessonId, lessonRevision:1, sessionId:legacySession, questionCount:0});
legacySummary.getRange(2, 1, 1, oldSummaryHeaders.length + 1)
  .setValues([[...oldSummaryHeaders.map((header) => oldRow[header]), '기존 교사 기록']]);
const legacyQa = legacy.insertSheet('질문과 답변');
const oldQaHeaders = headers['질문과 답변'].filter((header) => header !== 'questionCategory');
legacyQa.getRange(1, 1, 1, oldQaHeaders.length).setValues([oldQaHeaders]);
const legacyTurn = turn('자료에서 바람이가 왜 힘들었을까요?', {
  studentCode:'01-002', sessionId:legacySession
});
context.appendLiteTurnPair_(legacyTurn, result('inquiry'), {spreadsheet:legacy, workbookReady:true});
const migratedSummary = context.liteRowsAsObjects_(legacySummary)[0];
assert.equal(migratedSummary.teacherCustomNote, '기존 교사 기록');
assert.equal(migratedSummary.inquiryQuestionCount, 1);
assert.equal(migratedSummary.questionCount, 1);
assert.equal(context.liteRowsAsObjects_(legacyQa)[1].questionCategory, 'inquiry');
assert.equal(context.liteRowsAsObjects_(legacy.getSheetByName('학생 질문 분석')).length, 1);
console.log('questioning Sheet counts, review rows, retries, exclusions and teacher edits: pass');
