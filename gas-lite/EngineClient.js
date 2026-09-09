/**
 * 중앙 정책 엔진 → 교사 개인 OpenAI API의 순서로 한 번씩 호출합니다.
 * 배포 패키지를 만들 때 LITE_CENTRAL_ENGINE_URL_에 운영 주소를 넣습니다.
 */

const LITE_CENTRAL_ENGINE_URL_ = '';
const LITE_OPENAI_RESPONSES_URL_ = 'https://api.openai.com/v1/responses';
const LITE_MODEL_CALLS_PER_MINUTE_ = 60;
const LITE_MODEL_CALLS_PER_DAY_ = 300;
const LITE_MODEL_MINUTE_BUDGET_PROPERTY_ = 'LITE_MODEL_MINUTE_BUDGET';
const LITE_MODEL_DAILY_BUDGET_PROPERTY_ = 'LITE_MODEL_DAILY_BUDGET';
const LITE_REQUEST_CLAIM_TTL_MS_ = 120000;

function liteRequestClaimKey_(requestId) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(requestId),
    Utilities.Charset.UTF_8
  );
  return 'LITE_INFLIGHT_' + Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '').slice(0, 32);
}

function claimLiteInFlightRequest_(requestId) {
  const key = liteRequestClaimKey_(requestId);
  const properties = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const now = Date.now();
    const claimedAt = Number(properties.getProperty(key) || 0);
    if (claimedAt && now - claimedAt < LITE_REQUEST_CLAIM_TTL_MS_) return false;
    properties.setProperty(key, String(now));
    return true;
  } finally {
    lock.releaseLock();
  }
}

function releaseLiteInFlightRequest_(requestId) {
  const properties = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    properties.deleteProperty(liteRequestClaimKey_(requestId));
  } finally {
    lock.releaseLock();
  }
}

function safeClaimLiteInFlightRequest_(requestId) {
  try {
    return { claimed:claimLiteInFlightRequest_(requestId), reason:'' };
  } catch (error) {
    return { claimed:false, reason:'claim_failed' };
  }
}

function safeReleaseLiteInFlightRequest_(requestId) {
  try { releaseLiteInFlightRequest_(requestId); }
  catch (error) {}
}

function appendLiteClaimFailureSafe_(turn) {
  try {
    appendLiteTurnPair_(turn, {
      text:'요청을 안전하게 시작하지 못했어요. 잠시 뒤 같은 질문을 다시 보내 주세요.',
      phase:'', managedKind:'', evidenceIds:[], relatedQuestion:false,
      responseScore:'', isClosing:false, questionType:'', sourceStatus:'',
      engineStatus:'engine_failed:request_claim_failed', aiStatus:'not_called'
    });
  } catch (error) {}
}

function readLiteBudgetCounter_(properties, key, bucket) {
  try {
    const value = JSON.parse(properties.getProperty(key) || '{}');
    if (String(value.bucket) === String(bucket)) return Math.max(0, Number(value.count || 0));
  } catch (error) {}
  return 0;
}

function reserveLiteModelCall_() {
  const now = new Date();
  const minuteBucket = Math.floor(now.getTime() / 60000);
  const dayBucket = now.toISOString().slice(0, 10);
  const properties = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const minuteCount = readLiteBudgetCounter_(
      properties, LITE_MODEL_MINUTE_BUDGET_PROPERTY_, minuteBucket
    );
    const dailyCount = readLiteBudgetCounter_(
      properties, LITE_MODEL_DAILY_BUDGET_PROPERTY_, dayBucket
    );
    if (minuteCount >= LITE_MODEL_CALLS_PER_MINUTE_) {
      return { allowed:false, reason:'minute_limit', remaining:0 };
    }
    if (dailyCount >= LITE_MODEL_CALLS_PER_DAY_) {
      return { allowed:false, reason:'daily_limit', remaining:0 };
    }
    properties.setProperty(LITE_MODEL_MINUTE_BUDGET_PROPERTY_, JSON.stringify({
      bucket: minuteBucket, count: minuteCount + 1
    }));
    properties.setProperty(LITE_MODEL_DAILY_BUDGET_PROPERTY_, JSON.stringify({
      bucket: dayBucket, count: dailyCount + 1
    }));
    return { allowed:true, reason:'', remaining:LITE_MODEL_CALLS_PER_DAY_ - dailyCount - 1 };
  } finally {
    lock.releaseLock();
  }
}

