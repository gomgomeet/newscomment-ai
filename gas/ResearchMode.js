/** 교사 승인 외부자료만 노출하는 조사학습 경계입니다. */

function getTeacherExternalSources_(material) {
  if (!material || !material.materialId) return [];
  const sourceHash = String(material.sourceHash || makeMaterialSourceHash_(material));
  return getRowsAsObjects_('SOURCE_LIBRARY').filter(function (row) {
    return String(row.materialId || '') === String(material.materialId) &&
      String(row.version || 'v1') === String(material.version || 'v1') &&
      String(row.sourceHash || '') === sourceHash &&
      ['draft', 'approved'].indexOf(String(row.status || '').toLowerCase()) >= 0;
  }).map(normalizeExternalSourceRow_);
}

function getApprovedExternalSources_(material) {
  return getTeacherExternalSources_(material).filter(function (source) {
    return source.active && source.teacherApproved && source.status === 'approved' &&
      /^https?:\/\//i.test(source.url);
  });
}

function replaceTeacherExternalSources_(material, externalSources) {
  const sheet = getSpreadsheet_().getSheetByName('SOURCE_LIBRARY');
  const headers = getHeaderMap_(sheet);
  getRowsAsObjects_('SOURCE_LIBRARY').forEach(function (row) {
    if (String(row.materialId || '') === String(material.materialId || '') &&
        row.__rowNumber && headers.active) {
      sheet.getRange(row.__rowNumber, headers.active).setValue(false);
      if (headers.status) sheet.getRange(row.__rowNumber, headers.status).setValue('archived');
    }
  });

  const seen = {};
  const rows = (externalSources || []).filter(function (source) {
    const key = String(source.url || '').toLowerCase();
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  }).map(function (source) {
    const approved = Boolean(source.teacherApproved);
    const sourceId = String(source.sourceId || '') || 'SRC-' +
      makeContentHash_(material.materialId + '|' + material.version + '|' + source.url).slice(0, 12);
    return {
      sourceId: sourceId,
      materialId: material.materialId,
      version: material.version,
      sourceHash: material.sourceHash || makeMaterialSourceHash_(material),
      title: source.title,
      sourceType: 'website',
      url: source.url,
      sourceName: source.sourceName,
      publishedAt: source.publishedAt || '',
      checkedAt: source.checkedAt,
      allowedScope: source.allowedScope,
      note: source.note || '',
      status: approved ? 'approved' : 'draft',
      active: approved,
      teacherApproved: approved,
      contentHash: makeContentHash_([
        source.title, source.url, source.sourceName, source.checkedAt, source.allowedScope
      ].join('|')),
      updatedAt: new Date()
    };
  });
  appendObjectsToSheet_(sheet, rows);
  return rows.length;
}

function normalizeExternalSourceRow_(row) {
  return {
    sourceId: String(row.sourceId || ''),
    materialId: String(row.materialId || ''),
    version: String(row.version || 'v1'),
    sourceHash: String(row.sourceHash || ''),
    title: String(row.title || ''),
    sourceType: String(row.sourceType || 'website'),
    url: String(row.url || ''),
    sourceName: String(row.sourceName || ''),
    publishedAt: String(row.publishedAt || ''),
    checkedAt: String(row.checkedAt || ''),
    allowedScope: String(row.allowedScope || ''),
    note: String(row.note || ''),
    status: String(row.status || 'draft').toLowerCase(),
    active: isTruthy_(row.active),
    teacherApproved: isTruthy_(row.teacherApproved)
  };
}

function buildResearchGuidance_(query, material) {
  const approved = getApprovedExternalSources_(material);
  if (!approved.length) {
    return Object.assign(
      makeResponseResult_(
        '현재 수업에서 선생님이 승인한 조사 자료가 아직 없어요. 내용을 추측하지 않을게요. 무엇을 알아보려는지 한 문장으로 좁혀 적으면 선생님 확인 목록에 남길게요.',
        'source_insufficient', [], [], [], [], [], [], []
      ),
      {
        citedExternalSourceIds: [],
        validatedExternalSourceIds: [],
        retrievedExternalSourceIds: []
      }
    );
  }

  const queryTokens = tokenizeForSearch_(query).slice(0, 6);
  const ranked = approved.map(function (source) {
    const haystack = normalizeForSearch_([
      source.title, source.sourceName, source.allowedScope, source.note
    ].join(' '));
    const score = queryTokens.filter(function (token) {
      return haystack.indexOf(token) >= 0;
    }).length;
    return Object.assign({}, source, { researchScore: score });
  }).sort(function (left, right) {
    return right.researchScore - left.researchScore || left.title.localeCompare(right.title);
  });
  const selected = ranked.filter(function (source) { return source.researchScore > 0; });
  const sources = (selected.length ? selected : ranked).slice(0, 3);
  const searchTerms = queryTokens.length
    ? queryTokens.join(', ')
    : contentWords_(sources.map(function (source) { return source.allowedScope; }).join(' '))
      .slice(0, 4).join(', ');
  const shortQuery = String(query || '조사 주제').replace(/\s+/g, ' ').trim().slice(0, 100);
  const text = '바로 답을 만들어 추측하지 않을게요. “' + shortQuery +
    '”에서 대상과 알고 싶은 점을 한 가지로 좁혀 볼까요? 추천 검색어: ' +
    (searchTerms || '핵심 낱말, 원인, 영향') +
    '. 아래 선생님 승인 자료의 허용 범위 안에서 근거를 확인해 보세요.';
  const ids = sources.map(function (source) { return source.sourceId; });
  const evidence = sources.map(function (source) {
    return {
      id: source.sourceId,
      kind: 'external_source',
      label: '교사 승인 조사 자료: ' + source.title,
      location: source.sourceName + ' · 확인일 ' + source.checkedAt,
      excerpt: shortenEvidence_('허용 범위: ' + source.allowedScope, 180),
      url: source.url
    };
  });
  return Object.assign(
    makeResponseResult_(text, 'approved_external_sources', [], [], evidence, [], [], [], []),
    {
      citedExternalSourceIds: ids,
      validatedExternalSourceIds: ids,
      retrievedExternalSourceIds: ids
    }
  );
}
