/**
 * simbot — 설정과 교사 소유 Sheet만 담당합니다.
 * API 키는 Script Properties에만 저장하며 Sheet 행으로 만들지 않습니다.
 */

const LITE_APP_VERSION_ = '0.5.0';
const LITE_API_KEY_PROPERTY_ = 'TEACHER_OPENAI_API_KEY';
const LITE_SPREADSHEET_ID_PROPERTY_ = 'TEACHER_SPREADSHEET_ID';
const LITE_ENGINE_ENDPOINT_PROPERTY_ = 'CENTRAL_ENGINE_ENDPOINT';
const LITE_TEACHER_ACCESS_TOKEN_PROPERTY_ = 'LITE_TEACHER_ACCESS_TOKEN';
const LITE_API_VERIFIED_FINGERPRINT_PROPERTY_ = 'LITE_API_VERIFIED_FINGERPRINT';
const LITE_API_VERIFIED_AT_PROPERTY_ = 'LITE_API_VERIFIED_AT';
const LITE_ENGINE_VERIFIED_ENDPOINT_PROPERTY_ = 'LITE_ENGINE_VERIFIED_ENDPOINT';
const LITE_ENGINE_VERIFIED_POLICY_PROPERTY_ = 'LITE_ENGINE_VERIFIED_POLICY';
const LITE_ENGINE_VERIFIED_AT_PROPERTY_ = 'LITE_ENGINE_VERIFIED_AT';
const LITE_PREVIEW_VERIFIED_LESSON_PROPERTY_ = 'LITE_PREVIEW_VERIFIED_LESSON';
const LITE_CLOSED_LESSON_PROPERTY_ = 'LITE_CLOSED_LESSON';
const LITE_PREVIEW_ACCESS_TOKEN_PROPERTY_ = 'LITE_PREVIEW_ACCESS_TOKEN';
const LITE_PREVIEW_ACCESS_LESSON_PROPERTY_ = 'LITE_PREVIEW_ACCESS_LESSON';
const LITE_PREVIEW_ACCESS_EXPIRES_PROPERTY_ = 'LITE_PREVIEW_ACCESS_EXPIRES';
const LITE_DEPLOYMENT_ID_PROPERTY_ = 'LITE_DEPLOYMENT_ID';
const LITE_PREVIEW_ACCESS_TTL_MS_ = 8 * 60 * 60 * 1000;

const LITE_SHEET_HEADERS_ = {
  '시작하기': ['항목', '상태', '안내'],
  '수업 자료': [
    'lessonId', 'appName', 'subject', 'grade', 'lessonTitle', 'joinCode', 'lessonGoal',
    'achievementStandardCode', 'achievementStandard', 'assessmentCriteria',
    'rubricHigh', 'rubricMeet', 'rubricDeveloping', 'evidenceDescription',
    'materialTitle', 'materialText', 'materialUrl', 'startQuestion',
    'activityMode', 'version', 'sourceHash', 'lessonRevision', 'updatedAt'
  ],
  '학생별 현황': [
    'studentCode', 'lessonId', 'lessonRevision', 'sessionId', 'questionCount', 'relatedQuestionCount', 'lastActiveAt',
    'progressStatus', 'isPreview'
  ],
  '질문과 답변': [
    'timestamp', 'requestId', 'sessionId', 'studentCode', 'lessonId', 'turnNo', 'speaker',
    'text', 'activityMode', 'phase', 'managedKind', 'relatedQuestion', 'responseScore',
    'questionType', 'engagementState', 'curriculumRelation', 'supportLevel',
    'sourceStatus', 'sourceCue', 'primaryMove', 'safetyFlag', 'evidenceIds', 'rubricScoresJson', 'isClosing',
    'engineStatus', 'aiStatus', 'apiModel', 'apiInputTokens', 'apiOutputTokens', 'apiTotalTokens',
    'isPreview', 'lessonRevision', 'sourceHash'
  ],
  '교사 평가': [
    'studentCode', 'sessionId', 'lessonId', 'lessonRevision', 'automaticJudgment', 'evidenceSummary',
    'evidenceRequestIds',
    'questioningBest', 'passageComprehensionBest', 'achievementStandardBest', 'reflectionOpinionBest',
    'teacherDecision', 'teacherFeedback', 'improvementSuggestion',
    'nextLessonSuggestion', 'finalStatus', 'finalizedAt'
  ]
};

function liteText_(value, maxLength) {
  const result = String(value == null ? '' : value).trim();
  return maxLength ? result.slice(0, maxLength) : result;
}

