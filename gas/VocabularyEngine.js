/**
 * 초등 1학년부터 중학교 3학년까지의 학년별 어휘 RAG를 담당합니다.
 * 학년은 학생의 능력을 판정하는 값이 아니라 설명 문장의 읽기 난도를 정하는 데만 씁니다.
 */

const SUPPORTED_GRADE_LEVELS_ = [
  { code: 'E1', label: '초등 1학년' },
  { code: 'E2', label: '초등 2학년' },
  { code: 'E3', label: '초등 3학년' },
  { code: 'E4', label: '초등 4학년' },
  { code: 'E5', label: '초등 5학년' },
  { code: 'E6', label: '초등 6학년' },
  { code: 'M1', label: '중학교 1학년' },
  { code: 'M2', label: '중학교 2학년' },
  { code: 'M3', label: '중학교 3학년' }
];

function getGradePolicy_(gradeText) {
  const raw = String(gradeText || '').trim();
  const compact = raw.replace(/\s+/g, '');
  let targetCode = '';
  let match = compact.toUpperCase().match(/^([EM])([1-6])/);
  if (match) {
    targetCode = match[1] + match[2];
  } else {
    match = compact.match(/중(?:학교|등)?([1-3])/);
    if (match) targetCode = 'M' + match[1];
    if (!targetCode) {
      match = compact.match(/초(?:등학교|등)?([1-6])/);
      if (match) targetCode = 'E' + match[1];
    }
  }

  const targetIndex = gradeIndex_(targetCode);
  if (targetIndex < 0) {
    return {
      supported: false,
      input: raw,
      targetCode: '',
      targetLabel: '',
      explanationCode: '',
      explanationLabel: '',
      supportRange: '초등 1학년~중학교 3학년'
    };
  }
  const explanationIndex = Math.max(0, targetIndex - 1);
  return {
    supported: true,
    input: raw,
    targetCode: SUPPORTED_GRADE_LEVELS_[targetIndex].code,
    targetLabel: SUPPORTED_GRADE_LEVELS_[targetIndex].label,
    explanationCode: SUPPORTED_GRADE_LEVELS_[explanationIndex].code,
    explanationLabel: explanationIndex === 0 && targetIndex === 0
      ? '초등 1학년 생활어 수준'
      : SUPPORTED_GRADE_LEVELS_[explanationIndex].label + ' 수준',
    supportRange: '초등 1학년~중학교 3학년'
  };
}

function requireSupportedGrade_(gradeText) {
  const policy = getGradePolicy_(gradeText);
  if (!policy.supported) {
    throw new Error('학년은 초등 1학년부터 중학교 3학년까지 선택해 주세요.');
  }
  return policy;
}

function gradeIndex_(gradeCode) {
  return SUPPORTED_GRADE_LEVELS_.map(function (item) { return item.code; })
    .indexOf(String(gradeCode || '').toUpperCase());
}

function getApprovedVocabularyEntries_() {
  return getRowsAsObjects_('VOCABULARY_LIBRARY').filter(function (row) {
    return isTruthy_(row.active) && isApprovedStatus_(row.status) &&
      String(row.term || '').trim() &&
      String(row.easyDefinition || '').trim();
  });
}

function syncTeacherGlossaryVocabulary_(material, glossary) {
  const sheet = getSpreadsheet_().getSheetByName('VOCABULARY_LIBRARY');
  const policy = requireSupportedGrade_(material.gradeCode || material.grade);
  const rows = (glossary || []).map(function (item) {
    return Object.assign(makeVocabularyRow_(material, item.term, item.definition, policy, '교사 직접 입력'), { wordGroup: item.group || '' });
  });
  syncManagedSheetRows_(sheet, function (row) {
    return String(row.sourceId) === String(material.materialId);
  }, function (row) { return String(row.version || 'v1') + '|' + normalizeVocabularyTerm_(row.term); }, rows);
  // 이전 사전카드는 이관 후 비활성화만 하며, 새 카드를 생성하지 않습니다.
  syncManagedSheetRows_(getSpreadsheet_().getSheetByName('CARDS'), function (row) {
    return String(row.materialId) === String(material.materialId) && String(row.teacherNote) === '교사 입력 웹앱 사전카드';
  }, function (row) { return String(row.cardId); }, []);
  PropertiesService.getScriptProperties().setProperty('GLOSSARY_STORE_' + material.materialId, 'v2');
  return rows.length;
}

