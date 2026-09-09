/**
 * 중앙 정책 엔진 → 교사 개인 OpenAI API의 순서로 한 번씩 호출합니다.
 * 배포 패키지를 만들 때 LITE_CENTRAL_ENGINE_URL_에 운영 주소를 넣습니다.
 */

const LITE_CENTRAL_ENGINE_URL_ = '';
const LITE_OPENAI_RESPONSES_URL_ = 'https://api.openai.com/v1/responses';

function getLiteEngineEndpoint_() {
  return PropertiesService.getScriptProperties().getProperty(LITE_ENGINE_ENDPOINT_PROPERTY_) ||
    LITE_CENTRAL_ENGINE_URL_;
}

function hasLiteEngineEndpoint_() {
  return /^https:\/\//i.test(getLiteEngineEndpoint_());
}

/** 운영자가 배포 사본을 만들 때만 실행합니다. 교사 연수 화면에는 노출하지 않습니다. */
function setLiteCentralEngineEndpointForOwner_(url) {
  requireLiteTeacherContext_();
  const endpoint = liteText_(url, 1000);
  if (!/^https:\/\//i.test(endpoint)) {
    throw new Error('중앙 엔진 주소는 https://로 시작해야 합니다.');
  }
  PropertiesService.getScriptProperties().setProperty(LITE_ENGINE_ENDPOINT_PROPERTY_, endpoint);
  return { ok: true, endpoint: endpoint };
}

function checkLiteEngineConnection_() {
  const endpoint = getLiteEngineEndpoint_();
  if (!endpoint) throw new Error('아직 중앙 정책 엔진 주소가 배포본에 연결되지 않았습니다.');
  const response = UrlFetchApp.fetch(endpoint, { method: 'get', muteHttpExceptions: true });
  const status = response.getResponseCode();
  if (status !== 200) throw new Error('중앙 정책 엔진 연결에 실패했습니다. HTTP ' + status);
  let body;
  try { body = JSON.parse(response.getContentText()); }
  catch (error) { throw new Error('중앙 정책 엔진의 응답 형식을 확인해 주세요.'); }
  if (!body || body.ok !== true || Number(body.schemaVersion) !== 1) {
    throw new Error('중앙 정책 엔진의 버전이 경량앱과 맞지 않습니다.');
  }
  return { ok: true, policyVersion: String(body.policyVersion || '') };
}

function requestLiteEnginePlan_(turn, settings, history) {
  const endpoint = getLiteEngineEndpoint_();
  if (!endpoint) throw new Error('중앙 정책 엔진이 아직 연결되지 않았습니다.');
  const payload = {
    schemaVersion: 1,
    requestId: turn.requestId,
    sessionKey: turn.sessionId,
    activityMode: turn.activityMode,
    studentMessage: turn.message,
    history: (history || []).map(function (item) {
      return { speaker: item.speaker, text: item.text };
    }),
    lesson: {
      lessonId: settings.lessonId,
      subject: settings.subject,
      grade: settings.grade,
      lessonTitle: settings.lessonTitle,
      lessonGoal: settings.lessonGoal,
      achievementStandard: settings.achievementStandard,
      assessmentCriteria: settings.assessmentCriteria,
      rubricHigh: settings.rubricHigh,
      rubricMeet: settings.rubricMeet,
      rubricDeveloping: settings.rubricDeveloping,
      evidenceDescription: settings.evidenceDescription,
      materialTitle: settings.materialTitle,
      materialText: settings.materialText,
      startQuestion: settings.startQuestion,
      version: settings.version
    }
  };
  // 개인 API 키·Google Sheet ID·교사 이메일은 payload에 포함하지 않는다.
  const response = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  let body;
  try { body = JSON.parse(response.getContentText()); }
  catch (error) { throw new Error('중앙 정책 엔진의 응답을 읽지 못했습니다. 잠시 뒤 다시 시도해 주세요.'); }
  if (status < 200 || status >= 300) {
    throw new Error(liteText_(body && body.error, 240) || '중앙 정책 엔진이 요청을 처리하지 못했습니다.');
  }
  validateLiteEnginePlan_(body, turn.requestId);
  return body;
}

function validateLiteEnginePlan_(plan, requestId) {
  if (!plan || Number(plan.schemaVersion) !== 1 || String(plan.requestId) !== String(requestId)) {
    throw new Error('중앙 정책 엔진 응답의 요청 정보가 맞지 않습니다.');
  }
  if (!plan.fallbackReply || !plan.modelRequest || !plan.enforcement || !plan.observation) {
    throw new Error('중앙 정책 엔진 응답에 필요한 항목이 없습니다.');
  }
  if (!['gpt-5.6-terra'].includes(String(plan.modelRequest.model))) {
    throw new Error('배포본에서 허용하지 않은 모델이 지정되었습니다.');
  }
  if (!['low'].includes(String(plan.modelRequest.reasoningEffort))) {
    throw new Error('배포본에서 허용하지 않은 추론 설정이 지정되었습니다.');
  }
  return plan;
}