function escapeLiteSheetText_(value) {
  const text = String(value == null ? '' : value);
  // 학생·교사·외부 엔진 문자열이 Google Sheets 수식으로 실행되지 않게 한다.
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function unescapeLiteSheetText_(value) {
  const text = String(value == null ? '' : value);
  return /^'[=+\-@]/.test(text) ? text.slice(1) : text;
}

function liteSheetSafeValue_(value) {
  return typeof value === 'string' ? escapeLiteSheetText_(value) : value;
}

function liteRequired_(value, label, maxLength) {
  const result = liteText_(value);
  if (!result) throw new Error(label + '을(를) 입력해 주세요.');
  if (maxLength && result.length > maxLength) {
    throw new Error(label + '은(는) ' + maxLength + '자 이내로 입력해 주세요.');
  }
  return result;
}

function liteOptional_(value, label, maxLength) {
  const result = liteText_(value);
  if (maxLength && result.length > maxLength) {
    throw new Error(label + '은(는) ' + maxLength + '자 이내로 입력해 주세요.');
  }
  return result;
}

function normalizeLiteMode_(value) {
  const mode = liteText_(value).toLowerCase();
  if (mode === 'evaluation' || mode === 'exploration') return mode;
  throw new Error('챗봇 운영 모드는 평가모드 또는 탐색모드를 선택해 주세요.');
}

function validateLiteApiKey_(value) {
  const key = liteText_(value);
  if (!/^sk-[A-Za-z0-9_-]{16,}$/.test(key)) {
    throw new Error('OpenAI API 키 형식을 확인해 주세요. 키는 sk-로 시작합니다.');
  }
  return key;
}

function validateLiteJoinCode_(value) {
  const code = liteText_(value);
  if (!/^\d{6}$/.test(code)) throw new Error('학생 참여코드는 숫자 6자리로 정해 주세요.');
  return code;
}

function liteClientData_(value) {
  return JSON.parse(JSON.stringify(value == null ? {} : value));
}

function liteFingerprint_(value, length) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value || ''),
    Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '').slice(0, length || 24);
}

function getOrCreateLiteDeploymentId_() {
  const properties = PropertiesService.getScriptProperties();
  let deploymentId = properties.getProperty(LITE_DEPLOYMENT_ID_PROPERTY_);
  if (/^LD-[A-Za-z0-9_-]{16,64}$/.test(String(deploymentId || ''))) return deploymentId;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    deploymentId = properties.getProperty(LITE_DEPLOYMENT_ID_PROPERTY_);
    if (!/^LD-[A-Za-z0-9_-]{16,64}$/.test(String(deploymentId || ''))) {
      deploymentId = 'LD-' + Utilities.getUuid().replace(/-/g, '');
      properties.setProperty(LITE_DEPLOYMENT_ID_PROPERTY_, deploymentId);
    }
    return deploymentId;
  } finally {
    lock.releaseLock();
  }
}

function clearLiteApiVerification_() {
  const properties = PropertiesService.getScriptProperties();
  properties.deleteProperty(LITE_API_VERIFIED_FINGERPRINT_PROPERTY_);
  properties.deleteProperty(LITE_API_VERIFIED_AT_PROPERTY_);
}

function markLiteApiVerified_(apiKey) {
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty(LITE_API_VERIFIED_FINGERPRINT_PROPERTY_, liteFingerprint_(apiKey, 24));
  properties.setProperty(LITE_API_VERIFIED_AT_PROPERTY_, new Date().toISOString());
}

function isLiteApiVerified_() {
  const properties = PropertiesService.getScriptProperties();
  const apiKey = properties.getProperty(LITE_API_KEY_PROPERTY_);
  const verified = properties.getProperty(LITE_API_VERIFIED_FINGERPRINT_PROPERTY_);
  return Boolean(apiKey && verified && verified === liteFingerprint_(apiKey, 24));
}

function clearLiteEngineVerification_() {
  const properties = PropertiesService.getScriptProperties();
  properties.deleteProperty(LITE_ENGINE_VERIFIED_ENDPOINT_PROPERTY_);
  properties.deleteProperty(LITE_ENGINE_VERIFIED_POLICY_PROPERTY_);
  properties.deleteProperty(LITE_ENGINE_VERIFIED_AT_PROPERTY_);
}

