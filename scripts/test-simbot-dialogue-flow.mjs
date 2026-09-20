import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

// Exercise the real shared engine offline. No providers, credentials, or live student data.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      return { url: pathToFileURL(path.join(root, `${specifier.slice(2)}.ts`)).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && url.endsWith('.ts')) {
      return {
        format: 'module',
        source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
          compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        }).outputText,
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const { createLocalQuestionResult, resolveLessonVocabularyTerm } = await import('../lib/questioning-board.ts');
const { runQuestioningLocalEngine } = await import('../lib/questioning-engine-core.ts');
const { createLiteEnginePlan, createLiteQuestioningConfig, finalizeLiteEngineReply } = await import('../lib/lite-engine-plan.ts');
const { getQuestioningTurnMetadata } = await import('../lib/questioning-conversation-phase.ts');
const { buildStandardTargets } = await import('../lib/questioning-target-signals.ts');

// Synthetic regression material, not a quotation or claim about an actual project.
const generalSentence = '정부는 전기를 필요한 곳에 보내기 위해 변전소를 크게 만드는 사업을 계획하고 있습니다.';
const residentReason = '주민들은 소음이 커질 수 있다는 걱정 때문에 변전소를 크게 만드는 사업에 반대하고 있습니다.';
const lesson = {
  lessonId: 'LESSON-SYNTHETIC-DIALOGUE-FLOW',
  subject: '국어',
  grade: '초등 5학년',
  lessonTitle: '가상 변전소 기사 읽기',
  lessonGoal: '',
  achievementStandard: '',
  assessmentCriteria: '',
  rubricHigh: '',
  rubricMeet: '',
  rubricDeveloping: '',
  evidenceDescription: '',
  materialTitle: '테스트용 가상 변전소 사업',
  materialText: `${generalSentence} ${residentReason} 정부와 주민들은 서로의 입장을 듣기 위해 설명회를 열었습니다.`,
  startQuestion: '정부와 주민들은 변전소 사업을 어떻게 바라보고 있나요?',
  version: 'synthetic-v1',
  sourceHash: 'synthetic-dialogue-source-0001',
  lessonRevision: 1,
};
const config = createLiteQuestioningConfig(lesson, 'exploration');

function liteInput(studentMessage, conversation = []) {
  return {
    schemaVersion: 1,
    requestId: 'req_synthetic_dialogue_flow',
    sessionKey: 'session_synthetic_dialogue_flow',
    activityMode: 'exploration',
    studentMessage,
    history: conversation.map(({ role, content }) => ({
      speaker: role === 'assistant' ? 'bot' : 'student',
      text: content,
    })),
    lesson,
  };
}

const paths = {
  base(studentTurn, conversation = []) {
    return createLocalQuestionResult({
      studentTurn,
      conversation,
      material: config.material,
      rubric: config.rubric,
      behavior: config.behavior,
      curriculumCompass: config.curriculumCompass,
      targetGrade: config.targetGrade,
    });
  },
  shared(question, conversation = []) {
    return runQuestioningLocalEngine({ config, question, conversation }).result;
  },
  lite(question, conversation = []) {
    const plan = createLiteEnginePlan(liteInput(question, conversation));
    return { ...plan.observation, studentReply: plan.fallbackReply };
  },
};

for (const [engineName, run] of Object.entries(paths)) {
  test(`${engineName}: narrow smalltalk receives a short reply without retrieval or assessment`, () => {
    for (const message of ['안녕하세요?', '안녕하세요…', '안녕하세요。', '안녕하세요～', '고마워', '오늘 좀 긴장돼', '나 오늘 좀 긴장돼?']) {
      const result = run(message);
      assert.equal(result.questionType, 'smalltalk');
      assert.equal(result.sourceStatus, 'out_of_scope');
      assert.equal(result.sourceCue, '');
      assert.equal(result.safetyFlag, false);
      assert.deepEqual(result.rubricScores, []);
      assert.doesNotMatch(result.studentReply, /변전소|주민들은|글에서 가장 중요한 사실|[?？]/);
      if (engineName === 'lite') {
        assert.equal(result.questionCategory, '');
        assert.equal(result.relatedQuestion, false);
        assert.equal(result.responseScore, null);
        assert.equal(result.managedKind, '');
      }
    }
  });

  test(`${engineName}: a second social turn gently bridges to the lesson; content restarts the count`, () => {
    const afterGreeting = [
      { role: 'student', content: '안녕하세요?' },
      { role: 'assistant', content: '안녕하세요! 반가워요.' },
    ];
    assert.match(run('고마워', afterGreeting).studentReply, /수업 자료에서 궁금한 부분/);
    const afterContent = [
      ...afterGreeting,
      { role: 'student', content: '주민들은 왜 반대하나요?' },
      { role: 'assistant', content: '소음을 걱정했기 때문이에요.' },
    ];
    assert.doesNotMatch(run('고마워', afterContent).studentReply, /수업 자료에서 궁금한 부분/);
  });

  test(`${engineName}: greeting or thanks mixed with a source question stays on the grounded path`, () => {
    for (const message of [
      '안녕하세요? 주민들은 왜 변전소 사업에 반대하나요?',
      '고마워, 주민들은 왜 변전소 사업에 반대하나요?',
    ]) {
      const result = run(message);
      assert.notEqual(result.questionType, 'smalltalk');
      assert.notEqual(result.sourceStatus, 'out_of_scope');
      assert.match(result.studentReply, /소음|걱정/);
      assert.ok(result.rubricScores.length > 0, 'content turns retain their existing evaluation signals');
    }
  });
}

