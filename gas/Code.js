/**
 * 질문 챗봇 웹앱의 공개 진입점입니다.
 * 연수에서는 함수 이름과 반환 객체의 필드명을 유지합니다.
 */

const TEACHER_ACCESS_TOKEN_PROPERTY_ = 'TEACHER_ACCESS_TOKEN';

function getOrCreateTeacherAccessToken_() {
  const properties = PropertiesService.getScriptProperties();
  let token = properties.getProperty(TEACHER_ACCESS_TOKEN_PROPERTY_);
  if (!token) {
    token = Utilities.getUuid() + Utilities.getUuid();
    properties.setProperty(TEACHER_ACCESS_TOKEN_PROPERTY_, token);
  }
  return token;
}

function assertTeacherAccess_(token) {
  const expected = PropertiesService.getScriptProperties()
    .getProperty(TEACHER_ACCESS_TOKEN_PROPERTY_);
  if (!expected || !token || String(token) !== String(expected)) {
    throw new Error('교사용 Google Sheet 메뉴에서 다시 열어 주세요.');
  }
}

function requireTeacherMenuContext_() {
  let spreadsheet = null;
  try {
    spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  } catch (error) {
    spreadsheet = null;
  }
  if (!spreadsheet) {
    throw new Error('교사용 Google Sheet 메뉴에서 실행해 주세요.');
  }
  const configuredId = PropertiesService.getScriptProperties()
    .getProperty('SPREADSHEET_ID');
  if (configuredId && String(spreadsheet.getId()) !== String(configuredId)) {
    throw new Error('연결된 교사용 Google Sheet에서 실행해 주세요.');
  }
  return spreadsheet;
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('질문 챗봇')
    .addItem('준비. 프로젝트 초기 설정', 'setupProject')
    .addSeparator()
    .addItem('1. OpenAI API 키 + Terra 설정', 'setOpenAIApiKey')
    .addItem('2. AI 연결 테스트', 'testOpenAIConnection')
    .addSeparator()
    .addItem('3. 교사 자료 입력', 'showTeacherSetup')
    .addItem('4. 수업 자료·보충 설명 확인', 'showTeacherKnowledgePack')
    .addItem('5. 학생 챗봇 주소 확인', 'showStudentChatbotLink')
    .addItem('6. 교사 운영 대시보드', 'showTeacherDashboard')
    .addSeparator()
    .addItem('고급. 수업 자료 시트 열기', 'openTeacherMaterialSheet')
    .addItem('고급. 수업 자료 적용 및 점검', 'applyTeacherMaterial')
    .addItem('고급. 미해결 질문 검토', 'openReviewQueue')
    .addSeparator()
    .addItem('관리. 경량화 시트 전환(백업 포함)', 'migrateLightweightWorkbook')
    .addItem('관리. 스모크 테스트', 'runSmokeTests')
    .addItem('관리. 운영 준비 점검', 'runOperationalReadinessCheck')
    .addItem('관리. OpenAI API 키 삭제', 'clearOpenAIApiKey')
    .addToUi();
}

function setupProject() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('Google Sheet에서 연결된 Apps Script로 실행해 주세요.');
  }

  getOrCreateTeacherAccessToken_();
  return setupProjectForSpreadsheet_(spreadsheet);
}

function setupProjectForSpreadsheet_(spreadsheet) {
  PropertiesService.getScriptProperties().setProperty(
    'SPREADSHEET_ID',
    spreadsheet.getId()
  );
  ensureWorkbookStructure_(spreadsheet);
  seedSampleData_(spreadsheet);
  const chunkCount = syncMaterialChunks_();

  spreadsheet.toast(
    '초기 설정이 완료되었습니다. 자료 구간 ' + chunkCount + '개를 새로 만들었습니다.',
    '질문 챗봇',
    7
  );
  return {
    spreadsheetId: spreadsheet.getId(),
    chunkCount: chunkCount
  };
}

