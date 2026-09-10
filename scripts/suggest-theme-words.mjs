#!/usr/bin/env node
/**
 * 주제어 후보 모으기 — 아이들이 물었는데 챗봇이 "글로 돌아오세요"라고 돌려보낸 질문에서
 * 지문에 없는 낱말을 뽑아, 다음 수업에 넣을 주제어 후보로 보여 준다.
 * (교사 입력 효율화 제안 '갈래 ㄷ'. 코드 배포 없이 오늘 쓸 수 있다.)
 *
 *   node scripts/suggest-theme-words.mjs --demo
 *   node scripts/suggest-theme-words.mjs --turns=TURNS.csv
 *   node scripts/suggest-theme-words.mjs --turns=TURNS.csv --material=evals/gas/fixtures/내지문.json
 *
 * TURNS.csv 는 시트의 TURNS 탭을 '파일 → 다운로드 → CSV'로 받은 것이다(머리글 포함).
 * 판정에 쓰는 낱말 규칙은 gas/Signals.js 것을 그대로 불러 쓴다 — 챗봇과 같은 눈으로 본다.
 */
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGasContext, installMaterial } from './lib/fake-apps-script.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const arg = (name) => { const hit = process.argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : ''; };
const demo = process.argv.includes('--demo');
const turnsPath = arg('turns');
const fixture = JSON.parse(readFileSync(resolve(root, arg('material') || 'evals/gas/fixtures/material-plastic-e5.json'), 'utf8'));

if (!demo && !turnsPath) {
  console.error('TURNS 파일을 주거나(--turns=TURNS.csv) --demo 로 예시를 보세요.');
  process.exit(2);
}

// 돌려보낸 답의 aiStatus — 규칙이 먼저 막은 것과 모델이 "글과 상관없다"고 본 것.
const REDIRECTED = new Set(['compose:skipped_policy', 'compose:general_off_topic']);
// 아이들이 자주 쓰지만 주제어가 될 수 없는 말.
const NOISE = new Set(['진짜','정말','그거','이거','저거','그건','근데','그런','생각','우리','선생님','하나','한번','조금','그래서','그러면','아니','맞아','때문','때문에','그리고','하지만','오늘','내일','어제','지금','너무','완전','제일','가장','다른','무슨','어떤','얼마나','사람','사람들','이유','방법','자기','자신','그때','다음','처음','마지막']);
// 움직씨·그림씨의 활용형은 주제어가 아니다 — 이름씨만 남긴다(품사 분석기 없이 어미로 거른다).
const VERB_ENDING = /(요|다|까|죠|지만|는데|니까|라서|도록|으며|며|서|고|면|게|지)$/;
const PARTICLE_TAIL = /^(.)(도|만|은|는|이|가|을|를|와|과|의|로|에)$/;   // 한 글자 + 조사 — 너무 짧다
/** 이름씨처럼 보이는가. 거르지 못한 것은 교사가 목록에서 빼면 된다. */
function looksLikeNoun(w) {
  if (PARTICLE_TAIL.test(w)) return false;
  if (w.length <= 3 && VERB_ENDING.test(w)) return false;
  if (w.length > 3 && /(요|다|까|죠|지만|는데|니까|라서|도록)$/.test(w)) return false;
  if (w.length === 2 && /(는|은)$/.test(w)) return false;              // 쓰는·없는 같은 매김꼴
  return true;
}

const { ctx, run, properties, aiResponses } = createGasContext(join(root, 'gas'), { id: 'theme-words' });
const material = installMaterial({ ctx, run }, fixture.material, fixture.vocabulary || []);
const settings = run('phaseSettingsFor_(getActiveMaterial_())');

/** 챗봇이 '글의 말'로 세는 것 — 지문 낱말 + 승인 낱말. 여기 없는 말이 주제어 후보다. */
ctx.themeSettings = settings;
const lessonWords = new Set(run('signalLessonWords_(themeSettings)').map((w) => String(w)));
const normalize = (w) => { ctx.themeWord = w; return run('signalNormalizeWord_(themeWord)'); };
const contentWords = (text) => { ctx.themeText = text; return run('signalContentWords_(themeText)'); };
const isLessonWord = (w) => lessonWords.has(w) || [...lessonWords].some((lw) => lw && (lw.includes(w) || w.includes(lw)) && Math.min(lw.length, w.length) >= 2);

// ---------- 턴 모으기 ----------
function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = (rows.shift() || []).map((h) => h.trim());
  return rows.filter((r) => r.some((v) => String(v).trim()))
    .map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

