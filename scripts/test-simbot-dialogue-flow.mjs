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

const { createLocalQuestionResult } = await import('../lib/questioning-board.ts');
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
  for (const question of [residentQuestion, '주민들이 반대 하는 이유는 뭐야']) {
    test(`${engineName}: a third-party reason question is not the student's opinion (${question})`, () => {
      const result = run(question);
      assert.equal(result.safetyFlag, false, 'ordinary 주민 discussion must not match a privacy keyword');
      assert.notEqual(result.primaryMove, 'safety_redirect');
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
