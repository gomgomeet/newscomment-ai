/**
 * 학생 세션과 교사 소유 Sheet 기록.
 * 중앙 엔진·모델 호출과 분리해 한 요청이 성공했을 때 학생/챗봇 두 행을 함께 저장합니다.
 */

const LITE_SESSION_SECRET_PROPERTY_ = 'LITE_SESSION_SECRET';
const LITE_MAX_STUDENT_MESSAGE_ = 800;
const LITE_MAX_HISTORY_ROWS_ = 18;

function normalizeLiteStudentCode_(value) {
  const match = /^(\d{1,2})\s*-\s*(\d{1,3})$/.exec(liteText_(value));
  if (!match || Number(match[1]) < 1 || Number(match[2]) < 1) {
    throw new Error('반-번호를 입력해 주세요. 예: 3-12');
  }
  return Number(match[1]) + '-' + Number(match[2]);
}

function normalizeLiteDeviceToken_(value) {
  const token = liteText_(value, 100);
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(token)) {
    throw new Error('학생 기기 연결 정보를 다시 만들어 주세요. 화면을 새로고침하면 됩니다.');
  }
  return token;
}

function normalizeLiteRequestId_(value) {
  const requestId = liteText_(value, 100);
  if (!/^[A-Za-z0-9_-]{12,100}$/.test(requestId)) {
    throw new Error('질문 전송 정보를 다시 만들어 주세요.');
  }
  return requestId;
}

function redactLiteStudentText_(value) {
  let text = liteRequired_(value, '궁금한 점', LITE_MAX_STUDENT_MESSAGE_);
  text = text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[이메일 가림]')
    .replace(/(?:01[016789]|0\d{1,2})[-.\s]?\d{3,4}[-.\s]?\d{4}/g, '[연락처 가림]')
    .replace(/\b\d{6}[-\s]?\d{7}\b/g, '[개인번호 가림]')
    .replace(
      /((?:내|제)\s*이름(?:은|이)\s*)[가-힣]{2,4}(?=(?:이고|이며|입니다|예요|이에요|[\s,.!?]|$))/g,
      '$1[이름 가림]'
    );
  return text;
}

function getOrCreateLiteSessionSecret_() {
  const properties = PropertiesService.getScriptProperties();
  let secret = properties.getProperty(LITE_SESSION_SECRET_PROPERTY_);
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    properties.setProperty(LITE_SESSION_SECRET_PROPERTY_, secret);
  }
  return secret;
}

function makeLiteSessionId_(lessonId, studentCode, deviceToken) {
  const source = [lessonId, studentCode, deviceToken].join('|');
  const signature = Utilities.computeHmacSha256Signature(
    source,
    getOrCreateLiteSessionSecret_(),
    Utilities.Charset.UTF_8
  );
  return 'S-' + Utilities.base64EncodeWebSafe(signature).replace(/=+$/g, '').slice(0, 32);
}

function prepareLiteStudentTurn_(payload, settings) {
  payload = payload || {};
  settings = settings || {};
  if (!settings.lessonId) throw new Error('교사가 수업 설정을 먼저 저장해야 합니다.');
  const studentCode = normalizeLiteStudentCode_(payload.studentCode);
  const deviceToken = normalizeLiteDeviceToken_(payload.deviceToken);
  return {
    requestId: normalizeLiteRequestId_(payload.requestId),
    studentCode: studentCode,
    deviceToken: deviceToken,
    sessionId: makeLiteSessionId_(settings.lessonId, studentCode, deviceToken),
    message: redactLiteStudentText_(payload.message),
    isPreview: /^99-/.test(studentCode),
    activityMode: settings.activityMode === 'exploration' ? 'exploration' : 'evaluation'
  };
}

function startLiteStudentSession(payload) {
  const settings = readLiteTeacherSettings_();
  const code = normalizeLiteStudentCode_(payload && payload.studentCode);
  const deviceToken = normalizeLiteDeviceToken_(payload && payload.deviceToken);
  const sessionId = makeLiteSessionId_(settings.lessonId, code, deviceToken);
  return {
    sessionId: sessionId,
    studentCode: code,
    isPreview: /^99-/.test(code),
    history: getLiteSessionHistory_(sessionId)
  };
}

