function renderResponse_(context) {
  const plan = context.plan;
  const analysis = context.analysis;
  const material = context.material;
  const retrieval = context.retrieval || emptyRetrievalResult_();

  if (plan.primaryMove === 'safety_redirect') {
    return makeResponseResult_(
      plan.reasonCode === 'input_too_long'
        ? '글이 너무 길어요. 개인정보는 빼고 가장 중요한 생각을 짧게 다시 적어 주세요.'
        : '개인정보나 비밀번호는 적지 않아요. 그 부분을 빼고 지문에 대한 생각만 다시 말해 주세요.',
      plan.sourceStatus,
      [],
      [],
      [],
      [],
      []
    );
  }

  const selectedVocabulary = analysis.studentMove === 'ask_definition' &&
      (retrieval.vocabulary || []).length > 0 ? retrieval.vocabulary[0] : null;
  const selectedKnowledge = (retrieval.knowledge || []).filter(function (item) {
    return analysis.studentMove !== 'ask_definition' || item.knowledgeType === 'vocabulary';
  })[0] || null;
  const isContentQuestion = analysis.studentMove === 'ask_fact' ||
    analysis.studentMove === 'ask_definition';
  const selectedCard = !isContentQuestion && (retrieval.cards || []).length > 0
    ? retrieval.cards[0]
    : null;
  const hasApprovedVocabularyEvidence = Boolean(selectedVocabulary && selectedVocabulary.easyDefinition);
  const hasKnowledgeEvidence = Boolean(selectedKnowledge &&
    (selectedKnowledge.content || selectedKnowledge.easyExplanation));
  const hasMaterialEvidence = hasKnowledgeEvidence || (retrieval.chunks || []).length > 0;
  const mustDeclineUnsupportedKnowledge =
    (analysis.studentMove === 'ask_fact' && !hasMaterialEvidence) ||
    (analysis.studentMove === 'ask_definition' &&
      !hasApprovedVocabularyEvidence && !hasKnowledgeEvidence);
  const usedVocabulary = mustDeclineUnsupportedKnowledge ? null : selectedVocabulary;
  const usedKnowledge = mustDeclineUnsupportedKnowledge || usedVocabulary ? null : selectedKnowledge;
  const usedCard = mustDeclineUnsupportedKnowledge || usedVocabulary || isContentQuestion
    ? null
    : selectedCard;
  const evidence = mustDeclineUnsupportedKnowledge
    ? []
    : buildEvidenceItems_(usedVocabulary, usedKnowledge, usedCard, retrieval.chunks, material);
  let text = '';

  if (mustDeclineUnsupportedKnowledge) {
    text = fallbackResponse_(
      Object.assign({}, plan, { sourceStatus: 'source_insufficient' }),
      material
    );
  } else if (usedVocabulary) {
    text = renderVocabularyDefinition_(usedVocabulary);
  } else if (usedKnowledge && analysis.studentMove === 'ask_definition') {
    text = renderKnowledgeDefinition_(usedKnowledge);
  } else if (usedKnowledge && analysis.studentMove === 'ask_fact') {
    text = renderKnowledgeFact_(usedKnowledge);
  } else if (usedCard && usedCard.response) {
    text = replaceCardVariables_(usedCard.response, material);
  } else if ((retrieval.chunks || []).length > 0 && analysis.studentMove === 'ask_fact') {
    text =
      '교사가 제공한 자료에서 관련 근거를 찾았어요. “' +
      shortenEvidence_(retrieval.chunks[0].content, 150) +
      '” 이 부분이 질문과 어떻게 연결되는지 자기 말로 설명해 볼까요?';
  } else {
    text = fallbackResponse_(plan, material);
  }

  const citedCardIds = usedCard ? [usedCard.cardId] : [];
  const validatedCardIds = usedCard && usedCard.evidenceText &&
      isApprovedStatus_(usedCard.status) &&
      (!usedCard.materialId || usedCard.materialId === material.materialId) &&
      (!usedCard.version || usedCard.version === material.version) &&
      (!usedCard.sourceHash || usedCard.sourceHash === material.sourceHash)
    ? [usedCard.cardId]
    : [];
  const citedVocabularyIds = usedVocabulary ? [usedVocabulary.vocabularyId] : [];
  const validatedVocabularyIds = usedVocabulary && usedVocabulary.easyDefinition &&
      isApprovedStatus_(usedVocabulary.status) && isTruthy_(usedVocabulary.active) &&
      isTruthy_(usedVocabulary.teacherApproved)
    ? [usedVocabulary.vocabularyId]
    : [];
  const citedKnowledgeIds = usedKnowledge ? [usedKnowledge.knowledgeId] : [];
  const validatedKnowledgeIds = usedKnowledge && usedKnowledge.evidenceQuote &&
      isApprovedStatus_(usedKnowledge.status) && isTruthy_(usedKnowledge.active) &&
      usedKnowledge.materialId === material.materialId &&
      usedKnowledge.version === material.version &&
      usedKnowledge.sourceHash === material.sourceHash
    ? [usedKnowledge.knowledgeId]
    : [];
  const sourceStatus = mustDeclineUnsupportedKnowledge
    ? 'source_insufficient'
    : evidence.length > 0 ? 'supported' : plan.sourceStatus;

  return makeResponseResult_(
    text, sourceStatus, citedCardIds, validatedCardIds, evidence,
    citedVocabularyIds, validatedVocabularyIds,
    citedKnowledgeIds, validatedKnowledgeIds
  );
}