function refreshMaterialIndex() {
  requireTeacherMenuContext_();
  const spreadsheet = getSpreadsheet_();
  ensureWorkbookStructure_(spreadsheet);
  const chunkCount = syncMaterialChunks_();

  spreadsheet.toast(
    chunkCount > 0
      ? '교사 자료 구간 ' + chunkCount + '개를 갱신했습니다.'
      : '이미 최신 자료 색인을 사용하고 있습니다.',
    '질문 챗봇',
    6
  );
}

function openTeacherMaterialSheet() {
  requireTeacherMenuContext_();
  const spreadsheet = getSpreadsheet_();
  ensureWorkbookStructure_(spreadsheet);
  spreadsheet.setActiveSheet(spreadsheet.getSheetByName('MATERIALS'));
  spreadsheet.toast(
    '한 행에 주제(title), 학년(grade), 성취기준, 지문(text), 시작 질문을 입력하세요.',
    '수업 자료 입력',
    8
  );
}

function showTeacherSetup() {
  requireTeacherMenuContext_();
  showTeacherSetupView_('material');
}

function showTeacherCardGenerator() {
  requireTeacherMenuContext_();
  showTeacherKnowledgePack();
}

function showTeacherKnowledgePack() {
  requireTeacherMenuContext_();
  showTeacherSetupView_('knowledge');
}

function showTeacherDashboard() {
  requireTeacherMenuContext_();
  const template = HtmlService.createTemplateFromFile('Dashboard');
  template.teacherAccessToken = getOrCreateTeacherAccessToken_();
  const html = template.evaluate()
    .setWidth(1120)
    .setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(html, '질문 챗봇 운영 대시보드');
}

function showTeacherSetupView_(initialSection) {
  const spreadsheet = getSpreadsheet_();
  ensureWorkbookStructure_(spreadsheet);
  const template = HtmlService.createTemplateFromFile('Teacher');
  template.initialSection = initialSection || 'material';
  template.teacherAccessToken = getOrCreateTeacherAccessToken_();
  const html = template.evaluate()
    .setWidth(980)
    .setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(
    html,
    initialSection === 'knowledge'
      ? '질문 챗봇 · 수업 자료·보충 설명 확인'
      : '질문 챗봇 · 교사 자료 입력'
  );
}

function showStudentChatbotLink() {
  requireTeacherMenuContext_();
  const url = getStudentWebAppUrl_();
  if (!/^https:\/\/script\.google\.com\//i.test(url)) {
    SpreadsheetApp.getUi().alert(
      '아직 학생용 웹앱 주소가 없습니다. 배포 → 새 배포 → 웹 앱을 먼저 실행해 주세요.'
    );
    return;
  }
  const html = HtmlService.createHtmlOutput(
    '<div style="font:15px/1.6 Arial,sans-serif;padding:20px">' +
    '<h2 style="margin-top:0">학생 챗봇 확인</h2>' +
    '<p>교사 자료와 승인 카드를 확인한 뒤 학생 화면을 새 창에서 열어 보세요.</p>' +
    '<p><a href="' + url + '" target="_blank" rel="noopener noreferrer" ' +
    'style="display:inline-block;padding:10px 16px;border-radius:8px;background:#2563eb;color:white;text-decoration:none;font-weight:bold">' +
    '학생 챗봇 열기</a></p></div>'
  ).setWidth(440).setHeight(220);
  SpreadsheetApp.getUi().showModalDialog(html, '질문 챗봇 · 학생 화면');
}

function applyTeacherMaterial() {
  requireTeacherMenuContext_();
  const spreadsheet = getSpreadsheet_();
  ensureWorkbookStructure_(spreadsheet);
  const material = validateTeacherMaterial_();
  const chunkCount = syncMaterialChunks_();

  spreadsheet.toast(
    '적용 완료: ' + material.grade + ' · ' + material.title +
      ' / 새 검색 구간 ' + chunkCount + '개',
    '수업 자료 점검',
    8
  );
  return {
    materialId: material.materialId,
    title: material.title,
    grade: material.grade,
    startQuestion: material.startQuestion,
    newChunkCount: chunkCount
  };
}

