/**
 * 승인 지식 RAG의 품질을 학년별 합성 지문으로 반복 점검합니다.
 * 실제 학생 기록이나 외부 AI 호출 없이 검색·규칙 응답만 평가합니다.
 */

function runRagEvaluationSuite() {
  requireTeacherMenuContext_();
  const report = evaluateRepresentativeRagSuite_();
  const spreadsheet = getSpreadsheet_();
  ensureWorkbookStructure_(spreadsheet);
  appendEvaluationReport_(spreadsheet, report);
  spreadsheet.toast(
    'RAG 평가 ' + report.summary.rag.passedCases + '/' + report.summary.totalCases +
      ' 통과 · 종합 ' + report.summary.rag.score + '점',
    '질문 챗봇 평가',
    8
  );
  console.log(JSON.stringify({ runId: report.runId, summary: report.summary }));
  return report;
}

function evaluateRepresentativeRagSuite_() {
  const cases = buildRepresentativeEvaluationCases_();
  const ragStartedAt = new Date().getTime();
  const ragResults = cases.map(evaluateRagCase_);
  const ragElapsedMs = new Date().getTime() - ragStartedAt;
  const legacyStartedAt = new Date().getTime();
  const legacyResults = cases.map(evaluateLegacyCase_);
  const legacyElapsedMs = new Date().getTime() - legacyStartedAt;

  return {
    runId: 'EVAL-' + String(new Date().getTime()),
    evaluatedAt: new Date().toISOString(),
    policyVersion: 'knowledge-rag-eval-v1',
    gradeCodes: cases.map(function (testCase) { return testCase.gradeCode; }),
    summary: {
      totalCases: cases.length,
      rag: summarizeEvaluationResults_(
        ragResults,
        ragElapsedMs,
        countTeacherPrepItems_(cases, 'rag')
      ),
      legacy: summarizeEvaluationResults_(
        legacyResults,
        legacyElapsedMs,
        countTeacherPrepItems_(cases, 'legacy')
      )
    },
    cases: ragResults.map(function (result, index) {
      return {
        id: result.id,
        gradeCode: result.gradeCode,
        category: result.category,
        question: result.question,
        reply: result.reply,
        retrievedEvidenceIds: result.retrievedEvidenceIds,
        citedEvidenceIds: result.citedEvidenceIds,
        criteria: result.criteria,
        passed: result.passed,
        legacy: {
          reply: legacyResults[index].reply,
          criteria: legacyResults[index].criteria,
          passed: legacyResults[index].passed
        }
      };
    })
  };
}

function evaluateRagCase_(testCase) {
  const material = Object.assign({}, testCase.material, {
    gradeCode: testCase.gradeCode,
    explanationGradeCode: testCase.explanationGradeCode,
    sourceHash: testCase.sourceHash
  });
  const dialogue = {
    studentMove: testCase.studentMove,
    primaryMove: testCase.studentMove === 'ask_definition' ? 'clarify' : 'check_evidence',
    hintLevel: 0,
    materialId: material.materialId,
    version: material.version
  };
  const retrieval = rankEvidenceCandidates_(
    testCase.question,
    dialogue,
    material,
    [],
    testCase.vocabulary || [],
    testCase.chunks || [],
    { MIN_RELEVANCE_SCORE: 3, MAX_RETRIEVAL_RESULTS: 3 },
    testCase.knowledge || []
  );
  const response = renderResponse_({
    plan: {
      primaryMove: dialogue.primaryMove,
      hintLevel: 0,
      sourceStatus: 'supported',
      reasonCode: testCase.category === 'inference' ? 'INFERENCE_QUESTION' : 'EVALUATION'
    },
    analysis: { studentMove: testCase.studentMove },
    material: material,
    retrieval: retrieval
  });
  const retrievedIds = retrieval.retrievedVocabularyIds
    .concat(retrieval.retrievedKnowledgeIds)
    .concat(retrieval.retrievedChunkIds);
  const citedIds = response.validatedVocabularyIds
    .concat(response.validatedKnowledgeIds)
    .concat(response.evidence.map(function (item) { return item.id; }));
  const criteria = scoreEvaluationReply_(testCase, response.text, {
    evidence: response.evidence,
    retrievedIds: retrievedIds,
    citedIds: citedIds
  });
  return {
    id: testCase.id,
    gradeCode: testCase.gradeCode,
    category: testCase.category,
    question: testCase.question,
    reply: response.text,
    retrievedEvidenceIds: uniqueEvaluationValues_(retrievedIds),
    citedEvidenceIds: uniqueEvaluationValues_(citedIds),
    criteria: criteria,
    passed: evaluationCriteriaPassed_(criteria)
  };
}