function markLiteEngineVerified_(endpoint, policyVersion) {
  endpoint = liteText_(endpoint, 1000);
  policyVersion = liteText_(policyVersion, 120);
  if (!endpoint || !policyVersion) throw new Error('확인한 중앙 엔진 정보가 비어 있습니다.');
  const properties = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (getLiteEngineEndpoint_() !== endpoint) {
      throw new Error('연결을 확인하는 동안 중앙 엔진 주소가 변경되었습니다. 다시 확인해 주세요.');
    }
    properties.setProperty(LITE_ENGINE_VERIFIED_ENDPOINT_PROPERTY_, endpoint);
    properties.setProperty(LITE_ENGINE_VERIFIED_POLICY_PROPERTY_, policyVersion);
    properties.setProperty(LITE_ENGINE_VERIFIED_AT_PROPERTY_, new Date().toISOString());
  } finally {
    lock.releaseLock();
  }
}

function invalidateLiteEngineVerificationIfMatches_(endpoint, policyVersion) {
  endpoint = liteText_(endpoint, 1000);
  policyVersion = liteText_(policyVersion, 120);
  if (!endpoint || !policyVersion) return false;
  const properties = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (getLiteEngineEndpoint_() !== endpoint ||
        properties.getProperty(LITE_ENGINE_VERIFIED_ENDPOINT_PROPERTY_) !== endpoint ||
        properties.getProperty(LITE_ENGINE_VERIFIED_POLICY_PROPERTY_) !== policyVersion) {
      return false;
    }
    properties.deleteProperty(LITE_ENGINE_VERIFIED_ENDPOINT_PROPERTY_);
    properties.deleteProperty(LITE_ENGINE_VERIFIED_POLICY_PROPERTY_);
    properties.deleteProperty(LITE_ENGINE_VERIFIED_AT_PROPERTY_);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function isLiteEngineVerified_() {
  const properties = PropertiesService.getScriptProperties();
  const endpoint = getLiteEngineEndpoint_();
  return Boolean(endpoint &&
    properties.getProperty(LITE_ENGINE_VERIFIED_ENDPOINT_PROPERTY_) === endpoint &&
    properties.getProperty(LITE_ENGINE_VERIFIED_POLICY_PROPERTY_));
}

function liteLessonVerificationKey_(settings) {
  settings = settings || {};
  return [
    liteText_(settings.lessonId, 80),
    'r' + Math.max(1, Number(settings.lessonRevision || 1)),
    liteText_(settings.sourceHash, 24)
  ].join(':');
}

function litePreviewVerificationKey_(settings) {
  const properties = PropertiesService.getScriptProperties();
  return [
    liteLessonVerificationKey_(settings),
    'api:' + String(properties.getProperty(LITE_API_VERIFIED_FINGERPRINT_PROPERTY_) || ''),
    'engine:' + String(properties.getProperty(LITE_ENGINE_VERIFIED_ENDPOINT_PROPERTY_) || ''),
    'policy:' + String(properties.getProperty(LITE_ENGINE_VERIFIED_POLICY_PROPERTY_) || '')
  ].join('|');
}

function readLitePreviewVerificationSnapshot_(settings) {
  const properties = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return {
      verificationKey:litePreviewVerificationKey_(settings),
      markerFingerprint:liteFingerprint_(
        properties.getProperty(LITE_PREVIEW_VERIFIED_LESSON_PROPERTY_) || '', 48
      )
    };
  } finally {
    lock.releaseLock();
  }
}

