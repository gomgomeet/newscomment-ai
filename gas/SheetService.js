const QUESTION_BOT_HEADERS_ = {
  CONFIG: ['key', 'value', 'description'],
  MATERIALS: [
    'materialId', 'title', 'grade', 'standard', 'text', 'startQuestion', 'active',
    'version', 'sourceLabel', 'sourceUrl', 'status', 'approvedAt', 'gradeCode',
    'explanationGradeCode', 'activityMode'
  ],
  MATERIAL_CHUNKS: [
    'chunkId', 'materialId', 'chunkOrder', 'content', 'keywords', 'sourceLabel',
    'sourceLocation', 'version', 'status', 'active', 'contentHash', 'updatedAt'
  ],
  CARDS: [
    'cardId', 'botId', 'studentMove', 'condition', 'primaryMove', 'hintLevel',
    'response', 'active', 'teacherNote', 'materialId', 'title', 'questionPatterns',
    'keywords', 'sourceId', 'sourceLocation', 'evidenceText', 'version', 'status',
    'reliability', 'updatedAt', 'generationId', 'cardType', 'validationStatus',
    'teacherCheck', 'teacherDecision', 'approvedAt', 'sourceHash', 'glossaryGroup'
  ],
  VOCABULARY_LIBRARY: [
    'vocabularyId', 'term', 'normalizedTerm', 'targetGradeCode',
    'explanationGradeCode', 'easyDefinition', 'exampleText', 'questionPatterns',
    'sourceId', 'sourceLabel', 'sourceLocation', 'sourceUrl', 'status', 'active',
    'teacherApproved', 'reliability', 'version', 'updatedAt', 'sourceHash', 'wordGroup'
  ],
  KNOWLEDGE_ITEMS: [
    'knowledgeId', 'materialId', 'version', 'sourceHash', 'knowledgeType',
    'title', 'content', 'easyExplanation', 'gradeCode', 'explanationGradeCode',
    'keywords', 'evidenceQuote', 'chunkId', 'sourceLocation', 'status', 'active',
    'teacherNote', 'generationId', 'promptVersion', 'analysisModel',
    'validationStatus', 'teacherDecision', 'createdAt', 'approvedAt', 'updatedAt'
  ],
  SOURCE_LIBRARY: [
    'sourceId', 'materialId', 'version', 'sourceHash', 'title', 'sourceType',
    'url', 'sourceName', 'publishedAt', 'checkedAt', 'allowedScope', 'note',
    'status', 'active', 'teacherApproved', 'contentHash', 'updatedAt'
  ],
  BOARD: [
    'scenarioId', 'studentUtterance', 'studentMove', 'knowledgeState', 'teacherGoal',
    'primaryMove', 'hintLevel', 'response', 'acceptanceCriteria', 'testStatus'
  ],
  SESSIONS: [
    'startedAt', 'sessionId', 'studentCode', 'botId', 'materialId', 'status',
    'policyVersion', 'endedAt', 'materialVersion', 'materialSourceHash'
  ],
  TURNS: [
    'timestamp', 'sessionId', 'studentCode', 'turnNo', 'speaker', 'text',
    'studentMove', 'primaryMove', 'hintLevel', 'sourceStatus', 'reasonGiven',
    'passageEcho', 'feedbackUptake', 'interventionFlag', 'policyVersion',
    'retrievedCardIds', 'retrievedChunkIds', 'retrievedVocabularyIds',
    'retrievedKnowledgeIds', 'citedCardIds', 'validatedCardIds',
    'citedVocabularyIds', 'validatedVocabularyIds', 'citedKnowledgeIds',
    'validatedKnowledgeIds', 'retrievedExternalSourceIds',
    'citedExternalSourceIds', 'validatedExternalSourceIds',
    'evidenceLabels', 'retrievalConfidence', 'reviewId', 'aiEnabled',
    'aiAnalysisModel', 'aiResponseModel', 'aiStatus', 'stateConfidence',
    'activeConcept', 'rewrittenQuery', 'misconceptionDetected', 'aiUsedEvidenceIds'
  ],
  RETRIEVAL_LOG: [
    'timestamp', 'sessionId', 'turnNo', 'materialId', 'query', 'queryTokens',
    'retrievedCardIds', 'retrievedChunkIds', 'retrievedVocabularyIds',
    'retrievedKnowledgeIds', 'retrievedExternalSourceIds',
    'topScore', 'scoreGap', 'ambiguityFlag', 'confidence', 'outcome',
    'policyVersion', 'originalQuery', 'rewrittenQuery', 'strategyConfidence',
    'evidenceConfidence', 'stateConfidence', 'aiAnalysisModel', 'aiResponseModel',
    'aiStatus', 'decisionReason'
  ],
  REVIEW_QUEUE: [
    'createdAt', 'lastSeenAt', 'reviewId', 'sessionId', 'studentCode', 'materialId',
    'question', 'reasonCode', 'topScore', 'candidateCardIds', 'candidateChunkIds',
    'candidateVocabularyIds', 'candidateKnowledgeIds', 'candidateExternalSourceIds',
    'occurrenceKey', 'count', 'status', 'teacherDecision', 'reviewedAt', 'version', 'sourceHash', 'studentMove'
  ],
  AI_GENERATION_LOG: [
    'createdAt', 'runId', 'materialId', 'version', 'sourceHash', 'model',
    'promptVersion', 'status', 'proposedCount', 'approvedCount', 'rejectedCount',
    'inputTokens', 'outputTokens', 'responseId', 'errorMessage', 'updatedAt',
    'generationMode', 'targetCardCount', 'dictionaryTarget', 'sourceChunkCount',
    'elapsedMs', 'fallbackReason'
  ],
  EVALUATION_LOG: [
    'timestamp', 'runId', 'policyVersion', 'totalCases', 'passedCases',
    'ragScore', 'legacyScore', 'factAccuracyRate', 'vocabularyLevelRate',
    'inferenceLabelRate', 'evidenceMatchRate', 'answerLengthRate',
    'ragElapsedMs', 'legacyElapsedMs', 'ragPrepItems', 'legacyPrepItems',
    'detailsJson'
  ],
  OPERATION_CHECKS: [
    'timestamp', 'level', 'canStartClass', 'blockerCount', 'warningCount',
    'materialId', 'gradeCode', 'approvedChunkCount', 'approvedKnowledgeCount',
    'approvedVocabularyCount', 'approvedExternalSourceCount', 'draftKnowledgeCount', 'openReviewCount',
    'aiEnabled', 'apiKeyConfigured', 'routingMode', 'fastModel', 'qualityModel',
    'studentUrlConfigured', 'detailsJson'
  ]
};

let requestSpreadsheet_ = null;
let requestMetrics_ = null;