function openReviewQueue() {
  requireTeacherMenuContext_();
  const spreadsheet = getSpreadsheet_();
  ensureWorkbookStructure_(spreadsheet);
  spreadsheet.setActiveSheet(spreadsheet.getSheetByName('REVIEW_QUEUE'));
  spreadsheet.toast('상태가 open인 질문부터 검토해 주세요.', '미해결 질문', 5);
}

function doGet(event) {
  const parameters = event && event.parameter ? event.parameter : {};
  const selector = normalizeLessonSelector_({
    lessonId: parameters.lesson,
    version: parameters.v,
    sourceHash: parameters.source
  });
  const template = HtmlService.createTemplateFromFile('Index');
  template.lessonId = selector.lessonId;
  template.lessonVersion = selector.version;
  template.lessonSourceHash = selector.sourceHash;
  return template.evaluate()
    .setTitle('질문 챗봇')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getBootstrapData(lessonSelector, studentCode) {
  ensureRuntimeSchema_();
  const config = readConfig_();
  const material = getLessonMaterial_(lessonSelector);
  const code = studentCode ? normalizeStudentCode_(studentCode) : '';
  const sessionId = code ? encodeURIComponent(material.materialId) + ':' + code : '';
  const history = sessionId ? getSessionTurns_(sessionId) : [];
  return { appName: config.APP_NAME || '질문이', subject: config.SUBJECT || '',
    greetingMessage: formatGreetingMessage_(config.GREETING_MESSAGE || '안녕! 나는 {appName}야.', config.APP_NAME || '질문이'),
    introMessage: '지문을 읽고 궁금한 점을 물어보세요.', sessionId: sessionId, studentCode: code,
    isPreview: /^99-/.test(code),
    material: material, activityMode: 'discussion', history: history.map(function (row) {
      return { speaker: row.speaker, text: row.text, primaryMove: row.primaryMove, turnNo: row.turnNo };
    }), isClosing: history.length > 0 && history[history.length - 1].primaryMove === 'close',
    lesson: { lessonId: material.materialId, version: material.version, sourceHash: material.sourceHash } };
}

function formatGreetingMessage_(message, appName) {
  return String(message || '').replace(/\{appName\}/g, String(appName || '질문이'));
}

function getTeacherSetupData(teacherAccessToken) {
  assertTeacherAccess_(teacherAccessToken);
  ensureRuntimeSchema_();
  const spreadsheet = getSpreadsheet_();
  ensureWorkbookStructure_(spreadsheet);
  const config = readConfig_();
  let material;
  try {
    material = getActiveMaterial_();
  } catch (error) {
    material = {
      materialId: '', title: '', grade: '', standard: '', text: '',
      startQuestion: '', version: 'v1', sourceLabel: '교사 제공 수업 지문',
      sourceUrl: '', status: 'approved'
    };
  }
  const aiSettings = getAISettings_(config);
  return {
    appName: config.APP_NAME || '질문이',
    subject: config.SUBJECT || '',
    greetingMessage:
      config.GREETING_MESSAGE ||
      '안녕! 나는 {appName}야. 함께 지문을 읽고 질문을 나눠 보자.',
    material: material,
    glossary: getTeacherGlossaryEntries_(material.materialId, material.version),
    pendingReviews: getPendingSupplementReviews_(material),
    knowledgeDrafts: getLatestKnowledgePack_(material),
    ai: {
      configured: Boolean(getOpenAIApiKey_()),
      enabled: aiSettings.enabled,
      model: aiSettings.model,
      knowledgeGenerationModel: aiSettings.model
    },
    studentUrl: getStudentWebAppUrl_(material),
    readiness: getOperationalReadiness_()
  };
}

function getPendingSupplementReviews_(material) {
  const rows = getRowsAsObjects_('REVIEW_QUEUE').filter(function (row) {
    return row.status === 'open' && String(row.reviewId).indexOf(reviewScope_(material)) === 0;
  }).sort(function (a, b) { return Number(b.count || 1) - Number(a.count || 1); });
  return { total: rows.length, items: rows.slice(0, 10).map(function (row) {
    return { reviewId: String(row.reviewId), question: String(row.question), count: Number(row.count || 1),
      canSupplement: isDefinitionQuestion_(row.question) };
  }) };
}

function resolveSupplementReview(teacherAccessToken, payload) {
  assertTeacherAccess_(teacherAccessToken);
  payload = payload || {};
  ensureRuntimeSchema_();
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const material = getActiveMaterial_();
    const row = getRowsAsObjects_('REVIEW_QUEUE').find(function (item) { return String(item.reviewId) === String(payload.reviewId); });
    if (!row || String(row.status) !== 'open') throw new Error('이미 처리되었거나 찾을 수 없는 질문입니다. 화면을 다시 열어 주세요.');
    if (String(row.reviewId).indexOf(reviewScope_(material)) !== 0 || String(payload.sourceHash) !== String(material.sourceHash)) throw new Error('자료가 변경되었습니다. 현재 자료의 질문을 다시 확인해 주세요.');
    let supplement = null;
    if (payload.action === 'supplement') {
      if (!isDefinitionQuestion_(row.question)) throw new Error('낱말 뜻 질문에만 보충 풀이를 저장할 수 있습니다.');
      const term = String(payload.term || '').trim();
      const definition = String(payload.definition || '').trim();
      const group = String(payload.group || '').trim();
      if (!term || term.length > 50 || !definition || definition.length > 300 || group.length > 60) throw new Error('낱말은 50자, 뜻은 300자, 단어군은 60자 이내로 입력해 주세요.');
      const normalized = normalizeVocabularyTerm_(term);
      if (!normalized) throw new Error('검색할 수 있는 낱말을 입력해 주세요.');
      const glossary = getTeacherGlossaryEntries_(material.materialId, material.version);
      if (glossary.length >= 120 && !glossary.some(function (item) { return normalizeVocabularyTerm_(item.term) === normalized; })) throw new Error('보충 어휘가 120개입니다. 기존 어휘를 정리한 뒤 추가해 주세요.');
      const vocabulary = Object.assign(makeVocabularyRow_(material, term, definition,
        requireSupportedGrade_(material.gradeCode || material.grade), '교사 직접 입력'), { wordGroup: group });
      syncManagedSheetRows_(getSpreadsheet_().getSheetByName('VOCABULARY_LIBRARY'), function (item) {
        return String(item.sourceId) === String(material.materialId) && String(item.version) === String(material.version) &&
          normalizeVocabularyTerm_(item.term) === normalized;
      }, function () { return normalized; }, [vocabulary]);

      supplement = { term: term, definition: definition, group: group };
    } else if (payload.action !== 'reviewed') throw new Error('처리 방법을 확인해 주세요.');
    const sheet = getSpreadsheet_().getSheetByName('REVIEW_QUEUE');
    const values = sheet.getDataRange().getValues();
    const headers = values[0]; const updated = values[row.__rowNumber - 1];
    updated[headers.indexOf('status')] = supplement ? 'resolved' : 'reviewed';
    updated[headers.indexOf('teacherDecision')] = supplement ? '교사 보충 풀이 저장: ' + supplement.term : '교사 확인 완료 · 보충 없음';
    updated[headers.indexOf('reviewedAt')] = new Date();
    sheet.getRange(row.__rowNumber, 1, 1, headers.length).setValues([updated]);
    return { supplement: supplement, pendingReviews: getPendingSupplementReviews_(material) };
  } finally { flushAndReleaseLock_(lock); }
}

