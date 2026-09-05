const QUESTION_BOT_HEADERS_ = {
  "CONFIG": [
    "key",
    "value",
    "description"
  ],
  "MATERIALS": [
    "materialId",
    "title",
    "grade",
    "gradeCode",
    "standard",
    "standardCode",
    "text",
    "startQuestion",
    "active",
    "version",
    "sourceHash",
    "status",
    "activityMode"
  ],
  "CHUNKS": [
    "chunkId",
    "materialId",
    "chunkOrder",
    "content",
    "keywords",
    "sourceLocation",
    "version",
    "sourceHash",
    "status",
    "active"
  ],
  "VOCABULARY_LIBRARY": [
    "vocabularyId",
    "term",
    "normalizedTerm",
    "easyDefinition",
    "exampleText",
    "wordGroup",
    "sourceId",
    "version",
    "sourceHash",
    "status",
    "active"
  ],
  "KNOWLEDGE": [
    "knowledgeId",
    "materialId",
    "knowledgeType",
    "title",
    "content",
    "easyExplanation",
    "evidenceQuote",
    "chunkId",
    "sourceHash",
    "status",
    "active"
  ],
  "CARDS": [
    "cardId",
    "studentMove",
    "primaryMove",
    "hintLevel",
    "response",
    "questionPatterns",
    "materialId",
    "sourceHash",
    "status",
    "active"
  ],
  "TURNS": [
    "timestamp",
    "sessionId",
    "studentCode",
    "turnNo",
    "speaker",
    "text",
    "studentMove",
    "primaryMove",
    "hintLevel",
    "sourceStatus",
    "evidenceIds",
    "aiStatus",
    "decisionReason",
    "phase",
    "managedKind",
    "responseScore",
    "relatedQuestion",
    "isPreview"
  ],
  "REVIEW_QUEUE": [
    "createdAt",
    "reviewId",
    "studentCode",
    "question",
    "reasonCode",
    "candidateIds",
    "count",
    "status",
    "teacherDecision",
    "reviewedAt"
  ],
  "DASHBOARD": [
    "studentCode",
    "questionCount",
    "relatedQuestionCount",
    "comprehensionBest",
    "standardBest",
    "opinionScore",
    "moreToExplore",
    "reachedDifficulty",
    "teacherNote"
  ]
};

let requestSpreadsheet_ = null;

function flushAndReleaseLock_(lock) {
  try { SpreadsheetApp.flush(); }
  finally { lock.releaseLock(); }
}

function getSpreadsheet_() {
  if (requestSpreadsheet_) return requestSpreadsheet_;
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (spreadsheetId) return SpreadsheetApp.openById(spreadsheetId);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error('먼저 Google Sheet에서 setupProject()를 실행해 주세요.');
}

function ensureWorkbookStructure_(spreadsheet) {
  Object.keys(QUESTION_BOT_HEADERS_).forEach(function (sheetName) {
    let sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) sheet = spreadsheet.insertSheet(sheetName);
    ensureSheetHeaders_(sheet, QUESTION_BOT_HEADERS_[sheetName]);
  });
}

function ensureSheetHeaders_(sheet, expectedHeaders) {
  let changed = false;
  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    changed = true;
  } else {
    const existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn())
      .getDisplayValues()[0]
      .map(function (value) { return String(value).trim(); });
    const missingHeaders = expectedHeaders.filter(function (header) {
      return existingHeaders.indexOf(header) < 0;
    });
    if (missingHeaders.length > 0) {
      sheet.getRange(1, existingHeaders.length + 1, 1, missingHeaders.length)
        .setValues([missingHeaders]);
      changed = true;
    }
  }

  // 조회·저장 때 이미 준비된 모든 시트의 서식을 다시 쓰지 않습니다.
  if (!changed) return;
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .setFontWeight('bold')
    .setBackground('#173f5f')
    .setFontColor('#ffffff')
    .setWrap(true);
}

function seedSampleData_(spreadsheet) {
  upsertConfigDefaults_(spreadsheet, Object.keys(LIGHT_CONFIG_DEFAULTS_).map(function (key) {
    return [key, LIGHT_CONFIG_DEFAULTS_[key], '수업 설정'];
  }));
}

