/** 교사 전용 실측 도구. 학생 처리 코드는 그대로 사용하고 기록은 복사본에 격리합니다. */
const LOAD_TEST_COLUMNS_ = ['index','startedAtMs','finishedAtMs','elapsedMs','bootstrapMs','questionMs','lockWaitMs','lockCalls','sessionId','ok','aiStatus','error'];

function showClassroomLoadTest() {
  requireTeacherMenuContext_();
  const template = HtmlService.createTemplateFromFile('LoadTestPanel');
  template.teacherAccessToken = getOrCreateTeacherAccessToken_();
  SpreadsheetApp.getUi().showModalDialog(template.evaluate().setWidth(1050).setHeight(720), '학급 동시 접속 시험');
}

function prepareClassroomLoadTest(token, count, questions) {
  assertTeacherAccess_(token);
  count = Number(count);
  if ([3,10,30].indexOf(count) < 0) throw new Error('시험 인원은 3, 10, 30명입니다.');
  const prompts = String(questions || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
  if (!prompts.length || prompts.length > 5 || prompts.some(function (s) { return s.length > 500; })) throw new Error('시험 질문을 1~5개, 각 500자 이내로 입력하세요.');
  ensureRuntimeSchema_();
  const source = getSpreadsheet_();
  const runId = Utilities.getUuid();
  const copy = source.copy('질문 챗봇 · 부하 시험 ' + count + '명 · ' + new Date().toISOString());
  const resultSheet = copy.insertSheet('LOAD_TEST_RESULTS');
  resultSheet.getRange(1,1,1,LOAD_TEST_COLUMNS_.length).setValues([LOAD_TEST_COLUMNS_]);
  const config = readConfig_();
  const run = { runId:runId, sheetId:copy.getId(), count:count, questions:prompts, createdAt:Date.now(),
    aiEnabled:isTruthy_(config.AI_ENABLED), model:getAISettings_(config).qualityModel };
  PropertiesService.getScriptProperties().setProperty('CLASSROOM_LOAD_TEST', JSON.stringify(run));
  return loadTestPublicRun_(run);
}

function loadTestPublicRun_(run) {
  return { runId:run.runId, count:run.count, createdAt:run.createdAt, aiEnabled:run.aiEnabled, model:run.model };
}

function requireLoadTestRun_(token, runId) {
  assertTeacherAccess_(token);
  const run = JSON.parse(PropertiesService.getScriptProperties().getProperty('CLASSROOM_LOAD_TEST') || 'null');
  if (!run || (runId && run.runId !== runId) || Date.now() - run.createdAt > 7200000) throw new Error('유효한 시험이 없습니다. 시험을 준비하거나 현재 시험을 다시 불러오세요.');
  return run;
}

function getCurrentClassroomLoadTest(token) { return loadTestPublicRun_(requireLoadTestRun_(token)); }

function runClassroomLoadStudent(token, runId, index) {
  const run = requireLoadTestRun_(token, runId);
  index = Number(index);
  if (!Number.isInteger(index) || index < 0 || index >= run.count) throw new Error('시험 학생 번호 범위를 벗어났습니다.');
  const result = { index:index, startedAtMs:Date.now(), bootstrapMs:0, questionMs:0, lockWaitMs:0, lockCalls:0, sessionId:'', ok:false, aiStatus:'', error:'' };
  requestMetrics_ = result;
  const claimLock = LockService.getScriptLock();
  waitForMeasuredLock_(claimLock, 30000);
  try {
    const key = 'LOAD_CLAIM_' + runId + '_' + index;
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty(key)) throw new Error('이미 실행한 시험 학생입니다. 중복 호출은 실행하지 않습니다.');
    props.setProperty(key, 'started');
  } catch (error) { requestMetrics_ = null; throw error; }
  finally { claimLock.releaseLock(); }
  try {
    requestSpreadsheet_ = SpreadsheetApp.openById(run.sheetId);
    let started = Date.now();
    const bootstrap = getBootstrapData();
    result.sessionId = bootstrap.sessionId; result.bootstrapMs = Date.now() - started;
    started = Date.now();
    const answer = submitTurn({ sessionId:bootstrap.sessionId, studentCode:bootstrap.studentCode,
      message:run.questions[index % run.questions.length], action:'message' });
    result.questionMs = Date.now() - started;
    result.ok = Boolean(answer.reply); result.aiStatus = answer.aiStatus;
  } catch (error) { result.error = String(error.message || error).slice(0,500); }
  finally {
    result.finishedAtMs = Date.now(); result.elapsedMs = result.finishedAtMs - result.startedAtMs;
    try {
      SpreadsheetApp.openById(run.sheetId).getSheetByName('LOAD_TEST_RESULTS')
        .getRange(index + 2,1,1,LOAD_TEST_COLUMNS_.length).setValues([LOAD_TEST_COLUMNS_.map(function (key) { return result[key]; })]);
    } finally { requestSpreadsheet_ = null; requestMetrics_ = null; }
  }
  return result;
}

function getClassroomLoadReport(token, runId) {
  const run = requireLoadTestRun_(token, runId);
  try {
    requestSpreadsheet_ = SpreadsheetApp.openById(run.sheetId);
    const results = getRowsAsObjects_('LOAD_TEST_RESULTS').filter(function (row) { return Boolean(row.finishedAtMs); });
    const sessions = getRowsAsObjects_('SESSIONS'); const turns = getRowsAsObjects_('TURNS'); const logs = getRowsAsObjects_('RETRIEVAL_LOG');
    const recordCounts = results.map(function (row) {
      return { index:Number(row.index), ok:isTruthy_(row.ok),
        sessions:sessions.filter(function (s) { return s.sessionId === row.sessionId; }).length,
        studentTurns:turns.filter(function (s) { return s.sessionId === row.sessionId && s.speaker === 'student'; }).length,
        botTurns:turns.filter(function (s) { return s.sessionId === row.sessionId && s.speaker === 'bot'; }).length,
        logs:logs.filter(function (s) { return s.sessionId === row.sessionId; }).length };
    });
    const integrityErrors = recordCounts.filter(function (r) { return r.ok && (r.sessions !== 1 || r.studentTurns !== 1 || r.botTurns !== 1 || r.logs !== 1); }).map(function (r) { return r.index; });
    const elapsed = results.map(function (r) { return Number(r.elapsedMs); }).sort(function (a,b) { return a-b; });
    const events = [];
    results.forEach(function (r) { events.push([Number(r.startedAtMs),1],[Number(r.finishedAtMs),-1]); });
    events.sort(function (a,b) { return a[0]-b[0] || a[1]-b[1]; });
    let active = 0; let peak = 0; events.forEach(function (e) { active += e[1]; peak = Math.max(peak,active); });
    const percentile = function (p) { return elapsed.length ? elapsed[Math.max(0,Math.ceil(elapsed.length*p)-1)] : 0; };
    return { run:loadTestPublicRun_(run), completed:results.length, expected:run.count,
      success:results.filter(function (r) { return isTruthy_(r.ok); }).length,
      aiComplete:results.filter(function (r) { return String(r.aiStatus) === 'analysis:ok|compose:ok'; }).length,
      peakServerOverlap:peak, p50Ms:percentile(0.5), p95Ms:percentile(0.95), maxMs:percentile(1),
      maxLockWaitMs:Math.max.apply(null,[0].concat(results.map(function (r) { return Number(r.lockWaitMs); }))),
      integrityErrors:integrityErrors, recordCounts:recordCounts, results:results.map(function (r) { delete r.__rowNumber; return r; }) };
  } finally { requestSpreadsheet_ = null; }
}
