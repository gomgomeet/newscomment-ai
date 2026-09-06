function renderResponse_(context) {
  const plan = context.plan;
  const analysis = context.analysis;
  const material = context.material;
  const retrieval = context.retrieval || emptyRetrievalResult_();

  if (plan.primaryMove === 'safety_redirect') {
    return makeResponseResult_(
      plan.reasonCode === 'input_too_long'
        ? '글이 너무 길어요. 개인정보는 빼고 가장 중요한 생각을 짧게 다시 적어 주세요.'
        : plan.reasonCode === 'GHOSTWRITING_REQUEST'
        ? '답을 대신 써 주지는 않을게요. 지문에서 필요한 내용을 이해하고 자기 말로 표현하도록 도와줄게요.'
        : '이름이나 전화번호 같은 개인정보는 적지 않아요. 반-번호만 사용하고, 지문에 대한 생각을 말해 주세요.',
      plan.sourceStatus,
      [],
      [],
      [],
      [],
      []
    );
  }

  if (['greeting', 'small_talk', 'repair'].indexOf(analysis.studentMove) >= 0) {
    const messages = { greeting: '반가워요. 지문을 읽고 궁금한 점을 말해 주세요.',
      small_talk: '이 활동에서는 지문에 나온 내용으로 함께 이야기해요.',
      repair: '알겠어요. 되묻지 않고 궁금한 내용부터 설명할게요.' };
    return makeResponseResult_(messages[analysis.studentMove], 'out_of_scope', [], [], []);
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
    text = '글에서는 “' + shortenEvidence_(firstSentence_(retrieval.chunks[0].content), 100) + '”라고 했어요.';
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
      Boolean(usedVocabulary.easyDefinition)
    ? [usedVocabulary.vocabularyId]
    : [];
  const citedKnowledgeIds = usedKnowledge ? [usedKnowledge.knowledgeId] : [];
  const validatedKnowledgeIds = usedKnowledge && usedKnowledge.evidenceQuote &&
      isApprovedStatus_(usedKnowledge.status) && isTruthy_(usedKnowledge.active) &&
      usedKnowledge.materialId === material.materialId &&
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
      location: evidenceLocation_(selectedKnowledge),
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
      location: evidenceLocation_(chunk),
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
      if (id === String(material.materialId)) {
        evidence.push({id: id, kind: 'material', label: '교사 제공 자료 제목',
          location: '자료 제목', excerpt: material.title, url: ''});
        return;
      }
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

function renderKnowledgeDefinition_(knowledge) { return String(knowledge.easyExplanation || knowledge.content || '').trim(); }

function renderKnowledgeFact_(knowledge) {
  // 학년에 맞춘 쉬운 풀이가 있으면 그것을, 없으면 원문을. 앞말은 "글을 보면" 한 마디만.
  const body = String(knowledge.easyExplanation || knowledge.content || '').trim();
  return (knowledge.knowledgeType === 'relation' ? '글을 보면, ' : '') + body;
}

function firstSentence_(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  const match = /^(.+?[.!?。])(\s|$)/.exec(value);
  return match ? match[1] : value;
}

function fallbackResponse_(plan, material) {
  // 9단계: 학생에게 보이는 말은 짧고 다정하게. "근거"·"승인"·"자료 구간" 같은 낱말은 쓰지 않는다.
  const fallback = {
    answer: '그건 글에 안 나오는 내용이라 내가 확실히 말해 주기 어려워요. 선생님께 여쭤볼 수 있게 남겨 둘게요.',
    receive: '이야기해 줘서 고마워요. 글에서 궁금한 게 있으면 편하게 물어봐요.',
    clarify: plan.sourceStatus === 'source_insufficient'
      ? '그 낱말은 글에서 바로 찾기 어렵네요. 선생님께 여쭤볼 수 있게 남겨 둘게요.'
      : '어느 낱말이 어려운지 하나만 골라 줄래요?',
    offer_clue: '결과가 나온 문장 바로 앞 문장을 한 번 더 읽어 보면 실마리가 있어요.',
    check_evidence: plan.sourceStatus === 'source_insufficient'
      ? '그렇게 생각했군요. 글에서 바로 이어지는 부분은 못 찾았지만, 어디를 보고 그렇게 생각했는지 말해 줘도 좋아요.'
      : '좋아요, 그렇게 생각했군요.',
    close: '오늘 이야기는 여기까지 저장할게요. 함께해 줘서 고마워요.'
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

function evidenceLocation_(row) {
  const match = /-(\d+)$/.exec(String(row.chunkId || ''));
  const order = Number(row.chunkOrder || (match && match[1]) || 0);
  return order > 0 ? '자료 구간 ' + order : '';
}
