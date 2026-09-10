/* eslint-disable @typescript-eslint/no-require-imports */
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
  createTextFinder(query) {
    const sheet = this.sheet;
    const startRow = this.row;
    const startColumn = this.column;
    const rowCount = this.rowCount;
    const columnCount = this.columnCount;
    let entireCell = false;
    const finder = {
      matchEntireCell(value) { entireCell = Boolean(value); return finder; },
      findAll() {
        const matches = [];
        for (let rowOffset = 0; rowOffset < rowCount; rowOffset += 1) {
          for (let columnOffset = 0; columnOffset < columnCount; columnOffset += 1) {
            const value = String(sheet.getCell(startRow + rowOffset, startColumn + columnOffset));
            if (entireCell ? value === String(query) : value.includes(String(query))) {
              const row = startRow + rowOffset;
              const column = startColumn + columnOffset;
              matches.push({ getRow:() => row, getColumn:() => column });
            }
          }
        }
        return matches;
      }
    };
    return finder;
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
      getProperties: () => Object.fromEntries(properties),
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
    base64EncodeWebSafe: (value) => Buffer.from(value).toString('base64url'),
    newBlob: (value) => ({ getBytes: () => Buffer.from(String(value), 'utf8') }),
    formatDate: (date, timeZone) => new Intl.DateTimeFormat('en-CA', {
      timeZone, year:'numeric', month:'2-digit', day:'2-digit'
    }).format(date)
  },
  Session: { getScriptTimeZone: () => 'Asia/Seoul' },
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
const rawEngineSource = fs.readFileSync(path.join(root, 'gas-lite', 'EngineClient.js'), 'utf8');
const engineSource = rawEngineSource.replace(
  "const LITE_CENTRAL_ENGINE_ACCESS_KEY_ = '';",
  "const LITE_CENTRAL_ENGINE_ACCESS_KEY_ = 'local-test-lite-engine-key-1234567890';"
);
vm.runInContext(engineSource, context, { filename: 'gas-lite/EngineClient.js' });
const evaluationSource = fs.readFileSync(path.join(root, 'gas-lite', 'EvaluationService.js'), 'utf8');
vm.runInContext(evaluationSource, context, { filename: 'gas-lite/EvaluationService.js' });

