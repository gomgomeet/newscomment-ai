/** 교사용 익명 활동·형성평가 대시보드 데이터입니다. */
const DASHBOARD_EXPORT_HEADERS_ = [
  '학교_반_번호', '성취기준·자료 연결', '자료 근거 확인', '질문 유형 확장',
  '질문 다시 쓰기·성찰', '총점', '점수 근거', '질문모음', '챗봇 답변모음', '세특용 피드백'
];

function getTeacherDashboardData(teacherAccessToken) {
  assertTeacherAccess_(teacherAccessToken);
  return getTeacherDashboardData_();
}

function getTeacherDashboardData_() {
  const spreadsheet = getSpreadsheet_();
  ensureWorkbookStructure_(spreadsheet);
  const material = getActiveMaterial_();
  const sessions = getRowsAsObjects_('SESSIONS').filter(function (row) {
    return String(row.materialId || '') === String(material.materialId || '');
  });
  const sessionIds = sessions.map(function (row) { return String(row.sessionId || ''); });
  const turns = getRowsAsObjects_('TURNS').filter(function (row) {
    return sessionIds.indexOf(String(row.sessionId || '')) >= 0;
  });
  const reviews = prioritizeReviewRows_(getRowsAsObjects_('REVIEW_QUEUE').filter(function (row) {
    return String(row.materialId || '') === String(material.materialId || '') &&
      String(row.status || 'open').toLowerCase() === 'open';
  }));
  const students = buildStudentEvaluationRows_(turns);
  const botTurns = turns.filter(function (row) { return String(row.speaker) === 'bot'; });
  const groundedTurns = botTurns.filter(function (row) {
    return String(row.sourceStatus || '') === 'supported' ||
      Boolean(String(row.validatedKnowledgeIds || row.validatedVocabularyIds || '').trim());
  });
  const latestEvaluation = getLatestEvaluationSummary_();
  const readiness = getOperationalReadiness_();
  const generationIssues = getRecentGenerationIssues_(material.materialId);
  return {
    generatedAt: new Date().toISOString(),
    material: { materialId: material.materialId, title: material.title, gradeCode: material.gradeCode, version: material.version },
    summary: {
      sessionCount: sessions.length,
      studentCount: students.length,
      studentTurnCount: turns.filter(function (row) { return String(row.speaker) === 'student'; }).length,
      groundedRate: botTurns.length ? Math.round(groundedTurns.length / botTurns.length * 100) : 0,
      openReviewCount: reviews.length,
      evaluationScore: latestEvaluation.ragScore,
      approvedKnowledgeCount: readiness.approvedKnowledgeCount,
      draftKnowledgeCount: readiness.draftKnowledgeCount,
      recentErrorCount: generationIssues.length
    },
    readiness: readiness,
    latestEvaluation: latestEvaluation,
    generationIssues: generationIssues,
    reviews: reviews.slice(0, 30).map(function (row) {
      return {
        reviewId: String(row.reviewId || ''), priority: reviewPriorityLabel_(row),
        reasonCode: String(row.reasonCode || ''), question: String(row.question || '').slice(0, 500),
        studentCode: safeDashboardStudentCode_(row.studentCode),
        count: Math.max(1, Number(row.count || 1)), topScore: Number(row.topScore || 0)
      };
    }),
    students: students
  };
}

function getRecentGenerationIssues_(materialId) {
  return getRowsAsObjects_('AI_GENERATION_LOG').filter(function (row) {
    return String(row.materialId || '') === String(materialId || '') &&
      String(row.status || '').toLowerCase() === 'failed';
  }).slice(-5).reverse().map(function (row) {
    return {
      createdAt: String(row.createdAt || row.updatedAt || ''),
      model: String(row.model || '').slice(0, 80),
      generationMode: String(row.generationMode || '').slice(0, 80),
      message: safeOperationalMessage_(row.errorMessage || '생성 실패')
    };
  });
}

function buildStudentEvaluationRows_(turns) {
  const groups = {};
  (turns || []).forEach(function (turn) {
    const code = safeDashboardStudentCode_(turn.studentCode);
    if (!groups[code]) groups[code] = { student: [], bot: [] };
    groups[code][String(turn.speaker || '') === 'student' ? 'student' : 'bot'].push(turn);
  });
  return Object.keys(groups).sort().map(function (code) {
    const group = groups[code];
    const studentTurns = group.student;
    const connectionCount = studentTurns.filter(function (turn) {
      return isTruthy_(turn.passageEcho) || String(turn.studentMove || '') === 'give_evidence';
    }).length;
    const evidenceCount = studentTurns.filter(function (turn) {
      return isTruthy_(turn.reasonGiven) || String(turn.studentMove || '') === 'give_evidence';
    }).length;
    const moveCount = uniqueDashboardValues_(studentTurns.map(function (turn) { return String(turn.studentMove || ''); })).length;
    const revisionCount = studentTurns.filter(function (turn) {
      return String(turn.studentMove || '') === 'revise' || String(turn.feedbackUptake || '') === 'revised';
    }).length;
    const connectionScore = rubricScoreFromCount_(connectionCount, studentTurns.length);
    const evidenceScore = rubricScoreFromCount_(evidenceCount, studentTurns.length);
    const extensionScore = Math.max(1, Math.min(4, moveCount));
    const revisionScore = revisionCount > 1 ? 4 : revisionCount === 1 ? 3 : studentTurns.length > 1 ? 2 : 1;
    return {
      studentCode: code,
      standardMaterialConnection: connectionScore,
      evidenceCheck: evidenceScore,
      questionTypeExpansion: extensionScore,
      revisionReflection: revisionScore,
      total: connectionScore + evidenceScore + extensionScore + revisionScore,
      scoreBasis: '자료 연결 ' + connectionCount + '회 · 근거 표현 ' + evidenceCount + '회 · 질문 움직임 ' + moveCount + '종 · 수정 ' + revisionCount + '회',
      questions: studentTurns.map(function (turn) { return String(turn.text || ''); }).join(' | '),
      answers: group.bot.map(function (turn) { return String(turn.text || ''); }).join(' | '),
      feedback: makeDashboardFeedback_(connectionScore, evidenceScore, extensionScore, revisionScore)
    };
  });
}

