import { pathToFileURL } from 'node:url';

const DEFAULT_TIMEOUT_MS = 8_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 30_000;
const MAX_DESCRIPTOR_BYTES = 16 * 1024;
const PREFLIGHT_DEPLOYMENT_ID = 'LD-preflightcheck000000000001';
const ENGINE_PLAN_PATH = '/api/lite-engine/plan';

const PUBLIC_CHECKS = [
  { id: 'health', label: 'health', path: '/api/health', expectedStatus: 200 },
  { id: 'chat', label: 'questioning-chatbot', path: '/questioning-chatbot', expectedStatus: 200 },
  { id: 'enginePublic', label: 'lite-engine public gate', path: ENGINE_PLAN_PATH, expectedStatus: 401 },
];

export class PreflightConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PreflightConfigurationError';
  }
}

class PreflightTimeoutError extends Error {
  constructor() {
    super('request timed out');
    this.name = 'PreflightTimeoutError';
  }
}

function isLocalHostname(hostname) {
  const normalized = String(hostname || '').toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' ||
    normalized === '::1' || normalized === '[::1]';
}

export function normalizeLitePreflightBaseUrl(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) {
    throw new PreflightConfigurationError('LITE_ENGINE_TEST_BASE_URL을 명시해 주세요.');
  }
  // URL.search/hash는 빈 구분자(`?`, `#`)를 보존하지 않으므로 원문에서도 차단한다.
  if (raw.includes('?') || raw.includes('#')) {
    throw new PreflightConfigurationError('기준 URL에는 query 또는 fragment를 넣을 수 없습니다.');
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new PreflightConfigurationError('LITE_ENGINE_TEST_BASE_URL 형식을 확인해 주세요.');
  }
  if (parsed.username || parsed.password) {
    throw new PreflightConfigurationError('기준 URL에는 사용자 정보를 넣을 수 없습니다.');
  }
  if (parsed.pathname !== '/') {
    throw new PreflightConfigurationError('기준 URL에는 경로를 넣지 말고 origin만 입력해 주세요.');
  }
  if (parsed.protocol === 'http:') {
    if (!isLocalHostname(parsed.hostname)) {
      throw new PreflightConfigurationError('원격 기준 URL은 https만 사용할 수 있습니다.');
    }
  } else if (parsed.protocol !== 'https:') {
    throw new PreflightConfigurationError('기준 URL은 https 또는 localhost의 http여야 합니다.');
  }
  return parsed.origin;
}

function parseTimeout(rawValue) {
  if (rawValue == null || String(rawValue).trim() === '') return DEFAULT_TIMEOUT_MS;
  const raw = String(rawValue).trim();
  if (!/^\d+$/.test(raw)) {
    throw new PreflightConfigurationError('LITE_ENGINE_TEST_TIMEOUT_MS는 정수 밀리초여야 합니다.');
  }
  const timeoutMs = Number(raw);
  if (timeoutMs < MIN_TIMEOUT_MS || timeoutMs > MAX_TIMEOUT_MS) {
    throw new PreflightConfigurationError(
      `LITE_ENGINE_TEST_TIMEOUT_MS는 ${MIN_TIMEOUT_MS}~${MAX_TIMEOUT_MS} 범위여야 합니다.`,
    );
  }
  return timeoutMs;
}

function parseAccessKey(rawValue) {
  const accessKey = String(rawValue || '').trim();
  if (!accessKey) return '';
  if (!/^\S{32,240}$/.test(accessKey)) {
    throw new PreflightConfigurationError('LITE_ENGINE_TEST_ACCESS_KEY 형식을 확인해 주세요.');
  }
  return accessKey;
}

function parseDeploymentId(rawValue, hasAccessKey) {
  if (!hasAccessKey) return '';
  const deploymentId = String(rawValue || PREFLIGHT_DEPLOYMENT_ID).trim();
  if (!/^LD-[A-Za-z0-9_-]{16,64}$/.test(deploymentId)) {
    throw new PreflightConfigurationError('LITE_ENGINE_TEST_DEPLOYMENT_ID 형식을 확인해 주세요.');
  }
  return deploymentId;
}

