/**
 * 교사용 경량 질문챗봇 — 설정과 교사 소유 Sheet만 담당합니다.
 * API 키는 Script Properties에만 저장하며 Sheet 행으로 만들지 않습니다.
 */

const LITE_APP_VERSION_ = '0.1.0';
const LITE_API_KEY_PROPERTY_ = 'TEACHER_OPENAI_API_KEY';
const LITE_SPREADSHEET_ID_PROPERTY_ = 'TEACHER_SPREADSHEET_ID';
const LITE_ENGINE_ENDPOINT_PROPERTY_ = 'CENTRAL_ENGINE_ENDPOINT';
const LITE_TEACHER_ACCESS_TOKEN_PROPERTY_ = 'LITE_TEACHER_ACCESS_TOKEN';

const LITE_SHEET_HEADERS_ = {
  '시작하기': ['항목', '상태', '안내'],
  '수업 자료': [
    'lessonId', 'appName', 'subject', 'grade', 'lessonTitle', 'lessonGoal',
    'achievementStandardCode', 'achievementStandard', 'assessmentCriteria',
    'rubricHigh', 'rubricMeet', 'rubricDeveloping', 'evidenceDescription',
    'materialTitle', 'materialText', 'materialUrl', 'startQuestion',
    'activityMode', 'version', 'updatedAt'
  ],
  '학생별 현황': [
    'studentCode', 'questionCount', 'relatedQuestionCount', 'lastActiveAt',
    'progressStatus', 'isPreview'
  ],
  '질문과 답변': [
    'timestamp', 'requestId', 'sessionId', 'studentCode', 'turnNo', 'speaker',
    'text', 'activityMode', 'phase', 'managedKind', 'evidenceIds',
    'engineStatus', 'aiStatus', 'isPreview'
  ],
  '교사 평가': [
    'studentCode', 'lessonId', 'automaticJudgment', 'evidenceSummary',
    'teacherDecision', 'teacherFeedback', 'improvementSuggestion',
    'nextLessonSuggestion', 'finalStatus', 'finalizedAt'
  ]
};

function liteText_(value, maxLength) {
  const result = String(value == null ? '' : value).trim();
  return maxLength ? result.slice(0, maxLength) : result;
}

function liteRequired_(value, label, maxLength) {
  const result = liteText_(value);
  if (!result) throw new Error(label + '을(를) 입력해 주세요.');
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
    throw new Error('교사용 Google Sheet의 경량 질문챗봇 메뉴에서 다시 열어 주세요.');
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

  return {
    lessonId: liteText_(payload.lessonId, 80),
    appName: liteRequired_(payload.appName, '챗봇 이름', 40),
    subject: liteRequired_(payload.subject, '교과', 40),
    grade: liteRequired_(payload.grade, '학년', 40),
    lessonTitle: liteRequired_(payload.lessonTitle, '수업명', 120),
    lessonGoal: liteRequired_(payload.lessonGoal, '수업 목표', 500),
    achievementStandardCode: liteText_(payload.achievementStandardCode, 80),
    achievementStandard: liteRequired_(payload.achievementStandard, '성취기준', 1000),
    assessmentCriteria: liteRequired_(payload.assessmentCriteria, '평가기준', 1500),
    rubricHigh: liteRequired_(payload.rubricHigh, '도달 수준 기준', 1000),
    rubricMeet: liteRequired_(payload.rubricMeet, '성장 중 수준 기준', 1000),
    rubricDeveloping: liteRequired_(payload.rubricDeveloping, '도움 필요 수준 기준', 1000),
    evidenceDescription: liteRequired_(payload.evidenceDescription, '평가 근거', 1000),
    materialTitle: liteRequired_(payload.materialTitle, '수업자료 제목', 120),
    materialText: materialText,
    materialUrl: materialUrl,
    startQuestion: liteRequired_(payload.startQuestion, '시작 질문', 500),
    activityMode: normalizeLiteMode_(payload.activityMode),
    version: liteText_(payload.version, 30) || 'v1'
  };
}

function sanitizeLiteSettingsForStudent_(settings) {
  settings = settings || {};
  return {
    appName: liteText_(settings.appName, 40) || '질문이',
    subject: liteText_(settings.subject, 40),
    grade: liteText_(settings.grade, 40),
    lessonTitle: liteText_(settings.lessonTitle, 120),
    lessonGoal: liteText_(settings.lessonGoal, 500),
    materialTitle: liteText_(settings.materialTitle, 120),
    materialText: liteText_(settings.materialText, 30000),
    materialUrl: liteText_(settings.materialUrl, 1000),
    startQuestion: liteText_(settings.startQuestion, 500),
    activityMode: settings.activityMode === 'exploration' ? 'exploration' : 'evaluation',
    version: liteText_(settings.version, 30) || 'v1'
  };
}