function exportTeacherEvaluationCsv(teacherAccessToken) {
  assertTeacherAccess_(teacherAccessToken);
  const dashboard = getTeacherDashboardData_();
  const rows = dashboard.students.map(function (student) {
    return [student.studentCode, student.standardMaterialConnection, student.evidenceCheck,
      student.questionTypeExpansion, student.revisionReflection, student.total,
      student.scoreBasis, student.questions, student.answers, student.feedback];
  });
  const csv = [DASHBOARD_EXPORT_HEADERS_].concat(rows).map(function (row) {
    return row.map(escapeDashboardCsvCell_).join(',');
  }).join('\r\n');
  return {
    filename: '질문챗봇_평가기록_' + new Date().toISOString().slice(0, 10) + '.csv',
    mimeType: 'text/csv;charset=utf-8', content: '\uFEFF' + csv, rowCount: rows.length
  };
}

function prioritizeReviewRows_(rows) {
  const weights = { AMBIGUOUS_APPROVED_EVIDENCE: 3, NO_APPROVED_RESEARCH_SOURCE: 3, LOW_RETRIEVAL_CONFIDENCE: 2, NO_APPROVED_EVIDENCE: 1, EVIDENCE_GAP: 1 };
  return (rows || []).slice().sort(function (left, right) {
    return (Number(weights[String(right.reasonCode)] || 0) - Number(weights[String(left.reasonCode)] || 0)) ||
      (Number(right.count || 1) - Number(left.count || 1));
  });
}

function reviewPriorityLabel_(row) {
  if (['AMBIGUOUS_APPROVED_EVIDENCE', 'NO_APPROVED_RESEARCH_SOURCE']
      .indexOf(String(row.reasonCode || '')) >= 0) return '높음';
  if (String(row.reasonCode || '') === 'LOW_RETRIEVAL_CONFIDENCE') return '중간';
  return '확인';
}

function getLatestEvaluationSummary_() {
  const rows = getRowsAsObjects_('EVALUATION_LOG');
  if (!rows.length) return { ragScore: 0, legacyScore: 0, passedCases: 0, totalCases: 0 };
  const row = rows[rows.length - 1];
  return { ragScore: Number(row.ragScore || 0), legacyScore: Number(row.legacyScore || 0), passedCases: Number(row.passedCases || 0), totalCases: Number(row.totalCases || 0) };
}

function rubricScoreFromCount_(count, total) {
  if (!total || count <= 0) return 1;
  const rate = count / total;
  return rate >= 0.75 ? 4 : rate >= 0.5 ? 3 : 2;
}

function makeDashboardFeedback_(connection, evidence, extension, revision) {
  const strongest = Math.max(connection, evidence, extension, revision);
  const weakest = Math.min(connection, evidence, extension, revision);
  const strength = strongest === evidence ? '자료 속 근거를 확인하려는 태도' :
    strongest === revision ? '질문을 다시 고쳐 보는 태도' :
    strongest === extension ? '여러 방식으로 질문을 넓히는 태도' : '성취기준과 자료를 연결하는 태도';
  const next = weakest === evidence ? '다음에는 답의 근거 문장을 함께 말해 보도록 안내할 수 있음.' :
    weakest === revision ? '다음에는 첫 질문과 고친 질문의 차이를 설명해 보도록 안내할 수 있음.' :
    weakest === extension ? '다음에는 사실 질문을 까닭이나 적용 질문으로 넓혀 보도록 안내할 수 있음.' :
    '다음에는 질문에 지문의 핵심 낱말을 넣어 보도록 안내할 수 있음.';
  return strength + '이 관찰됨. ' + next;
}

function safeDashboardStudentCode_(value) {
  const code = String(value || '익명').trim().slice(0, 40);
  return /^[0-9A-Za-z가-힣_-]+$/.test(code) ? code : '익명';
}

function uniqueDashboardValues_(values) { return Array.from(new Set((values || []).filter(Boolean))); }

function escapeDashboardCsvCell_(value) {
  let text = String(value == null ? '' : value).replace(/\r?\n/g, ' ');
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