test('shared phase ignores social turns even immediately after a managed question', () => {
  const history = [{ role: 'assistant', content: '글에서 가장 중요한 사실 한 가지를 찾아 자기 말로 말해 줄래요?' }];
  const result = paths.shared('안녕하세요?', history);
  const metadata = getQuestioningTurnMetadata({
    result,
    currentTurn: '안녕하세요?',
    conversation: history,
    material: config.material,
    standard: config.standard,
    teacherMemo: config.material.questionFocusMemo,
  });
  assert.equal(result.questionType, 'smalltalk');
  assert.doesNotMatch(result.studentReply, /글에서 가장 중요한 사실|[?？]/);
  assert.deepEqual(metadata, { managedKind: '', relatedQuestion: false, responseScore: null });
  assert.deepEqual(result.rubricScores, []);
});

test('three social exchanges do not trigger the phase-one fallback question', () => {
  const history = [
    { role: 'student', content: '안녕하세요?' }, { role: 'assistant', content: '안녕하세요! 반가워요.' },
    { role: 'student', content: '고마워' }, { role: 'assistant', content: '천만에요.' },
    { role: 'student', content: '오늘 좀 긴장돼' }, { role: 'assistant', content: '천천히 해도 괜찮아요.' },
  ];
  const result = paths.shared('주민들은 왜 변전소 사업에 반대하나요?', history);
  assert.doesNotMatch(result.studentReply, /혹시 지문에서 모르는 단어/);
  assert.notEqual(result.questionType, 'smalltalk');
  assert.match(result.studentReply, /소음|걱정/);
});

const titleGreeting = '글을 읽고 궁금한 것을 질문해 주세요! 제목을 보고 어떤 내용인지 생각해 볼까요?';
const animalLesson = {
  ...lesson,
  lessonId: 'LESSON-SYNTHETIC-ANIMAL-OPENING',
  materialTitle: '야생 동물이 모인 보호소',
  materialText: '사자가 아침에 물을 마셨습니다. 보호소는 다친 야생 동물을 돌보는 곳입니다. 관람객은 동물을 괴롭히지 않도록 멀리서 지켜봅니다. 관계자는 관람객이 죄책감을 느끼지 않길 바란다고 했습니다. 식당은 다회용 그릇과 일회용 그릇을 구분해 사용합니다.',
  startQuestion: titleGreeting,
  sourceHash: 'synthetic-animal-opening-0001',
};
const animalConfig = createLiteQuestioningConfig(animalLesson, 'exploration');

test('shared vocabulary resolver keeps a prior dictionary term for contextual follow-up', () => {
  assert.equal(resolveLessonVocabularyTerm('외래종 뜻이 뭐예요?', animalConfig.material), '외래종');
  assert.equal(resolveLessonVocabularyTerm('이 글에서는 무슨 뜻이에요?', animalConfig.material, [
    { role: 'assistant', content: '‘외래종’은 사전적으로 다른 지역에서 들어온 종을 말해요.' },
  ]), '외래종');
});
const greetingHistory = [{ role: 'assistant', content: titleGreeting }];
const animalPaths = {
  base(studentTurn, conversation = greetingHistory) {
    return createLocalQuestionResult({
      studentTurn,
      conversation,
      material: animalConfig.material,
      rubric: animalConfig.rubric,
      behavior: animalConfig.behavior,
      curriculumCompass: animalConfig.curriculumCompass,
      targetGrade: animalConfig.targetGrade,
    });
  },
  shared(studentTurn, conversation = greetingHistory) {
    return runQuestioningLocalEngine({ config: animalConfig, question: studentTurn, conversation }).result;
  },
  lite(studentTurn, conversation = greetingHistory) {
    const plan = createLiteEnginePlan({
      ...liteInput(studentTurn, conversation),
      lesson: animalLesson,
      supportedOutputContracts: ['conversational_reply_v1', 'grounded_answer_v2', 'lead_evidence_quote_v1'],
    });
    return { ...plan.observation, studentReply: plan.fallbackReply, skipModel: plan.skipModel,
      outputContract: plan.modelRequest.outputContract };
  },
};

