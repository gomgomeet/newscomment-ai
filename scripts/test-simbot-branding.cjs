/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

const component = read('components', 'questioning', 'student-question-helper-chatbot.tsx');
const code = read('gas-lite', 'Code.js');
const setup = read('gas-lite', 'SetupService.js');
const student = read('gas-lite', 'Student.html');
const studentClient = read('gas-lite', 'StudentClient.html');
const gasStyleSources = [
  code,
  read('gas-lite', 'StudentStyles.html'),
  read('gas-lite', 'TeacherDashboard.html'),
  read('gas-lite', 'TeacherSetup.html'),
];

assert.match(component, /import localFont from ["']next\/font\/local["']/);
assert.match(component, /src:\s*["']\.\.\/\.\.\/public\/fonts\/pretendard\/PretendardVariable\.woff2["']/);
assert.match(component, /chatbotFont\.className/);

assert.match(code, /\.createMenu\(['"]simbot['"]\)/);
assert.match(code, /\.setTitle\(['"]simbot['"]\)/);
assert.match(setup, /appName:\s*liteText_\(settings\.appName, 40\) \|\| ['"]simbot['"]/);
assert.match(student, /<h1 id="app-name">simbot<\/h1>/);
assert.match(studentClient, /lesson\.appName \|\| ['"]simbot['"]/);

const pretendardUrl = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2';
gasStyleSources.forEach((source) => {
  assert.ok(source.includes(pretendardUrl));
  assert.match(source, /font-family:\s*["']Pretendard Variable["']/);
});

const font = fs.readFileSync(path.join(root, 'public', 'fonts', 'pretendard', 'PretendardVariable.woff2'));
assert.equal(font.subarray(0, 4).toString('ascii'), 'wOF2');
assert.equal(
  createHash('sha256').update(font).digest('hex'),
  '9599f12fd42fc0bce1cd50b47a0c022e108d7aa64dd0d1bb0ed44f3282d900b4'
);

console.log('simbot branding and Pretendard checks: all passed');
