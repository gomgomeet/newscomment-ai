// 6단계: 운영 자료를 바꾸지 않고 같은 submitTurn 경로를 실제 AI로 검증한다.
function prepareStageSixCopy() {
  requireTeacherMenuContext_();
  const copy = getSpreadsheet_().copy('질문 챗봇 · 6단계 실제 AI 검증 · ' + new Date().toISOString());
  try {
    requestSpreadsheet_ = copy;
    migrateLightweightWorkbook_(copy);
    const material = saveActiveMaterial_({materialId: 'STAGE6-FIXTURE', version: 'v1', grade: '초등학교 4학년',
      title: '먹고 싶은 만큼 받은 날, 급식 잔반 42% 줄었다',
      text: '한빛초 4학년 세 반은 2주 동안 밥과 반찬을 적게, 보통, 많이 가운데 골라 받는 선택 배식을 시험했다. 남은 음식은 하루 평균 18kg에서 10.4kg으로 줄었다. 적게 받은 학생도 원하면 한 번 더 받을 수 있었다. 한 학생은 처음부터 많이 받지 않아도 돼서 편했다고 말했다. 영양교사는 학생이 먹을 양을 직접 고른 점이 영향을 주었을 수 있다고 설명했다. 다만 2주 동안 나온 메뉴가 서로 달랐고 날씨도 같지 않아, 학교는 다음 달에도 조사를 이어 가기로 했다.',
      standard: '글에 나타난 원인과 결과를 파악하고 근거를 들어 설명한다.', startQuestion: '궁금한 점을 물어보세요.'});
    syncTeacherGlossaryVocabulary_(material, [
      {term: '잔반', definition: '먹고 남긴 밥이나 음식', group: '급식'},
      {term: '선택 배식', definition: '먹을 사람이 음식의 종류나 양을 골라 받는 배식 방식', group: '급식'}]);
    syncMaterialChunks_();
    setConfigValue_('AI_ENABLED', 'TRUE', copy);
    PropertiesService.getScriptProperties().setProperty('STAGE6_COPY_ID', copy.getId());
    Logger.log('6단계 복사본 준비 완료: ' + copy.getUrl());
  } finally { requestSpreadsheet_ = null; }
}

function runStageSixCasesA() { return runStageSixCases_(0, 5); }
function runStageSixCasesB() { return runStageSixCases_(5, 10); }
function runStageSixCasesC() { return runStageSixCases_(10, 15); }

function runStageSixNumberCheck() {
  requireTeacherMenuContext_();
  try {
    requestSpreadsheet_ = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('STAGE6_COPY_ID'));
    const start = getBootstrapData({}, '99-996');
    const result = submitTurn({sessionId: start.sessionId, lesson: start.lesson, message: '42%가 뭐예요'});
    if (!/42/.test(result.reply) || result.aiStatus !== 'compose:ok') throw new Error('숫자 질문 검증 실패: ' + JSON.stringify(result));
    Logger.log(JSON.stringify(result));
  } finally { requestSpreadsheet_ = null; }
}

function runStageSixLoadReport() {
  requireTeacherMenuContext_();
  const material = getActiveMaterial_();
  const prefix = encodeURIComponent(material.materialId) + ':';
  const rows = getRowsAsObjects_('TURNS');
  const checks = Array.from({length: 30}, function (_, index) {
    const code = '99-' + (601 + index);
    const pair = rows.filter(function (row) { return row.sessionId === prefix + code; });
    return {code: code, rows: pair.length,
      complete: pair.length === 2 && pair[0].speaker === 'student' && pair[1].speaker === 'bot' &&
        Number(pair[0].turnNo) === 1 && Number(pair[1].turnNo) === 2 &&
        pair.every(function (row) { return isTruthy_(row.isPreview); }),
      aiStatus: pair.length === 2 ? pair[1].aiStatus : ''};
  });
  const report = {complete: checks.filter(function (item) { return item.complete; }).length,
    aiOk: checks.filter(function (item) { return item.aiStatus === 'compose:ok'; }).length,
    failed: checks.filter(function (item) { return !item.complete; }),
    previewExcluded: !getTeacherDashboardData_().students.some(function (row) { return /^99-/.test(row.studentCode); })};
  Logger.log(JSON.stringify(report));
  return report;
}

