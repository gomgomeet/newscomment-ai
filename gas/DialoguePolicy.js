function selectNextMove_(context) {
  const analysis = context.analysis;
  const history = context.history || [];

  if (context.guard.blocked || analysis.studentMove === 'safety') {
    return makePlan_({
      primaryMove: 'safety_redirect',
      hintLevel: 0,
      sourceStatus: 'out_of_scope',
      teacherInterventionFlag: true,
      expectsStudentReply: true,
      isClosing: false,
      reasonCode: context.guard.reason || (analysis.ghostwriting ? 'GHOSTWRITING_REQUEST' : 'SAFETY_REQUEST')
    });
  }

  if (['greeting', 'small_talk', 'repair'].indexOf(analysis.studentMove) >= 0) {
    return makePlan_({ primaryMove: 'receive', hintLevel: 0, sourceStatus: 'out_of_scope',
      expectsStudentReply: false, reasonCode: analysis.studentMove.toUpperCase() });
  }
  if (analysis.studentMove === 'ask_fact') {
    return makePlan_({ primaryMove: 'answer', hintLevel: 0, sourceStatus: 'supported',
      expectsStudentReply: false, reasonCode: 'FACT_REQUEST' });
  }
  if (analysis.studentMove === 'close') {
    return makePlan_({
      primaryMove: 'close',
      hintLevel: 0,
      sourceStatus: 'supported',
      teacherInterventionFlag: false,
      expectsStudentReply: false,
      isClosing: true,
      reasonCode: 'STUDENT_CLOSE'
    });
  }

  if (
    analysis.studentMove === 'request_hint' ||
    analysis.studentMove === 'express_uncertainty'
  ) {
    const previousHints = history.filter(function (turn) {
      return turn.speaker === 'bot' && turn.hintLevel > 0;
    }).length;
    const nextHint = Math.min(3, previousHints + 1);
    return makePlan_({
      primaryMove: 'offer_clue',
      hintLevel: nextHint,
      sourceStatus: 'supported',
      teacherInterventionFlag: previousHints >= 2,
      expectsStudentReply: true,
      isClosing: false,
      reasonCode: previousHints >= 2 ? 'REPEATED_HELP_REQUEST' : 'HELP_REQUEST'
    });
  }

  if (analysis.studentMove === 'revise') {
    return makePlan_({
      primaryMove: 'receive',
      hintLevel: 0,
      sourceStatus: analysis.passageEcho ? 'supported' : 'reasonable_inference',
      teacherInterventionFlag: false,
      expectsStudentReply: true,
      isClosing: false,
      reasonCode: 'REVISION_RECOGNIZED'
    });
  }

  if (analysis.studentMove === 'ask_definition') {
    return makePlan_({
      primaryMove: 'clarify',
      hintLevel: 0,
      sourceStatus: 'supported',
      teacherInterventionFlag: false,
      expectsStudentReply: false,
      isClosing: false,
      reasonCode: 'DEFINITION_REQUEST'
    });
  }

  if (analysis.passageEcho && analysis.reasonGiven) {
    return makePlan_({
      primaryMove: 'receive',
      hintLevel: 0,
      sourceStatus: 'supported',
      teacherInterventionFlag: false,
      expectsStudentReply: true,
      isClosing: false,
      reasonCode: 'EVIDENCE_AND_REASON'
    });
  }

  return makePlan_({
    primaryMove: ['attempt_answer', 'give_evidence'].indexOf(analysis.studentMove) >= 0 ? 'check_evidence' : 'receive',
    hintLevel: 1,
    sourceStatus: analysis.passageEcho ? 'supported' : 'source_insufficient',
    teacherInterventionFlag: false,
    expectsStudentReply: true,
    isClosing: false,
    reasonCode: analysis.passageEcho ? 'REASON_GAP' : 'EVIDENCE_GAP'
  });
}

function makePlan_(values) {
  return {
    primaryMove: values.primaryMove,
    hintLevel: Number(values.hintLevel || 0),
    sourceStatus: values.sourceStatus,
    answerRevealRisk: values.hintLevel >= 3 ? 'medium' : 'low',
    teacherInterventionFlag: Boolean(values.teacherInterventionFlag),
    expectsStudentReply: Boolean(values.expectsStudentReply),
    isClosing: Boolean(values.isClosing),
    reasonCode: values.reasonCode
  };
}
