/**
 * 기존 질문중심 챗봇의 공통 정책 엔진 → 교사 개인 OpenAI API 순서로 호출합니다.
 * 배포 패키지를 만들 때 기존 챗봇의 /api/lite-engine/plan 주소와 접근키를 넣습니다.
 */

const LITE_CENTRAL_ENGINE_URL_ = 'https://newscomment-ai.vercel.app/api/lite-engine/plan';
const LITE_CENTRAL_ENGINE_ACCESS_KEY_ = '';
const LITE_OPENAI_RESPONSES_URL_ = 'https://api.openai.com/v1/responses';
const LITE_MODEL_CALLS_PER_MINUTE_ = 60;
const LITE_MODEL_CALLS_PER_DAY_ = 300;
const LITE_MODEL_MINUTE_BUDGET_PROPERTY_ = 'LITE_MODEL_MINUTE_BUDGET';
const LITE_MODEL_DAILY_BUDGET_PROPERTY_ = 'LITE_MODEL_DAILY_BUDGET';
const LITE_REQUEST_CLAIM_TTL_MS_ = 10 * 60 * 1000;
const LITE_CLAIM_CLEANUP_INTERVAL_MS_ = 60 * 1000;
const LITE_CLAIM_CLEANUP_AFTER_PROPERTY_ = 'LITE_CLAIM_CLEANUP_AFTER';
const LITE_ENGINE_REQUESTS_PER_MINUTE_ = 90;
const LITE_ENGINE_REQUESTS_PER_DAY_ = 900;
const LITE_ENGINE_REQUESTS_PER_SESSION_ = 20;
const LITE_ENGINE_REQUESTS_PER_STUDENT_LESSON_ = 20;
const LITE_ENGINE_MINUTE_BUDGET_PROPERTY_ = 'LITE_ENGINE_MINUTE_BUDGET';
const LITE_ENGINE_DAILY_BUDGET_PROPERTY_ = 'LITE_ENGINE_DAILY_BUDGET';
const LITE_PENDING_RESULT_TTL_MS_ = 10 * 60 * 1000;
const LITE_PENDING_DURABLE_TTL_MS_ = 24 * 60 * 60 * 1000;
const LITE_PENDING_MAX_ENTRIES_ = 32;
const LITE_PENDING_PROPERTY_PREFIX_ = 'LITE_PENDING_';

function liteRequestClaimKey_(requestId) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(requestId),
    Utilities.Charset.UTF_8
  );
  return 'LITE_INFLIGHT_' + Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '').slice(0, 32);
}

function liteSessionClaimKey_(sessionId) {
  return liteRequestClaimKey_('session:' + String(sessionId)).replace('LITE_INFLIGHT_', 'LITE_SESSION_INFLIGHT_');
}

function cleanupLiteStaleClaims_(properties, now) {
  const cleanupAfter = Number(properties.getProperty(LITE_CLAIM_CLEANUP_AFTER_PROPERTY_) || 0);
  if (cleanupAfter > now) return;
  const all = properties.getProperties();
  Object.keys(all).forEach(function (propertyKey) {
    let claimedAt = 0;
    if (propertyKey.indexOf('LITE_SESSION_INFLIGHT_') === 0) {
      try { claimedAt = Number(JSON.parse(all[propertyKey] || '{}').claimedAt || 0); }
      catch (error) {}
    } else if (propertyKey.indexOf('LITE_INFLIGHT_') === 0) {
      claimedAt = Number(all[propertyKey] || 0);
    } else {
      return;
    }
    if (!claimedAt || now - claimedAt >= LITE_REQUEST_CLAIM_TTL_MS_) {
      properties.deleteProperty(propertyKey);
    }
  });
  properties.setProperty(
    LITE_CLAIM_CLEANUP_AFTER_PROPERTY_,
    String(now + LITE_CLAIM_CLEANUP_INTERVAL_MS_)
  );
}

