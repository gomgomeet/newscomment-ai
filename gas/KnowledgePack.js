/**
 * 교사 지문 전체를 구조화한 수업 지식팩 초안으로 만듭니다.
 * 모든 항목은 현재 지문 해시와 원문 구간에 연결되며,
 * 교사가 승인하기 전에는 학생 검색에 포함되지 않습니다.
 */

const KNOWLEDGE_PACK_PROMPT_VERSION_ = 'knowledge-supplements-v3';
const KNOWLEDGE_PACK_MAX_ITEMS_ = 36;
const KNOWLEDGE_ITEM_TYPES_ = [
  'overview', 'paragraph_summary', 'fact', 'concept', 'vocabulary',
  'relation', 'misconception', 'discussion', 'boundary'
];

function generateKnowledgePackDrafts(teacherAccessToken, materialId, forceRefresh) {
  assertTeacherAccess_(teacherAccessToken);
  const spreadsheet = getSpreadsheet_();
  ensureWorkbookStructure_(spreadsheet);
  const config = readConfig_();
  const settings = getAISettings_(config);
  if (!settings.enabled) {
    throw new Error('먼저 질문 챗봇 메뉴에서 OpenAI API 키를 연결해 주세요.');
  }
  if (!getOpenAIApiKey_()) throw new Error('저장된 OpenAI API 키가 없습니다.');

  const material = getActiveMaterial_();
  if (materialId && String(material.materialId) !== String(materialId)) {
    throw new Error('현재 활성 자료가 바뀌었습니다. 교사 화면을 새로 열어 주세요.');
  }
  const sourceHash = String(material.sourceHash || makeMaterialSourceHash_(material));
  if (!forceRefresh) {
    const reusable = findReusableKnowledgePack_(material, sourceHash);
    if (reusable) {
      return {
        ok: true,
        reused: true,
        message: '지문이 바뀌지 않아 저장된 지식팩 초안을 불러왔습니다.',
        generationId: reusable.generationId,
        model: reusable.analysisModel,
        rejectedCount: 0,
        items: getKnowledgeItemsForRun_(reusable.generationId)
      };
    }
  }

  syncMaterialChunks_();
  const chunks = getApprovedMaterialChunks_(material.materialId, material.version);
  if (chunks.length === 0) throw new Error('지식팩을 만들 승인 원문 구간이 없습니다.');
  const generationId = 'KGEN-' + Utilities.getUuid().replace(/-/g, '').slice(-12).toUpperCase();
  const primaryModel = settings.routingMode === 'terra_only'
    ? settings.qualityModel
    : settings.fastModel;
  let activeModel = primaryModel;
  let usedFallback = false;
  let result;
  try {
    result = callOpenAIJson_(makeKnowledgePackRequest_(
      material, chunks, primaryModel, settings, config
    ));
  } catch (error) {
    if (primaryModel === settings.qualityModel) throw error;
    activeModel = settings.qualityModel;
    usedFallback = true;
    result = callOpenAIJson_(makeKnowledgePackRequest_(
      material, chunks, activeModel, settings, config
    ));
  }

  let proposed = Array.isArray(result.value && result.value.items)
    ? result.value.items
    : [];
  let validated = validateKnowledgeItemBatch_(
    proposed, material, chunks, generationId, result.model || activeModel
  );
  let rejectedCount = validated.rejectedCount;
  if (validated.items.length === 0 &&
      primaryModel !== settings.qualityModel && !usedFallback) {
    activeModel = settings.qualityModel;
    usedFallback = true;
    result = callOpenAIJson_(makeKnowledgePackRequest_(
      material, chunks, activeModel, settings, config
    ));
    proposed = Array.isArray(result.value && result.value.items)
      ? result.value.items
      : [];
    validated = validateKnowledgeItemBatch_(
      proposed, material, chunks, generationId, result.model || activeModel
    );
    rejectedCount += validated.rejectedCount;
  }
  if (validated.items.length === 0) {
    throw new Error('원문 근거 검증을 통과한 지식 항목이 없습니다.');
  }
  appendObjectsToSheet_(
    spreadsheet.getSheetByName('KNOWLEDGE_ITEMS'),
    validated.items
  );
  return {
    ok: true,
    reused: false,
    message: '지식팩 초안 ' + validated.items.length +
      '개를 만들었습니다. 원문과 비교한 뒤 교사가 승인해 주세요.',
    generationId: generationId,
    model: String(result.model || activeModel),
    fallbackUsed: usedFallback,
    rejectedCount: rejectedCount,
    items: getKnowledgeItemsForRun_(generationId)
  };
}

