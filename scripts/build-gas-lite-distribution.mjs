import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, 'gas-lite');
const tmpRoot = path.join(root, 'tmp');
const requestedOutput = process.env.LITE_ENGINE_DISTRIBUTION_DIR || path.join(tmpRoot, 'gas-lite-distribution');
const outputDir = path.resolve(requestedOutput);
const accessKey = String(process.env.LITE_ENGINE_ACCESS_KEY || '').trim();
const planUrl = String(
  process.env.LITE_ENGINE_PLAN_URL || 'https://newscomment-ai.vercel.app/api/lite-engine/plan',
).trim();

if (!/^\S{32,240}$/.test(accessKey)) {
  throw new Error('LITE_ENGINE_ACCESS_KEY must contain 32-240 non-whitespace characters.');
}

const parsedUrl = new URL(planUrl);
if (parsedUrl.protocol !== 'https:' || !/\/api\/lite-engine\/plan\/?$/.test(parsedUrl.pathname)) {
  throw new Error('LITE_ENGINE_PLAN_URL must be an HTTPS /api/lite-engine/plan endpoint.');
}

const relativeOutput = path.relative(tmpRoot, outputDir);
if (!relativeOutput || relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput)) {
  throw new Error('LITE_ENGINE_DISTRIBUTION_DIR must stay inside this repository\'s tmp directory.');
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await cp(sourceDir, outputDir, { recursive: true });

const enginePath = path.join(outputDir, 'EngineClient.js');
let engineSource = await readFile(enginePath, 'utf8');
const urlPattern = /const LITE_CENTRAL_ENGINE_URL_ = ['"][^'"]*['"];/;
const keyPattern = /const LITE_CENTRAL_ENGINE_ACCESS_KEY_ = ['"][^'"]*['"];/;
if (!urlPattern.test(engineSource) || !keyPattern.test(engineSource)) {
  throw new Error('EngineClient.js distribution placeholders were not found.');
}
engineSource = engineSource
  .replace(urlPattern, `const LITE_CENTRAL_ENGINE_URL_ = ${JSON.stringify(planUrl)};`)
  .replace(keyPattern, `const LITE_CENTRAL_ENGINE_ACCESS_KEY_ = ${JSON.stringify(accessKey)};`);
await writeFile(enginePath, engineSource, 'utf8');

const fingerprint = createHash('sha256').update(accessKey).digest('hex').slice(0, 12);
await writeFile(
  path.join(outputDir, 'DISTRIBUTION-NOTICE.txt'),
  [
    'Teacher lightweight app distribution bundle',
    `Plan endpoint: ${planUrl}`,
    `Access-key fingerprint: ${fingerprint}`,
    'The access key itself is intentionally not repeated in this notice.',
    'Do not commit or publicly upload this generated directory.',
    '',
  ].join('\n'),
  'utf8',
);

console.log(`Prepared Apps Script distribution at ${path.relative(root, outputDir)}`);
console.log(`Access-key fingerprint: ${fingerprint}`);