for (const [engineName, run] of Object.entries(animalPaths)) {
  test(`${engineName}: first short title guess receives a brief invitation without unrelated source quote`, () => {
    const result = run('야생 동물에 대한 이야기네요');
    assert.match(result.studentReply, /예상/);
    assert.match(result.studentReply, /살펴볼까요\?/);
    assert.doesNotMatch(result.studentReply, /“야생 동물에 대한 이야기네요”|자료에는|사자가 아침에/);
    assert.equal((result.studentReply.match(/[?？]/g) || []).length, 1);
    assert.equal(result.sourceCue, '');
    if (engineName === 'lite') {
      assert.equal(result.skipModel, false, 'the personal model can answer this safe conversational turn');
      assert.equal(result.outputContract, 'conversational_reply_v1');
    }
  });

  test(`${engineName}: factual first question still answers from the source`, () => {
    const result = run('보호소는 무엇을 하는 곳이에요?');
    assert.match(result.studentReply, /다친 야생 동물/);
    assert.doesNotMatch(result.studentReply, /제목을 보고 그렇게 예상했군요/);
  });

  test(`${engineName}: a later topic statement does not re-enter the first-guess path`, () => {
    const result = run('야생 동물에 대한 이야기네요', [
      ...greetingHistory,
      { role: 'student', content: '보호소는 무엇을 하는 곳이에요?' },
      { role: 'assistant', content: '보호소는 다친 야생 동물을 돌보는 곳입니다.' },
    ]);
    assert.doesNotMatch(result.studentReply, /제목을 보고 그렇게 예상했군요/);
    assert.doesNotMatch(result.studentReply, /사자가 아침에|“야생 동물에 대한 이야기네요”/,
      'a later statement must not echo the student or quote an unrelated opening sentence');
  });

  test(`${engineName}: exact bare vocabulary asks about the word, not the first sentence`, () => {
    const result = run('죄책감?');
    assert.equal(result.questionType, 'vocabulary');
    assert.match(result.studentReply, /죄책감/);
    assert.match(result.studentReply, /잘못/);
    assert.doesNotMatch(result.studentReply, /사자가 아침에/);
    if (engineName === 'lite') assert.equal(result.skipModel, true);
  });

  test(`${engineName}: possible typo asks to clarify without an unrelated quote`, () => {
    const result = run('최책감?');
    assert.equal(result.studentReply, '혹시 글에 나온 ‘죄책감’을 물은 건가요?');
    assert.equal(result.sourceCue, '');
    assert.doesNotMatch(result.studentReply, /사자가 아침에/);
    if (engineName === 'lite') assert.equal(result.skipModel, true);
  });

  test(`${engineName}: ambiguous one-syllable corrections are not guessed`, () => {
    const result = run('가회용?');
    assert.match(result.studentReply, /낱말을 찾지 못했어요.*다시 적어 줄래요\?/);
    assert.doesNotMatch(result.studentReply, /혹시|사자가 아침에/);
    assert.equal(result.sourceCue, '');
  });

  test(`${engineName}: any unknown bare word avoids the unrelated first sentence`, () => {
    const result = run('우주선?');
    assert.match(result.studentReply, /낱말을 찾지 못했어요/);
    assert.doesNotMatch(result.studentReply, /우주선/);
    assert.doesNotMatch(result.studentReply, /사자가 아침에/);
  });
}