function validateTeacherSetupPayload_(payload) {
  const text = function (value) { return String(value || '').trim(); };
  const required = function (value, label, maxLength) {
    const result = text(value);
    if (!result) throw new Error(label + '을(를) 입력해 주세요.');
    if (maxLength && result.length > maxLength) {
      throw new Error(label + '은(는) ' + maxLength + '자 이내로 입력해 주세요.');
    }
    return result;
  };
  const materialInput = payload.material || {};
  const materialText = required(materialInput.text, '지문', 12000);
  if (materialText.length < 30) throw new Error('지문은 30자 이상 입력해 주세요.');
  const sourceUrl = text(materialInput.sourceUrl);
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) {
    throw new Error('자료 링크는 http:// 또는 https://로 시작해야 합니다.');
  }

  const glossary = (Array.isArray(payload.glossary) ? payload.glossary : [])
    .map(function (item) {
      return { term: text(item && item.term), definition: text(item && item.definition), group: text(item && item.group) };
    })
    .filter(function (item) { return item.term || item.definition; });
  if (glossary.length > 120) throw new Error('사전카드는 한 번에 120개까지 입력할 수 있습니다.');
  glossary.forEach(function (item) {
    if (!item.term || !item.definition) throw new Error('사전카드에는 낱말과 뜻을 모두 입력해 주세요.');
    if (item.term.length > 50) throw new Error('사전카드 낱말은 50자 이내로 입력해 주세요.');
    if (item.group.length > 60) throw new Error('단어군은 60자 이내로 입력해 주세요.');
    if (item.definition.length > 300) throw new Error('사전카드 뜻은 300자 이내로 입력해 주세요.');
  });

  const activityMode = 'discussion';
  const externalSources = [];
  return {
    appName: required(payload.appName, '챗봇 이름', 40),
    subject: text(payload.subject).slice(0, 40),
    greetingMessage: required(payload.greetingMessage, '첫 인사', 240),

    material: {
      materialId: text(materialInput.materialId),
      title: required(materialInput.title, '주제', 120),
      grade: required(materialInput.grade, '학년', 60),
      standard: required(materialInput.standard, '성취기준', 500),
      standardCode: text(materialInput.standardCode),
      text: materialText,
      startQuestion: required(materialInput.startQuestion, '시작 질문', 300),
      version: text(materialInput.version) || 'v1',
      sourceLabel: text(materialInput.sourceLabel) || '교사 제공 수업 지문',
      sourceUrl: sourceUrl,
      activityMode: activityMode
    },
    glossary: glossary,
    externalSources: externalSources
  };
}

function saveActiveMaterial_(materialInput) {
  const sheet = getSpreadsheet_().getSheetByName('MATERIALS');
  const headers = getHeaderMap_(sheet);
  const rows = getRowsAsObjects_('MATERIALS');
  let target = null;
  if (materialInput.materialId) {
    target = rows.find(function (row) {
      return String(row.materialId) === String(materialInput.materialId);
    }) || null;
  }
  if (!target) {
    target = rows.find(function (row) { return isTruthy_(row.active); }) || rows[0] || null;
  }
  const materialId = String(
    materialInput.materialId || (target && target.materialId) ||
    ('MAT-' + Utilities.getUuid().slice(0, 8).toUpperCase())
  );
  const gradePolicy = requireSupportedGrade_(materialInput.grade);
  const rowObject = {
    materialId: materialId,
    title: materialInput.title,
    grade: materialInput.grade,
    gradeCode: gradePolicy.targetCode,
    explanationGradeCode: gradePolicy.explanationCode,
    standard: materialInput.standard,
    standardCode: materialInput.standardCode || '',
    text: materialInput.text,
    startQuestion: materialInput.startQuestion,
    active: true,
    version: materialInput.version,
    sourceLabel: materialInput.sourceLabel,
    sourceUrl: materialInput.sourceUrl,
    status: 'approved',
    approvedAt: new Date(),
    activityMode: materialInput.activityMode || 'discussion'
  };

  rowObject.sourceHash = makeMaterialSourceHash_(rowObject);
  syncManagedSheetRows_(sheet, function () { return true; }, function (row) { return String(row.materialId); }, [rowObject]);
  return getActiveMaterial_();
}

function getTeacherGlossaryEntries_(materialId, version) {
  return getApprovedVocabularyEntries_().filter(function (row) {
    return String(row.sourceId) === String(materialId) && (!version || String(row.version || 'v1') === String(version));
  }).map(function (row) { return { term: row.term, definition: row.easyDefinition, group: row.wordGroup || '' }; });
}