export function readLitePreflightConfig(env = process.env) {
  const baseUrl = normalizeLitePreflightBaseUrl(env.LITE_ENGINE_TEST_BASE_URL);
  const accessKey = parseAccessKey(env.LITE_ENGINE_TEST_ACCESS_KEY);
  return {
    baseUrl,
    timeoutMs: parseTimeout(env.LITE_ENGINE_TEST_TIMEOUT_MS),
    accessKey,
    deploymentId: parseDeploymentId(env.LITE_ENGINE_TEST_DEPLOYMENT_ID, Boolean(accessKey)),
  };
}

export function resolveLitePreflightEndpoint(baseUrl, pathname) {
  if (!/^\/[A-Za-z0-9/_-]*$/.test(String(pathname || ''))) {
    throw new PreflightConfigurationError('점검 경로 형식을 확인해 주세요.');
  }
  const target = new URL(pathname, `${baseUrl}/`);
  if (target.origin !== baseUrl) {
    throw new PreflightConfigurationError('점검 경로가 기준 URL과 같은 origin이 아닙니다.');
  }
  return target.href;
}

export function classifyLitePreflightStatus(status, context = 'public') {
  if (status >= 300 && status < 400) return 'redirect_blocked';
  if (status === 404) return 'route_missing';
  if (status === 500) return 'server_error';
  if (status === 503) return 'service_unavailable';
  if (status === 401) return context === 'authenticated' ? 'authentication_rejected' : 'authentication_required';
  if (status >= 200 && status < 300) return 'reachable';
  return `http_${Number(status) || 'unknown'}`;
}

export function classifyLitePreflightRedirect(location, requestUrl) {
  try {
    const target = new URL(String(location || ''), requestUrl);
    if (target.hostname.toLowerCase() === 'vercel.com' && /^\/sso-api(?:\/|$)/.test(target.pathname)) {
      return 'deployment_auth_required';
    }
  } catch {
    // Location 값은 출력하지 않고 일반적인 차단으로만 분류한다.
  }
  return 'redirect_blocked';
}

function publicStatusIsExpected(check, status) {
  return Number(status) === Number(check.expectedStatus);
}

async function cancelUnusedBody(response) {
  try {
    if (response && response.body && typeof response.body.cancel === 'function') {
      await response.body.cancel();
    }
  } catch {
    // 점검 결과와 무관하며 응답 본문은 출력하지 않는다.
  }
}

async function readBoundedJson(response, maxBytes) {
  const stream = response && response.body;
  if (!stream || typeof stream.getReader !== 'function') return null;
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(chunk, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    if (error && error.name === 'AbortError') throw error;
    return null;
  } finally {
    try { reader.releaseLock(); } catch { /* no-op */ }
  }
}

async function validateEngineDescriptor(response) {
  const body = await readBoundedJson(response, MAX_DESCRIPTOR_BYTES);
  return Boolean(
    body && body.ok === true && body.schemaVersion === 1 &&
    body.engineFamily === 'questioning-dialogue-v2' && body.sharedWithWebChatbot === true &&
    body.acceptsTeacherApiKey === false && body.storesConversation === false &&
    typeof body.policyVersion === 'string' && body.policyVersion.trim(),
  );
}