function makeVocabularyRow_(material, term, definition, policy, sourceLocation) {
  const normalizedTerm = normalizeVocabularyTerm_(term);
  return {
    vocabularyId: 'VOC-' + policy.targetCode + '-' +
      makeContentHash_(String(material.materialId || '') + '|' + normalizedTerm).slice(0, 10),
    term: String(term || '').trim(),
    normalizedTerm: normalizedTerm,
    targetGradeCode: policy.targetCode,
    explanationGradeCode: policy.explanationCode,
    easyDefinition: String(definition || '').trim(),
    exampleText: findVocabularyContext_(material.text, term),
    questionPatterns: makeVocabularyQuestionPatterns_(term),
    sourceId: material.materialId,
    sourceLabel: material.sourceLabel || material.title || '교사 제공 자료',
    sourceLocation: sourceLocation || '교사 승인 어휘',
    sourceUrl: material.sourceUrl || '',
    status: 'approved',
    active: true,
    teacherApproved: true,
    reliability: 'A',
    version: material.version || 'v1',
    sourceHash: material.sourceHash || makeMaterialSourceHash_(material),
    updatedAt: new Date()
  };
}

function rankVocabularyEntries_(query, dialogue, material, entries, limit) {
  if (String(dialogue.studentMove || '') !== 'ask_definition') return [];
  const normalizedQuery = normalizeVocabularyTerm_(query);
  const policy = getGradePolicy_(material.gradeCode || material.grade);
  const desiredExplanationIndex = gradeIndex_(policy.explanationCode);
  return (entries || []).map(function (entry) {
    const normalizedTerm = normalizeVocabularyTerm_(entry.normalizedTerm || entry.term);
    const queryMatches = normalizedTerm && normalizedQuery.indexOf(normalizedTerm) >= 0;
    if (!queryMatches) return null;
    const entryExplanationIndex = gradeIndex_(entry.explanationGradeCode);
    const sameMaterial = String(entry.sourceId || '') === String(material.materialId || '');
    const tooDifficult = policy.supported && entryExplanationIndex > desiredExplanationIndex;
    if (tooDifficult && !sameMaterial) return null;
    const gradeScore = entry.targetGradeCode === policy.targetCode
      ? 6
      : entryExplanationIndex >= 0 && entryExplanationIndex <= desiredExplanationIndex ? 3 : 0;
    const relevanceScore = 20 + (sameMaterial ? 8 : 0) + gradeScore;
    return Object.assign({}, entry, {
      relevanceScore: relevanceScore,
      trustScore: String(entry.reliability || '') === 'A' ? 6 : 3,
      finalScore: relevanceScore + 0.6,
      passedRelevanceGate: true
    });
  }).filter(Boolean).sort(compareRankedItems_).slice(0, Math.max(1, Number(limit || 3)));
}

function renderVocabularyDefinition_(entry) {
  let text = '“' + entry.term + '”의 뜻은 ‘' + entry.easyDefinition + '’이에요.';
  if (entry.exampleText) {
    text += ' 지문에서는 “' + shortenEvidence_(entry.exampleText, 100) + '”처럼 쓰였어요.';
  }
  return text;
}

function parseVocabularyEvidence_(evidenceText, keywords) {
  const evidence = String(evidenceText || '').trim();
  const separator = evidence.indexOf(':');
  return {
    term: separator > 0 ? evidence.slice(0, separator).trim() : String(keywords || '').split('|')[0].trim(),
    definition: separator > 0 ? evidence.slice(separator + 1).trim() : ''
  };
}

function normalizeVocabularyTerm_(term) {
  return String(term || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
}

function makeVocabularyQuestionPatterns_(term) {
  const value = String(term || '').trim();
  return [
    value + ' 뜻', value + '이 뭐예요', value + '가 뭐예요',
    value + '은 무엇인가요', value + '는 무엇인가요', value + '의 의미'
  ].join('|');
}

function findVocabularyContext_(materialText, term) {
  const sentences = String(materialText || '').match(/[^.!?。！？\n]+[.!?。！？]?/g) || [];
  const matched = sentences.find(function (sentence) {
    return sentence.indexOf(String(term || '')) >= 0;
  });
  return shortenEvidence_(matched || '', 180);
}