function syncManagedSheetRows_(sheet, isManaged, keyFor, desired) {
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const body = values.slice(1);
  const objects = body.map(function (row) {
    return headers.reduce(function (obj, name, index) { obj[name] = row[index]; return obj; }, {});
  });
  const targets = Object.create(null);
  objects.forEach(function (row, index) { if (isManaged(row)) targets[keyFor(row)] = index; });
  const wanted = Object.create(null);
  let changed = false;
  desired.forEach(function (row) {
    const key = keyFor(row);
    if (wanted[key]) throw new Error('같은 낱말이 중복되어 있습니다: ' + row.term);
    wanted[key] = true;
    let index = targets[key];
    if (index === undefined) { index = body.length; body.push(headers.map(function () { return ''; })); changed = true; }
    const target = body[index];
    const dirty = Object.keys(row).some(function (field) {
      return field !== 'updatedAt' && field !== 'approvedAt' && headers.indexOf(field) >= 0 && String(target[headers.indexOf(field)] == null ? '' : target[headers.indexOf(field)]) !== String(row[field]);
    });
    if (dirty) {
      Object.keys(row).forEach(function (field) { const column = headers.indexOf(field); if (column >= 0) target[column] = row[field]; });
      changed = true;
    }
    targets[key] = index;
  });
  objects.forEach(function (row, index) {
    if (!isManaged(row) || !isTruthy_(row.active)) return;
    const key = keyFor(row);
    if (!wanted[key] || targets[key] !== index) {
      body[index][headers.indexOf('active')] = false; changed = true;
    }
  });
  if (changed && body.length) sheet.getRange(2, 1, body.length, headers.length).setValues(body);
  return changed;
}

function upsertConfigDefaults_(spreadsheet, defaults) {
  const sheet = spreadsheet.getSheetByName('CONFIG');
  const values = sheet.getDataRange().getDisplayValues();
  const existing = {};
  values.slice(1).forEach(function (row, index) {
    if (row[0]) existing[String(row[0])] = index + 2;
  });
  defaults.forEach(function (item) {
    if (!existing[item[0]]) sheet.appendRow(item);
  });
}

function readConfig_() {
  return getRowsAsObjects_('CONFIG').reduce(function (result, row) {
    if (row.key) result[String(row.key)] = String(row.value);
    return result;
  }, {});
}

function getActiveMaterial_() {
  const rows = getRowsAsObjects_('MATERIALS');
  const row = rows.find(function (item) {
    return isTruthy_(item.active) && isApprovedStatus_(item.status);
  });

  if (!row) {
    throw new Error('승인되어 활성화된 수업 자료가 없습니다. 교사 화면에서 자료를 저장해 주세요.');
  }
  return materialFromRow_(row);
}

function ensureRuntimeSchema_() {
  const ss = getSpreadsheet_();
  if (!ss.getSheetByName('CHUNKS') || !ss.getSheetByName('KNOWLEDGE')) {
    throw new Error('교사 메뉴에서 경량화 시트 전환을 먼저 실행해 주세요.');
  }
}

function getLessonMaterial_(selector) {
  const normalized = normalizeLessonSelector_(selector);
  if (!normalized.lessonId) return getActiveMaterial_();
  const row = getRowsAsObjects_('MATERIALS').find(function (item) {
    return String(item.materialId || '') === normalized.lessonId &&
      isTruthy_(item.active) && isApprovedStatus_(item.status);
  });
  if (!row) {
    throw new Error('이 수업 링크는 현재 사용할 수 없습니다. 선생님에게 새 링크를 받아 주세요.');
  }
  const material = materialFromRow_(row);
  if ((normalized.version && normalized.version !== material.version) ||
      (normalized.sourceHash && normalized.sourceHash !== material.sourceHash)) {
    throw new Error('수업 자료가 변경되었습니다. 선생님에게 새 링크를 받아 주세요.');
  }
  return material;
}

function normalizeLessonSelector_(selector) {
  const value = typeof selector === 'string' ? { lessonId: selector } : (selector || {});
  const normalized = {
    lessonId: String(value.lessonId || value.lesson || '').trim(),
    version: String(value.version || value.v || '').trim(),
    sourceHash: String(value.sourceHash || value.source || '').trim()
  };
  if (normalized.lessonId.length > 120 || normalized.version.length > 40 ||
      normalized.sourceHash.length > 120 ||
      /[\u0000-\u001F\u007F]/.test(normalized.lessonId + normalized.version + normalized.sourceHash)) {
    throw new Error('수업 링크 형식이 올바르지 않습니다.');
  }
  return normalized;
}

