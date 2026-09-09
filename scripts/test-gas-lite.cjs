const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash, createHmac } = require('node:crypto');

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
    DigestAlgorithm: { SHA_256:'sha256' },
    getUuid: () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '0')}`,
    computeDigest: (algorithm, value) => createHash(algorithm).update(value).digest(),
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
assert.equal(
  context.redactLiteStudentText_('저는 홍길동입니다. 물병이 궁금해요.'),
  '저는 [이름 가림]입니다. 물병이 궁금해요.'
);
assert.equal(
  context.redactLiteStudentText_('성명: 홍길동'),
  '성명: [이름 가림]'
);
assert.equal(context.redactLiteStudentText_('제가 홍길동입니다.'), '제가 [이름 가림]입니다.');
assert.equal(context.redactLiteStudentText_('내가 홍길동이야.'), '내가 [이름 가림]이야.');
assert.equal(context.redactLiteStudentText_('난 예은이야.'), '난 [이름 가림]이야.');
assert.equal(context.redactLiteStudentText_('저 민준인데 물병이 궁금해요.'), '저 [이름 가림]인데 물병이 궁금해요.');
assert.equal(context.redactLiteStudentText_('나는 Alice야.'), '나는 [이름 가림]야.');
assert.equal(context.redactLiteStudentText_('제 이름이 홍길동인데요.'), '제 이름이 [이름 가림]인데요.');
assert.equal(context.redactLiteStudentText_('학생 이름은 홍길동입니다.'), '학생 이름은 [이름 가림]입니다.');
assert.equal(context.redactLiteStudentText_('친구 이름은 김민수예요.'), '친구 이름은 [이름 가림]예요.');
assert.equal(
  context.redactLiteStudentText_('제 친구 김민수 전화번호는 010-1234-5678이에요.'),
  '제 친구 [이름 가림] 전화번호는 [연락처 가림]이에요.'
);
assert.equal(context.redactLiteStudentText_('저는 찬성입니다.'), '저는 찬성입니다.');
assert.equal(context.redactLiteStudentText_('저는 반대입니다.'), '저는 반대입니다.');
assert.equal(context.redactLiteStudentText_('저는 학생입니다.'), '저는 학생입니다.');
assert.equal(context.redactLiteStudentText_('나는 개인 물병을 사용해요.'), '나는 개인 물병을 사용해요.');
assert.equal(
  context.redactLiteStudentText_('저는 환경 보호가 중요하다고 생각해요.'),
  '저는 환경 보호가 중요하다고 생각해요.'
);
assert.equal(
  context.redactLiteStudentText_('우리 집은 서울시 강남구 테헤란로 123이에요.'),
  '우리 집은 [주소 가림]이에요.'
);
assert.equal(
  context.redactLiteStudentText_('경기도 성남시 분당구 판교로 123에 살아요.'),
  '[주소 가림]에 살아요.'
);
assert.equal(
  context.redactLiteStudentText_('경상남도 창원시 성산구 중앙대로 123'),
  '[주소 가림]'
);
assert.equal(
  context.redactLiteStudentText_('경기도 성남시의 환경 정책을 조사했어요.'),
  '경기도 성남시의 환경 정책을 조사했어요.'
);
assert.equal(
  context.redactLiteStudentText_('계좌번호는 123-456-789012예요.'),
  '계좌번호는 [계좌번호 가림]예요.'
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
    studentCode:'3-12', sessionId:'S-validation-session', lessonId:'LESSON-1', teacherDecision:'판단 보류',
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
assert.equal(savedSettings.lessonRevision, 1);
assert.match(savedSettings.sourceHash, /^[A-Za-z0-9_-]{24}$/);
const unchangedSettings = context.saveLiteTeacherSettings_(normalized);
assert.equal(unchangedSettings.lessonRevision, 1);
assert.equal(unchangedSettings.sourceHash, savedSettings.sourceHash);
assert.notEqual(
  context.makeLiteSettingsHash_({ ...normalized, grade:'초등 5학년' }),
  context.makeLiteSettingsHash_(normalized)
);

const teacherToken = context.getOrCreateLiteTeacherAccessToken_();
assert.throws(() => context.assertLiteTeacherAccess_('wrong-token'), /Google Sheet/);
assert.doesNotThrow(() => context.assertLiteTeacherAccess_(teacherToken));

const seededSession = context.startLiteStudentSession({
  studentCode:'4-7', deviceToken:'device_seed_1234567890',
  lessonId:savedSettings.lessonId, lessonRevision:savedSettings.lessonRevision,
  sourceHash:savedSettings.sourceHash
});
assert.equal(seededSession.history.length, 1);
assert.equal(seededSession.history[0].speaker, 'bot');
assert.equal(seededSession.history[0].text, normalized.startQuestion);
const seededRowCount = context.liteRowsAsObjects_(spreadsheet.getSheetByName('질문과 답변')).length;
assert.equal(seededRowCount, 0);
const reopenedSeededSession = context.startLiteStudentSession({
  studentCode:'4-7', deviceToken:'device_seed_1234567890',
  lessonId:savedSettings.lessonId, lessonRevision:savedSettings.lessonRevision,
  sourceHash:savedSettings.sourceHash
});
assert.equal(reopenedSeededSession.history.length, 1);
assert.equal(context.liteRowsAsObjects_(spreadsheet.getSheetByName('질문과 답변')).length, seededRowCount);
const separateDeviceSession = context.startLiteStudentSession({
  studentCode:'4-7', deviceToken:'different_device_12345',
  lessonId:savedSettings.lessonId, lessonRevision:savedSettings.lessonRevision,
  sourceHash:savedSettings.sourceHash
});
assert.notEqual(separateDeviceSession.sessionId, seededSession.sessionId);
assert.equal(separateDeviceSession.history.length, 1);
assert.equal(context.liteRowsAsObjects_(spreadsheet.getSheetByName('질문과 답변')).length, 0);
for (let index = 1; index <= 25; index += 1) {
  context.startLiteStudentSession({
    studentCode:`6-${index}`, deviceToken:`device_entry_only_${String(index).padStart(4, '0')}`,
    lessonId:savedSettings.lessonId, lessonRevision:savedSettings.lessonRevision,
    sourceHash:savedSettings.sourceHash
  });
}
assert.equal(context.liteRowsAsObjects_(spreadsheet.getSheetByName('질문과 답변')).length, 0);

const turn = context.prepareLiteStudentTurn_({
  requestId:'req_integration000001', studentCode:'3-12',
  deviceToken:'device_1234567890123456', message:'내 이름은 홍길동이고 왜 물병을 써요?',
  lessonId:savedSettings.lessonId, lessonRevision:savedSettings.lessonRevision,
  sourceHash:savedSettings.sourceHash
}, savedSettings);
assert.equal(turn.message.includes('홍길동'), false);
const compactHistory = context.compactLiteEngineHistory_(Array.from({ length:18 }, (_, index) => ({
  speaker:index % 2 ? 'bot' : 'student', text:'가'.repeat(4000), engineStatus:'ok'
})));
assert.equal(compactHistory.every((entry) => entry.text.length <= 1200), true);
assert.equal(compactHistory.reduce((total, entry) => total + entry.text.length, 0) <= 8000, true);
assert.throws(
  () => context.prepareLiteStudentTurn_({
    requestId:'req_stale_lesson00001', studentCode:'3-12',
    deviceToken:'device_1234567890123456', message:'왜 물병을 써요?',
    lessonId:savedSettings.lessonId, lessonRevision:savedSettings.lessonRevision + 1,
    sourceHash:savedSettings.sourceHash
  }, savedSettings),
  /새로고침/
);
const firstWrite = context.appendLiteTurnPair_(turn, {
  text:'일회용품을 줄이기 위해서예요.', phase:1, managedKind:'receive',
  evidenceIds:['source-1'], engineStatus:'ok', aiStatus:'ok'
});
assert.equal(firstWrite.duplicate, false);
const duplicateWrite = context.appendLiteTurnPair_(turn, {
  text:'다시 쓰면 안 됩니다.', phase:1, managedKind:'receive', engineStatus:'ok', aiStatus:'ok'
});
assert.equal(duplicateWrite.duplicate, true);
assert.equal(
  context.liteRowsAsObjects_(spreadsheet.getSheetByName('질문과 답변'))
    .filter((row) => row.requestId === turn.requestId).length,
  2
);
assert.equal(
  context.liteRowsAsObjects_(spreadsheet.getSheetByName('학생별 현황'))
    .find((row) => row.studentCode === turn.studentCode).questionCount,
  1
);
const duplicateRequest = context.findLiteDuplicateRequest_(turn.requestId);
assert.equal(duplicateRequest.sessionId, turn.sessionId);
assert.equal(duplicateRequest.isClosing, false);

const failedTurn = context.prepareLiteStudentTurn_({
  requestId:'req_failed_turn00001', studentCode:'3-12',
  deviceToken:'device_1234567890123456', message:'다시 물어볼게요?',
  lessonId:savedSettings.lessonId, lessonRevision:savedSettings.lessonRevision,
  sourceHash:savedSettings.sourceHash
}, savedSettings);
context.appendLiteTurnPair_(failedTurn, {
  text:'잠시 뒤 다시 보내 주세요.', phase:'', managedKind:'', evidenceIds:[],
  engineStatus:'engine_failed:timeout', aiStatus:'not_called'
});
assert.equal(context.getLiteSessionHistory_(turn.sessionId).length, 3);
assert.equal(
  context.liteRowsAsObjects_(spreadsheet.getSheetByName('학생별 현황'))
    .find((row) => row.studentCode === turn.studentCode).questionCount,
  1
);

const formulaTurn = context.prepareLiteStudentTurn_({
  requestId:'req_formula_turn0001', studentCode:'5-1',
  deviceToken:'device_formula_12345678', message:'=HYPERLINK("https://example.com","왜?")',
  lessonId:savedSettings.lessonId, lessonRevision:savedSettings.lessonRevision,
  sourceHash:savedSettings.sourceHash
}, savedSettings);
context.appendLiteTurnPair_(formulaTurn, {
  text:'=IMPORTXML("https://example.com","//title")', phase:1, managedKind:'receive',
  evidenceIds:[], engineStatus:'ok', aiStatus:'ok'
});
const formulaRows = context.liteRowsAsObjects_(spreadsheet.getSheetByName('질문과 답변'))
  .filter((row) => row.requestId === formulaTurn.requestId);
assert.equal(formulaRows.length, 2);
assert.match(formulaRows[0].text, /^'=HYPERLINK/);
assert.match(formulaRows[1].text, /^'=IMPORTXML/);
const formulaHistory = context.getLiteSessionHistory_(formulaTurn.sessionId);
assert.equal(formulaHistory[0].text, normalized.startQuestion);
assert.equal(formulaHistory[1].text, formulaTurn.message);
assert.equal(formulaHistory[2].text, '=IMPORTXML("https://example.com","//title")');

context.upsertLiteEvaluationDraft_(savedSettings, turn, {
  rubricScores:[
    { criterionKey:'questioning', score:3, rationale:'질문 한 개를 관찰함' },
    { criterionKey:'passage_comprehension', score:2, rationale:'근거 확인을 시작함' }
  ]
});
const evaluationRow = context.liteRowsAsObjects_(spreadsheet.getSheetByName('교사 평가'))[0];
assert.match(evaluationRow.automaticJudgment, /성장 중/);
assert.equal(evaluationRow.finalStatus, '검수 필요');
assert.equal(evaluationRow.questioningBest, 3);
assert.equal(evaluationRow.passageComprehensionBest, 2);
assert.equal(context.upsertLiteEvaluationDraft_(savedSettings, turn, {
  isClosing:true,
  rubricScores:[
    { criterionKey:'questioning', score:0, rationale:'종료 턴' },
    { criterionKey:'passage_comprehension', score:0, rationale:'종료 턴' }
  ]
}), null);
context.upsertLiteEvaluationDraft_(savedSettings, turn, {
  isClosing:false, sourceStatus:'supported', primaryMove:'receive',
  rubricScores:[
    { criterionKey:'questioning', score:1, rationale:'후속 관찰' },
    { criterionKey:'passage_comprehension', score:1, rationale:'후속 관찰' }
  ]
});
const accumulatedEvaluation = context.liteRowsAsObjects_(spreadsheet.getSheetByName('교사 평가'))[0];
assert.equal(accumulatedEvaluation.questioningBest, 3);
assert.equal(accumulatedEvaluation.passageComprehensionBest, 2);
assert.match(accumulatedEvaluation.automaticJudgment, /성장 중/);
assert.notEqual(context.upsertLiteEvaluationDraft_(savedSettings, turn, {
  isClosing:false, sourceStatus:'out_of_scope', responseScore:4, primaryMove:'receive',
  rubricScores:[
    { criterionKey:'achievement_standard', score:4, rationale:'관리 질문에 근거를 들어 답함' }
  ]
}), null);
assert.equal(
  context.liteRowsAsObjects_(spreadsheet.getSheetByName('교사 평가'))[0].achievementStandardBest,
  4
);
assert.equal(context.upsertLiteEvaluationDraft_(savedSettings, turn, {
  isClosing:false, sourceStatus:'out_of_scope', responseScore:0, primaryMove:'receive',
  rubricScores:[{ criterionKey:'questioning', score:5, rationale:'실제 이탈 발화' }]
}), null);

const alternateTurn = context.prepareLiteStudentTurn_({
  requestId:'req_alternate_device01', studentCode:'3-12',
  deviceToken:'device_alternate_12345', message:'자료의 중심 내용은 무엇인가요?',
  lessonId:savedSettings.lessonId, lessonRevision:savedSettings.lessonRevision,
  sourceHash:savedSettings.sourceHash
}, savedSettings);
context.appendLiteTurnPair_(alternateTurn, {
  text:'개인 물병 사용의 의미를 설명해요.', phase:1, managedKind:'receive',
  relatedQuestion:true, evidenceIds:['source-1'], engineStatus:'ok', aiStatus:'ok'
});
context.upsertLiteEvaluationDraft_(savedSettings, alternateTurn, {
  isClosing:false, sourceStatus:'supported', primaryMove:'receive',
  rubricScores:[
    { criterionKey:'passage_comprehension', score:5, rationale:'다른 접속에서 관찰함' }
  ]
});
const sameCodeSummaries = context.liteRowsAsObjects_(spreadsheet.getSheetByName('학생별 현황'))
  .filter((row) => row.studentCode === '3-12');
assert.equal(sameCodeSummaries.length, 2);
assert.notEqual(sameCodeSummaries[0].sessionId, sameCodeSummaries[1].sessionId);
const sameCodeEvaluations = context.liteRowsAsObjects_(spreadsheet.getSheetByName('교사 평가'))
  .filter((row) => row.studentCode === '3-12');
assert.equal(sameCodeEvaluations.length, 2);
const originalEvaluation = sameCodeEvaluations.find((row) => row.sessionId === turn.sessionId);
const alternateEvaluation = sameCodeEvaluations.find((row) => row.sessionId === alternateTurn.sessionId);
assert.equal(originalEvaluation.questioningBest, 3);
assert.equal(originalEvaluation.passageComprehensionBest, 2);
assert.equal(alternateEvaluation.questioningBest, '');
assert.equal(alternateEvaluation.passageComprehensionBest, 5);
const conflictDashboard = context.getLiteTeacherDashboardData(teacherToken);
assert.equal(conflictDashboard.uniqueStudentCount, 2);
assert.equal(
  conflictDashboard.evaluations.filter((row) => row.studentCode === '3-12' && row.sessionConflict).length,
  2
);
context.saveLiteTeacherEvaluation(teacherToken, {
  studentCode:'3-12', sessionId:turn.sessionId,
  lessonId:savedSettings.lessonId, lessonRevision:savedSettings.lessonRevision,
  teacherDecision:'성장 중', teacherFeedback:'첫 접속 근거를 확인함',
  improvementSuggestion:'관련 문장을 더 정확히 인용해 보세요.',
  nextLessonSuggestion:'근거 비교 활동', finalStatus:'최종 확정'
});
const savedEvaluations = context.liteRowsAsObjects_(spreadsheet.getSheetByName('교사 평가'))
  .filter((row) => row.studentCode === '3-12');
assert.equal(savedEvaluations.find((row) => row.sessionId === turn.sessionId).finalStatus, '최종 확정');
assert.notEqual(savedEvaluations.find((row) => row.sessionId === alternateTurn.sessionId).finalStatus, '최종 확정');

assert.equal(typeof context.resetLiteStudentBinding, 'undefined');

properties.delete('LITE_MODEL_MINUTE_BUDGET');
properties.set('LITE_MODEL_DAILY_BUDGET', JSON.stringify({
  bucket:new Date().toISOString().slice(0, 10), count:300
}));
assert.equal(context.reserveLiteModelCall_().allowed, false);
assert.equal(context.reserveLiteModelCall_().reason, 'daily_limit');
properties.delete('LITE_MODEL_DAILY_BUDGET');
const normalLockFactory = context.LockService.getScriptLock;
context.LockService.getScriptLock = () => ({
  waitLock() { throw new Error('lock busy'); }, releaseLock() {}
});
assert.equal(context.safeReserveLiteModelCall_().reason, 'budget_check_failed');
context.LockService.getScriptLock = normalLockFactory;
assert.equal(context.claimLiteInFlightRequest_('req_claim_123456789'), true);
assert.equal(context.claimLiteInFlightRequest_('req_claim_123456789'), false);
context.releaseLiteInFlightRequest_('req_claim_123456789');
assert.equal(context.claimLiteInFlightRequest_('req_claim_123456789'), true);
context.releaseLiteInFlightRequest_('req_claim_123456789');
context.LockService.getScriptLock = () => ({
  waitLock() { throw new Error('claim lock busy'); }, releaseLock() {}
});
assert.equal(context.safeClaimLiteInFlightRequest_('req_claim_lock_failure').reason, 'claim_failed');
assert.doesNotThrow(() => context.safeReleaseLiteInFlightRequest_('req_claim_lock_failure'));
context.LockService.getScriptLock = normalLockFactory;

const revisedSettings = context.saveLiteTeacherSettings_({ ...normalized, materialTitle:'일회용품을 줄이는 우리 반' });
assert.equal(revisedSettings.lessonRevision, 2);
assert.notEqual(revisedSettings.sourceHash, savedSettings.sourceHash);
assert.notEqual(
  context.makeLiteSessionId_(savedSettings.lessonId, savedSettings.lessonRevision, savedSettings.sourceHash, '3-12', 'device_1234567890123456'),
  context.makeLiteSessionId_(revisedSettings.lessonId, revisedSettings.lessonRevision, revisedSettings.sourceHash, '3-12', 'device_1234567890123456')
);
const currentDashboard = context.getLiteTeacherDashboardData(teacherToken);
assert.equal(currentDashboard.lesson.lessonRevision, 2);
assert.equal(currentDashboard.students.length, 0);
assert.equal(currentDashboard.evaluations.length, 0);

const codeSource = fs.readFileSync(path.join(root, 'gas-lite', 'Code.js'), 'utf8');
const teacherHtml = fs.readFileSync(path.join(root, 'gas-lite', 'TeacherSetup.html'), 'utf8');
const studentHtml = fs.readFileSync(path.join(root, 'gas-lite', 'Student.html'), 'utf8');
const studentClientHtml = fs.readFileSync(path.join(root, 'gas-lite', 'StudentClient.html'), 'utf8');
const studentStylesHtml = fs.readFileSync(path.join(root, 'gas-lite', 'StudentStyles.html'), 'utf8');

assert.match(codeSource, /setProperty\(LITE_API_KEY_PROPERTY_, key\)/);
assert.doesNotMatch(codeSource, /apiKey\s*:/);
assert.match(codeSource, /function getLiteTeacherSetupData\(teacherAccessToken\) \{\s*assertLiteTeacherAccess_/);
assert.match(codeSource, /function saveLiteApiKey\(teacherAccessToken, apiKey\) \{\s*assertLiteTeacherAccess_/);
assert.doesNotMatch(engineSource, /apiKey\s*:\s*(?:key|LITE_API_KEY_PROPERTY_)/);
assert.match(engineSource, /개인 API 키·Google Sheet ID·교사 이메일은 payload에 포함하지 않는다/);
assert.match(engineSource, /questioning-dialogue-v2/);
assert.match(engineSource, /planDigest/);
assert.match(engineSource, /lead_evidence_quote_v1/);
assert.match(engineSource, /candidateEvidenceQuote/);
assert.match(engineSource, /if \(!replyFinalizedByEngine\) reply = enforceLiteReply_/);
assert.match(teacherHtml, /id="assessment-criteria"/);
assert.match(teacherHtml, /id="evidence-description"/);
assert.match(teacherHtml, /99-999/);
assert.match(teacherHtml, /강사 설정 보기/);
assert.match(teacherHtml, /학생으로 체험/);
assert.match(teacherHtml, /data-teacher-access-token/);
assert.doesNotMatch(studentHtml, /assessment-criteria|rubric-high|API 키/);
assert.match(studentHtml, /class="learning-workspace"/);
assert.match(studentHtml, /data-panel="material"/);
assert.match(studentHtml, /id="definition-button"/);
assert.match(studentClientHtml, /getLiteStudentBootstrap/);
assert.match(studentClientHtml, /startLiteStudentSession/);
assert.match(studentClientHtml, /submitLiteTurn/);
assert.match(studentClientHtml, /lessonIdentity\(\)/);
assert.match(studentClientHtml, /sessionStorage\.getItem\(key\)/);
assert.doesNotMatch(studentClientHtml, /localStorage/);
assert.match(studentClientHtml, /leaveDeviceSession/);
assert.match(studentStylesHtml, /grid-template-columns:minmax\(0,42fr\) minmax\(0,58fr\)/);

console.log('gas-lite implementation checks: all passed');