function waitForMeasuredLock_(lock, milliseconds) {
  const started = Date.now();
  try { lock.waitLock(milliseconds); }
  finally { if (requestMetrics_) { requestMetrics_.lockWaitMs += Date.now() - started; requestMetrics_.lockCalls += 1; } }
}

function flushAndReleaseLock_(lock) {
  try { SpreadsheetApp.flush(); }
  finally { lock.releaseLock(); }
}

function getSpreadsheet_() {
  if (requestSpreadsheet_) return requestSpreadsheet_;
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (spreadsheetId) return SpreadsheetApp.openById(spreadsheetId);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error('먼저 Google Sheet에서 setupProject()를 실행해 주세요.');
}

function ensureWorkbookStructure_(spreadsheet) {
  Object.keys(QUESTION_BOT_HEADERS_).forEach(function (sheetName) {
    let sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) sheet = spreadsheet.insertSheet(sheetName);
    ensureSheetHeaders_(sheet, QUESTION_BOT_HEADERS_[sheetName]);
  });
}

function ensureSheetHeaders_(sheet, expectedHeaders) {
  let changed = false;
  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    changed = true;
  } else {
    const existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn())
      .getDisplayValues()[0]
      .map(function (value) { return String(value).trim(); });
    const missingHeaders = expectedHeaders.filter(function (header) {
      return existingHeaders.indexOf(header) < 0;
    });
    if (missingHeaders.length > 0) {
      sheet.getRange(1, existingHeaders.length + 1, 1, missingHeaders.length)
        .setValues([missingHeaders]);
      changed = true;
    }
  }

  // 조회·저장 때 이미 준비된 모든 시트의 서식을 다시 쓰지 않습니다.
  if (!changed) return;
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .setFontWeight('bold')
    .setBackground('#173f5f')
    .setFontColor('#ffffff')
    .setWrap(true);
}