function getLiteSessionHistory_(sessionId) {
  const spreadsheet = getLiteSpreadsheet_();
  ensureLiteWorkbook_(spreadsheet);
  const rows = liteRowsAsObjects_(spreadsheet.getSheetByName('질문과 답변'))
    .filter(function (row) { return String(row.sessionId) === String(sessionId); })
    .sort(function (a, b) { return Number(a.turnNo || 0) - Number(b.turnNo || 0); })
    .slice(-LITE_MAX_HISTORY_ROWS_);
  return rows.map(function (row) {
    return { speaker: String(row.speaker), text: String(row.text), turnNo: Number(row.turnNo || 0) };
  });
}

function appendLiteTurnPair_(turn, result) {
  const spreadsheet = getLiteSpreadsheet_();
  ensureLiteWorkbook_(spreadsheet);
  const sheet = spreadsheet.getSheetByName('질문과 답변');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .map(function (value) { return String(value).trim(); });
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('친구들의 질문이 한꺼번에 들어오고 있어요. 잠시 뒤 다시 보내 주세요.');
  }
  try {
    const existing = liteRowsAsObjects_(sheet).filter(function (row) {
      return String(row.requestId) === String(turn.requestId);
    });
    if (existing.length) {
      const assistant = existing.find(function (row) { return String(row.speaker) === 'bot'; });
      return { duplicate: true, assistantText: assistant ? String(assistant.text) : '' };
    }

    const sessionRows = liteRowsAsObjects_(sheet).filter(function (row) {
      return String(row.sessionId) === String(turn.sessionId);
    });
    const lastNo = sessionRows.reduce(function (max, row) {
      return Math.max(max, Number(row.turnNo || 0));
    }, 0);
    const common = {
      timestamp: new Date(), requestId: turn.requestId, sessionId: turn.sessionId,
      studentCode: turn.studentCode, activityMode: turn.activityMode,
      phase: result.phase || '', managedKind: result.managedKind || '',
      evidenceIds: Array.isArray(result.evidenceIds) ? result.evidenceIds.join('|') : String(result.evidenceIds || ''),
      engineStatus: result.engineStatus || '', aiStatus: result.aiStatus || '',
      isPreview: Boolean(turn.isPreview)
    };
    const objects = [
      Object.assign({}, common, { turnNo: lastNo + 1, speaker: 'student', text: turn.message }),
      Object.assign({}, common, { turnNo: lastNo + 2, speaker: 'bot', text: liteText_(result.text, 4000) })
    ];
    const values = objects.map(function (object) {
      return headers.map(function (header) {
        return Object.prototype.hasOwnProperty.call(object, header) ? object[header] : '';
      });
    });
    sheet.getRange(sheet.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
    if (!turn.isPreview) upsertLiteStudentSummary_(spreadsheet, turn.studentCode);
    SpreadsheetApp.flush();
    return { duplicate: false, assistantText: String(result.text || '') };
  } finally {
    lock.releaseLock();
  }
}

function upsertLiteStudentSummary_(spreadsheet, studentCode) {
  const sheet = spreadsheet.getSheetByName('학생별 현황');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .map(function (value) { return String(value).trim(); });
  const rows = liteRowsAsObjects_(sheet);
  const index = rows.findIndex(function (row) { return String(row.studentCode) === String(studentCode); });
  const previous = index >= 0 ? rows[index] : {};
  const object = {
    studentCode: studentCode,
    questionCount: Number(previous.questionCount || 0) + 1,
    relatedQuestionCount: Number(previous.relatedQuestionCount || 0),
    lastActiveAt: new Date(),
    progressStatus: '대화 중',
    isPreview: false
  };
  const values = headers.map(function (header) {
    return Object.prototype.hasOwnProperty.call(object, header) ? object[header] : '';
  });
  if (index >= 0) sheet.getRange(index + 2, 1, 1, headers.length).setValues([values]);
  else sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([values]);
}
