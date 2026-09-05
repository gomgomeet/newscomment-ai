/**
 * OpenAI Responses API 연결부입니다.
 * AI는 분류·질의 재구성·문장 표현만 돕고, 안전 규칙·전략 정책·근거 승인은 바꾸지 않습니다.
 */

const OPENAI_API_URL_ = 'https://api.openai.com/v1/responses';
const OPENAI_API_KEY_PROPERTY_ = 'OPENAI_API_KEY';
const OPENAI_TERRA_MODEL_ = 'gpt-5.6-terra';

function setOpenAIApiKey() {
  requireTeacherMenuContext_();
  const ui = SpreadsheetApp.getUi();
  const result = ui.prompt(
    'OpenAI API 키 설정',
    'API 키는 시트가 아니라 Script Properties에 저장됩니다. 키를 입력해 주세요.',
    ui.ButtonSet.OK_CANCEL
  );
  if (result.getSelectedButton() !== ui.Button.OK) return;
  const key = String(result.getResponseText() || '').trim();
  if (!/^sk-/.test(key)) {
    ui.alert('API 키 형식을 확인해 주세요.');
    return;
  }
  PropertiesService.getScriptProperties().setProperty(OPENAI_API_KEY_PROPERTY_, key);
  setConfigValue_('AI_ENABLED', 'TRUE');
  setConfigValue_('AI_ROUTING_MODE', 'terra_only');
  setConfigValue_('AI_MODEL_QUALITY', OPENAI_TERRA_MODEL_);
  setConfigValue_('AI_REASONING_EFFORT', 'low');
  ui.alert(
    'API 키를 안전하게 저장하고 Terra(gpt-5.6-terra)를 적용했습니다. ' +
    '이제 질문 챗봇 메뉴의 2번 AI 연결 테스트를 실행해 주세요.'
  );
}

function clearOpenAIApiKey() {
  requireTeacherMenuContext_();
  PropertiesService.getScriptProperties().deleteProperty(OPENAI_API_KEY_PROPERTY_);
  setConfigValue_('AI_ENABLED', 'FALSE');
  SpreadsheetApp.getUi().alert('저장된 API 키를 삭제하고 AI 사용을 껐습니다.');
}

function testOpenAIConnection() {
  requireTeacherMenuContext_();
  const config = readConfig_();
  const settings = getAISettings_(config);
  if (!getOpenAIApiKey_()) {
    throw new Error('먼저 시트 메뉴에서 OpenAI API 키를 설정해 주세요.');
  }
  const result = callOpenAIJson_({
    model: settings.qualityModel,
    reasoningEffort: settings.reasoningEffort,
    maxOutputTokens: 80,
    schemaName: 'connection_test',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['ok'] }
      },
      required: ['status'],
      additionalProperties: false
    },
    instructions: '연결 상태를 확인하는 테스트입니다. 지정된 JSON만 반환하세요.',
    input: 'status를 ok로 반환하세요.'
  });
  SpreadsheetApp.getActiveSpreadsheet().toast(
    result.value.status === 'ok'
      ? 'AI 연결 성공: ' + result.model
      : '예상하지 못한 응답입니다.',
    '질문 챗봇',
    7
  );
  return result;
}

function getOpenAIApiKey_() {
  return PropertiesService.getScriptProperties().getProperty(OPENAI_API_KEY_PROPERTY_) || '';
}

function getAISettings_(config) {
  const mode = String(config.AI_ROUTING_MODE || 'terra_only').toLowerCase();
  return {
    enabled: isTruthy_(config.AI_ENABLED),
    routingMode: mode === 'hybrid' ? 'hybrid' : 'terra_only',
    fastModel: String(config.AI_MODEL_FAST || 'gpt-5.6-luna'),
    qualityModel: String(config.AI_MODEL_QUALITY || OPENAI_TERRA_MODEL_),
    reasoningEffort: normalizeReasoningEffort_(config.AI_REASONING_EFFORT),
    maxHistoryTurns: Math.max(0, Math.min(10, Number(config.AI_MAX_HISTORY_TURNS || 6))),
    maxOutputTokens: Math.max(200, Math.min(1200, Number(config.AI_MAX_OUTPUT_TOKENS || 500)))
  };
}