function makeKnowledgePackRequest_(material, chunks, model, settings, config) {
  const maxItems = Math.floor(Math.min(
    8,
    Math.max(1, Number(config.KNOWLEDGE_PACK_MAX_ITEMS || 8) || 8)
  ));
  const schema = {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        maxItems: maxItems,
        items: {
          type: 'object',
          properties: {
            knowledgeType: { type: 'string', enum: KNOWLEDGE_ITEM_TYPES_ },
            title: { type: 'string' },
            content: { type: 'string' },
            easyExplanation: { type: 'string' },
            keywords: { type: 'array', items: { type: 'string' } },
            evidenceChunkId: { type: 'string' },
            evidenceQuote: { type: 'string' },
            teacherNote: { type: 'string' }
          },
          required: [
            'knowledgeType', 'title', 'content', 'easyExplanation', 'keywords',
            'evidenceChunkId', 'evidenceQuote', 'teacherNote'
          ],
          additionalProperties: false
        }
      }
    },
    required: ['items'],
    additionalProperties: false
  };
  const sourceChunks = (chunks || []).map(function (chunk) {
    return {
      chunkId: chunk.chunkId,
      sourceLocation: chunk.sourceLocation,
      content: chunk.content
    };
  });
  return {
    model: model,
    reasoningEffort: model === settings.fastModel ? 'none' : settings.reasoningEffort,
    // 대화 한 턴의 출력 상한으로 지문 전체 JSON을 제한하면 중간에 잘립니다.
    maxOutputTokens: 1200 + maxItems * 500,
    schemaName: 'teacher_knowledge_pack_drafts',
    schema: schema,
    instructions: [
      '한국어 수업용 질문 챗봇의 지식팩 분석기입니다.',
      '교사가 제공한 원문에서 확인되는 내용만 사용하세요.',
      '모든 항목은 정확한 원문 인용과 해당 chunkId를 가져야 합니다.',
      '낱말 설명은 대상 학년보다 한 단계 쉽게 쓰세요.',
      '최대 ' + maxItems + '개의 꼭 필요한 보충 설명만 제안하세요. 원문에서 바로 찾을 수 있는 사실이나 문단별 요약을 반복 생성하지 마세요.',
      '어려운 낱말·개념, 관계 해석, 오개념, 자료 밖 답변 경계를 우선하고 같은 설명을 여러 유형으로 중복하지 마세요.',
      '내용과 쉬운 설명은 각각 1~2문장, 핵심어는 5개 이내로 간결하게 쓰세요.',
      '원문 인용은 근거가 되는 짧은 연속 구절을 정확하게 옮기세요.',
      '추론을 원문에 직접 나온 사실처럼 표현하지 마세요.',
      '자료 밖에서만 답할 수 있는 내용은 boundary 유형으로 표시하세요.'
    ].join(' '),
    input: JSON.stringify({
      material: {
        materialId: material.materialId,
        title: material.title,
        grade: material.grade,
        gradeCode: material.gradeCode,
        explanationGradeCode: material.explanationGradeCode,
        standard: material.standard,
        startQuestion: material.startQuestion,
        sourceHash: material.sourceHash
      },
      chunks: sourceChunks
    })
  };
}