function markLitePreviewVerifiedKey_(verificationKey, expectedMarkerFingerprint) {
  const desired = String(verificationKey || '');
  const expected = liteText_(expectedMarkerFingerprint, 80);
  if (!desired) return false;
  const properties = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const current = properties.getProperty(LITE_PREVIEW_VERIFIED_LESSON_PROPERTY_) || '';
    if (current === desired) return true;
    if (!expected || liteFingerprint_(current, 48) !== expected) return false;
    properties.setProperty(LITE_PREVIEW_VERIFIED_LESSON_PROPERTY_, desired);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function markLitePreviewVerified_(settings) {
  const snapshot = readLitePreviewVerificationSnapshot_(settings);
  return markLitePreviewVerifiedKey_(snapshot.verificationKey, snapshot.markerFingerprint);
}

function isLitePreviewVerified_(settings) {
  const expected = litePreviewVerificationKey_(settings);
  return Boolean(settings && settings.lessonId && expected &&
    PropertiesService.getScriptProperties().getProperty(LITE_PREVIEW_VERIFIED_LESSON_PROPERTY_) === expected);
}

function clearLitePreviewAccess_() {
  const properties = PropertiesService.getScriptProperties();
  properties.deleteProperty(LITE_PREVIEW_ACCESS_TOKEN_PROPERTY_);
  properties.deleteProperty(LITE_PREVIEW_ACCESS_LESSON_PROPERTY_);
  properties.deleteProperty(LITE_PREVIEW_ACCESS_EXPIRES_PROPERTY_);
}

function getOrCreateLitePreviewAccessToken_(settings) {
  const properties = PropertiesService.getScriptProperties();
  const lessonKey = liteLessonVerificationKey_(settings);
  const token = properties.getProperty(LITE_PREVIEW_ACCESS_TOKEN_PROPERTY_);
  const savedLesson = properties.getProperty(LITE_PREVIEW_ACCESS_LESSON_PROPERTY_);
  const expiresAt = Number(properties.getProperty(LITE_PREVIEW_ACCESS_EXPIRES_PROPERTY_) || 0);
  if (token && savedLesson === lessonKey && expiresAt > Date.now()) return token;
  const nextToken = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  properties.setProperty(LITE_PREVIEW_ACCESS_TOKEN_PROPERTY_, nextToken);
  properties.setProperty(LITE_PREVIEW_ACCESS_LESSON_PROPERTY_, lessonKey);
  properties.setProperty(LITE_PREVIEW_ACCESS_EXPIRES_PROPERTY_, String(Date.now() + LITE_PREVIEW_ACCESS_TTL_MS_));
  return nextToken;
}

function isLitePreviewAccessToken_(token, settings) {
  const candidate = liteText_(token, 128);
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(candidate)) return false;
  const properties = PropertiesService.getScriptProperties();
  return candidate === properties.getProperty(LITE_PREVIEW_ACCESS_TOKEN_PROPERTY_) &&
    liteLessonVerificationKey_(settings) === properties.getProperty(LITE_PREVIEW_ACCESS_LESSON_PROPERTY_) &&
    Number(properties.getProperty(LITE_PREVIEW_ACCESS_EXPIRES_PROPERTY_) || 0) > Date.now();
}

function getLiteTeacherPreviewUrl_(settings) {
  const studentUrl = getLiteStudentUrl_();
  if (!studentUrl || !settings || !settings.lessonId) return '';
  const separator = studentUrl.indexOf('?') >= 0 ? '&' : '?';
  return studentUrl + separator + 'preview=' + encodeURIComponent(getOrCreateLitePreviewAccessToken_(settings));
}

function isLiteLessonOpen_(settings) {
  const closed = PropertiesService.getScriptProperties().getProperty(LITE_CLOSED_LESSON_PROPERTY_);
  return !closed || closed !== liteLessonVerificationKey_(settings);
}

function setLiteLessonOpen_(settings, open) {
  const properties = PropertiesService.getScriptProperties();
  if (open) properties.deleteProperty(LITE_CLOSED_LESSON_PROPERTY_);
  else properties.setProperty(LITE_CLOSED_LESSON_PROPERTY_, liteLessonVerificationKey_(settings));
}

function getOrCreateLiteTeacherAccessToken_() {
  const properties = PropertiesService.getScriptProperties();
  let token = properties.getProperty(LITE_TEACHER_ACCESS_TOKEN_PROPERTY_);
  if (!token) {
    token = Utilities.getUuid() + Utilities.getUuid();
    properties.setProperty(LITE_TEACHER_ACCESS_TOKEN_PROPERTY_, token);
  }
  return token;
}

function assertLiteTeacherAccess_(token) {
  const expected = PropertiesService.getScriptProperties()
    .getProperty(LITE_TEACHER_ACCESS_TOKEN_PROPERTY_);
  if (!expected || !token || String(expected) !== String(token)) {
    throw new Error('교사용 Google Sheet의 simbot 메뉴에서 다시 열어 주세요.');
  }
}