function evaluateLegacyCase_(testCase) {
  const criteria = scoreEvaluationReply_(testCase, testCase.legacyReply, {
    evidence: [],
    retrievedIds: [],
    citedIds: []
  });
  return {
    id: testCase.id,
    gradeCode: testCase.gradeCode,
    category: testCase.category,
    reply: testCase.legacyReply,
    criteria: criteria,
    passed: evaluationCriteriaPassed_(criteria)
  };
}

function scoreEvaluationReply_(testCase, reply, evidenceState) {
  const text = String(reply || '');
  const requiredTerms = testCase.requiredTerms || [];
  const forbiddenTerms = testCase.forbiddenTerms || [];
  const contentAccurate = requiredTerms.every(function (term) {
    return text.indexOf(term) >= 0;
  }) && forbiddenTerms.every(function (term) {
    return text.indexOf(term) < 0;
  });
  const evidenceMatch = evidenceState.evidence.some(function (item) {
    return item.id === testCase.expectedEvidenceId &&
      String(item.excerpt || '').indexOf(testCase.expectedEvidenceSnippet) >= 0;
  }) && evidenceState.retrievedIds.indexOf(testCase.expectedEvidenceId) >= 0 &&
    evidenceState.citedIds.indexOf(testCase.expectedEvidenceId) >= 0;
  return {
    factAccuracy: testCase.category === 'vocabulary' ? null : contentAccurate,
    vocabularyLevel: testCase.category === 'vocabulary' ? contentAccurate : null,
    inferenceLabel: testCase.category === 'inference'
      ? /(추론|근거를 바탕으로 생각)/.test(text)
      : null,
    evidenceMatch: evidenceMatch,
    answerLength: text.length > 0 && text.length <= testCase.maxAnswerLength,
    answerLengthValue: text.length
  };
}

function evaluationCriteriaPassed_(criteria) {
  return ['factAccuracy', 'vocabularyLevel', 'inferenceLabel', 'evidenceMatch', 'answerLength']
    .filter(function (key) { return criteria[key] !== null; })
    .every(function (key) { return criteria[key] === true; });
}

function summarizeEvaluationResults_(results, elapsedMs, teacherPrepItems) {
  const metricKeys = [
    'factAccuracy', 'vocabularyLevel', 'inferenceLabel', 'evidenceMatch', 'answerLength'
  ];
  const metrics = {};
  let passedCriteria = 0;
  let totalCriteria = 0;
  metricKeys.forEach(function (key) {
    const applicable = results.filter(function (result) {
      return result.criteria[key] !== null;
    });
    const passed = applicable.filter(function (result) {
      return result.criteria[key] === true;
    }).length;
    metrics[key] = {
      passed: passed,
      total: applicable.length,
      rate: applicable.length ? Math.round(passed / applicable.length * 100) : 100
    };
    passedCriteria += passed;
    totalCriteria += applicable.length;
  });
  return {
    passedCases: results.filter(function (result) { return result.passed; }).length,
    score: totalCriteria ? Math.round(passedCriteria / totalCriteria * 100) : 0,
    elapsedMs: elapsedMs,
    teacherPrepItems: teacherPrepItems,
    metrics: metrics
  };
}

function countTeacherPrepItems_(cases, mode) {
  return cases.reduce(function (total, testCase) {
    if (mode === 'legacy') return total + Number(testCase.legacyCardCount || 1);
    return total + (testCase.vocabulary || []).length + (testCase.knowledge || []).length;
  }, 0);
}

