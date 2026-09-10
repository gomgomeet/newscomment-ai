/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'tmp', 'gas-lite-distribution-test');
const testKey = 'local-distribution-test-key-1234567890';

try {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'build-gas-lite-distribution.mjs')], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      LITE_ENGINE_ACCESS_KEY: testKey,
      LITE_ENGINE_DISTRIBUTION_DIR: outputDir,
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.doesNotMatch(result.stdout, new RegExp(testKey));

  const engineSource = fs.readFileSync(path.join(outputDir, 'EngineClient.js'), 'utf8');
  const notice = fs.readFileSync(path.join(outputDir, 'DISTRIBUTION-NOTICE.txt'), 'utf8');
  assert.match(engineSource, /https:\/\/newscomment-ai\.vercel\.app\/api\/lite-engine\/plan/);
  assert.ok(engineSource.includes(testKey));
  assert.doesNotMatch(engineSource, /LITE_CENTRAL_ENGINE_ACCESS_KEY_ = ['"]['"]/);
  assert.doesNotMatch(notice, new RegExp(testKey));
  assert.match(notice, /Access-key fingerprint:/);

  console.log('gas-lite distribution checks: all passed');
} finally {
  fs.rmSync(outputDir, { recursive: true, force: true });
}