function normalizeReasoningEffort_(value) {
  const allowed = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];
  const normalized = String(value || 'low').toLowerCase();
  return allowed.indexOf(normalized) >= 0 ? normalized : 'low';
}

function setConfigValue_(key, value, preparedSpreadsheet) {
  const updates = {}; updates[key] = value;
  setConfigValues_(updates, preparedSpreadsheet);
}

function setConfigValues_(updates, preparedSpreadsheet) {
  const spreadsheet = preparedSpreadsheet || getSpreadsheet_();
  if (!preparedSpreadsheet) ensureWorkbookStructure_(spreadsheet);
  const sheet = spreadsheet.getSheetByName('CONFIG');
  const headers = getHeaderMap_(sheet);
  const rows = sheet.getDataRange().getValues();
  let changed = false;
  Object.keys(updates).forEach(function (key) {
    let row = rows.slice(1).find(function (item) { return String(item[headers.key - 1]) === key; });
    if (!row) { row = rows[0].map(function () { return ''; }); row[headers.key - 1] = key; rows.push(row); changed = true; }
    if (String(row[headers.value - 1]) !== String(updates[key])) { row[headers.value - 1] = updates[key]; changed = true; }
  });
  if (changed) sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
}

function enrichStudentAnalysisWithAI_(input) {
  const settings = getAISettings_(input.config || {});
  const fallback = {
    analysis: input.ruleAnalysis,
    status: settings.enabled ? 'missing_key' : 'disabled',
    model: '',
    originalQuery: input.message,
    rewrittenQuery: input.message,
    analysisNote: ''
  };
  if (!settings.enabled || !getOpenAIApiKey_()) return fallback;
  if (input.ruleAnalysis.studentMove === 'close') {
    fallback.status = 'skipped_close';
    return fallback;
  }

  const model = selectAIModel_('analysis', settings, input.ruleAnalysis, null, input.history);
  const historyText = buildRecentHistoryText_(input.history, settings.maxHistoryTurns);
  const materialText = shortenForAI_(input.material.text, 3500);
  const schema = {
    type: 'object',
    properties: {
      studentMove: {
        type: 'string',
        enum: [
          'attempt_answer', 'request_hint', 'express_uncertainty', 'ask_definition',
          'revise', 'ask_fact', 'give_evidence', 'close'
        ]
      },
      knowledgeState: {
        type: 'string',
        enum: ['unobserved', 'partial', 'demonstrated', 'misconception']
      },
      stateConfidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      activeConcept: { type: 'string' },
      rewrittenQuery: { type: 'string' },
      misconceptionDetected: { type: 'boolean' },
      reasonGiven: { type: 'boolean' },
      analysisNote: { type: 'string' }
    },
    required: [
      'studentMove', 'knowledgeState', 'stateConfidence', 'activeConcept',
      'rewrittenQuery', 'misconceptionDetected', 'reasonGiven', 'analysisNote'
    ],
    additionalProperties: false
  };
  const prompt = [
    '교사 제공 자료 제목: ' + input.material.title,
    '교사 제공 자료 본문: ' + materialText,
    '시작 질문: ' + input.material.startQuestion,
    '최근 대화:\n' + (historyText || '(첫 발화)'),
    '현재 학생 발화: ' + input.message,
    '규칙 기반 1차 분석: ' + JSON.stringify(input.ruleAnalysis),
    '버튼 동작: ' + String(input.action || 'message')
  ].join('\n\n');

  try {
    const result = callOpenAIJson_({
      model: model,
      reasoningEffort: settings.reasoningEffort,
      maxOutputTokens: settings.maxOutputTokens,
      schemaName: 'student_turn_analysis',
      schema: schema,
      instructions: [
        '한국어 교육용 질문 챗봇의 발화 분석기입니다.',
        '최종 답변이나 새로운 사실을 만들지 말고 분류와 검색 질의 재구성만 하세요.',
        'rewrittenQuery는 현재 발화가 독립적이면 그대로 유지하고, 대명사나 생략이 있으면 최근 대화의 개념을 보충하세요.',
        '교사 제공 자료 밖의 지식은 사용하지 마세요.',
        '버튼 동작이 hint이면 도움 요청으로, close이면 종료로 우선 해석하세요.'
      ].join(' '),
      input: prompt
    });
    const value = result.value;
    const analysis = Object.assign({}, input.ruleAnalysis, {
      studentMove: input.action === 'hint' ? 'request_hint' : value.studentMove,
      knowledgeState: value.knowledgeState,
      stateConfidence: value.stateConfidence,
      activeConcept: String(value.activeConcept || ''),
      rewrittenQuery: String(value.rewrittenQuery || input.message).trim() || input.message,
      misconceptionDetected: Boolean(value.misconceptionDetected),
      reasonGiven: Boolean(value.reasonGiven),
      aiAnalysisNote: String(value.analysisNote || '')
    });
    return {
      analysis: analysis,
      status: 'ok',
      model: result.model || model,
      originalQuery: input.message,
      rewrittenQuery: analysis.rewrittenQuery,
      analysisNote: analysis.aiAnalysisNote
    };
  } catch (error) {
    console.warn('AI 분석을 건너뛰고 규칙 분석을 사용합니다: ' + safeAIErrorMessage_(error));
    fallback.status = 'analysis_fallback';
    fallback.model = model;
    return fallback;
  }
}

