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
      /(?:서울(?:특별시|시)?|부산(?:광역시|시)?|대구(?:광역시|시)?|인천(?:광역시|시)?|광주(?:광역시|시)?|대전(?:광역시|시)?|울산(?:광역시|시)?|세종(?:특별자치시|시)?|경기(?:도)?|강원(?:특별자치도|도)?|충청(?:북도|남도)|충(?:북|남)(?:도)?|전북특별자치도|전라(?:북도|남도)|전(?:북|남)(?:도)?|경상(?:북도|남도)|경(?:북|남)(?:도)?|제주(?:특별자치도|도)?)\s+(?:[가-힣]+(?:시|군|구)\s+){1,3}[가-힣0-9·-]+(?:로|길|동|읍|면|리)\s*\d{1,5}(?:-\d{1,5})?/g,
      '[주소 가림]'
    )
    .replace(
      /((?:계좌(?:번호)?|통장(?:번호)?|입금)\s*(?::|은|는|이|가)?\s*)\d[\d-\s]{8,25}\d/g,
      '$1[계좌번호 가림]'
    )
    .replace(
      /((?:내|제)\s*이름(?:은|이)\s*)(?:[가-힣]{2,4}|[A-Za-z][A-Za-z'-]{1,29})(?=(?:이고|이며|입니다|예요|이에요|인데요?|[\s,.!?]|$))/g,
      '$1[이름 가림]'
    )
    .replace(
      /((?:저는|나는|전|난|제가|내가|저)\s*)(?!(?:찬성|반대|학생|교사|선생님|독자|기자|자료|의견|환경|학교|사람|어린이|청소년|국민|한국인)(?=\s*(?:이고|이며|입니다|예요|이에요|이라고|라고|이야|야|인데요?|[,.!?]|$)))(?:[가-힣]{2,4}?|[A-Za-z][A-Za-z'-]{1,29})(?=\s*(?:이고|이며|입니다|예요|이에요|이라고|라고|이야|야|인데요?|[,.!?]|$))/g,
      '$1[이름 가림]'
    )
    .replace(
      /(((?:학생|친구|제\s*친구|내\s*친구|우리\s*친구)\s*)?(?:이름|성명)\s*(?:[:：]|은|이|는|가)\s*)(?:[가-힣]{2,4}|[A-Za-z][A-Za-z'-]{1,29})(?=(?:입니다|예요|이에요|이고|이며|[\s,.!?]|$))/g,
      '$1[이름 가림]'
    )
    .replace(
      /((?:제|내|우리)\s*친구\s+)(?:[가-힣]{2,4}|[A-Za-z][A-Za-z'-]{1,29})(?=\s+(?:전화(?:번호)?|연락처|이메일|주소|계좌(?:번호)?))/g,
      '$1[이름 가림]'
    );
  return text;
}

function escapeLiteSheetText_(value) {
  const text = String(value == null ? '' : value);
  // 공개 입력이 Google Sheets에서 수식으로 실행되지 않도록 텍스트로 저장한다.
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function unescapeLiteSheetText_(value) {
  const text = String(value == null ? '' : value);
  return /^'[=+\-@]/.test(text) ? text.slice(1) : text;
}

function getOrCreateLiteSessionSecret_() {
  const properties = PropertiesService.getScriptProperties();
  let secret = properties.getProperty(LITE_SESSION_SECRET_PROPERTY_);
  if (!secret) {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      // 첫 동시 접속에서도 모든 학생이 같은 세션 비밀값을 사용하도록 다시 확인한다.
      secret = properties.getProperty(LITE_SESSION_SECRET_PROPERTY_);
      if (!secret) {
        secret = Utilities.getUuid() + Utilities.getUuid();
        properties.setProperty(LITE_SESSION_SECRET_PROPERTY_, secret);
      }
    } finally {
      lock.releaseLock();
    }
  }
  return secret;
}

function makeLiteSessionId_(lessonId, lessonRevision, sourceHash, studentCode, deviceToken) {
  const source = [lessonId, lessonRevision, sourceHash, studentCode, deviceToken].join('|');
  const signature = Utilities.computeHmacSha256Signature(
    source,
    getOrCreateLiteSessionSecret_(),
    Utilities.Charset.UTF_8
  );
  return 'S-' + Utilities.base64EncodeWebSafe(signature).replace(/=+$/g, '').slice(0, 32);
}

function assertLiteClientLesson_(payload, settings) {
  payload = payload || {};
  settings = settings || {};
  const sameLesson = liteText_(payload.lessonId, 80) === liteText_(settings.lessonId, 80);
  const sameRevision = Number(payload.lessonRevision || 0) === Number(settings.lessonRevision || 1);
  const sameSource = liteText_(payload.sourceHash, 24) === liteText_(settings.sourceHash, 24);
  if (!sameLesson || !sameRevision || !sameSource) {
    throw new Error('선생님이 수업자료를 새로 준비했습니다. 화면을 새로고침한 뒤 다시 시작해 주세요.');
  }
}

function prepareLiteStudentTurn_(payload, settings) {
  payload = payload || {};
  settings = settings || {};
  if (!settings.lessonId) throw new Error('교사가 수업 설정을 먼저 저장해야 합니다.');
  assertLiteClientLesson_(payload, settings);
  const studentCode = normalizeLiteStudentCode_(payload.studentCode);
  const deviceToken = normalizeLiteDeviceToken_(payload.deviceToken);
  const turn = {
    requestId: normalizeLiteRequestId_(payload.requestId),
    studentCode: studentCode,
    deviceToken: deviceToken,
    sessionId: makeLiteSessionId_(
      settings.lessonId, settings.lessonRevision || 1, settings.sourceHash || '', studentCode, deviceToken
    ),
    message: redactLiteStudentText_(payload.message),
    isPreview: /^99-/.test(studentCode),
    activityMode: settings.activityMode === 'exploration' ? 'exploration' : 'evaluation',
    lessonId: settings.lessonId,
    lessonRevision: Math.max(1, Number(settings.lessonRevision || 1)),
    sourceHash: liteText_(settings.sourceHash, 24),
    startQuestion: liteText_(settings.startQuestion, 500)
  };
  return turn;
}

function startLiteStudentSession(payload) {
  const settings = readLiteTeacherSettings_();
  assertLiteClientLesson_(payload, settings);
  const code = normalizeLiteStudentCode_(payload && payload.studentCode);
  const deviceToken = normalizeLiteDeviceToken_(payload && payload.deviceToken);
  const sessionId = makeLiteSessionId_(
    settings.lessonId, settings.lessonRevision || 1, settings.sourceHash || '', code, deviceToken
  );
  const history = withLiteVirtualStartQuestion_(getLiteSessionHistory_(sessionId), settings.startQuestion);
  return {
    sessionId: sessionId,
    studentCode: code,
    isPreview: /^99-/.test(code),
    history: history,
    isClosing: Boolean(history.length && history[history.length - 1].isClosing)
  };
}

function withLiteVirtualStartQuestion_(history, startQuestion) {
  const rows = Array.isArray(history) ? history : [];
  if (rows.length) return rows;
  const text = liteText_(startQuestion, 500);
  return text ? [{
    speaker:'bot', text:text, turnNo:1, managedKind:'start', relatedQuestion:true,
    responseScore:'', isClosing:false, engineStatus:'virtual_start'
  }] : [];
}

function getLiteSessionHistory_(sessionId) {
  const spreadsheet = getLiteSpreadsheet_();
  ensureLiteWorkbook_(spreadsheet);
  const rows = liteRowsAsObjects_(spreadsheet.getSheetByName('질문과 답변'))
    .filter(function (row) { return String(row.sessionId) === String(sessionId); })
    // 연결 실패는 감사 기록에는 남기되 다음 국면과 대화 문맥에는 포함하지 않는다.
    .filter(function (row) { return String(row.engineStatus || '').indexOf('engine_failed:') !== 0; })
    .sort(function (a, b) { return Number(a.turnNo || 0) - Number(b.turnNo || 0); })
    .slice(-LITE_MAX_HISTORY_ROWS_);
  return rows.map(function (row) {
    return {
      speaker: String(row.speaker), text: unescapeLiteSheetText_(row.text), turnNo: Number(row.turnNo || 0),
      managedKind: String(row.managedKind || ''), relatedQuestion: String(row.relatedQuestion) === 'true' || row.relatedQuestion === true,
      responseScore: row.responseScore === '' ? '' : Number(row.responseScore),
      isClosing: String(row.isClosing) === 'true' || row.isClosing === true,
      engineStatus: String(row.engineStatus || '')
    };
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
      return { duplicate: true, assistantText: assistant ? unescapeLiteSheetText_(assistant.text) : '' };
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
      relatedQuestion: Boolean(result.relatedQuestion),
      responseScore: result.responseScore == null ? '' : result.responseScore,
      questionType: result.questionType || '',
      engagementState: result.engagementState || '',
      curriculumRelation: result.curriculumRelation || '',
      supportLevel: result.supportLevel == null ? '' : result.supportLevel,
      sourceStatus: result.sourceStatus || '', sourceCue: result.sourceCue || '',
      evidenceIds: Array.isArray(result.evidenceIds) ? result.evidenceIds.join('|') : String(result.evidenceIds || ''),
      isClosing: Boolean(result.isClosing),
      engineStatus: result.engineStatus || '', aiStatus: result.aiStatus || '',
      isPreview: Boolean(turn.isPreview), lessonRevision: turn.lessonRevision || 1,
      sourceHash: turn.sourceHash || ''
    };
    const objects = [];
    let turnBase = lastNo;
    if (!sessionRows.length && turn.startQuestion) {
      objects.push({
        timestamp:new Date(), requestId:'seed_' + turn.sessionId,
        sessionId:turn.sessionId, studentCode:turn.studentCode,
        turnNo:1, speaker:'bot', text:escapeLiteSheetText_(turn.startQuestion),
        activityMode:turn.activityMode, phase:1, managedKind:'start', relatedQuestion:true,
        responseScore:'', questionType:'opening', engagementState:'', curriculumRelation:'direct',
        supportLevel:'', sourceStatus:'', sourceCue:'', evidenceIds:'', isClosing:false,
        engineStatus:'seeded_start', aiStatus:'not_called', isPreview:Boolean(turn.isPreview),
        lessonRevision:turn.lessonRevision || 1, sourceHash:turn.sourceHash || ''
      });
      turnBase = 1;
    }
    objects.push(
      Object.assign({}, common, {
        turnNo: turnBase + 1, speaker: 'student', text: escapeLiteSheetText_(turn.message)
      }),
      Object.assign({}, common, {
        turnNo: turnBase + 2, speaker: 'bot', text: escapeLiteSheetText_(liteText_(result.text, 4000))
      })
    );
    const values = objects.map(function (object) {
      return headers.map(function (header) {
        return Object.prototype.hasOwnProperty.call(object, header) ? object[header] : '';
      });
    });
    sheet.getRange(sheet.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
    if (!turn.isPreview && String(result.engineStatus || '').indexOf('engine_failed:') !== 0) {
      upsertLiteStudentSummary_(spreadsheet, turn, result);
    }
    SpreadsheetApp.flush();
    return { duplicate: false, assistantText: String(result.text || '') };
  } finally {
    lock.releaseLock();
  }
}

function isLiteQuestion_(text) {
  const value = String(text || '').trim();
  return /[?？]$/.test(value) || /(왜|어떻게|무엇|뭐|어디|언제|누가|몇|얼마나|뜻).*(나요|까요|예요|이에요|해요|돼요)?[.!]?$/.test(value);
}

function upsertLiteStudentSummary_(spreadsheet, turn, result) {
  const sheet = spreadsheet.getSheetByName('학생별 현황');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .map(function (value) { return String(value).trim(); });
  const rows = liteRowsAsObjects_(sheet);
  const index = rows.findIndex(function (row) {
    return String(row.studentCode) === String(turn.studentCode) &&
      String(row.sessionId) === String(turn.sessionId) &&
      String(row.lessonId) === String(turn.lessonId) &&
      Number(row.lessonRevision || 1) === Number(turn.lessonRevision || 1);
  });
  const previous = index >= 0 ? rows[index] : {};
  const questionIncrement = isLiteQuestion_(turn.message) ? 1 : 0;
  const relatedIncrement = questionIncrement && result.relatedQuestion ? 1 : 0;
  const object = {
    studentCode: turn.studentCode,
    lessonId: turn.lessonId,
    lessonRevision: turn.lessonRevision || 1,
    sessionId: turn.sessionId,
    questionCount: Number(previous.questionCount || 0) + questionIncrement,
    relatedQuestionCount: Number(previous.relatedQuestionCount || 0) + relatedIncrement,
    lastActiveAt: new Date(),
    progressStatus: result.isClosing ? '활동 마침' : Number(result.phase || 1) >= 2 ? '2국면 진행' : '1국면 진행',
    isPreview: false
  };
  const values = headers.map(function (header) {
    return Object.prototype.hasOwnProperty.call(object, header) ? object[header] : '';
  });
  if (index >= 0) sheet.getRange(index + 2, 1, 1, headers.length).setValues([values]);
  else sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([values]);
}