function seedSampleData_(spreadsheet) {
  upsertConfigDefaults_(spreadsheet, [
    ['APP_NAME', '질문이', '학생 화면에 표시할 챗봇 이름'],
    ['SUBJECT', '국어', '학생 화면에 표시할 교과'],
    ['STUDENT_WEB_APP_URL', '', '현재 학생용 /exec 배포 주소. 여러 배포가 있으면 명시적으로 지정'],
    ['BOT_ID', 'question-bot-01', '챗봇 구분 ID'],
    ['POLICY_VERSION', 'ai-rag-router-v1', '대화·검색 정책 버전'],
    ['GREETING_MESSAGE', '안녕! 나는 {appName}야. 함께 지문을 읽고 질문을 나눠 보자.', '챗봇 첫 인사. {appName} 사용 가능'],
    ['INTRO_MESSAGE', '지문을 읽고 먼저 자기 생각을 말해 보세요. 어려우면 힌트를 요청할 수 있어요.', '첫 안내 문구'],
    ['ASK_NICKNAME', 'TRUE', '학생에게 화면용 이름·별명을 물을지 여부'],
    ['NICKNAME_PROMPT', '대화에서 사용할 이름이나 별명을 알려 주세요. 건너뛰어도 괜찮아요.', '이름·별명 입력 안내'],
    ['MAX_INPUT_LENGTH', '500', '학생 입력 최대 글자 수'],
    ['MIN_RELEVANCE_SCORE', '3', '검색 후보가 되기 위한 최소 관련도'],
    ['MAX_RETRIEVAL_RESULTS', '3', '카드와 자료 구간별 최대 검색 수'],
    ['RETRIEVAL_CACHE_SECONDS', '300', '승인 자료 검색 캐시 유지 시간(초)'],
    ['SHOW_EVIDENCE', 'TRUE', '학생 화면의 근거 보기 표시 여부'],
    ['AI_ENABLED', 'FALSE', 'OpenAI API 사용 여부. 키 설정 메뉴 실행 시 TRUE'],
    ['AI_ROUTING_MODE', 'terra_only', '연수: terra_only, 운영: hybrid'],
    ['AI_MODEL_FAST', 'gpt-5.6-luna', '일반 분류·재구성용 저비용 모델'],
    ['AI_MODEL_QUALITY', 'gpt-5.6-terra', '오개념·모호성·응답 조립용 모델'],
    ['AI_REASONING_EFFORT', 'low', 'AI 추론 강도: none|minimal|low|medium|high|xhigh'],
    ['AI_MAX_HISTORY_TURNS', '6', 'AI에 전달할 최근 대화 턴 수'],
    ['AI_MAX_OUTPUT_TOKENS', '500', 'AI 호출당 최대 출력 토큰'],
    ['AI_CARD_GENERATION_MODE', 'fast', '카드 생성: fast=Luna 우선, quality=Terra 고정'],
    ['AI_CARD_MAX_COUNT', '9', '자료 길이에 따라 조절되는 AI 카드 수의 상한'],
    ['AI_CARD_REASONING_EFFORT', 'none', 'Luna 빠른 카드 생성의 추론 강도'],
    ['AI_CARD_SOURCE_CHAR_LIMIT', '7000', '카드 생성 요청에 포함할 원문 글자 수 상한'],
    ['AI_CARD_TERRA_FALLBACK', 'TRUE', 'Luna 실패 또는 유효 카드 0개일 때 Terra로 한 번 보완'],
    ['KNOWLEDGE_PACK_MAX_ITEMS', '24', '지문 전체 분석에서 저장할 지식 항목 수 상한']
  ]);

  const materialSheet = spreadsheet.getSheetByName('MATERIALS');
  if (materialSheet.getLastRow() === 1) {
    appendObjectsToSheet_(materialSheet, [{
      materialId: 'MAT-001',
      title: '먹을 만큼 골라 담아요',
      grade: '초등 5~6학년',
      gradeCode: 'E5',
      explanationGradeCode: 'E4',
      standard: '글의 주장과 근거를 구분하고 자기 생각을 근거와 함께 표현한다.',
      text: '푸른초등학교는 급식 잔반을 줄이기 위해 학생들이 반찬의 양을 조금, 보통, 많이 가운데 직접 고르게 했다. 한 달 뒤 하루 세 통이 넘던 잔반이 한 통 반으로 줄었다. 학교는 먹을 만큼 선택하는 습관이 음식 낭비를 줄이는 데 도움이 되었다고 설명했다.',
      startQuestion: '학교의 어떤 변화가 잔반을 줄이는 데 도움이 되었을까요?',
      active: true,
      version: 'v1',
      sourceLabel: '교사 제공 수업 지문',
      sourceUrl: '',
      status: 'approved',
      approvedAt: new Date()
    }]);
  }

  const cardSheet = spreadsheet.getSheetByName('CARDS');
  if (cardSheet.getLastRow() === 1) {
    const common = {
      botId: 'question-bot-01', materialId: 'MAT-001', sourceId: 'MAT-001',
      sourceLocation: '교사 제공 수업 지문', version: 'v1', status: 'approved',
      reliability: 'A', active: true, updatedAt: new Date()
    };
    appendObjectsToSheet_(cardSheet, [
      Object.assign({}, common, {
        cardId: 'C001', studentMove: 'request_hint', primaryMove: 'offer_clue', hintLevel: 1,
        response: '먼저 결과가 달라진 문장을 찾아볼까요?', teacherNote: '위치만 안내',
        title: '1단계 위치 힌트', questionPatterns: '힌트가 필요해요|어디를 읽어야 하나요', keywords: '힌트|결과|문장'
      }),
      Object.assign({}, common, {
        cardId: 'C002', studentMove: 'request_hint', primaryMove: 'offer_clue', hintLevel: 2,
        response: '지문에서 “한 달 뒤”가 들어간 문장과 그 앞 문장을 이어서 읽어 보세요.', teacherNote: '관련 문장 안내',
        title: '2단계 문장 힌트', questionPatterns: '힌트를 더 주세요|조금 더 알려 주세요', keywords: '한 달 뒤|앞 문장|잔반'
      }),
      Object.assign({}, common, {
        cardId: 'C003', studentMove: 'request_hint', primaryMove: 'offer_clue', hintLevel: 3,
        response: '“학교는 ___을 바꾸었고, 그 결과 ___이 달라졌다.” 틀로 말해 볼까요?', teacherNote: '문장 틀',
        title: '3단계 문장 틀', questionPatterns: '더 구체적인 힌트|정말 모르겠어요', keywords: '학교|바꾸다|결과'
      }),
      Object.assign({}, common, {
        cardId: 'C004', studentMove: 'attempt_answer', primaryMove: 'check_evidence', hintLevel: 1,
        response: '그렇게 생각한 근거를 지문의 어느 문장에서 찾았나요?', teacherNote: '근거 확인',
        title: '근거 확인', questionPatterns: '제 생각에는|때문인 것 같아요', keywords: '근거|지문|문장'
      }),
      Object.assign({}, common, {
        cardId: 'C005', studentMove: 'give_evidence', primaryMove: 'check_evidence', hintLevel: 1,
        response: '근거를 찾았네요. 그 문장이 네 생각과 어떻게 이어지는지도 말해 볼까요?', teacherNote: '이유 연결',
        title: '근거와 이유 연결', questionPatterns: '글에 나와요|지문에 적혀 있어요', keywords: '근거|이유|연결'
      }),
      Object.assign({}, common, {
        cardId: 'C006', studentMove: 'revise', primaryMove: 'receive', hintLevel: 0,
        response: '근거를 반영해 생각을 고쳤군요. 처음 답과 무엇이 달라졌는지 한 가지만 말해 주세요.', teacherNote: '수정 인정',
        title: '수정 인정', questionPatterns: '답을 고칠게요|다시 생각했어요', keywords: '수정|고치다|다시'
      }),
      Object.assign({}, common, {
        cardId: 'C007', studentMove: 'express_uncertainty', primaryMove: 'offer_clue', hintLevel: 1,
        response: '괜찮아요. 먼저 학교가 바꾼 방법을 나타내는 낱말을 찾아볼까요?', teacherNote: '불확실성 지원',
        title: '불확실성 지원', questionPatterns: '모르겠어요|헷갈려요', keywords: '모르다|헷갈리다|방법'
      }),
      Object.assign({}, common, {
        cardId: 'C008', studentMove: 'close', primaryMove: 'close', hintLevel: 0,
        response: '오늘 말한 생각은 여기까지 저장할게요. 참여해 줘서 고마워요.', teacherNote: '추가 질문 없음',
        title: '대화 종료', questionPatterns: '그만할래요|마칠게요', keywords: '종료|그만|마치다'
      }),
      Object.assign({}, common, {
        cardId: 'C009', studentMove: 'ask_fact', primaryMove: 'check_evidence', hintLevel: 1,
        response: '교사가 제공한 자료에서는 반찬 양을 직접 고른 변화와 잔반 감소가 함께 제시됩니다. 두 내용을 이어 주는 문장을 찾아 말해 볼까요?',
        teacherNote: '자료 기반 사실 질문', title: '선택 배식과 잔반 감소',
        questionPatterns: '왜 잔반이 줄었나요|무엇이 잔반을 줄였나요|학교가 무엇을 바꾸었나요',
        keywords: '잔반|반찬 양|직접 고르다|선택 배식',
        evidenceText: '학생들이 반찬의 양을 직접 고르게 한 뒤 잔반이 한 통 반으로 줄었다.'
      }),
      Object.assign({}, common, {
        cardId: 'C010', studentMove: 'ask_definition', condition: 'teacher_glossary',
        primaryMove: 'clarify', hintLevel: 0,
        response: '“잔반”의 뜻은 ‘먹고 남은 음식’이에요. 이제 지문에서 “잔반”이 사용된 부분을 다시 읽어 볼까요?',
        teacherNote: '교사 입력 웹앱 사전카드', title: '낱말 뜻: 잔반',
        questionPatterns: '잔반 뜻|잔반이 뭐예요|잔반은 무엇인가요|잔반의 의미',
        keywords: '잔반', evidenceText: '잔반: 먹고 남은 음식'
      })
    ]);
  }

  backfillLegacyCardMetadata_(spreadsheet);
  ensureStarterDefinitionCard_(spreadsheet);
  backfillVocabularyFromApprovedCards_(spreadsheet);
}

function ensureStarterDefinitionCard_(spreadsheet) {
  const materialRows = getRowsAsObjects_('MATERIALS');
  const starter = materialRows.find(function (row) {
    return String(row.materialId) === 'MAT-001' && String(row.text || '').indexOf('잔반') >= 0;
  });
  if (!starter) return;
  const cards = getRowsAsObjects_('CARDS');
  const exists = cards.some(function (row) {
    return String(row.cardId) === 'C010' ||
      (String(row.studentMove) === 'ask_definition' && String(row.keywords).indexOf('잔반') >= 0);
  });
  if (exists) return;
  appendObjectsToSheet_(spreadsheet.getSheetByName('CARDS'), [{
    cardId: 'C010', botId: 'question-bot-01', studentMove: 'ask_definition',
    condition: 'teacher_glossary', primaryMove: 'clarify', hintLevel: 0,
    response: '“잔반”의 뜻은 ‘먹고 남은 음식’이에요. 이제 지문에서 “잔반”이 사용된 부분을 다시 읽어 볼까요?',
    active: true, teacherNote: '교사 입력 웹앱 사전카드',
    materialId: 'MAT-001', title: '낱말 뜻: 잔반',
    questionPatterns: '잔반 뜻|잔반이 뭐예요|잔반은 무엇인가요|잔반의 의미',
    keywords: '잔반', sourceId: 'MAT-001',
    sourceLocation: '교사 사전카드', evidenceText: '잔반: 먹고 남은 음식',
    version: String(starter.version || 'v1'), status: 'approved', reliability: 'A',
    updatedAt: new Date()
  }]);
}