function appendEvaluationReport_(spreadsheet, report) {
  appendObjectsToSheet_(spreadsheet.getSheetByName('EVALUATION_LOG'), [{
    timestamp: new Date(),
    runId: report.runId,
    policyVersion: report.policyVersion,
    totalCases: report.summary.totalCases,
    passedCases: report.summary.rag.passedCases,
    ragScore: report.summary.rag.score,
    legacyScore: report.summary.legacy.score,
    factAccuracyRate: report.summary.rag.metrics.factAccuracy.rate,
    vocabularyLevelRate: report.summary.rag.metrics.vocabularyLevel.rate,
    inferenceLabelRate: report.summary.rag.metrics.inferenceLabel.rate,
    evidenceMatchRate: report.summary.rag.metrics.evidenceMatch.rate,
    answerLengthRate: report.summary.rag.metrics.answerLength.rate,
    ragElapsedMs: report.summary.rag.elapsedMs,
    legacyElapsedMs: report.summary.legacy.elapsedMs,
    ragPrepItems: report.summary.rag.teacherPrepItems,
    legacyPrepItems: report.summary.legacy.teacherPrepItems,
    detailsJson: JSON.stringify(report.cases)
  }]);
}

function uniqueEvaluationValues_(values) {
  return Array.from(new Set((values || []).map(String).filter(Boolean)));
}