async function fetchAndInspectWithTimeout(fetchImpl, url, init, timeoutMs, inspectResponse) {
  const controller = new AbortController();
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new PreflightTimeoutError());
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(async () => {
        const response = await fetchImpl(url, { ...init, signal: controller.signal });
        return inspectResponse(response);
      }),
      timeout,
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function probeLitePreflightEndpoint(config, check, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new PreflightConfigurationError('이 Node.js 실행환경에서 fetch를 사용할 수 없습니다.');
  }
  const authenticated = Boolean(check.authenticated);
  if (authenticated && check.path !== ENGINE_PLAN_PATH) {
    throw new PreflightConfigurationError('인증 헤더는 중앙 엔진 plan 점검에만 보낼 수 있습니다.');
  }
  const url = resolveLitePreflightEndpoint(config.baseUrl, check.path);
  const headers = { accept: check.path === ENGINE_PLAN_PATH ? 'application/json' : 'text/html,application/json;q=0.9' };
  if (authenticated) {
    if (!config.accessKey || !config.deploymentId) {
      throw new PreflightConfigurationError('인증 점검에 필요한 설정을 확인해 주세요.');
    }
    headers['x-lite-engine-key'] = config.accessKey;
    headers['x-lite-deployment-id'] = config.deploymentId;
  }

  const startedAt = Date.now();
  try {
    const inspected = await fetchAndInspectWithTimeout(fetchImpl, url, {
      method: 'GET',
      headers,
      redirect: 'manual',
      cache: 'no-store',
    }, config.timeoutMs, async (response) => {
      const status = Number(response && response.status || 0);
      let classification = classifyLitePreflightStatus(
        status,
        authenticated ? 'authenticated' : 'public',
      );
      if (status >= 300 && status < 400) {
        let location = '';
        try { location = response.headers && response.headers.get('location'); } catch { /* no-op */ }
        classification = classifyLitePreflightRedirect(location, url);
      }
      let descriptorValid = null;
      if (authenticated && status >= 200 && status < 300) {
        descriptorValid = await validateEngineDescriptor(response);
      } else {
        await cancelUnusedBody(response);
      }
      return { status, classification, descriptorValid };
    });
    const { status, classification, descriptorValid } = inspected;
    const expected = authenticated
      ? status === 200 && descriptorValid === true
      : publicStatusIsExpected(check, status);
    return {
      id: check.id,
      label: check.label,
      path: check.path,
      authenticated,
      status,
      classification: descriptorValid === false ? 'invalid_descriptor' : classification,
      ok: expected,
      durationMs: Math.max(0, Date.now() - startedAt),
    };
  } catch (error) {
    const timedOut = error && (error.name === 'PreflightTimeoutError' || error.name === 'AbortError');
    return {
      id: check.id,
      label: check.label,
      path: check.path,
      authenticated,
      status: null,
      classification: timedOut ? 'timeout' : 'network_error',
      ok: false,
      durationMs: Math.max(0, Date.now() - startedAt),
    };
  }
}

export async function runLiteDeploymentPreflight(config, options = {}) {
  const publicResults = await Promise.all(
    PUBLIC_CHECKS.map((check) => probeLitePreflightEndpoint(config, check, options)),
  );
  const publicEngine = publicResults.find((result) => result.id === 'enginePublic');
  let authenticatedEngine = null;
  if (config.accessKey && publicEngine && publicEngine.status === 401) {
    authenticatedEngine = await probeLitePreflightEndpoint(config, {
      id: 'engineAuthenticated',
      label: 'lite-engine authenticated GET',
      path: ENGINE_PLAN_PATH,
      authenticated: true,
    }, options);
  }

  const publicReady = publicResults.every((result) => result.ok);
  let state = 'failed';
  let exitCode = 1;
  if (publicReady && !config.accessKey) {
    state = 'incomplete';
    exitCode = 2;
  } else if (publicReady && authenticatedEngine && authenticatedEngine.ok) {
    state = 'ready';
    exitCode = 0;
  }
  return {
    baseUrl: config.baseUrl,
    state,
    exitCode,
    authentication: !config.accessKey
      ? 'not_checked'
      : authenticatedEngine && authenticatedEngine.ok
        ? 'verified'
        : 'failed',
    checks: authenticatedEngine ? [...publicResults, authenticatedEngine] : publicResults,
  };
}

function statusLabel(result) {
  return result.status == null ? '-' : String(result.status);
}

export function formatLitePreflightReport(report) {
  const lines = [
    `Lite deployment preflight: ${report.baseUrl}`,
  ];
  for (const result of report.checks) {
    lines.push(
      `${result.ok ? 'PASS' : 'FAIL'} ${result.path} HTTP ${statusLabel(result)} ${result.classification}`,
    );
  }
  if (report.authentication === 'not_checked') {
    lines.push('INCOMPLETE engine authentication: access key was not provided');
  } else if (report.authentication === 'verified') {
    lines.push('PASS engine authentication: authenticated descriptor verified');
  } else {
    lines.push('FAIL engine authentication: authenticated descriptor was not verified');
  }
  lines.push(`RESULT ${report.state.toUpperCase()}`);
  return lines.join('\n');
}

export async function mainLiteDeploymentPreflight(env = process.env, io = console, options = {}) {
  try {
    const config = readLitePreflightConfig(env);
    const report = await runLiteDeploymentPreflight(config, options);
    io.log(formatLitePreflightReport(report));
    return report.exitCode;
  } catch (error) {
    const message = error instanceof PreflightConfigurationError
      ? error.message
      : '배포 사전점검을 시작하지 못했습니다.';
    io.error(`Lite deployment preflight configuration error: ${message}`);
    return 1;
  }
}

const directEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (directEntry) {
  process.exitCode = await mainLiteDeploymentPreflight();
}
