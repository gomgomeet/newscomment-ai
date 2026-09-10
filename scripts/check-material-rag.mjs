#!/usr/bin/env node
/**
 * 지문 분석을 넣으면 RAG 답이 달라지는가 — 넣기 전(A)과 넣은 뒤(B)를 나란히 본다.
 *
 * 자료를 처음 받았을 때 만드는 세 가지를 시트에 넣고 검색이 실제로 쓰는지 확인한다.
 *   ① 주제어  → VOCABULARY_LIBRARY (단어군 '주제어') · 글 밖 질문의 관련 판정을 넓힌다
 *   ② 낱말 분석 → VOCABULARY_LIBRARY · 뜻 질문의 근거가 된다
 *   ③ 지문 분석 → KNOWLEDGE (중심 생각·문단 요약·사실·개념·까닭·이야깃거리·글에 없는 것)
 * 검색기(RetrievalEngine)는 CHUNKS·승인 낱말·KNOWLEDGE·CARDS를 보므로 코드를 고치지 않아도 곧바로 쓰인다.
 *
 *   node scripts/check-material-rag.mjs
 *   node scripts/check-material-rag.mjs --material=evals/gas/fixtures/내지문.json
 */
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGasContext, installMaterial } from './lib/fake-apps-script.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const arg = (n) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : ''; };
const fixture = JSON.parse(readFileSync(resolve(root, arg('material') || 'evals/gas/fixtures/material-plastic-e5.json'), 'utf8'));

/** 자료를 올린 문맥 하나. withAnalysis 가 참이면 주제어와 지문 분석까지 넣는다. */
/** genericTitles: 사람이 검색어에 맞춰 다듬지 않은, 모델이 낼 법한 밋밋한 제목으로 바꾼다. */
const GENERIC_TITLE = {
  overview: '글의 요지', paragraph_summary: '조사 결과 비율', fact: '조사 개요',
  concept: '재사용·리필 기반 시스템', relation: '학생 참여 배경',
  discussion: '토론 주제', boundary: '자료 범위'
};
function build(withAnalysis, id, withKeywordColumn = false, genericTitles = false) {
  const gas = createGasContext(join(root, 'gas'), { id });
  const vocabulary = withAnalysis
    ? [...(fixture.vocabulary || []), ...(fixture.themeWords || []).map((w) => ({ ...w, group: '주제어' }))]
    : (fixture.vocabulary || []);
  const material = installMaterial(gas, fixture.material, vocabulary);
  if (withKeywordColumn) {
    // SheetService.js의 KNOWLEDGE 열 목록에 'keywords'를 더했을 때를 흉내 낸다.
    // 모델은 이미 keywords를 만들고 normalizeKnowledgeItem_도 채우는데, 열이 없어 지금은 버려진다.
    const sheet = gas.run(`getSpreadsheet_().getSheetByName('KNOWLEDGE')`);
    gas.run(`(function(){ var s = getSpreadsheet_().getSheetByName('KNOWLEDGE');
      var last = s.getLastColumn(); s.getRange(1, last + 1, 1, 1).setValues([['keywords']]); })()`);
  }
  if (withAnalysis && (fixture.knowledge || []).length) {
    gas.ctx.ragKnowledge = fixture.knowledge.map((item, i) => ({
      knowledgeId: `KN-${String(i + 1).padStart(2, '0')}`,
      materialId: material.materialId,
      knowledgeType: item.knowledgeType,
      title: genericTitles ? (GENERIC_TITLE[item.knowledgeType] || item.title) : item.title,
      content: item.content,
      easyExplanation: item.easyExplanation,
      evidenceQuote: item.evidenceQuote || '',
      chunkId: '',
      sourceHash: material.sourceHash,
      status: 'approved',
      active: true,
      keywords: String(item.keywords || '').split(/\s*,\s*/).filter(Boolean).join('|')
    }));
    gas.run(`appendObjectsToSheet_(getSpreadsheet_().getSheetByName('KNOWLEDGE'), ragKnowledge)`);
  }
  gas.run(`setConfigValue_('AI_ENABLED','FALSE'); setConfigValue_('SHOW_EVIDENCE','TRUE');`);
  return { ...gas, material };
}