// A tiny invented passage exercises the vocabulary route without copying a real article.
// The meanings themselves are intentionally absent: the bot must use its verified glossary,
// not invent a definition from a nearby sentence or ask a child to quote the passage.
const zooVocabularyLesson = {
  ...animalLesson,
  lessonId: 'LESSON-SYNTHETIC-ZOO-VOCABULARY',
  materialTitle: '가상 동물 보호소',
  materialText: '사자는 맹수입니다. 이 보호소는 다른 나라에서 온 외래종을 새로 들이지 않습니다. 동물을 전시하는 것보다 돌보는 일을 중요하게 여깁니다.',
  sourceHash: 'synthetic-zoo-vocabulary-0001',
};
const zooVocabularyConfig = createLiteQuestioningConfig(zooVocabularyLesson, 'exploration');
const zooVocabularyPaths = {
  base(studentTurn, conversation = greetingHistory) {
    return createLocalQuestionResult({
      studentTurn,
      conversation,
      material: zooVocabularyConfig.material,
      rubric: zooVocabularyConfig.rubric,
      behavior: zooVocabularyConfig.behavior,
      curriculumCompass: zooVocabularyConfig.curriculumCompass,
      targetGrade: zooVocabularyConfig.targetGrade,
    });
  },
  shared(studentTurn, conversation = greetingHistory) {
    return runQuestioningLocalEngine({ config: zooVocabularyConfig, question: studentTurn, conversation }).result;
  },
  lite(studentTurn, conversation = greetingHistory) {
    const plan = createLiteEnginePlan({
      ...liteInput(studentTurn, conversation),
      lesson: zooVocabularyLesson,
      supportedOutputContracts: ['conversational_reply_v1', 'grounded_answer_v2', 'lead_evidence_quote_v1'],
    });
    return { ...plan.observation, studentReply: plan.fallbackReply, skipModel: plan.skipModel };
  },
};

