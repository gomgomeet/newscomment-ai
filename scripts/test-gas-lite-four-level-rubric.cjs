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
const fourAssessmentCriterion = {
  id:'food-waste-reason',
  criterion:'자료의 근거와 의견 연결하기',
  responseKind:'explanation',
  mainQuestion:legacy.startQuestion,
  followUpQuestion:'그 생각의 근거가 되는 문장을 자료에서 찾아 줄래요?',
  evidenceDescription:'음식 낭비를 줄이는 방법과 이유를 자료 근거로 설명한 학생 답변',
  sourceQuote:'학생들이 반찬을 먹을 만큼 고르는 선택제를 실시했다.',
  requireSourceEvidence:true
};
const fourAssessmentPlan = { schemaVersion:1, approved:true, criteria:[fourAssessmentCriterion] };
const four = {
  ...legacy, assessmentPlanJson:JSON.stringify(fourAssessmentPlan),
  rubricScheme:'four_levels', rubricHigh:'정확한 근거와 의견을 스스로 연결한다.',
  rubricGood:'자료의 근거를 찾아 의견을 설명한다.', rubricMeet:'안내를 받아 근거를 찾는다.',
  rubricDeveloping:'근거를 찾고 의견을 말하는 연습이 필요하다.'
};

// Add columns at the end: copied legacy sheets and their saved hashes/revisions stay intact.
context.ensureLiteWorkbook_(spreadsheet);
const lessonSheet = sheets.get('수업 자료');
const legacyHeaders = lessonSheet.rows[0].filter((name) => !['rubricScheme', 'rubricGood', 'expectedAnswer', 'assessmentEvidence', 'rubricBeginning', 'answerExamples'].includes(name));
const originalHash = context.makeLiteSettingsHash_(legacy);
const legacyRow = { ...legacy, lessonId:'LESSON-OLD', lessonRevision:7, sourceHash:originalHash, updatedAt:'2026-09-01' };
lessonSheet.rows = [legacyHeaders.slice(), legacyHeaders.map((header) => legacyRow[header] || '')];
const originalCells = structuredClone(lessonSheet.rows[1]);
const reopened = context.readLiteTeacherSettings_();
assert.deepEqual(lessonSheet.rows[0].slice(0, legacyHeaders.length), legacyHeaders);
assert.deepEqual(lessonSheet.rows[0].slice(legacyHeaders.length), ['rubricScheme', 'rubricGood', 'expectedAnswer', 'assessmentEvidence', 'rubricBeginning', 'answerExamples']);
assert.deepEqual(lessonSheet.rows[1], originalCells);
assert.equal(reopened.rubricScheme, 'legacy_three');
assert.equal(reopened.rubricHigh, legacy.rubricHigh);
assert.equal(reopened.sourceHash, originalHash);
assert.equal(reopened.lessonRevision, 7);
assert.throws(() => context.validateLiteTeacherSetup_(reopened), /질문계획을 하나 이상/);
const unchanged = context.saveLiteTeacherSettings_(reopened);
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
  for (const field of ['rubricScheme', 'rubricHigh', 'rubricGood', 'rubricMeet', 'rubricDeveloping', 'rubricBeginning']) {
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

// Appending teacher-only assessment guidance and the criterion plan also preserves the existing 25-column workbook.
const previousHeaders = lessonSheet.rows[0].filter((name) => ![
  'expectedAnswer', 'assessmentEvidence', 'rubricBeginning', 'answerExamples', 'assessmentPlanJson',
].includes(name));
assert.equal(previousHeaders.length, 25);
lessonSheet.rows = [previousHeaders.slice(), previousHeaders.map((header) => editedFour[header] ?? '')];
const previousCells = structuredClone(lessonSheet.rows[1]);
const priorFour = context.readLiteTeacherSettings_();
assert.deepEqual(lessonSheet.rows[0].slice(0, 25), previousHeaders);
assert.deepEqual(lessonSheet.rows[0].slice(25), [
  'expectedAnswer', 'assessmentEvidence', 'rubricBeginning', 'answerExamples', 'assessmentPlanJson',
]);
assert.deepEqual(plain(lessonSheet.rows[1]), plain(previousCells));
assert.equal(priorFour.expectedAnswer, '');
assert.equal(priorFour.assessmentEvidence, '');
assert.equal(priorFour.sourceHash, editedFour.sourceHash);
assert.throws(() => context.validateLiteTeacherSetup_(priorFour), /질문계획을 하나 이상/);
assert.equal(context.makeLiteSettingsHash_({ ...priorFour, expectedAnswer:undefined, assessmentEvidence:undefined }),
  context.makeLiteSettingsHash_({ ...priorFour, expectedAnswer:'', assessmentEvidence:'' }));

const guidance = {
  ...priorFour, expectedAnswer:'선택제로 학생들이 먹을 만큼 받을 수 있게 되어 남기는 음식이 줄었다.',
  assessmentEvidence:'학생들은 먹을 만큼만 받으면 다 먹기 쉽다는 것을 알게 되었다.',
  assessmentPlanJson:editedFour.assessmentPlanJson
};
for (const activityMode of ['evaluation', 'exploration']) {
  const normalizedGuide = context.validateLiteTeacherSetup_({ ...guidance, activityMode });
  assert.equal(normalizedGuide.expectedAnswer, guidance.expectedAnswer);
  assert.equal(normalizedGuide.assessmentEvidence, guidance.assessmentEvidence);
  assert.throws(() => context.validateLiteTeacherSetup_({ ...guidance, activityMode, expectedAnswer:'가'.repeat(1501) }), /1500자/);
  assert.throws(() => context.validateLiteTeacherSetup_({ ...guidance, activityMode, assessmentEvidence:'가'.repeat(1001) }), /1000자/);
}
properties.set('LITE_PREVIEW_ACCESS_TOKEN', 'preview-before-assessment-guidance');
const savedGuidance = context.saveLiteTeacherSettings_(context.validateLiteTeacherSetup_(guidance));
assert.equal(savedGuidance.lessonRevision, priorFour.lessonRevision + 1);
assert.notEqual(savedGuidance.sourceHash, priorFour.sourceHash);
assert.equal(properties.has('LITE_PREVIEW_ACCESS_TOKEN'), false);
assert.equal(context.readLiteTeacherSettings_().expectedAnswer, guidance.expectedAnswer);
assert.equal(context.readLiteTeacherSettings_().assessmentEvidence, guidance.assessmentEvidence);
assert.equal(context.saveLiteTeacherSettings_(savedGuidance).lessonRevision, savedGuidance.lessonRevision);
for (const field of ['expectedAnswer', 'assessmentEvidence']) {
  assert.notEqual(context.makeLiteSettingsHash_({ ...savedGuidance, [field]:savedGuidance[field] + ' 수정' }), savedGuidance.sourceHash);
  for (const visible of [context.sanitizeLiteSettingsForStudent_(savedGuidance), context.sanitizeLiteBootstrapForStudent_(savedGuidance)]) {
    assert.equal(Object.hasOwn(visible, field), false);
  }
}
const assessmentPayload = context.buildLiteEnginePayload_({ activityMode:'evaluation', message:'이유가 무엇인가요?' }, savedGuidance, []);
assert.equal(Object.hasOwn(assessmentPayload.lesson, 'expectedAnswer'), false);
assert.equal(Object.hasOwn(assessmentPayload.lesson, 'assessmentEvidence'), false);

// The teacher sees only the response immediately following this exact lesson/session's seed.
const assessedTurn = { ...turn, sessionId:'S-assessment-answer', requestId:'request-assessment-answer' };
const unansweredTurn = { ...turn, studentCode:'99-996', sessionId:'S-assessment-unanswered', requestId:'request-assessment-unanswered' };
context.upsertLiteEvaluationDraft_(savedGuidance, assessedTurn, observation);
context.upsertLiteEvaluationDraft_(savedGuidance, unansweredTurn, observation);
const qaSheet = sheets.get('질문과 답변');
const qaHeaders = qaSheet.rows[0];
const qaBase = {
  lessonId:savedGuidance.lessonId, lessonRevision:savedGuidance.lessonRevision,
  studentCode:assessedTurn.studentCode, sessionId:assessedTurn.sessionId,
  speaker:'student', turnNo:2, engineStatus:'finalized', isPreview:false
};
const assessmentText = '먹을 만큼만 받으면 다 먹기 쉬워서 음식 낭비가 줄어듭니다.';
[
  { ...qaBase, lessonRevision:savedGuidance.lessonRevision - 1, text:'이전 개정 답변' },
  { ...qaBase, lessonId:'LESSON-OTHER', text:'다른 수업 답변' },
  { ...qaBase, isPreview:true, text:'교사 미리보기 답변' },
  { ...qaBase, isPreview:'TRUE', text:'문자열 미리보기 답변' },
  { ...qaBase, engineStatus:'engine_failed:timeout', text:'실패한 요청' },
  { ...qaBase, studentCode:'99-995', text:'다른 학생 답변' },
  { ...qaBase, sessionId:'S-other-session', text:'다른 접속의 답변' },
  { ...qaBase, speaker:'bot', turnNo:1, managedKind:'start', engineStatus:'seeded_start', text:savedGuidance.startQuestion },
  { ...qaBase, turnNo:4, text:'두 번째 학생 답변' },
  { ...qaBase, turnNo:2, text:assessmentText }
].forEach((entry) => qaSheet.rows.push(qaHeaders.map((header) => entry[header] ?? '')));
const assessmentDashboard = context.getLiteTeacherDashboardData(token);
const assessedRow = assessmentDashboard.evaluations.find((entry) => entry.sessionId === assessedTurn.sessionId);
assert.equal(assessedRow.assessmentResponse, assessmentText);
assert.equal(assessedRow.teacherDecision, '판단 보류');
assert.equal(assessmentDashboard.evaluations.find((entry) => entry.sessionId === unansweredTurn.sessionId).assessmentResponse, '');
assert.equal(assessmentDashboard.lesson.startQuestion, savedGuidance.startQuestion);
assert.equal(assessmentDashboard.lesson.expectedAnswer, guidance.expectedAnswer);
assert.equal(assessmentDashboard.lesson.assessmentEvidence, guidance.assessmentEvidence);
const responseIndex = qaSheet.rows.findIndex((entry) => entry[qaHeaders.indexOf('text')] === assessmentText);
qaSheet.rows[responseIndex][qaHeaders.indexOf('turnNo')] = 6;
assert.equal(context.getLiteTeacherDashboardData(token).evaluations.find((entry) => entry.sessionId === assessedTurn.sessionId).assessmentResponse, '');
qaSheet.rows[responseIndex][qaHeaders.indexOf('turnNo')] = 2;
const seedIndex = qaSheet.rows.findIndex((entry) => entry[qaHeaders.indexOf('engineStatus')] === 'seeded_start');
qaSheet.rows[seedIndex][qaHeaders.indexOf('text')] = '다른 시작 질문';
assert.equal(context.getLiteTeacherDashboardData(token).evaluations.find((entry) => entry.sessionId === assessedTurn.sessionId).assessmentResponse, '');
qaSheet.rows[seedIndex][qaHeaders.indexOf('text')] = savedGuidance.startQuestion;
qaSheet.rows[responseIndex][qaHeaders.indexOf('text')] = '가'.repeat(900);
assert.equal(context.getLiteTeacherDashboardData(token).evaluations.find((entry) => entry.sessionId === assessedTurn.sessionId).assessmentResponse.length, 800);
qaSheet.rows[responseIndex][qaHeaders.indexOf('text')] = assessmentText;
const expectedColumn = lessonSheet.rows[0].indexOf('expectedAnswer');
const evidenceColumn = lessonSheet.rows[0].indexOf('assessmentEvidence');
lessonSheet.rows[1][expectedColumn] = '';
lessonSheet.rows[1][evidenceColumn] = '';
assert.equal(context.getLiteTeacherDashboardData(token).evaluations.find((entry) => entry.sessionId === assessedTurn.sessionId).assessmentResponse, '');
lessonSheet.rows[1][expectedColumn] = guidance.expectedAnswer;
lessonSheet.rows[1][evidenceColumn] = guidance.assessmentEvidence;

// An initial assessment answer is reviewable even when the common conversation rubric has no score.
const initialTurn = {
  studentCode:'99-994', sessionId:'S-zero-score-assessment', requestId:'request-zero-score-assessment',
  isPreview:false, activityMode:'evaluation'
};
const initialAnswer = '먹을 만큼 받으면 남기는 음식이 줄어들기 때문이에요.';
const zeroObservation = {
  primaryMove:'receive', sourceStatus:'supported', responseScore:null,
  rubricScores:['questioning', 'passage_comprehension', 'achievement_standard', 'reflection_opinion']
    .map((criterionKey) => ({ criterionKey, score:0, rationale:'아직 관찰하지 않음' }))
};
[
  { ...qaBase, ...initialTurn, speaker:'bot', turnNo:1, managedKind:'start', engineStatus:'seeded_start', text:savedGuidance.startQuestion },
  { ...qaBase, ...initialTurn, speaker:'student', turnNo:2, text:initialAnswer }
].forEach((entry) => qaSheet.rows.push(qaHeaders.map((header) => entry[header] ?? '')));
const initialDraft = context.upsertLiteEvaluationDraft_(savedGuidance, initialTurn, zeroObservation);
assert.equal(initialDraft.teacherDecision, '판단 보류');
assert.equal(initialDraft.finalStatus, '검수 필요');
assert.equal(initialDraft.automaticJudgment, '시작 질문 응답 수집 · 교사 기준 판단 전');
assert.match(initialDraft.evidenceSummary, /먹을 만큼 받으면/);
assert.equal(initialDraft.evidenceRequestIds, initialTurn.requestId);
let initialReview = context.getLiteTeacherDashboardData(token).evaluations.find((entry) => entry.sessionId === initialTurn.sessionId);
assert.equal(initialReview.assessmentResponse, initialAnswer);
for (const field of ['questioningBest', 'passageComprehensionBest', 'achievementStandardBest', 'reflectionOpinionBest']) {
  assert.equal(initialReview[field], '');
}
context.saveLiteTeacherEvaluation(token, {
  ...initialReview, expectedReviewVersion:initialReview.reviewVersion, teacherDecision:'잘함',
  teacherFeedback:'자료의 이유를 자기 말로 설명했어요.', improvementSuggestion:'근거 문장도 찾아 보세요.', finalStatus:'최종 확정'
});
context.upsertLiteEvaluationDraft_(savedGuidance, initialTurn, zeroObservation);
initialReview = context.getLiteTeacherDashboardData(token).evaluations.find((entry) => entry.sessionId === initialTurn.sessionId);
assert.equal(initialReview.teacherDecision, '잘함');
assert.equal(initialReview.finalStatus, '최종 확정');
const zeroRowsBefore = sheets.get('교사 평가').rows.length;
[
  [{ ...initialTurn, isPreview:true }, zeroObservation],
  [{ ...initialTurn, activityMode:'exploration' }, zeroObservation],
  [initialTurn, { ...zeroObservation, safetyFlag:true }],
  [initialTurn, { ...zeroObservation, primaryMove:'repair' }],
  [initialTurn, { ...zeroObservation, isClosing:true }],
  [{ ...initialTurn, requestId:'different-request' }, zeroObservation],
  [{ ...initialTurn, sessionId:'missing-session' }, zeroObservation]
].forEach(([candidateTurn, candidateObservation]) => {
  assert.equal(context.upsertLiteEvaluationDraft_(savedGuidance, candidateTurn, candidateObservation), null);
});
const initialStudentIndex = qaSheet.rows.findIndex((entry) => entry[qaHeaders.indexOf('text')] === initialAnswer);
qaSheet.rows[initialStudentIndex][qaHeaders.indexOf('engineStatus')] = 'engine_failed:timeout';
assert.equal(context.upsertLiteEvaluationDraft_(savedGuidance, initialTurn, zeroObservation), null);
qaSheet.rows[initialStudentIndex][qaHeaders.indexOf('engineStatus')] = 'finalized';
qaSheet.rows[initialStudentIndex][qaHeaders.indexOf('turnNo')] = 4;
assert.equal(context.upsertLiteEvaluationDraft_(savedGuidance, initialTurn, zeroObservation), null);
qaSheet.rows[initialStudentIndex][qaHeaders.indexOf('turnNo')] = 2;
assert.equal(context.upsertLiteEvaluationDraft_({ ...savedGuidance, lessonRevision:savedGuidance.lessonRevision - 1 }, initialTurn, zeroObservation), null);
assert.equal(sheets.get('교사 평가').rows.length, zeroRowsBefore);

const copiedGuidance = context.saveLiteTeacherSettings_(savedGuidance, { newLesson:true });
assert.notEqual(copiedGuidance.lessonId, savedGuidance.lessonId);
assert.equal(copiedGuidance.expectedAnswer, guidance.expectedAnswer);
assert.equal(copiedGuidance.assessmentEvidence, guidance.assessmentEvidence);

// Only extract existing codes: retain the full visible standard and repair duplicate legacy text.
const fullStandard = '[4국02-04] 글에 드러난 사실을 찾아 자신의 생각을 설명한다.';
assert.deepEqual(plain(context.normalizeLiteAchievementStandard_(fullStandard, fullStandard)), {
  achievementStandard:fullStandard, achievementStandardCode:'[4국02-04]'
});
const oldFullStandard = '글에 드러난 사실과 근거를 바탕으로 자신의 의견을 알맞게 설명한다. '.repeat(3).trim();
assert.deepEqual(plain(context.normalizeLiteAchievementStandard_(oldFullStandard, oldFullStandard.slice(0, 80))), {
  achievementStandard:oldFullStandard, achievementStandardCode:''
});
assert.deepEqual(plain(context.normalizeLiteAchievementStandard_('', fullStandard)), {
  achievementStandard:fullStandard, achievementStandardCode:'[4국02-04]'
});
assert.deepEqual(plain(context.normalizeLiteAchievementStandard_('[점검용 기술형 기준] 자료의 사실을 파악한다.', '')), {
  achievementStandard:'[점검용 기술형 기준] 자료의 사실을 파악한다.', achievementStandardCode:''
});
assert.equal(context.validateLiteTeacherSetup_({ ...four, achievementStandard:fullStandard, achievementStandardCode:fullStandard }).achievementStandardCode, '[4국02-04]');
assert.equal(context.liteAchievementStandardContent_('[4사08-02]'), '');
assert.throws(() => context.validateLiteTeacherSetup_({ ...four, lessonGoal:'', achievementStandard:'[4사08-02]' }), /목표 또는 성취기준/);
assert.equal(context.buildLiteReadiness_({ ...four, lessonGoal:'', achievementStandard:'[4사08-02]' }, {}).checks.find((entry) => entry.key === 'backwardDesign').state, 'block');
assert.equal(context.liteAchievementStandardContent_(fullStandard), '글에 드러난 사실을 찾아 자신의 생각을 설명한다.');

// A fifth level and criterion plan append columns without reinterpreting saved three/four-level rows.
const old27Headers = lessonSheet.rows[0].filter((name) => ![
  'rubricBeginning', 'answerExamples', 'assessmentPlanJson',
].includes(name));
assert.equal(old27Headers.length, 27);
lessonSheet.rows = [old27Headers.slice(), old27Headers.map((header) => copiedGuidance[header] ?? '')];
const old27Cells = plain(lessonSheet.rows[1]);
const reloaded27 = context.readLiteTeacherSettings_();
assert.deepEqual(lessonSheet.rows[0].slice(0, 27), old27Headers);
assert.deepEqual(lessonSheet.rows[0].slice(27), ['rubricBeginning', 'answerExamples', 'assessmentPlanJson']);
assert.deepEqual(plain(lessonSheet.rows[1]), old27Cells);
assert.equal(reloaded27.rubricBeginning, '');
assert.equal(reloaded27.sourceHash, copiedGuidance.sourceHash);
assert.throws(() => context.validateLiteTeacherSetup_(reloaded27), /질문계획을 하나 이상/);
for (const settings of [legacy, four, copiedGuidance]) {
  assert.equal(context.makeLiteSettingsHash_(settings), context.makeLiteSettingsHash_({ ...settings, rubricBeginning:'' }));
}
const five = {
  ...reloaded27,
  assessmentPlanJson:copiedGuidance.assessmentPlanJson,
  rubricScheme:'five_levels',
  rubricBeginning:'자료를 함께 읽고 근거를 찾는 순서부터 연습한다.'
};
assert.equal(context.validateLiteTeacherSetup_(five).rubricBeginning, five.rubricBeginning);
for (const [field, label] of [['rubricHigh', 'A'], ['rubricGood', 'B'], ['rubricMeet', 'C'], ['rubricDeveloping', 'D'], ['rubricBeginning', 'E']]) {
  assert.throws(() => context.validateLiteTeacherSetup_({ ...five, [field]:'' }), new RegExp(label + ' 수준 기준'));
}
assert.doesNotThrow(() => context.validateLiteTeacherSetup_({ ...five, rubricScheme:'four_levels', rubricBeginning:'' }));
assert.doesNotThrow(() => context.validateLiteTeacherSetup_({ ...five, rubricScheme:'legacy_three', rubricGood:'', rubricBeginning:'' }));
for (const rubricScheme of ['legacy_three', 'four_levels', 'five_levels']) {
  for (const activityMode of ['evaluation', 'exploration']) {
    assert.throws(() => context.validateLiteTeacherSetup_({ ...five, rubricScheme, activityMode, rubricBeginning:'가'.repeat(1001) }), /1000자/);
  }
}
const noFiveDesign = { ...five, activityMode:'exploration', rubricHigh:'', rubricGood:'', rubricMeet:'', rubricDeveloping:'', rubricBeginning:'' };
assert.doesNotThrow(() => context.validateLiteTeacherSetup_(noFiveDesign));
assert.equal(context.buildLiteReadiness_(noFiveDesign, {}).checks.find((entry) => entry.key === 'backwardDesign').state, 'pass');
assert.equal(context.buildLiteReadiness_({ ...five, rubricBeginning:'' }, {}).checks.find((entry) => entry.key === 'backwardDesign').state, 'block');
assert.equal(context.buildLiteReadiness_(five, {}).checks.find((entry) => entry.key === 'backwardDesign').state, 'pass');
assert.notEqual(context.makeLiteSettingsHash_({ ...noFiveDesign, rubricScheme:'four_levels' }), context.makeLiteSettingsHash_(noFiveDesign));
properties.set('LITE_PREVIEW_ACCESS_TOKEN', 'before-five-level-preview');
const savedFive = context.saveLiteTeacherSettings_(context.validateLiteTeacherSetup_(five));
assert.equal(savedFive.lessonRevision, reloaded27.lessonRevision + 1);
assert.notEqual(savedFive.sourceHash, reloaded27.sourceHash);
assert.equal(properties.has('LITE_PREVIEW_ACCESS_TOKEN'), false);
assert.equal(context.readLiteTeacherSettings_().rubricBeginning, five.rubricBeginning);
assert.notEqual(context.makeLiteSettingsHash_({ ...savedFive, rubricBeginning:five.rubricBeginning + ' 수정' }), savedFive.sourceHash);
assert.equal(context.saveLiteTeacherSettings_(savedFive).lessonRevision, savedFive.lessonRevision);
for (const publicSettings of [context.sanitizeLiteSettingsForStudent_(savedFive), context.sanitizeLiteBootstrapForStudent_(savedFive)]) {
  assert.equal(Object.hasOwn(publicSettings, 'rubricBeginning'), false);
  assert.equal(JSON.stringify(publicSettings).includes(five.rubricBeginning), false);
}
assert.equal(context.buildLiteEnginePayload_({ activityMode:'evaluation' }, savedFive, []).lesson.rubricBeginning, five.rubricBeginning);
assert.equal(context.buildLiteEnginePayload_({ activityMode:'exploration' }, savedFive, []).lesson.rubricBeginning, '');
const fiveTurn = { ...turn, sessionId:'S-five-level-assessment', requestId:'request-five-level-assessment', activityMode:'evaluation' };
context.upsertLiteEvaluationDraft_(savedFive, fiveTurn, observation);
const fiveDashboard = context.getLiteTeacherDashboardData(token);
let fiveRow = fiveDashboard.evaluations.find((entry) => entry.sessionId === fiveTurn.sessionId);
assert.deepEqual(plain(fiveRow.teacherDecisionOptions), ['판단 보류', 'A', 'B', 'C', 'D', 'E']);
assert.equal(fiveRow.rubricScheme, 'five_levels');
assert.match(fiveRow.automaticJudgment, /^공통 질문행동 관찰 · 평균 4\/5/);
assert.doesNotMatch(fiveRow.automaticJudgment, /도달|성장 중|도움 필요/);
const fiveReview = { ...fiveRow, expectedReviewVersion:fiveRow.reviewVersion, teacherDecision:'E', teacherFeedback:'자료를 함께 읽으며 핵심을 찾아봅시다.', improvementSuggestion:'첫 문장에서 중요한 말을 골라 보세요.', finalStatus:'최종 확정' };
for (const teacherDecision of ['A', 'B', 'C', 'D', 'E']) {
  assert.doesNotThrow(() => context.validateLiteTeacherEvaluation_({ ...fiveReview, teacherDecision }, 'five_levels'));
}
for (const teacherDecision of ['매우잘함', '잘함', '보통', '노력요함', '많은 노력요함', '도달']) {
  assert.throws(() => context.validateLiteTeacherEvaluation_({ ...fiveReview, teacherDecision }, 'five_levels'), /저장된 수준/);
}
assert.throws(() => context.validateLiteTeacherEvaluation_(fiveReview, 'four_levels'), /저장된 수준/);
assert.throws(() => context.validateLiteTeacherEvaluation_(fiveReview, 'legacy_three'), /저장된 수준/);
context.saveLiteTeacherEvaluation(token, { ...fiveReview, rubricScheme:'legacy_three' });
fiveRow = context.getLiteTeacherDashboardData(token).evaluations.find((entry) => entry.sessionId === fiveTurn.sessionId);
assert.equal(fiveRow.teacherDecision, 'E');
assert.equal(fiveRow.rubricScheme, 'five_levels');
const switchedFour = context.saveLiteTeacherSettings_(context.validateLiteTeacherSetup_({ ...savedFive, rubricScheme:'four_levels' }));
assert.equal(switchedFour.rubricBeginning, five.rubricBeginning, 'Hidden fifth descriptor remains available if the teacher switches back');
assert.equal(switchedFour.lessonRevision, savedFive.lessonRevision + 1);
assert.equal(context.getLiteTeacherDashboardData(token).evaluations.some((entry) => entry.sessionId === fiveTurn.sessionId), false);
context.saveLiteTeacherEvaluation(token, { ...fiveReview, expectedReviewVersion:fiveRow.reviewVersion });
assert.equal(context.liteRowsAsObjects_(sheets.get('교사 평가')).find((entry) => entry.sessionId === fiveTurn.sessionId).teacherDecision, 'E');

// Optional teacher answer patterns and criterion plans append after all 28 existing columns and preserve older hashes.
const old28Headers = lessonSheet.rows[0].filter((name) => !['answerExamples', 'assessmentPlanJson'].includes(name));
assert.equal(old28Headers.length, 28);
lessonSheet.rows = [old28Headers.slice(), old28Headers.map((header) => switchedFour[header] ?? '')];
const old28Cells = plain(lessonSheet.rows[1]);
const previousStudentRecords = JSON.stringify([sheets.get('학생별 현황').rows, sheets.get('질문과 답변').rows, sheets.get('교사 평가').rows]);
const reloaded28 = context.readLiteTeacherSettings_();
assert.deepEqual(lessonSheet.rows[0].slice(0, 28), old28Headers);
assert.deepEqual(lessonSheet.rows[0].slice(28), ['answerExamples', 'assessmentPlanJson']);
assert.deepEqual(plain(lessonSheet.rows[1]), old28Cells);
assert.equal(reloaded28.answerExamples, '');
assert.equal(reloaded28.sourceHash, switchedFour.sourceHash);
assert.throws(() => context.validateLiteTeacherSetup_(reloaded28), /질문계획을 하나 이상/);
for (const settings of [legacy, four, savedFive, switchedFour]) {
  assert.equal(context.makeLiteSettingsHash_(settings), context.makeLiteSettingsHash_({ ...settings, answerExamples:'' }));
}
const answerExamples = '근거와 이유 연결: 먹을 만큼 받으면 남기는 음식이 줄어들기 때문이에요.\n일부만 설명: 남는 음식이 줄었어요.\n근거 없이 추측: 급식 메뉴가 바뀌었기 때문이에요.';
const answerExampleBase = { ...reloaded28, assessmentPlanJson:switchedFour.assessmentPlanJson };
for (const activityMode of ['evaluation', 'exploration']) {
  assert.equal(context.validateLiteTeacherSetup_({ ...answerExampleBase, activityMode, answerExamples }).answerExamples, answerExamples);
  assert.equal(context.validateLiteTeacherSetup_({ ...answerExampleBase, activityMode, answerExamples:'가'.repeat(3500) }).answerExamples.length, 3500);
  assert.throws(() => context.validateLiteTeacherSetup_({ ...answerExampleBase, activityMode, answerExamples:'가'.repeat(3501) }), /3500자/);
}
assert.throws(() => context.saveLiteTeacherSettings_({ ...reloaded28, answerExamples:'가'.repeat(3501) }), /3500자/);
properties.set('LITE_PREVIEW_ACCESS_TOKEN', 'before-answer-patterns');
const savedPatterns = context.saveLiteTeacherSettings_(context.validateLiteTeacherSetup_({ ...answerExampleBase, answerExamples }));
assert.equal(savedPatterns.lessonRevision, reloaded28.lessonRevision + 1);
assert.notEqual(savedPatterns.sourceHash, reloaded28.sourceHash);
assert.equal(properties.has('LITE_PREVIEW_ACCESS_TOKEN'), false);
assert.equal(context.readLiteTeacherSettings_().answerExamples, answerExamples);
assert.equal(context.saveLiteTeacherSettings_(savedPatterns).lessonRevision, savedPatterns.lessonRevision);
for (const field of ['startQuestion', 'expectedAnswer', 'assessmentEvidence', 'assessmentCriteria', 'rubricScheme', 'rubricHigh', 'rubricGood', 'rubricMeet', 'rubricDeveloping', 'rubricBeginning']) {
  assert.equal(savedPatterns[field], reloaded28[field], 'Saving answer examples must not replace teacher-authored question/key/evidence/rubrics');
}
assert.equal(context.getLiteTeacherDashboardData(token).lesson.answerExamples, answerExamples);
for (const publicSettings of [context.sanitizeLiteSettingsForStudent_(savedPatterns), context.sanitizeLiteBootstrapForStudent_(savedPatterns)]) {
  assert.equal(Object.hasOwn(publicSettings, 'answerExamples'), false);
  assert.equal(JSON.stringify(publicSettings).includes(answerExamples), false);
}
for (const activityMode of ['evaluation', 'exploration']) {
  const payload = context.buildLiteEnginePayload_({ activityMode }, savedPatterns, []);
  assert.equal(Object.hasOwn(payload.lesson, 'answerExamples'), false);
  assert.equal(JSON.stringify(payload).includes(answerExamples), false);
}
const copiedPatterns = context.saveLiteTeacherSettings_(savedPatterns, { newLesson:true });
assert.notEqual(copiedPatterns.lessonId, savedPatterns.lessonId);
assert.equal(copiedPatterns.answerExamples, answerExamples);
assert.equal(copiedPatterns.expectedAnswer, reloaded28.expectedAnswer);
assert.equal(copiedPatterns.assessmentEvidence, reloaded28.assessmentEvidence);
const clearedPatterns = context.saveLiteTeacherSettings_({ ...copiedPatterns, answerExamples:'' });
assert.equal(clearedPatterns.answerExamples, '');
assert.equal(clearedPatterns.sourceHash, context.makeLiteSettingsHash_(answerExampleBase));
assert.equal(clearedPatterns.lessonRevision, copiedPatterns.lessonRevision + 1);
assert.equal(JSON.stringify([sheets.get('학생별 현황').rows, sheets.get('질문과 답변').rows, sheets.get('교사 평가').rows]), previousStudentRecords);

console.log('gas-lite rubric storage checks (3/4/5 levels and private answer patterns): all passed');
