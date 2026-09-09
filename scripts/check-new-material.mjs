#!/usr/bin/env node
/**
 * 새 지문 실증 (작업 순서 문서 11단계 A) — 브라우저·시트 없이 오프라인으로.
 * 가짜 SpreadsheetApp 위에 자료를 넣고 submitTurn()을 대본대로 돌려
 * ① 관련 질문 판정 ② 관리 질문 순서와 간격 ③ 점수·대시보드 집계
 * ④ 자료 밖 질문 두 갈래(글과 이어짐 / 딴소리) ⑤ 지문 교체 시 TURNS_ARCHIVE 를 본다.
 *
 *   node scripts/check-new-material.mjs
 *   node scripts/check-new-material.mjs --material=evals/gas/fixtures/material-plastic-e5.json
 *
 * 이것으로 대신할 수 없는 것: 실제 모델의 말투와 시트 반영. 그건 교사 화면에서 한 번 더 본다.
 */
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGasContext, installMaterial } from './lib/fake-apps-script.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const materialPath = resolve(root, (process.argv.find((a) => a.startsWith('--material=')) || '').slice(11)
  || 'evals/gas/fixtures/material-plastic-e5.json');
const fixture = JSON.parse(readFileSync(materialPath, 'utf8'));

// ---------- 가짜 Apps Script 위에 자료를 올린다 ----------
const { ctx, run, spreadsheet, properties, aiResponses, aiRequests } = createGasContext(join(root, 'gas'), { id: 'sheet-new-material' });

// ---------- 자료를 넣는다 (교사 화면 "3. 교사 자료 입력"과 같은 자리) ----------
const material = installMaterial({ ctx, run }, fixture.material, fixture.vocabulary || []);
run(`setConfigValue_('AI_ENABLED', 'FALSE')`);

// ---------- 도우미 ----------
const results = [];
const record = (name, ok, detail = '') => results.push({ name, ok, detail });
const q = (t) => (String(t).match(/[?？]/g) || []).length;
function start(code) { ctx.nmCode = code; return run(`getBootstrapData({}, nmCode)`); }
function send(boot, message) { ctx.nmPayload = { sessionId: boot.sessionId, lesson: boot.lesson, message }; return run('submitTurn(nmPayload)'); }
function turns(boot) { ctx.nmSid = boot.sessionId; return run('getSessionTurns_(nmSid)'); }
const MED = ctx.PHASE_COMPREHENSION_MEDIUM_PROMPT;
const script = fixture.script;
const opening = [...script.factQuestions, script.vocabularyQuestion];

console.log(`\n자료: ${material.title}`);
console.log(`학년 ${material.gradeCode} · 성취기준 "${material.standard}" ${material.standardCode || ''}`);
ctx.nmSettings = null;
const settings = run('phaseSettingsFor_(getActiveMaterial_())');
const targets = run(`buildStandardTargets(getActiveMaterial_().standard, '')`);
console.log(`끊은 조각(CHUNKS) ${run(`getRowsAsObjects_('CHUNKS').length`)}개 · 승인 낱말 ${run(`getApprovedVocabularyEntries_().length`)}개 · 성취기준 표적 ${targets.map((t) => t.key).join(', ')}`);

// ---------- 1. 여는 질문 4개가 모두 '글에 대한 질문'으로 잡히는가 ----------
{
  ctx.nmSettings = settings;
  const flags = opening.map((text) => { ctx.nmText = text; return run('isPassageRelatedQuestion(nmText, nmSettings)'); });
  record('① 여는 질문 4개(사실 3 · 낱말 뜻 1)가 모두 글에 대한 질문으로 잡힌다', flags.every(Boolean),
    opening.map((t, i) => `${flags[i] ? 'O' : 'X'} "${t}"`).join('\n      '));
}

// ---------- 2. 관련 질문 4개 → 4번째 답 끝에 2국면 이해(중) 질문 하나 ----------
{
  const b = start(script.studentCode); let last; const phases = [];
  for (const m of opening) { last = send(b, m); phases.push(last.phase); }
  record('② 관련 질문 4개 → 4번째에 2국면 이해(중) 질문 정확히 한 번',
    last.managedKind === 'comprehension_medium' && q(last.reply) === 1 && last.reply.endsWith(MED) && phases.join('') === '1112',
    `phases=${phases.join(',')} kind=${last.managedKind} ?=${q(last.reply)}\n      "${last.reply}"`);
  const firstThree = turns(b).filter((r) => r.speaker === 'bot').slice(0, 3);
  record('   1국면 세 답: 되묻기 0 (답이 먼저)', firstThree.every((r) => q(r.text) === 0),
    firstThree.map((r) => `"${r.text.slice(0, 70)}…"`).join('\n      '));
  const vocabReply = turns(b).filter((r) => r.speaker === 'bot')[3];
  const term = String(script.vocabularyQuestion).replace(/[이가]?\s*(무슨|무엇).*$/, '').trim();
  const def = (fixture.vocabulary.find((v) => v.term === term) || {}).definition || '';
  record(`   낱말 뜻 "${term}" → 승인한 쉬운 뜻으로 답한다`,
    def ? vocabReply.text.includes(def.slice(0, 6)) : false, `"${vocabReply.text.slice(0, 110)}"`);
}

