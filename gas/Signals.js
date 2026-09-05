/**
 * Signals.js — 학생의 답에서 '신호'를 찾아 점수를 매긴다.
 * 저장소 lib/questioning-target-signals.ts 이식. 규칙만 바꾸지 말고 원본과 같이 바꾼다.
 *
 * 왜 이렇게 하나 — 모델에게 "몇 점이냐"고 물으면 후하게 준다. 모델에게는 묻지 않고,
 * 관찰할 수 있는 신호(지문 말을 끌어왔나, 까닭을 붙였나, 자기 생각을 드러냈나)만 센다.
 *
 * 공개 함수 (gas/CONTRACT.md 5절):
 *   buildStandardTargets(standard, memo)      → 표적 ≤2
 *   isPassageRelatedQuestion(text, settings)  → boolean
 *   answerScore(question, answer, settings)   → 0~5
 */

var SIGNAL_TARGETS_ = [
  {
    key: 'monitor_reading', label: '읽기 과정 점검',
    behavior: '읽으면서 자기 이해가 달라지거나 막힌 지점을 알아차려 말한다',
    markers: /(줄\s*알았|처음(엔|에는|에)|이제\s*보니|다시\s*보니|알고\s*보니|달라졌|바뀌었|헷갈렸|몰랐|착각|아하|그렇구나)/,
    askTemplate: '읽으면서 처음 생각과 달라진 부분이 무엇이었는지 말해 줄래?'
  },
  {
    key: 'main_idea', label: '중심 생각 파악',
    behavior: '글 전체가 하고 싶은 말을 한 문장으로 짚는다',
    markers: /(하고\s*싶은\s*말|중심\s*(생각|내용)|말하려는|요지|한마디로|결국|전체적으로)/,
    askTemplate: '이 글이 가장 하고 싶은 말은 뭐라고 생각해?'
  },
  {
    key: 'cause_effect', label: '원인과 영향',
    behavior: '무엇 때문에 그렇게 되었는지 지문 근거로 설명한다',
    markers: /(때문|덕분|그래서|까닭|원인|영향|바람에|탓)/,
    askTemplate: '글에서는 왜 그런 일이 생겼다고 말하고 있어?'
  },
  {
    key: 'predict', label: '예측하며 읽기',
    behavior: '제목·앞부분을 보고 이어질 내용을 미리 헤아린다',
    markers: /(일\s*것\s*같|나올\s*것\s*같|예상|짐작|아마|~?겠다|겠어|싶었)/,
    askTemplate: '제목을 처음 봤을 때 어떤 내용이 나올 것 같았어?'
  },
  {
    key: 'claim_evidence', label: '주장과 근거',
    behavior: '주장과 그 근거를 구분해 말한다',
    markers: /(주장|근거|왜냐하면|이유는|뒷받침|타당|반대로|하지만)/,
    askTemplate: '글쓴이는 무엇을 주장하고, 그렇게 말하는 까닭은 뭐라고 했어?'
  },
  {
    key: 'compare', label: '비교하기',
    behavior: '둘 이상을 견주어 차이를 설명한다',
    markers: /(보다|반면|다르게|차이|둘\s*다|비교|더\s*많|더\s*적)/,
    askTemplate: '글에 나온 것 중 서로 견주어 볼 만한 두 가지는 뭐야?'
  },
  {
    key: 'apply', label: '적용·제안',
    behavior: '글의 내용을 자기 상황이나 새 상황으로 옮겨 본다',
    markers: /(우리\s*(반|학교|집)|나라면|내가\s*(하면|라면)|하면\s*될|해\s*보면|제안|실천)/,
    askTemplate: '이 글에서 배운 것을 우리 반에서 해 본다면 무엇부터 하면 좋을까?'
  }
];

var SIGNAL_DEFAULT_TARGET_ = {
  key: 'grounded_reading', label: '자료 근거로 읽기',
  behavior: '지문에 적힌 것을 근거로 들어 말한다',
  markers: /(자료|글에|여기|이\s*문장|나와\s*있|적혀|써\s*있)/,
  askTemplate: '글에서 가장 중요하다고 생각한 부분은 어디야?'
};

/**
 * 성취기준 문장과 교사 메모에서 표적을 고른다. 둘을 넘으면 대화가 길어져 앞의 둘만.
 * 원본과 다른 점 하나: GAS 판 MATERIALS.standard 칸에는 "중심 내용을 찾아…" 같은
 * 학습 목표 문장이 들어오므로 "중심 내용"도 main_idea로 잡는다.
 */