function validateLiteTeacherSetup_(payload) {
  payload = payload || {};
  const materialText = liteRequired_(payload.materialText, '수업자료 본문', 30000);
  if (materialText.length < 30) {
    throw new Error('수업자료 본문은 학생이 질문할 근거가 되도록 30자 이상 입력해 주세요.');
  }
  const materialUrl = liteText_(payload.materialUrl, 1000);
  if (materialUrl && !/^https?:\/\//i.test(materialUrl)) {
    throw new Error('수업자료 링크는 http:// 또는 https://로 시작해 주세요.');
  }
  const activityMode = normalizeLiteMode_(payload.activityMode);
  // 탐색모드에서는 설계를 적용하지 않지만, 다시 켤 수 있도록 입력 내용은 보존한다.
  const designField = activityMode === 'exploration' ? liteOptional_ : liteRequired_;

  return {
    lessonId: liteText_(payload.lessonId, 80),
    appName: liteRequired_(payload.appName, '챗봇 이름', 40),
    subject: liteRequired_(payload.subject, '교과', 40),
    grade: liteRequired_(payload.grade, '학년', 40),
    lessonTitle: liteRequired_(payload.lessonTitle, '수업명', 120),
    joinCode: validateLiteJoinCode_(payload.joinCode),
    lessonGoal: designField(payload.lessonGoal, '수업 목표', 500),
    achievementStandardCode: liteText_(payload.achievementStandardCode, 80),
    achievementStandard: designField(payload.achievementStandard, '성취기준', 1000),
    assessmentCriteria: designField(payload.assessmentCriteria, '평가기준', 1500),
    rubricHigh: designField(payload.rubricHigh, '도달 수준 기준', 1000),
    rubricMeet: designField(payload.rubricMeet, '성장 중 수준 기준', 1000),
    rubricDeveloping: designField(payload.rubricDeveloping, '도움 필요 수준 기준', 1000),
    evidenceDescription: designField(payload.evidenceDescription, '평가 근거', 1000),
    materialTitle: liteRequired_(payload.materialTitle, '수업자료 제목', 120),
    materialText: materialText,
    materialUrl: materialUrl,
    startQuestion: liteRequired_(payload.startQuestion, '시작 질문', 500),
    activityMode: activityMode,
    version: liteText_(payload.version, 30) || 'v1'
  };
}

function sanitizeLiteSettingsForStudent_(settings) {
  settings = settings || {};
  return {
    lessonId: liteText_(settings.lessonId, 80),
    appName: liteText_(settings.appName, 40) || 'simbot',
    subject: liteText_(settings.subject, 40),
    grade: liteText_(settings.grade, 40),
    lessonTitle: liteText_(settings.lessonTitle, 120),
    lessonGoal: settings.activityMode === 'exploration' ? '' : liteText_(settings.lessonGoal, 500),
    materialTitle: liteText_(settings.materialTitle, 120),
    materialText: liteText_(settings.materialText, 30000),
    materialUrl: liteText_(settings.materialUrl, 1000),
    startQuestion: liteText_(settings.startQuestion, 500),
    activityMode: settings.activityMode === 'exploration' ? 'exploration' : 'evaluation',
    version: liteText_(settings.version, 30) || 'v1',
    sourceHash: liteText_(settings.sourceHash, 24),
    lessonRevision: Math.max(1, Number(settings.lessonRevision || 1))
  };
}

function sanitizeLiteBootstrapForStudent_(settings) {
  settings = settings || {};
  return {
    lessonId: liteText_(settings.lessonId, 80),
    appName: liteText_(settings.appName, 40) || 'simbot',
    activityMode: settings.activityMode === 'exploration' ? 'exploration' : 'evaluation',
    sourceHash: liteText_(settings.sourceHash, 24),
    lessonRevision: Math.max(1, Number(settings.lessonRevision || 1))
  };
}

