const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHmac } = require('node:crypto');

class RangeMock {
  constructor(sheet, row, column, rowCount = 1, columnCount = 1) {
    Object.assign(this, { sheet, row, column, rowCount, columnCount });
  }
  getValues() {
    return Array.from({ length:this.rowCount }, (_, rowOffset) =>
      Array.from({ length:this.columnCount }, (_, columnOffset) =>
        this.sheet.getCell(this.row + rowOffset, this.column + columnOffset)
      )
    );
  }
  getDisplayValues() {
    return this.getValues().map((row) => row.map((value) => value == null ? '' : String(value)));
  }
  setValues(values) {
    values.forEach((row, rowOffset) => row.forEach((value, columnOffset) =>
      this.sheet.setCell(this.row + rowOffset, this.column + columnOffset, value)
    ));
    return this;
  }
  clearContent() {
    for (let rowOffset = 0; rowOffset < this.rowCount; rowOffset += 1) {
      for (let columnOffset = 0; columnOffset < this.columnCount; columnOffset += 1) {
        this.sheet.setCell(this.row + rowOffset, this.column + columnOffset, '');
      }
    }
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
    return new RangeMock(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn()));
  }
  clearContents() { this.rows = []; return this; }
  setFrozenRows() { return this; }
  autoResizeColumns() { return this; }
}

class SpreadsheetMock {
  constructor(id) { this.id = id; this.sheets = new Map(); }
  getId() { return this.id; }
  getSheetByName(name) { return this.sheets.get(name) || null; }
  insertSheet(name) { const sheet = new SheetMock(name); this.sheets.set(name, sheet); return sheet; }
  toast() {}
}