function createCleanTeacherTemplate() {
  requireTeacherMenuContext_();
  const template = SpreadsheetApp.create('질문 챗봇 · 경량화 교사 템플릿');
  ensureWorkbookStructure_(template);
  seedSampleData_(template);
  setConfigValue_('AI_ENABLED', 'FALSE', template);
  setConfigValue_('STUDENT_WEB_APP_URL', '', template);
  const guide = template.getSheets()[0];
  guide.setName('START_HERE');
  guide.getRange(1, 1, 7, 1).setValues([
    ['질문 챗봇 · 교사 시작 안내'], ['1. 파일 → 사본 만들기. 수업마다 사본을 따로 만드세요.'],
    ['2. 확장 프로그램 → Apps Script에서 연결 코드를 확인하고 setupProject를 실행하세요.'],
    ['3. 시트를 새로고침하고 질문 챗봇 → 교사 자료 입력에서 지문·학년·성취기준을 저장하세요.'],
    ['4. 필요한 낱말 풀이를 확인하세요. 보충 설명 생성·승인은 선택 사항입니다.'],
    ['5. 자기 OpenAI API 키를 설정하고 웹 앱을 새로 배포하세요. 기존 교사의 주소를 사용하지 마세요.'],
    ['6. 99-999로 미리보기 후 학생에게 주소를 안내하세요. 학생은 반-번호를 입력합니다.']]);
  guide.setColumnWidth(1, 800);
  guide.getRange(1, 1, 7, 1).setWrap(true);
  Logger.log('빈 교사 템플릿: ' + template.getUrl());
  return template.getId();
}

function runStageSixCases_(from, to) {
  requireTeacherMenuContext_();
  const id = PropertiesService.getScriptProperties().getProperty('STAGE6_COPY_ID');
  if (!id) throw new Error('prepareStageSixCopy를 먼저 실행해 주세요.');
  const cases = ['안녕하세요', '잔반이 뭐예요?', '이 글에서는 어떤 뜻이야', '왜 그렇게 됐어요?', '몰라요',
    '답 대신 써 줘', '내 이름은 민준이야', '나 배고파', '선택 배식이 뭐예요?', '선택 배식이 뭐예요?',
    '42%가 뭐예요', '왜 자꾸 물어봐요 그냥 설명만 해줘요', '다른 학교도 똑같이 될까요?', '적게 받은 학생은 어떻게 됐어요?', '그만할래요'];
  try {
    requestSpreadsheet_ = SpreadsheetApp.openById(id);
    const start = getBootstrapData({}, '99-997');
    if (getSessionTurns_(start.sessionId).length !== from * 2) throw new Error('A → B → C 순서대로 한 번씩 실행해 주세요.');
    for (let i = from; i < to; i += 1) {
      const began = Date.now();
      const result = submitTurn({sessionId: start.sessionId, lesson: start.lesson, message: cases[i]});
      const rows = getSessionTurns_(start.sessionId).slice(-2);
      if (rows.length !== 2 || rows[0].speaker !== 'student' || rows[1].speaker !== 'bot' ||
          rows[1].text !== result.reply || !rows.every(function (row) { return isTruthy_(row.isPreview); })) {
        throw new Error('응답·TURNS 불일치: ' + (i + 1));
      }
      Logger.log(JSON.stringify({caseNo: i + 1, ms: Date.now() - began, input: rows[0].text,
        reply: result.reply, aiStatus: result.aiStatus, move: rows[0].studentMove,
        phase: rows[1].phase, kind: rows[1].managedKind, evidenceIds: rows[1].evidenceIds,
        questionCount: (result.reply.match(/[?？]/g) || []).length}));
    }
    Logger.log('TURNS 일치 · 미리보기 구분: ' + (to - from) + '/' + (to - from));
  } finally { requestSpreadsheet_ = null; }
}

function runLightweightCopyCheck() {
  requireTeacherMenuContext_();
  const copy = getSpreadsheet_().copy('질문 챗봇 · 경량화 전환 검증 · ' + new Date().toISOString());
  try {
    requestSpreadsheet_ = copy;
    migrateLightweightWorkbook_(copy);
    const material = getActiveMaterial_();
    const start = getBootstrapData({}, '99-999');
    const report = { schema: Object.keys(QUESTION_BOT_HEADERS_).length,
      chunks: getApprovedMaterialChunks_(material.materialId, material.version).length,
      knowledge: getApprovedKnowledgeItems_(material).length,
      vocabulary: getTeacherGlossaryEntries_(material.materialId, material.version).length,
      session: start.sessionId === encodeURIComponent(material.materialId) + ':99-999' };
    if (!report.chunks || !report.session) throw new Error('복사본 전환 검증 실패');
    Logger.log(JSON.stringify(report));
    return report;
  } finally { requestSpreadsheet_ = null; }
}

