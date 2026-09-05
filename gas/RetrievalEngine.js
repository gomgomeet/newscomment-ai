/**
 * 교사가 승인한 지식, 카드, 학년별 어휘, 자료 구간을 대상으로 검색하는 RAG 검색기입니다.
 * 관련도와 신뢰도를 분리하여, 신뢰도가 높아도 질문과 무관하면 후보가 되지 않습니다.
 */

function retrieveApprovedEvidence_(input) {
  if (input.plan.primaryMove === 'safety_redirect' || input.plan.primaryMove === 'close') {
    return emptyRetrievalResult_();
  }
  const corpus = getRetrievalCorpus_(input.botId, input.material, input.config || {});
  const followup = /(?:이\s*글|여기|그\s*말|그게|그렇게|어떤\s*뜻|몰라|모르겠)/.test(input.query);
  const previousQuestion = followup && (input.history || []).slice().reverse().find(function (row) {
    return row.speaker === 'student' && ['ask_definition', 'ask_fact'].indexOf(row.studentMove) >= 0;
  });
  const query = input.query + (previousQuestion ? ' ' + previousQuestion.text : '');
  const result = rankEvidenceCandidates_(query, {
    studentMove: input.analysis.studentMove,
    primaryMove: input.plan.primaryMove,
    hintLevel: input.plan.hintLevel,
    materialId: input.material.materialId,
    version: input.material.version
  }, input.material, corpus.cards, corpus.vocabulary, corpus.chunks,
  input.config || {}, corpus.knowledge);
  // 지시어로 이어 묻는 질문은 직전 질문을 검색에만 보탠다. 발화·국면 입력은 원문을 유지한다.
  // 현재 자료의 승인 구간만 사용하며, 이전 자료의 근거나 임의 답변을 만들지 않는다.
  if ((followup || /\d+(?:\.\d+)?\s*[%％]/.test(input.query)) && input.analysis.studentMove !== 'ask_definition' &&
      !result.chunks.length && corpus.chunks.length &&
      (input.analysis.relatedQuestion || previousQuestion)) {
    result.chunks = corpus.chunks.slice(0, Math.max(1, Number(input.config.MAX_RETRIEVAL_RESULTS || 3)));
    result.retrievedChunkIds = result.chunks.map(function (chunk) { return chunk.chunkId; });
    result.confidence = 'medium';
  }
  return result;
}

function getRetrievalCorpus_(botId, material, config) {
  const materialId = String(material.materialId || '');
  const version = String(material.version || 'v1');
  const sourceHash = String(material.sourceHash || makeMaterialSourceHash_(material));
  const corpus = {
    cards: getActiveCards_(material),
    vocabulary: getApprovedVocabularyEntries_().filter(function (entry) {
      return String(entry.sourceId || '') === materialId &&
        String(entry.version || 'v1') === version && (!entry.sourceHash || String(entry.sourceHash) === sourceHash);
    }),
    chunks: getApprovedMaterialChunks_(materialId, version),
    knowledge: getApprovedKnowledgeItems_(material)
  };
  return corpus;
}

