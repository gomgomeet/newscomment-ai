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
    analysis: { studentMove: 'ask_fact' },
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
  const factAIEvidence = buildAIEvidenceContext_(retrieval, material, { studentMove: 'ask_fact' });
  results.push(
    (factAIEvidence.some(function (item) { return item.id === 'CHK-001'; }) &&
      !factAIEvidence.some(function (item) { return item.id === 'RELEVANT'; }) ? 'PASS' : 'FAIL') +
      ' - 사실 질문 AI 조립에서 카드 답변 근거 제외'
  );
  results.push(
    (shouldQueueReview_(
      { blocked: false },
      { studentMove: 'ask_fact' },
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
      { studentMove: 'ask_definition' },
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
    analysis: { studentMove: 'ask_definition' },
    material: material,
    retrieval: cardOnlyDefinitionRetrieval
  });
  results.push(
    (cardOnlyDefinitionResponse.sourceStatus === 'source_insufficient' &&
      cardOnlyDefinitionResponse.text.indexOf('이 답변은 사용하면 안 됩니다.') < 0 &&
      shouldQueueReview_(
        { blocked: false }, { studentMove: 'ask_definition' },
        { isClosing: false, sourceStatus: 'supported' }, cardOnlyDefinitionRetrieval
      ) ? 'PASS' : 'FAIL') +
      ' - 뜻 질문은 예전 카드 답변을 사용하지 않고 검토 큐 등록'
  );

  const aiSettings = {
    routingMode: 'hybrid',
    fastModel: 'gpt-5.6-luna',
    qualityModel: 'gpt-5.6-terra'
  };
  results.push(
    (selectAIModel_(
      'analysis', aiSettings, { stateConfidence: 'high' }, null, []
    ) === 'gpt-5.6-luna' ? 'PASS' : 'FAIL') +
      ' - 하이브리드 분석은 Luna 사용'
  );
  results.push(
    (selectAIModel_(
      'compose', aiSettings,
      { stateConfidence: 'low', misconceptionDetected: false, studentMove: 'attempt_answer' },
      { confidence: 'high' }, []
    ) === 'gpt-5.6-terra' ? 'PASS' : 'FAIL') +
      ' - 낮은 상태 확신은 Terra 승격'
  );
  results.push(
    (selectAIModel_(
      'compose', aiSettings,
      { stateConfidence: 'high', misconceptionDetected: false, studentMove: 'attempt_answer' },
      { confidence: 'high' }, []
    ) === 'gpt-5.6-luna' ? 'PASS' : 'FAIL') +
      ' - 단순 고확신 응답은 Luna 유지'
  );
  results.push(
    (extractOpenAIOutputText_({
      output: [{ content: [{ type: 'output_text', text: '{"status":"ok"}' }] }]
    }) === '{"status":"ok"}' ? 'PASS' : 'FAIL') +
      ' - Responses API 구조화 출력 추출'
  );

  results.forEach(function (result) {
    console.log(result);
  });
  return results;
}