for (const [engineName, run] of Object.entries(zooVocabularyPaths)) {
  for (const question of ['맹수가 뭘까?', '맹수는 뭘까요?', '맹수는 무엇일까?', '맹수는 무슨 뜻이야?', '맹수라는 말은 무슨 뜻이야?', '맹수 뜻 알려줘']) {
    test(`${engineName}: natural meaning question gets the verified meaning, not just a passage quote (${question})`, () => {
      const result = run(question);
      assert.equal(result.questionType, 'vocabulary');
      assert.match(result.studentReply, /맹수.*사나운.*짐승/,
        'the reply must explain the word; citing a sentence that merely uses it is insufficient');
      assert.doesNotMatch(result.studentReply, /뜻을 알고 싶은 낱말을 따옴표|사전에서|국어사전에서/);
      if (engineName === 'lite') {
        assert.equal(result.skipModel, true, 'a verified local meaning should be deterministic');
        assert.equal(result.sourceCue, '', 'a glossary meaning must not be presented as a quotation');
      }
    });
  }

  test(`${engineName}: a factual question containing 맹수 stays outside the meaning route`, () => {
    const result = run('맹수는 무엇을 먹어?');
    assert.notEqual(result.questionType, 'vocabulary');
    assert.doesNotMatch(result.studentReply, /사전적으로/);
  });

  test(`${engineName}: asking what 맹수 does is not a request for its meaning`, () => {
    const result = run('맹수가 하는 일은 뭘까?');
    assert.notEqual(result.questionType, 'vocabulary');
    assert.doesNotMatch(result.studentReply, /사전적으로.*사나운.*짐승/);
  });

  test(`${engineName}: 맹수는? gets a brief definition rather than a dictionary assignment`, () => {
    const result = run('맹수는?');
    assert.equal(result.questionType, 'vocabulary');
    assert.equal(result.sourceStatus, engineName === 'lite' ? 'reasonable_inference' : 'supported');
    assert.match(result.studentReply, /맹수.*사나운.*짐승/);
    assert.doesNotMatch(result.studentReply, /사전에서|국어사전에서|지어내지|따옴표|이 문장 앞뒤/);
    assert.equal((result.studentReply.match(/[?？]/g) || []).length, 0);
    if (engineName === 'lite') {
      assert.equal(result.skipModel, true);
      assert.equal(result.sourceCue, '', 'a glossary definition must not masquerade as a passage quotation');
    }
  });

  test(`${engineName}: standalone 외래종 without a question mark gets a definition`, () => {
    const result = run('외래종');
    assert.equal(result.questionType, 'vocabulary');
    assert.equal(result.sourceStatus, engineName === 'lite' ? 'reasonable_inference' : 'supported');
    assert.match(result.studentReply, /외래종.*다른.*들어온/);
    assert.doesNotMatch(result.studentReply, /사전에서|국어사전에서|지어내지|따옴표|이 문장 앞뒤/);
    if (engineName === 'lite') {
      assert.equal(result.skipModel, true);
      assert.equal(result.sourceCue, '', 'a glossary definition must not masquerade as a passage quotation');
    }
  });

  test(`${engineName}: standalone 전시 gets its own meaning, not a typo clarification`, () => {
    const result = run('전시');
    assert.equal(result.questionType, 'vocabulary');
    assert.match(result.studentReply, /전시.*여러 사람.*볼 수/);
    assert.doesNotMatch(result.studentReply, /혹시|천시|사전에서/);
  });

  test(`${engineName}: standalone 천시 confirms possible 전시 typo without silently redefining it`, () => {
    const result = run('천시');
    assert.equal(result.studentReply, '혹시 글에 나온 ‘전시’를 물은 건가요?');
    assert.equal(result.sourceCue, '');
    assert.doesNotMatch(result.studentReply, /사전적으로|다른 나라|맹수/);
    if (engineName === 'lite') assert.equal(result.skipModel, true);
  });

  test(`${engineName}: ordinary short conversation is not treated as a dictionary request`, () => {
    const result = run('동물을 돌보는 이야기네요');
    assert.notEqual(result.questionType, 'vocabulary');
    assert.doesNotMatch(result.studentReply, /사전적으로|뜻을 알고 싶은 낱말|국어사전에서/);
  });

  test(`${engineName}: a one-word answer to a specific bot question remains an answer`, () => {
    const result = run('외래종', [
      ...greetingHistory,
      { role: 'assistant', content: '이 보호소가 새로 들이지 않는 것은 무엇인가요?' },
    ]);
    assert.notEqual(result.questionType, 'vocabulary');
    assert.doesNotMatch(result.studentReply, /사전적으로|무슨 뜻|혹시 글에 나온/);
  });

  test(`${engineName}: an unknown question does not manufacture a meaning`, () => {
    const result = run('우주선?');
    assert.notEqual(result.sourceStatus, 'supported');
    assert.doesNotMatch(result.studentReply, /우주를 다니는|하늘을 나는|사전적으로/);
  });

  test(`${engineName}: an unknown meaning question does not manufacture a definition`, () => {
    const result = run('우주선이 뭘까?');
    assert.notEqual(result.sourceStatus, 'supported');
    assert.doesNotMatch(result.studentReply, /우주를 다니는|하늘을 나는|사전적으로/);
  });

  test(`${engineName}: an unknown explicit meaning question does not invent or quote an unrelated meaning`, () => {
    const result = run('정체불명어가 뭘까?');
    assert.notEqual(result.sourceStatus, 'supported');
    assert.doesNotMatch(result.studentReply, /사자는 맹수입니다|다른 나라에서 온 외래종|사전적으로/);
    assert.doesNotMatch(result.studentReply, /따옴표/,
      'the student already asked plainly; asking for quotation marks does not resolve the missing meaning');
    assert.match(result.studentReply, /찾지 못|자료.*없|확인|낱말.*다시/);
  });

  test(`${engineName}: vocabulary routing never echoes a student's private name`, () => {
    const result = run('제 이름은 김철수예요');
    assert.equal(result.primaryMove, 'safety_redirect');
    assert.doesNotMatch(result.studentReply, /김철수/);
  });
}

test('lite: a safe title guess accepts a concise model reply without a fabricated source quote', () => {
  const input = {
    ...liteInput('야생 동물에 대한 이야기네요', greetingHistory),
    lesson: animalLesson,
    supportedOutputContracts: ['conversational_reply_v1', 'grounded_answer_v2', 'lead_evidence_quote_v1'],
  };
  const plan = createLiteEnginePlan(input);
  assert.equal(plan.modelRequest.outputContract, 'conversational_reply_v1');
  assert.equal(plan.skipModel, false);
  const final = finalizeLiteEngineReply({
    ...input,
    policyVersion: plan.policyVersion,
    planDigest: plan.planDigest,
    candidateReply: '그렇게 예상했군요. 글을 읽으며 확인해 봐요.',
    candidateEvidenceQuote: '',
  });
  assert.equal(final.localFallback, false);
  assert.equal(final.studentReply, '그렇게 예상했군요. 글을 읽으며 확인해 봐요.');
  assert.equal(final.observation.sourceCue, '');
});