const valid = {
  appName: '생각이',
  subject: '국어',
  grade: '초등 4학년',
  lessonTitle: '신문기사를 읽고 근거 있는 의견 쓰기',
  joinCode: '482731',
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
assert.equal(context.validateLiteJoinCode_('482731'), '482731');
assert.throws(() => context.validateLiteJoinCode_('1234'), /숫자 6자리/);

const safePlan = {
  schemaVersion:1, requestId:'req_plan_contract_001', fallbackReply:'자료를 함께 살펴볼게요.',
  skipModel:false, planDigest:'a'.repeat(32),
  engine:{ family:'questioning-dialogue-v2', sharedCore:true },
  modelRequest:{
    model:'gpt-5.6-terra', reasoningEffort:'low', outputContract:'lead_evidence_quote_v1',
    instructions:'근거 문장을 고르세요.', input:'수업자료와 학생 질문', maxOutputTokens:220
  },
  enforcement:{ managedQuestion:'어떤 문장이 근거인가요?', maximumQuestionCount:1 },
  observation:{}
};
assert.equal(context.validateLiteEnginePlan_(safePlan, safePlan.requestId), safePlan);
assert.throws(
  () => context.validateLiteEnginePlan_({
    ...safePlan, modelRequest:{ ...safePlan.modelRequest, input:'가'.repeat(12001) }
  }, safePlan.requestId),
  /입력 크기/
);

const student = context.sanitizeLiteSettingsForStudent_(normalized);
assert.equal(student.materialText, normalized.materialText);
assert.equal(student.lessonGoal, normalized.lessonGoal);
assert.equal(Object.hasOwn(student, 'assessmentCriteria'), false);
assert.equal(Object.hasOwn(student, 'rubricHigh'), false);
assert.equal(Object.hasOwn(student, 'achievementStandard'), false);
assert.equal(Object.hasOwn(student, 'apiKey'), false);
const bootstrapLesson = context.sanitizeLiteBootstrapForStudent_(normalized);
assert.equal(Object.hasOwn(bootstrapLesson, 'materialText'), false);
assert.equal(Object.hasOwn(bootstrapLesson, 'lessonGoal'), false);
assert.equal(Object.hasOwn(bootstrapLesson, 'joinCode'), false);

const setupReady = context.buildLiteReadiness_(normalized, {
  apiConfigured: true,
  apiVerified: false,
  engineConfigured: false,
  engineVerified: false,
  previewVerified: false,
  studentUrl: ''
});
assert.equal(setupReady.level, 'setup_ready');
assert.equal(setupReady.setupReady, true);
assert.equal(setupReady.runtimeReady, false);
assert.equal(setupReady.distributionReady, false);

const distributionReady = context.buildLiteReadiness_(normalized, {
  apiConfigured: true,
  apiVerified: true,
  engineConfigured: true,
  engineVerified: true,
  previewVerified: true,
  studentUrl: 'https://script.google.com/macros/s/example/exec'
});
assert.equal(distributionReady.level, 'distribution_ready');
assert.equal(distributionReady.runtimeReady, true);
assert.equal(distributionReady.distributionReady, true);

const headers = vm.runInContext('LITE_SHEET_HEADERS_', context);
assert.deepEqual(
  Array.from(Object.keys(headers)),
  ['시작하기', '수업 자료', '학생별 현황', '질문과 답변', '교사 평가']
);
assert.equal(headers['수업 자료'].includes('assessmentCriteria'), true);
assert.equal(headers['교사 평가'].includes('improvementSuggestion'), true);
assert.equal(headers['질문과 답변'].includes('primaryMove'), true);
assert.equal(headers['질문과 답변'].includes('safetyFlag'), true);

assert.equal(context.normalizeLiteStudentCode_(' 03 - 012 '), '3-12');
assert.throws(() => context.normalizeLiteStudentCode_('홍길동'), /반-번호/);
assert.equal(
  context.redactLiteStudentText_('내 이름은 홍길동이고 010-1234-5678로 연락해요.'),
  '내 이름은 [이름 가림]이고 [연락처 가림]로 연락해요.'
);
assert.equal(
  context.redactLiteStudentText_('저는 홍길동입니다. 물병이 궁금해요.'),
  '저는 홍길동입니다. 물병이 궁금해요.'
);
assert.equal(
  context.redactLiteStudentText_('성명: 홍길동'),
  '성명: [이름 가림]'
);
assert.equal(context.redactLiteStudentText_('제가 홍길동입니다.'), '제가 홍길동입니다.');
assert.equal(context.redactLiteStudentText_('내가 홍길동이야.'), '내가 홍길동이야.');
assert.equal(context.redactLiteStudentText_('난 예은이야.'), '난 예은이야.');
assert.equal(context.redactLiteStudentText_('저 민준인데 물병이 궁금해요.'), '저 민준인데 물병이 궁금해요.');
assert.equal(context.redactLiteStudentText_('나는 Alice야.'), '나는 Alice야.');
assert.equal(context.redactLiteStudentText_('제 이름은 예은이에요.'), '제 이름은 [이름 가림]이에요.');
assert.equal(context.redactLiteStudentText_('내 이름은 홍길동이야.'), '내 이름은 [이름 가림]이야.');
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
assert.equal(context.redactLiteStudentText_('저는 경제라고 생각해요.'), '저는 경제라고 생각해요.');
assert.equal(context.redactLiteStudentText_('저는 민주주의예요.'), '저는 민주주의예요.');
assert.equal(context.redactLiteStudentText_('저는 인공지능입니다.'), '저는 인공지능입니다.');
assert.equal(context.redactLiteStudentText_('나는 자유야.'), '나는 자유야.');
assert.equal(
  context.redactLiteStudentText_('저는 환경 보호가 중요하다고 생각해요.'),
  '저는 환경 보호가 중요하다고 생각해요.'
);
assert.equal(
  context.redactLiteStudentText_('우리 집은 서울시 강남구 테헤란로 123이에요.'),
  '우리 집은 [주소 가림]이에요.'
);
assert.equal(
  context.redactLiteStudentText_('우리 집은 강남구 테헤란로 123이에요.'),
  '우리 집은 [주소 가림]이에요.'
);
assert.equal(
  context.redactLiteStudentText_('주소는 분당구 판교로 123번길 4예요.'),
  '주소는 [주소 가림]예요.'
);
assert.equal(
  context.redactLiteStudentText_('우리 집 주소는 테헤란로 123이에요.'),
  '우리 집 주소는 [주소 가림]이에요.'
);
assert.equal(
  context.redactLiteStudentText_('내 전화는 1234-5678이야.'),
  '내 전화는 [연락처 가림]이야.'
);
assert.equal(context.redactLiteStudentText_('010/1234/5678'), '[연락처 가림]');
assert.equal(context.redactLiteStudentText_('+82 10 1234 5678'), '[연락처 가림]');
assert.equal(context.redactLiteStudentText_('+1-202-555-0123'), '[연락처 가림]');
assert.equal(context.redactLiteStudentText_('0505-1234-5678'), '[연락처 가림]');
assert.equal(context.redactLiteStudentText_('강남구 테헤란로 123'), '[주소 가림]');
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
assert.doesNotThrow(() => context.validateLiteTeacherEvaluation_({
  studentCode:'3-12', sessionId:'S-validation-session', lessonId:'LESSON-1', teacherDecision:'판단 보류',
  teacherFeedback:'', improvementSuggestion:'', finalStatus:'검수 중',
  expectedReviewVersion:'review_version_1234567890'
}));
assert.throws(
  () => context.validateLiteTeacherEvaluation_({
    studentCode:'3-12', sessionId:'S-validation-session', lessonId:'LESSON-1', teacherDecision:'도달',
    teacherFeedback:'', improvementSuggestion:'근거 찾기', finalStatus:'최종 확정'
  }),
  /교사 피드백/
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

properties.set('TEACHER_OPENAI_API_KEY', 'sk-abcdefghijklmnop');
context.markLiteApiVerified_('sk-abcdefghijklmnop');
properties.set('CENTRAL_ENGINE_ENDPOINT', 'https://engine.example.com/api/lite-engine/plan');
context.markLiteEngineVerified_('https://engine.example.com/api/lite-engine/plan', 'questioning-dialogue-v2-lite-adapter-v3');
assert.equal(context.buildLiteCurrentReadiness_(savedSettings).runtimeReady, true);
assert.equal(context.buildLiteCurrentReadiness_(savedSettings).distributionReady, false);
assert.throws(
  () => context.startLiteStudentSession({
    studentCode:'3-12', joinCode:valid.joinCode, deviceToken:'device_before_preview_123456',
    lessonId:savedSettings.lessonId, lessonRevision:savedSettings.lessonRevision,
    sourceHash:savedSettings.sourceHash
  }),
  /99-999/
);
assert.throws(() => context.startLiteStudentSession({
  studentCode:'99-999', deviceToken:'device_preview_1234567890',
  lessonId:savedSettings.lessonId, lessonRevision:savedSettings.lessonRevision,
  sourceHash:savedSettings.sourceHash
}), /전용 주소/);
const previewAccessToken = context.getOrCreateLitePreviewAccessToken_(savedSettings);
assert.doesNotThrow(() => context.startLiteStudentSession({
  studentCode:'99-999', deviceToken:'device_preview_1234567890',
  lessonId:savedSettings.lessonId, lessonRevision:savedSettings.lessonRevision,
  sourceHash:savedSettings.sourceHash, previewAccessToken
}));
context.markLitePreviewVerified_(savedSettings);
assert.equal(context.buildLiteCurrentReadiness_(savedSettings).distributionReady, true);
assert.throws(() => context.startLiteStudentSession({
  studentCode:'4-8', joinCode:'111111', deviceToken:'device_wrong_join_12345',
  lessonId:savedSettings.lessonId, lessonRevision:savedSettings.lessonRevision,
  sourceHash:savedSettings.sourceHash
}), /반-번호 또는 수업 참여코드/);

const seededSession = context.startLiteStudentSession({
  studentCode:'4-7', joinCode:valid.joinCode, deviceToken:'device_seed_1234567890',
  lessonId:savedSettings.lessonId, lessonRevision:savedSettings.lessonRevision,
  sourceHash:savedSettings.sourceHash
});
assert.equal(seededSession.history.length, 1);
assert.equal(seededSession.history[0].speaker, 'bot');
assert.equal(seededSession.history[0].text, normalized.startQuestion);
const seededRowCount = context.liteRowsAsObjects_(spreadsheet.getSheetByName('질문과 답변')).length;
assert.equal(seededRowCount, 0);
const reopenedSeededSession = context.startLiteStudentSession({
  studentCode:'4-7', joinCode:valid.joinCode, deviceToken:'device_seed_1234567890',
  lessonId:savedSettings.lessonId, lessonRevision:savedSettings.lessonRevision,
  sourceHash:savedSettings.sourceHash
});
assert.equal(reopenedSeededSession.history.length, 1);
assert.equal(context.liteRowsAsObjects_(spreadsheet.getSheetByName('질문과 답변')).length, seededRowCount);
const separateDeviceSession = context.startLiteStudentSession({
  studentCode:'4-7', joinCode:valid.joinCode, deviceToken:'different_device_12345',
  lessonId:savedSettings.lessonId, lessonRevision:savedSettings.lessonRevision,
  sourceHash:savedSettings.sourceHash
});
assert.notEqual(separateDeviceSession.sessionId, seededSession.sessionId);
assert.equal(separateDeviceSession.history.length, 1);
assert.equal(context.liteRowsAsObjects_(spreadsheet.getSheetByName('질문과 답변')).length, 0);
for (let index = 1; index <= 25; index += 1) {
  context.startLiteStudentSession({
    studentCode:`6-${index}`, joinCode:valid.joinCode, deviceToken:`device_entry_only_${String(index).padStart(4, '0')}`,
    lessonId:savedSettings.lessonId, lessonRevision:savedSettings.lessonRevision,
    sourceHash:savedSettings.sourceHash
  });
}
assert.equal(context.liteRowsAsObjects_(spreadsheet.getSheetByName('질문과 답변')).length, 0);

const turn = context.prepareLiteStudentTurn_({
  requestId:'req_integration000001', studentCode:'3-12', joinCode:valid.joinCode,
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
    requestId:'req_stale_lesson00001', studentCode:'3-12', joinCode:valid.joinCode,
    deviceToken:'device_1234567890123456', message:'왜 물병을 써요?',
    lessonId:savedSettings.lessonId, lessonRevision:savedSettings.lessonRevision + 1,
    sourceHash:savedSettings.sourceHash
  }, savedSettings),
  /새로고침/
);
const firstWrite = context.appendLiteTurnPair_(turn, {
  text:'일회용품을 줄이기 위해서예요.', phase:1, managedKind:'receive',
  evidenceIds:['source-1'], engineStatus:'finalized:test', aiStatus:'ok:gpt-test',
  rubricScores:[{ criterionKey:'questioning', score:3, rationale:'질문 한 개를 관찰함' }],
  apiModel:'gpt-test', apiInputTokens:120, apiOutputTokens:30, apiTotalTokens:150
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
context.upsertLiteStudentSummary_(spreadsheet, turn, { phase:1, relatedQuestion:true });
context.upsertLiteStudentSummary_(spreadsheet, turn, { phase:1, relatedQuestion:true });
assert.equal(
  context.liteRowsAsObjects_(spreadsheet.getSheetByName('학생별 현황'))
    .find((row) => row.studentCode === turn.studentCode).questionCount,
  1
);
const duplicateRequest = context.findLiteDuplicateRequest_(turn.requestId);
assert.equal(duplicateRequest.sessionId, turn.sessionId);
assert.equal(duplicateRequest.isClosing, false);
assert.equal(duplicateRequest.observation.rubricScores[0].criterionKey, 'questioning');
const legacyDuplicateRows = context.liteRowsAsObjects_(spreadsheet.getSheetByName('질문과 답변'))
  .filter((row) => row.requestId === turn.requestId)
  .map((row) => ({ ...row, lessonId:'', lessonRevision:'', sourceHash:'' }));
assert.equal(
  context.findLiteDuplicateRequest_(turn.requestId, turn, legacyDuplicateRows).sessionId,
  turn.sessionId
);
assert.throws(
  () => context.findLiteDuplicateRequest_(turn.requestId, { ...turn, studentCode:'9-9' }),
  /다른 수업 또는 학생/
);

const failedTurn = context.prepareLiteStudentTurn_({
  requestId:'req_failed_turn00001', studentCode:'3-12', joinCode:valid.joinCode,
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
  requestId:'req_formula_turn0001', studentCode:'5-1', joinCode:valid.joinCode,
  deviceToken:'device_formula_12345678', message:'=HYPERLINK("https://example.com","왜?")',
  lessonId:savedSettings.lessonId, lessonRevision:savedSettings.lessonRevision,
  sourceHash:savedSettings.sourceHash
}, savedSettings);
context.appendLiteTurnPair_(formulaTurn, {
  text:'=IMPORTXML("https://example.com","//title")', phase:1, managedKind:'receive',
  sourceCue:'=IMPORTDATA("https://example.com")', evidenceIds:[], engineStatus:'ok', aiStatus:'ok'
});
const formulaSheet = spreadsheet.getSheetByName('질문과 답변');
const formulaHeaders = formulaSheet.rows[0];
const requestColumn = formulaHeaders.indexOf('requestId');
const textColumn = formulaHeaders.indexOf('text');
const sourceCueColumn = formulaHeaders.indexOf('sourceCue');
const rawFormulaRows = formulaSheet.rows.filter((row) => row[requestColumn] === formulaTurn.requestId);
assert.equal(rawFormulaRows.length, 2);
assert.match(rawFormulaRows[0][textColumn], /^'=HYPERLINK/);
assert.match(rawFormulaRows[1][textColumn], /^'=IMPORTXML/);
assert.match(rawFormulaRows[1][sourceCueColumn], /^'=IMPORTDATA/);
const formulaRows = context.liteRowsAsObjects_(formulaSheet)
  .filter((row) => row.requestId === formulaTurn.requestId);
assert.equal(formulaRows.length, 2);
assert.match(formulaRows[0].text, /^=HYPERLINK/);
assert.match(formulaRows[1].text, /^=IMPORTXML/);
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
  requestId:'req_alternate_device01', studentCode:'3-12', joinCode:valid.joinCode,
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
assert.equal(conflictDashboard.apiUsage.requests, 1);
assert.equal(conflictDashboard.apiUsage.totalTokens, 150);
assert.equal(
  conflictDashboard.evaluations.filter((row) => row.studentCode === '3-12' && row.sessionConflict).length,
  2
);
const originalReviewVersion = conflictDashboard.evaluations
  .find((row) => row.sessionId === turn.sessionId).reviewVersion;
context.saveLiteTeacherEvaluation(teacherToken, {
  studentCode:'3-12', sessionId:turn.sessionId,
  lessonId:savedSettings.lessonId, lessonRevision:savedSettings.lessonRevision,
  expectedReviewVersion:originalReviewVersion,
  teacherDecision:'성장 중', teacherFeedback:'=HYPERLINK("https://example.com","첫 접속 근거")',
  improvementSuggestion:'관련 문장을 더 정확히 인용해 보세요.',
  nextLessonSuggestion:'근거 비교 활동', finalStatus:'최종 확정'
});
const savedEvaluations = context.liteRowsAsObjects_(spreadsheet.getSheetByName('교사 평가'))
  .filter((row) => row.studentCode === '3-12');
assert.equal(savedEvaluations.find((row) => row.sessionId === turn.sessionId).finalStatus, '최종 확정');
assert.match(savedEvaluations.find((row) => row.sessionId === turn.sessionId).teacherFeedback, /^=HYPERLINK/);
const evaluationSheet = spreadsheet.getSheetByName('교사 평가');
const evaluationHeaders = evaluationSheet.rows[0];
const rawSavedEvaluation = evaluationSheet.rows.find((row) => row[evaluationHeaders.indexOf('sessionId')] === turn.sessionId);
assert.match(rawSavedEvaluation[evaluationHeaders.indexOf('teacherFeedback')], /^'=HYPERLINK/);
assert.notEqual(savedEvaluations.find((row) => row.sessionId === alternateTurn.sessionId).finalStatus, '최종 확정');
context.upsertLiteEvaluationDraft_(savedSettings, turn, {
  isClosing:false, sourceStatus:'supported', primaryMove:'receive',
  rubricScores:[
    { criterionKey:'questioning', score:3, rationale:'질문 한 개를 관찰함' },
    { criterionKey:'passage_comprehension', score:2, rationale:'근거 확인을 시작함' }
  ]
});
assert.equal(
  context.liteRowsAsObjects_(spreadsheet.getSheetByName('교사 평가'))
    .find((row) => row.sessionId === turn.sessionId).finalStatus,
  '최종 확정'
);
const finalizedReviewVersion = context.getLiteTeacherDashboardData(teacherToken).evaluations
  .find((row) => row.sessionId === turn.sessionId).reviewVersion;
const repeatedEvidenceNewTurn = Object.assign({}, turn, { requestId:'req_repeated_evidence02' });
context.upsertLiteEvaluationDraft_(savedSettings, repeatedEvidenceNewTurn, {
  isClosing:false, sourceStatus:'supported', primaryMove:'receive',
  rubricScores:[
    { criterionKey:'questioning', score:3, rationale:'질문 한 개를 관찰함' },
    { criterionKey:'passage_comprehension', score:2, rationale:'근거 확인을 시작함' }
  ]
});
assert.equal(
  context.liteRowsAsObjects_(spreadsheet.getSheetByName('교사 평가'))
    .find((row) => row.sessionId === turn.sessionId).finalStatus,
  '재검수 필요'
);
assert.throws(() => context.saveLiteTeacherEvaluation(teacherToken, {
  studentCode:'3-12', sessionId:turn.sessionId,
  lessonId:savedSettings.lessonId, lessonRevision:savedSettings.lessonRevision,
  expectedReviewVersion:finalizedReviewVersion,
  teacherDecision:'성장 중', teacherFeedback:'오래 열린 화면의 피드백',
  improvementSuggestion:'근거를 다시 찾아보세요.', nextLessonSuggestion:'', finalStatus:'최종 확정'
}), /새 근거|새로고침/);

assert.equal(typeof context.resetLiteStudentBinding, 'undefined');

properties.delete('LITE_MODEL_MINUTE_BUDGET');
properties.set('LITE_MODEL_DAILY_BUDGET', JSON.stringify({
  bucket:context.liteLocalDayBucket_(new Date()), count:300
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
assert.equal(context.claimLiteInFlightRequest_('req_session_a_123456', 'S-shared-session'), true);
assert.equal(context.claimLiteInFlightRequest_('req_session_b_123456', 'S-shared-session'), false);
context.releaseLiteInFlightRequest_('req_session_a_123456', 'S-shared-session');
assert.equal(context.claimLiteInFlightRequest_('req_session_b_123456', 'S-shared-session'), true);
context.releaseLiteInFlightRequest_('req_session_b_123456', 'S-shared-session');
assert.equal(context.claimLiteInFlightRequest_('req_claim_123456789'), true);
context.releaseLiteInFlightRequest_('req_claim_123456789');
context.LockService.getScriptLock = () => ({
  waitLock() { throw new Error('claim lock busy'); }, releaseLock() {}
});
assert.equal(context.safeClaimLiteInFlightRequest_('req_claim_lock_failure').reason, 'claim_failed');
assert.doesNotThrow(() => context.safeReleaseLiteInFlightRequest_('req_claim_lock_failure'));
context.LockService.getScriptLock = normalLockFactory;

properties.delete('LITE_CLAIM_CLEANUP_AFTER');
const staleRequestClaim = context.liteRequestClaimKey_('req_stale_claim_1234');
const staleSessionClaim = context.liteSessionClaimKey_('S-stale-session');
properties.set(staleRequestClaim, String(Date.now() - 11 * 60 * 1000));
properties.set(staleSessionClaim, JSON.stringify({
  claimedAt:Date.now() - 11 * 60 * 1000, requestId:'req_stale_claim_1234'
}));
context.cleanupLiteStaleClaims_(context.PropertiesService.getScriptProperties(), Date.now());
assert.equal(properties.has(staleRequestClaim), false);
assert.equal(properties.has(staleSessionClaim), false);

const expiredPendingKey = 'LITE_PENDING_expired_test';
properties.set(expiredPendingKey, JSON.stringify({ state:'result_ready', at:Date.now() - 25 * 60 * 60 * 1000 }));
assert.equal(context.cleanupLitePendingStates_(context.PropertiesService.getScriptProperties(), Date.now()), 0);
assert.equal(properties.has(expiredPendingKey), false);
const journalKeys = [];
for (let index = 0; index < 32; index += 1) {
  const key = 'LITE_PENDING_capacity_' + index;
  journalKeys.push(key);
  properties.set(key, JSON.stringify({ state:'provider_started', at:Date.now() }));
}
assert.equal(context.tryMarkLiteProviderStarted_({
  requestId:'req_journal_capacity', sessionId:'S-journal-capacity', studentCode:'8-1',
  lessonId:savedSettings.lessonId, lessonRevision:savedSettings.lessonRevision,
  sourceHash:savedSettings.sourceHash, message:'저장 한도 점검'
}), false);
journalKeys.forEach((key) => properties.delete(key));

const originalPlanRequest = context.requestLiteEnginePlan_;
const originalModelCall = context.callLiteOpenAI_;
const originalFinalizeRequest = context.requestLiteEngineFinalize_;
const originalAppendTurn = context.appendLiteTurnPair_;
let modelCallCount = 0;
let failFirstAppend = true;
context.requestLiteEnginePlan_ = () => ({
  skipModel:false,
  fallbackReply:'자료에서 근거를 다시 찾아볼까요?',
  observation:{
    conversationPhase:1, primaryMove:'receive', managedKind:'receive',
    relatedQuestion:true, responseScore:3, sourceStatus:'supported',
    rubricScores:[{ criterionKey:'questioning', score:3, rationale:'관련 질문을 관찰함' }]
  },
  policyVersion:'test-policy-v1',
  enforcement:{ managedQuestion:'어떤 문장이 근거가 되나요?' },
  modelRequest:{ model:'gpt-test' }
});
context.callLiteOpenAI_ = () => {
  modelCallCount += 1;
  return {
    text:'자료에서 함께 확인해 볼게요.', evidenceQuote:'개인 물병을 사용하고 있습니다.',
    model:'gpt-test', usage:{ input_tokens:80, output_tokens:20, total_tokens:100 }
  };
};
context.requestLiteEngineFinalize_ = (turnValue, settingsValue, historyValue, textValue, quoteValue, planValue) => ({
  studentReply:'자료에서 개인 물병 사용 부분을 찾았어요. 어떤 문장이 근거가 되나요?',
  observation:planValue.observation, policyVersion:'test-policy-v1', localFallback:false
});
context.appendLiteTurnPair_ = (turnValue, resultValue) => {
  if (failFirstAppend) { failFirstAppend = false; throw new Error('simulated sheet write failure'); }
  return originalAppendTurn(turnValue, resultValue);
};
const durablePayload = {
  requestId:'req_durable_result_001', studentCode:'7-1', joinCode:valid.joinCode,
  deviceToken:'device_durable_12345678', message:'왜 개인 물병을 사용하나요?',
  lessonId:savedSettings.lessonId, lessonRevision:savedSettings.lessonRevision,
  sourceHash:savedSettings.sourceHash
};
assert.throws(() => context.submitLiteTurn(durablePayload), /simulated sheet write failure/);
assert.equal(modelCallCount, 1);
assert.equal(properties.has(context.litePendingResultKey_(durablePayload.requestId)), true);
const recoveredResult = context.submitLiteTurn(durablePayload);
assert.equal(recoveredResult.ok, true);
assert.equal(modelCallCount, 1);
assert.equal(properties.has(context.litePendingResultKey_(durablePayload.requestId)), false);
assert.equal(
  context.liteRowsAsObjects_(spreadsheet.getSheetByName('질문과 답변'))
    .filter((row) => row.requestId === durablePayload.requestId).length,
  2
);
context.requestLiteEnginePlan_ = originalPlanRequest;
context.callLiteOpenAI_ = originalModelCall;
context.requestLiteEngineFinalize_ = originalFinalizeRequest;
context.appendLiteTurnPair_ = originalAppendTurn;

const originalSessionRequestCount = context.countLiteSessionRequests_;
let cappedPlanCalls = 0;
context.countLiteSessionRequests_ = () => 20;
context.requestLiteEnginePlan_ = () => { cappedPlanCalls += 1; throw new Error('must not call'); };
const cappedResult = context.submitLiteTurn({
  requestId:'req_session_cap_0001', studentCode:'7-2', joinCode:valid.joinCode,
  deviceToken:'device_cap_1234567890', message:'질문을 더 해도 되나요?',
  lessonId:savedSettings.lessonId, lessonRevision:savedSettings.lessonRevision,
  sourceHash:savedSettings.sourceHash
});
assert.equal(cappedResult.isClosing, true);
assert.equal(cappedPlanCalls, 0);
const cappedRows = context.liteRowsAsObjects_(spreadsheet.getSheetByName('질문과 답변'))
  .filter((row) => row.requestId === 'req_session_cap_0001');
assert.equal(cappedRows.length, 2);
assert.equal(cappedRows.find((row) => row.speaker === 'bot').engineStatus, 'limit:student_lesson');
assert.equal(cappedRows.find((row) => row.speaker === 'bot').isClosing, true);
context.countLiteSessionRequests_ = originalSessionRequestCount;
context.requestLiteEnginePlan_ = originalPlanRequest;

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
assert.equal(context.isLiteLessonOpen_(revisedSettings), true);
context.setLiteLessonOpen_(revisedSettings, false);
assert.equal(context.buildLiteCurrentReadiness_(revisedSettings).lessonOpen, false);
const revisedPreviewAccessToken = context.getOrCreateLitePreviewAccessToken_(revisedSettings);
assert.throws(
  () => context.startLiteStudentSession({
    studentCode:'99-999', deviceToken:'device_closed_lesson_1234',
    lessonId:revisedSettings.lessonId, lessonRevision:revisedSettings.lessonRevision,
    sourceHash:revisedSettings.sourceHash, previewAccessToken:revisedPreviewAccessToken
  }),
  /수업 활동을 마쳤습니다/
);
context.setLiteLessonOpen_(revisedSettings, true);
const copiedSettings = context.saveLiteTeacherSettings_(revisedSettings, { newLesson:true });
assert.notEqual(copiedSettings.lessonId, revisedSettings.lessonId);
assert.equal(copiedSettings.lessonRevision, 1);
assert.equal(context.isLitePreviewVerified_(copiedSettings), false);
assert.equal(context.isLitePreviewAccessToken_(revisedPreviewAccessToken, copiedSettings), false);
context.markLitePreviewVerified_(copiedSettings);
assert.equal(context.isLitePreviewVerified_(copiedSettings), true);
properties.set('TEACHER_OPENAI_API_KEY', 'sk-zxywvutsrqponmlk');
context.markLiteApiVerified_('sk-zxywvutsrqponmlk');
assert.equal(context.isLitePreviewVerified_(copiedSettings), false);

const codeSource = fs.readFileSync(path.join(root, 'gas-lite', 'Code.js'), 'utf8');
const teacherHtml = fs.readFileSync(path.join(root, 'gas-lite', 'TeacherSetup.html'), 'utf8');
const studentHtml = fs.readFileSync(path.join(root, 'gas-lite', 'Student.html'), 'utf8');
const studentClientHtml = fs.readFileSync(path.join(root, 'gas-lite', 'StudentClient.html'), 'utf8');
const studentStylesHtml = fs.readFileSync(path.join(root, 'gas-lite', 'StudentStyles.html'), 'utf8');
const teacherDashboardHtml = fs.readFileSync(path.join(root, 'gas-lite', 'TeacherDashboard.html'), 'utf8');

new vm.Script(codeSource, { filename:'gas-lite/Code.js' });
[teacherHtml, teacherDashboardHtml, studentClientHtml].forEach((source, index) => {
  const scripts = Array.from(source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi));
  scripts.forEach((match, scriptIndex) => {
    new vm.Script(match[1], { filename:`inline-${index}-${scriptIndex}.js` });
  });
});

assert.match(codeSource, /setProperty\(LITE_API_KEY_PROPERTY_, key\)/);
assert.doesNotMatch(codeSource, /apiKey\s*:/);
assert.match(codeSource, /function getLiteTeacherSetupData\(teacherAccessToken\) \{\s*assertLiteTeacherAccess_/);
assert.match(codeSource, /function saveLiteApiKey\(teacherAccessToken, apiKey\) \{\s*assertLiteTeacherAccess_/);
assert.match(codeSource, /template\.previewAccessToken/);
assert.doesNotMatch(
  codeSource.slice(codeSource.indexOf('function doGet'), codeSource.indexOf('function getLiteStudentBootstrap')),
  /readLiteTeacherSettings_/
);
assert.match(codeSource, /readLiteTeacherSettings_\(spreadsheet, \{ skipEnsure:true \}\)/);
assert.match(conversationSource, /function startLiteStudentSession[\s\S]*readLiteTeacherSettings_\(spreadsheet, \{ skipEnsure:true \}\)/);
assert.match(codeSource, /chatReady: readiness\.distributionReady \|\| \(readiness\.runtimeReady && previewAccess\)/);
assert.doesNotMatch(engineSource, /apiKey\s*:\s*(?:key|LITE_API_KEY_PROPERTY_)/);
assert.match(engineSource, /개인 API 키·Google Sheet ID·교사 이메일은 payload에 포함하지 않는다/);
assert.match(rawEngineSource, /https:\/\/newscomment-ai\.vercel\.app\/api\/lite-engine\/plan/);
assert.match(engineSource, /'X-Lite-Engine-Key':accessKey/);
assert.match(engineSource, /'X-Lite-Deployment-Id':getOrCreateLiteDeploymentId_\(\)/);
assert.match(engineSource, /questioning-dialogue-v2/);
assert.match(engineSource, /planDigest/);
assert.match(engineSource, /lead_evidence_quote_v1/);
assert.match(engineSource, /candidateEvidenceQuote/);
assert.match(engineSource, /if \(!replyFinalizedByEngine\) reply = enforceLiteReply_/);
assert.match(teacherHtml, /id="assessment-criteria"/);
assert.match(teacherHtml, /id="evidence-description"/);
assert.match(teacherHtml, /99-999/);
assert.match(teacherHtml, /체험 · 강사 챗봇/);
assert.match(teacherHtml, /이해 · 구조와 결과/);
assert.match(teacherHtml, /latestDistributionReady/);
assert.match(teacherHtml, /copy-student-url'\)\.disabled = !\(latestStudentUrl && latestDistributionReady\)/);
assert.match(teacherHtml, /id="test-engine"/);
assert.match(teacherHtml, /id="copy-student-url"/);
assert.match(teacherHtml, /id="toggle-lesson"/);
assert.match(teacherHtml, /id="duplicate-lesson"/);
assert.match(teacherHtml, /id="join-code"/);
assert.match(teacherHtml, /data-teacher-access-token/);
assert.match(teacherDashboardHtml, /expectedReviewVersion:row\.reviewVersion/);
assert.doesNotMatch(studentHtml, /assessment-criteria|rubric-high|API 키/);
assert.match(studentHtml, /class="learning-workspace"/);
assert.match(studentHtml, /data-panel="material"/);
assert.match(studentHtml, /id="definition-button"/);
assert.match(studentHtml, /id="join-code-input"/);
assert.match(studentClientHtml, /getLiteStudentBootstrap/);
assert.match(studentClientHtml, /startLiteStudentSession/);
assert.match(studentClientHtml, /submitLiteTurn/);
assert.match(studentClientHtml, /lessonIdentity\(\)/);
assert.match(studentClientHtml, /sessionStorage\.getItem\(key\)/);
assert.doesNotMatch(studentClientHtml, /localStorage/);
assert.match(studentClientHtml, /leaveDeviceSession/);
assert.match(studentClientHtml, /pendingRequest/);
assert.match(studentClientHtml, /saveStoredPendingRequest/);
assert.match(studentClientHtml, /retry-turn-button/);
assert.match(studentClientHtml, /window\.confirm/);
assert.match(studentHtml, /이름·주소·전화번호·계정정보/);
assert.match(studentHtml, /role="tablist"/);
assert.match(studentStylesHtml, /grid-template-columns:minmax\(0,42fr\) minmax\(0,58fr\)/);
assert.match(studentStylesHtml, /flex:1 1 0; overflow:hidden/);
assert.match(studentStylesHtml, /max-height:600px/);
assert.match(engineSource, /LITE_ENGINE_REQUESTS_PER_SESSION_/);
assert.match(engineSource, /trySaveLitePreparedResult_/);

console.log('gas-lite implementation checks: all passed');