function claimLiteInFlightRequest_(requestId, sessionId) {
  const key = liteRequestClaimKey_(requestId);
  const sessionKey = sessionId ? liteSessionClaimKey_(sessionId) : '';
  const properties = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const now = Date.now();
    cleanupLiteStaleClaims_(properties, now);
    const claimedAt = Number(properties.getProperty(key) || 0);
    if (claimedAt && now - claimedAt < LITE_REQUEST_CLAIM_TTL_MS_) return false;
    if (sessionKey) {
      let sessionClaim = {};
      try { sessionClaim = JSON.parse(properties.getProperty(sessionKey) || '{}'); }
      catch (error) {}
      if (Number(sessionClaim.claimedAt || 0) &&
          now - Number(sessionClaim.claimedAt) < LITE_REQUEST_CLAIM_TTL_MS_ &&
          String(sessionClaim.requestId || '') !== String(requestId)) return false;
    }
    properties.setProperty(key, String(now));
    if (sessionKey) {
      properties.setProperty(sessionKey, JSON.stringify({ claimedAt:now, requestId:String(requestId) }));
    }
    return true;
  } finally {
    lock.releaseLock();
  }
}

function releaseLiteInFlightRequest_(requestId, sessionId) {
  const properties = PropertiesService.getScriptProperties();
  // Apps Script 실행 상한보다 claim TTL이 길다. request key를 마지막에 지우면
  // 같은 requestId의 재시도가 중간에 claim을 다시 얻어 새 session claim을 덮지 못한다.
  if (sessionId) {
    const sessionKey = liteSessionClaimKey_(sessionId);
    let sessionClaim = {};
    try { sessionClaim = JSON.parse(properties.getProperty(sessionKey) || '{}'); }
    catch (error) {}
    if (String(sessionClaim.requestId || '') === String(requestId)) {
      properties.deleteProperty(sessionKey);
    }
  }
  properties.deleteProperty(liteRequestClaimKey_(requestId));
}

function safeClaimLiteInFlightRequest_(requestId, sessionId) {
  try {
    return { claimed:claimLiteInFlightRequest_(requestId, sessionId), reason:'' };
  } catch (error) {
    return { claimed:false, reason:'claim_failed' };
  }
}

function safeReleaseLiteInFlightRequest_(requestId, sessionId) {
  try { releaseLiteInFlightRequest_(requestId, sessionId); }
  catch (error) {}
}

function litePendingResultKey_(requestId) {
  return liteRequestClaimKey_('pending:' + String(requestId)).replace('LITE_INFLIGHT_', LITE_PENDING_PROPERTY_PREFIX_);
}

function litePendingMaxAge_(value) {
  return value && (value.state === 'result_ready' || value.state === 'result_unrecoverable')
    ? LITE_PENDING_DURABLE_TTL_MS_
    : LITE_PENDING_RESULT_TTL_MS_;
}

function cleanupLitePendingStates_(properties, now) {
  const all = properties.getProperties();
  let activeCount = 0;
  Object.keys(all).filter(function (key) {
    return key.indexOf(LITE_PENDING_PROPERTY_PREFIX_) === 0;
  }).forEach(function (key) {
    let value;
    try { value = JSON.parse(all[key] || 'null'); }
    catch (error) { value = null; }
    const age = now - Number(value && value.at || 0);
    if (!value || age > litePendingMaxAge_(value)) properties.deleteProperty(key);
    else activeCount += 1;
  });
  return activeCount;
}

function liteTurnFingerprint_(turn) {
  return liteFingerprint_([
    turn.requestId, turn.sessionId, turn.studentCode, turn.lessonId,
    turn.lessonRevision, turn.sourceHash, turn.message
  ].join('|'), 32);
}

function saveLitePendingState_(turn, state, output) {
  const value = {
    state:state,
    at:Date.now(),
    turnFingerprint:liteTurnFingerprint_(turn)
  };
  if (output) value.output = output;
  const serialized = JSON.stringify(value);
  const byteLength = Utilities.newBlob(serialized).getBytes().length;
  if (byteLength > 8500) throw new Error('응답 복구 기록이 안전 저장 크기를 넘었습니다.');
  PropertiesService.getScriptProperties().setProperty(
    litePendingResultKey_(turn.requestId), serialized
  );
}

function tryMarkLiteProviderStarted_(turn) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const properties = PropertiesService.getScriptProperties();
    const key = litePendingResultKey_(turn.requestId);
    if (!properties.getProperty(key) && cleanupLitePendingStates_(properties, Date.now()) >= LITE_PENDING_MAX_ENTRIES_) {
      return false;
    }
    saveLitePendingState_(turn, 'provider_started', null);
    return true;
  } catch (error) {
    return false;
  } finally {
    try { lock.releaseLock(); }
    catch (error) {}
  }
}