function materialFromRow_(row) {
  const material = {
    materialId: String(row.materialId || ''),
    title: String(row.title || ''),
    grade: String(row.grade || ''),
    gradeCode: String(row.gradeCode || getGradePolicy_(row.grade).targetCode || ''),
    explanationGradeCode: String(
      row.explanationGradeCode || getGradePolicy_(row.grade).explanationCode || ''
    ),
    standard: String(row.standard || ''),
    standardCode: String(row.standardCode || ''),
    text: String(row.text || ''),
    startQuestion: String(row.startQuestion || ''),
    version: String(row.version || 'v1'),
    sourceLabel: String(row.sourceLabel || row.title || '교사 제공 자료'),
    sourceUrl: String(row.sourceUrl || ''),
    status: String(row.status || 'approved'),
    activityMode: String(row.activityMode || 'discussion')
  };
  material.sourceHash = makeMaterialSourceHash_(material);
  return material;
}

function validateTeacherMaterial_() {
  const activeRows = getRowsAsObjects_('MATERIALS').filter(function (row) {
    return isTruthy_(row.active) && isApprovedStatus_(row.status);
  });
  if (activeRows.length === 0) {
    throw new Error(
      'MATERIALS 시트에서 사용할 자료 한 행의 active를 TRUE, status를 approved로 설정해 주세요.'
    );
  }
  if (activeRows.length > 1) {
    throw new Error(
      '연수용 교사 사본에서는 active=TRUE, status=approved인 자료를 한 개만 남겨 주세요.'
    );
  }

  const row = activeRows[0];
  const requiredFields = [
    ['materialId', '자료 ID'],
    ['title', '주제(title)'],
    ['grade', '학년(grade)'],
    ['standard', '성취기준(standard)'],
    ['text', '지문(text)'],
    ['startQuestion', '시작 질문(startQuestion)']
  ];
  const missing = requiredFields.filter(function (item) {
    return !String(row[item[0]] || '').trim();
  }).map(function (item) {
    return item[1];
  });
  if (missing.length > 0) {
    throw new Error('수업 자료의 필수 항목을 입력해 주세요: ' + missing.join(', '));
  }
  if (String(row.text).trim().length < 30) {
    throw new Error('지문(text)은 검색 근거를 만들 수 있도록 30자 이상 입력해 주세요.');
  }

  return getActiveMaterial_();
}

function getActiveCards_(material) {
  const current = material || getActiveMaterial_();
  return getRowsAsObjects_('CARDS').filter(function (row) {
    return isTruthy_(row.active) && isApprovedStatus_(row.status) &&
      !/^(DEF-|AI-|C00[1-9]$|C010$)/i.test(String(row.cardId)) &&
      String(row.materialId) === String(current.materialId) && String(row.sourceHash) === String(current.sourceHash);
  }).map(function (row) { return Object.assign({}, row, { hintLevel: Number(row.hintLevel || 0), version: current.version }); });
}

function isGeneratedCardRow_(row) {
  return Boolean(String(row && row.generationId || '').trim()) ||
    /^AI-/i.test(String(row && row.cardId || ''));
}

function getApprovedMaterialChunks_(materialId, version) {
  const current = getRowsAsObjects_('MATERIALS').find(function (row) { return String(row.materialId) === String(materialId); });
  const sourceHash = current ? materialFromRow_(current).sourceHash : '';
  return getRowsAsObjects_('CHUNKS')
    .filter(function (row) {
      return isTruthy_(row.active) && isApprovedStatus_(row.status) &&
        String(row.materialId) === String(materialId) && Boolean(sourceHash) && String(row.sourceHash) === sourceHash &&
        (!version || String(row.version || 'v1') === String(version));
    })
    .map(function (row) {
      return {
        chunkId: String(row.chunkId || ''), materialId: String(row.materialId || ''),
        chunkOrder: Number(row.chunkOrder || 0), content: String(row.content || ''),
        keywords: String(row.keywords || ''),
        sourceLabel: String(row.sourceLabel || '교사 제공 자료'),
        sourceLocation: evidenceLocation_(row), sourceHash: String(row.sourceHash || ''), version: String(row.version || 'v1'),
        status: String(row.status || 'approved')
      };
    });
}

