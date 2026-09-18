/**
 * 자동 관찰 결과는 교사 검수용 초안으로만 저장합니다.
 * 교사 판단·피드백·향상 방법은 자동 갱신으로 덮어쓰지 않습니다.
 */

const LITE_TEACHER_DECISIONS_ = ['판단 보류', '도달', '성장 중', '도움 필요'];
const LITE_FOUR_LEVEL_TEACHER_DECISIONS_ = ['판단 보류', '매우잘함', '잘함', '보통', '노력요함'];
const LITE_FIVE_LEVEL_TEACHER_DECISIONS_ = ['판단 보류', 'A', 'B', 'C', 'D', 'E'];

function liteTeacherDecisionOptions_(rubricScheme) {
  const scheme = normalizeLiteRubricScheme_(rubricScheme);
  if (scheme === 'five_levels') return LITE_FIVE_LEVEL_TEACHER_DECISIONS_.slice();
  return (scheme === 'four_levels'
    ? LITE_FOUR_LEVEL_TEACHER_DECISIONS_ : LITE_TEACHER_DECISIONS_).slice();
}
const LITE_RUBRIC_SCORE_COLUMNS_ = {
  questioning: 'questioningBest',
  passage_comprehension: 'passageComprehensionBest',
  achievement_standard: 'achievementStandardBest',
  reflection_opinion: 'reflectionOpinionBest'
};
const LITE_RUBRIC_LABELS_ = {
  questioning: '질문 만들기',
  passage_comprehension: '자료 이해',
  achievement_standard: '성취기준 연결',
  reflection_opinion: '생각·의견 표현'
};

function liteAutomaticJudgment_(rubricScores) {
  const scores = (Array.isArray(rubricScores) ? rubricScores : [])
    .map(function (item) { return Number(item && item.score); })
    .filter(function (score) { return Number.isFinite(score); });
  if (!scores.length) return { label: '판단 보류', average: 0 };
  const average = scores.reduce(function (sum, score) { return sum + score; }, 0) / scores.length;
  return {
    label: average >= 4 ? '도달' : average >= 2 ? '성장 중' : '도움 필요',
    average: Math.round(average * 10) / 10
  };
}

function liteImprovementSuggestion_(rubricScores) {
  const rows = Array.isArray(rubricScores) ? rubricScores.slice() : [];
  rows.sort(function (a, b) { return Number(a && a.score || 0) - Number(b && b.score || 0); });
  const key = rows[0] && String(rows[0].criterionKey || '');
  const suggestions = {
    questioning: '자료에서 눈에 띄는 낱말이나 사실 한 가지를 골라 “왜” 또는 “어떻게” 질문으로 바꾸어 보세요.',
    passage_comprehension: '답하기 전에 자료에서 관련 문장 한 곳을 다시 찾고, 그 문장을 자기 말로 풀어 보세요.',
    achievement_standard: '자신의 답이 성취기준의 행동과 어떻게 이어지는지 근거 한 가지를 붙여 설명해 보세요.',
    reflection_opinion: '자신의 생각을 먼저 말한 뒤 “왜냐하면” 뒤에 자료 근거나 경험을 한 가지 덧붙여 보세요.'
  };
  return suggestions[key] || '자료에서 근거 한 가지를 다시 찾고, 자신의 말로 설명하는 연습을 해 보세요.';
}

function liteEvidenceSummary_(rubricScores) {
  return (Array.isArray(rubricScores) ? rubricScores : [])
    .map(function (item) {
      const key = String(item.criterionKey || '');
      return (LITE_RUBRIC_LABELS_[key] || key || '관찰 항목') + ' ' + Number(item.score || 0) + '점 · ' + String(item.rationale || '');
    })
    .join('\n');
}

function liteEvaluationReviewVersion_(row) {
  row = row || {};
  return liteFingerprint_([
    row.studentCode, row.sessionId, row.lessonId, row.lessonRevision, row.questionId || '',
    row.automaticJudgment, row.evidenceSummary, row.evidenceRequestIds,
    row.questioningBest, row.passageComprehensionBest,
    row.achievementStandardBest, row.reflectionOpinionBest,
    row.teacherDecision, row.teacherFeedback, row.improvementSuggestion,
    row.nextLessonSuggestion, row.finalStatus, normalizeLiteRubricScheme_(row.rubricScheme)
  ].map(function (value) { return String(value == null ? '' : value); }).join('|'), 32);
}