function buildStandardTargets(standard, memo) {
  var source = (String(standard || '') + ' ' + String(memo || '')).trim();
  if (!source) return [SIGNAL_DEFAULT_TARGET_];
  var hit = function (words) { return words.some(function (w) { return source.indexOf(w) >= 0; }); };
  var picked = [];
  var take = function (key) {
    var found = SIGNAL_TARGETS_.filter(function (t) { return t.key === key; })[0];
    if (found && !picked.some(function (t) { return t.key === key; })) picked.push(found);
  };
  if (hit(['점검', '성찰', '돌아보', '과정을'])) take('monitor_reading');
  if (hit(['중심 생각', '중심생각', '중심 내용', '중심내용', '요지', '주제', '파악'])) take('main_idea');
  if (hit(['원인', '영향', '까닭', '왜'])) take('cause_effect');
  if (hit(['예측', '예상'])) take('predict');
  if (hit(['주장', '근거', '논증', '타당', '설득'])) take('claim_evidence');
  if (hit(['비교', '견주'])) take('compare');
  if (hit(['적용', '해결', '제안', '실천'])) take('apply');
  return picked.length > 0 ? picked.slice(0, 2) : [SIGNAL_DEFAULT_TARGET_];
}

// ---------------------------------------------------------------------------
// 낱말
// ---------------------------------------------------------------------------

var SIGNAL_QUESTION_WORD_ = /(왜|어떻게|무엇|뭐|어디|언제|누가|누구|몇|얼마나|어느)/;
var SIGNAL_QUESTION_REQUEST_END_ = /(?:나요|까요|건가요|거예요|뭐예요|뭔가요|무슨\s*뜻|알려\s*주세요|설명해\s*주세요)[.!]?$/;
var SIGNAL_NON_QUESTION_STATE_ = /(모르|생각해|같아|느꼈|알겠|궁금한지\s*모르)[^?？]*[.!]?$/;
var SIGNAL_BLOCKED_REQUEST_ = /(전화번호|주소|비밀번호|주민번호|실명|내\s*이름|제\s*이름|대신\s*써|정답\s*알려|숙제.*해\s*줘)/;
var SIGNAL_OBVIOUS_OFF_TOPIC_ = /(게임|아이돌|유튜브|배고|졸려|심심|먹고\s*싶|놀고\s*싶)/;

function signalNormalizeWord_(word) {
  var normalized = String(word).toLowerCase();
  if (!/[가-힣]/.test(normalized)) return normalized;
  var stem = normalized.replace(
    /(?:으로부터|에게서|한테서|에서는|에서도|이라고|에게|한테|께서|으로|에는|에도|처럼|보다|까지|부터|만큼|조차|마저|라도|이나|라고|은|는|이|가|을|를|와|과|의|도|만|로)$/, ''
  );
  return stem.length >= 2 ? stem : normalized;
}

/** 지문의 '내용 낱말' — 관련 질문 판정용. 조사를 뗀다. */
function signalContentWords_(text) {
  var seen = {};
  return String(text || '').split(/[^가-힣A-Za-z0-9]+/)
    .map(function (w) { return signalNormalizeWord_(w.trim()); })
    .filter(function (w) { if (w.length < 2 || seen[w]) return false; seen[w] = true; return true; });
}

/** 지문에서 뜻을 지닌 낱말만 — 신호 판정용. 원본 contentWordsOf. */
function signalContentWordSet_(text) {
  var stop = { '그리고': 1, '하지만': 1, '그런데': 1, '이것': 1, '그것': 1, '우리': 1, '있다': 1, '했다': 1, '이다': 1 };
  var set = {};
  String(text || '').split(/[^가-힣A-Za-z0-9]+/)
    .map(function (w) { return w.trim(); })
    .filter(function (w) { return w.length >= 2; })
    .map(function (w) { return w.replace(/(에서는|에서|이라는|으로|에게|은|는|이|가|을|를|도|만|와|과|의)$/, ''); })
    .filter(function (w) { return w.length >= 2 && !stop[w]; })
    .forEach(function (w) { set[w] = true; });
  return set;
}

function signalLessonWords_(settings) {
  var words = (settings.words || []).map(function (e) { return String(e.term || e || ''); });
  var concepts = (settings.keyConcepts || []).map(String);
  return concepts.concat(words, signalContentWords_(settings.passage || ''));
}

function signalHasLessonWord_(text, settings) {
  var compact = String(text).replace(/\s+/g, '');
  return signalLessonWords_(settings).some(function (w) {
    var word = String(w).replace(/\s+/g, '');
    return word.length >= 2 && compact.indexOf(word) >= 0;
  });
}

function isStudentQuestion(text) {
  var trimmed = String(text || '').trim();
  if (!trimmed) return false;
  if (/[?？]$/.test(trimmed) || SIGNAL_QUESTION_REQUEST_END_.test(trimmed)) return true;
  if (SIGNAL_NON_QUESTION_STATE_.test(trimmed)) return false;
  return SIGNAL_QUESTION_WORD_.test(trimmed) && /(됐어요|돼요|해요|예요|인가요|있나요|없나요)[.!]?$/.test(trimmed);
}

/** 셀 수 있는 학생 질문 — 개인정보·대필 요청은 빼고, 딴소리는 지문 낱말이 있을 때만 */
function isCountableStudentQuestion(text, settings) {
  if (!isStudentQuestion(text) || SIGNAL_BLOCKED_REQUEST_.test(text)) return false;
  return !SIGNAL_OBVIOUS_OFF_TOPIC_.test(text) || signalHasLessonWord_(text, settings);
}