function saveTeacherSetup(teacherAccessToken, payload) {
  assertTeacherAccess_(teacherAccessToken);
  const normalized = validateTeacherSetupPayload_(payload || {});
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const spreadsheet = getSpreadsheet_();
    ensureWorkbookStructure_(spreadsheet);
    setConfigValues_({ APP_NAME: normalized.appName, SUBJECT: normalized.subject,
      GREETING_MESSAGE: normalized.greetingMessage }, spreadsheet);
    const material = saveActiveMaterial_(normalized.material);
    archiveStaleKnowledgeItems_(material);
    const vocabularyCount = syncTeacherGlossaryVocabulary_(material, normalized.glossary);
    const externalSourceCount = 0;
    const chunkCount = syncMaterialChunks_();

    return {
      ok: true,
      message: '저장되었습니다. 학생 앱 새로고침부터 바로 반영됩니다.',
      materialId: material.materialId,
      title: material.title,
      glossaryCount: normalized.glossary.length,
      vocabularyCount: vocabularyCount,
      sourceHash: material.sourceHash,
      externalSourceCount: externalSourceCount,
      newChunkCount: chunkCount,
      studentUrl: getStudentWebAppUrl_(material)
    };
  } finally {
    flushAndReleaseLock_(lock);
  }
}

function getStudentWebAppUrl_(material) {
  try {
    const configuredUrl = String(readConfig_().STUDENT_WEB_APP_URL || '').trim();
    const baseUrl = configuredUrl || ScriptApp.getService().getUrl() || '';
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(baseUrl)) return '';
    const selected = material || getActiveMaterial_();
    return baseUrl + (baseUrl.indexOf('?') >= 0 ? '&' : '?') +
      'lesson=' + encodeURIComponent(selected.materialId) +
      '&v=' + encodeURIComponent(selected.version) +
      '&source=' + encodeURIComponent(selected.sourceHash);
  } catch (error) {
    return '';
  }
}

