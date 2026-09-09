/**
 * 교사용 경량 질문챗봇 공개 진입점.
 * 기존 gas/ 공개 체험본과 별도 Apps Script 프로젝트로 배포합니다.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('경량 질문챗봇')
    .addItem('1. 최초 준비', 'setupLiteProject')
    .addItem('2. 교사 설정 열기', 'showLiteTeacherSetup')
    .addSeparator()
    .addItem('3. 학생 현황·평가 검수', 'showLiteTeacherDashboard')
    .addItem('학생용 주소 확인', 'showLiteStudentLink')
    .addItem('API 키 삭제', 'clearLiteApiKeyFromMenu')
    .addToUi();
}

function showLiteTeacherDashboard() {
  requireLiteTeacherContext_();
  ensureLiteWorkbook_(getLiteSpreadsheet_());
  const template = HtmlService.createTemplateFromFile('TeacherDashboard');
  template.teacherAccessToken = getOrCreateLiteTeacherAccessToken_();
  const html = template.evaluate()
    .setWidth(1040)
    .setHeight(760);
  SpreadsheetApp.getUi().showModalDialog(html, '경량 질문챗봇 · 학생 현황과 평가 검수');
}

function setupLiteProject() {
  const spreadsheet = requireLiteTeacherContext_();
  PropertiesService.getScriptProperties().setProperty(
    LITE_SPREADSHEET_ID_PROPERTY_, spreadsheet.getId()
  );
  getOrCreateLiteTeacherAccessToken_();
  ensureLiteWorkbook_(spreadsheet);
  spreadsheet.toast(
    '교사용 시트 다섯 장을 준비했습니다. 이제 교사 설정을 열어 주세요.',
    '경량 질문챗봇',
    7
  );
  showLiteTeacherSetup();
}

function showLiteTeacherSetup() {
  requireLiteTeacherContext_();
  ensureLiteWorkbook_(getLiteSpreadsheet_());
  const template = HtmlService.createTemplateFromFile('TeacherSetup');
  template.teacherAccessToken = getOrCreateLiteTeacherAccessToken_();
  const html = template.evaluate()
    .setWidth(1040)
    .setHeight(760);
  SpreadsheetApp.getUi().showModalDialog(html, '경량 질문챗봇 · 교사 설정');
}

function includeLite_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getLiteTeacherSetupData(teacherAccessToken) {
  assertLiteTeacherAccess_(teacherAccessToken);
  const settings = readLiteTeacherSettings_();
  const studentUrl = getLiteStudentUrl_();
  return {
    appVersion: LITE_APP_VERSION_,
    settings: settings,
    api: { configured: hasLiteApiKey_() },
    studentUrl: studentUrl,
    readiness: buildLiteReadiness_(settings, {
      apiConfigured: hasLiteApiKey_(),
      engineConfigured: hasLiteEngineEndpoint_(),
      studentUrl: studentUrl
    })
  };
}

function saveLiteTeacherSetup(teacherAccessToken, payload) {
  assertLiteTeacherAccess_(teacherAccessToken);
  const settings = validateLiteTeacherSetup_(payload);
  const saved = saveLiteTeacherSettings_(settings);
  const studentUrl = getLiteStudentUrl_();
  const readiness = buildLiteReadiness_(saved, {
    apiConfigured: hasLiteApiKey_(),
    engineConfigured: hasLiteEngineEndpoint_(),
    studentUrl: studentUrl
  });
  return {
    ok: true,
    message: '평가 설계와 수업자료를 교사 Google Sheet에 저장했습니다.',
    lessonId: saved.lessonId,
    studentUrl: studentUrl,
    readiness: readiness
  };
}

function saveLiteApiKey(teacherAccessToken, apiKey) {
  assertLiteTeacherAccess_(teacherAccessToken);
  const key = validateLiteApiKey_(apiKey);
  PropertiesService.getScriptProperties().setProperty(LITE_API_KEY_PROPERTY_, key);
  return {
    ok: true,
    configured: true,
    message: 'API 키를 교사 소유 Apps Script 설정에 저장했습니다. Sheet에는 기록하지 않았습니다.'
  };
}

function testLiteApiConnection(teacherAccessToken) {
  assertLiteTeacherAccess_(teacherAccessToken);
  const key = PropertiesService.getScriptProperties().getProperty(LITE_API_KEY_PROPERTY_);
  if (!key) throw new Error('먼저 개인 API 키를 저장해 주세요.');
  const response = UrlFetchApp.fetch('https://api.openai.com/v1/models', {
    method: 'get',
    headers: { Authorization: 'Bearer ' + key },
    muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  if (status !== 200) {
    let message = 'API 연결을 확인하지 못했습니다. 키와 결제·사용 한도를 확인해 주세요.';
    try {
      const body = JSON.parse(response.getContentText());
      if (body && body.error && body.error.message) message += ' (' + body.error.message + ')';
    } catch (error) {}
    throw new Error(message);
  }
  return { ok: true, configured: true, message: '개인 API 연결을 확인했습니다.' };
}

function clearLiteApiKeyForTeacher(teacherAccessToken) {
  assertLiteTeacherAccess_(teacherAccessToken);
  return clearLiteApiKey_();
}

function clearLiteApiKey_() {
  PropertiesService.getScriptProperties().deleteProperty(LITE_API_KEY_PROPERTY_);
  return { ok: true, configured: false, message: '저장된 API 키를 삭제했습니다.' };
}

function clearLiteApiKeyFromMenu() {
  requireLiteTeacherContext_();
  clearLiteApiKey_();
  SpreadsheetApp.getActiveSpreadsheet().toast(
    '저장된 API 키를 삭제했습니다.', '경량 질문챗봇', 5
  );
}

function showLiteStudentLink() {
  requireLiteTeacherContext_();
  const url = getLiteStudentUrl_();
  if (!url) {
    SpreadsheetApp.getUi().alert(
      '아직 학생용 주소가 없습니다. 배포 → 새 배포 → 웹 앱을 실행해 주세요.'
    );
    return;
  }
  const escaped = String(url).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const html = HtmlService.createHtmlOutput(
    '<div style="font:15px/1.6 Arial,sans-serif;padding:20px">' +
    '<h2>학생용 주소</h2><p>설정 준비 점검을 통과한 뒤 이 주소만 학생에게 공유합니다.</p>' +
    '<p><a target="_blank" rel="noopener noreferrer" href="' + escaped + '">' + escaped + '</a></p>' +
    '<p>교사 미리보기 코드는 <strong>99-999</strong>입니다.</p></div>'
  ).setWidth(600).setHeight(280);
  SpreadsheetApp.getUi().showModalDialog(html, '경량 질문챗봇 · 학생 배포');
}

function doGet() {
  return HtmlService.createTemplateFromFile('Student')
    .evaluate()
    .setTitle('경량 질문챗봇')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getLiteStudentBootstrap() {
  const settings = readLiteTeacherSettings_();
  return {
    appVersion: LITE_APP_VERSION_,
    lesson: sanitizeLiteSettingsForStudent_(settings),
    engineReady: hasLiteEngineEndpoint_(),
    chatReady: hasLiteEngineEndpoint_() && hasLiteApiKey_() && Boolean(settings.lessonId)
  };
}