function buildEvidenceItems_(selectedVocabulary, selectedKnowledge, selectedCard, chunks, material) {
  const evidence = [];
  if (selectedVocabulary && selectedVocabulary.easyDefinition) {
    evidence.push({
      id: selectedVocabulary.vocabularyId,
      kind: 'vocabulary',
      label: '교사 승인 어휘: ' + selectedVocabulary.term,
      location: selectedVocabulary.sourceLocation || selectedVocabulary.sourceLabel || material.sourceLabel,
      excerpt: shortenEvidence_(
        selectedVocabulary.term + ': ' + selectedVocabulary.easyDefinition,
        180
      ),
      url: selectedVocabulary.sourceUrl || material.sourceUrl || ''
    });
  }
  if (selectedKnowledge && selectedKnowledge.evidenceQuote) {
    evidence.push({
      id: selectedKnowledge.knowledgeId,
      kind: 'knowledge',
      label: '교사 승인 지식: ' + selectedKnowledge.title,
      location: selectedKnowledge.sourceLocation || material.sourceLabel,
      excerpt: shortenEvidence_(selectedKnowledge.evidenceQuote, 180),
      url: material.sourceUrl || ''
    });
  }
  if (selectedCard && selectedCard.evidenceText) {
    evidence.push({
      id: selectedCard.cardId,
      kind: 'card',
      label: selectedCard.title || '교사 승인 카드',
      location: selectedCard.sourceLocation || material.sourceLabel,
      excerpt: shortenEvidence_(selectedCard.evidenceText, 180),
      url: material.sourceUrl || ''
    });
  }
  (chunks || []).slice(0, 2).forEach(function (chunk) {
    if (evidence.some(function (item) { return item.excerpt === chunk.content; })) return;
    evidence.push({
      id: chunk.chunkId,
      kind: 'material',
      label: chunk.sourceLabel || material.sourceLabel || material.title,
      location: chunk.sourceLocation || '',
      excerpt: shortenEvidence_(chunk.content, 180),
      url: material.sourceUrl || ''
    });
  });
  return evidence;
}