function validateKnowledgeItemBatch_(proposed, material, chunks, generationId, model) {
  const items = [];
  const seen = {};
  let rejectedCount = 0;
  (proposed || []).slice(0, KNOWLEDGE_PACK_MAX_ITEMS_).forEach(function (candidate, index) {
    try {
      const normalized = normalizeKnowledgeItem_(
        candidate, material, chunks, generationId, model, index
      );
      const duplicateKey = [
        normalized.knowledgeType,
        normalizeCardText_(normalized.title),
        normalizeCardText_(normalized.evidenceQuote)
      ].join('|');
      if (seen[duplicateKey]) throw new Error('중복 지식 항목');
      seen[duplicateKey] = true;
      items.push(normalized);
    } catch (error) {
      rejectedCount += 1;
      console.warn('지식팩 초안 제외: ' + safeAIErrorMessage_(error));
    }
  });
  rejectedCount += Math.max(0, (proposed || []).length - KNOWLEDGE_PACK_MAX_ITEMS_);
  return { items: items, rejectedCount: rejectedCount };
}

function normalizeKnowledgeItem_(candidate, material, chunks, generationId, model, index) {
  const input = candidate || {};
  const knowledgeType = String(input.knowledgeType || '').trim().toLowerCase();
  if (KNOWLEDGE_ITEM_TYPES_.indexOf(knowledgeType) < 0) {
    throw new Error('허용되지 않은 지식 유형');
  }
  const title = validateCardText_(input.title, '지식 제목', 120);
  const content = validateCardText_(input.content, '지식 내용', 700);
  const easyExplanation = validateCardText_(
    input.easyExplanation, '쉽게 설명', 500
  );
  const keywords = normalizeCardStringList_(input.keywords, 14, 50, '지식 핵심어');
  const evidenceQuote = validateCardText_(input.evidenceQuote, '원문 근거', 500);
  const evidence = findGeneratedEvidence_(input.evidenceChunkId, evidenceQuote, chunks);
  const teacherNote = validateKnowledgeTeacherNote_(input.teacherNote);
  const sourceHash = String(material.sourceHash || makeMaterialSourceHash_(material));
  return {
    knowledgeId: 'KN-' + generationId.replace(/^KGEN-/, '') + '-' +
      String(index + 1).padStart(2, '0'),
    materialId: material.materialId,
    version: material.version,
    sourceHash: sourceHash,
    knowledgeType: knowledgeType,
    title: title,
    content: content,
    easyExplanation: easyExplanation,
    gradeCode: material.gradeCode,
    explanationGradeCode: material.explanationGradeCode,
    keywords: keywords.join('|'),
    evidenceQuote: evidenceQuote,
    chunkId: evidence.chunkId,
    sourceLocation: evidence.sourceLocation,
    status: 'draft',
    active: false,
    teacherNote: teacherNote,
    generationId: generationId,
    promptVersion: KNOWLEDGE_PACK_PROMPT_VERSION_,
    analysisModel: String(model || ''),
    validationStatus: 'passed',
    teacherDecision: 'pending',
    createdAt: new Date(),
    approvedAt: '',
    updatedAt: new Date()
  };
}

function getKnowledgeItemsForRun_(generationId) {
  if (!generationId) return [];
  return getRowsAsObjects_('KNOWLEDGE_ITEMS')
    .filter(function (row) {
      return String(row.generationId || '') === String(generationId);
    })
    .map(mapKnowledgeItemRow_);
}

function validateKnowledgeTeacherNote_(value) {
  return String(value || '').trim()
    ? validateCardText_(value, '교사 확인 사항', 240) : '';
}

function getLatestKnowledgePack_(material) {
  const currentMaterial = material || getActiveMaterial_();
  if (!currentMaterial.materialId) return { generationId: '', items: [] };
  const sourceHash = String(
    currentMaterial.sourceHash || makeMaterialSourceHash_(currentMaterial)
  );
  const rows = getRowsAsObjects_('KNOWLEDGE_ITEMS').filter(function (row) {
    return String(row.materialId || '') === String(currentMaterial.materialId) &&
      String(row.version || 'v1') === String(currentMaterial.version || 'v1') &&
      String(row.sourceHash || '') === sourceHash &&
      (String(row.promptVersion || '') === KNOWLEDGE_PACK_PROMPT_VERSION_ || String(row.status) === 'approved');
  });
  if (rows.length === 0) return { generationId: '', items: [] };
  const generationId = String(rows[rows.length - 1].generationId || '');
  return {
    generationId: generationId,
    items: getKnowledgeItemsForRun_(generationId)
  };
}

