/**
 * 자동 관찰 결과는 교사 검수용 초안으로만 저장합니다.
 * 교사 판단·피드백·향상 방법은 자동 갱신으로 덮어쓰지 않습니다.
 */

const LITE_TEACHER_DECISIONS_ = ['판단 보류', '도달', '성장 중', '도움 필요'];

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
      return String(item.criterionKey || '') + ' ' + Number(item.score || 0) + '점 · ' + String(item.rationale || '');
    })
    .join('\n');
}

function upsertLiteEvaluationDraft_(settings, turn, observation) {
  if (turn.isPreview) return null;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const spreadsheet = getLiteSpreadsheet_();
    ensureLiteWorkbook_(spreadsheet);
    const sheet = spreadsheet.getSheetByName('교사 평가');
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
      .map(function (value) { return String(value).trim(); });
    const rows = liteRowsAsObjects_(sheet);
    const index = rows.findIndex(function (row) {
      return String(row.studentCode) === String(turn.studentCode) &&
        String(row.lessonId) === String(settings.lessonId);
    });
    const previous = index >= 0 ? rows[index] : {};
    const scores = observation && observation.rubricScores || [];
    const judgment = liteAutomaticJudgment_(scores);
    const priorStatus = String(previous.finalStatus || '');
    const object = {
      studentCode: turn.studentCode,
      lessonId: settings.lessonId,
      automaticJudgment: judgment.label + ' · 평균 ' + judgment.average + '/5',
      evidenceSummary: liteEvidenceSummary_(scores),
      teacherDecision: previous.teacherDecision || '판단 보류',
      teacherFeedback: previous.teacherFeedback || '',
      improvementSuggestion: previous.improvementSuggestion || liteImprovementSuggestion_(scores),
      nextLessonSuggestion: previous.nextLessonSuggestion || '',
      finalStatus: priorStatus === '최종 확정' ? '재검수 필요' : (priorStatus || '검수 필요'),
      finalizedAt: priorStatus === '최종 확정' ? '' : (previous.finalizedAt || '')
    };
    const values = headers.map(function (header) {
      return Object.prototype.hasOwnProperty.call(object, header) ? object[header] : '';
    });
    if (index >= 0) sheet.getRange(index + 2, 1, 1, headers.length).setValues([values]);
    else sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([values]);
    return object;
  } finally {
    lock.releaseLock();
  }
}

function getLiteTeacherDashboardData(teacherAccessToken) {
  assertLiteTeacherAccess_(teacherAccessToken);
  const spreadsheet = getLiteSpreadsheet_();
  ensureLiteWorkbook_(spreadsheet);
  return {
    lesson: readLiteTeacherSettings_(),
    students: liteRowsAsObjects_(spreadsheet.getSheetByName('학생별 현황')),
    evaluations: liteRowsAsObjects_(spreadsheet.getSheetByName('교사 평가'))
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
  return {
    studentCode: normalizeLiteStudentCode_(payload.studentCode),
    lessonId: liteRequired_(payload.lessonId, '수업 ID', 80),
    teacherDecision: decision,
    teacherFeedback: liteRequired_(payload.teacherFeedback, '교사 피드백', 1500),
    improvementSuggestion: liteRequired_(payload.improvementSuggestion, '향상 방법', 1500),
    nextLessonSuggestion: liteText_(payload.nextLessonSuggestion, 1500),
    finalStatus: finalStatus
  };
}

function saveLiteTeacherEvaluation(teacherAccessToken, payload) {
  assertLiteTeacherAccess_(teacherAccessToken);
  const normalized = validateLiteTeacherEvaluation_(payload);
  const spreadsheet = getLiteSpreadsheet_();
  const sheet = spreadsheet.getSheetByName('교사 평가');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .map(function (value) { return String(value).trim(); });
  const rows = liteRowsAsObjects_(sheet);
  const index = rows.findIndex(function (row) {
    return String(row.studentCode) === normalized.studentCode && String(row.lessonId) === normalized.lessonId;
  });
  if (index < 0) throw new Error('검수할 자동 판단 초안을 찾지 못했습니다.');
  const previous = rows[index];
  const object = Object.assign({}, previous, normalized, {
    finalizedAt: normalized.finalStatus === '최종 확정' ? new Date() : ''
  });
  const values = headers.map(function (header) {
    return Object.prototype.hasOwnProperty.call(object, header) ? object[header] : '';
  });
  sheet.getRange(index + 2, 1, 1, headers.length).setValues([values]);
  return { ok: true, message: normalized.finalStatus === '최종 확정' ? '교사 최종 평가로 확정했습니다.' : '교사 검수 내용을 저장했습니다.' };
}