function renderAIUsedEvidence_(reply, usedIds, retrieval, material) {
  const evidence = [];
  const selected = { vocabulary: [], knowledge: [], cards: [] };
  const kinds = [
    ['vocabulary', 'vocabularyId'], ['knowledge', 'knowledgeId'],
    ['cards', 'cardId'], ['chunks', 'chunkId']
  ];
  usedIds.filter(function (id, index) { return usedIds.indexOf(id) === index; })
    .forEach(function (id) {
      kinds.forEach(function (kind) {
        const row = (retrieval[kind[0]] || []).filter(function (entry) {
          return String(entry[kind[1]]) === id;
        })[0];
        if (!row) return;
        if (selected[kind[0]]) selected[kind[0]].push(id);
        const items = buildEvidenceItems_(
          kind[0] === 'vocabulary' ? row : null,
          kind[0] === 'knowledge' ? row : null,
          kind[0] === 'cards' ? row : null,
          kind[0] === 'chunks' ? [row] : [], material);
        items.forEach(function (item) { evidence.push(item); });
      });
    });
  return makeResponseResult_(reply, evidence.length ? 'supported' : 'source_insufficient',
    selected.cards, selected.cards, evidence, selected.vocabulary, selected.vocabulary,
    selected.knowledge, selected.knowledge);
}

function renderKnowledgeDefinition_(knowledge) {
  const explanation = String(knowledge.easyExplanation || knowledge.content || '').trim();
  return explanation + ' 지문의 근거 문장도 함께 확인해 볼까요?';
}

function renderKnowledgeFact_(knowledge) {
  const content = String(knowledge.content || knowledge.easyExplanation || '').trim();
  if (String(knowledge.knowledgeType || '') === 'relation') {
    return '자료의 근거를 바탕으로 추론하면, ' + content +
      ' 이 추론이 맞는지 근거 문장과 연결해 확인해 볼까요?';
  }
  return '교사가 승인한 자료에서는 ' + content +
    ' 근거 문장과 연결해 자기 말로 한 번 더 설명해 볼까요?';
}

function fallbackResponse_(plan, material) {
  const fallback = {
    receive: '근거를 더해 생각을 표현했군요. 처음 생각과 무엇이 달라졌는지 말해 볼까요?',
    clarify: plan.sourceStatus === 'source_insufficient'
      ? '교사가 승인한 어휘 자료에서 바로 확인할 수 없는 낱말이에요. 어려운 낱말을 다시 적어 주면 선생님이 확인할 수 있게 남겨 둘게요.'
      : '어느 낱말이나 문장이 어려운지 한 부분을 골라 주세요.',
    offer_clue: '결과가 나타난 문장과 그 앞 문장을 이어서 읽어 볼까요?',
    check_evidence: plan.sourceStatus === 'source_insufficient'
      ? '승인된 자료에서 바로 연결되는 근거를 찾지 못했어요. 지문의 어느 부분을 보고 그렇게 생각했는지 알려 주세요.'
      : '그렇게 생각한 근거를 지문의 어느 부분에서 찾았나요?',
    close: '오늘 말한 생각은 여기까지 저장할게요. 참여해 줘서 고마워요.'
  };
  return fallback[plan.primaryMove] || material.startQuestion;
}

function makeResponseResult_(
  text, sourceStatus, citedCardIds, validatedCardIds, evidence,
  citedVocabularyIds, validatedVocabularyIds, citedKnowledgeIds, validatedKnowledgeIds
) {
  return {
    text: String(text || ''),
    sourceStatus: String(sourceStatus || 'source_insufficient'),
    citedCardIds: citedCardIds || [],
    validatedCardIds: validatedCardIds || [],
    citedVocabularyIds: citedVocabularyIds || [],
    validatedVocabularyIds: validatedVocabularyIds || [],
    citedKnowledgeIds: citedKnowledgeIds || [],
    validatedKnowledgeIds: validatedKnowledgeIds || [],
    evidence: evidence || []
  };
}

function shortenEvidence_(text, maxLength) {
  const value = String(text || '').trim();
  return value.length > maxLength ? value.slice(0, maxLength - 1) + '…' : value;
}

function replaceCardVariables_(text, material) {
  return String(text)
    .replace(/\{title\}/g, material.title)
    .replace(/\{startQuestion\}/g, material.startQuestion)
    .replace(/\{sourceLabel\}/g, material.sourceLabel || material.title);
}