function buildRepresentativeEvaluationCases_() {
  return [
    makeEvaluationCase_({
      id: 'E1-FACT', gradeCode: 'E1', explanationGradeCode: 'E1', category: 'fact',
      text: '화분 가는 햇빛이 드는 창가에 두었다. 화분 나는 어두운 상자 안에 두었다. 일주일 뒤 화분 가의 싹이 더 잘 자랐다.',
      question: '어느 화분의 싹이 더 잘 자랐나요?', knowledgeType: 'fact',
      content: '햇빛이 드는 창가의 화분 가에서 싹이 더 잘 자랐어요.',
      keywords: '화분|싹|햇빛|자람', evidenceQuote: '일주일 뒤 화분 가의 싹이 더 잘 자랐다.',
      requiredTerms: ['화분 가', '더 잘'], forbiddenTerms: ['화분 나'], maxAnswerLength: 150,
      legacyReply: '어두운 곳의 화분 나가 더 잘 자랐어요.', legacyCardCount: 2
    }),
    makeEvaluationCase_({
      id: 'E2-VOCAB', gradeCode: 'E2', explanationGradeCode: 'E1', category: 'vocabulary',
      text: '지우는 아침마다 강낭콩의 잎과 줄기를 자세히 관찰하고 그림으로 남겼다.',
      question: '관찰이 뭐예요?', term: '관찰', easyExplanation: '대상을 자세히 살펴보는 것',
      keywords: '관찰|살펴보기', evidenceQuote: '강낭콩의 잎과 줄기를 자세히 관찰하고',
      requiredTerms: ['자세히 살펴보는 것'], forbiddenTerms: ['객관적', '체계적'], maxAnswerLength: 120,
      legacyReply: '관찰은 대상을 객관적이고 체계적인 절차로 인지하는 활동입니다.', legacyCardCount: 3
    }),
    makeEvaluationCase_({
      id: 'E3-FACT', gradeCode: 'E3', explanationGradeCode: 'E2', category: 'fact',
      text: '얼음이 든 컵을 책상에 두자 컵 바깥쪽에 물방울이 생겼다. 공기 중 수증기가 차가운 컵에 닿아 물로 변했기 때문이다.',
      question: '컵 바깥쪽에 물방울이 생긴 까닭은 무엇인가요?', knowledgeType: 'fact',
      content: '공기 중 수증기가 차가운 컵에 닿아 물로 변했기 때문이에요.',
      keywords: '컵|물방울|수증기|차가운', evidenceQuote: '공기 중 수증기가 차가운 컵에 닿아 물로 변했기 때문이다.',
      requiredTerms: ['수증기', '물로 변'], forbiddenTerms: ['컵에서 물이 샜'], maxAnswerLength: 170,
      legacyReply: '컵 안의 물이 밖으로 조금씩 새어 나왔기 때문이에요.', legacyCardCount: 2
    }),
    makeEvaluationCase_({
      id: 'E4-VOCAB', gradeCode: 'E4', explanationGradeCode: 'E3', category: 'vocabulary',
      text: '젖은 수건을 햇볕에 널면 물이 수증기로 변해 공기 중으로 올라간다. 이런 변화를 증발이라고 한다.',
      question: '증발은 무슨 뜻이에요?', term: '증발', easyExplanation: '물이 수증기로 변해 공기 중으로 올라가는 현상',
      keywords: '증발|물|수증기', evidenceQuote: '물이 수증기로 변해 공기 중으로 올라간다.',
      requiredTerms: ['물이 수증기로 변'], forbiddenTerms: ['분자 운동', '기화 엔탈피'], maxAnswerLength: 140,
      legacyReply: '증발은 액체 분자의 운동 에너지가 기화 엔탈피를 넘어서는 현상입니다.', legacyCardCount: 3
    }),
    makeEvaluationCase_({
      id: 'E5-FACT', gradeCode: 'E5', explanationGradeCode: 'E4', category: 'fact',
      text: '학교는 학생들이 반찬 양을 직접 고르게 했다. 한 달 뒤 하루 세 통이 넘던 잔반이 한 통 반으로 줄었다.',
      question: '한 달 뒤 잔반은 얼마나 줄었나요?', knowledgeType: 'fact',
      content: '하루 세 통이 넘던 잔반이 한 통 반으로 줄었어요.',
      keywords: '한 달|잔반|세 통|한 통 반', evidenceQuote: '하루 세 통이 넘던 잔반이 한 통 반으로 줄었다.',
      requiredTerms: ['세 통', '한 통 반'], forbiddenTerms: ['두 통'], maxAnswerLength: 150,
      legacyReply: '한 달 뒤 잔반은 두 통으로 줄었습니다.', legacyCardCount: 3
    }),
    makeEvaluationCase_({
      id: 'E6-INFER', gradeCode: 'E6', explanationGradeCode: 'E5', category: 'inference',
      text: '한낮 운동장 아스팔트의 온도는 42도였고 나무 그늘은 29도였다. 쉬는 시간에 많은 학생이 나무 그늘에 모였다.',
      question: '학생들이 나무 그늘을 더 시원하게 느낀 까닭은 무엇일까요?', knowledgeType: 'relation',
      content: '나무 그늘의 온도가 아스팔트보다 13도 낮아서 더 시원하게 느꼈다고 볼 수 있어요.',
      keywords: '학생|나무 그늘|시원|온도|아스팔트', evidenceQuote: '아스팔트의 온도는 42도였고 나무 그늘은 29도였다.',
      requiredTerms: ['온도', '13도'], forbiddenTerms: ['바람이 불어서'], maxAnswerLength: 210,
      legacyReply: '그늘은 언제나 시원하기 때문입니다.', legacyCardCount: 4
    }),
    makeEvaluationCase_({
      id: 'M1-VOCAB', gradeCode: 'M1', explanationGradeCode: 'E6', category: 'vocabulary',
      text: '생태계의 생물과 환경은 서로 영향을 주고받는다. 이러한 관계를 상호작용이라고 한다.',
      question: '상호작용이 무슨 뜻인가요?', term: '상호작용', easyExplanation: '둘 이상이 서로 영향을 주고받는 것',
      keywords: '상호작용|서로|영향', evidenceQuote: '생물과 환경은 서로 영향을 주고받는다.',
      requiredTerms: ['서로 영향을 주고받는 것'], forbiddenTerms: ['인과 메커니즘', '피드백 루프'], maxAnswerLength: 140,
      legacyReply: '상호작용은 복합적인 인과 메커니즘과 피드백 루프의 결합입니다.', legacyCardCount: 3
    }),
    makeEvaluationCase_({
      id: 'M2-FACT', gradeCode: 'M2', explanationGradeCode: 'M1', category: 'fact',
      text: '두 해역을 조사한 결과, 해조류가 많은 해역에서는 어린 물고기의 수가 평균 35마리였고 해조류가 적은 해역에서는 평균 12마리였다.',
      question: '해조류가 많은 해역의 어린 물고기는 평균 몇 마리였나요?', knowledgeType: 'fact',
      content: '해조류가 많은 해역의 어린 물고기는 평균 35마리였어요.',
      keywords: '해조류|어린 물고기|평균|35마리', evidenceQuote: '해조류가 많은 해역에서는 어린 물고기의 수가 평균 35마리였고',
      requiredTerms: ['평균 35마리'], forbiddenTerms: ['12마리였어요'], maxAnswerLength: 160,
      legacyReply: '해조류가 많은 해역에서는 평균 35마리였습니다.', legacyCardCount: 2
    }),
    makeEvaluationCase_({
      id: 'M3-INFER', gradeCode: 'M3', explanationGradeCode: 'M2', category: 'inference',
      text: '실험에서 이산화탄소 농도를 높인 수조는 일주일 동안 조류의 양이 20퍼센트 늘었고, 농도를 바꾸지 않은 수조는 3퍼센트 늘었다.',
      question: '이 결과로 이산화탄소 농도와 조류 증가의 관계를 어떻게 생각할 수 있나요?', knowledgeType: 'relation',
      content: '이 실험 범위에서는 이산화탄소 농도가 높을 때 조류 증가가 더 컸다고 볼 수 있어요.',
      keywords: '이산화탄소|농도|조류|증가|관계', evidenceQuote: '농도를 높인 수조는 일주일 동안 조류의 양이 20퍼센트 늘었고',
      requiredTerms: ['이산화탄소', '조류 증가'], forbiddenTerms: ['항상', '반드시'], maxAnswerLength: 230,
      legacyReply: '이산화탄소가 많으면 조류는 반드시 계속 증가합니다.', legacyCardCount: 4
    })
  ];
}