function rankEvidenceCandidates_(
  query, dialogue, material, cards, vocabulary, chunks, config, knowledge
) {
  const normalizedQuery = normalizeForSearch_(query);
  const queryTokens = tokenizeForSearch_(query);
  const minimum = Number(config.MIN_RELEVANCE_SCORE || 3);
  const limit = Math.max(1, Number(config.MAX_RETRIEVAL_RESULTS || 3));
  const rankedVocabulary = rankVocabularyEntries_(
    query, dialogue, material, vocabulary || [], limit
  );
  const rankedKnowledge = (knowledge || []).map(function (item) {
    const lexicalScore = scoreLexicalRelevance_(normalizedQuery, queryTokens, [
      { text: item.keywords, weight: 5 },
      { text: item.title, weight: 4 },
      { text: item.content, weight: 3 },
      { text: item.easyExplanation, weight: 2 },
      { text: item.evidenceQuote, weight: 1 }
    ]);
    const typeScore = scoreKnowledgeTypeRelevance_(item, dialogue);
    const relevanceScore = lexicalScore + typeScore;
    const trustScore = scoreTrust_(item, dialogue);
    return Object.assign({}, item, {
      lexicalScore: roundScore_(lexicalScore),
      typeScore: roundScore_(typeScore),
      relevanceScore: roundScore_(relevanceScore),
      trustScore: roundScore_(trustScore),
      finalScore: roundScore_(relevanceScore + trustScore * 0.1),
      passedRelevanceGate: lexicalScore > 0 && relevanceScore >= minimum &&
        isKnowledgeTypeAllowedForMove_(item, dialogue)
    });
  }).filter(function (item) {
    return item.passedRelevanceGate;
  }).sort(compareRankedItems_).slice(0, limit);

  const rankedCards = (cards || []).map(function (card) {
    const lexicalScore = scoreLexicalRelevance_(normalizedQuery, queryTokens, [
      { text: card.questionPatterns, weight: 5 },
      { text: card.keywords, weight: 4 },
      { text: card.title, weight: 3 },
      { text: card.evidenceText, weight: 2 },
      { text: card.response, weight: 1 }
    ]);
    const dialogueScore = scoreDialogueRelevance_(card, dialogue);
    const relevanceScore = lexicalScore + dialogueScore;
    const trustScore = scoreTrust_(card, dialogue);
    const isKnowledgeCard = Boolean(String(card.evidenceText || '').trim());
    const passedRelevanceGate = isKnowledgeCard
      ? lexicalScore > 0 && relevanceScore >= minimum
      : (lexicalScore > 0 || dialogueScore >= 5) && relevanceScore >= minimum;
    return Object.assign({}, card, {
      lexicalScore: roundScore_(lexicalScore),
      dialogueScore: roundScore_(dialogueScore),
      relevanceScore: roundScore_(relevanceScore),
      trustScore: roundScore_(trustScore),
      finalScore: roundScore_(relevanceScore + trustScore * 0.1),
      passedRelevanceGate: passedRelevanceGate
    });
  }).filter(function (card) {
    return card.passedRelevanceGate;
  }).sort(compareRankedItems_).slice(0, limit);

  const rankedChunks = (chunks || []).map(function (chunk) {
    const relevanceScore = scoreLexicalRelevance_(normalizedQuery, queryTokens, [
      { text: chunk.keywords, weight: 4 },
      { text: chunk.content, weight: 2 },
      { text: chunk.sourceLabel, weight: 1 }
    ]);
    return Object.assign({}, chunk, {
      relevanceScore: roundScore_(relevanceScore), trustScore: 3,
      finalScore: roundScore_(relevanceScore + 0.3),
      passedRelevanceGate: relevanceScore >= minimum
    });
  }).filter(function (chunk) {
    return chunk.passedRelevanceGate;
  }).sort(compareRankedItems_).slice(0, limit);

  const allScores = rankedVocabulary.map(function (entry) { return entry.relevanceScore; })
    .concat(rankedKnowledge.map(function (item) { return item.relevanceScore; }))
    .concat(rankedCards.map(function (card) { return card.relevanceScore; }))
    .concat(rankedChunks.map(function (chunk) { return chunk.relevanceScore; }));
  const contentScores = contentEvidenceScores_(
    dialogue, rankedVocabulary, rankedKnowledge, rankedChunks
  );
  const isContentQuestion = dialogue.studentMove === 'ask_fact' ||
    dialogue.studentMove === 'ask_definition';
  const topScore = isContentQuestion
    ? (contentScores[0] || 0)
    : allScores.length ? Math.max.apply(null, allScores) : 0;
  const scoreGap = contentScores.length > 1
    ? roundScore_(contentScores[0] - contentScores[1])
    : contentScores.length === 1 ? contentScores[0] : 0;
  const ambiguous = contentScores.length > 1 &&
    contentScores[1] >= minimum && scoreGap <= 1;
  return {
    vocabulary: rankedVocabulary,
    knowledge: rankedKnowledge,
    cards: rankedCards,
    chunks: rankedChunks,
    queryTokens: queryTokens,
    topScore: topScore,
    scoreGap: scoreGap,
    ambiguous: ambiguous,
    confidence: confidenceForScore_(topScore),
    retrievedVocabularyIds: rankedVocabulary.map(function (entry) { return entry.vocabularyId; }),
    retrievedKnowledgeIds: rankedKnowledge.map(function (item) { return item.knowledgeId; }),
    retrievedCardIds: rankedCards.map(function (card) { return card.cardId; }),
    retrievedChunkIds: rankedChunks.map(function (chunk) { return chunk.chunkId; }),
    retrievedExternalSourceIds: []
  };
}

function isKnowledgeTypeAllowedForMove_(item, dialogue) {
  const type = String(item.knowledgeType || '');
  const move = String(dialogue.studentMove || '');
  if (move === 'ask_definition') return type === 'vocabulary';
  if (move === 'ask_fact') {
    return ['fact', 'relation', 'concept', 'paragraph_summary', 'overview']
      .indexOf(type) >= 0;
  }
  return true;
}

function scoreKnowledgeTypeRelevance_(item, dialogue) {
  const type = String(item.knowledgeType || '');
  const move = String(dialogue.studentMove || '');
  if (move === 'ask_definition') return type === 'vocabulary' ? 5 : 0;
  if (move === 'ask_fact') {
    return ['fact', 'relation', 'concept', 'paragraph_summary', 'overview']
      .indexOf(type) >= 0 ? 3 : 0;
  }
  if (move === 'express_uncertainty' && type === 'misconception') return 4;
  if (move === 'attempt_answer' && ['concept', 'relation', 'misconception'].indexOf(type) >= 0) {
    return 2;
  }
  return type === 'discussion' ? 1 : 0;
}

