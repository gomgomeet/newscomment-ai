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
  setConfigValue_('AI_MODEL', OPENAI_TERRA_MODEL_);
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
    model: settings.model,
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
  return { enabled: isTruthy_(config.AI_ENABLED), model: String(config.AI_MODEL || OPENAI_TERRA_MODEL_),
    reasoningEffort: normalizeReasoningEffort_(config.AI_REASONING_EFFORT),
    maxHistoryTurns: Math.max(0, Math.min(10, Number(config.AI_MAX_HISTORY_TURNS || 4))),
    // 기본 켜짐(키가 없으면 TRUE). 글의 주제와 상관있는 질문만 답하고, 상관없으면 부드럽게 넘긴다.
    allowGeneralAnswer: config.ALLOW_GENERAL_ANSWER === undefined || config.ALLOW_GENERAL_ANSWER === '' ? true : isTruthy_(config.ALLOW_GENERAL_ANSWER),
    maxOutputTokens: Math.max(200, Math.min(4000, Number(config.AI_MAX_OUTPUT_TOKENS || 1500))) };
}

function normalizeReasoningEffort_(value) {
  // gpt-5.6-terra는 none·low·medium·high·xhigh만 받는다. 'minimal'은 HTTP 400으로 거부된다(7단계 실측 2026-09-06).
  const allowed = ['none', 'low', 'medium', 'high', 'xhigh'];
  const normalized = String(value || 'low').toLowerCase();
  if (normalized === 'minimal') return 'low';
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

function composeResponseWithAI_(input) {
  const settings = getAISettings_(input.config || {});
  const fallback = {
    responseResult: input.baseResponse,
    status: settings.enabled ? 'missing_key' : 'disabled',
    model: '',
    usedEvidenceIds: []
  };
  if (!settings.enabled || !getOpenAIApiKey_()) return fallback;
  if (input.plan.primaryMove === 'safety_redirect' || input.plan.primaryMove === 'close' || ['greeting', 'small_talk', 'repair'].indexOf(input.analysis.studentMove) >= 0) {
    fallback.status = 'skipped_policy';
    return fallback;
  }

  const evidence = buildAIEvidenceContext_(input.retrieval, input.material, input.analysis);
  const model = settings.model;
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
  const voice = studentVoiceInstructions_(input);
  if ((input.analysis.studentMove === 'ask_fact' ||
      input.analysis.studentMove === 'ask_definition') && evidence.length === 0) {
    if (!settings.allowGeneralAnswer) {
      fallback.status = 'skipped_no_evidence';
      return fallback;
    }
    // 9단계·교사 결정: 글에 없는 질문도 글의 주제와 상관있으면 "글에는 안 나오지만" 한 마디 붙여 짧게 답한다.
    // 상관없으면 답하지 않고 글로 돌아오게 한다. 어느 쪽이든 관련 질문은 검토 큐에 그대로 남는다.
    try {
      return composeGeneralAnswer_(input, settings, model, voice);
    } catch (error) {
      console.warn('일반 답변을 건너뛰고 규칙 응답을 사용합니다: ' + safeAIErrorMessage_(error));
      fallback.status = 'skipped_no_evidence';
      fallback.reason = safeAIErrorMessage_(error);
      return fallback;
    }
  }
  const prompt = [
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
    '최근 대화: ' + stripEvidenceLocations_(buildRecentHistoryText_(input.history, settings.maxHistoryTurns)),
    '사용 가능한 승인 근거:\n' + (evidence.length
      ? evidence.map(function (item) {
          return '[' + item.id + '] ' + stripEvidenceLocations_(item.text);
        }).join('\n')
      : '(없음)'),
    '허용된 근거 ID: ' + JSON.stringify(allowedIds),
    String(input.taskLine || ''),
    '학생 발화: ' + input.message
  ].join('\n\n');

  try {
    const result = callOpenAIJson_({
      model: model,
      reasoningEffort: settings.reasoningEffort,
      maxOutputTokens: settings.maxOutputTokens,
      schemaName: 'grounded_tutor_reply',
      schema: schema,
      instructions: voice.concat([
        moveGuidance_(input.analysis.studentMove),
        '되묻지 마세요. 마지막 질문이 필요하면 [지금 할 일]대로 코드가 붙입니다.',
        '[지금 할 일]에 있는 관리 질문과 피드백 문장은 코드가 붙이므로 reply에 복사하지 마세요.',
        '학생이 자기 생각을 말했으면 평가하거나 고치라고 하지 마세요.',
        '승인 근거 밖의 사실을 더하지 마세요. 사용한 근거 ID만 usedEvidenceIds에 넣으세요.',
        '정책 엔진의 primaryMove와 hintLevel은 바꾸지 마세요.'
      ]).join(' '),
      input: prompt
    });
    const value = result.value;
    let reply = stripEvidenceLocations_(String(value.reply || '')).trim();
    if (['ask_fact', 'ask_definition'].indexOf(input.analysis.studentMove) >= 0) {
      reply = reply.replace(/[^.!?。？]*[?？]/g, '').trim();
    }
    const usedEvidenceIds = Array.isArray(value.usedEvidenceIds)
      ? value.usedEvidenceIds.map(String).filter(Boolean)
      : [];
    const hasUnknownEvidence = usedEvidenceIds.some(function (id) {
      return allowedIds.indexOf(id) < 0;
    });
    const knowledgeNeedsEvidence = input.analysis.studentMove === 'ask_fact' ||
      input.analysis.studentMove === 'ask_definition';
    if (!reply || reply.length > 800 || hasUnknownEvidence) {
      throw new Error('AI 응답의 근거 ID 또는 길이 검증에 실패했습니다.');
    }
    if (knowledgeNeedsEvidence && usedEvidenceIds.length === 0) {
      // 검색은 무언가 찾았지만 모델이 승인 근거로 답할 수 없다고 본 질문 — 글에 없는 질문과 같이 다룬다.
      if (settings.allowGeneralAnswer) return composeGeneralAnswer_(input, settings, model, voice);
      throw new Error('AI 응답이 승인 근거를 쓰지 않았습니다.');
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
    fallback.reason = safeAIErrorMessage_(error);
    return fallback;
  }
}

// 9단계: 학생에게 보이는 말투 — 교사가 자료에 적은 대상 학년을 기준으로 한다.
function studentVoiceInstructions_(input) {
  const config = input.config || {};
  const material = input.material || {};
  const gradeLabel = String(material.grade || '').trim() || '초등학생';
  const appName = String(config.APP_NAME || '질문이').trim();
  return [
    '당신은 "' + appName + '"라는 이름의 학습 친구 챗봇입니다. 대상 학생: ' + gradeLabel + '.',
    '그 학년 학생이 쓰는 쉬운 낱말과 짧은 문장으로, 다정한 해요체 2~3문장으로 말하세요.',
    '"근거", "승인", "자료 구간", 번호, 괄호 안 위치 같은 표현은 쓰지 마세요.',
    '글의 내용은 학생이 글에 대해 물었을 때만 씁니다. 그때도 "글에서는 ~라고 했어요", "지문에서는 ~라고 합니다" 같은 틀 문장을 붙이지 말고 답에 필요한 사실만 자연스럽게 말하세요. 글에 대한 질문이 아니면 글의 내용을 끌어오지 마세요.',
    '같은 말을 되풀이하지 말고, 학생이 궁금해할 만한 점 하나를 덧붙여도 좋습니다.',
    '학생이 글에 없는 것을 물으면 글의 내용과 억지로 잇지 마세요. "글에는 안 나오지만"이라고 솔직히 말하고, 아는 만큼만 짧게 답하거나 선생님께 물어보자고 하세요.'
  ];
}

// 글에 없는 질문 — 글의 주제와 이어지면 "글에는 안 나오지만" 붙여 짧게, 아니면 글로 돌아오게. 실패하면 throw.
function composeGeneralAnswer_(input, settings, model, voice) {
    const generalSchema = {
      type: 'object',
      properties: {
        related: { type: 'boolean' },
        reply: { type: 'string' },
        usedEvidenceIds: { type: 'array', items: { type: 'string' } }
      },
      required: ['related', 'reply', 'usedEvidenceIds'],
      additionalProperties: false
    };
    const passage = String(input.material.text || '').replace(/\s+/g, ' ').slice(0, 900);
    const general = callOpenAIJson_({
      model: model, reasoningEffort: settings.reasoningEffort,
      maxOutputTokens: Math.min(settings.maxOutputTokens, 600),
      schemaName: 'general_tutor_reply', schema: generalSchema,
      instructions: voice.concat([
        '이 질문은 글에 직접 나오지 않는 내용입니다. 먼저 이 질문이 글의 주제나 소재(글에 나온 사물·사람·일)와 이어지는지 판단해 related에 넣으세요.',
        'related가 true면 널리 알려진 사실만으로 2~3문장으로 답하고, 첫 문장을 "글에는 안 나오지만,"으로 시작하세요. 확실하지 않으면 모른다고 하세요.',
        'related가 false면 reply는 빈 문자열로 두세요. usedEvidenceIds는 빈 배열로 두세요.'
      ]).join(' '),
      input: '글 제목: ' + String(input.material.title || '') + '\n\n글 앞부분: ' + passage + '\n\n학생 발화: ' + input.message
    });
    // 분류기의 낱말 겹침·이어 묻기 신호는 여기까지 오게 한 조건일 뿐이다. 글의 주제와 이어지는지는 글을 읽은 모델의 판단을 따른다.
    const related = general.value.related === true;
    let generalReply = stripEvidenceLocations_(String(general.value.reply || '')).trim()
      .replace(/[^.!?。？]*[?？]/g, '').trim();
    if (!related) {
      return {
        responseResult: renderAIUsedEvidence_('그건 이 글과는 조금 다른 이야기라 여기서는 넘어갈게요. 글을 읽고 궁금한 걸 물어봐 줘요.', [], input.retrieval, input.material),
        status: 'general_off_topic', model: general.model || model, usedEvidenceIds: []
      };
    }
    if (!generalReply || generalReply.length > 600) throw new Error('일반 답변 검증 실패');
    if (!/^글에는?\s*(안|없)/.test(generalReply)) generalReply = '글에는 안 나오지만, ' + generalReply;
    return {
      responseResult: renderAIUsedEvidence_(generalReply, [], input.retrieval, input.material),
      status: 'general', model: general.model || model, usedEvidenceIds: []
    };
}

// 발화 종류에 따라 글 내용을 쓸지 정한다 — 글에 대해 물었을 때만 글로 답하고, 나머지는 받아 주기만 한다.
function moveGuidance_(studentMove) {
  switch (String(studentMove || '')) {
    case 'ask_fact':
    case 'ask_definition':
      return '학생이 글에 대해 물었습니다. 승인 근거에 있는 내용으로 답하세요. 글을 인용한다는 말 없이 사실만 말하면 됩니다.';
    case 'attempt_answer':
    case 'give_evidence':
      return '학생이 자기 생각이나 답을 말했습니다. 그 말을 짧게 받아 주기만 하세요. 글의 내용을 다시 설명하거나 덧붙이지 마세요. 틀린 부분이 있어도 지적하지 말고, 다음 질문은 코드가 붙입니다.';
    case 'express_uncertainty':
    case 'hint':
      return '학생이 어렵다고 했습니다. 답을 바로 말하지 말고, 글의 어느 부분을 보면 좋을지 한 가지만 다정하게 알려 주세요.';
    case 'revise':
      return '학생이 생각을 고쳐 말했습니다. 달라진 점을 짧게 받아 주세요. 글의 내용을 덧붙이지 마세요.';
    default:
      return '학생의 말에 짧고 다정하게 반응하세요. 글의 내용은 끌어오지 마세요.';
  }
}

function strategyConfidenceForPlan_(analysis, plan) {
  if (plan.primaryMove === 'safety_redirect' || plan.primaryMove === 'close') return 'high';
  if (String(analysis.stateConfidence || '') === 'low') return 'low';
  if (String(analysis.stateConfidence || '') === 'high') return 'high';
  return 'medium';
}

function buildRecentHistoryText_(history, maxTurns) {
  if (maxTurns <= 0) return '';
  return (history || []).slice(-maxTurns).map(function (turn) {
    const role = turn.speaker === 'student' ? '학생' : '챗봇';
    return role + ': ' + shortenForAI_(turn.text, 500);
  }).join('\n');
}

function buildAIEvidenceContext_(retrieval, material, analysis) {
  const results = [];
  if (analysis && analysis.sourceNumber && material.title) {
    results.push({id: String(material.materialId), text: '교사 제공 자료 제목: ' + material.title, location: '자료 제목'});
  }
  const studentMove = String(analysis && analysis.studentMove || '');
  const isDefinitionQuestion = studentMove === 'ask_definition';
  const isFactQuestion = studentMove === 'ask_fact';
  (retrieval.vocabulary || []).forEach(function (entry) {
    if (!entry.easyDefinition) return;
    results.push({
      id: String(entry.vocabularyId),
      text: shortenForAI_(entry.term + ': ' + entry.easyDefinition +
        (entry.exampleText ? '\n지문 속 쓰임: ' + entry.exampleText : ''), 600),
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
    // 모델이 추론 강도 값을 거부하면 한 번만 low로 다시 보낸다 — 설정 실수 하나로 AI 전체가 꺼지지 않게.
    if (statusCode === 400 && /Unsupported value/i.test(message) && /reasoning|effort/i.test(message) &&
        request.reasoningEffort !== 'low' && !request.retriedEffort) {
      return callOpenAIJson_(Object.assign({}, request, { reasoningEffort: 'low', retriedEffort: true }));
    }
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

function stripEvidenceLocations_(text) { return String(text || '').replace(/자료\s*구간\s*\d+|구간\s*\d+|괄호\s*안/g, '').trim(); }