function validateTeacherSetupPayload_(payload) {
  const text = function (value) { return String(value || '').trim(); };
  const required = function (value, label, maxLength) {
    const result = text(value);
    if (!result) throw new Error(label + '을(를) 입력해 주세요.');
    if (maxLength && result.length > maxLength) {
      throw new Error(label + '은(는) ' + maxLength + '자 이내로 입력해 주세요.');
    }
    return result;
  };
  const materialInput = payload.material || {};
  const materialText = required(materialInput.text, '지문', 12000);
  if (materialText.length < 30) throw new Error('지문은 30자 이상 입력해 주세요.');
  const sourceUrl = text(materialInput.sourceUrl);
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) {
    throw new Error('자료 링크는 http:// 또는 https://로 시작해야 합니다.');
  }

  const glossary = (Array.isArray(payload.glossary) ? payload.glossary : [])
    .map(function (item) {
      return { term: text(item && item.term), definition: text(item && item.definition), group: text(item && item.group) };
    })
    .filter(function (item) { return item.term || item.definition; });
  if (glossary.length > 120) throw new Error('사전카드는 한 번에 120개까지 입력할 수 있습니다.');
  glossary.forEach(function (item) {
    if (!item.term || !item.definition) throw new Error('사전카드에는 낱말과 뜻을 모두 입력해 주세요.');
    if (item.term.length > 50) throw new Error('사전카드 낱말은 50자 이내로 입력해 주세요.');
    if (item.group.length > 60) throw new Error('단어군은 60자 이내로 입력해 주세요.');
    if (item.definition.length > 300) throw new Error('사전카드 뜻은 300자 이내로 입력해 주세요.');
  });

  const activityMode = text(materialInput.activityMode || 'discussion').toLowerCase();
  if (['discussion', 'research'].indexOf(activityMode) < 0) {
    throw new Error('수업 모드는 생각 나누기 또는 조사학습 중에서 선택해 주세요.');
  }
  const externalSources = (Array.isArray(payload.externalSources) ? payload.externalSources : [])
    .map(function (item) {
      return {
        sourceId: text(item && item.sourceId),
        title: text(item && item.title),
        url: text(item && item.url),
        sourceName: text(item && item.sourceName),
        publishedAt: text(item && item.publishedAt),
        checkedAt: text(item && item.checkedAt),
        allowedScope: text(item && item.allowedScope),
        note: text(item && item.note),
        teacherApproved: Boolean(item && item.teacherApproved)
      };
    })
    .filter(function (item) {
      return item.title || item.url || item.sourceName || item.allowedScope || item.note;
    });
  if (externalSources.length > 10) {
    throw new Error('조사 자료는 수업당 10개까지 등록할 수 있습니다.');
  }
  externalSources.forEach(function (item) {
    if (!item.title || !item.url || !item.sourceName || !item.checkedAt || !item.allowedScope) {
      throw new Error('조사 자료에는 제목, 주소, 출처, 확인일, 허용 범위를 모두 입력해 주세요.');
    }
    if (!/^https?:\/\//i.test(item.url)) {
      throw new Error('조사 자료 주소는 http:// 또는 https://로 시작해야 합니다.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.checkedAt)) {
      throw new Error('조사 자료 확인일은 YYYY-MM-DD 형식으로 입력해 주세요.');
    }
    if (item.title.length > 160 || item.sourceName.length > 120 ||
        item.allowedScope.length > 500 || item.note.length > 500) {
      throw new Error('조사 자료 입력값이 허용 길이를 넘었습니다.');
    }
  });

  return {
    appName: required(payload.appName, '챗봇 이름', 40),
    subject: text(payload.subject).slice(0, 40),
    greetingMessage: required(payload.greetingMessage, '첫 인사', 240),
    introMessage: required(payload.introMessage, '활동 안내', 400),
    askNickname: Boolean(payload.askNickname),
    nicknamePrompt: required(payload.nicknamePrompt, '이름·별명 안내', 200),
    material: {
      materialId: text(materialInput.materialId),
      title: required(materialInput.title, '주제', 120),
      grade: required(materialInput.grade, '학년', 60),
      standard: required(materialInput.standard, '성취기준', 500),
      text: materialText,
      startQuestion: required(materialInput.startQuestion, '시작 질문', 300),
      version: text(materialInput.version) || 'v1',
      sourceLabel: text(materialInput.sourceLabel) || '교사 제공 수업 지문',
      sourceUrl: sourceUrl,
      activityMode: activityMode
    },
    glossary: glossary,
    externalSources: externalSources
  };
}

function saveActiveMaterial_(materialInput) {
  const sheet = getSpreadsheet_().getSheetByName('MATERIALS');
  const headers = getHeaderMap_(sheet);
  const rows = getRowsAsObjects_('MATERIALS');
  let target = null;
  if (materialInput.materialId) {
    target = rows.find(function (row) {
      return String(row.materialId) === String(materialInput.materialId);
    }) || null;
  }
  if (!target) {
    target = rows.find(function (row) { return isTruthy_(row.active); }) || rows[0] || null;
  }
  const materialId = String(
    materialInput.materialId || (target && target.materialId) ||
    ('MAT-' + Utilities.getUuid().slice(0, 8).toUpperCase())
  );
  const gradePolicy = requireSupportedGrade_(materialInput.grade);
  const rowObject = {
    materialId: materialId,
    title: materialInput.title,
    grade: materialInput.grade,
    gradeCode: gradePolicy.targetCode,
    explanationGradeCode: gradePolicy.explanationCode,
    standard: materialInput.standard,
    text: materialInput.text,
    startQuestion: materialInput.startQuestion,
    active: true,
    version: materialInput.version,
    sourceLabel: materialInput.sourceLabel,
    sourceUrl: materialInput.sourceUrl,
    status: 'approved',
    approvedAt: new Date(),
    activityMode: materialInput.activityMode || 'discussion'
  };

  syncManagedSheetRows_(sheet, function () { return true; }, function (row) { return String(row.materialId); }, [rowObject]);
  return getActiveMaterial_();
}

