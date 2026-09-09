import assert from 'node:assert/strict';

const baseUrl = String(process.env.LITE_ENGINE_TEST_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const materialText = [
  '학교는 일회용 컵을 줄이기 위해 개인 물병 사용을 권했습니다.',
  '학생들은 개인 물병을 사용하면 쓰레기를 줄일 수 있다고 말했습니다.',
  '탄소중립은 배출한 온실가스만큼 흡수해 순배출량을 0으로 만드는 것을 뜻합니다.',
].join(' ');
let requestNumber = 0;

function makeInput(studentMessage, activityMode = 'evaluation', materialOverride = materialText) {
  requestNumber += 1;
  return {
    schemaVersion: 1,
    requestId: `req_lite_http_${String(requestNumber).padStart(4, '0')}`,
    sessionKey: `session_lite_http_${String(requestNumber).padStart(4, '0')}`,
    activityMode,
    studentMessage,
    history: [],
    lesson: {
      lessonId: 'LESSON-LITE-HTTP',
      subject: '국어',
      grade: '초등 5학년',
      lessonTitle: '개인 물병과 환경',
      lessonGoal: '자료에서 환경 실천의 이유를 찾아 설명한다.',
      achievementStandard: '[6국02-03] 글의 내용을 근거로 판단한다.',
      assessmentCriteria: '자료의 문장을 근거로 질문하고 설명한다.',
      rubricHigh: '정확한 근거를 들어 분명하게 설명한다.',
      rubricMeet: '관련 근거를 찾아 대체로 설명한다.',
      rubricDeveloping: '도움을 받아 관련 문장을 찾는다.',
      evidenceDescription: '학생 질문, 자료 근거, 생각 수정 기록',
      materialTitle: '개인 물병을 사용하는 학교',
      materialText: materialOverride,
      startQuestion: '학교가 개인 물병 사용을 권한 까닭은 무엇인가요?',
      version: 'v1',
      sourceHash: 'sourcehash12345678901234',
      lessonRevision: 1,
    },
  };
}

async function jsonRequest(pathname, init = {}, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${pathname}`, init);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); }
  catch { throw new Error(`${pathname} returned non-JSON (${response.status}): ${text.slice(0, 200)}`); }
  assert.equal(response.status, expectedStatus, `${pathname}: ${JSON.stringify(body)}`);
  return body;
}

async function planFor(message, activityMode, materialOverride) {
  const input = makeInput(message, activityMode, materialOverride);
  const plan = await jsonRequest('/api/lite-engine/plan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return { input, plan };
}

(async () => {
  const descriptor = await jsonRequest('/api/lite-engine/plan');
  assert.equal(descriptor.sharedWithWebChatbot, true);
  assert.equal(descriptor.acceptsTeacherApiKey, false);

  const supported = await planFor('학교는 무엇을 줄이기 위해 개인 물병 사용을 권했나요?');
  assert.equal(supported.plan.policyVersion, 'questioning-dialogue-v2-lite-adapter-v3');
  assert.equal(supported.plan.modelRequest.outputContract, 'lead_evidence_quote_v1');
  assert.equal(supported.plan.skipModel, false);
  assert.equal(supported.plan.observation.sourceStatus, 'supported');
  assert.ok(supported.plan.observation.sourceCue.length >= 8);
  assert.equal(supported.plan.observation.evidenceIds.length, 1);

  const finalized = await jsonRequest('/api/lite-engine/finalize', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...supported.input,
      candidateReply: '좋은 질문이에요.',
      candidateEvidenceQuote: supported.plan.observation.sourceCue,
      policyVersion: supported.plan.policyVersion,
      planDigest: supported.plan.planDigest,
    }),
  });
  assert.equal(finalized.localFallback, false);
  assert.match(finalized.studentReply, /자료 근거는/);

  const rejectedQuote = await jsonRequest('/api/lite-engine/finalize', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...supported.input,
      candidateReply: '좋은 질문이에요.',
      candidateEvidenceQuote: '본문에는 존재하지 않는 가짜 근거입니다.',
      policyVersion: supported.plan.policyVersion,
      planDigest: supported.plan.planDigest,
    }),
  });
  assert.equal(rejectedQuote.localFallback, true);
  assert.equal(rejectedQuote.observation.sourceCue, supported.plan.observation.sourceCue);

  const stalePlan = await jsonRequest('/api/lite-engine/finalize', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...supported.input,
      candidateReply: '좋은 질문이에요.',
      candidateEvidenceQuote: supported.plan.observation.sourceCue,
      policyVersion: supported.plan.policyVersion,
      planDigest: 'stale-plan-digest',
    }),
  }, 400);
  assert.match(stalePlan.error, /최신 계획/);

  const missingSource = await planFor('개인 물병은 어떤 재료로 만들어요?');
  assert.equal(missingSource.plan.skipModel, true);
  assert.equal(missingSource.plan.observation.sourceStatus, 'source_insufficient');
  assert.deepEqual(missingSource.plan.observation.evidenceIds, []);

  const unsupportedVocabulary = await planFor('일회용품 뜻이 뭐예요?');
  assert.equal(unsupportedVocabulary.plan.skipModel, true);
  assert.notEqual(unsupportedVocabulary.plan.observation.sourceStatus, 'supported');
  assert.deepEqual(unsupportedVocabulary.plan.observation.evidenceIds, []);

  const definedVocabulary = await planFor('탄소중립이 뭐예요?');
  assert.equal(definedVocabulary.plan.skipModel, false);
  assert.equal(definedVocabulary.plan.observation.questionType, 'vocabulary');
  assert.equal(definedVocabulary.plan.observation.sourceStatus, 'supported');
  assert.equal(definedVocabulary.plan.observation.evidenceIds.length, 1);

  const decimalStatement = await planFor('18kg에서 10.4kg으로 줄었어요.');
  assert.match(decimalStatement.plan.fallbackReply, /10\.4kg/);
  assert.doesNotMatch(decimalStatement.plan.fallbackReply, /104kg/);

  const offTopic = await planFor('축구 결과 알려줘');
  assert.equal(offTopic.plan.skipModel, true);
  assert.equal(
    offTopic.plan.observation.sourceStatus,
    'out_of_scope',
    JSON.stringify(offTopic.plan),
  );
  assert.deepEqual(offTopic.plan.observation.evidenceIds, []);

  const contextualApplication = await planFor(
    '이 글의 내용을 유튜브 영상으로 소개하려면 어떻게 해야 해요?',
    'exploration',
  );
  assert.notEqual(contextualApplication.plan.observation.sourceStatus, 'out_of_scope');

  const mediaMaterial = [
    '뉴스와 정보 매체는 만든 사람과 출처를 확인하며 읽어야 합니다.',
    '서로 다른 미디어가 같은 사건을 어떻게 전달하는지 비교하면 신뢰성을 판단하는 데 도움이 됩니다.',
  ].join(' ');
  const gameAsMedia = await planFor('게임도 미디어예요?', 'exploration', mediaMaterial);
  assert.notEqual(gameAsMedia.plan.observation.sourceStatus, 'out_of_scope');
  const youtubeComparison = await planFor('유튜브가 뉴스보다 믿을 만해요?', 'exploration', mediaMaterial);
  assert.notEqual(youtubeComparison.plan.observation.sourceStatus, 'out_of_scope');

  const closing = await planFor('이제 그만할게요');
  assert.equal(closing.plan.skipModel, true);
  assert.equal(closing.plan.observation.isClosing, true);
  assert.doesNotMatch(closing.plan.fallbackReply, /[?？]/);

  console.log('lite-engine HTTP checks: all passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