function syncMaterialChunks_() {
  const spreadsheet = getSpreadsheet_();
  const materialRows = getRowsAsObjects_('MATERIALS').filter(function (row) {
    return isTruthy_(row.active) && isApprovedStatus_(row.status);
  });
  const chunkSheet = spreadsheet.getSheetByName('CHUNKS');
  const chunkHeaders = getHeaderMap_(chunkSheet);
  const existingRows = getRowsAsObjects_('CHUNKS');
  const rowsToAppend = [];

  materialRows.forEach(function (material) {
    const materialId = String(material.materialId || 'MAT');
    const version = String(material.version || 'v1');
    const contentHash = makeMaterialSourceHash_(materialFromRow_(material));
    const sameVersionRows = existingRows.filter(function (row) {
      return String(row.materialId) === materialId &&
        String(row.version || 'v1') === version && isTruthy_(row.active);
    });
    const isCurrent = sameVersionRows.some(function (row) {
      return String(row.sourceHash || '') === contentHash;
    });
    if (isCurrent) return;

    sameVersionRows.forEach(function (row) {
      if (row.__rowNumber && chunkHeaders.active) {
        chunkSheet.getRange(row.__rowNumber, chunkHeaders.active).setValue(false);
      }
    });

    splitMaterialText_(stripCaptions_(String(material.text || '')), 220).forEach(function (content, index) {
      rowsToAppend.push({
        chunkId: makeChunkId_(materialId, version, index + 1),
        materialId: materialId,
        chunkOrder: index + 1,
        content: content,
        keywords: contentWords_(content).slice(0, 12).join('|'),
        sourceLabel: String(material.sourceLabel || material.title || '교사 제공 자료'),
        sourceLocation: '자료 구간 ' + (index + 1),
        version: version,
        status: 'approved',
        active: true,
        sourceHash: contentHash,
        updatedAt: new Date()
      });
    });
  });

  if (rowsToAppend.length > 0) appendObjectsToSheet_(chunkSheet, rowsToAppend);
  return rowsToAppend.length;
}

function splitMaterialText_(text, maxLength) {
  const sentences = (String(text || '').replace(/\r/g, '').replace(/\n+/g, ' ')
    .match(/[^.!?。！？]+[.!?。！？]?/g) || [])
    .map(function (sentence) { return sentence.trim(); })
    .filter(Boolean);
  if (sentences.length === 0 && text) sentences.push(String(text));

  const chunks = [];
  let current = '';
  sentences.forEach(function (sentence) {
    if (current && (current + ' ' + sentence).length > maxLength) {
      chunks.push(current);
      current = sentence;
    } else {
      current = current ? current + ' ' + sentence : sentence;
    }
  });
  if (current) chunks.push(current);
  return chunks;
}

function makeChunkId_(materialId, version, order) {
  const safeMaterial = String(materialId).replace(/[^A-Za-z0-9가-힣_-]/g, '-');
  const safeVersion = String(version).replace(/[^A-Za-z0-9가-힣_-]/g, '-');
  return 'CHK-' + safeMaterial + '-' + safeVersion + '-' + String(order).padStart(3, '0');
}

function makeContentHash_(text) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(text || ''),
    Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(digest).slice(0, 16);
}

function makeMaterialSourceHash_(material) {
  const value = material || {};
  return makeContentHash_([
    value.materialId,
    value.version || 'v1',
    value.title,
    value.gradeCode || value.grade,
    value.standard,
    value.text,
    value.startQuestion,
    value.activityMode || 'discussion'
  ].map(function (item) { return String(item || ''); }).join('\n'));
}

function getActiveSessionContext_(sessionId, selector) {
  const material = getLessonMaterial_(selector);
  const prefix = encodeURIComponent(material.materialId) + ':';
  if (String(sessionId).indexOf(prefix) !== 0) throw new Error('수업 정보가 다릅니다. 화면을 새로고침해 주세요.');
  const studentCode = normalizeStudentCode_(String(sessionId).slice(prefix.length));
  return { material: material, session: { sessionId: sessionId, studentCode: studentCode } };
}

function appendTurn_(turn) { appendConversationTurns_([turn]); }