function composeResponseWithAI_(input) {
  const settings = getAISettings_(input.config || {});
  const fallback = {
    responseResult: input.baseResponse,
    status: settings.enabled ? 'missing_key' : 'disabled',
    model: '',
    usedEvidenceIds: []
  };
  if (!settings.enabled || !getOpenAIApiKey_()) return fallback;
  if (input.plan.primaryMove === 'safety_redirect' || input.plan.primaryMove === 'close') {
    fallback.status = 'skipped_policy';
    return fallback;
  }

  const evidence = buildAIEvidenceContext_(input.retrieval, input.material, input.analysis);
  if ((input.analysis.studentMove === 'ask_fact' ||
      input.analysis.studentMove === 'ask_definition') && evidence.length === 0) {
    fallback.status = 'skipped_no_evidence';
    return fallback;
  }
  const model = selectAIModel_(
    'compose', settings, input.analysis, input.retrieval, input.history
  );
  const allowedIds = evidence.map(function (item) { return item.id; });
  const schema = {
    type: 'object',
    properties: {
      reply: { type: 'string' },
      usedEvidenceIds: { type: 'array', items: { type: 'string' } }
    },
    required: ['reply', 'usedEvidenceIds'],
    additionalProperties: false
  };
  const prompt = [
    '학생 발화: ' + input.message,
    '학생 상태: ' + JSON.stringify({
      studentMove: input.analysis.studentMove,
      knowledgeState: input.analysis.knowledgeState,
      stateConfidence: input.analysis.stateConfidence || 'medium',
      activeConcept: input.analysis.activeConcept || '',
      misconceptionDetected: Boolean(input.analysis.misconceptionDetected)
    }),
    '정책 엔진이 선택한 전략: ' + JSON.stringify({
      primaryMove: input.plan.primaryMove,
      hintLevel: input.plan.hintLevel,
      reasonCode: input.plan.reasonCode
    }),
    '규칙형 기본 응답: ' + input.baseResponse.text,
    '사용 가능한 승인 근거:\n' + (evidence.length
      ? evidence.map(function (item) {
          return '[' + item.id + '] ' + item.text + ' (' + item.location + ')';
        }).join('\n')
      : '(없음)'),
    '허용된 근거 ID: ' + JSON.stringify(allowedIds)
  ].join('\n\n');

  try {
    const result = callOpenAIJson_({
      model: model,
      reasoningEffort: settings.reasoningEffort,
      maxOutputTokens: settings.maxOutputTokens,
      schemaName: 'grounded_tutor_reply',
      schema: schema,
      instructions: [
        '한국어 교육용 질문 챗봇의 응답 편집기입니다.',
        '정책 엔진이 선택한 primaryMove와 hintLevel을 절대 바꾸지 마세요.',
        '학생의 시도를 짧게 관찰하고, 필요하면 승인 근거에 기반한 단서를 준 뒤, 학생이 다음에 할 행동 한 가지만 분명히 제시하세요.',
        '승인 근거 밖의 사실을 추가하지 마세요. 사용한 근거 ID만 usedEvidenceIds에 넣으세요.',
        '정답을 바로 공개하지 말고 초등·중등 학생이 이해할 수 있는 2~4문장으로 작성하세요.'
      ].join(' '),
      input: prompt
    });
    const value = result.value;
    const reply = String(value.reply || '').trim();
    const usedEvidenceIds = Array.isArray(value.usedEvidenceIds)
      ? value.usedEvidenceIds.map(String).filter(Boolean)
      : [];
    const hasUnknownEvidence = usedEvidenceIds.some(function (id) {
      return allowedIds.indexOf(id) < 0;
    });
    const knowledgeNeedsEvidence = input.analysis.studentMove === 'ask_fact' ||
      input.analysis.studentMove === 'ask_definition';
    if (!reply || reply.length > 800 || hasUnknownEvidence ||
        (knowledgeNeedsEvidence && usedEvidenceIds.length === 0)) {
      throw new Error('AI 응답의 근거 ID 또는 길이 검증에 실패했습니다.');
    }
    return {
      responseResult: renderAIUsedEvidence_(reply, usedEvidenceIds, input.retrieval, input.material),
      status: 'ok',
      model: result.model || model,
      usedEvidenceIds: usedEvidenceIds
    };
  } catch (error) {
    console.warn('AI 문장 조립을 건너뛰고 규칙 응답을 사용합니다: ' + safeAIErrorMessage_(error));
    fallback.status = 'compose_fallback';
    fallback.model = model;
    return fallback;
  }
}

