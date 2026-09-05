function guardStudentInput_(message) {
  const config = readConfig_();
  const maxLength = Number(config.MAX_INPUT_LENGTH || 500);
  const tooLong = message.length > maxLength;
  const blockedPattern = /(비밀번호|주민등록번호|주민번호|계좌번호)/;
  const blocked = tooLong || blockedPattern.test(message);

  let safeText = message
    .replace(/(?:내|제)\s*이름(?:은|이)?\s*[가-힣]{2,4}/g, '[이름 가림]')
    .replace(/01[016789][- ]?\d{3,4}[- ]?\d{4}/g, '[전화번호 가림]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[이메일 가림]')
    .replace(/\d{6}[- ]?[1-4]\d{6}/g, '[주민번호 가림]');

  if (tooLong) safeText = safeText.slice(0, maxLength);
  return {
    blocked: blocked,
    reason: tooLong ? 'input_too_long' : blocked ? 'sensitive_information' : '',
    safeText: safeText
  };
}

function analyzeStudentTurn_(input) {
  const message = String(input.message || '').trim();
  const compact = message.replace(/\s+/g, '');
  const action = String(input.action || 'message');

  const passageWords = contentWords_(input.material.text);
  const answerWords = contentWords_(message);
  const passageEcho = answerWords.some(function (word) { return passageWords.indexOf(word) >= 0; });
  const settings = phaseSettingsFor_(input.material);
  const sourceNumber = (message.match(/\d+(?:\.\d+)?\s*[%％]/g) || []).some(function (number) {
    return (String(input.material.title || '') + ' ' + input.material.text).indexOf(number.replace(/\s/g, '')) >= 0;
  });
  const previousStudent = (input.history || []).slice().reverse().find(function (row) { return row.speaker === 'student'; });
  const contextualQuestion = /(?:이\s*글|그\s*말|그게|그렇게|근데\s*왜|어떤\s*뜻)/.test(message) &&
    (isStudentQuestion(message) || isDefinitionQuestion_(message)) && previousStudent && isTruthy_(previousStudent.relatedQuestion);
  const related = isPassageRelatedQuestion(message, settings) || sourceNumber || Boolean(contextualQuestion);
  let studentMove = 'attempt_answer';
  if (/((?:내|제)이름은|전화번호는|연락처는|주민번호|비밀번호|대필|대신써|숙제해줘|정답알려줘|\[이름가림\]|\[전화번호가림\])/.test(compact)) {
    studentMove = 'safety';
  } else if (/(왜자꾸물어|그냥설명만|질문하지마|답만해)/.test(compact)) {
    studentMove = 'repair';
  } else if (/^(안녕(?:하세요)?|하이|고마워(?:요)?|감사합니다)[.!?？~]*$/.test(compact)) {
    studentMove = 'greeting';
  } else if (action === 'close' || /(그만|끝낼|마칠|이제됐)/.test(compact)) {
    studentMove = 'close';
  } else if (action === 'hint' || /(힌트|도와|모르겠|몰라|어려워)/.test(compact)) {
    studentMove = /모르겠|몰라|확실하지|헷갈/.test(compact)
      ? 'express_uncertainty'
      : 'request_hint';
  } else if (sourceNumber && isStudentQuestion(message)) {
    studentMove = 'ask_fact';
  } else if (isStudentQuestion(message) && !related) {
    studentMove = 'small_talk';
  } else if (isDefinitionQuestion_(message)) {
    studentMove = 'ask_definition';
  } else if (/(고칠|다시생각|아까와다르게|정정)/.test(compact)) {
    studentMove = 'revise';
  } else if (/[?？]$/.test(message) || /(왜|어떻게|무엇|뭐예요|인가요)/.test(compact)) {
    studentMove = 'ask_fact';
  }

  const reasonGiven = /(때문|까닭|이유|왜냐|그래서|덕분|으니|니까)/.test(message);

  if (
    studentMove === 'attempt_answer' &&
    passageEcho &&
    /(글에|지문에|문장에|나와|적혀|말했)/.test(message)
  ) {
    studentMove = 'give_evidence';
  }

  return {
    studentMove: studentMove,
    sourceNumber: sourceNumber,
    ghostwriting: /(대필|대신써|숙제해줘|정답알려줘)/.test(compact),
    attempted: message.replace(/[\s.!?~]/g, '').length >= 2,
    passageEcho: passageEcho,
    relatedQuestion: related && ['ask_fact', 'ask_definition'].indexOf(studentMove) >= 0,
    reasonGiven: reasonGiven,
    feedbackUptake: studentMove === 'revise' ? 'revised' : 'not_observed',
    helpSeeking:
      studentMove === 'request_hint' || studentMove === 'express_uncertainty'
        ? 'hint_request'
        : 'independent_attempt',
    knowledgeState:
      passageEcho && reasonGiven
        ? 'demonstrated'
        : passageEcho
        ? 'partial'
        : 'unobserved'
  };
}

function isDefinitionQuestion_(message) {
  const compact = String(message || '').replace(/[\s"'“”‘’]/g, '');
  return /(뜻|무슨말|의미|뭐라는말)/.test(compact) ||
    /(?:이|가|은|는)?뭐(?:예요|에요|야|죠|지)?[?？.]?$/.test(compact) ||
    /(?:이|가|은|는)?무엇(?:인가요|이죠|일까요)[?？.]?$/.test(compact);
}

function contentWords_(text) {
  const stopWords = ['그리고', '하지만', '그런데', '이것', '그것', '우리', '있다', '했다'];
  const words = String(text || '')
    .split(/[^가-힣A-Za-z0-9]+/)
    .map(function (word) {
      return word.trim().replace(/(에서는|에서|으로|에게|은|는|이|가|을|를|도|만|와|과|의)$/, '');
    })
    .filter(function (word) {
      return word.length >= 2 && stopWords.indexOf(word) < 0;
    });
  return Array.from(new Set(words));
}