test('lite: source-free conversation rejects invented quantities and falls back safely', () => {
  const input = {
    ...liteInput('야생 동물에 대한 이야기네요', greetingHistory),
    lesson: animalLesson,
    supportedOutputContracts: ['conversational_reply_v1', 'grounded_answer_v2', 'lead_evidence_quote_v1'],
  };
  const plan = createLiteEnginePlan(input);
  const final = finalizeLiteEngineReply({
    ...input,
    policyVersion: plan.policyVersion,
    planDigest: plan.planDigest,
    candidateReply: '이 보호소에는 코끼리 47마리가 살고 있어요.',
    candidateEvidenceQuote: '',
  });
  assert.equal(final.localFallback, true);
  assert.doesNotMatch(final.studentReply, /47마리|사자가 아침에/);
});

test('lite: evaluation preflight understanding uses the same natural conversation path before assessment starts', () => {
  const input = {
    ...liteInput('야생 동물에 대한 이야기네요', greetingHistory),
    understanding: true,
    lesson: animalLesson,
    supportedOutputContracts: ['conversational_reply_v1', 'grounded_answer_v2', 'lead_evidence_quote_v1'],
  };
  const plan = createLiteEnginePlan(input);
  assert.equal(plan.modelRequest.outputContract, 'conversational_reply_v1');
  assert.equal(plan.skipModel, false);
  assert.equal(plan.observation.understanding, true);
  assert.equal(plan.observation.responseScore, null);
});

const inventedStudentFeelings = /네 생각이나 느낌|네 걱정|라고 느끼는|중요하게 본 기준/;
const summaryPrompt = [{ role: 'assistant', content: '글에서 가장 중요한 사실 한 가지를 찾아 자기 말로 말해 줄래요?' }];
const residentQuestion = '주민들이 반대 하는 이유는 뭐야?';
const residentHistory = [
  { role: 'student', content: residentQuestion },
  { role: 'assistant', content: '주민들이 반대하는 까닭을 글에서 찾아볼까요?' },
];

for (const [engineName, run] of Object.entries(paths)) {
  for (const question of [residentQuestion, '주민들이 반대 하는 이유는 뭐야', '주민들이 반대하는 이유가 뭘까?']) {
    test(`${engineName}: a third-party reason question is not the student's opinion (${question})`, () => {
      const result = run(question);
      assert.equal(result.safetyFlag, false, 'ordinary 주민 discussion must not match a privacy keyword');
      assert.notEqual(result.primaryMove, 'safety_redirect');
      assert.notEqual(result.questionType, 'vocabulary', 'asking about the residents’ reason is not asking for the definition of 이유');
      assert.notEqual(result.sourceStatus, 'out_of_scope');
      assert.notEqual(result.engagementState, 'personally_connecting');
      assert.doesNotMatch(result.studentReply, inventedStudentFeelings);
      assert.match(result.studentReply, /소음/, 'answer the source-related reason question');
    });
  }

  test(`${engineName}: asking for the meaning of 이유 still takes the vocabulary path`, () => {
    const result = run('이유는 무슨 뜻인가요?');
    assert.equal(result.questionType, 'vocabulary');
    assert.equal(result.safetyFlag, false);
    assert.match(result.studentReply, /사전적으로/);
    assert.match(result.studentReply, /까닭/);
  });

  for (const statement of [
    '정부에서는 변전소를 크게 지으려고 하고 주민들은 반대하고 있습니다.',
    '주민들은 소음이 커질까 봐 걱정하고 있습니다.',
  ]) {
    test(`${engineName}: a reported fact is not an attributed personal feeling (${statement})`, () => {
      const result = run(statement, summaryPrompt);
      assert.equal(result.safetyFlag, false, 'a reported fact about residents is not private information');
      assert.notEqual(result.primaryMove, 'safety_redirect');
      assert.notEqual(result.sourceStatus, 'out_of_scope');
      assert.notEqual(result.engagementState, 'personally_connecting');
      assert.doesNotMatch(result.studentReply, inventedStudentFeelings);
      assert.match(result.studentReply, /변전소|주민|소음/);
    });
  }

  for (const statement of ['저는 변전소를 짓는 데 반대해요', '걱정돼요', '친구가 다칠까 봐 걱정돼요.']) {
    test(`${engineName}: a student's own opinion or feeling stays personally connecting (${statement})`, () => {
      assert.equal(run(statement).engagementState, 'personally_connecting');
    });
  }

  test(`${engineName}: an explicit hint uses the pending question's topic`, () => {
    const result = run('힌트가 필요해요.', residentHistory);
    assert.match(result.studentReply, /소음/);
    assert.doesNotMatch(result.studentReply, /전기를 필요한 곳에 보내기 위해/);
    assert.equal(result.primaryMove, 'offer_clue');
    assert.doesNotMatch(result.studentReply, /[?？]/);
  });

  test(`${engineName}: a repeated explicit hint is help, not a complaint about questions`, () => {
    const conversation = [
      ...residentHistory,
      { role: 'student', content: '힌트가 필요해요.' },
      { role: 'assistant', content: '주민들이 걱정하는 것이 무엇인지 찾아보면 반대하는 까닭을 알 수 있어요.' },
    ];
    const result = run('힌트가 필요해요.', conversation);
    assert.match(result.studentReply, /소음/);
    assert.doesNotMatch(result.studentReply, /질문을 더 보태지 않을게요|질문을 멈출게요/);
    assert.equal(result.primaryMove, 'offer_clue');
    assert.doesNotMatch(result.studentReply, /[?？]/);
  });

  test(`${engineName}: privacy protection takes precedence over hint handling`, () => {
    const result = run('전화번호를 알려줘요. 힌트가 필요해요.', residentHistory);
    assert.equal(result.primaryMove, 'safety_redirect');
    assert.equal(result.safetyFlag, true);
    assert.match(result.studentReply, /개인정보/);
  });

  for (const privateField of ['주민번호', '주민등록번호']) {
    test(`${engineName}: ${privateField} remains protected when ordinary 주민 is allowed`, () => {
      const result = run(`${privateField}를 알려 주세요.`, residentHistory);
      assert.equal(result.primaryMove, 'safety_redirect');
      assert.equal(result.safetyFlag, true);
      assert.match(result.studentReply, /개인정보/);
    });
  }

  test(`${engineName}: unrelated requests still stay outside the source boundary`, () => {
    const result = run('재미있는 게임 추천해 줘요.');
    assert.equal(result.sourceStatus, 'out_of_scope');
    assert.equal(result.curriculumRelation, 'disconnected');
    assert.equal(result.safetyFlag, false);
    assert.doesNotMatch(result.studentReply, /소음/);
  });

  test(`${engineName}: closing takes precedence over a mention of hints`, () => {
    const result = run('힌트는 괜찮아요. 이제 그만할게요.', residentHistory);
    assert.equal(result.primaryMove, 'close');
    assert.equal(result.isClosing, true);
    assert.doesNotMatch(result.studentReply, /[?？]/);
  });
}