const spreadsheet = new SpreadsheetMock('teacher-sheet-1');
const properties = new Map();
let uuidCounter = 0;
const gasGlobals = {
  console,
  SpreadsheetApp: {
    getActiveSpreadsheet: () => spreadsheet,
    openById: () => spreadsheet,
    getUi: () => ({}),
    flush() {}
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (key) => properties.get(key) || null,
      setProperty: (key, value) => properties.set(key, String(value)),
      deleteProperty: (key) => properties.delete(key)
    })
  },
  Utilities: {
    Charset: { UTF_8:'utf8' },
    getUuid: () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '0')}`,
    computeHmacSha256Signature: (value, secret) => createHmac('sha256', secret).update(value).digest(),
    base64EncodeWebSafe: (value) => Buffer.from(value).toString('base64url')
  },
  LockService: {
    getScriptLock: () => ({ waitLock() {}, tryLock() { return true; }, releaseLock() {} })
  },
  ScriptApp: {
    getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/fake/exec' })
  }
};

const root = path.resolve(__dirname, '..');
const setupSource = fs.readFileSync(path.join(root, 'gas-lite', 'SetupService.js'), 'utf8');
const context = vm.createContext(gasGlobals);
vm.runInContext(setupSource, context, { filename: 'gas-lite/SetupService.js' });
const conversationSource = fs.readFileSync(path.join(root, 'gas-lite', 'ConversationService.js'), 'utf8');
vm.runInContext(conversationSource, context, { filename: 'gas-lite/ConversationService.js' });
const engineSource = fs.readFileSync(path.join(root, 'gas-lite', 'EngineClient.js'), 'utf8');
vm.runInContext(engineSource, context, { filename: 'gas-lite/EngineClient.js' });
const evaluationSource = fs.readFileSync(path.join(root, 'gas-lite', 'EvaluationService.js'), 'utf8');
vm.runInContext(evaluationSource, context, { filename: 'gas-lite/EvaluationService.js' });

const valid = {
  appName: '생각이',
  subject: '국어',
  grade: '초등 4학년',
  lessonTitle: '신문기사를 읽고 근거 있는 의견 쓰기',
  lessonGoal: '기사의 핵심 내용을 파악하고 근거를 들어 의견을 표현할 수 있다.',
  achievementStandardCode: '[4국02-04]',
  achievementStandard: '글을 읽고 사실과 의견을 구분한다.',
  assessmentCriteria: '기사의 핵심을 설명하고 기사 속 근거와 자신의 의견을 연결한다.',
  rubricHigh: '핵심 내용과 근거를 정확히 찾아 자신의 의견을 분명하게 설명한다.',
  rubricMeet: '핵심 내용이나 근거 일부를 찾아 자신의 의견과 연결한다.',
  rubricDeveloping: '핵심 내용과 근거를 찾는 데 교사의 도움이 필요하다.',
  evidenceDescription: '학생 질문, 근거를 찾은 답변, 자신의 의견과 이유',
  materialTitle: '일회용품을 줄이는 학교',
  materialText: '우리 학교에서는 일회용품 사용을 줄이기 위해 개인 물병을 사용하고 있습니다. 학생들은 환경을 지키는 작은 실천의 의미를 이야기했습니다.',
  materialUrl: 'https://example.com/article',
  startQuestion: '기사에서 가장 궁금한 점은 무엇인가요?',
  activityMode: 'evaluation',
  version: 'v1'
};

const normalized = context.validateLiteTeacherSetup_(valid);
assert.equal(normalized.activityMode, 'evaluation');
assert.equal(normalized.lessonTitle, valid.lessonTitle);

assert.throws(
  () => context.validateLiteTeacherSetup_({ ...valid, assessmentCriteria: '' }),
  /평가기준/
);
assert.throws(
  () => context.validateLiteTeacherSetup_({ ...valid, materialText: '짧은 자료' }),
  /30자 이상/
);
assert.throws(
  () => context.validateLiteTeacherSetup_({ ...valid, materialUrl: 'javascript:alert(1)' }),
  /http:\/\//
);
assert.throws(
  () => context.validateLiteTeacherSetup_({ ...valid, activityMode: 'free' }),
  /평가모드 또는 탐색모드/
);

assert.equal(context.validateLiteApiKey_('sk-abcdefghijklmnop'), 'sk-abcdefghijklmnop');
assert.throws(() => context.validateLiteApiKey_('not-a-key'), /sk-/);

const student = context.sanitizeLiteSettingsForStudent_(normalized);
assert.equal(student.materialText, normalized.materialText);
assert.equal(student.lessonGoal, normalized.lessonGoal);
assert.equal(Object.hasOwn(student, 'assessmentCriteria'), false);
assert.equal(Object.hasOwn(student, 'rubricHigh'), false);
assert.equal(Object.hasOwn(student, 'achievementStandard'), false);
assert.equal(Object.hasOwn(student, 'apiKey'), false);

const setupReady = context.buildLiteReadiness_(normalized, {
  apiConfigured: true,
  engineConfigured: false,
  studentUrl: ''
});
assert.equal(setupReady.level, 'setup_ready');
assert.equal(setupReady.setupReady, true);
assert.equal(setupReady.distributionReady, false);

const distributionReady = context.buildLiteReadiness_(normalized, {
  apiConfigured: true,
  engineConfigured: true,
  studentUrl: 'https://script.google.com/macros/s/example/exec'
});
assert.equal(distributionReady.level, 'distribution_ready');
assert.equal(distributionReady.distributionReady, true);

const headers = vm.runInContext('LITE_SHEET_HEADERS_', context);
assert.deepEqual(
  Array.from(Object.keys(headers)),
  ['시작하기', '수업 자료', '학생별 현황', '질문과 답변', '교사 평가']
);
assert.equal(headers['수업 자료'].includes('assessmentCriteria'), true);
assert.equal(headers['교사 평가'].includes('improvementSuggestion'), true);

assert.equal(context.normalizeLiteStudentCode_(' 03 - 012 '), '3-12');
assert.throws(() => context.normalizeLiteStudentCode_('홍길동'), /반-번호/);
assert.equal(
  context.redactLiteStudentText_('내 이름은 홍길동이고 010-1234-5678로 연락해요.'),
  '내 이름은 [이름 가림]이고 [연락처 가림]로 연락해요.'
);
assert.throws(() => context.normalizeLiteDeviceToken_('short'), /새로고침/);
assert.equal(
  context.normalizeLiteRequestId_('req_1234567890123456'),
  'req_1234567890123456'
);

const enforcedQuestion = context.enforceLiteReply_('자료를 보면 알 수 있을까요? 다른 것도 볼까요?', {
  fallbackReply: '자료에 답이 있습니다. 무엇을 찾았나요?',
  enforcement: { managedQuestion: '무엇을 찾았나요?' }
});
assert.equal(enforcedQuestion, '자료에 답이 있습니다. 무엇을 찾았나요?');
assert.equal(
  context.enforceLiteReply_('자료에는 나오지 않아요. 다른 걸 물을까요?', {
    fallbackReply: '자료에는 나오지 않아요.',
    enforcement: { managedQuestion: '' }
  }),
  '자료에는 나오지 않아요.'
);

assert.deepEqual(
  JSON.parse(JSON.stringify(context.liteAutomaticJudgment_([{ score:5 }, { score:4 }, { score:3 }]))),
  { label:'도달', average:4 }
);
assert.match(
  context.liteImprovementSuggestion_([{ criterionKey:'passage_comprehension', score:1 }]),
  /관련 문장/
);
assert.throws(
  () => context.validateLiteTeacherEvaluation_({
    studentCode:'3-12', lessonId:'LESSON-1', teacherDecision:'판단 보류',
    teacherFeedback:'관찰함', improvementSuggestion:'근거 찾기', finalStatus:'최종 확정'
  }),
  /최종 확정하려면/
);

context.ensureLiteWorkbook_(spreadsheet);
assert.deepEqual(Array.from(spreadsheet.sheets.keys()), ['시작하기', '수업 자료', '학생별 현황', '질문과 답변', '교사 평가']);
const savedSettings = context.saveLiteTeacherSettings_(normalized);
const reopenedSettings = context.readLiteTeacherSettings_();
assert.equal(reopenedSettings.lessonId, savedSettings.lessonId);
assert.equal(reopenedSettings.assessmentCriteria, normalized.assessmentCriteria);

const teacherToken = context.getOrCreateLiteTeacherAccessToken_();
assert.throws(() => context.assertLiteTeacherAccess_('wrong-token'), /Google Sheet/);
assert.doesNotThrow(() => context.assertLiteTeacherAccess_(teacherToken));

const turn = context.prepareLiteStudentTurn_({
  requestId:'req_integration000001', studentCode:'3-12',
  deviceToken:'device_1234567890123456', message:'내 이름은 홍길동이고 왜 물병을 써요?'
}, savedSettings);
assert.equal(turn.message.includes('홍길동'), false);
const firstWrite = context.appendLiteTurnPair_(turn, {
  text:'일회용품을 줄이기 위해서예요.', phase:1, managedKind:'receive',
  evidenceIds:['source-1'], engineStatus:'ok', aiStatus:'ok'
});
assert.equal(firstWrite.duplicate, false);
const duplicateWrite = context.appendLiteTurnPair_(turn, {
  text:'다시 쓰면 안 됩니다.', phase:1, managedKind:'receive', engineStatus:'ok', aiStatus:'ok'
});
assert.equal(duplicateWrite.duplicate, true);
assert.equal(context.liteRowsAsObjects_(spreadsheet.getSheetByName('질문과 답변')).length, 2);
assert.equal(context.liteRowsAsObjects_(spreadsheet.getSheetByName('학생별 현황'))[0].questionCount, 1);

context.upsertLiteEvaluationDraft_(savedSettings, turn, {
  rubricScores:[
    { criterionKey:'questioning', score:3, rationale:'질문 한 개를 관찰함' },
    { criterionKey:'passage_comprehension', score:2, rationale:'근거 확인을 시작함' }
  ]
});
const evaluationRow = context.liteRowsAsObjects_(spreadsheet.getSheetByName('교사 평가'))[0];
assert.match(evaluationRow.automaticJudgment, /성장 중/);
assert.equal(evaluationRow.finalStatus, '검수 필요');

const codeSource = fs.readFileSync(path.join(root, 'gas-lite', 'Code.js'), 'utf8');
const teacherHtml = fs.readFileSync(path.join(root, 'gas-lite', 'TeacherSetup.html'), 'utf8');
const studentHtml = fs.readFileSync(path.join(root, 'gas-lite', 'Student.html'), 'utf8');

assert.match(codeSource, /setProperty\(LITE_API_KEY_PROPERTY_, key\)/);
assert.doesNotMatch(codeSource, /apiKey\s*:/);
assert.match(codeSource, /function getLiteTeacherSetupData\(teacherAccessToken\) \{\s*assertLiteTeacherAccess_/);
assert.match(codeSource, /function saveLiteApiKey\(teacherAccessToken, apiKey\) \{\s*assertLiteTeacherAccess_/);
assert.doesNotMatch(engineSource, /apiKey\s*:\s*(?:key|LITE_API_KEY_PROPERTY_)/);
assert.match(engineSource, /개인 API 키·Google Sheet ID·교사 이메일은 payload에 포함하지 않는다/);
assert.match(teacherHtml, /id="assessment-criteria"/);
assert.match(teacherHtml, /id="evidence-description"/);
assert.match(teacherHtml, /99-999/);
assert.match(teacherHtml, /data-teacher-access-token/);
assert.doesNotMatch(studentHtml, /assessment-criteria|rubric-high|API 키/);

console.log('gas-lite implementation checks: all passed');
