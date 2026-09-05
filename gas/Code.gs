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
    .addItem('관리. 스모크 테스트', 'runSmokeTests')
    .addItem('관리. 학년별 RAG 평가', 'runRagEvaluationSuite')
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
  bumpRetrievalCacheRevision_();
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
  bumpRetrievalCacheRevision_();
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
  bumpRetrievalCacheRevision_();
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

function getBootstrapData(lessonSelector) {
  ensureRuntimeSchema_();
  const config = readConfig_();
  const material = getLessonMaterial_(lessonSelector);
  const sessionId = Utilities.getUuid();
  const studentCode = '익명-' + sessionId.slice(0, 4).toUpperCase();

  createSession_({
    sessionId: sessionId,
    studentCode: studentCode,
    botId: config.BOT_ID || 'question-bot-01',
    materialId: material.materialId,
    materialVersion: material.version,
    materialSourceHash: material.sourceHash,
    policyVersion: config.POLICY_VERSION || 'ai-rag-router-v1'
  });

  return {
    appName: config.APP_NAME || '질문이',
    subject: config.SUBJECT || '',
    greetingMessage: formatGreetingMessage_(
      config.GREETING_MESSAGE || '안녕! 나는 {appName}야. 함께 지문을 읽고 질문을 나눠 보자.',
      config.APP_NAME || '질문이'
    ),
    introMessage:
      config.INTRO_MESSAGE ||
      '지문을 읽고 먼저 자기 생각을 말해 보세요. 어려우면 힌트를 요청할 수 있어요.',
    askNickname: config.ASK_NICKNAME === undefined
      ? true
      : isTruthy_(config.ASK_NICKNAME),
    nicknamePrompt:
      config.NICKNAME_PROMPT ||
      '대화에서 사용할 이름이나 별명을 알려 주세요. 건너뛰어도 괜찮아요.',
    sessionId: sessionId,
    studentCode: studentCode,
    material: material,
    activityMode: material.activityMode,
    externalSources: getApprovedExternalSources_(material).map(function (source) {
      return {
        sourceId: source.sourceId, title: source.title, url: source.url,
        sourceName: source.sourceName, checkedAt: source.checkedAt,
        allowedScope: source.allowedScope
      };
    }),
    lesson: {
      lessonId: material.materialId,
      version: material.version,
      sourceHash: material.sourceHash
    }
  };
}

function formatGreetingMessage_(message, appName) {
  return String(message || '').replace(/\{appName\}/g, String(appName || '질문이'));
}

function getTeacherSetupData(teacherAccessToken) {
  assertTeacherAccess_(teacherAccessToken);
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
    introMessage:
      config.INTRO_MESSAGE ||
      '지문을 읽고 먼저 자기 생각을 말해 보세요. 어려우면 힌트를 요청할 수 있어요.',
    askNickname: config.ASK_NICKNAME === undefined
      ? true
      : isTruthy_(config.ASK_NICKNAME),
    nicknamePrompt:
      config.NICKNAME_PROMPT ||
      '대화에서 사용할 이름이나 별명을 알려 주세요. 건너뛰어도 괜찮아요.',
    material: material,
    glossary: getTeacherGlossaryEntries_(material.materialId, material.version),
    pendingReviews: getPendingSupplementReviews_(material),
    externalSources: getTeacherExternalSources_(material),
    cardDrafts: getLatestTeacherGeneratedCards_(material.materialId, material.version),
    knowledgeDrafts: getLatestKnowledgePack_(material),
    ai: {
      configured: Boolean(getOpenAIApiKey_()),
      enabled: aiSettings.enabled,
      model: aiSettings.qualityModel,
      knowledgeGenerationModel: aiSettings.routingMode === 'terra_only'
        ? aiSettings.qualityModel : aiSettings.fastModel,
      cardGenerationMode: String(config.AI_CARD_GENERATION_MODE || 'fast'),
      cardGenerationModel: String(config.AI_CARD_GENERATION_MODE || 'fast').toLowerCase() === 'quality'
        ? aiSettings.qualityModel
        : aiSettings.fastModel
    },
    studentUrl: getStudentWebAppUrl_(material),
    readiness: getOperationalReadiness_()
  };
}