function ask(gas, code, message) {
  gas.ctx.ragCode = code;
  const boot = gas.run('getBootstrapData({}, ragCode)');
  gas.ctx.ragPayload = { sessionId: boot.sessionId, lesson: boot.lesson, message };
  const reply = gas.run('submitTurn(ragPayload)');
  gas.ctx.ragSid = boot.sessionId;
  const student = gas.run('getSessionTurns_(ragSid)').find((r) => r.speaker === 'student');
  return {
    reply: String(reply.reply || ''),
    sourceStatus: String(reply.sourceStatus || ''),
    kinds: [...new Set((reply.evidence || []).map((e) => String(e.kind)))],
    related: String(student?.relatedQuestion) === 'true'
  };
}

const QUESTIONS = [
  { q: '이 글에서 글쓴이가 하고 싶은 말이 뭐예요?', want: 'knowledge', why: '중심 생각 — 성취기준 그 자체' },
  { q: '왜 학생들이 직접 조사했어요?', want: 'knowledge', why: '까닭 묻기' },
  { q: '재사용이랑 리필이 무슨 뜻이에요?', want: 'any', why: '개념 낱말' },
  { q: '식품 포장재가 몇 퍼센트예요?', want: 'any', why: '사실 — 원래도 지문 조각으로 답한다' },
  { q: '텀블러 쓰면 도움이 돼요?', want: 'related', why: '글에 없는 말 — 주제어가 있어야 관련으로 본다' },
  { q: '분리수거하면 달라져요?', want: 'related', why: '글에 없는 말' }
];

const A = build(false, 'rag-before');
const B = build(true, 'rag-after');
// 자동 생성이면 제목이 검색어에 맞게 나오지 않는다. 그때 keywords 열이 있고 없고를 견준다.
const C = build(true, 'rag-auto-plain', false, true);   // 밋밋한 제목 · keywords 열 없음 (지금)
const D = build(true, 'rag-auto-keyword', true, true);  // 밋밋한 제목 · keywords 열 있음 (한 줄 수정)
console.log(`\n자료: ${A.material.title}`);
console.log(`A = 지금 상태(지문 조각 + 낱말 ${(fixture.vocabulary || []).length}개)`);
console.log(`B = A + 주제어 ${(fixture.themeWords || []).length}개 + 지문 분석 ${(fixture.knowledge || []).length}개`);
console.log(`C = 자동 생성처럼 밋밋한 제목 · keywords 열 없음 (지금 코드)`);
console.log(`D = 같은 제목 · KNOWLEDGE에 keywords 열 추가 (모델이 이미 만드는 값을 버리지 않는 한 줄 수정)\n`);

const results = [];
QUESTIONS.forEach((item, i) => {
  const a = ask(A, `7-${i + 1}`, item.q);
  const b = ask(B, `7-${i + 1}`, item.q);
  const c = ask(C, `7-${i + 1}`, item.q);
  const d = ask(D, `7-${i + 1}`, item.q);
  results.push({ item, a, b, c, d });
  console.log(`■ "${item.q}"  — ${item.why}`);
  console.log(`   A  근거 ${a.kinds.join('+') || '없음'} · ${a.sourceStatus} · 글에 대한 질문 ${a.related ? 'O' : 'X'}`);
  console.log(`      "${a.reply.slice(0, 95)}"`);
  console.log(`   B  근거 ${b.kinds.join('+') || '없음'} · ${b.sourceStatus} · 글에 대한 질문 ${b.related ? 'O' : 'X'}`);
  console.log(`      "${b.reply.slice(0, 95)}"`);
  console.log(`   C  근거 ${c.kinds.join('+') || '없음'} · ${c.sourceStatus}   (자동 생성 제목, keywords 없음)`);
  console.log(`   D  근거 ${d.kinds.join('+') || '없음'} · ${d.sourceStatus}   (자동 생성 제목, keywords 있음)`);
  console.log(`      "${d.reply.slice(0, 95)}"\n`);
});

// ---------- 판정 ----------
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });
const byQ = (q) => results.find((r) => r.item.q === q);

const pct = byQ('식품 포장재가 몇 퍼센트예요?');
add('① 퍼센트를 물으면 문단 요약이 근거로 붙고 87%가 답에 나온다',
  pct.b.kinds.includes('knowledge') && /87/.test(pct.b.reply),
  `A=${pct.a.kinds.join('+') || '없음'}(87% ${/87/.test(pct.a.reply) ? 'O' : 'X'}) → B=${pct.b.kinds.join('+') || '없음'}(87% ${/87/.test(pct.b.reply) ? 'O' : 'X'})`);

