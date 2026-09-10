import assert from 'node:assert/strict';

import {
  PreflightConfigurationError,
  classifyLitePreflightRedirect,
  classifyLitePreflightStatus,
  formatLitePreflightReport,
  mainLiteDeploymentPreflight,
  normalizeLitePreflightBaseUrl,
  probeLitePreflightEndpoint,
  readLitePreflightConfig,
  resolveLitePreflightEndpoint,
  runLiteDeploymentPreflight,
} from './check-lite-deployment-preflight.mjs';

const BASE_URL = 'https://deployment.example.test';
const ACCESS_KEY = 'secret-access-key-that-must-never-be-printed-0001';
const DEPLOYMENT_ID = 'LD-preflighttestdeployment0001';
const SECRET_BODY = 'student-private-answer-and-server-secret';

function descriptor(overrides = {}) {
  return {
    ok: true,
    schemaVersion: 1,
    policyVersion: 'questioning-dialogue-v2-lite-adapter-v3',
    engineFamily: 'questioning-dialogue-v2',
    sharedWithWebChatbot: true,
    storesConversation: false,
    acceptsTeacherApiKey: false,
    ...overrides,
  };
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function config(overrides = {}) {
  return {
    baseUrl: BASE_URL,
    timeoutMs: 500,
    accessKey: '',
    deploymentId: '',
    ...overrides,
  };
}

function expectConfigError(fn) {
  assert.throws(fn, PreflightConfigurationError);
}

function makeHealthyFetch(seen, options = {}) {
  return async (url, init) => {
    seen.push({ url, init });
    const path = new URL(url).pathname;
    if (path === '/api/health') return jsonResponse({ ok: true, hidden: SECRET_BODY });
    if (path === '/questioning-chatbot') return new Response(`<html>${SECRET_BODY}</html>`, { status: 200 });
    if (path === '/api/lite-engine/plan') {
      if (init.headers['x-lite-engine-key']) {
        return jsonResponse(options.authenticatedDescriptor || descriptor(), options.authenticatedStatus || 200);
      }
      return jsonResponse({ error: SECRET_BODY }, options.publicEngineStatus || 401, options.publicHeaders);
    }
    throw new Error('unexpected route');
  };
}

function assertSafeRequestShape(call) {
  assert.equal(call.init.method, 'GET');
  assert.equal(call.init.redirect, 'manual');
  assert.equal(call.init.cache, 'no-store');
  assert.equal(Object.hasOwn(call.init, 'body'), false);
}

async function testUrlValidation() {
  assert.equal(normalizeLitePreflightBaseUrl('https://example.test/'), 'https://example.test');
  assert.equal(normalizeLitePreflightBaseUrl('http://localhost:3000/'), 'http://localhost:3000');
  assert.equal(normalizeLitePreflightBaseUrl('http://127.0.0.1:3000'), 'http://127.0.0.1:3000');
  assert.equal(normalizeLitePreflightBaseUrl('http://[::1]:3000/'), 'http://[::1]:3000');

  for (const invalid of [
    '', 'example.test', 'ftp://example.test', 'file:///tmp/test', 'http://example.test',
    'http://localhost.evil.test', 'https://user:pass@example.test', 'https://example.test/base',
    'https://example.test//', 'https://example.test?', 'https://example.test#fragment',
  ]) {
    expectConfigError(() => normalizeLitePreflightBaseUrl(invalid));
  }
  assert.equal(
    resolveLitePreflightEndpoint(BASE_URL, '/api/lite-engine/plan'),
    `${BASE_URL}/api/lite-engine/plan`,
  );
  expectConfigError(() => resolveLitePreflightEndpoint(BASE_URL, '//attacker.example/plan'));
  expectConfigError(() => resolveLitePreflightEndpoint(BASE_URL, 'https://attacker.example/plan'));

  expectConfigError(() => readLitePreflightConfig({}));
  expectConfigError(() => readLitePreflightConfig({ LITE_ENGINE_TEST_BASE_URL: BASE_URL, LITE_ENGINE_TEST_TIMEOUT_MS: '99' }));
  expectConfigError(() => readLitePreflightConfig({ LITE_ENGINE_TEST_BASE_URL: BASE_URL, LITE_ENGINE_TEST_ACCESS_KEY: 'short' }));
}

async function testStatusClassification() {
  assert.equal(classifyLitePreflightStatus(500), 'server_error');
  assert.equal(classifyLitePreflightStatus(404), 'route_missing');
  assert.equal(classifyLitePreflightStatus(503), 'service_unavailable');
  assert.equal(classifyLitePreflightStatus(401), 'authentication_required');
  assert.equal(classifyLitePreflightStatus(401, 'authenticated'), 'authentication_rejected');
  assert.equal(
    classifyLitePreflightRedirect('https://vercel.com/sso-api?next=DO_NOT_PRINT', `${BASE_URL}/api/health`),
    'deployment_auth_required',
  );
  assert.equal(
    classifyLitePreflightRedirect('https://other.example/login?token=DO_NOT_PRINT', `${BASE_URL}/api/health`),
    'redirect_blocked',
  );
}

async function testNoKeyIsSafeAndIncomplete() {
  const seen = [];
  const report = await runLiteDeploymentPreflight(config(), { fetchImpl: makeHealthyFetch(seen) });
  assert.equal(report.state, 'incomplete');
  assert.equal(report.exitCode, 2);
  assert.equal(report.authentication, 'not_checked');
  assert.equal(seen.length, 3);
  for (const call of seen) {
    assertSafeRequestShape(call);
    assert.equal(call.init.headers['x-lite-engine-key'], undefined);
    assert.equal(call.init.headers['x-lite-deployment-id'], undefined);
    assert.equal(call.init.headers.authorization, undefined);
    assert.equal(call.init.headers.cookie, undefined);
  }
  const visible = `${formatLitePreflightReport(report)}\n${JSON.stringify(report)}`;
  assert.doesNotMatch(visible, new RegExp(SECRET_BODY));
  assert.match(visible, /INCOMPLETE engine authentication/);
}

async function testKeyOnlyReachesExactPlanGet() {
  const seen = [];
  const report = await runLiteDeploymentPreflight(config({
    accessKey: ACCESS_KEY,
    deploymentId: DEPLOYMENT_ID,
  }), { fetchImpl: makeHealthyFetch(seen) });
  assert.equal(report.state, 'ready');
  assert.equal(report.exitCode, 0);
  assert.equal(report.authentication, 'verified');
  assert.equal(seen.length, 4);
  for (const call of seen) assertSafeRequestShape(call);
  const keyed = seen.filter((call) => call.init.headers['x-lite-engine-key']);
  assert.equal(keyed.length, 1);
  assert.equal(new URL(keyed[0].url).origin, BASE_URL);
  assert.equal(new URL(keyed[0].url).pathname, '/api/lite-engine/plan');
  assert.equal(keyed[0].init.headers['x-lite-engine-key'], ACCESS_KEY);
  assert.equal(keyed[0].init.headers['x-lite-deployment-id'], DEPLOYMENT_ID);
  for (const call of seen.slice(0, 3)) {
    assert.equal(call.init.headers['x-lite-engine-key'], undefined);
    assert.equal(call.init.headers['x-lite-deployment-id'], undefined);
  }
  const visible = `${formatLitePreflightReport(report)}\n${JSON.stringify(report)}`;
  assert.doesNotMatch(visible, new RegExp(ACCESS_KEY));
  assert.doesNotMatch(visible, new RegExp(SECRET_BODY));
}

async function testRedirectDoesNotLeakOrRetryWithKey() {
  const seen = [];
  const location = 'https://vercel.com/sso-api?next=student-private-value';
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    const path = new URL(url).pathname;
    if (path === '/api/lite-engine/plan') {
      return new Response(null, { status: 302, headers: { location } });
    }
    return new Response('ok', { status: 200 });
  };
  const report = await runLiteDeploymentPreflight(config({
    accessKey: ACCESS_KEY,
    deploymentId: DEPLOYMENT_ID,
  }), { fetchImpl });
  assert.equal(report.state, 'failed');
  assert.equal(seen.length, 3);
  assert.equal(report.checks.find((item) => item.id === 'enginePublic').classification, 'deployment_auth_required');
  assert.ok(seen.every((call) => !call.init.headers['x-lite-engine-key']));
  const visible = `${formatLitePreflightReport(report)}\n${JSON.stringify(report)}`;
  assert.doesNotMatch(visible, /student-private-value|sso-api|vercel\.com/);
}