function upsertLiteEvaluationDraft_(settings, turn, observation, options) {
  if (turn.isPreview) return null;
  if (typeof liteHasRequiredAssessment_ === 'function' && liteHasRequiredAssessment_(settings)) return null;
  if (!observation || observation.isClosing || observation.safetyFlag ||
      observation.primaryMove === 'repair') return null;
  const rawScores = Array.isArray(observation.rubricScores) ? observation.rubricScores : [];
  const hasObservedScore = rawScores.some(function (item) { return Number(item && item.score || 0) > 0; });
  const needsAssessmentResponse = !hasObservedScore ||
    (observation.sourceStatus === 'out_of_scope' && Number(observation.responseScore || 0) <= 0);
  if (needsAssessmentResponse && (turn.activityMode !== 'evaluation' || settings.activityMode !== 'evaluation' ||
      !(settings.expectedAnswer || settings.assessmentEvidence))) return null;
  // 아직 관찰하지 않은 0점은 수행평가 결과로 저장하지 않는다.
  const observedScores = needsAssessmentResponse ? [] : rawScores;
  options = options || {};
  const writeDraft = function () {
    const spreadsheet = options.spreadsheet || getLiteSpreadsheet_();
    if (!options.workbookReady) ensureLiteWorkbook_(spreadsheet);
    let assessmentResponse = '';
    if (needsAssessmentResponse) {
      const current = readLiteTeacherSettings_(spreadsheet, { skipEnsure:true });
      if (String(current.lessonId) !== String(settings.lessonId) ||
          Number(current.lessonRevision || 1) !== Number(settings.lessonRevision || 1) ||
          current.activityMode !== 'evaluation' || !(current.expectedAnswer || current.assessmentEvidence)) return null;
      const sessionRows = liteRowsByColumnValue_(spreadsheet.getSheetByName('질문과 답변'), 'sessionId', turn.sessionId);
      const matches = function (row) {
        return String(row.lessonId) === String(current.lessonId) &&
          Number(row.lessonRevision || 1) === Number(current.lessonRevision || 1) &&
          String(row.sessionId) === String(turn.sessionId) && String(row.studentCode) === String(turn.studentCode) &&
          String(row.isPreview).toLowerCase() !== 'true';
      };
      const seed = sessionRows.some(function (row) {
        return matches(row) && row.speaker === 'bot' && Number(row.turnNo) === 1 &&
          (row.managedKind === 'start' || row.engineStatus === 'seeded_start') &&
          liteText_(row.text) === liteText_(current.startQuestion);
      });
      const response = seed && sessionRows.find(function (row) {
        return matches(row) && row.speaker === 'student' && Number(row.turnNo) === 2 &&
          String(row.requestId) === String(turn.requestId) &&
          String(row.engineStatus || '').indexOf('engine_failed:') !== 0;
      });
      assessmentResponse = response ? liteText_(response.text, LITE_MAX_STUDENT_MESSAGE_) : '';
      if (!assessmentResponse) return null;
    }
    const sheet = spreadsheet.getSheetByName('교사 평가');
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
      .map(function (value) { return String(value).trim(); });
    const rows = liteRowsByColumnValue_(sheet, 'sessionId', turn.sessionId);
    const index = rows.findIndex(function (row) {
      return String(row.studentCode) === String(turn.studentCode) &&
        String(row.sessionId) === String(turn.sessionId) &&
        String(row.lessonId) === String(settings.lessonId) &&
        Number(row.lessonRevision || 1) === Number(settings.lessonRevision || 1) && !row.questionId;
    });
    const previous = index >= 0 ? rows[index] : {};
    const scoresByKey = {};
    observedScores.forEach(function (item) {
      if (item && LITE_RUBRIC_SCORE_COLUMNS_[item.criterionKey]) scoresByKey[item.criterionKey] = item;
    });
    const accumulatedScores = Object.keys(LITE_RUBRIC_SCORE_COLUMNS_).map(function (key) {
      const column = LITE_RUBRIC_SCORE_COLUMNS_[key];
      const current = scoresByKey[key] || {};
      const hasPrevious = previous[column] !== '' && previous[column] != null;
      if (!scoresByKey[key] && !hasPrevious) return null;
      return {
        criterionKey: key,
        score: Math.max(Number(previous[column] || 0), Number(current.score || 0)),
        rationale: String(current.rationale || '')
      };
    }).filter(Boolean);
    const judgment = liteAutomaticJudgment_(accumulatedScores);
    const rubricScheme = normalizeLiteRubricScheme_(index >= 0 ? previous.rubricScheme : settings.rubricScheme);
    const priorStatus = String(previous.finalStatus || '');
    const previousEvidenceLines = String(previous.evidenceSummary || '').split('\n')
      .map(function (line) { return line.trim(); }).filter(Boolean);
    const observedEvidenceLines = liteEvidenceSummary_(observedScores).split('\n')
      .map(function (line) { return line.trim(); }).filter(Boolean);
    if (assessmentResponse) observedEvidenceLines.push('시작 질문 응답: ' + assessmentResponse);
    const previousEvidenceRequestIds = String(previous.evidenceRequestIds || '').split('|')
      .map(function (value) { return value.trim(); }).filter(Boolean);
    const evidenceRequestId = liteText_(turn.requestId, 100);
    const hasNewEvidence = evidenceRequestId
      ? previousEvidenceRequestIds.indexOf(evidenceRequestId) < 0
      : observedEvidenceLines.some(function (line) { return previousEvidenceLines.indexOf(line) < 0; });
    const scoreImproved = accumulatedScores.some(function (item) {
      const column = LITE_RUBRIC_SCORE_COLUMNS_[item.criterionKey];
      return Number(item.score || 0) > Number(previous[column] || 0);
    });
    const requiresRecheck = priorStatus === '최종 확정' && (hasNewEvidence || scoreImproved);
    const evidenceLines = previousEvidenceLines.concat(observedEvidenceLines);
    const evidenceSummary = evidenceLines.filter(function (line, index) {
      return evidenceLines.indexOf(line) === index;
    }).join('\n').slice(-10000);
    const evidenceRequestIds = previousEvidenceRequestIds.concat(evidenceRequestId ? [evidenceRequestId] : [])
      .filter(function (value, index, values) { return values.indexOf(value) === index; })
      .slice(-LITE_ENGINE_REQUESTS_PER_STUDENT_LESSON_)
      .join('|');
    const object = {
      studentCode: turn.studentCode,
      sessionId: turn.sessionId,
      lessonId: settings.lessonId,
      lessonRevision: settings.lessonRevision || 1,
      rubricScheme: rubricScheme,
      automaticJudgment: accumulatedScores.length
        ? '공통 질문행동 관찰 · ' + (rubricScheme !== 'legacy_three' ? '' : judgment.label + ' · ') +
          '평균 ' + judgment.average + '/5 · 교사 기준 판단 전'
        : '시작 질문 응답 수집 · 교사 기준 판단 전',
      evidenceSummary: evidenceSummary,
      evidenceRequestIds: evidenceRequestIds,
      teacherDecision: previous.teacherDecision || '판단 보류',
      teacherFeedback: previous.teacherFeedback || '',
      improvementSuggestion: previous.improvementSuggestion || liteImprovementSuggestion_(accumulatedScores),
      nextLessonSuggestion: previous.nextLessonSuggestion || '',
      finalStatus: requiresRecheck ? '재검수 필요' : (priorStatus || '검수 필요'),
      finalizedAt: requiresRecheck ? '' : (previous.finalizedAt || '')
    };
    accumulatedScores.forEach(function (item) {
      object[LITE_RUBRIC_SCORE_COLUMNS_[item.criterionKey]] = item.score;
    });
    const values = headers.map(function (header) {
      return Object.prototype.hasOwnProperty.call(object, header) ? liteSheetSafeValue_(object[header]) : '';
    });
    if (index >= 0) sheet.getRange(Number(previous.__liteRowNumber || index + 2), 1, 1, headers.length).setValues([values]);
    else sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([values]);
    return object;
  };
  if (options.lockHeld) return writeDraft();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return writeDraft();
  } finally {
    lock.releaseLock();
  }
}