function getTeacherGlossaryEntries_(materialId, version) {
  if (!materialId) return [];
  const legacy = getRowsAsObjects_('CARDS')
    .filter(function (row) {
      return isTruthy_(row.active) && isApprovedStatus_(row.status) &&
        String(row.studentMove) === 'ask_definition' &&
        String(row.teacherNote) === '교사 입력 웹앱 사전카드' &&
        String(row.materialId) === String(materialId) &&
        (!version || String(row.version || 'v1') === String(version));
    })
    .map(function (row) {
      const evidence = String(row.evidenceText || '');
      const separator = evidence.indexOf(':');
      return {
        term: separator > 0 ? evidence.slice(0, separator).trim() : String(row.keywords || '').split('|')[0],
        definition: separator > 0 ? evidence.slice(separator + 1).trim() : '',
        group: String(row.glossaryGroup || '')
      };
    })
    .filter(function (item) { return item.term && item.definition; });
  const entries = getApprovedVocabularyEntries_().filter(function (row) {
    return String(row.sourceId) === String(materialId) && (!version || String(row.version || 'v1') === String(version)) &&
      ['교사 직접 입력', '승인된 사전카드 이관'].indexOf(String(row.sourceLocation)) >= 0;
  });
  if (!entries.length) return PropertiesService.getScriptProperties().getProperty('GLOSSARY_STORE_' + materialId) === 'v2' ? [] : legacy;
  return entries.map(function (row) {
    const old = legacy.find(function (item) { return normalizeVocabularyTerm_(item.term) === normalizeVocabularyTerm_(row.term); });
    return { term: row.term, definition: row.easyDefinition, group: row.wordGroup || (old && old.group) || '' };
  });
}

// 같은 관리 항목을 갱신하고, 삭제·중복 항목은 비활성화합니다. 변경 시에만 한 번에 기록합니다.
function syncManagedSheetRows_(sheet, isManaged, keyFor, desired) {
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const body = values.slice(1);
  const objects = body.map(function (row) {
    return headers.reduce(function (obj, name, index) { obj[name] = row[index]; return obj; }, {});
  });
  const targets = Object.create(null);
  objects.forEach(function (row, index) { if (isManaged(row)) targets[keyFor(row)] = index; });
  const wanted = Object.create(null);
  let changed = false;
  desired.forEach(function (row) {
    const key = keyFor(row);
    if (wanted[key]) throw new Error('같은 낱말이 중복되어 있습니다: ' + row.term);
    wanted[key] = true;
    let index = targets[key];
    if (index === undefined) { index = body.length; body.push(headers.map(function () { return ''; })); changed = true; }
    const target = body[index];
    const dirty = Object.keys(row).some(function (field) {
      return field !== 'updatedAt' && field !== 'approvedAt' && headers.indexOf(field) >= 0 && String(target[headers.indexOf(field)] == null ? '' : target[headers.indexOf(field)]) !== String(row[field]);
    });
    if (dirty) {
      Object.keys(row).forEach(function (field) { const column = headers.indexOf(field); if (column >= 0) target[column] = row[field]; });
      changed = true;
    }
    targets[key] = index;
  });
  objects.forEach(function (row, index) {
    if (!isManaged(row) || !isTruthy_(row.active)) return;
    const key = keyFor(row);
    if (!wanted[key] || targets[key] !== index) {
      body[index][headers.indexOf('active')] = false; changed = true;
    }
  });
  if (changed && body.length) sheet.getRange(2, 1, body.length, headers.length).setValues(body);
  return changed;
}

function upsertConfigDefaults_(spreadsheet, defaults) {
  const sheet = spreadsheet.getSheetByName('CONFIG');
  const values = sheet.getDataRange().getDisplayValues();
  const existing = {};
  values.slice(1).forEach(function (row, index) {
    if (row[0]) existing[String(row[0])] = index + 2;
  });
  defaults.forEach(function (item) {
    if (!existing[item[0]]) sheet.appendRow(item);
  });
}

function backfillLegacyCardMetadata_(spreadsheet) {
  const material = getActiveMaterial_();
  const sheet = spreadsheet.getSheetByName('CARDS');
  if (sheet.getLastRow() < 2) return;
  const headers = getHeaderMap_(sheet);
  const values = sheet.getDataRange().getValues();
  const fillValues = {
    materialId: material.materialId,
    title: '교사 검토 대화 카드',
    sourceId: material.materialId,
    sourceLocation: material.sourceLabel || material.title,
    version: material.version,
    status: 'approved',
    reliability: 'A'
  };

  Object.keys(fillValues).forEach(function (field) {
    const column = headers[field];
    if (!column) return;
    for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
      if (!values[rowIndex][column - 1]) {
        sheet.getRange(rowIndex + 1, column).setValue(fillValues[field]);
      }
    }
  });
}

function readConfig_() {
  return getRowsAsObjects_('CONFIG').reduce(function (result, row) {
    if (row.key) result[String(row.key)] = String(row.value);
    return result;
  }, {});
}

function getActiveMaterial_() {
  const rows = getRowsAsObjects_('MATERIALS');
  const row = rows.find(function (item) {
    return isTruthy_(item.active) && isApprovedStatus_(item.status);
  });

  if (!row) {
    throw new Error('승인되어 활성화된 수업 자료가 없습니다. 교사 화면에서 자료를 저장해 주세요.');
  }
  return materialFromRow_(row);
}

function ensureRuntimeSchema_() {
  const schemaVersion = 'review-supplements-v3';
  const properties = PropertiesService.getScriptProperties();
  if (properties.getProperty('RUNTIME_SCHEMA_VERSION') === schemaVersion) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (properties.getProperty('RUNTIME_SCHEMA_VERSION') === schemaVersion) return;
    ensureWorkbookStructure_(getSpreadsheet_());
    properties.setProperty('RUNTIME_SCHEMA_VERSION', schemaVersion);
  } finally {
    lock.releaseLock();
  }
}

function getLessonMaterial_(selector) {
  const normalized = normalizeLessonSelector_(selector);
  if (!normalized.lessonId) return getActiveMaterial_();
  const row = getRowsAsObjects_('MATERIALS').find(function (item) {
    return String(item.materialId || '') === normalized.lessonId &&
      isTruthy_(item.active) && isApprovedStatus_(item.status);
  });
  if (!row) {
    throw new Error('이 수업 링크는 현재 사용할 수 없습니다. 선생님에게 새 링크를 받아 주세요.');
  }
  const material = materialFromRow_(row);
  if ((normalized.version && normalized.version !== material.version) ||
      (normalized.sourceHash && normalized.sourceHash !== material.sourceHash)) {
    throw new Error('수업 자료가 변경되었습니다. 선생님에게 새 링크를 받아 주세요.');
  }
  return material;
}

function normalizeLessonSelector_(selector) {
  const value = typeof selector === 'string' ? { lessonId: selector } : (selector || {});
  const normalized = {
    lessonId: String(value.lessonId || value.lesson || '').trim(),
    version: String(value.version || value.v || '').trim(),
    sourceHash: String(value.sourceHash || value.source || '').trim()
  };
  if (normalized.lessonId.length > 120 || normalized.version.length > 40 ||
      normalized.sourceHash.length > 120 ||
      /[\u0000-\u001F\u007F]/.test(normalized.lessonId + normalized.version + normalized.sourceHash)) {
    throw new Error('수업 링크 형식이 올바르지 않습니다.');
  }
  return normalized;
}

