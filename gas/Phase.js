/**
 * Phase.js — 2국면 상태기. 저장소 lib/questioning-conversation-phase.ts 이식.
 *
 * 1국면: 학생이 묻고 챗봇이 답한다. 되묻지 않는다.
 * 2국면: 지문 관련 질문이 4개가 되면 챗봇이 이해(중) → 이해(상/하) → 성취기준 표적(≤2) → 의견 순으로
 *        한 턴에 하나씩 묻는다. 3턴 지나도 관련 질문이 1개 이하면 B1 한 번, "없어요"면 B2 → 2국면.
 *
 * 상태를 따로 저장하지 않는다. 이 학생의 TURNS 행을 매 턴 다시 센다.
 * 질문은 이 파일이 소유한다 — 모델에게 세라고 시키지 않고, enforceManagedQuestion()이 모델의 물음표를 걷는다.
 *
 * 공개 함수 (gas/CONTRACT.md 4~5절):
 *   decidePhase(history, message, settings)   → decision
 *   buildTaskLine(decision)                    → '[지금 할 일] …'
 *   enforceManagedQuestion(text, decision)     → text
 *   phaseSettingsFor_(material)                → settings
 *   phaseSummaryFor_(history, settings)        → DASHBOARD 학생별 행 (세는 것만)
 */

var PHASE_B1_PROMPT = '혹시 지문에서 모르는 단어나 이해하기 어려운 문장이 있나요?';
var PHASE_B2_PROMPT = '혹시 글에 대해서 질문하기가 어려우면 제가 질문해도 될까요? 제 질문에 대한 답을 지문에서 찾아보세요.';
var PHASE_OPINION_PROMPT = '이 글을 읽고 어떤 생각이나 느낌이 들었어? 네 생각이 궁금해.';
var PHASE_COMPREHENSION_MEDIUM_PROMPT = '글에서 가장 중요한 사실 한 가지를 찾아 자기 말로 말해 줄래요?';
var PHASE_COMPREHENSION_HIGH_PROMPT = '글에 나온 결과와 그 까닭을 구분해서 말해 줄래요?';

var PHASE_NO_DIFFICULTY_ = /^(없어요?|없습니다|괜찮아요?|아니요?|딱히\s*없어요?|모르겠어요?)[.\s!]*$/;
var PHASE_CLOSING_ = /(그만|끝낼|끝날|마칠|마무리|이제\s*됐|안녕히|잘\s*가|바이바이|다\s*했)/;
var PHASE_REPAIR_ = /(왜\s*자꾸|자꾸\s*물어|그만\s*물어|질문이\s*너무|부담스러|부담돼|재촉|싫다고|안\s*된다고|계속\s*틀렸|또\s*근거|제가\s*다\s*찾|내가\s*다\s*찾|설명만|양쪽\s*다\s*맞다고만)/;
var PHASE_SAFETY_ = /(전화번호|주소|비밀번호|주민번호|사진|실명|내\s*이름|제\s*이름|이름은|답\s*다\s*써|그대로\s*써|대신\s*써|대필|수행평가\s*답|숙제\s*해|정답\s*알려)/;

// ---------------------------------------------------------------------------
// 지문 문장
// ---------------------------------------------------------------------------

function phaseSourceSentences_(settings) {
  var text = String(settings.passage || '').trim();
  var lines = text.split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean);
  var key = function (v) { return String(v || '').replace(/[^가-힣A-Za-z0-9]/g, '').toLowerCase(); };
  var firstKey = key(lines[0] || '');
  var titleKey = key(settings.title || '');
  var firstIsTitle = lines.length > 1 && titleKey.length >= 4 &&
    (firstKey === titleKey || firstKey.indexOf(titleKey) >= 0 || titleKey.indexOf(firstKey) >= 0);
  var source = firstIsTitle ? lines.slice(1).join('\n') : text;
  return source
    .replace(/(\d)\.(\d)/g, '$1<decimal>$2')
    .split(/(?<=[.!?])\s+|\n+/)
    .map(function (s) { return s.replace(/<decimal>/g, '.').trim(); })
    .filter(function (s) { return s.length >= 12 && !/[?？]$/.test(s) && !/기자\s*$/.test(s); });
}

function phaseSupportSentence_(settings) {
  return phaseSourceSentences_(settings)[0] || String(settings.summary || '').trim() || '지문의 첫 문장';
}

