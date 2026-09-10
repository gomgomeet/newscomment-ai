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
    .replace(/\+\d{1,3}[-.\/\s]?\d{1,4}(?:[-.\/\s]?\d{2,4}){1,2}[-.\/\s]?\d{4}/g, '[연락처 가림]')
    .replace(/\b0\d{1,3}[-.\/\s]?\d{3,4}[-.\/\s]?\d{4}\b/g, '[연락처 가림]')
    .replace(
      /((?:(?:내|제)\s*)?(?:전화(?:번호)?|연락처)\s*(?::|은|는|이|가)?\s*)\d{3,4}[-.\s]\d{4}/g,
      '$1[연락처 가림]'
    )
    .replace(/\b\d{6}[-\s]?\d{7}\b/g, '[개인번호 가림]')
    .replace(
      /(?:서울(?:특별시|시)?|부산(?:광역시|시)?|대구(?:광역시|시)?|인천(?:광역시|시)?|광주(?:광역시|시)?|대전(?:광역시|시)?|울산(?:광역시|시)?|세종(?:특별자치시|시)?|경기(?:도)?|강원(?:특별자치도|도)?|충청(?:북도|남도)|충(?:북|남)(?:도)?|전북특별자치도|전라(?:북도|남도)|전(?:북|남)(?:도)?|경상(?:북도|남도)|경(?:북|남)(?:도)?|제주(?:특별자치도|도)?)\s+(?:[가-힣]+(?:시|군|구)\s+){1,3}[가-힣0-9·-]+(?:로|길|동|읍|면|리)\s*\d{1,5}(?:-\d{1,5})?/g,
      '[주소 가림]'
    )
    .replace(
      /(?:[가-힣]+(?:시|군|구)\s+)[가-힣0-9·-]+(?:로|길)\s*\d{1,5}(?:번길)?(?:-\d{1,5}|\s+\d{1,5})?/g,
      '[주소 가림]'
    )
    .replace(
      /((?:(?:우리|저희|내|제)\s*)?(?:집\s*주소|집|주소|사는\s*곳)\s*(?::|은|는|이|가)?\s*)(?:[가-힣]+(?:시|군|구)\s+)?[가-힣0-9·-]+(?:로|길)\s*\d{1,5}(?:번길)?(?:-\d{1,5}|\s+\d{1,5})?/g,
      '$1[주소 가림]'
    )
    .replace(
      /((?:계좌(?:번호)?|통장(?:번호)?|입금)\s*(?::|은|는|이|가)?\s*)\d[\d-\s]{8,25}\d/g,
      '$1[계좌번호 가림]'
    )
    .replace(
      /((?:내|제)\s*이름(?:은|이)\s*)(?:[가-힣]{2,4}?|[A-Za-z][A-Za-z'-]{1,29}?)(?=(?:이고|이며|입니다|예요|이에요|이야|야|인데요?|[\s,.!?]|$))/g,
      '$1[이름 가림]'
    )
    .replace(
      /(((?:학생|친구|제\s*친구|내\s*친구|우리\s*친구)\s*)?(?:이름|성명)\s*(?:[:：]|은|이|는|가)\s*)(?:[가-힣]{2,4}?|[A-Za-z][A-Za-z'-]{1,29}?)(?=(?:입니다|예요|이에요|이야|야|이고|이며|[\s,.!?]|$))/g,
      '$1[이름 가림]'
    )
    .replace(
      /((?:제|내|우리)\s*친구\s+)(?:[가-힣]{2,4}|[A-Za-z][A-Za-z'-]{1,29})(?=\s+(?:전화(?:번호)?|연락처|이메일|주소|계좌(?:번호)?))/g,
      '$1[이름 가림]'
    );
  return text;
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

function assertLiteStudentAccessReady_(studentCode, settings, previewAccessToken, joinCode) {
  const readiness = buildLiteCurrentReadiness_(settings);
  const isPreview = studentCode === '99-999';
  if (isPreview) {
    if (!isLitePreviewAccessToken_(previewAccessToken, settings)) {
      throw new Error('교사 미리보기는 교사 설정 화면의 전용 주소에서만 시작할 수 있습니다.');
    }
  } else {
    const candidate = liteText_(joinCode, 16);
    if (!/^\d{6}$/.test(candidate) ||
        liteFingerprint_(candidate, 32) !== liteFingerprint_(settings.joinCode, 32)) {
      throw new Error('반-번호 또는 수업 참여코드를 확인해 주세요.');
    }
  }
  if (!readiness.lessonOpen) {
    throw new Error('선생님이 이 수업 활동을 마쳤습니다. 다음 수업 안내를 기다려 주세요.');
  }
  if (!readiness.runtimeReady) {
    throw new Error('선생님이 개인 API와 공통 대화 엔진의 연결을 확인하고 있습니다. 잠시 뒤 다시 들어와 주세요.');
  }
  if (isPreview) return readiness;
  if (!readiness.distributionReady) {
    throw new Error('선생님이 99-999 미리보기를 마친 뒤 학생 활동을 열 수 있습니다.');
  }
  return readiness;
}

function liteTurnMatchesSettingsIdentity_(turn, settings) {
  return Boolean(turn && settings && settings.lessonId) &&
    liteText_(turn.lessonId, 80) === liteText_(settings.lessonId, 80) &&
    Number(turn.lessonRevision || 0) === Number(settings.lessonRevision || 1) &&
    liteText_(turn.sourceHash, 24) === liteText_(settings.sourceHash, 24);
}

// 이미 처리 중이거나 기록된 동일 requestId를 먼저 찾기 위한 최소 정보입니다.
// 참여코드·수업 공개 상태는 새 요청으로 판명된 뒤 prepareLiteStudentTurn_에서 검사합니다.
function prepareLiteRecoveryTurn_(payload, settings) {
  payload = payload || {};
  settings = settings || {};
  const lessonId = liteRequired_(payload.lessonId, '수업 정보', 80);
  const lessonRevision = Number(payload.lessonRevision);
  const sourceHash = liteText_(payload.sourceHash, 24);
  if (!isFinite(lessonRevision) || lessonRevision < 1 || Math.floor(lessonRevision) !== lessonRevision ||
      !/^[A-Za-z0-9_-]{24}$/.test(sourceHash)) {
    throw new Error('수업 연결 정보를 확인하지 못했습니다. 화면을 새로고침해 주세요.');
  }
  const studentCode = normalizeLiteStudentCode_(payload.studentCode);
  const deviceToken = normalizeLiteDeviceToken_(payload.deviceToken);
  const identity = {
    lessonId:lessonId,
    lessonRevision:lessonRevision,
    sourceHash:sourceHash
  };
  const currentIdentity = liteTurnMatchesSettingsIdentity_(identity, settings);
  return {
    requestId:normalizeLiteRequestId_(payload.requestId),
    studentCode:studentCode,
    deviceToken:deviceToken,
    sessionId:makeLiteSessionId_(lessonId, lessonRevision, sourceHash, studentCode, deviceToken),
    message:redactLiteStudentText_(payload.message),
    isPreview:studentCode === '99-999',
    activityMode:currentIdentity
      ? (settings.activityMode === 'exploration' ? 'exploration' : 'evaluation')
      : '',
    lessonId:lessonId,
    lessonRevision:lessonRevision,
    sourceHash:sourceHash,
    startQuestion:currentIdentity ? liteText_(settings.startQuestion, 500) : ''
  };
}

function prepareLiteStudentTurn_(payload, settings) {
  payload = payload || {};
  settings = settings || {};
  if (!settings.lessonId) throw new Error('교사가 수업 설정을 먼저 저장해야 합니다.');
  assertLiteClientLesson_(payload, settings);
  const studentCode = normalizeLiteStudentCode_(payload.studentCode);
  assertLiteStudentAccessReady_(studentCode, settings, payload.previewAccessToken, payload.joinCode);
  const turn = prepareLiteRecoveryTurn_(payload, settings);
  // 미리보기 통과는 이 요청을 시작할 때 검증된 API·엔진 조합에만 귀속한다.
  const previewSnapshot = turn.isPreview
    ? readLitePreviewVerificationSnapshot_(settings)
    : { verificationKey:'', markerFingerprint:'' };
  turn.previewVerificationKey = turn.isPreview
    ? liteFingerprint_(previewSnapshot.verificationKey, 48)
    : '';
  turn.previewExpectedMarker = turn.isPreview ? previewSnapshot.markerFingerprint : '';
  // 이미 받은 유료 후보를 어느 중앙 엔진 세대에서 finalize할 수 있는지도 함께 고정한다.
  const engineRuntime = typeof readLiteEngineRuntimeSnapshot_ === 'function'
    ? readLiteEngineRuntimeSnapshot_()
    : { endpoint:'', key:'' };
  if (!engineRuntime.endpoint || !engineRuntime.key) {
    throw new Error('공통 대화 엔진의 연결 상태가 바뀌었습니다. 잠시 뒤 다시 시도해 주세요.');
  }
  turn.engineEndpoint = engineRuntime.endpoint;
  turn.enginePolicyVersion = engineRuntime.policyVersion;
  turn.engineVerificationKey = engineRuntime.key;
  return turn;
}

function startLiteStudentSession(payload) {
  const spreadsheet = getLiteSpreadsheet_();
  const settings = readLiteTeacherSettings_(spreadsheet, { skipEnsure:true });
  assertLiteClientLesson_(payload, settings);
  const code = normalizeLiteStudentCode_(payload && payload.studentCode);
  assertLiteStudentAccessReady_(code, settings, payload && payload.previewAccessToken, payload && payload.joinCode);
  const deviceToken = normalizeLiteDeviceToken_(payload && payload.deviceToken);
  const sessionId = makeLiteSessionId_(
    settings.lessonId, settings.lessonRevision || 1, settings.sourceHash || '', code, deviceToken
  );
  const qaSheet = spreadsheet.getSheetByName('질문과 답변');
  if (!qaSheet) throw new Error('교사가 수업 시트 준비를 다시 실행해 주세요.');
  const sessionRows = liteRowsByColumnValue_(qaSheet, 'sessionId', sessionId);
  const history = withLiteVirtualStartQuestion_(
    getLiteSessionHistory_(sessionId, spreadsheet, sessionRows), settings.startQuestion
  );
  return {
    sessionId: sessionId,
    studentCode: code,
    isPreview: code === '99-999',
    lesson: sanitizeLiteSettingsForStudent_(settings),
    history: history.map(function (row) {
      return {
        requestId: liteText_(row.requestId, 100),
        speaker: row.speaker === 'student' ? 'student' : 'bot',
        text: liteText_(row.text, 4000),
        isClosing: Boolean(row.isClosing)
      };
    }),
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

function getLiteSessionHistory_(sessionId, spreadsheet, rowsOverride) {
  spreadsheet = spreadsheet || getLiteSpreadsheet_();
  if (!Array.isArray(rowsOverride)) ensureLiteWorkbook_(spreadsheet);
  const rows = (Array.isArray(rowsOverride)
    ? rowsOverride.filter(function (row) { return String(row.sessionId) === String(sessionId); })
    : liteRowsByColumnValue_(spreadsheet.getSheetByName('질문과 답변'), 'sessionId', sessionId))
    // 연결 실패는 감사 기록에는 남기되 다음 국면과 대화 문맥에는 포함하지 않는다.
    .filter(function (row) { return String(row.engineStatus || '').indexOf('engine_failed:') !== 0; })
    .sort(function (a, b) { return Number(a.turnNo || 0) - Number(b.turnNo || 0); })
    .slice(-LITE_MAX_HISTORY_ROWS_);
  return rows.map(function (row) {
    return {
      requestId: String(row.requestId || ''),
      speaker: String(row.speaker), text: unescapeLiteSheetText_(row.text), turnNo: Number(row.turnNo || 0),
      managedKind: String(row.managedKind || ''), relatedQuestion: String(row.relatedQuestion) === 'true' || row.relatedQuestion === true,
      responseScore: row.responseScore === '' ? '' : Number(row.responseScore),
      isClosing: String(row.isClosing) === 'true' || row.isClosing === true,
      engineStatus: String(row.engineStatus || '')
    };
  });
}

function liteTurnRowMatches_(row, turn) {
  const rowLessonId = String(row && row.lessonId || '');
  const rowRevision = row && row.lessonRevision;
  const rowSourceHash = String(row && row.sourceHash || '');
  return String(row && row.sessionId || '') === String(turn && turn.sessionId || '') &&
    String(row && row.studentCode || '') === String(turn && turn.studentCode || '') &&
    (!rowLessonId || rowLessonId === String(turn && turn.lessonId || '')) &&
    (rowRevision === '' || rowRevision == null ||
      Number(rowRevision || 1) === Number(turn && turn.lessonRevision || 1)) &&
    (!rowSourceHash || rowSourceHash === String(turn && turn.sourceHash || ''));
}

function appendLiteTurnPair_(turn, result, options) {
  options = options || {};
  const spreadsheet = options.spreadsheet || getLiteSpreadsheet_();
  if (!options.workbookReady) ensureLiteWorkbook_(spreadsheet);
  const sheet = spreadsheet.getSheetByName('질문과 답변');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .map(function (value) { return String(value).trim(); });
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('친구들의 질문이 한꺼번에 들어오고 있어요. 잠시 뒤 다시 보내 주세요.');
  }
  try {
    const existing = options.prechecked
      ? []
      : (Array.isArray(options.allRows)
        ? options.allRows.filter(function (row) { return String(row.requestId) === String(turn.requestId); })
        : liteRowsByColumnValue_(sheet, 'requestId', turn.requestId));
    if (existing.length) {
      const student = existing.find(function (row) { return String(row.speaker) === 'student'; });
      const contextMatches = student && existing.every(function (row) {
        return liteTurnRowMatches_(row, turn);
      });
      if (!contextMatches || unescapeLiteSheetText_(student.text) !== String(turn.message)) {
        throw new Error('같은 전송 번호가 다른 수업 또는 학생 정보와 함께 사용되었습니다.');
      }
      const assistant = existing.find(function (row) { return String(row.speaker) === 'bot'; });
      return { duplicate: true, assistantText: assistant ? unescapeLiteSheetText_(assistant.text) : '' };
    }

    const sessionRows = Array.isArray(options.sessionRows)
      ? options.sessionRows
      : (Array.isArray(options.allRows)
        ? options.allRows.filter(function (row) { return String(row.sessionId) === String(turn.sessionId); })
        : liteRowsByColumnValue_(sheet, 'sessionId', turn.sessionId));
    const lastNo = sessionRows.reduce(function (max, row) {
      return Math.max(max, Number(row.turnNo || 0));
    }, 0);
    const common = {
      timestamp: new Date(), requestId: turn.requestId, sessionId: turn.sessionId,
      studentCode: turn.studentCode, lessonId: turn.lessonId, activityMode: turn.activityMode,
      phase: result.phase || '', managedKind: result.managedKind || '',
      relatedQuestion: Boolean(result.relatedQuestion),
      responseScore: result.responseScore == null ? '' : result.responseScore,
      questionType: result.questionType || '',
      engagementState: result.engagementState || '',
      curriculumRelation: result.curriculumRelation || '',
      supportLevel: result.supportLevel == null ? '' : result.supportLevel,
      sourceStatus: result.sourceStatus || '', sourceCue: result.sourceCue || '',
      primaryMove: result.primaryMove || '', safetyFlag: Boolean(result.safetyFlag),
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
        sessionId:turn.sessionId, studentCode:turn.studentCode, lessonId:turn.lessonId,
        turnNo:1, speaker:'bot', text:escapeLiteSheetText_(turn.startQuestion),
        activityMode:turn.activityMode, phase:1, managedKind:'start', relatedQuestion:true,
        responseScore:'', questionType:'opening', engagementState:'', curriculumRelation:'direct',
        supportLevel:'', sourceStatus:'', sourceCue:'', primaryMove:'', safetyFlag:false, evidenceIds:'', isClosing:false,
        engineStatus:'seeded_start', aiStatus:'not_called', isPreview:Boolean(turn.isPreview),
        lessonRevision:turn.lessonRevision || 1, sourceHash:turn.sourceHash || ''
      });
      turnBase = 1;
    }
    objects.push(
      Object.assign({}, common, {
        turnNo: turnBase + 1, speaker: 'student', text: escapeLiteSheetText_(turn.message),
        rubricScoresJson: '', apiModel:'', apiInputTokens:'', apiOutputTokens:'', apiTotalTokens:''
      }),
      Object.assign({}, common, {
        turnNo: turnBase + 2, speaker: 'bot', text: escapeLiteSheetText_(liteText_(result.text, 4000)),
        rubricScoresJson: liteText_(JSON.stringify(result.rubricScores || []), 6000),
        apiModel: liteText_(result.apiModel, 80),
        apiInputTokens: Math.max(0, Number(result.apiInputTokens || 0)),
        apiOutputTokens: Math.max(0, Number(result.apiOutputTokens || 0)),
        apiTotalTokens: Math.max(0, Number(result.apiTotalTokens || 0))
      })
    );
    const values = objects.map(function (object) {
      return headers.map(function (header) {
        return Object.prototype.hasOwnProperty.call(object, header) ? liteSheetSafeValue_(object[header]) : '';
      });
    });
    sheet.getRange(sheet.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
    if (!turn.isPreview && String(result.engineStatus || '').indexOf('engine_failed:') !== 0) {
      upsertLiteStudentSummary_(spreadsheet, turn, result, sessionRows.concat(objects));
    }
    let evaluationWarning = '';
    if (options.updateEvaluation && !turn.isPreview && turn.activityMode === 'evaluation') {
      try {
        upsertLiteEvaluationDraft_(options.settings, turn, options.observation, {
          lockHeld:true,
          spreadsheet:spreadsheet,
          workbookReady:true
        });
      } catch (error) {
        evaluationWarning = '평가 초안 저장은 다시 확인이 필요합니다.';
      }
    }
    SpreadsheetApp.flush();
    return {
      duplicate:false,
      assistantText:String(result.text || ''),
      evaluationWarning:evaluationWarning
    };
  } finally {
    lock.releaseLock();
  }
}

function isLiteQuestion_(text) {
  const value = String(text || '').trim();
  return /[?？]$/.test(value) || /(왜|어떻게|무엇|뭐|어디|언제|누가|몇|얼마나|뜻).*(나요|까요|예요|이에요|해요|돼요)?[.!]?$/.test(value);
}

function upsertLiteStudentSummary_(spreadsheet, turn, result, sessionRowsOverride) {
  const sheet = spreadsheet.getSheetByName('학생별 현황');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .map(function (value) { return String(value).trim(); });
  const rows = liteRowsByColumnValue_(sheet, 'sessionId', turn.sessionId);
  const index = rows.findIndex(function (row) {
    return String(row.studentCode) === String(turn.studentCode) &&
      String(row.sessionId) === String(turn.sessionId) &&
      String(row.lessonId) === String(turn.lessonId) &&
      Number(row.lessonRevision || 1) === Number(turn.lessonRevision || 1);
  });
  const previous = index >= 0 ? rows[index] : {};
  const sessionRows = (Array.isArray(sessionRowsOverride)
    ? sessionRowsOverride
    : liteRowsByColumnValue_(spreadsheet.getSheetByName('질문과 답변'), 'sessionId', turn.sessionId))
    .filter(function (row) {
      return String(row.engineStatus || '').indexOf('engine_failed:') !== 0;
    });
  const studentRows = sessionRows.filter(function (row) { return String(row.speaker) === 'student'; });
  const questionRows = studentRows.filter(function (row) {
    return isLiteQuestion_(unescapeLiteSheetText_(row.text));
  });
  const relatedQuestionCount = questionRows.filter(function (row) {
    return String(row.relatedQuestion) === 'true' || row.relatedQuestion === true;
  }).length;
  const latest = sessionRows.slice().sort(function (a, b) {
    return Number(b.turnNo || 0) - Number(a.turnNo || 0);
  })[0] || {};
  const latestPhase = Number(latest.phase || result.phase || 1);
  const latestClosing = String(latest.isClosing) === 'true' || latest.isClosing === true || Boolean(result.isClosing);
  const object = {
    studentCode: turn.studentCode,
    lessonId: turn.lessonId,
    lessonRevision: turn.lessonRevision || 1,
    sessionId: turn.sessionId,
    questionCount: questionRows.length,
    relatedQuestionCount: relatedQuestionCount,
    lastActiveAt: latest.timestamp || previous.lastActiveAt || new Date(),
    progressStatus: latestClosing ? '활동 마침' : latestPhase >= 2 ? '2국면 진행' : '1국면 진행',
    isPreview: false
  };
  const values = headers.map(function (header) {
    return Object.prototype.hasOwnProperty.call(object, header) ? liteSheetSafeValue_(object[header]) : '';
  });
  if (index >= 0) sheet.getRange(Number(previous.__liteRowNumber || index + 2), 1, 1, headers.length).setValues([values]);
  else sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([values]);
}

function repairLiteStudentSummary_(spreadsheet, turn, result, sessionRows) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    upsertLiteStudentSummary_(spreadsheet, turn, result, sessionRows);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}

function countLiteSessionRequests_(sessionId, spreadsheet, rowsOverride) {
  spreadsheet = spreadsheet || getLiteSpreadsheet_();
  if (!Array.isArray(rowsOverride)) ensureLiteWorkbook_(spreadsheet);
  const rows = Array.isArray(rowsOverride)
    ? rowsOverride.filter(function (row) { return String(row.sessionId) === String(sessionId); })
    : liteRowsByColumnValue_(spreadsheet.getSheetByName('질문과 답변'), 'sessionId', sessionId);
  return rows.filter(function (row) {
    return String(row.speaker) === 'student' &&
      String(row.engineStatus || '').indexOf('engine_failed:') !== 0;
  }).length;
}

function countLiteStudentLessonRequests_(turn, spreadsheet, rowsOverride) {
  spreadsheet = spreadsheet || getLiteSpreadsheet_();
  if (!Array.isArray(rowsOverride)) ensureLiteWorkbook_(spreadsheet);
  const rows = Array.isArray(rowsOverride)
    ? rowsOverride
    : liteRowsByColumnValue_(spreadsheet.getSheetByName('질문과 답변'), 'studentCode', turn.studentCode);
  return rows.filter(function (row) {
    return String(row.speaker) === 'student' &&
      String(row.studentCode) === String(turn.studentCode) &&
      String(row.lessonId || '') === String(turn.lessonId || '') &&
      Number(row.lessonRevision || 1) === Number(turn.lessonRevision || 1) &&
      String(row.sourceHash || '') === String(turn.sourceHash || '') &&
      String(row.engineStatus || '').indexOf('engine_failed:') !== 0;
  }).length;
}