function getPendingSupplementReviews_(material) {
  const rows = getRowsAsObjects_('REVIEW_QUEUE').filter(function (row) {
    return String(row.status) === 'open' && String(row.materialId) === String(material.materialId) &&
      String(row.version) === String(material.version) && Boolean(row.sourceHash) &&
      String(row.sourceHash) === String(material.sourceHash);
  }).sort(function (a, b) { return Number(b.count || 1) - Number(a.count || 1); });
  return { total: rows.length, items: rows.slice(0, 10).map(function (row) {
    return { reviewId: String(row.reviewId), question: String(row.question), count: Number(row.count || 1),
      canSupplement: String(row.studentMove) === 'ask_definition' };
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
    if (!row.sourceHash || String(row.materialId) !== String(material.materialId) ||
        String(row.version) !== String(material.version) || String(row.sourceHash) !== String(material.sourceHash) ||
        String(payload.sourceHash) !== String(material.sourceHash)) throw new Error('자료가 변경되었습니다. 현재 자료의 질문을 다시 확인해 주세요.');
    let supplement = null;
    if (payload.action === 'supplement') {
      if (String(row.studentMove) !== 'ask_definition') throw new Error('낱말 뜻 질문에만 보충 풀이를 저장할 수 있습니다.');
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
          normalizeVocabularyTerm_(item.term) === normalized &&
          ['교사 직접 입력', '승인된 사전카드 이관'].indexOf(String(item.sourceLocation)) >= 0;
      }, function () { return normalized; }, [vocabulary]);
      bumpRetrievalCacheRevision_();
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
  } finally { lock.releaseLock(); }
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
      GREETING_MESSAGE: normalized.greetingMessage, INTRO_MESSAGE: normalized.introMessage,
      ASK_NICKNAME: normalized.askNickname ? 'TRUE' : 'FALSE', NICKNAME_PROMPT: normalized.nicknamePrompt }, spreadsheet);
    const material = saveActiveMaterial_(normalized.material);
    archiveStaleKnowledgeItems_(material);
    const vocabularyCount = syncTeacherGlossaryVocabulary_(material, normalized.glossary);
    const externalSourceCount = replaceTeacherExternalSources_(material, normalized.externalSources);
    const chunkCount = syncMaterialChunks_();
    bumpRetrievalCacheRevision_();
    return {
      ok: true,
      message: '저장되었습니다. 학생 앱 새로고침부터 바로 반영됩니다.',
      materialId: material.materialId,
      title: material.title,
      glossaryCount: normalized.glossary.length,
      vocabularyCount: vocabularyCount,
      externalSourceCount: externalSourceCount,
      newChunkCount: chunkCount,
      studentUrl: getStudentWebAppUrl_(material)
    };
  } finally {
    lock.releaseLock();
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
  if (!payload || !payload.sessionId) {
    throw new Error('세션 정보가 없습니다. 화면을 새로고침해 주세요.');
  }

  const config = readConfig_();
  const sessionContext = getActiveSessionContext_(payload.sessionId);
  const material = sessionContext.material;
  const sessionStudentCode = String(sessionContext.session.studentCode || '익명');
  const history = getSessionTurns_(payload.sessionId);
  const action = String(payload.action || 'message');
  const rawMessage = String(payload.message || '').trim();
  const fallbackMessage =
    action === 'hint'
      ? '힌트가 필요해요.'
      : action === 'close'
      ? '이제 대화를 마칠게요.'
      : action === 'research'
      ? '조사 질문과 검색어를 만들고 싶어요.'
      : '';
  const message = rawMessage || fallbackMessage;

  if (!message) {
    throw new Error('학생의 생각을 입력해 주세요.');
  }

  const guard = guardStudentInput_(message);
  const safeMessage = guard.safeText;
  const ruleAnalysis = analyzeStudentTurn_({
    message: safeMessage,
    action: action,
    material: material,
    history: history
  });
  const aiAnalysisResult = enrichStudentAnalysisWithAI_({
    message: safeMessage,
    action: action,
    ruleAnalysis: ruleAnalysis,
    material: material,
    history: history,
    config: config
  });
  const analysis = aiAnalysisResult.analysis;

  const turnNumber = history.length + 1;
  appendTurn_({
    sessionId: payload.sessionId,
    studentCode: sessionStudentCode,
    turnNo: turnNumber,
    speaker: 'student',
    text: safeMessage,
    studentMove: analysis.studentMove,
    primaryMove: '',
    hintLevel: 0,
    sourceStatus: '',
    reasonGiven: analysis.reasonGiven,
    passageEcho: analysis.passageEcho,
    feedbackUptake: analysis.feedbackUptake,
    interventionFlag: guard.blocked,
    policyVersion: config.POLICY_VERSION || 'ai-rag-router-v1',
    aiEnabled: isTruthy_(config.AI_ENABLED),
    aiAnalysisModel: aiAnalysisResult.model,
    aiResponseModel: '',
    aiStatus: 'analysis:' + aiAnalysisResult.status,
    stateConfidence: analysis.stateConfidence || '',
    activeConcept: analysis.activeConcept || '',
    rewrittenQuery: aiAnalysisResult.rewrittenQuery,
    misconceptionDetected: Boolean(analysis.misconceptionDetected),
    aiUsedEvidenceIds: []
  });

  const plan = selectNextMove_({
    guard: guard,
    analysis: analysis,
    material: material,
    history: history
  });
  const retrievalQuery = analysis.studentMove === 'ask_definition' ? safeMessage : (aiAnalysisResult.rewrittenQuery || safeMessage);
  const retrieval = retrieveApprovedEvidence_({
    query: retrievalQuery,
    botId: config.BOT_ID || 'question-bot-01',
    plan: plan,
    analysis: analysis,
    material: material,
    config: config
  });
  let baseResponse = renderResponse_({
    plan: plan,
    analysis: analysis,
    material: material,
    retrieval: retrieval
  });
  const useResearchBoundary = material.activityMode === 'research' &&
    (action === 'research' || baseResponse.sourceStatus === 'source_insufficient');
  if (useResearchBoundary) {
    baseResponse = buildResearchGuidance_(safeMessage, material);
    retrieval.retrievedExternalSourceIds = baseResponse.retrievedExternalSourceIds || [];
  }
  const aiComposeResult = useResearchBoundary
    ? {
        responseResult: baseResponse,
        status: 'skipped_research_boundary',
        model: '',
        usedEvidenceIds: baseResponse.validatedExternalSourceIds || []
      }
    : composeResponseWithAI_({
        message: safeMessage,
        plan: plan,
        analysis: analysis,
        material: material,
        retrieval: retrieval,
        history: history,
        config: config,
        baseResponse: baseResponse
      });
  const responseResult = aiComposeResult.responseResult;

  let reviewId = '';
  let queuedReviewReasonCode = '';
  const researchNeedsReview = useResearchBoundary &&
    responseResult.sourceStatus === 'source_insufficient';
  if (researchNeedsReview || shouldQueueReview_(guard, analysis, plan, retrieval)) {
    queuedReviewReasonCode = researchNeedsReview
      ? 'NO_APPROVED_RESEARCH_SOURCE'
      : getReviewReasonCode_(analysis, plan, retrieval);
    reviewId = upsertReviewItem_({
      sessionId: payload.sessionId,
      studentCode: sessionStudentCode,
      materialId: material.materialId,
      question: safeMessage,
      reasonCode: queuedReviewReasonCode,
      version: material.version,
      sourceHash: material.sourceHash,
      studentMove: analysis.studentMove,
      topScore: retrieval.topScore,
      candidateCardIds: retrieval.retrievedCardIds,
      candidateChunkIds: retrieval.retrievedChunkIds,
      candidateVocabularyIds: retrieval.retrievedVocabularyIds,
      candidateKnowledgeIds: retrieval.retrievedKnowledgeIds,
      candidateExternalSourceIds: retrieval.retrievedExternalSourceIds,
      occurrenceKey: makeReviewOccurrenceKey_(material.materialId, safeMessage)
    });
  }

  appendRetrievalLog_({
    sessionId: payload.sessionId,
    turnNo: turnNumber,
    materialId: material.materialId,
    query: retrievalQuery,
    originalQuery: safeMessage,
    rewrittenQuery: aiAnalysisResult.rewrittenQuery || safeMessage,
    queryTokens: retrieval.queryTokens,
    retrievedCardIds: retrieval.retrievedCardIds,
    retrievedChunkIds: retrieval.retrievedChunkIds,
    retrievedVocabularyIds: retrieval.retrievedVocabularyIds,
    retrievedKnowledgeIds: retrieval.retrievedKnowledgeIds,
    retrievedExternalSourceIds: retrieval.retrievedExternalSourceIds,
    topScore: retrieval.topScore,
    scoreGap: retrieval.scoreGap,
    ambiguous: retrieval.ambiguous,
    confidence: retrieval.confidence,
    evidenceConfidence: retrieval.confidence,
    strategyConfidence: strategyConfidenceForPlan_(analysis, plan),
    stateConfidence: analysis.stateConfidence || '',
    aiAnalysisModel: aiAnalysisResult.model,
    aiResponseModel: aiComposeResult.model,
    aiStatus: 'analysis:' + aiAnalysisResult.status + '|compose:' + aiComposeResult.status,
    decisionReason: reviewId
      ? queuedReviewReasonCode
      : plan.reasonCode || '',
    outcome: reviewId
      ? 'review_queued'
      : responseResult.evidence.length > 0
      ? 'grounded'
      : plan.primaryMove === 'safety_redirect'
      ? 'blocked'
      : 'dialogue_only',
    policyVersion: config.POLICY_VERSION || 'ai-rag-router-v1'
  });

  appendTurn_({
    sessionId: payload.sessionId,
    studentCode: sessionStudentCode,
    turnNo: turnNumber + 1,
    speaker: 'bot',
    text: responseResult.text,
    studentMove: '',
    primaryMove: plan.primaryMove,
    hintLevel: plan.hintLevel,
    sourceStatus: responseResult.sourceStatus,
    reasonGiven: false,
    passageEcho: false,
    feedbackUptake: '',
    interventionFlag: plan.teacherInterventionFlag || Boolean(reviewId),
    policyVersion: config.POLICY_VERSION || 'ai-rag-router-v1',
    retrievedCardIds: retrieval.retrievedCardIds,
    retrievedChunkIds: retrieval.retrievedChunkIds,
    retrievedVocabularyIds: retrieval.retrievedVocabularyIds,
    retrievedKnowledgeIds: retrieval.retrievedKnowledgeIds,
    retrievedExternalSourceIds: retrieval.retrievedExternalSourceIds,
    citedCardIds: responseResult.citedCardIds,
    validatedCardIds: responseResult.validatedCardIds,
    citedVocabularyIds: responseResult.citedVocabularyIds,
    validatedVocabularyIds: responseResult.validatedVocabularyIds,
    citedKnowledgeIds: responseResult.citedKnowledgeIds,
    validatedKnowledgeIds: responseResult.validatedKnowledgeIds,
    citedExternalSourceIds: responseResult.citedExternalSourceIds,
    validatedExternalSourceIds: responseResult.validatedExternalSourceIds,
    evidenceLabels: responseResult.evidence.map(function (item) {
      return item.label + (item.location ? ' · ' + item.location : '');
    }),
    retrievalConfidence: retrieval.confidence,
    reviewId: reviewId,
    aiEnabled: isTruthy_(config.AI_ENABLED),
    aiAnalysisModel: aiAnalysisResult.model,
    aiResponseModel: aiComposeResult.model,
    aiStatus: 'analysis:' + aiAnalysisResult.status + '|compose:' + aiComposeResult.status,
    stateConfidence: analysis.stateConfidence || '',
    activeConcept: analysis.activeConcept || '',
    rewrittenQuery: aiAnalysisResult.rewrittenQuery || safeMessage,
    misconceptionDetected: Boolean(analysis.misconceptionDetected),
    aiUsedEvidenceIds: aiComposeResult.usedEvidenceIds
  });

  if (plan.isClosing) {
    closeSession_(payload.sessionId);
  }

  return {
    reply: responseResult.text,
    primaryMove: plan.primaryMove,
    hintLevel: plan.hintLevel,
    sourceStatus: responseResult.sourceStatus,
    teacherInterventionFlag: plan.teacherInterventionFlag || Boolean(reviewId),
    expectsStudentReply: plan.expectsStudentReply,
    isClosing: plan.isClosing,
    retrievalConfidence: retrieval.confidence,
    aiStatus: 'analysis:' + aiAnalysisResult.status + '|compose:' + aiComposeResult.status,
    aiModel: aiComposeResult.model || aiAnalysisResult.model || '',
    evidence: isTruthy_(config.SHOW_EVIDENCE) ? responseResult.evidence : [],
    reviewQueued: Boolean(reviewId),
    researchGuidance: useResearchBoundary
  };
}

function shouldQueueReview_(guard, analysis, plan, retrieval) {
  if (guard.blocked || plan.isClosing) return false;
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