function materialFromRow_(row) {
  const material = {
    materialId: String(row.materialId || ''),
    title: String(row.title || ''),
    grade: String(row.grade || ''),
    gradeCode: String(row.gradeCode || getGradePolicy_(row.grade).targetCode || ''),
    explanationGradeCode: String(
      row.explanationGradeCode || getGradePolicy_(row.grade).explanationCode || ''
    ),
    standard: String(row.standard || ''),
    text: String(row.text || ''),
    startQuestion: String(row.startQuestion || ''),
    version: String(row.version || 'v1'),
    sourceLabel: String(row.sourceLabel || row.title || '교사 제공 자료'),
    sourceUrl: String(row.sourceUrl || ''),
    status: String(row.status || 'approved'),
    activityMode: String(row.activityMode || 'discussion') === 'research'
      ? 'research' : 'discussion'
  };
  material.sourceHash = makeMaterialSourceHash_(material);
  return material;
}

function validateTeacherMaterial_() {
  const activeRows = getRowsAsObjects_('MATERIALS').filter(function (row) {
    return isTruthy_(row.active) && isApprovedStatus_(row.status);
  });
  if (activeRows.length === 0) {
    throw new Error(
      'MATERIALS 시트에서 사용할 자료 한 행의 active를 TRUE, status를 approved로 설정해 주세요.'
    );
  }
  if (activeRows.length > 1) {
    throw new Error(
      '연수용 교사 사본에서는 active=TRUE, status=approved인 자료를 한 개만 남겨 주세요.'
    );
  }

  const row = activeRows[0];
  const requiredFields = [
    ['materialId', '자료 ID'],
    ['title', '주제(title)'],
    ['grade', '학년(grade)'],
    ['standard', '성취기준(standard)'],
    ['text', '지문(text)'],
    ['startQuestion', '시작 질문(startQuestion)']
  ];
  const missing = requiredFields.filter(function (item) {
    return !String(row[item[0]] || '').trim();
  }).map(function (item) {
    return item[1];
  });
  if (missing.length > 0) {
    throw new Error('수업 자료의 필수 항목을 입력해 주세요: ' + missing.join(', '));
  }
  if (String(row.text).trim().length < 30) {
    throw new Error('지문(text)은 검색 근거를 만들 수 있도록 30자 이상 입력해 주세요.');
  }

  return getActiveMaterial_();
}

function getActiveCards_(material) {
  const currentMaterial = material || getActiveMaterial_();
  const currentSourceHash = String(
    currentMaterial.sourceHash || makeMaterialSourceHash_(currentMaterial)
  );
  return getRowsAsObjects_('CARDS')
    .filter(function (row) {
      if (!isTruthy_(row.active) || !isApprovedStatus_(row.status)) return false;
      if (!isGeneratedCardRow_(row)) return true;
      return Boolean(String(row.sourceHash || '')) &&
        String(row.materialId || '') === String(currentMaterial.materialId || '') &&
        String(row.version || 'v1') === String(currentMaterial.version || 'v1') &&
        String(row.sourceHash) === currentSourceHash;
    })
    .map(function (row) {
      return {
        cardId: String(row.cardId || ''), botId: String(row.botId || ''),
        studentMove: String(row.studentMove || ''), condition: String(row.condition || ''),
        primaryMove: String(row.primaryMove || ''), hintLevel: Number(row.hintLevel || 0),
        response: String(row.response || ''), teacherNote: String(row.teacherNote || ''),
        materialId: String(row.materialId || ''),
        title: String(row.title || row.teacherNote || row.cardId || ''),
        questionPatterns: String(row.questionPatterns || ''), keywords: String(row.keywords || ''),
        sourceId: String(row.sourceId || ''), sourceLocation: String(row.sourceLocation || ''),
        evidenceText: String(row.evidenceText || ''), version: String(row.version || 'v1'),
        sourceHash: String(row.sourceHash || ''), generationId: String(row.generationId || ''),
        cardType: String(row.cardType || ''),
        status: String(row.status || 'approved'),
        reliability: String(row.reliability || 'B').toUpperCase()
      };
    });
}

function isGeneratedCardRow_(row) {
  return Boolean(String(row && row.generationId || '').trim()) ||
    /^AI-/i.test(String(row && row.cardId || ''));
}

function getApprovedMaterialChunks_(materialId, version) {
  return getRowsAsObjects_('MATERIAL_CHUNKS')
    .filter(function (row) {
      return isTruthy_(row.active) && isApprovedStatus_(row.status) &&
        String(row.materialId) === String(materialId) &&
        (!version || String(row.version || 'v1') === String(version));
    })
    .map(function (row) {
      return {
        chunkId: String(row.chunkId || ''), materialId: String(row.materialId || ''),
        chunkOrder: Number(row.chunkOrder || 0), content: String(row.content || ''),
        keywords: String(row.keywords || ''),
        sourceLabel: String(row.sourceLabel || '교사 제공 자료'),
        sourceLocation: String(row.sourceLocation || ''), version: String(row.version || 'v1'),
        status: String(row.status || 'approved')
      };
    });
}

function syncMaterialChunks_() {
  const spreadsheet = getSpreadsheet_();
  const materialRows = getRowsAsObjects_('MATERIALS').filter(function (row) {
    return isTruthy_(row.active) && isApprovedStatus_(row.status);
  });
  const chunkSheet = spreadsheet.getSheetByName('MATERIAL_CHUNKS');
  const chunkHeaders = getHeaderMap_(chunkSheet);
  const existingRows = getRowsAsObjects_('MATERIAL_CHUNKS');
  const rowsToAppend = [];

  materialRows.forEach(function (material) {
    const materialId = String(material.materialId || 'MAT');
    const version = String(material.version || 'v1');
    const contentHash = makeContentHash_(String(material.text || ''));
    const sameVersionRows = existingRows.filter(function (row) {
      return String(row.materialId) === materialId &&
        String(row.version || 'v1') === version && isTruthy_(row.active);
    });
    const isCurrent = sameVersionRows.some(function (row) {
      return String(row.contentHash || '') === contentHash;
    });
    if (isCurrent) return;

    sameVersionRows.forEach(function (row) {
      if (row.__rowNumber && chunkHeaders.active) {
        chunkSheet.getRange(row.__rowNumber, chunkHeaders.active).setValue(false);
      }
    });

    splitMaterialText_(String(material.text || ''), 220).forEach(function (content, index) {
      rowsToAppend.push({
        chunkId: makeChunkId_(materialId, version, index + 1),
        materialId: materialId,
        chunkOrder: index + 1,
        content: content,
        keywords: contentWords_(content).slice(0, 12).join('|'),
        sourceLabel: String(material.sourceLabel || material.title || '교사 제공 자료'),
        sourceLocation: '자료 구간 ' + (index + 1),
        version: version,
        status: 'approved',
        active: true,
        contentHash: contentHash,
        updatedAt: new Date()
      });
    });
  });

  if (rowsToAppend.length > 0) appendObjectsToSheet_(chunkSheet, rowsToAppend);
  return rowsToAppend.length;
}