function callLiteOpenAI_(plan) {
  const key = PropertiesService.getScriptProperties().getProperty(LITE_API_KEY_PROPERTY_);
  if (!key) throw new Error('교사 개인 API 키가 없습니다. 교사 설정에서 연결해 주세요.');
  const request = plan.modelRequest;
  const response = UrlFetchApp.fetch(LITE_OPENAI_RESPONSES_URL_, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + key },
    payload: JSON.stringify({
      model: request.model,
      instructions: request.instructions,
      input: request.input,
      reasoning: { effort: request.reasoningEffort || 'low' },
      max_output_tokens: Math.max(200, Math.min(1000, Number(request.maxOutputTokens || 700))),
      store: false,
      text: {
        verbosity: 'low',
        format: {
          type: 'json_schema', name: 'student_reply', strict: true,
          schema: {
            type: 'object',
            properties: { reply: { type: 'string' } },
            required: ['reply'], additionalProperties: false
          }
        }
      }
    }),
    muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  let data;
  try { data = JSON.parse(response.getContentText()); }
  catch (error) { throw new Error('개인 API 응답을 읽지 못했습니다.'); }
  if (status < 200 || status >= 300) {
    const message = data && data.error && data.error.message ? liteText_(data.error.message, 240) : '요청이 실패했습니다.';
    throw new Error('개인 API 오류 HTTP ' + status + ': ' + message);
  }
  const output = extractLiteOpenAIText_(data);
  if (!output) throw new Error('개인 API 응답에 답변이 없습니다.');
  let value;
  try { value = JSON.parse(output); }
  catch (error) { throw new Error('개인 API의 답변 형식을 확인하지 못했습니다.'); }
  return {
    text: liteText_(value && value.reply, 3000),
    model: liteText_(data.model || request.model, 80),
    responseId: liteText_(data.id, 100),
    usage: data.usage || {}
  };
}

function extractLiteOpenAIText_(data) {
  if (data && data.output_text) return String(data.output_text);
  const texts = [];
  ((data && data.output) || []).forEach(function (item) {
    (item.content || []).forEach(function (part) {
      if (part.type === 'output_text' && part.text) texts.push(String(part.text));
    });
  });
  return texts.join('\n').trim();
}

function enforceLiteReply_(candidate, plan) {
  const fallback = liteText_(plan && plan.fallbackReply, 3000);
  const enforcement = plan && plan.enforcement || {};
  const managedQuestion = liteText_(enforcement.managedQuestion, 500);
  const stripQuestions = function (value) {
    return liteText_(value, 3000).replace(/[^.!?？]*[?？]/g, ' ').replace(/\s+/g, ' ').trim();
  };
  let base = stripQuestions(candidate);
  if (!base) base = stripQuestions(fallback);
  if (managedQuestion) return [base, managedQuestion].filter(Boolean).join(' ').trim();
  return base || fallback.replace(/[?？]/g, '.').trim();
}

function findLiteDuplicateRequest_(requestId) {
  const sheet = getLiteSpreadsheet_().getSheetByName('질문과 답변');
  if (!sheet) return null;
  const rows = liteRowsAsObjects_(sheet).filter(function (row) {
    return String(row.requestId) === String(requestId);
  });
  if (!rows.length) return null;
  const bot = rows.find(function (row) { return String(row.speaker) === 'bot'; });
  return bot ? { text: String(bot.text || ''), sessionId: String(bot.sessionId || '') } : null;
}

function submitLiteTurn(payload) {
  const settings = readLiteTeacherSettings_();
  const turn = prepareLiteStudentTurn_(payload, settings);
  const duplicate = findLiteDuplicateRequest_(turn.requestId);
  if (duplicate) {
    return { ok: true, duplicate: true, sessionId: duplicate.sessionId, reply: duplicate.text };
  }
  if (!hasLiteEngineEndpoint_()) throw new Error('중앙 정책 엔진 연결을 준비하고 있습니다. 잠시 뒤 다시 시도해 주세요.');
  if (!hasLiteApiKey_()) throw new Error('교사가 개인 API 연결을 완료하지 않았습니다.');

  const history = getLiteSessionHistory_(turn.sessionId);
  let plan;
  try {
    plan = requestLiteEnginePlan_(turn, settings, history);
  } catch (error) {
    // 엔진 실패 시 모델을 독자 호출하지 않는다. 정책 없는 임의 답변 생성을 막는다.
    throw new Error('중앙 평가 규칙을 불러오지 못했습니다. ' + liteText_(error && error.message, 240));
  }
  let modelResult = null;
  let reply = plan.fallbackReply;
  if (!plan.skipModel) {
    modelResult = callLiteOpenAI_(plan);
    reply = modelResult.text;
  }
  reply = enforceLiteReply_(reply, plan);
  const observation = plan.observation || {};
  const saved = appendLiteTurnPair_(turn, {
    text: reply,
    phase: observation.conversationPhase || 1,
    managedKind: observation.primaryMove || '',
    evidenceIds: [],
    engineStatus: 'ok:' + liteText_(plan.policyVersion, 80),
    aiStatus: plan.skipModel ? 'skipped_by_policy' : 'ok:' + liteText_(modelResult && modelResult.model, 80)
  });
  if (!saved.duplicate && !turn.isPreview) {
    upsertLiteEvaluationDraft_(settings, turn, observation);
  }
  return {
    ok: true,
    duplicate: saved.duplicate,
    sessionId: turn.sessionId,
    reply: saved.assistantText || reply,
    expectsStudentReply: Boolean(plan.enforcement && plan.enforcement.managedQuestion),
    isClosing: Boolean(observation.isClosing),
    preview: turn.isPreview,
    observation: {
      phase: observation.conversationPhase || 1,
      primaryMove: observation.primaryMove || '',
      sourceStatus: observation.sourceStatus || ''
    }
  };
}