function appendConversationTurns_(turns) {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const sheet = getSpreadsheet_().getSheetByName('TURNS');
    const history = getSessionTurns_(turns[0].sessionId);
    const lastNo = history.reduce(function (max, row) { return Math.max(max, Number(row.turnNo || 0)); }, 0);
    appendObjectsToSheet_(sheet, turns.map(function (turn, index) {
      return Object.assign({}, turn, { timestamp: new Date(), turnNo: lastNo + index + 1,
        evidenceIds: serializeIdList_(turn.evidenceIds), isPreview: Boolean(turn.isPreview) });
    }));
  } finally { flushAndReleaseLock_(lock); }
}

function upsertReviewItem_(item) {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const sheet = getSpreadsheet_().getSheetByName('REVIEW_QUEUE');
    const scope = reviewScope_({ sourceHash: item.sourceHash });
    const existing = getRowsAsObjects_('REVIEW_QUEUE').find(function (row) {
      return String(row.reviewId).indexOf(scope) === 0 && row.status === 'open' &&
        makeReviewOccurrenceKey_(item.materialId, row.question) === item.occurrenceKey;
    });
    const candidateIds = [].concat(item.candidateCardIds || [], item.candidateChunkIds || [],
      item.candidateVocabularyIds || [], item.candidateKnowledgeIds || []);
    if (existing) {
      const h = getHeaderMap_(sheet);
      sheet.getRange(existing.__rowNumber, h.count).setValue(Number(existing.count || 1) + 1);
      sheet.getRange(existing.__rowNumber, h.candidateIds).setValue(serializeIdList_(candidateIds));
      return String(existing.reviewId);
    }
    const id = scope + Utilities.getUuid();
    appendObjectsToSheet_(sheet, [{ createdAt: new Date(), reviewId: id, studentCode: item.studentCode,
      question: item.question, reasonCode: item.reasonCode, candidateIds: serializeIdList_(candidateIds),
      count: 1, status: 'open', teacherDecision: '', reviewedAt: '' }]);
    return id;
  } finally { flushAndReleaseLock_(lock); }
}

function reviewScope_(material) { return 'REV-' + String(material.sourceHash) + '-'; }

function getSessionTurns_(sessionId) {
  return getRowsAsObjects_('TURNS').filter(function (row) { return String(row.sessionId) === String(sessionId); })
    .sort(function (a, b) { return Number(a.turnNo) - Number(b.turnNo); });
}

function getRowsAsObjects_(sheetName) {
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function (value) { return String(value).trim(); });
  return values.slice(1).map(function (row, index) {
    const result = { __rowNumber: index + 2 };
    headers.forEach(function (header, columnIndex) {
      if (header) result[header] = row[columnIndex];
    });
    return result;
  }).filter(function (row) {
    return headers.some(function (header) { return header && row[header] !== ''; });
  });
}

