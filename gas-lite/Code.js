/**
 * simbot(simple bot) 공개 진입점.
 * 기존 gas/ 공개 체험본과 별도 Apps Script 프로젝트로 배포합니다.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('simbot')
    .addItem('1. 최초 준비', 'setupLiteProject')
    .addItem('2. 교사 설정 열기', 'showLiteTeacherSetup')
    .addSeparator()
    .addItem('3. 학생 현황·평가 검수', 'showLiteTeacherDashboard')
    .addItem('학생용 주소 확인', 'showLiteStudentLink')
    .addItem('현재 수업 배포 종료', 'closeLiteLessonFromMenu')
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
  SpreadsheetApp.getUi().showModalDialog(html, 'simbot · 학생 현황과 평가 검수');
}

function setupLiteProject() {
  const spreadsheet = requireLiteTeacherContext_();
  PropertiesService.getScriptProperties().setProperty(
    LITE_SPREADSHEET_ID_PROPERTY_, spreadsheet.getId()
  );
  getOrCreateLiteTeacherAccessToken_();
  getOrCreateLiteSessionSecret_();
  getOrCreateLiteDeploymentId_();
  ensureLiteWorkbook_(spreadsheet);
  spreadsheet.toast(
    '교사용 시트 다섯 장을 준비했습니다. 이제 교사 설정을 열어 주세요.',
    'simbot',
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
  SpreadsheetApp.getUi().showModalDialog(html, 'simbot · 교사 설정');
}

function includeLite_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getLiteTeacherSetupData(teacherAccessToken) {
  assertLiteTeacherAccess_(teacherAccessToken);
  const settings = readLiteTeacherSettings_();
  const studentUrl = getLiteStudentUrl_();
  const previewUrl = getLiteTeacherPreviewUrl_(settings);
  const readiness = buildLiteCurrentReadiness_(settings);
  updateLiteStartHereStatus_(getLiteSpreadsheet_(), readiness);
  return {
    appVersion: LITE_APP_VERSION_,
    settings: liteClientData_(settings),
    api: { configured: hasLiteApiKey_(), verified: isLiteApiVerified_() },
    engine: { configured: hasLiteEngineEndpoint_(), verified: isLiteEngineVerified_() },
    studentUrl: studentUrl,
    previewUrl: previewUrl,
    readiness: readiness
  };
}

function saveLiteTeacherSetup(teacherAccessToken, payload) {
  assertLiteTeacherAccess_(teacherAccessToken);
  const settings = validateLiteTeacherSetup_(payload);
  const saved = saveLiteTeacherSettings_(settings);
  const studentUrl = getLiteStudentUrl_();
  const previewUrl = getLiteTeacherPreviewUrl_(saved);
  const readiness = buildLiteCurrentReadiness_(saved);
  updateLiteStartHereStatus_(getLiteSpreadsheet_(), readiness);
  return {
    ok: true,
    message: '평가 설계와 수업자료를 교사 Google Sheet에 저장했습니다.',
    lessonId: saved.lessonId,
    studentUrl: studentUrl,
    previewUrl: previewUrl,
    readiness: readiness
  };
}

function saveLiteApiKey(teacherAccessToken, apiKey) {
  assertLiteTeacherAccess_(teacherAccessToken);
  const key = validateLiteApiKey_(apiKey);
  PropertiesService.getScriptProperties().setProperty(LITE_API_KEY_PROPERTY_, key);
  clearLiteApiVerification_();
  return {
    ok: true,
    configured: true,
    verified: false,
    message: 'API 키를 안전하게 저장했습니다. 이제 “연결 확인”을 실행해 주세요.'
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
  markLiteApiVerified_(key);
  return { ok: true, configured: true, verified: true, message: '현재 개인 API 키의 실제 연결을 확인했습니다.' };
}

function testLiteEngineConnection(teacherAccessToken) {
  assertLiteTeacherAccess_(teacherAccessToken);
  const result = checkLiteEngineConnection_();
  markLiteEngineVerified_(result.endpoint, result.policyVersion);
  return {
    ok: true,
    configured: true,
    verified: true,
    message: '웹 챗봇과 같은 공통 질문 엔진의 연결을 확인했습니다.',
    policyVersion: result.policyVersion
  };
}

function clearLiteApiKeyForTeacher(teacherAccessToken) {
  assertLiteTeacherAccess_(teacherAccessToken);
  return clearLiteApiKey_();
}

function clearLiteApiKey_() {
  PropertiesService.getScriptProperties().deleteProperty(LITE_API_KEY_PROPERTY_);
  clearLiteApiVerification_();
  return { ok: true, configured: false, verified: false, message: '저장된 API 키와 연결 확인 기록을 삭제했습니다.' };
}

function clearLiteApiKeyFromMenu() {
  requireLiteTeacherContext_();
  const ui = SpreadsheetApp.getUi();
  const answer = ui.alert(
    'API 키 삭제',
    '저장된 개인 API 키를 삭제할까요? 다시 연결하기 전까지 학생 챗봇이 멈춥니다.',
    ui.ButtonSet.YES_NO
  );
  if (answer !== ui.Button.YES) return;
  clearLiteApiKey_();
  SpreadsheetApp.getActiveSpreadsheet().toast(
    '저장된 API 키를 삭제했습니다.', 'simbot', 5
  );
}

function showLiteStudentLink() {
  requireLiteTeacherContext_();
  const url = getLiteStudentUrl_();
  const settings = readLiteTeacherSettings_();
  const readiness = buildLiteCurrentReadiness_(settings);
  if (!readiness.distributionReady) {
    SpreadsheetApp.getUi().alert(
      '아직 학생에게 배포할 수 없습니다.\n\n' + readiness.summary
    );
    return;
  }
  const escaped = String(url).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const urlJson = JSON.stringify(String(url)).replace(/</g, '\\u003c');
  const joinCode = String(settings.joinCode || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const html = HtmlService.createHtmlOutput(
    '<style>@font-face{font-family:"Pretendard Variable";font-style:normal;font-weight:45 920;font-display:swap;' +
    'src:url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2") format("woff2-variations");}' +
    'body{font:15px/1.6 "Pretendard Variable","Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif;}button,input,textarea{font:inherit;}</style>' +
    '<div style="padding:20px">' +
    '<h2>학생용 주소</h2><p>설정 준비 점검을 통과한 뒤 이 주소와 참여코드를 학생에게 공유합니다.</p>' +
    '<p><a target="_blank" rel="noopener noreferrer" href="' + escaped + '">' + escaped + '</a></p>' +
    '<p>수업 참여코드: <strong style="font-size:20px;letter-spacing:.12em">' + joinCode + '</strong></p>' +
    '<p><button type="button" onclick="copyUrl()" style="padding:9px 14px">주소 복사</button> ' +
    '<span id="copy-status" aria-live="polite"></span></p>' +
    '<p><strong>QR 만들기:</strong> 위 주소를 연 뒤 Chrome 또는 Edge의 공유 메뉴에서 ' +
    '“QR 코드 만들기”를 선택합니다. 별도 QR 서비스로 학생 주소를 보내지 않습니다.</p>' +
    '<p><strong>30명 수업:</strong> Google 실행 한도를 넘지 않도록 15명씩 두 모둠으로 나누어 ' +
    '약 10초 간격으로 입장·첫 질문을 시작하게 안내합니다.</p>' +
    '<p>교사 미리보기는 교사 설정 화면의 전용 미리보기 버튼으로 실행합니다.</p>' +
    '<script>function copyUrl(){var u=' + urlJson + ';var s=document.getElementById("copy-status");' +
    'if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(u).then(function(){s.textContent="복사했습니다.";});}' +
    'else{var a=document.createElement("textarea");a.value=u;document.body.appendChild(a);a.select();document.execCommand("copy");a.remove();s.textContent="복사했습니다.";}}<\\/script></div>'
  ).setWidth(640).setHeight(390);
  SpreadsheetApp.getUi().showModalDialog(html, 'simbot · 학생 배포');
}

function doGet(e) {
  const template = HtmlService.createTemplateFromFile('Student');
  template.previewAccessToken = liteText_(e && e.parameter && e.parameter.preview, 128);
  return template.evaluate()
    .setTitle('simbot')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getLiteStudentBootstrap(previewAccessToken) {
  const spreadsheet = getLiteSpreadsheet_();
  const settings = readLiteTeacherSettings_(spreadsheet, { skipEnsure:true });
  const engineReady = hasLiteEngineEndpoint_();
  const readiness = buildLiteCurrentReadiness_(settings);
  const previewAccess = isLitePreviewAccessToken_(previewAccessToken, settings);
  return {
    appVersion: LITE_APP_VERSION_,
    lesson: sanitizeLiteBootstrapForStudent_(settings),
    engineReady: engineReady,
    previewReady: readiness.runtimeReady,
    previewAccess: previewAccess,
    distributionReady: readiness.distributionReady,
    chatReady: readiness.distributionReady || (readiness.runtimeReady && previewAccess)
  };
}

function setLiteLessonOpenForTeacher(teacherAccessToken, shouldOpen) {
  assertLiteTeacherAccess_(teacherAccessToken);
  const settings = readLiteTeacherSettings_();
  if (!settings.lessonId) throw new Error('먼저 수업 설정을 저장해 주세요.');
  const open = shouldOpen === true;
  setLiteLessonOpen_(settings, open);
  const readiness = buildLiteCurrentReadiness_(settings);
  updateLiteStartHereStatus_(getLiteSpreadsheet_(), readiness);
  return {
    ok: true,
    lessonOpen: open,
    readiness: readiness,
    studentUrl: getLiteStudentUrl_(),
    previewUrl: getLiteTeacherPreviewUrl_(settings),
    message: open
      ? '현재 수업을 다시 열었습니다. 준비 상태를 확인해 주세요.'
      : '현재 수업 배포를 종료했습니다. 학생의 새 입장과 질문을 차단합니다.'
  };
}

function duplicateLiteLessonForTeacher(teacherAccessToken) {
  assertLiteTeacherAccess_(teacherAccessToken);
  const current = readLiteTeacherSettings_();
  if (!current.lessonId) throw new Error('복제할 수업 설정이 없습니다.');
  const payload = Object.assign({}, current, { lessonId: '' });
  const copy = validateLiteTeacherSetup_(payload);
  const saved = saveLiteTeacherSettings_(copy, { newLesson: true });
  setLiteLessonOpen_(saved, true);
  const readiness = buildLiteCurrentReadiness_(saved);
  updateLiteStartHereStatus_(getLiteSpreadsheet_(), readiness);
  return {
    ok: true,
    settings: liteClientData_(saved),
    api: { configured: hasLiteApiKey_(), verified: isLiteApiVerified_() },
    engine: { configured: hasLiteEngineEndpoint_(), verified: isLiteEngineVerified_() },
    studentUrl: getLiteStudentUrl_(),
    previewUrl: getLiteTeacherPreviewUrl_(saved),
    readiness: readiness,
    message: '현재 설계를 새 수업으로 복제했습니다. 내용을 수정해 저장하고 99-999로 다시 미리보기해 주세요.'
  };
}

function closeLiteLessonFromMenu() {
  const spreadsheet = requireLiteTeacherContext_();
  const settings = readLiteTeacherSettings_();
  if (!settings.lessonId) {
    SpreadsheetApp.getUi().alert('종료할 수업 설정이 없습니다.');
    return;
  }
  const ui = SpreadsheetApp.getUi();
  const answer = ui.alert(
    '현재 수업 배포 종료',
    '학생의 새 입장과 질문을 차단할까요? 저장된 대화와 평가는 삭제되지 않습니다.',
    ui.ButtonSet.YES_NO
  );
  if (answer !== ui.Button.YES) return;
  setLiteLessonOpen_(settings, false);
  spreadsheet.toast('현재 수업 배포를 종료했습니다.', 'simbot', 6);
}