function buildLiteReadiness_(settings, context) {
  settings = settings || {};
  context = context || {};
  const backwardDesignEnabled = settings.activityMode !== 'exploration';
  const backwardReady = !backwardDesignEnabled || Boolean(
    settings.lessonGoal && settings.achievementStandard && settings.assessmentCriteria &&
    settings.rubricHigh && settings.rubricMeet && settings.rubricDeveloping &&
    settings.evidenceDescription
  );
  const materialReady = Boolean(
    settings.lessonTitle && settings.materialTitle &&
    String(settings.materialText || '').trim().length >= 30 && settings.startQuestion
  );
  const apiConfigured = Boolean(context.apiConfigured);
  const apiVerified = apiConfigured && Boolean(context.apiVerified);
  const engineConfigured = Boolean(context.engineConfigured);
  const engineVerified = engineConfigured && Boolean(context.engineVerified);
  const previewVerified = Boolean(context.previewVerified);
  const lessonOpen = context.lessonOpen !== false;
  const checks = [
    {
      key: 'apiSaved',
      label: '개인 API 저장',
      state: apiConfigured ? 'pass' : 'block',
      detail: apiConfigured ? '교사 소유 설정 저장소에 저장되어 있습니다.' : '개인 API 키를 저장해 주세요.'
    },
    {
      key: 'apiVerified',
      label: '개인 API 연결 확인',
      state: apiVerified ? 'pass' : 'block',
      detail: apiVerified ? '현재 저장된 키로 실제 연결을 확인했습니다.' : '키를 저장한 뒤 “연결 확인”을 실행해 주세요.'
    },
    {
      key: 'backwardDesign',
      label: '백워드 평가 설계',
      state: backwardReady ? 'pass' : 'block',
      enabled: backwardDesignEnabled,
      detail: !backwardDesignEnabled
        ? '사용 안 함 — 자료 탐색모드에서는 백워드 평가 설계를 적용하지 않습니다.'
        : backwardReady ? '목표·성취기준·평가기준·평가 근거가 준비되었습니다.' : '목표부터 평가 근거까지 필수 항목을 입력해 주세요.'
    },
    {
      key: 'material',
      label: '수업자료',
      state: materialReady ? 'pass' : 'block',
      detail: materialReady ? '학생 질문의 근거 자료와 시작 질문이 준비되었습니다.' : '30자 이상의 수업자료와 시작 질문을 입력해 주세요.'
    },
    {
      key: 'lessonAccess',
      label: '학생 참여코드',
      state: /^\d{6}$/.test(String(settings.joinCode || '')) ? 'pass' : 'block',
      detail: /^\d{6}$/.test(String(settings.joinCode || '')) ? '학생에게만 안내할 숫자 6자리 참여코드가 준비되었습니다.' : '학생 참여코드를 숫자 6자리로 정해 주세요.'
    },
    {
      key: 'mode',
      label: '운영 모드',
      state: settings.activityMode === 'evaluation' || settings.activityMode === 'exploration' ? 'pass' : 'block',
      detail: settings.activityMode === 'exploration' ? '자료 탐색모드로 운영합니다.' : settings.activityMode === 'evaluation' ? '평가모드로 운영합니다.' : '평가모드 또는 자료 탐색모드를 선택해 주세요.'
    },
    {
      key: 'engine',
      label: '기존 챗봇 엔진',
      state: engineConfigured ? 'pass' : 'block',
      detail: engineConfigured ? '기존 질문중심 챗봇의 공통 엔진이 배포본에 연결되었습니다.' : '운영자가 기존 질문중심 챗봇 주소와 배포본 연결키를 준비해야 합니다.'
    },
    {
      key: 'engineVerified',
      label: '기존 챗봇 연결 확인',
      state: engineVerified ? 'pass' : 'block',
      detail: engineVerified ? '현재 웹 챗봇과 같은 공통 질문 엔진의 버전과 응답을 확인했습니다.' : '“기존 챗봇 연결 확인”을 실행해 주세요.'
    },
    {
      key: 'deployment',
      label: '학생용 배포',
      state: context.studentUrl ? 'pass' : 'block',
      detail: context.studentUrl ? '학생용 웹앱 주소가 준비되었습니다.' : '웹앱으로 새 배포한 뒤 학생 주소를 확인해 주세요.'
    },
    {
      key: 'preview',
      label: '현재 수업 미리보기',
      state: previewVerified ? 'pass' : 'block',
      detail: previewVerified ? '현재 수업 버전에서 99-999 실제 대화를 확인했습니다.' : '학생 화면에서 99-999로 질문을 한 번 보내고 상태를 새로고침해 주세요.'
    },
    {
      key: 'lessonOpen',
      label: '수업 배포 상태',
      state: lessonOpen ? 'pass' : 'block',
      detail: lessonOpen ? '학생 참여를 받을 수 있도록 열려 있습니다.' : '현재 수업 배포를 종료했습니다. 다시 열기 전에는 학생이 참여할 수 없습니다.'
    }
  ];
  const requiredForSetup = ['apiSaved', 'backwardDesign', 'material', 'lessonAccess', 'mode'];
  const setupReady = checks.filter(function (item) {
    return requiredForSetup.indexOf(item.key) >= 0;
  }).every(function (item) { return item.state === 'pass'; });
  const runtimeReady = setupReady && apiVerified && engineVerified && lessonOpen;
  const distributionReady = runtimeReady && Boolean(context.studentUrl) && previewVerified;
  return {
    level: distributionReady ? 'distribution_ready' : setupReady ? 'setup_ready' : 'draft',
    setupReady: setupReady,
    backwardDesignEnabled: backwardDesignEnabled,
    runtimeReady: runtimeReady,
    lessonOpen: lessonOpen,
    distributionReady: distributionReady,
    checks: checks,
    summary: !lessonOpen
      ? '현재 수업 배포가 종료되었습니다. 다시 열기 전에는 학생이 참여할 수 없습니다.'
      : distributionReady
      ? '학생 배포 준비가 완료되었습니다. 현재 수업의 99-999 미리보기 기록도 확인했습니다.'
      : runtimeReady && context.studentUrl
        ? '학생 화면에서 99-999로 질문을 한 번 보낸 뒤 준비 상태를 새로고침해 주세요.'
        : setupReady
          ? '교사 입력은 완료되었습니다. 개인 API와 기존 질문중심 챗봇의 실제 연결 확인이 남았습니다.'
        : '위에서 “필수”로 표시된 교사 설정부터 완료해 주세요.'
  };
}

