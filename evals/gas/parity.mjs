#!/usr/bin/env node
/**
 * 웹앱 원본(lib/questioning-conversation-phase.ts)과 GAS 이식본(gas/Phase.js·Signals.js)이
 * 49회기 학생 발화에서 같은 국면·같은 질문을 내는지 턴마다 비교한다.
 *
 *   node --experimental-strip-types evals/gas/parity.mjs
 *
 * 두 쪽에 같은 기본 답("네, 그렇게 나와 있어요.")을 주고, 종료·관계 회복·안전은 같은 규칙으로 맞춘 뒤
 * 국면(1/2), 붙인 질문의 종류와 문구, 마지막 집계(질문 수·관련 질문 수·응답 최고점)를 견준다.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

// ---- TS 원본을 임시 폴더에 복사해 경로 별칭만 바꿔 읽는다 ----
const tmp = join(process.env.SCRATCH || join(root, 'evals', 'gas', '.tmp'));
mkdirSync(tmp, { recursive: true });
for (const name of ['questioning-conversation-phase.ts', 'questioning-target-signals.ts']) {
  const src = readFileSync(join(root, 'lib', name), 'utf8')
    .replace(/from "@\/lib\/questioning-target-signals"/g, 'from "./questioning-target-signals.ts"')
    .replace(/import type \{[\s\S]*?\} from "@\/lib\/questioning-board";\n/g, '');
  writeFileSync(join(tmp, name), src);
}
const ts = await import(pathToFileURL(join(tmp, 'questioning-conversation-phase.ts')).href);

// ---- GAS 이식본을 가짜 전역으로 읽는다 ----
const ctx = { console, Logger: { log() {} } };
vm.createContext(ctx);
for (const f of ['Signals.js', 'Phase.js']) vm.runInContext(readFileSync(join(root, 'gas', f), 'utf8'), ctx, { filename: f });

// ---- 픽스처 ----
const fx = join(root, 'evals', 'questioning-chatbot', 'fixtures');
const articles = new Map(JSON.parse(readFileSync(join(fx, 'articles.json'), 'utf8')).map((a) => [a.id, a]));
const sessions = [...JSON.parse(readFileSync(join(fx, 'sessions.json'), 'utf8')), ...JSON.parse(readFileSync(join(fx, 'holdout-sessions.json'), 'utf8'))];

const BASE = '네, 그렇게 나와 있어요.';
const materialOf = (a) => ({ materialTitle: a.title, summary: a.summary || '', visibleText: a.text, keyConcepts: a.keyConcepts || [], vocabulary: a.vocabulary || [], possibleMisconceptions: [], questionSeeds: [], sourceLimit: '', safetyNotice: '' });
const settingsOf = (a, standard) => ({ passage: a.text, title: a.title, summary: a.summary || '', standard, memo: '', keyConcepts: a.keyConcepts || [], words: (a.vocabulary || []).map((v) => ({ term: v.term, definition: v.dictionaryMeaning })) });

function tsKind(reply, targets, prev) {
  if (reply.includes(ctx.PHASE_B1_PROMPT)) return 'b1';
  if (reply.includes(ctx.PHASE_B2_PROMPT)) return 'b2';
  if (reply.startsWith('이 문장 말이지요')) return 'explain_sentence';
  const q = ctx.phaseClassifyBotQuestion_({ text: reply }, targets);
  if (q) return q.kind;
  return '';
}
const norm = (k) => (k === 'done' ? '' : k);

let turnsTotal = 0, phaseMismatch = 0, kindMismatch = 0, textMismatch = 0, summaryMismatch = 0;
const diffs = [];
for (const session of sessions) {
  const article = articles.get(session.articleId);
  const material = materialOf(article);
  const settings = settingsOf(article, session.standard);
  const targets = ctx.buildStandardTargets(session.standard, '');
  const conversation = [];   // TS
  const history = [];        // GAS
  let tsLast = null;
  for (const [i, turn] of session.turns.entries()) {
    turnsTotal += 1;
    const gas = ctx.decidePhase(history, turn, settings);
    const compact = turn.replace(/\s+/g, '');
    const primaryMove = ctx.PHASE_SAFETY_.test(turn) ? 'safety_redirect' : ctx.PHASE_REPAIR_.test(turn) ? 'repair' : 'answer';
    const base = { schemaVersion: 2, studentReply: BASE, answer: BASE, expectsStudentReply: true, isClosing: Boolean(gas.closing), primaryMove, engagementState: 'engaged', curriculumRelation: 'core', supportLevel: 1, sourceStatus: 'supported', sourceCue: '', promptVersion: 'questioning-dialogue-v2', provider: 'local', followUpQuestion: '' };
    const out = ts.applyQuestioningConversationPhase({ result: base, currentTurn: turn, conversation, material, standard: session.standard, teacherMemo: '' });
    tsLast = out;
    const kTs = tsKind(out.studentReply, targets);
    const kGas = gas.kind;
    const gasReply = ctx.enforceManagedQuestion(BASE, gas);
    const note = [];
    if (out.conversationPhase !== gas.phase) { phaseMismatch += 1; note.push(`phase ts=${out.conversationPhase} gas=${gas.phase}`); }
    if (norm(kTs) !== norm(kGas)) { kindMismatch += 1; note.push(`kind ts=${kTs || '-'} gas=${kGas || '-'}`); }
    else if (gas.managedQuestion && !out.studentReply.includes(gas.managedQuestion)) { textMismatch += 1; note.push(`question text differs\n      ts : ${out.studentReply}\n      gas: ${gasReply}`); }
    if (note.length) diffs.push(`${session.id} #${i + 1} "${turn}"\n    ${note.join('\n    ')}`);
    conversation.push({ role: 'student', content: turn }, { role: 'assistant', content: out.studentReply });
    history.push({ speaker: 'student', text: turn }, { speaker: 'bot', text: gasReply, managedKind: gas.kind });
  }
  // 집계 비교 — 원본 rubricScores 근거 문장에서 숫자를 뽑는다
  const sum = ctx.phaseSummaryFor_(history, settings);
  const r = Object.fromEntries(tsLast.rubricScores.map((s) => [s.criterionKey, s.rationale]));
  const n = (re, text) => { const m = re.exec(text || ''); return m ? Number(m[1]) : NaN; };
  const tsQ = n(/질문 (\d+)개/, r.questioning), tsRel = n(/관련 질문 (\d+)개/, r.passage_comprehension), tsComp = n(/이해 응답 최고 (\d+)점/, r.passage_comprehension), tsStd = n(/성취기준 응답 최고 (\d+)점/, r.achievement_standard);
  const pairs = [['질문 수', tsQ, sum.questionCount], ['관련 질문 수', tsRel, sum.relatedQuestionCount], ['이해 응답 최고', tsComp, sum.comprehensionBest], ['성취기준 응답 최고', tsStd, sum.standardBest]];
  const bad = pairs.filter(([, a, b]) => a !== b);
  if (bad.length) { summaryMismatch += 1; diffs.push(`${session.id} 집계: ` + bad.map(([k, a, b]) => `${k} ts=${a} gas=${b}`).join(', ')); }
}
for (const d of diffs) console.log('DIFF ' + d);
console.log(`\n세션 ${sessions.length} · 턴 ${turnsTotal} · 국면 불일치 ${phaseMismatch} · 질문 종류 불일치 ${kindMismatch} · 질문 문구 불일치 ${textMismatch} · 집계 불일치 ${summaryMismatch}`);
process.exit(phaseMismatch + kindMismatch + textMismatch + summaryMismatch ? 1 : 0);