function submitTurn(payload) {
  if (!payload || !payload.sessionId) throw new Error('반-번호를 입력하고 활동을 시작해 주세요.');
  ensureRuntimeSchema_();
  const config = readConfig_();
  const context = getActiveSessionContext_(payload.sessionId, payload.lesson);
  const material = context.material;
  const history = getSessionTurns_(payload.sessionId);
  if (history.length && history[history.length - 1].primaryMove === 'close') throw new Error('이미 마친 대화입니다.');
  const action = String(payload.action || 'message');
  const message = String(payload.message || (action === 'hint' ? '힌트가 필요해요.' : action === 'close' ? '이제 대화를 마칠게요.' : '')).trim();
  if (!message) throw new Error('질문이나 생각을 입력해 주세요.');
  const guard = guardStudentInput_(message);
  const safeMessage = guard.safeText;
  const ruleAnalysis = analyzeStudentTurn_({ message: safeMessage, action: action, material: material, history: history });
  const analysis = ruleAnalysis;
  const plan = selectNextMove_({ guard: guard, analysis: analysis, material: material, history: history });
  const decision = decidePhase(history, safeMessage, phaseSettingsFor_(material));
  plan.isClosing = plan.isClosing || Boolean(decision.closing);
  if (plan.isClosing) plan.primaryMove = 'close';
  // 입력 안전 정책과 종료는 국면 질문보다 우선한다.
  if (plan.isClosing || plan.primaryMove === 'safety_redirect') {
    decision.allowQuestion = false;
    decision.managedQuestion = '';
    decision.kind = '';
  }
  plan.expectsStudentReply = decision.allowQuestion &&
    (Boolean(decision.managedQuestion) || plan.expectsStudentReply);
  const retrieval = retrieveApprovedEvidence_({ query: safeMessage, analysis: analysis, plan: plan, material: material, config: config, history: history });
  const baseResponse = renderResponse_({ plan: plan, analysis: analysis, material: material, retrieval: retrieval });
  const aiComposeResult = composeResponseWithAI_({ message: safeMessage, plan: plan, analysis: analysis,
    material: material, retrieval: retrieval, history: history, config: config, baseResponse: baseResponse,
    taskLine: buildTaskLine(decision) });
  const responseResult = aiComposeResult.responseResult;
  let reviewId = '';
  const reason = getReviewReasonCode_(analysis, plan, retrieval);
  if (shouldQueueReview_(guard, analysis, plan, retrieval)) {
    reviewId = upsertReviewItem_({ studentCode: context.session.studentCode, materialId: material.materialId,
      question: safeMessage, reasonCode: reason, sourceHash: material.sourceHash,
      candidateCardIds: retrieval.retrievedCardIds, candidateChunkIds: retrieval.retrievedChunkIds,
      candidateVocabularyIds: retrieval.retrievedVocabularyIds, candidateKnowledgeIds: retrieval.retrievedKnowledgeIds,
      occurrenceKey: makeReviewOccurrenceKey_(material.materialId, safeMessage) });
  }
  const aiStatus = 'compose:' + aiComposeResult.status;
  // 한 쌍을 한 번의 잠금과 쓰기로 저장하여 발화와 답변이 따로 누락되지 않게 한다.
  const common = { sessionId: payload.sessionId, studentCode: context.session.studentCode,
    isPreview: /^99-/.test(context.session.studentCode) };
  // AI 성공·실패·꺼짐 및 카드 응답 모두 같은 질문 후처리를 거친다.
  responseResult.text = enforceManagedQuestion(responseResult.text, decision);
  const locations = Array.from(new Set(responseResult.evidence.map(function (item) { return item.location; }).filter(Boolean)));
  if (locations.length) responseResult.text += '\n근거: ' + locations.join(' · ');
  appendConversationTurns_([
    Object.assign({}, common, { speaker: 'student', text: safeMessage, studentMove: analysis.studentMove,
      relatedQuestion: analysis.relatedQuestion, aiStatus: 'rule' }),
    Object.assign({}, common, { speaker: 'bot', text: responseResult.text, primaryMove: plan.primaryMove,
      hintLevel: plan.hintLevel, sourceStatus: responseResult.sourceStatus,
      evidenceIds: responseResult.evidence.map(function (item) { return item.id; }),
      aiStatus: aiStatus, decisionReason: reviewId ? reason : plan.reasonCode,
      phase: decision.phase, managedKind: decision.kind || '',
      responseScore: decision.lastScore == null ? '' : decision.lastScore,
      relatedQuestion: decision.relatedQuestion })
  ]);
  return { reply: responseResult.text, primaryMove: plan.primaryMove, hintLevel: plan.hintLevel,
    sourceStatus: responseResult.sourceStatus, teacherInterventionFlag: plan.teacherInterventionFlag || Boolean(reviewId),
    expectsStudentReply: plan.expectsStudentReply, isClosing: plan.isClosing, retrievalConfidence: retrieval.confidence,
    aiStatus: aiStatus, aiModel: aiComposeResult.model || '',
    phase: decision.phase, managedKind: decision.kind || '',
    evidence: isTruthy_(config.SHOW_EVIDENCE) ? responseResult.evidence : [], reviewQueued: Boolean(reviewId) };
}