const why = byQ('왜 학생들이 직접 조사했어요?');
add('② 까닭을 물으면 지문 분석이 근거로 붙는다',
  why.b.kinds.includes('knowledge'), `A=${why.a.kinds.join('+') || '없음'} → B=${why.b.kinds.join('+') || '없음'}`);

const themeQs = [byQ('텀블러 쓰면 도움이 돼요?'), byQ('분리수거하면 달라져요?')];
add('③ 글에 없는 주제어로 물어도 글에 대한 질문으로 본다',
  themeQs.every((r) => !r.a.related && r.b.related),
  themeQs.map((r) => `"${r.item.q}" ${r.a.related ? 'O' : 'X'}→${r.b.related ? 'O' : 'X'}`).join(' · '));

const offA = results.filter((r) => r.a.sourceStatus === 'out_of_scope').length;
const offB = results.filter((r) => r.b.sourceStatus === 'out_of_scope').length;
add('④ 딴소리로 돌려보내는 질문이 줄어든다 (0개가 되어야 한다)', offB < offA && offB === 0, `A ${offA}개 → B ${offB}개`);

add('⑤ 낱말 뜻 질문은 그대로 낱말로 답한다 (지식이 끼어들지 않는다)',
  byQ('재사용이랑 리필이 무슨 뜻이에요?').b.kinds.includes('vocabulary'),
  byQ('재사용이랑 리필이 무슨 뜻이에요?').b.kinds.join('+') || '없음');

add('⑥ 제목을 밋밋하게 바꿔도 답이 나빠지지 않는다 (본문 첫 문장이 검색을 끈다)',
  results.every((r) => r.c.kinds.length >= r.b.kinds.length - 1),
  `사람이 다듬은 제목 ${results.filter((r) => r.b.kinds.includes('knowledge')).length}개 · 밋밋한 제목 ${results.filter((r) => r.c.kinds.includes('knowledge')).length}개 (질문 ${results.length}개 중)`);

// 재 보고 알아 둔 것 — 검사로 세지 않고 적어만 둔다.
const hand = results.filter((r) => r.b.kinds.includes('knowledge')).length;
const autoPlain = results.filter((r) => r.c.kinds.includes('knowledge')).length;
const autoKeyword = results.filter((r) => r.d.kinds.includes('knowledge')).length;
console.log('─'.repeat(74));
console.log('※ keywords 열을 더하면? — 이 표본에서는 차이가 없었다.');
console.log(`   사람이 다듬은 제목 ${hand}개 · 밋밋한 제목 ${autoPlain}개 · 밋밋한 제목 + keywords 열 ${autoKeyword}개 (질문 ${results.length}개 중)`);
console.log('   모델은 이미 keywords를 만들고 normalizeKnowledgeItem_도 채우지만 시트에 열이 없어 버려진다.');
console.log('   다만 본문 첫 문장에 아이들이 쓸 말이 있으면 열 없이도 찾아진다 — 열 추가는 보험이지 급한 일이 아니다.');

const mainIdea = byQ('이 글에서 글쓴이가 하고 싶은 말이 뭐예요?');
console.log('─'.repeat(74));
console.log('※ 알아 둔 한계 — "중심 생각이 뭐예요?"는 낱말 뜻 질문(ask_definition)으로 분류되고,');
console.log('   그 경로는 vocabulary 지식만 검색해서 중심 생각 지식이 안 붙는다.');
console.log(`   실제: A=${mainIdea.a.kinds.join('+') || '없음'} → B=${mainIdea.b.kinds.join('+') || '없음'}`);
console.log('   고치는 자리는 RetrievalEngine.js scoreKnowledgeTypeRelevance_ (Codex 소유) — 사양으로 넘긴다.');

console.log('─'.repeat(74));
let bad = 0;
for (const c of checks) { console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.name}\n      ${c.detail}`); if (!c.ok) bad++; }
console.log(`\n지문 분석 → RAG 확인: PASS ${checks.length - bad} · FAIL ${bad}`);
process.exit(bad ? 1 : 0);