function makeEvaluationCase_(values) {
  const materialId = 'EVAL-' + values.gradeCode;
  const sourceHash = 'eval-source-' + values.gradeCode.toLowerCase();
  const chunkId = 'CHK-' + values.gradeCode;
  const isVocabulary = values.category === 'vocabulary';
  const knowledgeId = 'KN-' + values.gradeCode;
  const vocabularyId = 'VOC-' + values.gradeCode;
  return {
    id: values.id,
    gradeCode: values.gradeCode,
    explanationGradeCode: values.explanationGradeCode,
    category: values.category,
    studentMove: isVocabulary ? 'ask_definition' : 'ask_fact',
    question: values.question,
    sourceHash: sourceHash,
    requiredTerms: values.requiredTerms,
    forbiddenTerms: values.forbiddenTerms,
    expectedEvidenceId: isVocabulary ? vocabularyId : knowledgeId,
    expectedEvidenceSnippet: isVocabulary
      ? values.term + ': ' + values.easyExplanation
      : values.evidenceQuote,
    maxAnswerLength: values.maxAnswerLength,
    legacyReply: values.legacyReply,
    legacyCardCount: values.legacyCardCount,
    material: {
      materialId: materialId,
      version: 'v1',
      title: values.gradeCode + ' 대표 평가 지문',
      text: values.text,
      sourceLabel: '합성 평가 지문',
      sourceUrl: ''
    },
    chunks: [{
      chunkId: chunkId,
      materialId: materialId,
      version: 'v1',
      content: values.text,
      keywords: values.keywords,
      sourceLabel: '합성 평가 지문',
      sourceLocation: '대표 지문 전체',
      status: 'approved',
      active: true
    }],
    vocabulary: isVocabulary ? [{
      vocabularyId: vocabularyId,
      term: values.term,
      normalizedTerm: values.term,
      targetGradeCode: values.gradeCode,
      explanationGradeCode: values.explanationGradeCode,
      easyDefinition: values.easyExplanation,
      exampleText: values.evidenceQuote,
      questionPatterns: values.question,
      sourceId: materialId,
      sourceLabel: '합성 평가 지문',
      sourceLocation: '대표 지문 전체',
      status: 'approved',
      active: true,
      teacherApproved: true,
      reliability: 'A',
      version: 'v1'
    }] : [],
    knowledge: isVocabulary ? [] : [{
      knowledgeId: knowledgeId,
      materialId: materialId,
      version: 'v1',
      sourceHash: sourceHash,
      knowledgeType: values.knowledgeType,
      title: values.category === 'inference' ? '자료 관계 추론' : '자료 사실',
      content: values.content,
      easyExplanation: values.content,
      gradeCode: values.gradeCode,
      explanationGradeCode: values.explanationGradeCode,
      keywords: values.keywords,
      evidenceQuote: values.evidenceQuote,
      chunkId: chunkId,
      sourceLocation: '대표 지문 전체',
      status: 'approved',
      active: true,
      reliability: 'A'
    }]
  };
}