/** 지문 관련 질문 — 1국면에서 4개가 되면 2국면으로 넘어가는 그 질문 */
function isPassageRelatedQuestion(text, settings) {
  if (!isCountableStudentQuestion(text, settings)) return false;
  if (/(뜻|의미|낱말|단어|문장|지문|글쓴이|주장|중심\s*생각|하고\s*싶은\s*말|왜\s*그렇게)/.test(text)) return true;
  return signalHasLessonWord_(text, settings);
}

// ---------------------------------------------------------------------------
// 신호와 점수
// ---------------------------------------------------------------------------

var SIGNAL_HEDGE_ = /(것\s*같|아마|짐작|~?일지도|수도\s*있|아닐까|생각해|듯)/;
var SIGNAL_REASON_ = /(때문|왜냐|까닭|이유|그래서|덕분|니까|으니|아서|어서|라서|거든)/;
var SIGNAL_SELF_ = /(내\s*생각|나는|난\s*|느꼈|느낌|좋았|싫었|놀랐|슬펐|화났|무서|겁나|신기|재미|안타|다행|불쌍|미안|고마|바란다|싶어|같아서)/;

/** 답에서 신호를 찾는다. 반환: { attempted, targetMarker, passageEcho, ownWording, reasonGiven, hedged, selfReference } */
function detectSignals(input) {
  var answer = String(input.answer || '');
  var target = input.target || null;
  var found = {};
  var trimmed = answer.trim();
  if (trimmed.replace(/[\s.!?~]/g, '').length >= 2) found.attempted = true;
  if (!found.attempted) return found;
  if (target && target.markers.test(trimmed)) found.targetMarker = true;
  if (SIGNAL_HEDGE_.test(trimmed)) found.hedged = true;
  if (SIGNAL_REASON_.test(trimmed)) found.reasonGiven = true;
  if (SIGNAL_SELF_.test(trimmed)) found.selfReference = true;
  var passageWords = signalContentWordSet_(input.passage || '');
  var answerWords = signalContentWordSet_(trimmed);
  var shared = 0, total = 0;
  Object.keys(answerWords).forEach(function (w) { total += 1; if (passageWords[w]) shared += 1; });
  if (shared >= 1) found.passageEcho = true;
  if (shared >= 1 && total >= shared + 2) found.ownWording = true;
  return found;
}

/** 성취기준 질문에 대한 답. 시도했으면 최소 2점, 표적 말투가 없으면 3점을 넘지 못한다. */
function scoreStandardResponse(s) {
  if (!s.attempted) return 1;
  if (s.targetMarker && s.passageEcho && (s.reasonGiven || s.ownWording)) return 5;
  if (s.targetMarker && (s.passageEcho || s.reasonGiven)) return 4;
  if (s.targetMarker) return 3;
  return s.passageEcho ? 3 : 2;
}

/** 지문 이해 질문에 대한 답. 지문 근거가 있느냐가 중심. */
function scoreComprehensionResponse(s) {
  if (!s.attempted) return 1;
  if (s.passageEcho && s.ownWording && s.reasonGiven) return 5;
  if (s.passageEcho && s.ownWording) return 4;
  if (s.passageEcho) return 3;
  return 2;
}

/** 생각·의견 질문에 대한 답. 정답이 없으니 '자기 말로 표현했는가'만 본다. */
function scoreOpinionResponse(s) {
  if (!s.attempted) return 1;
  if (s.selfReference && s.reasonGiven && s.passageEcho) return 5;
  if (s.selfReference && (s.reasonGiven || s.passageEcho)) return 4;
  if (s.selfReference) return 3;
  return 2;
}

/** 지문을 넘어서는 질문 — 학생이 '물은' 것을 본다. 자료 밖으로 나갔다고 깎지 않는다. */
function scoreBeyondTextQuestion(s) {
  if (!s.attempted) return 0;
  var reason = s.reasonGiven || s.hedged;
  if (s.passageEcho && reason) return 5;
  if (s.passageEcho) return 4;
  if (reason) return 3;
  return 2;
}

/**
 * 2국면 질문(question: {kind, target?})에 대한 학생 답의 점수.
 * settings.passage 가 지문.
 */
function answerScore(question, answer, settings) {
  var signals = detectSignals({ answer: answer, target: question.target, passage: settings.passage || '' });
  if (question.kind === 'standard') return scoreStandardResponse(signals);
  if (question.kind === 'opinion') {
    var normalized = String(answer).trim().replace(/[.!?？~]/g, '');
    if (/^(모르겠|몰라|글쎄|없어)/.test(normalized)) return 1;
    if (normalized && !/\s/.test(normalized)) return 2;
    return scoreOpinionResponse(signals);
  }
  return scoreComprehensionResponse(signals);
}