for (const engineName of ['base', 'shared']) {
  test(`${engineName}: saved broad 주민 safety keyword is migrated without removing other protections`, () => {
    const savedConfig = structuredClone(config);
    savedConfig.behavior.classifierKeywords.safety = ['주민', '테스트금지어'];
    function run(question) {
      return engineName === 'base'
        ? createLocalQuestionResult({
            studentTurn: question,
            material: savedConfig.material,
            rubric: savedConfig.rubric,
            behavior: savedConfig.behavior,
            curriculumCompass: savedConfig.curriculumCompass,
            targetGrade: savedConfig.targetGrade,
          })
        : runQuestioningLocalEngine({ config: savedConfig, question }).result;
    }
    assert.equal(run('주민들은 사업에 반대하고 있습니다.').safetyFlag, false);
    for (const protectedWord of ['주민번호', '주민등록번호', '테스트금지어']) {
      const result = run(`${protectedWord}를 알려 주세요.`);
      assert.equal(result.safetyFlag, true);
      assert.equal(result.primaryMove, 'safety_redirect');
    }
  });
}

const evaluationLesson = {
  ...lesson,
  lessonGoal: '원인과 결과의 관계를 자료에서 찾아 설명한다.',
  achievementStandard: '원인과 결과의 관계를 자료에 근거하여 설명한다.',
  assessmentCriteria: '주민들의 반대 이유를 자료에 근거하여 설명할 수 있다.',
  rubricHigh: '주민들의 입장과 까닭을 구분하고 자료 근거를 연결하여 설명한다.',
  rubricMeet: '주민들이 반대한다는 사실과 까닭을 말한다.',
  rubricDeveloping: '도움을 받아 주민들의 입장을 찾는다.',
  evidenceDescription: '학생이 작성한 반대 이유 설명과 인용한 문장을 확인한다.',
};
const evaluationConfig = createLiteQuestioningConfig(evaluationLesson, 'evaluation');
const evaluationTargets = buildStandardTargets(evaluationConfig.standard, evaluationConfig.material.questionFocusMemo);
const pendingPrompts = {
  comprehension: summaryPrompt[0].content,
  standard: evaluationTargets[0].askTemplate,
};