function shouldQueueReview_(guard, analysis, plan, retrieval) {
  if (guard.blocked || plan.isClosing || !analysis.relatedQuestion ||
      ['ask_fact', 'ask_definition'].indexOf(analysis.studentMove) < 0) return false;
  const hasVocabularyEvidence = (retrieval.vocabulary || []).some(function (entry) {
    return Boolean(entry.easyDefinition);
  });
  const hasDefinitionKnowledge = (retrieval.knowledge || []).some(function (item) {
    return item.knowledgeType === 'vocabulary' &&
      Boolean(item.easyExplanation || item.content);
  });
  if (analysis.studentMove === 'ask_definition' &&
      !hasVocabularyEvidence && !hasDefinitionKnowledge) {
    return true;
  }
  if (
    analysis.studentMove === 'ask_fact' &&
    retrieval.chunks.length === 0 && retrieval.knowledge.length === 0
  ) return true;
  const isContentQuestion = analysis.studentMove === 'ask_fact' ||
    analysis.studentMove === 'ask_definition';
  if (isContentQuestion && (retrieval.ambiguous || retrieval.confidence === 'low')) {
    return true;
  }
  return plan.sourceStatus === 'source_insufficient' && retrieval.confidence === 'none';
}

function getReviewReasonCode_(analysis, plan, retrieval) {
  if (retrieval.ambiguous) return 'AMBIGUOUS_APPROVED_EVIDENCE';
  if (retrieval.confidence === 'low') return 'LOW_RETRIEVAL_CONFIDENCE';
  return plan.reasonCode || 'NO_APPROVED_EVIDENCE';
}