// ---------- 3. 2국면 끝까지: 이해(중)→쉼→후속→쉼→성취기준→쉼→의견→끝 ----------
{
  const b = start('99-769'); let r;
  for (const m of opening) r = send(b, m);
  const kinds = [r.managedKind]; const replies = [r.reply];
  let guard = 0, i = 0;
  while (r.managedKind !== 'done' && guard++ < 12) { r = send(b, script.answers[i++ % script.answers.length]); kinds.push(r.managedKind); replies.push(r.reply); }
  const asked = kinds.filter((k) => k && k !== 'rest' && k !== 'done');
  const spaced = kinds.every((k, idx) => idx === 0 || k === 'rest' || k === 'done' || kinds[idx - 1] === 'rest');
  const restSilent = kinds.every((k, idx) => k !== 'rest' || q(replies[idx]) === 0);
  record('③ 관리 질문 순서 이해(중)→쉼→까닭(후속)→쉼→성취기준→쉼→의견→끝, 세션당 4개',
    asked.join(',') === 'comprehension_medium,comprehension_followup,standard,opinion' && spaced && restSilent && r.managedKind === 'done' && q(r.reply) === 0,
    `kinds=${kinds.join(' → ')}\n      마지막: "${r.reply}"`);
  const scored = turns(b).filter((t) => t.speaker === 'bot' && t.responseScore !== '');
  record('   responseScore 0~5 기록', scored.length >= 3 && scored.every((t) => Number(t.responseScore) >= 0 && Number(t.responseScore) <= 5),
    scored.map((t) => `${t.managedKind || 'rest'}:${t.responseScore}`).join(' '));
  ctx.nmHist = turns(b);
  const summary = run('phaseSummaryFor_(nmHist, phaseSettingsFor_(getActiveMaterial_()))');
  record('   DASHBOARD 집계: 관련 질문 4 · 이해/성취기준/의견 > 0',
    summary.relatedQuestionCount === 4 && summary.comprehensionBest > 0 && summary.standardBest > 0 && summary.opinionScore > 0, JSON.stringify(summary));
}

// ---------- 4. 자료 밖 질문 두 갈래 (AI 켬 — 모델은 스텁) ----------
{
  run(`setConfigValue_('AI_ENABLED','TRUE'); setConfigValue_('AI_MODEL','test-model');`);
  properties.set('OPENAI_API_KEY', 'test-only');
  const b = start('99-770');
  // (가) 글에는 없지만 글의 주제와 이어지는 질문 → "글에는 안 나오지만"
  // 이 갈래는 모델을 두 번 부른다(자료로 답해 보기 → 자료 밖 답하기). 둘 다 넣어 둔다.
  const generalReply = '플라스틱은 종류에 따라 수백 년까지 걸리기도 해요.';
  aiResponses.push({ output_text: JSON.stringify({ related: true, reply: generalReply, usedEvidenceIds: [] }) });
  aiResponses.push({ output_text: JSON.stringify({ related: true, reply: generalReply, usedEvidenceIds: [] }) });
  const relatedOff = send(b, script.offTextRelated);
  aiResponses.length = 0;
  record('④ 글 밖 질문이지만 글의 주제와 이어짐 → compose:general · "글에는 안 나오지만"으로 시작',
    relatedOff.aiStatus === 'compose:general' && /^글에는 안 나오지만/.test(relatedOff.reply),
    `aiStatus=${relatedOff.aiStatus}\n      "${relatedOff.reply}"`);
  record('   이때 모델에게 준 형식이 general_tutor_reply', aiRequests.at(-1)?.text?.format?.name === 'general_tutor_reply', String(aiRequests.at(-1)?.text?.format?.name));
  // (나) 전혀 다른 질문 → 규칙이 먼저 막거나(skipped_policy), 낱말이 겹치면 모델이 "상관없다"고 보아 글로 돌아오게 한다(general_off_topic)
  const before = aiRequests.length;
  aiResponses.push({ output_text: JSON.stringify({ related: false, reply: '', usedEvidenceIds: [] }) });
  const unrelated = send(b, script.offTextUnrelated);
  aiResponses.length = 0;
  const redirected = /지문에 나온 내용|글을 읽고 궁금한 걸|조금 다른 이야기/.test(unrelated.reply);
  record('⑤ 전혀 다른 질문 → 글로 돌아오게 한다 (규칙이 먼저 막거나, 모델이 상관없다고 봄)',
    (unrelated.aiStatus === 'compose:skipped_policy' || unrelated.aiStatus === 'compose:general_off_topic') && redirected && q(unrelated.reply) <= 1,
    `aiStatus=${unrelated.aiStatus} 모델 호출 ${aiRequests.length - before}회\n      "${unrelated.reply}"`);
  run(`setConfigValue_('AI_ENABLED','FALSE')`);
}