function selectAIModel_(phase, settings, analysis, retrieval, history) {
  if (settings.routingMode === 'terra_only') return settings.qualityModel;
  if (phase === 'analysis') return settings.fastModel;
  const confidence = String(analysis.stateConfidence || 'medium');
  const evidenceConfidence = retrieval ? String(retrieval.confidence || 'none') : 'none';
  const recentHints = countRecentHintTurns_(history);
  const needsTerra = confidence === 'low' ||
    Boolean(analysis.misconceptionDetected) ||
    recentHints >= 2 ||
    evidenceConfidence === 'low' ||
    (analysis.studentMove === 'ask_fact' && evidenceConfidence === 'none');
  return needsTerra ? settings.qualityModel : settings.fastModel;
}

function strategyConfidenceForPlan_(analysis, plan) {
  if (plan.primaryMove === 'safety_redirect' || plan.primaryMove === 'close') return 'high';
  if (String(analysis.stateConfidence || '') === 'low') return 'low';
  if (String(analysis.stateConfidence || '') === 'high') return 'high';
  return 'medium';
}

function countRecentHintTurns_(history) {
  return (history || []).slice(-8).filter(function (turn) {
    return turn.speaker === 'bot' && Number(turn.hintLevel || 0) > 0;
  }).length;
}

function buildRecentHistoryText_(history, maxTurns) {
  return (history || []).slice(-maxTurns).map(function (turn) {
    const role = turn.speaker === 'student' ? '학생' : '챗봇';
    return role + ': ' + shortenForAI_(turn.text, 500);
  }).join('\n');
}