function scoreLexicalRelevance_(normalizedQuery, queryTokens, fields) {
  if (!normalizedQuery || queryTokens.length === 0) return 0;
  let score = 0;
  (fields || []).forEach(function (field) {
    const weight = Number(field.weight || 1);
    splitSearchPhrases_(field.text).forEach(function (candidate) {
      const normalizedCandidate = normalizeForSearch_(candidate);
      if (!normalizedCandidate) return;
      if (normalizedCandidate === normalizedQuery ||
          (normalizedCandidate.length >= 4 && normalizedQuery.indexOf(normalizedCandidate) >= 0) ||
          (normalizedQuery.length >= 4 && normalizedCandidate.indexOf(normalizedQuery) >= 0)) {
        score += weight * 2;
      }
      const candidateTokens = tokenizeForSearch_(candidate);
      const overlap = queryTokens.filter(function (token) {
        return candidateTokens.indexOf(token) >= 0;
      }).length;
      if (overlap > 0) {
        score += weight * overlap;
        score += weight * (overlap / Math.max(queryTokens.length, candidateTokens.length));
      }
    });
  });
  return score;
}

function scoreDialogueRelevance_(card, dialogue) {
  let score = 0;
  if (card.studentMove && card.studentMove === dialogue.studentMove) score += 5;
  if (card.primaryMove && card.primaryMove === dialogue.primaryMove) score += 3;
  if (Number(card.hintLevel || 0) === Number(dialogue.hintLevel || 0)) score += 2;
  return score;
}

function scoreTrust_(item, dialogue) {
  let score = 0;
  if (String(item.status || '').toLowerCase() === 'approved') score += 3;
  if (item.reliability === 'A') score += 3;
  else if (item.reliability === 'B') score += 2;
  else if (item.reliability === 'C') score += 1;
  if (!item.materialId || item.materialId === dialogue.materialId) score += 1;
  if (!item.version || item.version === dialogue.version) score += 1;
  return score;
}

function compareRankedItems_(left, right) {
  if (right.relevanceScore !== left.relevanceScore) return right.relevanceScore - left.relevanceScore;
  if (right.trustScore !== left.trustScore) return right.trustScore - left.trustScore;
  return String(left.knowledgeId || left.cardId || left.chunkId || left.vocabularyId)
    .localeCompare(String(right.knowledgeId || right.cardId || right.chunkId || right.vocabularyId));
}

function confidenceForScore_(score) {
  if (score >= 10) return 'high';
  if (score >= 5) return 'medium';
  if (score > 0) return 'low';
  return 'none';
}

function normalizeForSearch_(text) {
  let normalized = String(text || '').toLowerCase();
  if (normalized.normalize) normalized = normalized.normalize('NFKC');
  return normalized.replace(/[^가-힣a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenizeForSearch_(text) {
  const stopWords = [
    '그리고', '하지만', '그런데', '그래서', '이것', '그것', '우리', '저는',
    '제가', '있다', '했다', '해요', '인가요', '뭐예요', '주세요', '같아요'
  ];
  const tokens = normalizeForSearch_(text).split(' ')
    .map(function (token) {
      return token.replace(/(에서는|에서|으로|에게|이라고|라는|처럼|부터|까지|하고요|하고|은|는|이|가|을|를|도|만|와|과|의)$/g, '');
    })
    .filter(function (token) {
      return token.length >= 2 && stopWords.indexOf(token) < 0;
    });
  return Array.from(new Set(tokens));
}

function splitSearchPhrases_(text) {
  return String(text || '').split(/[|,;\n]+/)
    .map(function (value) { return value.trim(); })
    .filter(Boolean);
}

function makeReviewOccurrenceKey_(materialId, question) {
  const tokens = tokenizeForSearch_(question).slice(0, 8).sort();
  const basis = tokens.length ? tokens.join('-') : normalizeForSearch_(question).slice(0, 40);
  return String(materialId || 'material') + '::' + basis;
}

function emptyRetrievalResult_() {
  return {
    vocabulary: [], knowledge: [], cards: [], chunks: [], queryTokens: [],
    topScore: 0, scoreGap: 0, ambiguous: false, confidence: 'none',
    retrievedVocabularyIds: [],
    retrievedKnowledgeIds: [], retrievedCardIds: [], retrievedChunkIds: [],
    retrievedExternalSourceIds: []
  };
}

function contentEvidenceScores_(dialogue, vocabulary, knowledge, chunks) {
  const move = String(dialogue.studentMove || '');
  let scores = [];
  if (move === 'ask_definition') {
    const preferred = (vocabulary || []).length > 0 ? vocabulary : knowledge;
    scores = (preferred || []).map(function (item) { return item.relevanceScore; });
  } else if (move === 'ask_fact') {
    const linkedChunkIds = {};
    (knowledge || []).forEach(function (item) {
      if (item.chunkId) linkedChunkIds[String(item.chunkId)] = true;
    });
    scores = (knowledge || []).map(function (item) { return item.relevanceScore; })
      .concat((chunks || []).filter(function (item) {
        return !linkedChunkIds[String(item.chunkId || '')];
      }).map(function (item) { return item.relevanceScore; }));
  }
  return scores.map(Number).filter(function (score) { return score > 0; })
    .sort(function (left, right) { return right - left; });
}

function roundScore_(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