function demoTurns() {
  run(`setConfigValue_('AI_ENABLED','TRUE'); setConfigValue_('AI_MODEL','demo-model');`);
  properties.set('OPENAI_API_KEY', 'demo-only');
  const asked = [
    ['5-3', '종이 빨대는 왜 쓰는 거예요?'],
    ['5-7', '텀블러 쓰면 진짜 도움 돼요?'],
    ['5-11', '비닐봉지는 왜 잘 안 썩어요?'],
    ['5-14', '미세플라스틱이 몸에 들어와요?'],
    ['5-18', '빨대 없는 컵도 있어요?'],
    ['5-21', '분리수거 잘하면 달라져요?'],
    ['5-24', '바다거북이 빨대 때문에 아프다는데 진짜예요?'],
    ['5-26', '오늘 급식 뭐 나와요?'],
  ];
  for (const [code, message] of asked) {
    // 글의 말이 섞인 질문은 먼저 자료로 답해 보고(첫 응답), 그래도 글 밖이면 상관없다고 본다(다음 응답).
    aiResponses.push({ output_text: JSON.stringify({ related: true, reply: '글에서는 플라스틱 폐기물의 87%가 식품 포장재라고 했어요.', usedEvidenceIds: [] }) });
    for (let k = 0; k < 2; k++) aiResponses.push({ output_text: JSON.stringify({ related: false, reply: '', usedEvidenceIds: [] }) });
    ctx.themeCode = code;
    const boot = run('getBootstrapData({}, themeCode)');
    ctx.themePayload = { sessionId: boot.sessionId, lesson: boot.lesson, message };
    try { run('submitTurn(themePayload)'); } catch (error) { console.error(`  (건너뜀) ${message} — ${error.message}`); }
    aiResponses.length = 0;
  }
  return run(`getRowsAsObjects_('TURNS')`).map((r) => ({ ...r, turnNo: String(r.turnNo) }));
}

const rows = demo ? demoTurns() : parseCsv(readFileSync(resolve(root, turnsPath), 'utf8'));

// ---------- 돌려보낸 답 바로 앞의 학생 질문을 찾는다 ----------
const bySession = new Map();
for (const r of rows) {
  const key = String(r.sessionId || '');
  if (!bySession.has(key)) bySession.set(key, []);
  bySession.get(key).push(r);
}
const redirectedQuestions = [];
for (const list of bySession.values()) {
  list.sort((a, b) => Number(a.turnNo) - Number(b.turnNo));
  list.forEach((r, i) => {
    if (String(r.speaker) !== 'bot' || !REDIRECTED.has(String(r.aiStatus))) return;
    const student = list[i - 1];
    if (!student || String(student.speaker) !== 'student') return;
    if (String(student.isPreview) === 'true') return;                  // 교사 미리보기(99-*)는 뺀다
    // 딴소리(small_talk)로 분류된 것을 빼면 안 된다 — 글 밖 질문은 대개 그렇게 분류되고, 그게 바로 우리가 찾는 것이다.
    redirectedQuestions.push({ studentCode: String(student.studentCode || ''), text: String(student.text || '') });
  });
}

// ---------- 낱말 세기 ----------
const tally = new Map();
for (const q of redirectedQuestions) {
  const seen = new Set();
  for (const raw of contentWords(q.text)) {
    const w = normalize(raw);
    if (w.length < 2 || NOISE.has(w) || /^\d+$/.test(w) || !looksLikeNoun(w) || isLessonWord(w) || seen.has(w)) continue;
    seen.add(w);
    if (!tally.has(w)) tally.set(w, { word: w, students: new Set(), examples: [] });
    const hit = tally.get(w);
    hit.students.add(q.studentCode);
    if (hit.examples.length < 2) hit.examples.push(q.text);
  }
}
const ranked = [...tally.values()]
  .map((t) => ({ word: t.word, students: t.students.size, asked: t.examples.length, example: t.examples[0] }))
  .sort((a, b) => b.students - a.students || a.word.localeCompare(b.word));

// ---------- 보여 주기 ----------
console.log(`\n자료: ${material.title}`);
console.log(`돌려보낸 질문 ${redirectedQuestions.length}개 · 주제어 후보 ${ranked.length}개\n`);
if (!ranked.length) {
  console.log('돌려보낸 질문이 없거나, 나온 낱말이 모두 이미 글의 말입니다. 넣을 것이 없어요.');
  process.exit(0);
}
console.log('물은 사람  낱말        아이들이 이렇게 물었어요');
console.log('─'.repeat(72));
for (const r of ranked) console.log(`   ${String(r.students).padStart(2)}명   ${r.word.padEnd(10)}  "${r.example}"`);
console.log('\n── 교사 화면 "단어 뜻 한꺼번에 넣기"에 그대로 붙여 넣으세요 (탭으로 나뉘어 있습니다) ──');
console.log('뜻은 비어 있으니 학년에 맞게 한 줄씩 채워 주세요.\n');
for (const r of ranked) console.log(`주제어\t${r.word}\t`);
console.log('\n넣고 저장하면 다음 수업부터 이런 질문에 "글에는 안 나오지만…"으로 답합니다.');
console.log('※ 지문은 그대로 두고 낱말만 고쳐 저장하면 학생 대화는 이어집니다.');