function safeReserveLiteModelCall_() {
  try {
    return reserveLiteModelCall_();
  } catch (error) {
    return { allowed:false, reason:'budget_check_failed', remaining:0 };
  }
}

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
  if (String(body.engineFamily || '') !== 'questioning-dialogue-v2' || body.sharedWithWebChatbot !== true) {
    throw new Error('현재 웹 챗봇과 같은 대화 엔진인지 확인하지 못했습니다.');
  }
  return {
    ok: true,
    policyVersion: String(body.policyVersion || ''),
    engineFamily: String(body.engineFamily || '')
  };
}

function buildLiteEnginePayload_(turn, settings, history) {
  return {
    schemaVersion: 1,
    requestId: turn.requestId,
    sessionKey: turn.sessionId,
    activityMode: turn.activityMode,
    studentMessage: turn.message,
    history: compactLiteEngineHistory_(history),
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
      version: settings.version,
      sourceHash: settings.sourceHash,
      lessonRevision: settings.lessonRevision || 1
    }
  };
}

function compactLiteEngineHistory_(history) {
  const entries = (history || []).filter(function (item) {
    return String(item.engineStatus || '').indexOf('engine_failed:') !== 0;
  }).map(function (item) {
    return { speaker: item.speaker, text: liteText_(item.text, 1200) };
  }).filter(function (item) { return item.text; }).slice(-18);
  let total = 0;
  const kept = [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (total + entries[index].text.length > 8000) break;
    kept.unshift(entries[index]);
    total += entries[index].text.length;
  }
  return kept;
}