function buildLiteReadiness_(settings, context) {
  settings = settings || {};
  context = context || {};
  const backwardReady = Boolean(
    settings.lessonGoal && settings.achievementStandard && settings.assessmentCriteria &&
    settings.rubricHigh && settings.rubricMeet && settings.rubricDeveloping &&
    settings.evidenceDescription
  );
  const materialReady = Boolean(
    settings.lessonTitle && settings.materialTitle &&
    String(settings.materialText || '').trim().length >= 30 && settings.startQuestion
  );
  const checks = [
    {
      key: 'api',
      label: '개인 API',
      state: context.apiConfigured ? 'pass' : 'block',
      detail: context.apiConfigured ? '교사 소유 설정 저장소에 연결되어 있습니다.' : 'API 키를 저장하고 연결을 확인해 주세요.'
    },
    {
      key: 'backwardDesign',
      label: '백워드 평가 설계',
      state: backwardReady ? 'pass' : 'block',
      detail: backwardReady ? '목표·성취기준·평가기준·평가 근거가 준비되었습니다.' : '목표부터 평가 근거까지 필수 항목을 입력해 주세요.'
    },
    {
      key: 'material',
      label: '수업자료',
      state: materialReady ? 'pass' : 'block',
      detail: materialReady ? '학생 질문의 근거 자료와 시작 질문이 준비되었습니다.' : '30자 이상의 수업자료와 시작 질문을 입력해 주세요.'
    },
    {
      key: 'mode',
      label: '운영 모드',
      state: settings.activityMode === 'evaluation' || settings.activityMode === 'exploration' ? 'pass' : 'block',
      detail: settings.activityMode === 'exploration' ? '탐색모드로 운영합니다.' : settings.activityMode === 'evaluation' ? '평가모드로 운영합니다.' : '평가모드 또는 탐색모드를 선택해 주세요.'
    },
    {
      key: 'engine',
      label: '중앙 엔진',
      state: context.engineConfigured ? 'pass' : 'block',
      detail: context.engineConfigured ? '중앙 정책 엔진 주소가 연결되었습니다.' : '2단계에서 중앙 정책 엔진을 연결해야 합니다.'
    },
    {
      key: 'deployment',
      label: '학생용 배포',
      state: context.studentUrl ? 'pass' : 'block',
      detail: context.studentUrl ? '학생용 웹앱 주소가 준비되었습니다.' : '웹앱으로 새 배포한 뒤 학생 주소를 확인해 주세요.'
    }
  ];
  const setupReady = checks.slice(0, 4).every(function (item) { return item.state === 'pass'; });
  const distributionReady = checks.every(function (item) { return item.state === 'pass'; });
  return {
    level: distributionReady ? 'distribution_ready' : setupReady ? 'setup_ready' : 'draft',
    setupReady: setupReady,
    distributionReady: distributionReady,
    checks: checks,
    summary: distributionReady
      ? '학생 배포 준비가 완료되었습니다. 99-999로 마지막 미리보기를 해 주세요.'
      : setupReady
        ? '교사 입력은 완료되었습니다. 중앙 엔진 연결과 웹앱 배포가 남았습니다.'
        : '위에서 “필수”로 표시된 교사 설정부터 완료해 주세요.'
  };
}

function getLiteSpreadsheet_() {
  const properties = PropertiesService.getScriptProperties();
  const savedId = properties.getProperty(LITE_SPREADSHEET_ID_PROPERTY_);
  if (savedId) return SpreadsheetApp.openById(savedId);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error('교사용 Google Sheet에서 경량앱을 실행해 주세요.');
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
    throw new Error('이 경량앱과 연결된 교사용 Google Sheet에서 실행해 주세요.');
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
    ['1. API 연결', '', '경량 질문챗봇 → 교사 설정 열기에서 개인 API를 저장합니다.'],
    ['2. 평가 설계', '', '수업 목표 → 성취기준 → 평가기준 → 평가 근거 순서로 입력합니다.'],
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

function liteRowsAsObjects_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function (value) { return String(value).trim(); });
  return values.slice(1).map(function (row) {
    const object = {};
    headers.forEach(function (header, index) {
      if (header) object[header] = row[index];
    });
    return object;
  }).filter(function (row) {
    return headers.some(function (header) { return header && row[header] !== ''; });
  });
}

function readLiteTeacherSettings_() {
  const spreadsheet = getLiteSpreadsheet_();
  ensureLiteWorkbook_(spreadsheet);
  const rows = liteRowsAsObjects_(spreadsheet.getSheetByName('수업 자료'));
  return rows[0] || {};
}

function saveLiteTeacherSettings_(settings) {
  const spreadsheet = getLiteSpreadsheet_();
  ensureLiteWorkbook_(spreadsheet);
  const sheet = spreadsheet.getSheetByName('수업 자료');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .map(function (value) { return String(value).trim(); });
  const row = Object.assign({}, settings, {
    lessonId: settings.lessonId || ('LESSON-' + Utilities.getUuid().slice(0, 8).toUpperCase()),
    updatedAt: new Date()
  });
  const values = headers.map(function (header) {
    return Object.prototype.hasOwnProperty.call(row, header) ? row[header] : '';
  });
  if (sheet.getLastRow() < 2) {
    sheet.getRange(2, 1, 1, headers.length).setValues([values]);
  } else {
    sheet.getRange(2, 1, 1, headers.length).setValues([values]);
    if (sheet.getLastRow() > 2) {
      sheet.getRange(3, 1, sheet.getLastRow() - 2, headers.length).clearContent();
    }
  }
  return row;
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