function phaseComprehensionFollowup_(settings, difficulty) {
  if (difficulty === '상') return PHASE_COMPREHENSION_HIGH_PROMPT;
  var sentence = phaseSupportSentence_(settings).replace(/[“”"]/g, '').slice(0, 150);
  return '자료의 “' + sentence + '”를 다시 봐요. 이 문장에 나온 사실 한 가지는 무엇인가요?';
}

// ---------------------------------------------------------------------------
// 봇이 이미 물은 질문 알아보기
// ---------------------------------------------------------------------------

/** 봇 발화(또는 TURNS 행의 managedKind)에서 2국면 질문을 알아본다. 없으면 null. */
function phaseClassifyBotQuestion_(row, targets) {
  var text = String(row && row.text !== undefined ? row.text : row || '');
  var kind = row && row.managedKind ? String(row.managedKind) : '';
  if (text.indexOf(PHASE_COMPREHENSION_MEDIUM_PROMPT) >= 0 || kind === 'comprehension_medium') {
    return { kind: 'comprehension_medium', text: PHASE_COMPREHENSION_MEDIUM_PROMPT, difficulty: '중' };
  }
  if (text.indexOf(PHASE_COMPREHENSION_HIGH_PROMPT) >= 0) {
    return { kind: 'comprehension_followup', text: PHASE_COMPREHENSION_HIGH_PROMPT, difficulty: '상' };
  }
  if (/자료의 “.+”를 다시 봐요\. 이 문장에 나온 사실 한 가지는 무엇인가요\?/.test(text) || kind === 'comprehension_followup') {
    return { kind: 'comprehension_followup', text: text, difficulty: '하' };
  }
  for (var i = 0; i < targets.length; i++) {
    if (text.indexOf(targets[i].askTemplate) >= 0) {
      return { kind: 'standard', text: targets[i].askTemplate, target: targets[i],
        difficulty: text.indexOf('이 문장을 먼저 다시 보고') >= 0 ? '하' : '상' };
    }
  }
  if (kind === 'standard') return { kind: 'standard', text: text, target: targets[0], difficulty: '상' };
  if (text.indexOf(PHASE_OPINION_PROMPT) >= 0 || kind === 'opinion') {
    return { kind: 'opinion', text: PHASE_OPINION_PROMPT, difficulty: '중' };
  }
  return null;
}

function phaseIsBot_(row) { return row && (row.speaker === 'bot' || row.speaker === 'assistant' || row.role === 'assistant'); }
function phaseIsStudent_(row) { return row && (row.speaker === 'student' || row.role === 'student'); }
function phaseText_(row) { return String(row && (row.text !== undefined ? row.text : row.content) || ''); }

// ---------------------------------------------------------------------------
// 다음 질문 고르기
// ---------------------------------------------------------------------------

function phaseNextQuestion_(asked, lastQuestion, currentAnswer, targets, settings) {
  if (asked.length === 0) {
    return { question: { kind: 'comprehension_medium', text: PHASE_COMPREHENSION_MEDIUM_PROMPT, difficulty: '중' }, feedback: '', score: null };
  }
  var score = lastQuestion ? answerScore(lastQuestion, currentAnswer, settings) : 0;
  var nextDifficulty = score >= 3 ? '상' : '하';
  var feedback = lastQuestion && lastQuestion.difficulty === '하' && score <= 2
    ? '여기에는 “' + phaseSupportSentence_(settings).slice(0, 150) + '”라고 나와 있어요. 이 문장에서 답을 찾을 수 있어요. '
    : '';
  var has = function (kind) { return asked.some(function (q) { return q.kind === kind; }); };

  if (!has('comprehension_followup')) {
    return { question: { kind: 'comprehension_followup', text: phaseComprehensionFollowup_(settings, nextDifficulty), difficulty: nextDifficulty }, feedback: feedback, score: score };
  }
  var askedKeys = {};
  asked.forEach(function (q) { if (q.kind === 'standard' && q.target) askedKeys[q.target.key] = true; });
  var nextTarget = null;
  for (var i = 0; i < targets.length; i++) { if (!askedKeys[targets[i].key]) { nextTarget = targets[i]; break; } }
  if (nextTarget) {
    var text = nextDifficulty === '하'
      ? '자료의 “' + phaseSupportSentence_(settings).slice(0, 150) + '” 이 문장을 먼저 다시 보고 ' + nextTarget.askTemplate
      : nextTarget.askTemplate;
    return { question: { kind: 'standard', text: text, target: nextTarget, difficulty: nextDifficulty }, feedback: feedback, score: score };
  }
  if (!has('opinion')) {
    return { question: { kind: 'opinion', text: PHASE_OPINION_PROMPT, difficulty: '중' }, feedback: feedback, score: score };
  }
  return { question: null, feedback: feedback, score: score };
}

// ---------------------------------------------------------------------------
// 공개: decidePhase
// ---------------------------------------------------------------------------

/**
 * history: 이 학생의 TURNS 행(시간순). 각 행 {speaker:'student'|'bot', text, managedKind?}
 * message: 이번 학생 발화(가린 뒤)
 * settings: phaseSettingsFor_(material) 결과
 * 반환: { phase, managedQuestion, allowQuestion, kind, difficulty, feedback, lastScore, relatedQuestion }
 */
function decidePhase(history, message, settings) {
  history = history || [];
  settings = settings || {};
  var current = String(message || '').trim();
  var targets = buildStandardTargets(settings.standard, settings.memo);
  var bots = history.filter(phaseIsBot_);
  var students = history.filter(phaseIsStudent_);
  var asked = bots.map(function (r) { return phaseClassifyBotQuestion_(r, targets); }).filter(Boolean);
  var lastBot = bots.length ? bots[bots.length - 1] : null;
  var lastQuestion = lastBot ? phaseClassifyBotQuestion_(lastBot, targets) : null;
  var b1Used = bots.some(function (r) { return phaseText_(r).indexOf(PHASE_B1_PROMPT) >= 0 || r.managedKind === 'b1'; });
  var b2Used = bots.some(function (r) { return phaseText_(r).indexOf(PHASE_B2_PROMPT) >= 0 || r.managedKind === 'b2'; });
  var relatedQuestion = isPassageRelatedQuestion(current, settings);
  var related = students.map(phaseText_).filter(function (t) { return isPassageRelatedQuestion(t, settings); }).length + (relatedQuestion ? 1 : 0);
  var inPhaseTwo = asked.length > 0 || b2Used || related >= 4;
  var closing = PHASE_CLOSING_.test(current.replace(/\s+/g, '')) && !isStudentQuestion(current);
  var protectedMove = closing || PHASE_REPAIR_.test(current) || PHASE_SAFETY_.test(current);

  var base = {
    phase: inPhaseTwo ? 2 : 1, managedQuestion: '', allowQuestion: true, kind: '',
    difficulty: '중', feedback: '', lastScore: null, relatedQuestion: relatedQuestion,
    closing: closing
  };

  if (protectedMove) {
    base.allowQuestion = false;
    return base;
  }

  // B1에 "없어요" → B2 → 2국면
  if (lastBot && (phaseText_(lastBot).indexOf(PHASE_B1_PROMPT) >= 0 || lastBot.managedKind === 'b1') && PHASE_NO_DIFFICULTY_.test(current)) {
    base.phase = 2; base.kind = 'b2'; base.managedQuestion = PHASE_B2_PROMPT; base.difficulty = '하';
    return base;
  }

  if (inPhaseTwo) {
    var next = phaseNextQuestion_(asked, lastQuestion, current, targets, settings);
    base.phase = 2;
    base.lastScore = next.score;
    base.feedback = next.feedback;
    if (next.question) {
      base.kind = next.question.kind;
      base.managedQuestion = next.question.text;
      base.difficulty = next.question.difficulty;
    } else {
      base.kind = 'done';
      base.allowQuestion = false;   // 의견까지 물었다. 더 묻지 않는다.
    }
    return base;
  }

  // 1국면인데 3턴 지나도 관련 질문 ≤1 → B1 한 번
  if (!b1Used && students.length + 1 >= 3 && related <= 1) {
    base.kind = 'b1'; base.managedQuestion = PHASE_B1_PROMPT; base.difficulty = '하';
    return base;
  }
  return base;
}

// ---------------------------------------------------------------------------
// 공개: [지금 할 일] 과 후처리
// ---------------------------------------------------------------------------

function buildTaskLine(decision) {
  if (!decision || !decision.allowQuestion) return '[지금 할 일] 학생 말에 답만 하세요. 질문 없이.';
  if (!decision.managedQuestion) return '[지금 할 일] 1국면입니다. 학생 질문에 답하고 되묻지 마세요.';
  var feedback = decision.feedback ? ' 피드백 문장: "' + String(decision.feedback).trim() + '"' : '';
  return '[지금 할 일] 2국면입니다. 학생 말에 먼저 답한 뒤, 마지막 문장으로 이 질문 하나만 붙이세요: "' + decision.managedQuestion + '"' + feedback;
}

/** 모델이 뭐라고 했든 결과는 같다 — 물음표 문장을 걷고 상태기의 질문 하나만 남긴다. */
function enforceManagedQuestion(text, decision) {
  var reply = String(text || '')
    .split(PHASE_B1_PROMPT).join('')
    .split(PHASE_B2_PROMPT).join('')
    .replace(/\s+/g, ' ').trim();
  decision = decision || {};
  var stripQuestions = function (s) {
    return s.replace(/[^.!?？]*[?？]/g, '').replace(/\s+/g, ' ').trim();
  };
  if (!decision.allowQuestion) {
    var answerOnly = stripQuestions(reply);
    return answerOnly || reply.replace(/[?？]/g, '.') || '말해 준 내용을 바탕으로 지문을 계속 살펴볼게요.';
  }
  if (decision.managedQuestion) {
    var body = stripQuestions(reply);
    var parts = [body, String(decision.feedback || '').trim(), decision.managedQuestion].filter(Boolean);
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }
  // 1국면: 모델이 붙인 질문은 하나까지만
  var seen = false;
  return reply.replace(/[?？]/g, function () { if (seen) return '.'; seen = true; return '?'; });
}

// ---------------------------------------------------------------------------
// 공개: 설정과 집계
// ---------------------------------------------------------------------------

/** MATERIALS 행과 승인 어휘에서 settings를 만든다. Codex 쪽 함수가 없으면 자료만으로 만든다. */
function phaseSettingsFor_(material) {
  material = material || {};
  var words = [];
  try {
    if (typeof getApprovedVocabularyEntries_ === 'function') {
      words = getApprovedVocabularyEntries_().filter(function (e) {
        return String(e.sourceId || '') === String(material.materialId || '');
      }).map(function (e) { return { term: String(e.term || ''), definition: String(e.easyDefinition || '') }; });
    }
  } catch (error) { words = []; }
  return {
    passage: String(material.text || ''),
    title: String(material.title || ''),
    standard: String(material.standard || ''),
    standardCode: String(material.standardCode || ''),
    memo: String(material.teacherMemo || material.questionFocusMemo || ''),
    gradeCode: String(material.gradeCode || material.grade || ''),
    words: words
  };
}

/**
 * DASHBOARD 학생별 행 — 세는 것만. 점수 판정은 교사 열.
 * 반환: { questionCount, relatedQuestionCount, comprehensionBest, standardBest, opinionScore, moreToExplore, reachedDifficulty, phase }
 */
function phaseSummaryFor_(history, settings) {
  history = history || [];
  var targets = buildStandardTargets(settings.standard, settings.memo);
  var firstPhaseTwoIndex = -1;
  for (var i = 0; i < history.length; i++) {
    var r = history[i];
    if (phaseIsBot_(r) && (phaseText_(r).indexOf(PHASE_B2_PROMPT) >= 0 || phaseClassifyBotQuestion_(r, targets))) { firstPhaseTwoIndex = i; break; }
  }
  var phaseOne = (firstPhaseTwoIndex < 0 ? history : history.slice(0, firstPhaseTwoIndex)).filter(phaseIsStudent_).map(phaseText_);
  var countable = phaseOne.filter(function (t) { return isCountableStudentQuestion(t, settings); });
  var related = phaseOne.filter(function (t) { return isPassageRelatedQuestion(t, settings); });
  var beyond = countable.filter(function (t) { return !isPassageRelatedQuestion(t, settings); });

  var best = { comprehension: 0, standard: 0, opinion: 0 };
  var reached = null;
  var order = ['하', '중', '상'];
  for (var j = 1; j < history.length; j++) {
    var bot = history[j - 1], student = history[j];
    if (!phaseIsBot_(bot)) continue;
    var q = phaseClassifyBotQuestion_(bot, targets);
    if (!q) continue;
    if (!reached || order.indexOf(q.difficulty) > order.indexOf(reached)) reached = q.difficulty;
    if (!phaseIsStudent_(student)) continue;
    var score = answerScore(q, phaseText_(student), settings);
    if (q.kind === 'standard') best.standard = Math.max(best.standard, score);
    else if (q.kind === 'opinion') best.opinion = Math.max(best.opinion, score);
    else best.comprehension = Math.max(best.comprehension, score);
  }
  var lastBot = history.filter(phaseIsBot_).slice(-1)[0];
  if (lastBot) { var lastQ = phaseClassifyBotQuestion_(lastBot, targets); if (lastQ && (!reached || order.indexOf(lastQ.difficulty) > order.indexOf(reached))) reached = lastQ.difficulty; }

  return {
    questionCount: countable.length,
    relatedQuestionCount: related.length,
    comprehensionBest: best.comprehension,
    standardBest: best.standard,
    opinionScore: best.opinion,
    moreToExplore: beyond,
    reachedDifficulty: reached || '',
    phase: firstPhaseTwoIndex >= 0 ? 2 : 1
  };
}