function splitMaterialText_(text, maxLength) {
  const sentences = (String(text || '').replace(/\r/g, '').replace(/\n+/g, ' ')
    .match(/[^.!?。！？]+[.!?。！？]?/g) || [])
    .map(function (sentence) { return sentence.trim(); })
    .filter(Boolean);
  if (sentences.length === 0 && text) sentences.push(String(text));

  const chunks = [];
  let current = '';
  sentences.forEach(function (sentence) {
    if (current && (current + ' ' + sentence).length > maxLength) {
      chunks.push(current);
      current = sentence;
    } else {
      current = current ? current + ' ' + sentence : sentence;
    }
  });
  if (current) chunks.push(current);
  return chunks;
}

function makeChunkId_(materialId, version, order) {
  const safeMaterial = String(materialId).replace(/[^A-Za-z0-9가-힣_-]/g, '-');
  const safeVersion = String(version).replace(/[^A-Za-z0-9가-힣_-]/g, '-');
  return 'CHK-' + safeMaterial + '-' + safeVersion + '-' + String(order).padStart(3, '0');
}

function makeContentHash_(text) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(text || ''),
    Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(digest).slice(0, 16);
}

function makeMaterialSourceHash_(material) {
  const value = material || {};
  return makeContentHash_([
    value.materialId,
    value.version || 'v1',
    value.title,
    value.gradeCode || value.grade,
    value.standard,
    value.text,
    value.startQuestion,
    value.activityMode || 'discussion'
  ].map(function (item) { return String(item || ''); }).join('\n'));
}

function createSession_(session) {
  const lock = LockService.getScriptLock();
  waitForMeasuredLock_(lock, 30000);
  try {
  appendObjectsToSheet_(getSpreadsheet_().getSheetByName('SESSIONS'), [{
    startedAt: new Date(), sessionId: session.sessionId, studentCode: session.studentCode,
    botId: session.botId, materialId: session.materialId, status: 'active',
    policyVersion: session.policyVersion, endedAt: '',
    materialVersion: session.materialVersion || '',
    materialSourceHash: session.materialSourceHash || ''
  }]);
  } finally { flushAndReleaseLock_(lock); }
}

function getActiveSessionContext_(sessionId) {
  const session = getRowsAsObjects_('SESSIONS').slice().reverse().find(function (row) {
    return String(row.sessionId || '') === String(sessionId || '');
  });
  if (!session || String(session.status || '').toLowerCase() !== 'active') {
    throw new Error('활성 대화 세션이 아닙니다. 화면을 새로고침해 주세요.');
  }
  if (!String(session.materialVersion || '') || !String(session.materialSourceHash || '')) {
    throw new Error('이전 형식의 세션입니다. 안전한 자료 확인을 위해 화면을 새로고침해 주세요.');
  }
  return {
    session: session,
    material: getLessonMaterial_({
      lessonId: session.materialId,
      version: session.materialVersion,
      sourceHash: session.materialSourceHash
    })
  };
}

function closeSession_(sessionId) {
  const sheet = getSpreadsheet_().getSheetByName('SESSIONS');
  const headers = getHeaderMap_(sheet);
  const values = sheet.getDataRange().getValues();
  for (let index = values.length - 1; index >= 1; index -= 1) {
    if (String(values[index][headers.sessionId - 1]) === String(sessionId)) {
      sheet.getRange(index + 1, headers.status).setValue('closed');
      sheet.getRange(index + 1, headers.endedAt).setValue(new Date());
      return;
    }
  }
}

function appendTurn_(turn) {
  const lock = LockService.getScriptLock();
  waitForMeasuredLock_(lock, 30000);
  try {
    appendObjectsToSheet_(getSpreadsheet_().getSheetByName('TURNS'), [{
      timestamp: new Date(), sessionId: turn.sessionId, studentCode: turn.studentCode,
      turnNo: turn.turnNo, speaker: turn.speaker, text: turn.text,
      studentMove: turn.studentMove || '', primaryMove: turn.primaryMove || '',
      hintLevel: Number(turn.hintLevel || 0), sourceStatus: turn.sourceStatus || '',
      reasonGiven: turn.reasonGiven ? 1 : 0, passageEcho: turn.passageEcho ? 1 : 0,
      feedbackUptake: turn.feedbackUptake || '',
      interventionFlag: turn.interventionFlag ? 1 : 0,
      policyVersion: turn.policyVersion || '',
      retrievedCardIds: serializeIdList_(turn.retrievedCardIds),
      retrievedChunkIds: serializeIdList_(turn.retrievedChunkIds),
      retrievedVocabularyIds: serializeIdList_(turn.retrievedVocabularyIds),
      retrievedKnowledgeIds: serializeIdList_(turn.retrievedKnowledgeIds),
      citedCardIds: serializeIdList_(turn.citedCardIds),
      validatedCardIds: serializeIdList_(turn.validatedCardIds),
      citedVocabularyIds: serializeIdList_(turn.citedVocabularyIds),
      validatedVocabularyIds: serializeIdList_(turn.validatedVocabularyIds),
      citedKnowledgeIds: serializeIdList_(turn.citedKnowledgeIds),
      validatedKnowledgeIds: serializeIdList_(turn.validatedKnowledgeIds),
      retrievedExternalSourceIds: serializeIdList_(turn.retrievedExternalSourceIds),
      citedExternalSourceIds: serializeIdList_(turn.citedExternalSourceIds),
      validatedExternalSourceIds: serializeIdList_(turn.validatedExternalSourceIds),
      evidenceLabels: serializeIdList_(turn.evidenceLabels),
      retrievalConfidence: turn.retrievalConfidence || '', reviewId: turn.reviewId || '',
      aiEnabled: turn.aiEnabled ? 1 : 0,
      aiAnalysisModel: turn.aiAnalysisModel || '',
      aiResponseModel: turn.aiResponseModel || '',
      aiStatus: turn.aiStatus || '', stateConfidence: turn.stateConfidence || '',
      activeConcept: turn.activeConcept || '', rewrittenQuery: turn.rewrittenQuery || '',
      misconceptionDetected: turn.misconceptionDetected ? 1 : 0,
      aiUsedEvidenceIds: serializeIdList_(turn.aiUsedEvidenceIds)
    }]);
  } finally {
    flushAndReleaseLock_(lock);
  }
}