async function testStrictDescriptorAndBodyLimit() {
  for (const invalidDescriptor of [
    descriptor({ schemaVersion: '1' }),
    descriptor({ acceptsTeacherApiKey: true }),
    descriptor({ storesConversation: true }),
  ]) {
    const result = await probeLitePreflightEndpoint(config({
      accessKey: ACCESS_KEY,
      deploymentId: DEPLOYMENT_ID,
    }), {
      id: 'engineAuthenticated',
      label: 'engine',
      path: '/api/lite-engine/plan',
      authenticated: true,
    }, { fetchImpl: async () => jsonResponse(invalidDescriptor) });
    assert.equal(result.ok, false);
    assert.equal(result.classification, 'invalid_descriptor');
  }

  const oversized = descriptor({ ignoredPadding: 'x'.repeat(20_000) });
  const oversizedResult = await probeLitePreflightEndpoint(config({
    accessKey: ACCESS_KEY,
    deploymentId: DEPLOYMENT_ID,
  }), {
    id: 'engineAuthenticated', label: 'engine', path: '/api/lite-engine/plan', authenticated: true,
  }, { fetchImpl: async () => jsonResponse(oversized) });
  assert.equal(oversizedResult.classification, 'invalid_descriptor');
}

async function testSlowBodyUsesWholeRequestDeadline() {
  const fetchImpl = async (_url, init) => new Response(new ReadableStream({
    start(controller) {
      const timer = setTimeout(() => {
        controller.enqueue(new TextEncoder().encode(JSON.stringify(descriptor())));
        controller.close();
      }, 250);
      init.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        controller.error(new DOMException('aborted', 'AbortError'));
      }, { once: true });
    },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  const startedAt = Date.now();
  const result = await probeLitePreflightEndpoint(config({
    timeoutMs: 20,
    accessKey: ACCESS_KEY,
    deploymentId: DEPLOYMENT_ID,
  }), {
    id: 'engineAuthenticated', label: 'engine', path: '/api/lite-engine/plan', authenticated: true,
  }, { fetchImpl });
  assert.equal(result.classification, 'timeout');
  assert.ok(Date.now() - startedAt < 200, 'body timeout should not wait for the stalled body');
}

async function testMainConfigurationFailureDoesNotFetch() {
  const logs = [];
  let fetched = false;
  const exitCode = await mainLiteDeploymentPreflight({}, {
    log: (value) => logs.push(value),
    error: (value) => logs.push(value),
  }, { fetchImpl: async () => { fetched = true; throw new Error('must not run'); } });
  assert.equal(exitCode, 1);
  assert.equal(fetched, false);
  assert.ok(logs.every((line) => !line.includes(ACCESS_KEY) && !line.includes(SECRET_BODY)));
}

await testUrlValidation();
await testStatusClassification();
await testNoKeyIsSafeAndIncomplete();
await testKeyOnlyReachesExactPlanGet();
await testRedirectDoesNotLeakOrRetryWithKey();
await testStrictDescriptorAndBodyLimit();
await testSlowBodyUsesWholeRequestDeadline();
await testMainConfigurationFailureDoesNotFetch();

console.log('lite deployment preflight unit tests: PASS');