function getLiteTeacherDashboardData(teacherAccessToken) {
  assertLiteTeacherAccess_(teacherAccessToken);
  const spreadsheet = getLiteSpreadsheet_();
  ensureLiteWorkbook_(spreadsheet);
  const lesson = readLiteTeacherSettings_();
  if (typeof repairLiteRequiredSubmissions_ === 'function') {
    repairLiteRequiredSubmissions_(lesson, spreadsheet);
  }
  const isCurrentLesson = function (row) {
    return String(row.lessonId) === String(lesson.lessonId) &&
      Number(row.lessonRevision || 1) === Number(lesson.lessonRevision || 1);
  };
  const students = liteRowsAsObjects_(spreadsheet.getSheetByName('학생별 현황')).filter(isCurrentLesson);
  const evaluations = liteRowsAsObjects_(spreadsheet.getSheetByName('교사 평가')).filter(isCurrentLesson);
  const conversationRows = liteRowsAsObjects_(spreadsheet.getSheetByName('질문과 답변'));
  const requiredRows = liteRowsAsObjects_(spreadsheet.getSheetByName('필수 평가 응답')).filter(isCurrentLesson);
  const apiRows = conversationRows.filter(function (row) {
    const sameIdentity = row.lessonId
      ? String(row.lessonId) === String(lesson.lessonId) && Number(row.lessonRevision || 1) === Number(lesson.lessonRevision || 1)
      : Number(row.lessonRevision || 1) === Number(lesson.lessonRevision || 1) && String(row.sourceHash || '') === String(lesson.sourceHash || '');
    return sameIdentity && String(row.speaker) === 'bot' && Number(row.apiTotalTokens || 0) > 0;
  }).concat(requiredRows.filter(function (row) { return Number(row.apiTotalTokens || 0) > 0; }));
  const reduceUsage = function (rows) { return rows.reduce(function (total, row) {
    total.requests += 1;
    total.inputTokens += Math.max(0, Number(row.apiInputTokens || 0));
    total.outputTokens += Math.max(0, Number(row.apiOutputTokens || 0));
    total.totalTokens += Math.max(0, Number(row.apiTotalTokens || 0));
    return total;
  }, { requests:0, inputTokens:0, outputTokens:0, totalTokens:0 }); };
  const studentApiUsage = reduceUsage(apiRows.filter(function (row) {
    return !(String(row.isPreview) === 'true' || row.isPreview === true);
  }));
  const previewApiUsage = reduceUsage(apiRows.filter(function (row) {
    return String(row.isPreview) === 'true' || row.isPreview === true;
  }));
  const totalApiUsage = reduceUsage(apiRows);
  const apiUsage = {
    requests:studentApiUsage.requests,
    studentRequests:studentApiUsage.requests,
    previewRequests:previewApiUsage.requests,
    totalRequests:totalApiUsage.requests,
    inputTokens:totalApiUsage.inputTokens,
    outputTokens:totalApiUsage.outputTokens,
    totalTokens:totalApiUsage.totalTokens,
    studentTotalTokens:studentApiUsage.totalTokens,
    previewTotalTokens:previewApiUsage.totalTokens
  };
  const sessionCounts = {};
  students.forEach(function (row) {
    const code = String(row.studentCode || '');
    sessionCounts[code] = Number(sessionCounts[code] || 0) + 1;
  });
  const assessmentResponses = {};
  requiredRows.filter(function (row) { return String(row.isPreview).toLowerCase() !== 'true'; }).forEach(function (row) {
    if (!students.some(function (student) { return String(student.sessionId) === String(row.sessionId); })) {
      students.push({studentCode:row.studentCode, sessionId:row.sessionId, lessonId:row.lessonId,
        lessonRevision:row.lessonRevision, questionCount:0, relatedQuestionCount:0,
        lastActiveAt:row.submittedAt, progressStatus:'필수 평가 제출', isPreview:false});
      const code = String(row.studentCode || '');
      sessionCounts[code] = Number(sessionCounts[code] || 0) + 1;
    }
  });
  const assessmentIdentity = function (row) {
    return JSON.stringify([String(row.sessionId || ''), String(row.studentCode || '')]);
  };
  if (lesson.expectedAnswer || lesson.assessmentEvidence) {
    const assessmentSeeds = {};
    conversationRows.forEach(function (row) {
      if (isCurrentLesson(row) && String(row.isPreview).toLowerCase() !== 'true' &&
          String(row.speaker) === 'bot' && Number(row.turnNo) === 1 &&
          (row.managedKind === 'start' || row.engineStatus === 'seeded_start') &&
          liteText_(row.text) === liteText_(lesson.startQuestion)) {
        assessmentSeeds[assessmentIdentity(row)] = true;
      }
    });
    conversationRows.filter(function (row) {
      return isCurrentLesson(row) && String(row.speaker) === 'student' &&
        String(row.isPreview).toLowerCase() !== 'true' &&
        String(row.engineStatus || '').indexOf('engine_failed:') !== 0 &&
        Number(row.turnNo) === 2 && assessmentSeeds[assessmentIdentity(row)];
    }).forEach(function (row) {
      const key = assessmentIdentity(row);
      if (!Object.prototype.hasOwnProperty.call(assessmentResponses, key)) {
        assessmentResponses[key] = liteText_(row.text, LITE_MAX_STUDENT_MESSAGE_);
      }
    });
  }
  const decorate = function (row) {
    const sessionId = String(row.sessionId || '');
    const evidenceObservationCount = String(row.evidenceRequestIds || '').split('|')
      .map(function (value) { return value.trim(); }).filter(Boolean).length;
    return Object.assign({}, row, {
      rubricScheme: normalizeLiteRubricScheme_(row.rubricScheme),
      teacherDecisionOptions: liteTeacherDecisionOptions_(row.rubricScheme),
      sessionConflict: Number(sessionCounts[String(row.studentCode || '')] || 0) > 1,
      sessionLabel: sessionId ? sessionId.slice(-6) : '',
      evidenceObservationCount: evidenceObservationCount,
      reviewVersion: row.automaticJudgment ? liteEvaluationReviewVersion_(row) : ''
    });
  };
  return {
    lesson: liteClientData_(lesson),
    teacherDecisionOptions: liteTeacherDecisionOptions_(lesson.rubricScheme),
    uniqueStudentCount: Object.keys(sessionCounts).length,
    apiUsage: apiUsage,
    students: liteClientData_(students.map(decorate)),
    requiredAssessmentSubmissions:liteClientData_(requiredRows.filter(function (row) {
      return String(row.isPreview).toLowerCase() !== 'true';
    }).map(function (row) {
      return Object.assign({}, row, {
        analysisStatus:liteRequiredAnalysisStatus_(row),
        answers:parseLiteRequiredJson_(row.answersJson, []),
        analysis:parseLiteRequiredJson_(row.analysisJson, []),
        items:lesson.requiredAssessment && lesson.requiredAssessment.items
          ? lesson.requiredAssessment.items.map(function (item) { return {id:item.id, question:item.question}; }) : []
      });
    })),
    evaluations: liteClientData_(evaluations.map(function (row) {
      const required = row.questionId && requiredRows.find(function (submission) {
        return String(submission.sessionId) === String(row.sessionId) && String(submission.studentCode) === String(row.studentCode);
      });
      const answer = required && parseLiteRequiredJson_(required.answersJson, []).find(function (item) { return item.questionId === row.questionId; });
      const item = row.questionId && lesson.requiredAssessment && lesson.requiredAssessment.items.find(function (item) { return item.id === row.questionId; });
      return Object.assign(decorate(row), {
        assessmentQuestion:item ? item.question : '',
        assessmentResponse:answer ? answer.text : assessmentResponses[assessmentIdentity(row)] || ''
      });
    }))
  };
}