function appendRetrievalLog_(log) {
  const lock = LockService.getScriptLock();
  waitForMeasuredLock_(lock, 30000);
  try {
    appendObjectsToSheet_(getSpreadsheet_().getSheetByName('RETRIEVAL_LOG'), [{
      timestamp: new Date(), sessionId: log.sessionId, turnNo: log.turnNo,
      materialId: log.materialId, query: log.query,
      queryTokens: serializeIdList_(log.queryTokens),
      retrievedCardIds: serializeIdList_(log.retrievedCardIds),
      retrievedChunkIds: serializeIdList_(log.retrievedChunkIds),
      retrievedVocabularyIds: serializeIdList_(log.retrievedVocabularyIds),
      retrievedKnowledgeIds: serializeIdList_(log.retrievedKnowledgeIds),
      retrievedExternalSourceIds: serializeIdList_(log.retrievedExternalSourceIds),
      topScore: Number(log.topScore || 0), scoreGap: Number(log.scoreGap || 0),
      ambiguityFlag: log.ambiguous ? 1 : 0, confidence: log.confidence || 'none',
      outcome: log.outcome || '', policyVersion: log.policyVersion || '',
      originalQuery: log.originalQuery || log.query || '',
      rewrittenQuery: log.rewrittenQuery || log.query || '',
      strategyConfidence: log.strategyConfidence || '',
      evidenceConfidence: log.evidenceConfidence || log.confidence || 'none',
      stateConfidence: log.stateConfidence || '',
      aiAnalysisModel: log.aiAnalysisModel || '', aiResponseModel: log.aiResponseModel || '',
      aiStatus: log.aiStatus || '', decisionReason: log.decisionReason || ''
    }]);
  } finally {
    flushAndReleaseLock_(lock);
  }
}

function upsertReviewItem_(item) {
  const lock = LockService.getScriptLock();
  waitForMeasuredLock_(lock, 30000);
  try {
    const sheet = getSpreadsheet_().getSheetByName('REVIEW_QUEUE');
    const headers = getHeaderMap_(sheet);
    const values = sheet.getDataRange().getValues();
    for (let index = 1; index < values.length; index += 1) {
      const sameKey = String(values[index][headers.occurrenceKey - 1]) === String(item.occurrenceKey);
      const isOpen = String(values[index][headers.status - 1] || 'open').toLowerCase() === 'open';
      const sameSource = String(values[index][headers.sourceHash - 1] || '') === String(item.sourceHash || '') &&
        String(values[index][headers.version - 1] || '') === String(item.version || '');
      if (sameKey && isOpen && sameSource) {
        sheet.getRange(index + 1, headers.lastSeenAt).setValue(new Date());
        sheet.getRange(index + 1, headers.count)
          .setValue(Number(values[index][headers.count - 1] || 1) + 1);
        sheet.getRange(index + 1, headers.topScore).setValue(Number(item.topScore || 0));
        sheet.getRange(index + 1, headers.candidateCardIds)
          .setValue(serializeIdList_(item.candidateCardIds));
        sheet.getRange(index + 1, headers.candidateChunkIds)
          .setValue(serializeIdList_(item.candidateChunkIds));
        if (headers.candidateVocabularyIds) {
          sheet.getRange(index + 1, headers.candidateVocabularyIds)
            .setValue(serializeIdList_(item.candidateVocabularyIds));
        }
        if (headers.candidateKnowledgeIds) {
          sheet.getRange(index + 1, headers.candidateKnowledgeIds)
            .setValue(serializeIdList_(item.candidateKnowledgeIds));
        }
        if (headers.candidateExternalSourceIds) {
          sheet.getRange(index + 1, headers.candidateExternalSourceIds)
            .setValue(serializeIdList_(item.candidateExternalSourceIds));
        }
        return String(values[index][headers.reviewId - 1]);
      }
    }

    const reviewId = 'REV-' + Utilities.getUuid().toUpperCase();
    appendObjectsToSheet_(sheet, [{
      createdAt: new Date(), lastSeenAt: new Date(), reviewId: reviewId,
      sessionId: item.sessionId, studentCode: item.studentCode, materialId: item.materialId,
      question: item.question, reasonCode: item.reasonCode,
      topScore: Number(item.topScore || 0),
      candidateCardIds: serializeIdList_(item.candidateCardIds),
      candidateChunkIds: serializeIdList_(item.candidateChunkIds),
      candidateVocabularyIds: serializeIdList_(item.candidateVocabularyIds),
      candidateKnowledgeIds: serializeIdList_(item.candidateKnowledgeIds),
      candidateExternalSourceIds: serializeIdList_(item.candidateExternalSourceIds),
      occurrenceKey: item.occurrenceKey, count: 1, status: 'open',
      teacherDecision: '', reviewedAt: '', version: item.version || '', sourceHash: item.sourceHash || '', studentMove: item.studentMove || ''
    }]);
    return reviewId;
  } finally {
    flushAndReleaseLock_(lock);
  }
}

function getSessionTurns_(sessionId) {
  return getRowsAsObjects_('TURNS')
    .filter(function (row) { return String(row.sessionId) === String(sessionId); })
    .map(function (row) {
      return {
        timestamp: row.timestamp, speaker: String(row.speaker || ''), text: String(row.text || ''),
        studentMove: String(row.studentMove || ''), primaryMove: String(row.primaryMove || ''),
        hintLevel: Number(row.hintLevel || 0), interventionFlag: isTruthy_(row.interventionFlag),
        stateConfidence: String(row.stateConfidence || ''),
        activeConcept: String(row.activeConcept || ''),
        rewrittenQuery: String(row.rewrittenQuery || ''),
        misconceptionDetected: isTruthy_(row.misconceptionDetected)
      };
    });
}

function getRowsAsObjects_(sheetName) {
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function (value) { return String(value).trim(); });
  return values.slice(1).map(function (row, index) {
    const result = { __rowNumber: index + 2 };
    headers.forEach(function (header, columnIndex) {
      if (header) result[header] = row[columnIndex];
    });
    return result;
  }).filter(function (row) {
    return headers.some(function (header) { return header && row[header] !== ''; });
  });
}

function appendObjectsToSheet_(sheet, objects) {
  if (!objects || objects.length === 0) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .getDisplayValues()[0]
    .map(function (value) { return String(value).trim(); });
  const rows = objects.map(function (object) {
    return headers.map(function (header) {
      return Object.prototype.hasOwnProperty.call(object, header) ? object[header] : '';
    });
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
}

function getHeaderMap_(sheet) {
  const result = {};
  if (!sheet || sheet.getLastColumn() === 0) return result;
  sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .forEach(function (value, index) {
      const header = String(value).trim();
      if (header) result[header] = index + 1;
    });
  return result;
}

function isTruthy_(value) {
  return value === true || Number(value) === 1 || String(value).toUpperCase() === 'TRUE';
}

function isApprovedStatus_(status) {
  const normalized = String(status || 'approved').toLowerCase();
  return normalized === 'approved' || normalized === 'verified';
}

function serializeIdList_(values) {
  if (!values) return '';
  if (!Array.isArray(values)) return String(values);
  return values.filter(Boolean).join('|');
}