// ---------- 5. 10단계 — 지문을 바꿔 저장하면 이 자료의 대화가 TURNS_ARCHIVE 로 ----------
{
  const rowsOf = () => run(`getRowsAsObjects_('TURNS').filter(function (r) { return String(r.sessionId).indexOf('${material.materialId}:') === 0; }).length`);
  const before = rowsOf();
  // 교사 화면이 실제로 보내는 것과 같게 — 화면에 표시되는 운영 모드를 그대로 싣는다.
  const shownMode = run(`getTeacherSetupData(getOrCreateTeacherAccessToken_()).material.activityMode`);
  ctx.nmSetup = { appName: '질문이', subject: '국어', greetingMessage: '안녕!', glossary: [],
    material: { title: material.title + ' (고친 제목)', grade: material.grade, standard: material.standard, text: material.text, startQuestion: material.startQuestion, activityMode: shownMode } };
  run('saveTeacherSetup(getOrCreateTeacherAccessToken_(), nmSetup)');
  const afterTitle = rowsOf();
  ctx.nmSetup2 = { appName: '질문이', subject: '국어', greetingMessage: '안녕!', glossary: [],
    material: { title: material.title, grade: material.grade, standard: material.standard, text: material.text + '\n덧붙임: 학교에서도 리필 스테이션을 시범 운영한다.', startQuestion: material.startQuestion, activityMode: shownMode } };
  const textChanged = run('saveTeacherSetup(getOrCreateTeacherAccessToken_(), nmSetup2)');
  const afterText = rowsOf();
  const archived = run(`getRowsAsObjects_('TURNS_ARCHIVE').length`);
  record('⑥ 제목만 고쳐 저장 → 대화 그대로 · 지문을 고쳐 저장 → TURNS_ARCHIVE 로 옮기고 학생은 새로 시작',
    before > 0 && afterTitle === before && afterText === 0 && archived === before,
    `저장 전 ${before}행 → 제목만 고친 뒤 ${afterTitle}행 → 지문 고친 뒤 ${afterText}행 · 보관 ${archived}행\n      메시지: "${String(textChanged?.message || '').slice(0, 80)}"`);
}

// ---------- 6. 이전 버전 자료('discussion')를 새 교사 화면에서 저장해도 대화가 살아남는가 ----------
// 배포된 시트의 자료는 activityMode 가 'discussion' 이라 새 코드의 normalizeActivityMode_ 로는 빈 값이 된다.
// 교사 화면이 그것을 '평가'로 보여 주면, 제목 오타만 고쳐 저장해도 운영 모드가 바뀐 것으로 쳐서
// 학생 대화를 통째로 보관해 버린다. getTeacherSetupData 가 resolveActivityMode_ 로 풀어 주는지 본다.
{
  const { ctx: c2, run: r2 } = createGasContext(join(root, 'gas'), { id: 'sheet-legacy-mode' });
  const m2 = installMaterial({ ctx: c2, run: r2 }, fixture.material, fixture.vocabulary || []);
  r2(`setConfigValue_('AI_ENABLED','FALSE')`);
  c2.nmCode = script.studentCode;
  const b2 = r2(`getBootstrapData({}, nmCode)`);
  for (const msg of opening.slice(0, 2)) {
    c2.nmPayload = { sessionId: b2.sessionId, lesson: b2.lesson, message: msg };
    r2('submitTurn(nmPayload)');
  }
  const rows2 = () => r2(`getRowsAsObjects_('TURNS').filter(function (r) { return String(r.sessionId).indexOf('${m2.materialId}:') === 0; }).length`);
  const before2 = rows2();
  const stored = r2(`getRowsAsObjects_('MATERIALS')[0].activityMode`);
  const data2 = r2('getTeacherSetupData(getOrCreateTeacherAccessToken_())');
  // 교사는 드롭다운을 건드리지 않았다 — 화면이 고른 값이 그대로 올라간다.
  const shown2 = data2.material.activityMode === 'exploration' ? 'exploration' : 'evaluation';
  c2.nmSetup = { appName: data2.appName, subject: data2.subject, greetingMessage: data2.greetingMessage, glossary: [],
    material: { title: m2.title + ' (오타 고침)', grade: m2.grade, standard: m2.standard, text: m2.text,
                startQuestion: m2.startQuestion, version: m2.version, activityMode: shown2 } };
  const saved = r2('saveTeacherSetup(getOrCreateTeacherAccessToken_(), nmSetup)');
  const after2 = rows2();
  record('⑦ 이전 버전 자료를 제목만 고쳐 저장해도 학생 대화가 살아남는다 (운영 모드가 조용히 뒤바뀌지 않는다)',
    before2 > 0 && after2 === before2 && saved.archivedTurns === 0,
    `시트에 저장된 값 "${stored}" → 교사 화면이 받는 값 "${data2.material.activityMode}" · 드롭다운 "${shown2}"\n      `
    + `저장 전 ${before2}행 → 저장 뒤 ${after2}행 · 보관 ${saved.archivedTurns}건`);
}

// ---------- 결과 ----------
console.log('');
let bad = 0;
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}`);
  if (r.detail) console.log(`      ${r.detail}`);
  if (!r.ok) bad++;
}
console.log(`\n새 지문 실증: PASS ${results.length - bad} · FAIL ${bad}`);
process.exit(bad ? 1 : 0);