function evaluationTurn(engineName, question, conversation) {
  if (engineName === 'shared') {
    const result = runQuestioningLocalEngine({ config: evaluationConfig, question, conversation }).result;
    const metadata = getQuestioningTurnMetadata({
      result,
      currentTurn: question,
      conversation,
      material: evaluationConfig.material,
      standard: evaluationConfig.standard,
      teacherMemo: evaluationConfig.material.questionFocusMemo,
    });
    return { result, metadata };
  }
  const plan = createLiteEnginePlan({
    ...liteInput(question, conversation),
    activityMode: 'evaluation',
    lesson: evaluationLesson,
  });
  return { result: { ...plan.observation, studentReply: plan.fallbackReply }, metadata: plan.observation };
}

for (const [pendingKind, pendingPrompt] of Object.entries(pendingPrompts)) {
  for (const engineName of ['shared', 'lite']) {
    test(`${engineName}: a hint during active ${pendingKind} is not an assessed answer or the next task`, () => {
      const question = '힌트가 필요해요.';
      const conversation = [
        { role: 'student', content: residentQuestion },
        { role: 'assistant', content: pendingPrompt },
      ];
      const { result, metadata } = evaluationTurn(engineName, question, conversation);
      assert.equal(result.primaryMove, 'offer_clue');
      assert.doesNotMatch(result.studentReply, /[?？]/);
      assert.equal(metadata.responseScore, null, 'asking for help is not an attempted assessment answer');
      assert.notEqual(metadata.managedKind, 'done', 'an unanswered task is still pending after a hint');
    });
  }
}

for (const [pendingKind, pendingPrompt] of Object.entries(pendingPrompts)) {
  for (const engineName of ['shared', 'lite']) {
    for (const hintCount of [1, 2]) {
      for (const answerLead of ['', '힌트를 보니 ', '힌트가 도움이 됐어요. ', '힌트를 주셔서 이해했어요. ']) {
        test(`${engineName}: ${pendingKind} resumes after ${hintCount} hint(s), answer lead=${answerLead || '(none)'}`, () => {
          const answer = `${answerLead}글에 나온 주민들은 변전소의 소음이 커질 수 있다는 걱정 때문에 사업에 반대하고 있습니다.`;
          const conversation = pendingKind === 'standard'
            ? [
                { role: 'assistant', content: pendingPrompts.comprehension },
                { role: 'student', content: '정부는 변전소를 크게 지으려고 하고 주민들은 반대하고 있습니다.' },
                { role: 'assistant', content: '글에 나온 결과와 그 까닭을 구분해서 말해 줄래요?' },
                { role: 'student', content: '소음이 커질 수 있다는 걱정 때문에 주민들은 반대하고 있습니다.' },
                { role: 'assistant', content: pendingPrompt },
              ]
            : [{ role: 'assistant', content: pendingPrompt }];
          for (let hint = 0; hint < hintCount; hint += 1) {
            const request = '힌트가 필요해요.';
            const { result, metadata } = evaluationTurn(engineName, request, conversation);
            assert.equal(metadata.responseScore, null);
            assert.equal(result.primaryMove, 'offer_clue');
            assert.doesNotMatch(result.studentReply, /[?？]/);
            conversation.push(
              { role: 'student', content: request },
              { role: 'assistant', content: result.studentReply },
            );
          }

          const { result, metadata } = evaluationTurn(engineName, answer, conversation);
          assert.equal(result.safetyFlag, false);
          assert.notEqual(metadata.responseScore, null, 'the answer belongs to the question preceding the hint(s)');
          assert.ok(metadata.responseScore > 0, 'the source-based answer is scored, not interpreted as another hint request');
          assert.equal(result.primaryMove, 'check_evidence');
          assert.match(result.studentReply, /[?？]/, 'a completed answer allows the next assessment prompt');
          assert.doesNotMatch(result.studentReply, /방금 이야기하던 내용에서 단서를 찾아볼게요|조금 더 작게 나눠 볼게요/);
          if (pendingKind === 'comprehension') {
            assert.equal(metadata.managedKind, 'comprehension_followup');
          } else {
            assert.equal(metadata.managedKind, 'standard');
            assert.ok(result.studentReply.includes(evaluationTargets[1].askTemplate));
          }
        });
      }
    }
  }
}