function liteEvaluationQuestionId_(value) {
  const id = liteText_(value, 20);
  if (id && id !== 'q1' && id !== 'q2') throw new Error('평가 문항을 다시 확인해 주세요.');
  return id;
}

function upsertLiteRequiredEvaluationDrafts_(spreadsheet, settings, submission) {
  if (String(submission.isPreview).toLowerCase() === 'true') return;
  const sheet = spreadsheet.getSheetByName('교사 평가');
  const rows = liteRowsByColumnValue_(sheet, 'sessionId', submission.sessionId);
  const answers = parseLiteRequiredJson_(submission.answersJson, []);
  const analysis = parseLiteRequiredJson_(submission.analysisJson, []);
  settings.requiredAssessment.items.forEach(function (item) {
    const answer = answers.find(function (value) { return value.questionId === item.id; });
    if (!answer) return;
    const result = analysis.find(function (value) { return value.questionId === item.id; });
    const previous = rows.find(function (row) {
      return String(row.studentCode) === String(submission.studentCode) &&
        String(row.lessonId) === String(submission.lessonId) &&
        Number(row.lessonRevision) === Number(submission.lessonRevision) &&
        String(row.questionId || '') === item.id;
    }) || {};
    const evidence = [
      '평가 문항: ' + item.question, '학생 답변: ' + answer.text,
      result ? '답변 인용: ' + result.answerQuote : '',
      result ? '판단 근거: ' + result.rationale : '',
      result ? '보완 제안: ' + result.feedback : ''
    ].filter(Boolean).join('\n');
    const automaticJudgment = result
      ? '문항별 기준 분석 · ' + result.level + ' · 교사 검수 전'
      : '필수 문항 답변 수집 · 분석 대기 · 교사 검수 필요';
    const changed = previous.evidenceSummary &&
      (previous.evidenceSummary !== evidence || previous.automaticJudgment !== automaticJudgment);
    const recheck = changed && previous.finalStatus === '최종 확정';
    const next = Object.assign({}, previous, {
      studentCode:submission.studentCode, sessionId:submission.sessionId,
      lessonId:submission.lessonId, lessonRevision:submission.lessonRevision,
      questionId:item.id, rubricScheme:submission.rubricScheme,
      automaticJudgment:automaticJudgment, evidenceSummary:evidence, evidenceRequestIds:submission.requestId,
      teacherDecision:previous.teacherDecision || '판단 보류',
      teacherFeedback:previous.teacherFeedback || '',
      improvementSuggestion:previous.improvementSuggestion || '',
      nextLessonSuggestion:previous.nextLessonSuggestion || '',
      finalStatus:recheck ? '재검수 필요' : previous.finalStatus || '검수 필요',
      finalizedAt:recheck ? '' : previous.finalizedAt || ''
    });
    if (previous.__liteRowNumber && previous.automaticJudgment === next.automaticJudgment &&
        previous.evidenceSummary === next.evidenceSummary &&
        previous.evidenceRequestIds === next.evidenceRequestIds && previous.finalStatus === next.finalStatus) return;
    writeLiteRequiredRow_(sheet, next, previous.__liteRowNumber);
  });
}

