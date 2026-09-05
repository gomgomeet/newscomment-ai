/**
 * API 키 값을 노출하지 않고 실제 수업 운영 준비 상태를 점검합니다.
 */

function getOperationalReadiness_() {
  const spreadsheet = getSpreadsheet_();
  ensureWorkbookStructure_(spreadsheet);
  const config = readConfig_();
  const aiSettings = getAISettings_(config);
  let material = null;
  let materialError = '';
  try {
    material = validateTeacherMaterial_();
  } catch (error) {
    materialError = safeOperationalMessage_(error);
  }

  const sourceHash = material ? String(
    material.sourceHash || makeMaterialSourceHash_(material)
  ) : '';
  const chunks = material
    ? getApprovedMaterialChunks_(material.materialId, material.version)
    : [];
  const knowledge = material ? getApprovedKnowledgeItems_(material) : [];
  const vocabulary = material ? getApprovedVocabularyEntries_().filter(function (entry) {
    return String(entry.sourceId || '') === String(material.materialId || '') &&
      String(entry.version || 'v1') === String(material.version || 'v1');
  }) : [];
  const externalSources = material ? getApprovedExternalSources_(material) : [];
  const drafts = material ? getRowsAsObjects_('KNOWLEDGE_ITEMS').filter(function (row) {
    return String(row.materialId || '') === String(material.materialId || '') &&
      String(row.version || 'v1') === String(material.version || 'v1') &&
      String(row.sourceHash || '') === sourceHash &&
      String(row.status || '') === 'draft';
  }) : [];
  const openReviews = getRowsAsObjects_('REVIEW_QUEUE').filter(function (row) {
    return !String(row.status || 'open').trim() || String(row.status || 'open') === 'open';
  });
  const studentUrl = getStudentWebAppUrl_(material);
  const apiKeyConfigured = Boolean(getOpenAIApiKey_());
  const checks = [
    makeOperationalCheck_(
      'project', '프로젝트 초기화',
      Boolean(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')),
      'block', 'Google Sheet 연결과 기본 시트가 준비되어 있습니다.',
      'Google Sheet에서 setupProject()를 실행해 주세요.'
    ),
    makeOperationalCheck_(
      'material', '활성 수업 자료', Boolean(material), 'block',
      material ? material.title + ' · ' + material.gradeCode : '',
      materialError || '승인된 활성 자료를 한 개 준비해 주세요.'
    ),
    makeOperationalCheck_(
      'chunks', '원문 근거 구간', chunks.length > 0, 'block',
      chunks.length + '개 승인 구간', '자료를 저장해 원문 구간을 만들어 주세요.'
    ),
    makeOperationalCheck_(
      'knowledge', '보충 설명(선택)', true, 'warn',
      knowledge.length ? knowledge.length + '개 승인 · 초안 ' + drafts.length + '개' : '원문 검색으로 운영 · 추가 분석은 선택 사항',
      '승인 지식이 없어 원문 구간 중심으로만 응답합니다.'
    ),
    makeOperationalCheck_(
      'research_sources', '조사학습 승인 자료',
      !material || material.activityMode !== 'research' || externalSources.length > 0,
      'block',
      material && material.activityMode === 'research'
        ? externalSources.length + '개 승인 자료' : '생각 나누기 모드',
      '조사학습 모드에는 교사가 승인한 외부 자료를 한 개 이상 등록해 주세요.'
    ),
    makeOperationalCheck_(
      'ai', 'AI 연결', aiSettings.enabled && apiKeyConfigured, 'warn',
      aiSettings.routingMode + ' · ' + aiSettings.qualityModel,
      'AI가 꺼져 있어 규칙·RAG 안전 응답으로 운영됩니다.'
    ),
    makeOperationalCheck_(
      'fallback', '오류 복귀', true, 'block',
      'AI 오류 시 규칙·RAG 응답 유지', ''
    ),
    makeOperationalCheck_(
      'student_url', '학생용 주소', Boolean(studentUrl), 'block',
      studentUrl ? '배포 주소 확인됨' : '', '웹 앱을 배포해 학생용 주소를 준비해 주세요.'
    )
  ];
  const blockerCount = checks.filter(function (check) {
    return check.state === 'block';
  }).length;
  const warningCount = checks.filter(function (check) {
    return check.state === 'warn';
  }).length;
  return {
    checkedAt: new Date().toISOString(),
    level: blockerCount > 0 ? 'blocked' : warningCount > 0 ? 'ready_with_warnings' : 'ready',
    canStartClass: blockerCount === 0,
    blockerCount: blockerCount,
    warningCount: warningCount,
    materialId: material ? material.materialId : '',
    materialTitle: material ? material.title : '',
    gradeCode: material ? material.gradeCode : '',
    approvedChunkCount: chunks.length,
    approvedKnowledgeCount: knowledge.length,
    approvedVocabularyCount: vocabulary.length,
    approvedExternalSourceCount: externalSources.length,
    draftKnowledgeCount: drafts.length,
    openReviewCount: openReviews.length,
    ai: {
      enabled: aiSettings.enabled,
      keyConfigured: apiKeyConfigured,
      routingMode: aiSettings.routingMode,
      fastModel: aiSettings.fastModel,
      qualityModel: aiSettings.qualityModel,
      estimatedCallsPerStudentTurn: aiSettings.enabled && apiKeyConfigured ? 2 : 0,
      estimatedKnowledgePackCalls: aiSettings.enabled && apiKeyConfigured ? '1~2' : '0'
    },
    studentUrlConfigured: Boolean(studentUrl),
    checks: checks
  };
}

function runOperationalReadinessCheck(teacherAccessToken) {
  if (teacherAccessToken) {
    assertTeacherAccess_(teacherAccessToken);
  } else {
    requireTeacherMenuContext_();
  }
  const report = getOperationalReadiness_();
  const spreadsheet = getSpreadsheet_();
  appendObjectsToSheet_(spreadsheet.getSheetByName('OPERATION_CHECKS'), [{
    timestamp: new Date(),
    level: report.level,
    canStartClass: report.canStartClass,
    blockerCount: report.blockerCount,
    warningCount: report.warningCount,
    materialId: report.materialId,
    gradeCode: report.gradeCode,
    approvedChunkCount: report.approvedChunkCount,
    approvedKnowledgeCount: report.approvedKnowledgeCount,
    approvedVocabularyCount: report.approvedVocabularyCount,
    approvedExternalSourceCount: report.approvedExternalSourceCount,
    draftKnowledgeCount: report.draftKnowledgeCount,
    openReviewCount: report.openReviewCount,
    aiEnabled: report.ai.enabled,
    apiKeyConfigured: report.ai.keyConfigured,
    routingMode: report.ai.routingMode,
    fastModel: report.ai.fastModel,
    qualityModel: report.ai.qualityModel,
    studentUrlConfigured: report.studentUrlConfigured,
    detailsJson: JSON.stringify(report.checks)
  }]);
  spreadsheet.toast(
    report.canStartClass
      ? '수업 시작 가능 · 주의 ' + report.warningCount + '개'
      : '준비 필요 · 필수 조치 ' + report.blockerCount + '개',
    '운영 준비 점검',
    8
  );
  return report;
}

function makeOperationalCheck_(id, label, passed, severity, passDetail, failDetail) {
  return {
    id: id,
    label: label,
    state: passed ? 'pass' : severity,
    detail: passed ? passDetail : failDetail
  };
}

function safeOperationalMessage_(error) {
  return String(error && error.message ? error.message : error || '상태를 확인할 수 없습니다.')
    .replace(/sk-[A-Za-z0-9_-]+/g, '[API 키 가림]')
    .slice(0, 500);
}
