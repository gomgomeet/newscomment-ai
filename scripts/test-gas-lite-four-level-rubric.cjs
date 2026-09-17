/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

class Sheet {
  constructor() { this.rows = []; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return Math.max(0, ...this.rows.map((row) => row.length)); }
  getRange(row, column, rowCount = 1, columnCount = 1) {
    const getValues = () => Array.from({ length:rowCount }, (_, r) =>
      Array.from({ length:columnCount }, (_, c) => this.rows[row - 1 + r]?.[column - 1 + c] ?? ''));
    return {
      getValues,
      getDisplayValues:() => getValues().map((values) => values.map(String)),
      setValues:(values) => values.forEach((valuesRow, r) => {
        this.rows[row - 1 + r] ||= [];
        valuesRow.forEach((value, c) => { this.rows[row - 1 + r][column - 1 + c] = value; });
      }),
      clearContent:() => {
        for (let r = 0; r < rowCount; r += 1) {
          for (let c = 0; c < columnCount; c += 1) this.rows[row - 1 + r][column - 1 + c] = '';
        }
      }
    };
  }
  getDataRange() { return this.getRange(1, 1, this.getLastRow(), this.getLastColumn()); }
  clearContents() { this.rows = []; }
  setFrozenRows() {}
  autoResizeColumns() {}
}

const sheets = new Map();
const spreadsheet = {
  getId:() => 'synthetic-teacher-sheet',
  getSheetByName:(name) => sheets.get(name),
  insertSheet:(name) => { const sheet = new Sheet(); sheets.set(name, sheet); return sheet; }
};
const properties = new Map();
let nextUuid = 0;
const context = vm.createContext({
  console,
  SpreadsheetApp:{ getActiveSpreadsheet:() => spreadsheet, openById:() => spreadsheet },
  PropertiesService:{ getScriptProperties:() => ({
    getProperty:(key) => properties.get(key) || null,
    setProperty:(key, value) => properties.set(key, String(value)),
    deleteProperty:(key) => properties.delete(key)
  }) },
  Utilities:{
    Charset:{ UTF_8:'utf8' }, DigestAlgorithm:{ SHA_256:'sha256' },
    getUuid:() => `00000000-0000-4000-8000-${String(++nextUuid).padStart(12, '0')}`,
    computeDigest:(algorithm, value) => createHash(algorithm).update(value).digest(),
    base64EncodeWebSafe:(value) => Buffer.from(value).toString('base64url')
  },
  LockService:{ getScriptLock:() => ({ waitLock() {}, releaseLock() {} }) }
});
const root = path.resolve(__dirname, '..');
for (const name of ['SetupService', 'ConversationService', 'EngineClient', 'EvaluationService']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'gas-lite', `${name}.js`), 'utf8'), context);
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const legacy = {
  appName:'simbot', subject:'국어', grade:'초등 4학년', lessonTitle:'근거를 찾아 말하기', joinCode:'123456',
  lessonGoal:'자료의 근거를 찾아 설명한다.', achievementStandard:'사실을 찾아 자신의 생각을 설명한다.',
  assessmentCriteria:'자료의 근거와 자신의 의견을 연결한다.',
  rubricHigh:'근거를 정확하게 찾아 설명한다.', rubricMeet:'근거 일부를 찾아 설명한다.',
  rubricDeveloping:'근거를 찾는 데 도움이 필요하다.', evidenceDescription:'학생 질문과 답변의 근거',
  materialTitle:'학교의 음식 낭비 줄이기',
  materialText:'학교는 학생들이 반찬을 먹을 만큼 고르는 선택제를 실시했다. 학생들은 먹을 만큼만 받으면 다 먹기 쉽다는 것을 알게 되었다.',
  materialUrl:'', startQuestion:'글에서 궁금한 점은 무엇인가요?', activityMode:'evaluation', version:'v1'
};
const four = {
  ...legacy, rubricScheme:'four_levels', rubricHigh:'정확한 근거와 의견을 스스로 연결한다.',
  rubricGood:'자료의 근거를 찾아 의견을 설명한다.', rubricMeet:'안내를 받아 근거를 찾는다.',
  rubricDeveloping:'근거를 찾고 의견을 말하는 연습이 필요하다.'
};

