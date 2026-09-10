/**
 * 자동 관찰 결과는 교사 검수용 초안으로만 저장합니다.
 * 교사 판단·피드백·향상 방법은 자동 갱신으로 덮어쓰지 않습니다.
 */

const LITE_TEACHER_DECISIONS_ = ['판단 보류', '도달', '성장 중', '도움 필요'];
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
    row.studentCode, row.sessionId, row.lessonId, row.lessonRevision,
    row.automaticJudgment, row.evidenceSummary, row.evidenceRequestIds,
    row.questioningBest, row.passageComprehensionBest,
    row.achievementStandardBest, row.reflectionOpinionBest,
    row.teacherDecision, row.teacherFeedback, row.improvementSuggestion,
    row.nextLessonSuggestion, row.finalStatus
  ].map(function (value) { return String(value == null ? '' : value); }).join('|'), 32);
}

function upsertLiteEvaluationDraft_(settings, turn, observation, options) {
  if (turn.isPreview) return null;
  if (!observation || observation.isClosing || observation.safetyFlag ||
      (observation.sourceStatus === 'out_of_scope' && Number(observation.responseScore || 0) <= 0) ||
      observation.primaryMove === 'repair') return null;
  const observedScores = Array.isArray(observation.rubricScores) ? observation.rubricScores : [];
  if (!observedScores.some(function (item) { return Number(item && item.score || 0) > 0; })) return null;
  options = options || {};
  const writeDraft = function () {
    const spreadsheet = options.spreadsheet || getLiteSpreadsheet_();
    if (!options.workbookReady) ensureLiteWorkbook_(spreadsheet);
    const sheet = spreadsheet.getSheetByName('교사 평가');
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
      .map(function (value) { return String(value).trim(); });
    const rows = liteRowsByColumnValue_(sheet, 'sessionId', turn.sessionId);
    const index = rows.findIndex(function (row) {
      return String(row.studentCode) === String(turn.studentCode) &&
        String(row.sessionId) === String(turn.sessionId) &&
        String(row.lessonId) === String(settings.lessonId) &&
        Number(row.lessonRevision || 1) === Number(settings.lessonRevision || 1);
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
    const priorStatus = String(previous.finalStatus || '');
    const previousEvidenceLines = String(previous.evidenceSummary || '').split('\n')
      .map(function (line) { return line.trim(); }).filter(Boolean);
    const observedEvidenceLines = liteEvidenceSummary_(observedScores).split('\n')
      .map(function (line) { return line.trim(); }).filter(Boolean);
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
      automaticJudgment: '공통 질문행동 관찰 · ' + judgment.label + ' · 평균 ' + judgment.average + '/5 · 교사 기준 판단 전',
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
  const isCurrentLesson = function (row) {
    return String(row.lessonId) === String(lesson.lessonId) &&
      Number(row.lessonRevision || 1) === Number(lesson.lessonRevision || 1);
  };
  const students = liteRowsAsObjects_(spreadsheet.getSheetByName('학생별 현황')).filter(isCurrentLesson);
  const evaluations = liteRowsAsObjects_(spreadsheet.getSheetByName('교사 평가')).filter(isCurrentLesson);
  const apiRows = liteRowsAsObjects_(spreadsheet.getSheetByName('질문과 답변')).filter(function (row) {
    const sameIdentity = row.lessonId
      ? String(row.lessonId) === String(lesson.lessonId) && Number(row.lessonRevision || 1) === Number(lesson.lessonRevision || 1)
      : Number(row.lessonRevision || 1) === Number(lesson.lessonRevision || 1) && String(row.sourceHash || '') === String(lesson.sourceHash || '');
    return sameIdentity && String(row.speaker) === 'bot' && Number(row.apiTotalTokens || 0) > 0;
  });
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
  const decorate = function (row) {
    const sessionId = String(row.sessionId || '');
    return Object.assign({}, row, {
      sessionConflict: Number(sessionCounts[String(row.studentCode || '')] || 0) > 1,
      sessionLabel: sessionId ? sessionId.slice(-6) : '',
      reviewVersion: row.automaticJudgment ? liteEvaluationReviewVersion_(row) : ''
    });
  };
  return {
    lesson: liteClientData_(lesson),
    uniqueStudentCount: Object.keys(sessionCounts).length,
    apiUsage: apiUsage,
    students: liteClientData_(students.map(decorate)),
    evaluations: liteClientData_(evaluations.map(decorate))
  };
}

function validateLiteTeacherEvaluation_(payload) {
  payload = payload || {};
  const decision = liteRequired_(payload.teacherDecision, '교사 판단', 30);
  if (LITE_TEACHER_DECISIONS_.indexOf(decision) < 0) throw new Error('교사 판단 값을 확인해 주세요.');
  const finalStatus = liteRequired_(payload.finalStatus, '검수 상태', 30);
  if (['검수 중', '최종 확정'].indexOf(finalStatus) < 0) {
    throw new Error('검수 중 또는 최종 확정을 선택해 주세요.');
  }
  if (finalStatus === '최종 확정' && decision === '판단 보류') {
    throw new Error('최종 확정하려면 도달, 성장 중, 도움 필요 중 하나를 선택해 주세요.');
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
  const normalized = validateLiteTeacherEvaluation_(payload);
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
      return String(row.studentCode) === normalized.studentCode &&
        String(row.sessionId) === normalized.sessionId &&
        String(row.lessonId) === normalized.lessonId &&
        Number(row.lessonRevision || 1) === normalized.lessonRevision;
    });
    if (index < 0) throw new Error('검수할 자동 판단 초안을 찾지 못했습니다.');
    const previous = rows[index];
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