function buildLiteCurrentReadiness_(settings) {
  settings = settings || readLiteTeacherSettings_();
  return buildLiteReadiness_(settings, {
    apiConfigured: hasLiteApiKey_(),
    apiVerified: isLiteApiVerified_(),
    engineConfigured: hasLiteEngineEndpoint_(),
    engineVerified: isLiteEngineVerified_(),
    studentUrl: getLiteStudentUrl_(),
    previewVerified: isLitePreviewVerified_(settings),
    lessonOpen: isLiteLessonOpen_(settings)
  });
}

function getLiteSpreadsheet_() {
  const properties = PropertiesService.getScriptProperties();
  const savedId = properties.getProperty(LITE_SPREADSHEET_ID_PROPERTY_);
  if (savedId) return SpreadsheetApp.openById(savedId);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error('교사용 Google Sheet에서 simbot을 실행해 주세요.');
  properties.setProperty(LITE_SPREADSHEET_ID_PROPERTY_, active.getId());
  return active;
}

function requireLiteTeacherContext_() {
  try {
    SpreadsheetApp.getUi();
  } catch (error) {
    throw new Error('교사용 Google Sheet의 메뉴에서 실행해 주세요.');
  }
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error('교사용 Google Sheet의 메뉴에서 열어 주세요.');
  const savedId = PropertiesService.getScriptProperties().getProperty(LITE_SPREADSHEET_ID_PROPERTY_);
  if (savedId && String(savedId) !== String(active.getId())) {
    throw new Error('이 simbot과 연결된 교사용 Google Sheet에서 실행해 주세요.');
  }
  return active;
}

function ensureLiteWorkbook_(spreadsheet) {
  Object.keys(LITE_SHEET_HEADERS_).forEach(function (name) {
    ensureLiteSheet_(spreadsheet, name, LITE_SHEET_HEADERS_[name]);
  });
  writeLiteStartHere_(spreadsheet);
}

function ensureLiteSheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  const current = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .map(function (value) { return String(value).trim(); });
  const missing = headers.filter(function (header) { return current.indexOf(header) < 0; });
  if (missing.length) {
    sheet.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
  }
  sheet.setFrozenRows(1);
  return sheet;
}

function writeLiteStartHere_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName('시작하기');
  const rows = [
    ['항목', '상태', '안내'],
    ['1. API 연결', '', 'simbot → 교사 설정 열기에서 개인 API를 저장합니다.'],
    ['2. 평가 설계', '', '백워드 평가 설계를 켜면 목표부터 평가 근거까지 입력합니다. 끄면 자료 탐색모드로 운영하며 입력한 설계는 보관합니다.'],
    ['3. 수업자료', '', '학생이 질문할 본문과 시작 질문, 운영 모드를 입력합니다.'],
    ['4. 미리보기', '', '학생용 주소에서 99-999로 전체 과정을 점검합니다.'],
    ['5. 학생 배포', '', '점검이 모두 통과한 뒤 학생용 /exec 주소만 공유합니다.']
  ];
  if (sheet.getLastRow() <= 1) {
    sheet.clearContents();
    sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, rows[0].length);
  }
}

function updateLiteStartHereStatus_(spreadsheet, readiness) {
  const sheet = spreadsheet.getSheetByName('시작하기');
  if (!sheet || sheet.getLastRow() < 6) return;
  const checks = {};
  (readiness && readiness.checks || []).forEach(function (item) { checks[item.key] = item.state === 'pass'; });
  const statuses = [
    checks.apiSaved && checks.apiVerified ? '완료' : checks.apiSaved ? '연결 확인 필요' : '입력 필요',
    readiness && readiness.backwardDesignEnabled === false ? '사용 안 함' : checks.backwardDesign ? '완료' : '입력 필요',
    checks.material && checks.mode ? '완료' : '입력 필요',
    checks.preview ? '완료' : readiness && readiness.runtimeReady ? '99-999 점검 필요' : '연결 준비 필요',
    readiness && readiness.distributionReady ? '배포 가능' : readiness && readiness.lessonOpen === false ? '수업 종료' : '점검 필요'
  ];
  sheet.getRange(2, 2, statuses.length, 1).setValues(statuses.map(function (value) { return [value]; }));
}

