/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const fixture = {
  assessmentCriteria:'자료의 사실을 정확히 설명하고 근거를 들어 실천 의견을 제시한다.',
  rubricHigh:'핵심 사실을 정확히 설명하고 적절한 근거를 자신의 실천 의견과 구체적으로 연결한다.',
  rubricGood:'핵심 사실을 설명하고 자료의 근거를 들어 실천 의견을 제시한다.',
  rubricMeet:'주요 사실을 일부 설명하며 안내를 받아 의견의 이유를 찾는다.',
  rubricDeveloping:'관련 문장을 함께 읽으며 사실과 의견을 구분하는 도움이 필요하다.',
  evidenceDescription:'학생이 찾은 근거 문장, 자기 말로 한 설명, 실천 의견과 이유'
};
const input = { activityMode:'evaluation', grade:'초등 4학년', subject:'국어', lessonGoal:'자료를 근거로 자신의 의견을 설명한다.' };
function harness(options = {}) {
  let calls = 0;
  let lastRequest;
  let reservations = 0;
  const properties = new Map([
    ['LITE_TEACHER_ACCESS_TOKEN', 'teacher-test-token'],
    ['TEACHER_OPENAI_API_KEY', 'sk-synthetic-test-key-do-not-display']
  ]);
  const context = vm.createContext({
    PropertiesService:{ getScriptProperties:() => ({ getProperty:key => properties.get(key) || null }) },
    Utilities:{ getUuid:() => 'synthetic-draft-request' },
    UrlFetchApp:{ fetch(url, request) {
      calls += 1;
      lastRequest = { url, ...request, payload:JSON.parse(request.payload) };
      if (options.throwTransport) throw new Error('sk-synthetic-test-key-do-not-display request payload');
      return {
        getResponseCode:() => options.status || 200,
        getContentText:() => options.raw || JSON.stringify(options.data || { status:'completed', output:[{
          type:'message', content:[{ type:'output_text', text:JSON.stringify(options.draft || fixture) }]
        }] })
      };
    } }
  });
  ['SetupService.js', 'EngineClient.js', 'Code.js', 'AssessmentDraftService.js'].forEach(file => {
    vm.runInContext(fs.readFileSync(path.join(root, 'gas-lite', file), 'utf8'), context, {filename:file});
  });
  context.isLiteApiVerified_ = () => options.verified !== false;
  context.safeReserveLiteModelCall_ = () => { reservations += 1; return {allowed:options.budget !== false}; };
  return {context, properties, calls:() => calls, request:() => lastRequest, reservations:() => reservations};
}
function generate(h, payload = input, token = 'teacher-test-token') {
  return h.context.generateLiteAssessmentDraft(token, payload);
}

test('only authenticated teacher with a verified key can invoke the paid provider', () => {
  const h = harness();
  assert.throws(() => generate(h, input, 'student-token'), /교사용/);
  assert.equal(h.calls(), 0);
  assert.equal(h.reservations(), 0);
  const unverified = harness({verified:false});
  assert.throws(() => generate(unverified), /연결 확인/);
  assert.equal(unverified.calls(), 0);
  h.properties.delete('TEACHER_OPENAI_API_KEY');
  assert.throws(() => generate(h), /연결 확인/);
});

test('goal OR standard works without material, but code alone and exploration cannot generate', () => {
  for (const payload of [input, {activityMode:'evaluation', achievementStandard:'글의 사실과 의견을 구분한다.'}]) {
    assert.equal(generate(harness(), payload).draft.rubricScheme, 'four_levels');
  }
  const h = harness();
  assert.throws(() => generate(h, {activityMode:'evaluation', achievementStandardCode:'[4국02-04]'}), /목표 또는 성취기준/);
  assert.throws(() => generate(h, {...input, activityMode:'exploration'}), /평가 모드/);
  assert.throws(() => generate(h, {...input, lessonGoal:'가'.repeat(501)}), /500자/);
  assert.equal(h.calls(), 0);
});

test('request allowlist excludes student data, tokens and participation code; material is bounded', () => {
  const h = harness();
  generate(h, {...input, joinCode:'123456', teacherAccessToken:'private', apiKey:'secret',
    studentConversations:['private student'], materialText:'가'.repeat(9000)});
  const req = h.request();
  assert.equal(req.url, 'https://api.openai.com/v1/responses');
  assert.equal(req.payload.store, false);
  assert.equal(req.payload.text.format.strict, true);
  assert.equal(req.payload.text.format.schema.additionalProperties, false);
  const sent = JSON.parse(req.payload.input);
  assert.equal(sent.materialExcerpt.length, 8000);
  assert.equal(sent.materialExcerptTruncated, true);
  ['joinCode','teacherAccessToken','apiKey','studentConversations'].forEach(key => assert.equal(sent[key], undefined));
  assert.doesNotMatch(req.payload.input, /private|secret|123456/);
});

test('returns all four levels without saving settings or modifying the supplied input', () => {
  const h = harness();
  h.context.saveLiteTeacherSettings_ = () => assert.fail('must not save the draft');
  h.context.getLiteSpreadsheet_ = () => assert.fail('must not read student records');
  const original = JSON.stringify(input);
  assert.deepEqual(JSON.parse(JSON.stringify(generate(h).draft)), {rubricScheme:'four_levels', ...fixture});
  assert.equal(JSON.stringify(input), original);
  assert.equal(h.calls(), 1);
  assert.equal(h.reservations(), 1);
});

test('incomplete, refusal, empty or malformed JSON responses never become a draft', () => {
  const responses = [
    {status:'incomplete',output_text:JSON.stringify(fixture)},
    {status:'completed',output:[{content:[{type:'refusal',refusal:'No'}]}]},
    {status:'completed',output_text:'not json'},
    {status:'completed',output_text:'null'},
    {status:'completed',output_text:'[]'}
  ];
  responses.forEach(data => assert.throws(() => generate(harness({data})), /AI/));
  assert.throws(() => generate(harness({raw:'not-json'})), /AI 응답/);
});

test('all fields must be nonempty bounded strings; incomplete and extra fields are rejected', () => {
  const invalid = [
    {...fixture,rubricGood:''}, {...fixture,rubricMeet:123},
    {...fixture,rubricHigh:'가'.repeat(1001)}, {...fixture,lessonGoal:'changed'},
    Object.fromEntries(Object.entries(fixture).filter(([key]) => key !== 'evidenceDescription')),
    {...fixture,rubricGood:fixture.rubricHigh}
  ];
  invalid.forEach(draft => assert.throws(() => generate(harness({draft})), /AI/));
});

test('budget, HTTP and network failures expose no key or raw provider body and do not auto retry', () => {
  const blocked = harness({budget:false});
  assert.throws(() => generate(blocked), /한도/);
  assert.equal(blocked.calls(), 0);
  for (const options of [{status:401}, {status:429}, {status:500}, {throwTransport:true}]) {
    const h = harness({...options,raw:'sk-synthetic-test-key-do-not-display'});
    assert.throws(() => generate(h), error => !/sk-|request payload/.test(error.message));
    assert.equal(h.calls(), 1);
  }
});