function validateLiteTeacherEvaluation_(payload, rubricScheme) {
  payload = payload || {};
  const scheme = normalizeLiteRubricScheme_(rubricScheme);
  const decisions = liteTeacherDecisionOptions_(scheme);
  const decision = liteRequired_(payload.teacherDecision, '교사 판단', 30);
  if (decisions.indexOf(decision) < 0) throw new Error('이 평가에 저장된 수준에 맞는 교사 판단을 선택해 주세요.');
  const finalStatus = liteRequired_(payload.finalStatus, '검수 상태', 30);
  if (['검수 중', '최종 확정'].indexOf(finalStatus) < 0) {
    throw new Error('검수 중 또는 최종 확정을 선택해 주세요.');
  }
  if (finalStatus === '최종 확정' && decision === '판단 보류') {
    throw new Error('최종 확정하려면 ' + decisions.slice(1).join(', ') + ' 중 하나를 선택해 주세요.');
  }
  const teacherFeedback = liteText_(payload.teacherFeedback, 1500);
  const improvementSuggestion = liteText_(payload.improvementSuggestion, 1500);
  if (finalStatus === '최종 확정' && !teacherFeedback) {
    throw new Error('최종 확정하려면 교사 피드백을 입력해 주세요.');
  }
  if (finalStatus === '최종 확정' && !improvementSuggestion) {
    throw new Error('최종 확정하려면 학생 향상 방법을 입력해 주세요.');
  }
  const expectedReviewVersion = liteRequired_(payload.expectedReviewVersion, '평가 화면 버전', 64);
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(expectedReviewVersion)) {
    throw new Error('평가 화면을 새로고침한 뒤 다시 저장해 주세요.');
  }
  return {
    studentCode: normalizeLiteStudentCode_(payload.studentCode),
    sessionId: liteRequired_(payload.sessionId, '대화 세션', 80),
    lessonId: liteRequired_(payload.lessonId, '수업 ID', 80),
    lessonRevision: Math.max(1, Number(payload.lessonRevision || 1)),
    questionId:liteEvaluationQuestionId_(payload.questionId),
    rubricScheme: scheme,
    teacherDecision: decision,
    teacherFeedback: teacherFeedback,
    improvementSuggestion: improvementSuggestion,
    nextLessonSuggestion: liteText_(payload.nextLessonSuggestion, 1500),
    finalStatus: finalStatus,
    expectedReviewVersion: expectedReviewVersion
  };
}