function appendObjectsToSheet_(sheet, objects) {
  if (!objects || objects.length === 0) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .getDisplayValues()[0]
    .map(function (value) { return String(value).trim(); });
  const rows = objects.map(function (object) {
    return headers.map(function (header) {
      return Object.prototype.hasOwnProperty.call(object, header) ? object[header] : '';
    });
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
}

function getHeaderMap_(sheet) {
  const result = {};
  if (!sheet || sheet.getLastColumn() === 0) return result;
  sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .forEach(function (value, index) {
      const header = String(value).trim();
      if (header) result[header] = index + 1;
    });
  return result;
}

function isTruthy_(value) {
  return value === true || Number(value) === 1 || String(value).toUpperCase() === 'TRUE';
}

function isApprovedStatus_(status) {
  const normalized = String(status || 'approved').toLowerCase();
  return normalized === 'approved' || normalized === 'verified';
}

function serializeIdList_(values) {
  if (!values) return '';
  if (!Array.isArray(values)) return String(values);
  return values.filter(Boolean).join('|');
}

const LIGHT_CONFIG_DEFAULTS_ = { APP_NAME: '질문이', GREETING_MESSAGE: '안녕! 나는 {appName}야.', SUBJECT: '국어',
  MAX_INPUT_LENGTH: '500', MIN_RELEVANCE_SCORE: '3', MAX_RETRIEVAL_RESULTS: '3', SHOW_EVIDENCE: 'TRUE',
  AI_ENABLED: 'FALSE', AI_MODEL: 'gpt-5.6-terra', AI_MAX_OUTPUT_TOKENS: '1500', AI_MAX_HISTORY_TURNS: '6',
  STUDENT_WEB_APP_URL: '', LESSON_CODE: '' };

function normalizeStudentCode_(value) {
  const match = /^(\d{1,2})\s*-\s*(\d{1,3})$/.exec(String(value || '').trim());
  if (!match || Number(match[1]) < 1 || Number(match[2]) < 1) throw new Error('반-번호를 입력해 주세요. 예: 3-12');
  return Number(match[1]) + '-' + Number(match[2]);
}

// 명시적 전환: 전체 사본을 만든 다음 머리글로 재배열한다. 미사용 시트는 보관한다.
function migrateLightweightWorkbook() {
  requireTeacherMenuContext_();
  const ss = getSpreadsheet_();
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    ss.copy(ss.getName() + ' · 경량화 전 백업 · ' + new Date().toISOString());
    migrateLightweightWorkbook_(ss);
    SpreadsheetApp.flush();
    Logger.log('경량화 시트 전환 완료. 기존 미사용 시트는 보관하며 새 코드는 읽거나 쓰지 않습니다.');
  } finally { flushAndReleaseLock_(lock); }
}

function migrateLightweightWorkbook_(ss) {
  const aliases = { CHUNKS: 'MATERIAL_CHUNKS', KNOWLEDGE: 'KNOWLEDGE_ITEMS' };
  const sourceRows = {};
  Object.keys(QUESTION_BOT_HEADERS_).forEach(function (name) {
    const target = ss.getSheetByName(name);
    const legacy = ss.getSheetByName(aliases[name] || name);
    const sheet = target && target.getLastRow() > 1 ? target : legacy || target;
    const values = sheet && sheet.getLastRow() ? sheet.getDataRange().getValues() : [];
    sourceRows[name] = values.slice(1).map(function (valuesRow) {
      const row = {}; values[0].forEach(function (key, i) { row[String(key)] = valuesRow[i]; }); return row;
    });
  });
  const materials = sourceRows.MATERIALS.map(materialFromRow_);
  Object.keys(QUESTION_BOT_HEADERS_).forEach(function (name) {
    const headers = QUESTION_BOT_HEADERS_[name];
    let rows = sourceRows[name];
    if (name === 'CONFIG') {
      const config = {}; rows.forEach(function (row) { config[row.key] = row.value; });
      rows = Object.keys(LIGHT_CONFIG_DEFAULTS_).map(function (key) { return { key: key,
        value: config[key] !== undefined ? config[key] : key === 'AI_MODEL' ? (config.AI_MODEL_QUALITY || LIGHT_CONFIG_DEFAULTS_[key]) : LIGHT_CONFIG_DEFAULTS_[key],
        description: '수업 설정' }; });
    }
    rows = rows.map(function (row) {
      if (name === 'MATERIALS') row.sourceHash = makeMaterialSourceHash_(materialFromRow_(row));
      if (name === 'CHUNKS' && !row.sourceHash) {
        const material = materials.find(function (m) { return m.materialId === String(row.materialId) && m.version === String(row.version || 'v1'); });
        // 이전 원문 해시가 맞는 구간만 현재 자료에 연결한다. 캡션 정리 결과는 유지한다.
        if (material && row.contentHash === makeContentHash_(material.text)) row.sourceHash = material.sourceHash;
      }
      if (name === 'TURNS' && !row.evidenceIds) row.evidenceIds = [row.aiUsedEvidenceIds, row.validatedKnowledgeIds, row.validatedVocabularyIds, row.validatedCardIds].filter(Boolean).join('|');
      if (name === 'REVIEW_QUEUE') {
        if (row.sourceHash && String(row.reviewId).indexOf(reviewScope_(row)) !== 0) row.reviewId = reviewScope_(row) + row.reviewId;
        if (!row.candidateIds) row.candidateIds = [row.candidateCardIds,row.candidateChunkIds,row.candidateVocabularyIds,row.candidateKnowledgeIds].filter(Boolean).join('|');
      }
      return row;
    });
    const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    sheet.clearContents();
    sheet.getRange(1, 1, rows.length + 1, headers.length).setValues([headers].concat(rows.map(function (row) {
      return headers.map(function (h) { return row[h] === undefined ? '' : row[h]; });
    })));
  });
}