function trySaveLitePreparedResult_(turn, output) {
  try { saveLitePendingState_(turn, 'result_ready', output); return true; }
  catch (error) {
    const observation = compactLitePreparedObservation_(output && output.observation);
    observation.sourceCue = liteText_(observation.sourceCue, 80);
    observation.rubricScores = (observation.rubricScores || []).map(function (item) {
      return {
        criterionKey:liteText_(item.criterionKey, 80),
        score:Number(item.score || 0),
        rationale:liteText_(item.rationale, 80)
      };
    });
    const emergency = Object.assign({}, output, {
      reply:liteText_(output && output.reply, 800),
      observation:observation,
      warning:[output && output.warning, '응답 복구 기록을 축약했습니다.'].filter(Boolean).join(' ')
    });
    try { saveLitePendingState_(turn, 'result_ready', emergency); return true; }
    catch (secondError) {
      try { saveLitePendingState_(turn, 'result_unrecoverable', null); }
      catch (thirdError) {}
      return false;
    }
  }
}

function readLitePendingState_(turn) {
  const properties = PropertiesService.getScriptProperties();
  const key = litePendingResultKey_(turn.requestId);
  let value;
  try { value = JSON.parse(properties.getProperty(key) || 'null'); }
  catch (error) { value = null; }
  if (!value) return null;
  if (String(value.turnFingerprint || '') !== liteTurnFingerprint_(turn)) {
    throw new Error('같은 전송 번호가 다른 수업 또는 학생 정보와 함께 사용되었습니다. 화면을 새로고침해 주세요.');
  }
  const age = Date.now() - Number(value.at || 0);
  const maxAge = litePendingMaxAge_(value);
  if (age > maxAge) {
    properties.deleteProperty(key);
    return null;
  }
  return value;
}