function saveLiteTeacherEvaluation(teacherAccessToken, payload) {
  assertLiteTeacherAccess_(teacherAccessToken);
  payload = payload || {};
  const identity = {
    studentCode: normalizeLiteStudentCode_(payload.studentCode),
    sessionId: liteRequired_(payload.sessionId, '대화 세션', 80),
    lessonId: liteRequired_(payload.lessonId, '수업 ID', 80),
    lessonRevision: Math.max(1, Number(payload.lessonRevision || 1)),
    questionId:liteEvaluationQuestionId_(payload.questionId)
  };
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    // 자동 초안 갱신과 같은 락 안에서 최신 행을 다시 읽어 교사 판단 유실을 막는다.
    const spreadsheet = getLiteSpreadsheet_();
    ensureLiteWorkbook_(spreadsheet);
    const sheet = spreadsheet.getSheetByName('교사 평가');
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
      .map(function (value) { return String(value).trim(); });
    const rows = liteRowsAsObjects_(sheet);
    const index = rows.findIndex(function (row) {
      return String(row.studentCode) === identity.studentCode &&
        String(row.sessionId) === identity.sessionId &&
        String(row.lessonId) === identity.lessonId &&
        Number(row.lessonRevision || 1) === identity.lessonRevision && String(row.questionId || '') === identity.questionId;
    });
    if (index < 0) throw new Error('검수할 자동 판단 초안을 찾지 못했습니다.');
    const previous = rows[index];
    // 화면에서 보낸 수준 체계 대신 해당 평가 행의 체계를 신뢰한다.
    // 이전 3수준 평가를 새 수업의 4수준 값으로 조용히 바꾸지 않는다.
    const normalized = validateLiteTeacherEvaluation_(payload, previous.rubricScheme);
    if (liteEvaluationReviewVersion_(previous) !== normalized.expectedReviewVersion) {
      throw new Error('학생의 새 근거나 다른 교사 검수 내용이 반영되었습니다. 대시보드를 새로고침한 뒤 다시 검수해 주세요.');
    }
    const object = Object.assign({}, previous, normalized, {
      finalizedAt: normalized.finalStatus === '최종 확정' ? new Date() : ''
    });
    const values = headers.map(function (header) {
      return Object.prototype.hasOwnProperty.call(object, header) ? liteSheetSafeValue_(object[header]) : '';
    });
    sheet.getRange(Number(previous.__liteRowNumber || index + 2), 1, 1, headers.length).setValues([values]);
    return { ok: true, message: normalized.finalStatus === '최종 확정' ? '교사 최종 평가로 확정했습니다.' : '교사 검수 내용을 저장했습니다.' };
  } finally {
    lock.releaseLock();
  }
}