// Add columns at the end: copied legacy sheets and their saved hashes/revisions stay intact.
context.ensureLiteWorkbook_(spreadsheet);
const lessonSheet = sheets.get('수업 자료');
const legacyHeaders = lessonSheet.rows[0].filter((name) => !['rubricScheme', 'rubricGood'].includes(name));
const originalHash = context.makeLiteSettingsHash_(legacy);
const legacyRow = { ...legacy, lessonId:'LESSON-OLD', lessonRevision:7, sourceHash:originalHash, updatedAt:'2026-09-01' };
lessonSheet.rows = [legacyHeaders.slice(), legacyHeaders.map((header) => legacyRow[header] || '')];
const originalCells = structuredClone(lessonSheet.rows[1]);
const reopened = context.readLiteTeacherSettings_();
assert.deepEqual(lessonSheet.rows[0].slice(0, legacyHeaders.length), legacyHeaders);
assert.deepEqual(lessonSheet.rows[0].slice(legacyHeaders.length), ['rubricScheme', 'rubricGood']);
assert.deepEqual(lessonSheet.rows[1], originalCells);
assert.equal(reopened.rubricScheme, 'legacy_three');
assert.equal(reopened.rubricHigh, legacy.rubricHigh);
assert.equal(reopened.sourceHash, originalHash);
assert.equal(reopened.lessonRevision, 7);
const unchanged = context.saveLiteTeacherSettings_(context.validateLiteTeacherSetup_(reopened));
assert.equal(unchanged.lessonRevision, 7);
assert.equal(unchanged.sourceHash, originalHash);

// Four levels require the additional descriptor, while exploration preserves optional drafts.
assert.equal(context.validateLiteTeacherSetup_(four).rubricGood, four.rubricGood);
assert.throws(() => context.validateLiteTeacherSetup_({ ...four, rubricGood:'' }), /잘함 수준/);
assert.throws(() => context.validateLiteTeacherSetup_({ ...four, rubricGood:'가'.repeat(1001) }), /1000자/);
assert.equal(context.validateLiteTeacherSetup_({ ...four, activityMode:'exploration', rubricGood:'' }).rubricGood, '');
assert.throws(() => context.validateLiteTeacherSetup_({ ...four, rubricScheme:'unknown' }), /평가 수준/);
assert.equal(context.buildLiteReadiness_({ ...four, rubricGood:'' }, {}).checks.find((row) => row.key === 'backwardDesign').state, 'block');
for (const singleAnchor of [{ ...four, lessonGoal:'' }, { ...four, achievementStandard:'' }]) {
  assert.doesNotThrow(() => context.validateLiteTeacherSetup_(singleAnchor));
  assert.equal(context.buildLiteReadiness_(singleAnchor, {}).checks.find((row) => row.key === 'backwardDesign').state, 'pass');
}
assert.throws(() => context.validateLiteTeacherSetup_({ ...four, lessonGoal:'', achievementStandard:'' }), /목표 또는 성취기준/);
assert.equal(context.buildLiteReadiness_({ ...four, lessonGoal:'', achievementStandard:'' }, {}).checks.find((row) => row.key === 'backwardDesign').state, 'block');

// Changing scheme/잘함 creates a new revision and invalidates prior preview verification.
const savedFour = context.saveLiteTeacherSettings_(context.validateLiteTeacherSetup_({ ...four, lessonId:reopened.lessonId }));
assert.equal(savedFour.lessonRevision, 8);
assert.notEqual(savedFour.sourceHash, originalHash);
properties.set('LITE_PREVIEW_ACCESS_TOKEN', 'old-preview-token');
properties.set('LITE_PREVIEW_ACCESS_LESSON', 'old-lesson');
const editedFour = context.saveLiteTeacherSettings_({ ...savedFour, rubricGood:'관련 근거를 정확하게 찾아 의견을 설명한다.' });
assert.equal(editedFour.lessonRevision, 9);
assert.notEqual(editedFour.sourceHash, savedFour.sourceHash);
assert.equal(properties.has('LITE_PREVIEW_ACCESS_TOKEN'), false);
assert.equal(context.readLiteTeacherSettings_().rubricGood, editedFour.rubricGood);
assert.equal(context.saveLiteTeacherSettings_(editedFour).lessonRevision, 9);