function runPhaseIntegrationCopyCheck() {
  requireTeacherMenuContext_();
  const copy = getSpreadsheet_().copy('질문 챗봇 · 5단계 접점 검증 · ' + new Date().toISOString());
  try {
    requestSpreadsheet_ = copy;
    migrateLightweightWorkbook_(copy);
    setConfigValue_('AI_ENABLED', 'FALSE', copy);
    const material = getActiveMaterial_();
    const settings = phaseSettingsFor_(material);
    const query = contentWords_(material.text).map(function (word) { return word + ' 무엇인가요?'; })
      .find(function (text) { return isPassageRelatedQuestion(text, settings) &&
        analyzeStudentTurn_({message: text, material: material}).studentMove === 'ask_definition'; });
    if (!query) throw new Error('현재 자료에서 검사 질문을 만들지 못했습니다.');
    const start = getBootstrapData({}, '99-998');
    const send = function (message) { return submitTurn({sessionId: start.sessionId, lesson: start.lesson, message: message}); };
    let fourth;
    for (let index = 0; index < 4; index += 1) fourth = send(query);
    const bot = getSessionTurns_(start.sessionId).slice(-1)[0];
    if (fourth.managedKind !== 'comprehension_medium' || Number(bot.phase) !== 2 ||
        (fourth.reply.match(/[?？]/g) || []).length !== 1 || !isTruthy_(bot.relatedQuestion)) {
      throw new Error('4번째 관련 질문 접점 또는 저장 검증 실패');
    }
    const repair = send('왜 자꾸 물어봐요?');
    const close = send('그만할래요');
    if (/[?？]/.test(repair.reply + close.reply) || !close.isClosing) throw new Error('설명만 요청·종료 검증 실패');
    const turns = getSessionTurns_(start.sessionId);
    if (!turns.every(function (row) { return isTruthy_(row.isPreview); })) throw new Error('미리보기 기록 구분 실패');
    const report = {phase: Number(bot.phase), managedKind: bot.managedKind,
      turns: turns.length, preview: true, repairNoQuestion: true, closed: true};
    Logger.log(JSON.stringify(report));
    return report;
  } finally { requestSpreadsheet_ = null; }
}