function liteRowsAsObjects_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function (value) { return String(value).trim(); });
  return values.slice(1).map(function (row, rowIndex) {
    const object = {};
    headers.forEach(function (header, index) {
      if (header) object[header] = typeof row[index] === 'string'
        ? unescapeLiteSheetText_(row[index])
        : row[index];
    });
    Object.defineProperty(object, '__liteRowNumber', {
      value:rowIndex + 2,
      enumerable:false
    });
    return object;
  }).filter(function (row) {
    return headers.some(function (header) { return header && row[header] !== ''; });
  });
}

function readLiteTeacherSettings_(spreadsheet, options) {
  spreadsheet = spreadsheet || getLiteSpreadsheet_();
  if (!(options && options.skipEnsure)) ensureLiteWorkbook_(spreadsheet);
  const rows = liteRowsAsObjects_(spreadsheet.getSheetByName('수업 자료'));
  const settings = rows[0] || {};
  // 0.1.x 사본은 개정 열이 없으므로, 다시 저장하기 전에도 새 중앙 엔진을 사용할 수 있게
  // 같은 설정에서 항상 같은 해시와 첫 개정 번호를 계산해 돌려준다.
  if (settings.lessonId) {
    settings.sourceHash = liteText_(settings.sourceHash, 24) || makeLiteSettingsHash_(settings);
    settings.lessonRevision = Math.max(1, Number(settings.lessonRevision || 1));
  }
  return settings;
}

function liteRowsByColumnValue_(sheet, columnName, value) {
  return liteRowsAsObjects_(sheet).filter(function (row) {
    return String(row[columnName]) === String(value);
  });
}

function saveLiteTeacherSettings_(settings, options) {
  options = options || {};
  const spreadsheet = getLiteSpreadsheet_();
  ensureLiteWorkbook_(spreadsheet);
  const sheet = spreadsheet.getSheetByName('수업 자료');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .map(function (value) { return String(value).trim(); });
  const previous = liteRowsAsObjects_(sheet)[0] || {};
  const sourceHash = makeLiteSettingsHash_(settings);
  const newLesson = Boolean(options.newLesson);
  const changed = newLesson || String(previous.sourceHash || '') !== sourceHash;
  const previousRevision = Math.max(0, Number(previous.lessonRevision || 0));
  const row = Object.assign({}, settings, {
    lessonId: newLesson
      ? ('LESSON-' + Utilities.getUuid().replace(/-/g, '').slice(-12).toUpperCase())
      : settings.lessonId || previous.lessonId || ('LESSON-' + Utilities.getUuid().replace(/-/g, '').slice(-12).toUpperCase()),
    sourceHash: sourceHash,
    lessonRevision: newLesson ? 1 : changed ? previousRevision + 1 : Math.max(1, previousRevision),
    updatedAt: new Date()
  });
  const values = headers.map(function (header) {
    return Object.prototype.hasOwnProperty.call(row, header) ? liteSheetSafeValue_(row[header]) : '';
  });
  if (sheet.getLastRow() < 2) {
    sheet.getRange(2, 1, 1, headers.length).setValues([values]);
  } else {
    sheet.getRange(2, 1, 1, headers.length).setValues([values]);
    if (sheet.getLastRow() > 2) {
      sheet.getRange(3, 1, sheet.getLastRow() - 2, headers.length).clearContent();
    }
  }
  if (changed) clearLitePreviewAccess_();
  return row;
}

function makeLiteSettingsHash_(settings) {
  const fields = [
    'appName', 'subject', 'grade', 'lessonTitle', 'joinCode', 'lessonGoal',
    'achievementStandardCode', 'achievementStandard', 'assessmentCriteria', 'rubricHigh',
    'rubricMeet', 'rubricDeveloping', 'evidenceDescription', 'materialTitle',
    'materialText', 'materialUrl', 'startQuestion', 'activityMode', 'version'
  ];
  const source = fields.map(function (field) {
    return field + '=' + liteText_(settings && settings[field]);
  }).join('\n');
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    source,
    Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '').slice(0, 24);
}

function getLiteStudentUrl_() {
  try {
    return ScriptApp.getService().getUrl() || '';
  } catch (error) {
    return '';
  }
}

function hasLiteApiKey_() {
  return Boolean(PropertiesService.getScriptProperties().getProperty(LITE_API_KEY_PROPERTY_));
}