function clearLitePendingState_(requestId) {
  try { PropertiesService.getScriptProperties().deleteProperty(litePendingResultKey_(requestId)); }
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

function liteLocalDayBucket_(date) {
  try {
    return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  } catch (error) {
    return date.toISOString().slice(0, 10);
  }
}

function reserveLiteModelCall_() {
  const now = new Date();
  const minuteBucket = Math.floor(now.getTime() / 60000);
  const dayBucket = liteLocalDayBucket_(now);
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

function reserveLiteEngineRequest_(turn) {
  const now = new Date();
  const lessonBucket = [turn.lessonId, 'r' + turn.lessonRevision, turn.sourceHash].join(':');
  const minuteBucket = lessonBucket + ':' + Math.floor(now.getTime() / 60000);
  const dayBucket = lessonBucket + ':' + liteLocalDayBucket_(now);
  const properties = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const minuteCount = readLiteBudgetCounter_(properties, LITE_ENGINE_MINUTE_BUDGET_PROPERTY_, minuteBucket);
    const dailyCount = readLiteBudgetCounter_(properties, LITE_ENGINE_DAILY_BUDGET_PROPERTY_, dayBucket);
    if (minuteCount >= LITE_ENGINE_REQUESTS_PER_MINUTE_) {
      return { allowed:false, reason:'minute_limit', remaining:0 };
    }
    if (dailyCount >= LITE_ENGINE_REQUESTS_PER_DAY_) {
      return { allowed:false, reason:'daily_limit', remaining:0 };
    }
    properties.setProperty(LITE_ENGINE_MINUTE_BUDGET_PROPERTY_, JSON.stringify({
      bucket:minuteBucket, count:minuteCount + 1
    }));
    properties.setProperty(LITE_ENGINE_DAILY_BUDGET_PROPERTY_, JSON.stringify({
      bucket:dayBucket, count:dailyCount + 1
    }));
    return { allowed:true, reason:'', remaining:LITE_ENGINE_REQUESTS_PER_DAY_ - dailyCount - 1 };
  } finally {
    lock.releaseLock();
  }
}

function safeReserveLiteEngineRequest_(turn) {
  try { return reserveLiteEngineRequest_(turn); }
  catch (error) { return { allowed:false, reason:'budget_check_failed', remaining:0 }; }
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

function getLiteEngineAccessKey_() {
  return liteText_(LITE_CENTRAL_ENGINE_ACCESS_KEY_, 240);
}

function getLiteEngineRequestHeaders_() {
  const accessKey = getLiteEngineAccessKey_();
  if (!/^\S{32,240}$/.test(accessKey)) {
    throw new Error('기존 질문중심 챗봇의 중앙 엔진 접근키가 배포본에 연결되지 않았습니다.');
  }
  return {
    'X-Lite-Engine-Key':accessKey,
    'X-Lite-Deployment-Id':getOrCreateLiteDeploymentId_()
  };
}

function hasLiteEngineEndpoint_() {
  return /^https:\/\//i.test(getLiteEngineEndpoint_()) && /^\S{32,240}$/.test(getLiteEngineAccessKey_());
}

/** 운영자가 배포 사본을 만들 때만 실행합니다. 교사 연수 화면에는 노출하지 않습니다. */
function setLiteCentralEngineEndpointForOwner_(url) {
  requireLiteTeacherContext_();
  const endpoint = liteText_(url, 1000);
  if (!/^https:\/\//i.test(endpoint)) {
    throw new Error('중앙 엔진 주소는 https://로 시작해야 합니다.');
  }
  PropertiesService.getScriptProperties().setProperty(LITE_ENGINE_ENDPOINT_PROPERTY_, endpoint);
  clearLiteEngineVerification_();
  return { ok: true, endpoint: endpoint };
}

function checkLiteEngineConnection_() {
  const endpoint = getLiteEngineEndpoint_();
  if (!hasLiteEngineEndpoint_()) throw new Error('기존 질문중심 챗봇의 중앙 엔진 주소와 접근키가 배포본에 연결되지 않았습니다.');
  const response = UrlFetchApp.fetch(endpoint, {
    method:'get',
    headers:getLiteEngineRequestHeaders_(),
    muteHttpExceptions:true
  });
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
    headers: getLiteEngineRequestHeaders_(),
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
    headers: getLiteEngineRequestHeaders_(),
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
  if (typeof plan.skipModel !== 'boolean' || typeof plan.modelRequest !== 'object' ||
      typeof plan.enforcement !== 'object' || typeof plan.observation !== 'object') {
    throw new Error('중앙 정책 엔진 계획의 자료 형식이 맞지 않습니다.');
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
  const instructions = String(plan.modelRequest.instructions || '');
  const input = String(plan.modelRequest.input || '');
  if (!instructions || instructions.length > 4000 || !input || input.length > 12000) {
    throw new Error('개인 API에 보낼 중앙 계획의 입력 크기가 안전 범위를 벗어났습니다.');
  }
  if (String(plan.fallbackReply || '').length > 3000 ||
      String(plan.enforcement.managedQuestion || '').length > 500 ||
      [0, 1].indexOf(Number(plan.enforcement.maximumQuestionCount)) < 0) {
    throw new Error('중앙 정책 엔진의 답변 제한값이 배포본과 맞지 않습니다.');
  }
  if (!/^[A-Za-z0-9_-]{32,100}$/.test(String(plan.planDigest || ''))) {
    throw new Error('중앙 정책 엔진 계획 식별값이 없습니다.');
  }
  return plan;
}

function callLiteOpenAI_(plan, requestId) {
  const key = PropertiesService.getScriptProperties().getProperty(LITE_API_KEY_PROPERTY_);
  if (!key) throw new Error('교사 개인 API 키가 없습니다. 교사 설정에서 연결해 주세요.');
  const request = plan.modelRequest;
  const response = UrlFetchApp.fetch(LITE_OPENAI_RESPONSES_URL_, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + key,
      'X-Client-Request-Id': liteText_(requestId, 100)
    },
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
  if (!output) throw liteOpenAIContractError_('개인 API 응답에 답변이 없습니다.', data, request);
  let value;
  try { value = JSON.parse(output); }
  catch (error) { throw liteOpenAIContractError_('개인 API의 답변 형식을 확인하지 못했습니다.', data, request); }
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

function findLiteDuplicateRequest_(requestId, expectedTurn, rowsOverride, spreadsheet) {
  let rows;
  if (Array.isArray(rowsOverride)) {
    rows = rowsOverride.filter(function (row) { return String(row.requestId) === String(requestId); });
  } else {
    const sheet = (spreadsheet || getLiteSpreadsheet_()).getSheetByName('질문과 답변');
    if (!sheet) return null;
    rows = liteRowsByColumnValue_(sheet, 'requestId', requestId);
  }
  if (!rows.length) return null;
  if (expectedTurn) {
    const student = rows.find(function (row) { return String(row.speaker) === 'student'; });
    const contextMatches = student && rows.every(function (row) {
      return liteTurnRowMatches_(row, expectedTurn);
    });
    const messageMatches = student && unescapeLiteSheetText_(student.text) === String(expectedTurn.message);
    if (!contextMatches || !messageMatches) {
      throw new Error('같은 전송 번호가 다른 수업 또는 학생 정보와 함께 사용되었습니다. 화면을 새로고침해 주세요.');
    }
  }
  const bot = rows.find(function (row) { return String(row.speaker) === 'bot'; });
  if (!bot) return null;
  let rubricScores = [];
  try { rubricScores = JSON.parse(String(bot.rubricScoresJson || '[]')); }
  catch (error) {}
  const observation = {
    conversationPhase: Number(bot.phase || 1),
    managedKind: String(bot.managedKind || ''),
    relatedQuestion: String(bot.relatedQuestion) === 'true' || bot.relatedQuestion === true,
    responseScore: bot.responseScore === '' ? '' : Number(bot.responseScore),
    questionType: String(bot.questionType || ''),
    engagementState: String(bot.engagementState || ''),
    curriculumRelation: String(bot.curriculumRelation || ''),
    supportLevel: bot.supportLevel === '' ? '' : Number(bot.supportLevel),
    sourceStatus: String(bot.sourceStatus || ''),
    sourceCue: String(bot.sourceCue || ''),
    primaryMove: String(bot.primaryMove || ''),
    safetyFlag: String(bot.safetyFlag) === 'true' || bot.safetyFlag === true,
    evidenceIds: String(bot.evidenceIds || '').split('|').filter(Boolean),
    rubricScores: Array.isArray(rubricScores) ? rubricScores : [],
    isClosing: String(bot.isClosing) === 'true' || bot.isClosing === true
  };
  return {
    text: unescapeLiteSheetText_(bot.text),
    sessionId: String(bot.sessionId || ''),
    isClosing: observation.isClosing,
    phase: observation.conversationPhase,
    managedKind: observation.managedKind,
    sourceStatus: observation.sourceStatus,
    engineStatus: String(bot.engineStatus || ''),
    aiStatus: String(bot.aiStatus || ''),
    retryable: String(bot.engineStatus || '').indexOf('engine_failed:') === 0,
    observation: observation
  };
}

function liteOpenAIContractError_(message, data, request) {
  const error = new Error(message);
  error.usage = data && data.usage || {};
  error.model = liteText_(data && data.model || request && request.model, 80);
  error.responseId = liteText_(data && data.id, 100);
  return error;
}

function compactLitePreparedObservation_(observation) {
  observation = observation || {};
  return {
    conversationPhase:Math.max(1, Number(observation.conversationPhase || 1)),
    primaryMove:liteText_(observation.primaryMove, 80),
    managedKind:liteText_(observation.managedKind, 80),
    evidenceIds:(Array.isArray(observation.evidenceIds) ? observation.evidenceIds : [])
      .slice(0, 20).map(function (value) { return liteText_(value, 100); }),
    relatedQuestion:Boolean(observation.relatedQuestion),
    responseScore:observation.responseScore == null ? '' : Number(observation.responseScore),
    isClosing:Boolean(observation.isClosing),
    questionType:liteText_(observation.questionType, 80),
    engagementState:liteText_(observation.engagementState, 80),
    curriculumRelation:liteText_(observation.curriculumRelation, 80),
    supportLevel:observation.supportLevel == null ? '' : Number(observation.supportLevel),
    sourceStatus:liteText_(observation.sourceStatus, 80),
    sourceCue:liteText_(observation.sourceCue, 150),
    safetyFlag:Boolean(observation.safetyFlag),
    rubricScores:(Array.isArray(observation.rubricScores) ? observation.rubricScores : [])
      .slice(0, 4).map(function (item) {
        return {
          criterionKey:liteText_(item && item.criterionKey, 80),
          score:Number(item && item.score || 0),
          rationale:liteText_(item && item.rationale, 140)
        };
      })
  };
}

function commitLitePreparedResult_(settings, turn, prepared, runtimeContext) {
  runtimeContext = runtimeContext || {};
  const observation = compactLitePreparedObservation_(prepared.observation);
  const reply = liteText_(prepared.reply, 1600);
  const saved = appendLiteTurnPair_(turn, {
    text:reply,
    phase:observation.conversationPhase,
    managedKind:observation.managedKind,
    evidenceIds:observation.evidenceIds,
    relatedQuestion:observation.relatedQuestion,
    responseScore:observation.responseScore,
    isClosing:observation.isClosing,
    questionType:observation.questionType,
    engagementState:observation.engagementState,
    curriculumRelation:observation.curriculumRelation,
    supportLevel:observation.supportLevel,
    sourceStatus:observation.sourceStatus,
    sourceCue:observation.sourceCue,
    primaryMove:observation.primaryMove,
    safetyFlag:observation.safetyFlag,
    rubricScores:observation.rubricScores,
    apiModel:liteText_(prepared.apiModel, 80),
    apiInputTokens:Math.max(0, Number(prepared.apiInputTokens || 0)),
    apiOutputTokens:Math.max(0, Number(prepared.apiOutputTokens || 0)),
    apiTotalTokens:Math.max(0, Number(prepared.apiTotalTokens || 0)),
    engineStatus:liteText_(prepared.engineStatus, 240),
    aiStatus:liteText_(prepared.aiStatus, 240)
  }, {
    updateEvaluation:true,
    settings:settings,
    observation:observation,
    spreadsheet:runtimeContext.spreadsheet,
    workbookReady:Boolean(runtimeContext.workbookReady),
    prechecked:Boolean(runtimeContext.prechecked),
    allRows:runtimeContext.allRows,
    sessionRows:runtimeContext.sessionRows
  });
  const evaluationWarning = saved.evaluationWarning || '';
  if (turn.isPreview && /^ok:/.test(String(prepared.aiStatus || '')) &&
      /^finalized:/.test(String(prepared.engineStatus || ''))) {
    markLitePreviewVerified_(settings);
  }
  const repairRequired = Boolean(evaluationWarning);
  if (!repairRequired) clearLitePendingState_(turn.requestId);
  return {
    ok:!repairRequired,
    duplicate:Boolean(saved.duplicate),
    sessionId:turn.sessionId,
    reply:saved.assistantText || reply,
    expectsStudentReply:!observation.isClosing && /[?？]/.test(reply),
    isClosing:Boolean(observation.isClosing),
    preview:turn.isPreview,
    retryable:repairRequired,
    retrySameRequest:repairRequired,
    warning:[prepared.warning, evaluationWarning].filter(Boolean).join(' '),
    observation:{
      phase:observation.conversationPhase,
      primaryMove:observation.primaryMove,
      sourceStatus:observation.sourceStatus,
      managedKind:observation.managedKind
    }
  };
}

function handleLiteDuplicateRequest_(duplicate, settings, turn, spreadsheet, sessionRows) {
  let repairFailed = false;
  if (!duplicate.retryable) {
    if (turn.isPreview && /^ok:/.test(duplicate.aiStatus) && /^finalized:/.test(duplicate.engineStatus)) {
      markLitePreviewVerified_(settings);
    }
    if (!turn.isPreview) {
      try { repairLiteStudentSummary_(spreadsheet, turn, duplicate.observation, sessionRows); }
      catch (error) { repairFailed = true; }
      if (turn.activityMode === 'evaluation') {
        try {
          upsertLiteEvaluationDraft_(settings, turn, duplicate.observation, {
            spreadsheet:spreadsheet,
            workbookReady:true
          });
        } catch (error) { repairFailed = true; }
      }
    }
  }
  if (repairFailed) {
    return {
      ok:false, duplicate:true, retryable:true, retrySameRequest:true,
      sessionId:duplicate.sessionId,
      reply:'기록을 안전하게 확인하고 있어요. 잠시만 기다려 주세요.',
      warning:'교사 기록 저장 확인 중'
    };
  }
  if (!duplicate.retryable) clearLitePendingState_(turn.requestId);
  return {
    ok:!duplicate.retryable,
    duplicate:true,
    sessionId:duplicate.sessionId,
    reply:duplicate.text,
    expectsStudentReply:!duplicate.isClosing && /[?？]/.test(duplicate.text),
    isClosing:duplicate.isClosing,
    retryable:duplicate.retryable,
    observation:{
      phase:duplicate.phase,
      sourceStatus:duplicate.sourceStatus,
      managedKind:duplicate.managedKind
    }
  };
}

function submitLiteTurn(payload) {
  const spreadsheet = getLiteSpreadsheet_();
  // 학생 입장 전에 준비 검사가 끝났으므로, 매 턴마다 다섯 시트의 스키마를 다시 쓰지 않는다.
  const settings = readLiteTeacherSettings_(spreadsheet, { skipEnsure:true });
  const turn = prepareLiteStudentTurn_(payload, settings);
  const requestClaim = safeClaimLiteInFlightRequest_(turn.requestId, turn.sessionId);
  if (!requestClaim.claimed) {
    const claimFailed = requestClaim.reason === 'claim_failed';
    return {
      ok:false, retryable:true, sessionId:turn.sessionId,
      retrySameRequest:true,
      reply:claimFailed
        ? '요청을 안전하게 시작하지 못했어요. 잠시 뒤 같은 질문을 다시 보내 주세요.'
        : '같은 질문을 처리하고 있어요. 잠시 뒤 다시 보내 주세요.',
      warning:claimFailed ? '요청 잠금 확인 실패' : '중복 모델 호출을 막았습니다.'
    };
  }
  try {
  const qaSheet = spreadsheet.getSheetByName('질문과 답변');
  if (!qaSheet) throw new Error('교사가 수업 시트 준비를 다시 실행해 주세요.');
  // 같은 세션 claim을 잡은 뒤 한 번 읽은 행을 중복·횟수·문맥·기록 단계에서 재사용한다.
  const qaRows = liteRowsAsObjects_(qaSheet);
  const sessionRows = qaRows.filter(function (row) {
    return String(row.sessionId) === String(turn.sessionId);
  });
  const runtimeContext = {
    spreadsheet:spreadsheet,
    workbookReady:true,
    prechecked:true,
    allRows:qaRows,
    sessionRows:sessionRows
  };
  const duplicate = findLiteDuplicateRequest_(turn.requestId, turn, qaRows, spreadsheet);
  if (duplicate) {
    return handleLiteDuplicateRequest_(duplicate, settings, turn, spreadsheet, sessionRows);
  }

  const pendingState = readLitePendingState_(turn);
  if (pendingState && pendingState.state === 'provider_started') {
    return {
      ok:false, retryable:true, retrySameRequest:true, sessionId:turn.sessionId,
      reply:'이미 보낸 질문의 결과를 확인하고 있어요. 잠시만 기다려 주세요.',
      warning:'유료 API 중복 호출 방지 중'
    };
  }
  if (pendingState && pendingState.state === 'result_unrecoverable') {
    return {
      ok:false, retryable:false, sessionId:turn.sessionId, isClosing:true,
      reply:'응답은 만들었지만 안전한 기록을 확인하지 못했어요. 같은 질문을 다시 보내지 말고 선생님께 알려 주세요.',
      warning:'유료 API 중복 호출을 막기 위해 재호출 중단'
    };
  }
  if (pendingState && pendingState.state === 'result_ready' && pendingState.output) {
    return commitLitePreparedResult_(settings, turn, pendingState.output, runtimeContext);
  }

  if (!hasLiteEngineEndpoint_()) throw new Error('중앙 정책 엔진 연결을 준비하고 있습니다. 잠시 뒤 다시 시도해 주세요.');
  if (!hasLiteApiKey_()) throw new Error('교사가 개인 API 연결을 완료하지 않았습니다.');

  const history = withLiteVirtualStartQuestion_(
    getLiteSessionHistory_(turn.sessionId, spreadsheet, qaRows), turn.startQuestion
  );
  if (history.length && history[history.length - 1].isClosing) {
    throw new Error('이미 마친 대화입니다. 새 수업 설정에서 다시 시작해 주세요.');
  }
  const sessionAtLimit = countLiteSessionRequests_(turn.sessionId, spreadsheet, qaRows) >=
    LITE_ENGINE_REQUESTS_PER_SESSION_;
  const studentAtLimit = countLiteStudentLessonRequests_(turn, spreadsheet, qaRows) >=
    LITE_ENGINE_REQUESTS_PER_STUDENT_LESSON_;
  if (sessionAtLimit || studentAtLimit) {
    const limitReply = '이 수업에서 나눌 수 있는 대화 횟수를 모두 사용했어요. 지금까지의 생각을 선생님과 확인해 주세요.';
    appendLiteTurnPair_(turn, {
      text:limitReply, phase:2, managedKind:'close', evidenceIds:[], relatedQuestion:false,
      responseScore:'', isClosing:true, questionType:'', sourceStatus:'', primaryMove:'close',
      engineStatus:'limit:student_lesson', aiStatus:'not_called'
    }, runtimeContext);
    return {
      ok:false, retryable:false, sessionId:turn.sessionId, isClosing:true,
      reply:limitReply,
      warning:'학생별 수업 대화 한도 도달'
    };
  }
  const requestBudget = safeReserveLiteEngineRequest_(turn);
  if (!requestBudget.allowed) {
    const minuteLimited = requestBudget.reason === 'minute_limit';
    return {
      ok:false, retryable:minuteLimited, retrySameRequest:minuteLimited,
      sessionId:turn.sessionId,
      reply:minuteLimited
        ? '친구들의 질문이 한꺼번에 들어오고 있어요. 잠시 뒤 자동으로 다시 확인할게요.'
        : requestBudget.reason === 'daily_limit'
          ? '오늘 수업의 안전 사용 한도에 도달했어요. 선생님께 알려 주세요.'
          : '안전 사용 한도를 확인하지 못했어요. 잠시 뒤 선생님과 다시 시도해 주세요.',
      warning:'수업 요청 안전 한도'
    };
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
    }, runtimeContext);
    return { ok:false, sessionId:turn.sessionId, reply:failureReply, retryable:true, warning:'중앙 엔진 연결 실패' };
  }
  let modelResult = null;
  let reply = plan.fallbackReply;
  let observation = plan.observation || {};
  let engineStatus = 'ok:' + liteText_(plan.policyVersion, 80);
  let aiStatus = 'skipped_by_policy';
  let warning = '';
  let replyFinalizedByEngine = false;
  let providerAttempted = false;
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
      if (!tryMarkLiteProviderStarted_(turn)) {
        aiStatus = 'skipped_by_journal_failure';
        warning = '유료 API 중복 호출 보호 상태를 저장하지 못해 공통 엔진의 기본 답변을 사용했습니다.';
      } else try {
        providerAttempted = true;
        modelResult = callLiteOpenAI_(plan, turn.requestId);
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
        if (error && error.usage) {
          modelResult = { model:error.model || '', responseId:error.responseId || '', usage:error.usage };
        }
        reply = plan.fallbackReply;
        aiStatus = 'provider_failed_fallback:' + liteText_(error && error.message, 140);
        warning = '개인 API 호출에 실패해 공통 엔진의 기본 답변을 사용했습니다.';
      }
    }
  }
  if (!replyFinalizedByEngine) reply = enforceLiteReply_(reply, plan);
  const prepared = {
    reply:liteText_(reply, 1600),
    observation:compactLitePreparedObservation_(observation),
    engineStatus:engineStatus,
    aiStatus:aiStatus,
    warning:warning,
    apiModel:modelResult && modelResult.model || '',
    apiInputTokens:modelResult && modelResult.usage && (modelResult.usage.input_tokens || modelResult.usage.inputTokens) || 0,
    apiOutputTokens:modelResult && modelResult.usage && (modelResult.usage.output_tokens || modelResult.usage.outputTokens) || 0,
    apiTotalTokens:modelResult && modelResult.usage && (modelResult.usage.total_tokens || modelResult.usage.totalTokens) || 0
  };
  if (providerAttempted && !trySaveLitePreparedResult_(turn, prepared)) {
    prepared.warning = [prepared.warning, '유료 응답 복구 기록을 확인하지 못했습니다.'].filter(Boolean).join(' ');
  }
  return commitLitePreparedResult_(settings, turn, prepared, runtimeContext);
  } finally {
    safeReleaseLiteInFlightRequest_(turn.requestId, turn.sessionId);
  }
}