function runSmokeTests() {
  if (typeof SpreadsheetApp !== 'undefined') requireTeacherMenuContext_();
  const material = {
    materialId: 'MAT-001',
    version: 'v1',
    grade: '중학교 1학년',
    gradeCode: 'M1',
    explanationGradeCode: 'E6',
    text: '학교는 선택 배식을 시작했고 그 결과 잔반이 줄었다.',
    title: '먹을 만큼 골라 담아요',
    startQuestion: '무엇이 달라졌나요?'
  };

  const cases = [
    {
      name: '첫 도움 요청',
      input: { message: '힌트가 필요해요.', action: 'hint', material: material, history: [] },
      expectedMove: 'offer_clue',
      expectedHint: 1
    },
    {
      name: '반복 도움 요청',
      input: {
        message: '힌트를 더 주세요.',
        action: 'hint',
        material: material,
        history: [
          { speaker: 'bot', hintLevel: 1 },
          { speaker: 'bot', hintLevel: 2 }
        ]
      },
      expectedMove: 'offer_clue',
      expectedHint: 3,
      expectedIntervention: true
    },
    {
      name: '종료 요청',
      input: { message: '이제 그만할래요.', action: 'message', material: material, history: [] },
      expectedMove: 'close',
      expectedHint: 0
    },
    {
      name: '뭐예요 형태의 낱말 뜻 질문',
      input: { message: '잔반이 뭐예요?', action: 'message', material: material, history: [] },
      expectedStudentMove: 'ask_definition',
      expectedMove: 'clarify',
      expectedHint: 0
    }
  ];

  const results = cases.map(function (testCase) {
    const analysis = analyzeStudentTurn_(testCase.input);
    const plan = selectNextMove_({
      guard: { blocked: false, reason: '', safeText: testCase.input.message },
      analysis: analysis,
      material: material,
      history: testCase.input.history
    });
    const passed =
      (!testCase.expectedStudentMove || analysis.studentMove === testCase.expectedStudentMove) &&
      plan.primaryMove === testCase.expectedMove &&
      plan.hintLevel === testCase.expectedHint &&
      (testCase.expectedIntervention === undefined ||
        plan.teacherInterventionFlag === testCase.expectedIntervention);
    return (passed ? 'PASS' : 'FAIL') + ' - ' + testCase.name + ': ' + JSON.stringify(plan);
  });

  const retrievalContext = {
    studentMove: 'ask_fact',
    primaryMove: 'check_evidence',
    hintLevel: 1,
    materialId: 'MAT-001',
    version: 'v1'
  };
  const testCards = [
    {
      cardId: 'RELEVANT',
      studentMove: 'ask_fact',
      primaryMove: 'check_evidence',
      hintLevel: 1,
      title: '잔반 감소',
      questionPatterns: '왜 잔반이 줄었나요',
      keywords: '잔반|선택 배식',
      response: '근거 문장을 찾아보세요.',
      evidenceText: '학생들이 반찬 양을 직접 고르게 한 뒤 잔반이 줄었다.',
      sourceLocation: '자료 구간 1',
      materialId: 'MAT-001',
      version: 'v1',
      status: 'approved',
      reliability: 'A'
    },
    {
      cardId: 'IRRELEVANT_BUT_TRUSTED',
      studentMove: 'revise',
      primaryMove: 'receive',
      hintLevel: 0,
      title: '화산 활동',
      questionPatterns: '화산은 왜 폭발하나요',
      keywords: '화산|마그마',
      response: '화산 자료를 보세요.',
      materialId: 'MAT-001',
      version: 'v1',
      status: 'approved',
      reliability: 'A'
    },
    {
      cardId: 'IRRELEVANT_KNOWLEDGE_CARD',
      studentMove: 'ask_fact',
      primaryMove: 'check_evidence',
      hintLevel: 1,
      title: '화산 활동',
      questionPatterns: '화산은 왜 폭발하나요',
      keywords: '화산|마그마',
      response: '화산 자료를 보세요.',
      evidenceText: '마그마의 압력으로 화산이 분출한다.',
      materialId: 'MAT-001',
      version: 'v1',
      status: 'approved',
      reliability: 'A'
    }
  ];
  const testChunks = [{
    chunkId: 'CHK-001',
    content: '학생들이 반찬 양을 직접 고르게 한 뒤 잔반이 줄었다.',
    keywords: '반찬 양|직접 고르다|잔반',
    sourceLabel: '교사 제공 자료',
    status: 'approved'
  }];
  const retrieval = rankEvidenceCandidates_(
    '왜 잔반이 줄었나요?',
    retrievalContext,
    material,
    testCards,
    [],
    testChunks,
    { MIN_RELEVANCE_SCORE: 3, MAX_RETRIEVAL_RESULTS: 3 }
  );

  results.push(
    (retrieval.retrievedCardIds[0] === 'RELEVANT' ? 'PASS' : 'FAIL') +
      ' - 관련 카드 우선 검색: ' + JSON.stringify(retrieval.retrievedCardIds)
  );
  results.push(
    (retrieval.retrievedCardIds.indexOf('IRRELEVANT_BUT_TRUSTED') < 0 ? 'PASS' : 'FAIL') +
      ' - 관련도 없는 고신뢰 카드 제외: ' + JSON.stringify(retrieval.retrievedCardIds)
  );
  results.push(
    (retrieval.retrievedCardIds.indexOf('IRRELEVANT_KNOWLEDGE_CARD') < 0 ? 'PASS' : 'FAIL') +
      ' - 대화 유형만 같은 무관 지식 카드 제외: ' + JSON.stringify(retrieval.retrievedCardIds)
  );
  results.push(
    (retrieval.retrievedChunkIds[0] === 'CHK-001' ? 'PASS' : 'FAIL') +
      ' - 교사 자료 구간 검색: ' + JSON.stringify(retrieval.retrievedChunkIds)
  );
  results.push(
    (!isApprovedStatus_('needs_review') ? 'PASS' : 'FAIL') +
      ' - 검토 전 자료 사용 차단'
  );
  results.push(
    (makeReviewOccurrenceKey_('MAT-001', '잔반이 왜 줄었나요?') ===
      makeReviewOccurrenceKey_('MAT-001', '왜 잔반이 줄었나요?') ? 'PASS' : 'FAIL') +
      ' - 같은 핵심어 질문 검토 큐 묶기'
  );

  const responseResult = renderResponse_({
    plan: {
      primaryMove: 'check_evidence',
      hintLevel: 1,
      sourceStatus: 'source_insufficient',
      reasonCode: 'EVIDENCE_GAP'
    },
    analysis: { studentMove: 'ask_fact', relatedQuestion: true },
    material: {
      materialId: 'MAT-001', version: 'v1', title: '예시 자료',
      sourceLabel: '교사 제공 자료', sourceUrl: ''
    },
    retrieval: retrieval
  });
  results.push(
    (responseResult.evidence.length > 0 &&
      responseResult.evidence.some(function (item) { return item.kind === 'material'; }) &&
      responseResult.citedCardIds.length === 0 &&
      responseResult.text !== testCards[0].response ? 'PASS' : 'FAIL') +
      ' - 사실 질문은 카드 완성 답변 대신 원문 근거 사용'
  );
  const factAIEvidence = buildAIEvidenceContext_(retrieval, material, { studentMove: 'ask_fact', relatedQuestion: true });
  results.push(
    (factAIEvidence.some(function (item) { return item.id === 'CHK-001'; }) &&
      !factAIEvidence.some(function (item) { return item.id === 'RELEVANT'; }) ? 'PASS' : 'FAIL') +
      ' - 사실 질문 AI 조립에서 카드 답변 근거 제외'
  );
  results.push(
    (shouldQueueReview_(
      { blocked: false },
      { studentMove: 'ask_fact', relatedQuestion: true },
      { isClosing: false, sourceStatus: 'source_insufficient' },
      emptyRetrievalResult_()
    ) ? 'PASS' : 'FAIL') +
      ' - 근거 없는 사실 질문 검토 큐 등록'
  );

  const definitionAnalysis = analyzeStudentTurn_({
    message: '잔반이 뭐예요?', action: 'message', material: material, history: []
  });
  const definitionPlan = selectNextMove_({
    guard: { blocked: false, reason: '', safeText: '잔반이 뭐예요?' },
    analysis: definitionAnalysis, material: material, history: []
  });
  const definitionRetrieval = rankEvidenceCandidates_(
    '잔반이 뭐예요?',
    {
      studentMove: definitionAnalysis.studentMove,
      primaryMove: definitionPlan.primaryMove,
      hintLevel: definitionPlan.hintLevel,
      materialId: 'MAT-001', version: 'v1'
    },
    material,
    [{
      cardId: 'DEF-TEST', studentMove: 'ask_definition', primaryMove: 'clarify',
      hintLevel: 0, title: '낱말 뜻: 잔반',
      questionPatterns: '잔반이 뭐예요|잔반 뜻', keywords: '잔반',
      response: '“잔반”의 뜻은 ‘먹고 남은 음식’이에요.',
      evidenceText: '잔반: 먹고 남은 음식', sourceLocation: '교사 사전카드',
      materialId: 'MAT-001', version: 'v1', status: 'approved', reliability: 'A'
    }],
    [{
      vocabularyId: 'VOC-M1-TEST', term: '잔반', normalizedTerm: '잔반',
      targetGradeCode: 'M1', explanationGradeCode: 'E6',
      easyDefinition: '먹고 남은 음식', exampleText: '그 결과 잔반이 줄었다.',
      sourceId: 'MAT-001', sourceLabel: '교사 제공 자료', sourceLocation: '교사 직접 입력',
      status: 'approved', active: true, teacherApproved: true, reliability: 'A', version: 'v1'
    }],
    [],
    { MIN_RELEVANCE_SCORE: 3, MAX_RETRIEVAL_RESULTS: 3 }
  );
  const definitionResponse = renderResponse_({
    plan: definitionPlan,
    analysis: definitionAnalysis,
    material: {
      materialId: 'MAT-001', version: 'v1', title: '예시 자료',
      sourceLabel: '교사 제공 자료', sourceUrl: ''
    },
    retrieval: definitionRetrieval
  });
  results.push(
    (definitionRetrieval.retrievedVocabularyIds[0] === 'VOC-M1-TEST' &&
      definitionResponse.text.indexOf('먹고 남은 음식') >= 0 &&
      definitionResponse.validatedVocabularyIds[0] === 'VOC-M1-TEST' ? 'PASS' : 'FAIL') +
      ' - 뜻 질문은 학년별 교사 승인 어휘 RAG로 직접 설명'
  );
  const middleSchoolPolicy = getGradePolicy_('중학교 3학년');
  results.push(
    (middleSchoolPolicy.targetCode === 'M3' && middleSchoolPolicy.explanationCode === 'M2'
      ? 'PASS' : 'FAIL') +
      ' - 초1~중3 학년 범위와 한 단계 쉬운 설명 수준 적용'
  );
  results.push(
    (shouldQueueReview_(
      { blocked: false },
      { studentMove: 'ask_definition', relatedQuestion: true },
      { isClosing: false, sourceStatus: 'supported' },
      emptyRetrievalResult_()
    ) ? 'PASS' : 'FAIL') +
      ' - 사전카드 없는 뜻 질문 검토 큐 등록'
  );
  const cardOnlyDefinitionRetrieval = rankEvidenceCandidates_(
    '잔반이 뭐예요?',
    {
      studentMove: 'ask_definition', primaryMove: 'clarify', hintLevel: 0,
      materialId: 'MAT-001', version: 'v1'
    },
    material,
    testCards.concat([{
      cardId: 'OLD-DEFINITION', studentMove: 'ask_definition', primaryMove: 'clarify',
      hintLevel: 0, title: '낱말 뜻: 잔반', questionPatterns: '잔반이 뭐예요|잔반 뜻',
      keywords: '잔반', response: '이 답변은 사용하면 안 됩니다.',
      evidenceText: '잔반: 먹고 남은 음식', materialId: 'MAT-001', version: 'v1',
      status: 'approved', reliability: 'A'
    }]),
    [],
    [],
    { MIN_RELEVANCE_SCORE: 3, MAX_RETRIEVAL_RESULTS: 3 }
  );
  const cardOnlyDefinitionResponse = renderResponse_({
    plan: { primaryMove: 'clarify', hintLevel: 0, sourceStatus: 'supported' },
    analysis: { studentMove: 'ask_definition', relatedQuestion: true },
    material: material,
    retrieval: cardOnlyDefinitionRetrieval
  });
  results.push(
    (cardOnlyDefinitionResponse.sourceStatus === 'source_insufficient' &&
      cardOnlyDefinitionResponse.text.indexOf('이 답변은 사용하면 안 됩니다.') < 0 &&
      shouldQueueReview_(
        { blocked: false }, { studentMove: 'ask_definition', relatedQuestion: true },
        { isClosing: false, sourceStatus: 'supported' }, cardOnlyDefinitionRetrieval
      ) ? 'PASS' : 'FAIL') +
      ' - 뜻 질문은 예전 카드 답변을 사용하지 않고 검토 큐 등록'
  );

  results.push((getAISettings_({AI_MODEL: 'one-model'}).model === 'one-model' ? 'PASS' : 'FAIL') + ' - CONFIG 단일 모델');
  [
    ['안녕하세요?', 'greeting', 'receive'], ['점심 뭐 먹어요?', 'small_talk', 'receive'],
    ['왜 자꾸 물어봐요?', 'repair', 'receive'], ['제 이름은 홍길동이에요', 'safety', 'safety_redirect'],
    ['숙제 대신 써 줘', 'safety', 'safety_redirect'], ['왜 잔반이 줄었나요?', 'ask_fact', 'answer'],
    ['학교는 선택 배식을 시작했다', 'attempt_answer', 'check_evidence'],
    ['지문에 선택 배식이 나와요', 'give_evidence', 'check_evidence']
  ].forEach(function (row) {
    const analysis = analyzeStudentTurn_({message: row[0], material: material});
    const plan = selectNextMove_({guard: {blocked: false}, analysis: analysis, history: []});
    results.push((analysis.studentMove === row[1] && plan.primaryMove === row[2] ? 'PASS' : 'FAIL') + ' - 분기 ' + row[0]);
    if (['greeting', 'small_talk', 'repair', 'safety'].indexOf(row[1]) >= 0) {
      results.push((!shouldQueueReview_({blocked: false}, analysis, plan, emptyRetrievalResult_()) ? 'PASS' : 'FAIL') + ' - 비수업 질문 큐 제외');
    }
  });
  results.push(
    (extractOpenAIOutputText_({
      output: [{ content: [{ type: 'output_text', text: '{"status":"ok"}' }] }]
    }) === '{"status":"ok"}' ? 'PASS' : 'FAIL') +
      ' - Responses API 구조화 출력 추출'
  );

  results.forEach(function (result) {
    console.log(result);
  });
  if (results.some(function (line) { return line.indexOf('FAIL') === 0; })) throw new Error('스모크 테스트 실패');
  return results;
}