// Teacher-only fields reach the central engine but stay out of student bootstrap/settings.
const enginePayload = context.buildLiteEnginePayload_({ activityMode:'evaluation', message:'왜 그런가요?' }, editedFour, []);
assert.equal(enginePayload.lesson.rubricScheme, 'four_levels');
assert.equal(enginePayload.lesson.rubricGood, editedFour.rubricGood);
for (const visible of [context.sanitizeLiteSettingsForStudent_(editedFour), context.sanitizeLiteBootstrapForStudent_(editedFour)]) {
  for (const field of ['rubricScheme', 'rubricHigh', 'rubricGood', 'rubricMeet', 'rubricDeveloping']) {
    assert.equal(Object.hasOwn(visible, field), false);
  }
}

// A draft snapshots its own rubric scheme. The save endpoint ignores a spoofed payload scheme.
const token = context.getOrCreateLiteTeacherAccessToken_();
const turn = { studentCode:'99-998', sessionId:'S-four-rubric-test', requestId:'request-four-test', isPreview:false };
const observation = { primaryMove:'receive', sourceStatus:'supported', rubricScores:[{ criterionKey:'passage_comprehension', score:4, rationale:'자료에서 근거를 찾음' }] };
context.upsertLiteEvaluationDraft_(editedFour, turn, observation);
let dashboard = context.getLiteTeacherDashboardData(token);
assert.equal(dashboard.lesson.rubricGood, editedFour.rubricGood);
assert.deepEqual(plain(dashboard.teacherDecisionOptions), ['판단 보류', '매우잘함', '잘함', '보통', '노력요함']);
let row = dashboard.evaluations.find((entry) => entry.sessionId === turn.sessionId);
assert.equal(row.rubricScheme, 'four_levels');
assert.match(row.automaticJudgment, /공통 질문행동 관찰 · 평균 4\/5 · 교사 기준 판단 전/);
assert.deepEqual(plain(row.teacherDecisionOptions), plain(dashboard.teacherDecisionOptions));
const review = { ...row, expectedReviewVersion:row.reviewVersion, teacherDecision:'잘함', teacherFeedback:'자료의 근거를 찾았어요.', improvementSuggestion:'다른 근거도 찾아 보세요.', finalStatus:'최종 확정' };
context.saveLiteTeacherEvaluation(token, { ...review, rubricScheme:'legacy_three' });
row = context.getLiteTeacherDashboardData(token).evaluations.find((entry) => entry.sessionId === turn.sessionId);
assert.equal(row.teacherDecision, '잘함');
assert.equal(row.rubricScheme, 'four_levels');
assert.throws(() => context.saveLiteTeacherEvaluation(token, { ...review, expectedReviewVersion:row.reviewVersion, teacherDecision:'도달' }), /저장된 수준/);
context.upsertLiteEvaluationDraft_(editedFour, { ...turn, requestId:'request-second-test' }, observation);
row = context.getLiteTeacherDashboardData(token).evaluations.find((entry) => entry.sessionId === turn.sessionId);
assert.equal(row.teacherDecision, '잘함');
assert.equal(row.finalStatus, '재검수 필요');

// Historical three-level decisions remain three-level, even after the active lesson changes.
const evaluations = sheets.get('교사 평가');
const headers = evaluations.rows[0];
const oldEvaluation = { studentCode:'99-997', sessionId:'S-old-rubric-test', lessonId:reopened.lessonId, lessonRevision:7, teacherDecision:'성장 중', finalStatus:'검수 중' };
evaluations.rows.push(headers.map((header) => oldEvaluation[header] || ''));
const oldVersion = context.liteEvaluationReviewVersion_(oldEvaluation);
const oldReview = { ...oldEvaluation, expectedReviewVersion:oldVersion, teacherFeedback:'', improvementSuggestion:'' };
assert.throws(() => context.saveLiteTeacherEvaluation(token, { ...oldReview, rubricScheme:'four_levels', teacherDecision:'잘함' }), /저장된 수준/);
context.saveLiteTeacherEvaluation(token, { ...oldReview, rubricScheme:'four_levels' });
const oldSaved = context.liteRowsAsObjects_(evaluations).find((entry) => entry.sessionId === oldEvaluation.sessionId);
assert.equal(oldSaved.teacherDecision, '성장 중');
assert.equal(oldSaved.rubricScheme, 'legacy_three');
assert.equal(oldSaved.lessonRevision, 7);

console.log('gas-lite four-level rubric checks: all passed');