function findReusableKnowledgePack_(material, sourceHash) {
  const rows = getRowsAsObjects_('KNOWLEDGE_ITEMS').filter(function (row) {
    const status = String(row.status || '');
    return String(row.materialId || '') === String(material.materialId || '') &&
      String(row.version || 'v1') === String(material.version || 'v1') &&
      String(row.sourceHash || '') === String(sourceHash || '') &&
      String(row.promptVersion || '') === KNOWLEDGE_PACK_PROMPT_VERSION_ &&
      status !== 'rejected' && status !== 'archived';
  });
  if (rows.length === 0) return null;
  const latest = rows[rows.length - 1];
  return {
    generationId: String(latest.generationId || ''),
    analysisModel: String(latest.analysisModel || '')
  };
}

function approveKnowledgePackDrafts(teacherAccessToken, payload) {
  assertTeacherAccess_(teacherAccessToken);
  const input = payload || {};
  const generationId = String(input.generationId || '');
  const edits = Array.isArray(input.items) ? input.items : [];
  if (!generationId || edits.length === 0) {
    throw new Error('승인할 지식팩 초안을 선택해 주세요.');
  }
  const material = getActiveMaterial_();
  const sourceHash = String(material.sourceHash || makeMaterialSourceHash_(material));
  const chunks = getApprovedMaterialChunks_(material.materialId, material.version);
  const editMap = {};
  edits.forEach(function (item) { editMap[String(item.knowledgeId || '')] = item; });
  const sheet = getSpreadsheet_().getSheetByName('KNOWLEDGE_ITEMS');
  const headers = getHeaderMap_(sheet);
  const candidates = getRowsAsObjects_('KNOWLEDGE_ITEMS').filter(function (row) {
    return String(row.generationId || '') === generationId &&
      editMap[String(row.knowledgeId || '')];
  });
  if (candidates.length !== edits.length) {
    throw new Error('일부 지식팩 초안을 찾지 못했습니다. 화면을 새로 열어 주세요.');
  }

  const prepared = candidates.map(function (row) {
    if (String(row.status || '') !== 'draft' || isTruthy_(row.active)) {
      throw new Error('이미 처리된 지식 항목이 포함되어 있습니다.');
    }
    if (String(row.materialId || '') !== String(material.materialId || '') ||
        String(row.version || 'v1') !== String(material.version || 'v1') ||
        !String(row.sourceHash || '') || String(row.sourceHash) !== sourceHash) {
      throw new Error('현재 지문과 다른 지식팩 초안입니다. 다시 분석해 주세요.');
    }
    const edit = editMap[String(row.knowledgeId || '')];
    findGeneratedEvidence_(row.chunkId, row.evidenceQuote, chunks);
    return {
      row: row,
      updates: {
        title: validateCardText_(edit.title, '지식 제목', 120),
        content: validateCardText_(edit.content, '지식 내용', 700),
        easyExplanation: validateCardText_(edit.easyExplanation, '쉽게 설명', 500),
        keywords: normalizeCardStringList_(edit.keywords, 14, 50, '지식 핵심어').join('|'),
        teacherNote: validateKnowledgeTeacherNote_(edit.teacherNote),
        status: 'approved',
        active: true,
        teacherDecision: 'approved',
        approvedAt: new Date(),
        updatedAt: new Date()
      }
    };
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    prepared.forEach(function (item) {
      Object.keys(item.updates).forEach(function (field) {
        if (headers[field]) {
          sheet.getRange(item.row.__rowNumber, headers[field]).setValue(item.updates[field]);
        }
      });
    });
    bumpRetrievalCacheRevision_();
  } finally {
    lock.releaseLock();
  }
  return {
    ok: true,
    message: prepared.length + '개 지식 항목을 승인했습니다.',
    generationId: generationId,
    items: getKnowledgeItemsForRun_(generationId)
  };
}

function discardKnowledgePackDrafts(teacherAccessToken, payload) {
  assertTeacherAccess_(teacherAccessToken);
  const input = payload || {};
  const generationId = String(input.generationId || '');
  const knowledgeIds = (Array.isArray(input.knowledgeIds) ? input.knowledgeIds : []).map(String);
  if (!generationId || knowledgeIds.length === 0) {
    throw new Error('폐기할 지식팩 초안이 없습니다.');
  }
  const sheet = getSpreadsheet_().getSheetByName('KNOWLEDGE_ITEMS');
  const headers = getHeaderMap_(sheet);
  let rejectedCount = 0;
  getRowsAsObjects_('KNOWLEDGE_ITEMS').forEach(function (row) {
    if (String(row.generationId || '') !== generationId ||
        knowledgeIds.indexOf(String(row.knowledgeId || '')) < 0 ||
        String(row.status || '') !== 'draft') return;
    const updates = {
      active: false,
      status: 'rejected',
      teacherDecision: 'rejected',
      updatedAt: new Date()
    };
    Object.keys(updates).forEach(function (field) {
      if (headers[field]) sheet.getRange(row.__rowNumber, headers[field]).setValue(updates[field]);
    });
    rejectedCount += 1;
  });
  return {
    ok: true,
    message: rejectedCount + '개 지식 항목을 폐기했습니다.',
    generationId: generationId,
    items: getKnowledgeItemsForRun_(generationId)
  };
}

function getApprovedKnowledgeItems_(material) {
  const currentMaterial = material || getActiveMaterial_();
  const sourceHash = String(
    currentMaterial.sourceHash || makeMaterialSourceHash_(currentMaterial)
  );
  return getRowsAsObjects_('KNOWLEDGE_ITEMS')
    .filter(function (row) {
      return isTruthy_(row.active) && isApprovedStatus_(row.status) &&
        String(row.materialId || '') === String(currentMaterial.materialId || '') &&
        String(row.version || 'v1') === String(currentMaterial.version || 'v1') &&
        String(row.sourceHash || '') === sourceHash;
    })
    .map(mapKnowledgeItemRow_);
}

function archiveStaleKnowledgeItems_(material) {
  const spreadsheet = getSpreadsheet_();
  const sheet = spreadsheet.getSheetByName('KNOWLEDGE_ITEMS');
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const headers = getHeaderMap_(sheet);
  const sourceHash = String(material.sourceHash || makeMaterialSourceHash_(material));
  let archivedCount = 0;
  getRowsAsObjects_('KNOWLEDGE_ITEMS').forEach(function (row) {
    if (!row.__rowNumber || !isTruthy_(row.active) ||
        String(row.materialId || '') !== String(material.materialId || '') ||
        String(row.sourceHash || '') === sourceHash) return;
    const updates = {
      active: false,
      status: 'archived',
      teacherDecision: 'source_changed',
      updatedAt: new Date()
    };
    Object.keys(updates).forEach(function (field) {
      if (headers[field]) sheet.getRange(row.__rowNumber, headers[field]).setValue(updates[field]);
    });
    archivedCount += 1;
  });
  return archivedCount;
}

function mapKnowledgeItemRow_(row) {
  return {
    knowledgeId: String(row.knowledgeId || ''),
    materialId: String(row.materialId || ''),
    version: String(row.version || 'v1'),
    sourceHash: String(row.sourceHash || ''),
    knowledgeType: String(row.knowledgeType || ''),
    title: String(row.title || ''),
    content: String(row.content || ''),
    easyExplanation: String(row.easyExplanation || ''),
    gradeCode: String(row.gradeCode || ''),
    explanationGradeCode: String(row.explanationGradeCode || ''),
    keywords: String(row.keywords || ''),
    evidenceQuote: String(row.evidenceQuote || ''),
    chunkId: String(row.chunkId || ''),
    sourceLocation: String(row.sourceLocation || ''),
    status: String(row.status || 'draft'),
    active: isTruthy_(row.active),
    teacherNote: String(row.teacherNote || ''),
    generationId: String(row.generationId || ''),
    promptVersion: String(row.promptVersion || ''),
    analysisModel: String(row.analysisModel || ''),
    validationStatus: String(row.validationStatus || ''),
    teacherDecision: String(row.teacherDecision || '')
  };
}