function buildAIEvidenceContext_(retrieval, material, analysis) {
  const results = [];
  const studentMove = String(analysis && analysis.studentMove || '');
  const isDefinitionQuestion = studentMove === 'ask_definition';
  const isFactQuestion = studentMove === 'ask_fact';
  (retrieval.vocabulary || []).forEach(function (entry) {
    if (!entry.easyDefinition) return;
    results.push({
      id: String(entry.vocabularyId),
      text: shortenForAI_(entry.term + ': ' + entry.easyDefinition, 600),
      location: String(entry.sourceLocation || entry.sourceLabel || material.sourceLabel || '')
    });
  });
  (retrieval.knowledge || []).forEach(function (item) {
    if (isDefinitionQuestion && item.knowledgeType !== 'vocabulary') return;
    const text = [item.content, item.easyExplanation, '원문: ' + item.evidenceQuote]
      .filter(Boolean).join('\n');
    if (!text) return;
    results.push({
      id: String(item.knowledgeId),
      text: shortenForAI_(text, 800),
      location: String(item.sourceLocation || material.sourceLabel || '')
    });
  });
  if (!isDefinitionQuestion && !isFactQuestion) {
    (retrieval.cards || []).forEach(function (card) {
      if (!card.evidenceText) return;
      results.push({
        id: String(card.cardId),
        text: shortenForAI_(card.evidenceText, 600),
        location: String(card.sourceLocation || material.sourceLabel || '')
      });
    });
  }
  if (!isDefinitionQuestion) {
    (retrieval.chunks || []).forEach(function (chunk) {
      if (results.some(function (item) { return item.id === String(chunk.chunkId); })) return;
      results.push({
        id: String(chunk.chunkId),
        text: shortenForAI_(chunk.content, 800),
        location: String(chunk.sourceLocation || chunk.sourceLabel || material.sourceLabel || '')
      });
    });
  }
  return results.slice(0, 4);
}

function callOpenAIJson_(request) {
  const apiKey = getOpenAIApiKey_();
  if (!apiKey) throw new Error('OpenAI API 키가 없습니다.');
  const payload = {
    model: request.model,
    instructions: request.instructions,
    input: request.input,
    reasoning: { effort: request.reasoningEffort || 'low' },
    max_output_tokens: Number(request.maxOutputTokens || 500),
    store: false,
    text: {
      verbosity: request.verbosity || 'low',
      format: {
        type: 'json_schema',
        name: request.schemaName,
        strict: true,
        schema: request.schema
      }
    }
  };
  if (request.promptCacheKey) payload.prompt_cache_key = String(request.promptCacheKey).slice(0, 64);
  const response = UrlFetchApp.fetch(OPENAI_API_URL_, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const statusCode = response.getResponseCode();
  const body = response.getContentText();
  let data;
  try {
    data = JSON.parse(body);
  } catch (error) {
    throw new Error('OpenAI API가 JSON이 아닌 응답을 반환했습니다. HTTP ' + statusCode);
  }
  if (statusCode < 200 || statusCode >= 300) {
    const message = data && data.error && data.error.message
      ? String(data.error.message).slice(0, 240)
      : '요청이 실패했습니다.';
    throw new Error('OpenAI API 오류 HTTP ' + statusCode + ': ' + message);
  }
  if (data.status === 'incomplete') {
    const reason = String(data.incomplete_details && data.incomplete_details.reason || 'unknown');
    throw new Error(reason === 'max_output_tokens' || reason === 'max_tokens'
      ? 'AI 응답이 출력 길이 제한으로 중단되었습니다. 지식 항목 수를 줄이거나 출력 상한을 늘려 주세요.'
      : 'AI 응답이 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.');
  }
  const outputText = extractOpenAIOutputText_(data);
  if (!outputText) throw new Error('OpenAI API 응답에 출력 텍스트가 없습니다.');
  let value;
  try {
    value = JSON.parse(outputText);
  } catch (error) {
    throw new Error('구조화 출력의 JSON 해석에 실패했습니다.');
  }
  const usage = data.usage || {};
  return {
    value: value,
    model: String(data.model || request.model),
    responseId: String(data.id || ''),
    usage: {
      inputTokens: Number(usage.input_tokens || 0),
      outputTokens: Number(usage.output_tokens || 0)
    }
  };
}

function extractOpenAIOutputText_(data) {
  if (data.output_text) return String(data.output_text);
  const texts = [];
  (data.output || []).forEach(function (item) {
    (item.content || []).forEach(function (part) {
      if (part.type === 'output_text' && part.text) texts.push(String(part.text));
    });
  });
  return texts.join('\n').trim();
}

function shortenForAI_(text, maxLength) {
  const value = String(text || '').trim();
  return value.length > maxLength ? value.slice(0, maxLength - 1) + '…' : value;
}

function safeAIErrorMessage_(error) {
  return String(error && error.message ? error.message : error).slice(0, 300);
}