function requestLiteEnginePlan_(turn, settings, history) {
  const endpoint = getLiteEngineEndpoint_();
  if (!endpoint) throw new Error('중앙 정책 엔진이 아직 연결되지 않았습니다.');
  const payload = buildLiteEnginePayload_(turn, settings, history);
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

function getLiteFinalizeEndpoint_() {
  return getLiteEngineEndpoint_().replace(/\/plan\/?(?:\?.*)?$/, '/finalize');
}

function requestLiteEngineFinalize_(turn, settings, history, candidateReply, candidateEvidenceQuote, plan) {
  const endpoint = getLiteFinalizeEndpoint_();
  if (!endpoint || endpoint === getLiteEngineEndpoint_()) {
    throw new Error('중앙 최종 확인 주소를 찾지 못했습니다.');
  }
  const payload = buildLiteEnginePayload_(turn, settings, history);
  payload.candidateReply = liteRequired_(candidateReply, '개인 API 답변', 3000);
  payload.candidateEvidenceQuote = liteRequired_(candidateEvidenceQuote, '개인 API 근거 문장', 500);
  payload.policyVersion = liteRequired_(plan && plan.policyVersion, '계획 정책 버전', 120);
  payload.planDigest = liteRequired_(plan && plan.planDigest, '계획 식별값', 100);
  const response = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  let body;
  try { body = JSON.parse(response.getContentText()); }
  catch (error) { throw new Error('중앙 최종 확인 응답을 읽지 못했습니다.'); }
  if (status < 200 || status >= 300) {
    throw new Error(liteText_(body && body.error, 240) || '중앙 최종 확인에 실패했습니다.');
  }
  if (!body || Number(body.schemaVersion) !== 2 || String(body.requestId) !== String(turn.requestId) ||
      String(body.policyVersion) !== String(plan.policyVersion) || String(body.planDigest) !== String(plan.planDigest) ||
      !body.engine || body.engine.family !== 'questioning-dialogue-v2' || !body.observation || !body.studentReply) {
    throw new Error('중앙 최종 확인 응답 형식이 맞지 않습니다.');
  }
  return body;
}

function validateLiteEnginePlan_(plan, requestId) {
  if (!plan || Number(plan.schemaVersion) !== 1 || String(plan.requestId) !== String(requestId)) {
    throw new Error('중앙 정책 엔진 응답의 요청 정보가 맞지 않습니다.');
  }
  if (!plan.fallbackReply || !plan.modelRequest || !plan.enforcement || !plan.observation) {
    throw new Error('중앙 정책 엔진 응답에 필요한 항목이 없습니다.');
  }
  if (!plan.engine || plan.engine.family !== 'questioning-dialogue-v2' || plan.engine.sharedCore !== true) {
    throw new Error('현재 웹 챗봇과 같은 대화 엔진 계획이 아닙니다.');
  }
  if (!/^gpt-(?:5\.6-(?:terra|luna|sol)|5\.5)$/.test(String(plan.modelRequest.model))) {
    throw new Error('배포본에서 허용하지 않은 모델이 지정되었습니다.');
  }
  if (!['low'].includes(String(plan.modelRequest.reasoningEffort))) {
    throw new Error('배포본에서 허용하지 않은 추론 설정이 지정되었습니다.');
  }
  if (String(plan.modelRequest.outputContract || '') !== 'lead_evidence_quote_v1') {
    throw new Error('개인 API 출력 계약이 배포본과 맞지 않습니다.');
  }
  if (!/^[A-Za-z0-9_-]{32,100}$/.test(String(plan.planDigest || ''))) {
    throw new Error('중앙 정책 엔진 계획 식별값이 없습니다.');
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
            properties: {
              lead: {
                type: 'string',
                enum: ['좋은 질문이에요.', '궁금한 점을 잘 짚었어요.', '자료에서 함께 확인해 볼게요.', '차근차근 살펴볼게요.']
              },
              evidenceQuote: { type: 'string' }
            },
            required: ['lead', 'evidenceQuote'], additionalProperties: false
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
    text: liteText_(value && value.lead, 3000),
    evidenceQuote: liteText_(value && value.evidenceQuote, 500),
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
  return bot ? {
    text: unescapeLiteSheetText_(bot.text),
    sessionId: String(bot.sessionId || ''),
    isClosing: String(bot.isClosing) === 'true' || bot.isClosing === true,
    phase: Number(bot.phase || 1),
    managedKind: String(bot.managedKind || ''),
    sourceStatus: String(bot.sourceStatus || ''),
    retryable: String(bot.engineStatus || '').indexOf('engine_failed:') === 0
  } : null;
}

function submitLiteTurn(payload) {
  const settings = readLiteTeacherSettings_();
  const turn = prepareLiteStudentTurn_(payload, settings);
  const duplicate = findLiteDuplicateRequest_(turn.requestId);
  if (duplicate) {
    return {
      ok: !duplicate.retryable,
      duplicate: true,
      sessionId: duplicate.sessionId,
      reply: duplicate.text,
      expectsStudentReply: !duplicate.isClosing && /[?？]/.test(duplicate.text),
      isClosing: duplicate.isClosing,
      retryable: duplicate.retryable,
      observation: {
        phase: duplicate.phase,
        sourceStatus: duplicate.sourceStatus,
        managedKind: duplicate.managedKind
      }
    };
  }
  const requestClaim = safeClaimLiteInFlightRequest_(turn.requestId);
  if (!requestClaim.claimed) {
    const claimFailed = requestClaim.reason === 'claim_failed';
    if (claimFailed) appendLiteClaimFailureSafe_(turn);
    return {
      ok:false, retryable:true, sessionId:turn.sessionId,
      reply:claimFailed
        ? '요청을 안전하게 시작하지 못했어요. 잠시 뒤 같은 질문을 다시 보내 주세요.'
        : '같은 질문을 처리하고 있어요. 잠시 뒤 다시 보내 주세요.',
      warning:claimFailed ? '요청 잠금 확인 실패' : '중복 모델 호출을 막았습니다.'
    };
  }
  try {
  if (!hasLiteEngineEndpoint_()) throw new Error('중앙 정책 엔진 연결을 준비하고 있습니다. 잠시 뒤 다시 시도해 주세요.');
  if (!hasLiteApiKey_()) throw new Error('교사가 개인 API 연결을 완료하지 않았습니다.');

  const history = withLiteVirtualStartQuestion_(
    getLiteSessionHistory_(turn.sessionId), turn.startQuestion
  );
  if (history.length && history[history.length - 1].isClosing) {
    throw new Error('이미 마친 대화입니다. 새 수업 설정에서 다시 시작해 주세요.');
  }
  let plan;
  try {
    plan = requestLiteEnginePlan_(turn, settings, history);
  } catch (error) {
    // 엔진 실패 시 모델을 독자 호출하지 않고 실패 턴을 교사 Sheet에 남긴다.
    const failureReply = '중앙 평가 규칙을 불러오지 못했어요. 잠시 뒤 같은 질문을 다시 보내 주세요.';
    appendLiteTurnPair_(turn, {
      text: failureReply, phase:'', managedKind:'', evidenceIds:[], relatedQuestion:false,
      responseScore:'', isClosing:false, questionType:'', sourceStatus:'',
      engineStatus:'engine_failed:' + liteText_(error && error.message, 160), aiStatus:'not_called'
    });
    return { ok:false, sessionId:turn.sessionId, reply:failureReply, retryable:true, warning:'중앙 엔진 연결 실패' };
  }
  let modelResult = null;
  let reply = plan.fallbackReply;
  let observation = plan.observation || {};
  let engineStatus = 'ok:' + liteText_(plan.policyVersion, 80);
  let aiStatus = 'skipped_by_policy';
  let warning = '';
  let replyFinalizedByEngine = false;
  if (!plan.skipModel) {
    const budget = safeReserveLiteModelCall_();
    if (!budget.allowed) {
      aiStatus = 'skipped_by_budget:' + budget.reason;
      warning = budget.reason === 'daily_limit'
        ? '오늘의 개인 API 안전 한도에 도달해 공통 엔진의 기본 답변을 사용했습니다.'
        : budget.reason === 'budget_check_failed'
          ? '개인 API 안전 한도를 확인하지 못해 공통 엔진의 기본 답변을 사용했습니다.'
          : '질문이 한꺼번에 들어와 공통 엔진의 기본 답변을 사용했습니다.';
    } else {
      try {
        modelResult = callLiteOpenAI_(plan);
        aiStatus = 'generated:' + liteText_(modelResult && modelResult.model, 80);
        try {
          const finalized = requestLiteEngineFinalize_(
            turn, settings, history, modelResult.text, modelResult.evidenceQuote, plan
          );
          reply = finalized.studentReply;
          observation = finalized.observation || observation;
          engineStatus = 'finalized:' + liteText_(finalized.policyVersion, 80);
          replyFinalizedByEngine = true;
          if (finalized.localFallback) {
            aiStatus = 'generated_not_used:central_rejected';
            warning = '개인 API 답변이 공통 안전·근거 검사를 통과하지 않아 기본 답변을 사용했습니다.';
          } else {
            aiStatus = 'ok:' + liteText_(modelResult && modelResult.model, 80);
          }
        } catch (error) {
          // 공통 후처리를 통과하지 못한 모델 문장은 학생에게 보내지 않는다.
          reply = plan.fallbackReply;
          engineStatus = 'finalize_failed_fallback:' + liteText_(error && error.message, 140);
          aiStatus = 'generated_not_used';
          warning = '개인 API 답변을 공통 엔진에서 최종 확인하지 못해 안전한 기본 답변을 사용했습니다.';
        }
      } catch (error) {
        reply = plan.fallbackReply;
        aiStatus = 'provider_failed_fallback:' + liteText_(error && error.message, 140);
        warning = '개인 API 호출에 실패해 공통 엔진의 기본 답변을 사용했습니다.';
      }
    }
  }
  if (!replyFinalizedByEngine) reply = enforceLiteReply_(reply, plan);
  const saved = appendLiteTurnPair_(turn, {
    text: reply,
    phase: observation.conversationPhase || 1,
    managedKind: observation.managedKind || '',
    evidenceIds: observation.evidenceIds || [],
    relatedQuestion: Boolean(observation.relatedQuestion),
    responseScore: observation.responseScore == null ? '' : observation.responseScore,
    isClosing: Boolean(observation.isClosing),
    questionType: observation.questionType || '',
    engagementState: observation.engagementState || '',
    curriculumRelation: observation.curriculumRelation || '',
    supportLevel: observation.supportLevel == null ? '' : observation.supportLevel,
    sourceStatus: observation.sourceStatus || '',
    sourceCue: observation.sourceCue || '',
    engineStatus: engineStatus,
    aiStatus: aiStatus
  });
  let evaluationWarning = '';
  if (!saved.duplicate && !turn.isPreview && turn.activityMode === 'evaluation') {
    try { upsertLiteEvaluationDraft_(settings, turn, observation); }
    catch (error) { evaluationWarning = '평가 초안 저장은 다시 확인이 필요합니다.'; }
  }
  return {
    ok: true,
    duplicate: saved.duplicate,
    sessionId: turn.sessionId,
    reply: saved.assistantText || reply,
    expectsStudentReply: !observation.isClosing && /[?？]/.test(reply),
    isClosing: Boolean(observation.isClosing),
    preview: turn.isPreview,
    warning: [warning, evaluationWarning].filter(Boolean).join(' '),
    observation: {
      phase: observation.conversationPhase || 1,
      primaryMove: observation.primaryMove || '',
      sourceStatus: observation.sourceStatus || '',
      managedKind: observation.managedKind || ''
    }
  };
  } finally {
    safeReleaseLiteInFlightRequest_(turn.requestId);
  }
}
