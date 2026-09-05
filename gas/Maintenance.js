/**
 * 0단계 시트 정리 — 코드 고치기 전에 시트에서 바로 할 것.
 * docs/GAS-챗봇-경량화-2국면-실행계획.md 0단계, docs/구글시트-챗봇-검토-2026-09-05.md 5절.
 *
 * Apps Script 편집기에서 실행한다.
 *   phase0Cleanup()        → 바꿀 내용만 로그로 보여 준다 (아무것도 안 바꿈)
 *   phase0Cleanup(true)    → 실제로 바꾼다
 *
 * 시트는 이름이 아니라 머리글로 찾는다(cardId·chunkId·key/value·reviewId).
 * 탭 이름을 바꿔도 동작한다.
 */
function phase0Cleanup(apply) {
  apply = apply === true;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const report = [];
  const activeHash = getActiveMaterialSourceHash_(ss);

  // 1) 옛 자료 카드 비활성 — sourceHash가 비었거나 현재 자료와 다른 카드
  const cards = findSheetByHeaders_(ss, ['cardId', 'active']);
  if (cards) {
    const n = updateRows_(cards, function (row) {
      const stale = !row.sourceHash || (activeHash && String(row.sourceHash) !== activeHash);
      const legacyId = /^C0(0[1-9]|10)$/.test(String(row.cardId));
      if ((stale || legacyId) && isTruthy_(row.active)) return { active: 'FALSE' };
      return null;
    }, apply);
    report.push('카드 비활성: ' + n + '장 (' + cards.getName() + ')');
  } else report.push('카드 시트를 찾지 못함');

  // 2) 사진 설명·바이라인을 청크 본문에서 제거 — "… 모습. /정예준 기자" 같은 조각
  const chunks = findSheetByHeaders_(ss, ['chunkId', 'chunkOrder', 'content']);
  if (chunks) {
    const n = updateRows_(chunks, function (row) {
      if (!isTruthy_(row.active)) return null;
      const cleaned = stripCaptions_(String(row.content || ''));
      if (cleaned === String(row.content)) return null;
      if (cleaned.length < 20) return { active: 'FALSE' };
      return { content: cleaned };
    }, apply);
    report.push('청크 캡션 제거: ' + n + '구간 (' + chunks.getName() + ')');
  } else report.push('청크 시트를 찾지 못함');

  // 3) CONFIG — 이름 묻지 않기, 출력 토큰 1500, 추론 강도 minimal, 최근 대화 4턴
  //    (PR #56 뒤: 기존 시트는 옛 값이 남으므로 여기서 맞춘다. 없는 키는 행을 새로 넣는다.)
  const config = findSheetByHeaders_(ss, ['key', 'value']);
  if (config) {
    const wanted = { ASK_NICKNAME: 'FALSE', AI_MAX_OUTPUT_TOKENS: '1500', AI_REASONING_EFFORT: 'minimal', AI_MAX_HISTORY_TURNS: '4' };
    const seen = {};
    const n = updateRows_(config, function (row) {
      const key = String(row.key || '');
      if (key) seen[key] = true;
      if (!(key in wanted) || String(row.value).toUpperCase() === String(wanted[key]).toUpperCase()) return null;
      return { value: wanted[key] };
    }, apply);
    const missing = Object.keys(wanted).filter(function (k) { return !seen[k]; });
    missing.forEach(function (k) {
      Logger.log(config.getName() + ' 행 추가: ' + k + ' = "' + wanted[k] + '"');
      if (apply) appendConfigRow_(config, k, wanted[k]);
    });
    report.push('CONFIG 변경: ' + n + '개, 추가: ' + missing.length + '개' + (missing.length ? ' (' + missing.join(', ') + ')' : ''));
  } else report.push('CONFIG 시트를 찾지 못함');

  // 4) 검토 큐 — 인사·잡담은 닫는다
  const queue = findSheetByHeaders_(ss, ['reviewId', 'question', 'status']);
  if (queue) {
    const n = updateRows_(queue, function (row) {
      if (String(row.status) !== 'open') return null;
      if (!isGreetingOrSmallTalk_(String(row.question || ''))) return null;
      return { status: 'reviewed', teacherDecision: '인사·잡담 — 검토 불필요', reviewedAt: new Date() };
    }, apply);
    report.push('검토 큐 닫음: ' + n + '건');
  } else report.push('검토 큐 시트를 찾지 못함');

  if (apply && typeof bumpRetrievalCacheRevision_ === 'function') bumpRetrievalCacheRevision_();

  const text = (apply ? '[적용됨]\n' : '[미리보기 — 바꾸지 않음. phase0Cleanup(true)로 적용]\n') + report.join('\n');
  Logger.log(text);
  try { ss.toast(text, '0단계 시트 정리', 10); } catch (e) {}
  return report;
}

/** 머리글 행에 필요한 열 이름이 모두 있는 첫 시트 */
function findSheetByHeaders_(ss, required) {
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    const lastCol = sheets[i].getLastColumn();
    if (lastCol < 1) continue;
    const header = sheets[i].getRange(1, 1, 1, lastCol).getValues()[0].map(String);
    if (required.every(function (h) { return header.indexOf(h) >= 0; })) return sheets[i];
  }
  return null;
}

/** 각 행을 객체로 넘겨 바꿀 열만 돌려받는다. 바뀐 행 수를 반환. apply=false면 로그만. */
function updateRows_(sheet, decide, apply) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return 0;
  const header = values[0].map(String);
  let changed = 0;
  for (let r = 1; r < values.length; r++) {
    const row = {};
    header.forEach(function (h, c) { row[h] = values[r][c]; });
    const patch = decide(row);
    if (!patch) continue;
    changed++;
    const keys = Object.keys(patch);
    Logger.log(sheet.getName() + ' 행 ' + (r + 1) + ': ' + keys.map(function (k) {
      return k + ' "' + String(row[k]).slice(0, 40) + '" → "' + String(patch[k]).slice(0, 40) + '"';
    }).join(', '));
    if (!apply) continue;
    keys.forEach(function (k) {
      const c = header.indexOf(k);
      if (c >= 0) sheet.getRange(r + 1, c + 1).setValue(patch[k]);
    });
  }
  return changed;
}

/** CONFIG에 key·value(·description) 열 위치를 맞춰 한 행을 붙인다. */
function appendConfigRow_(sheet, key, value) {
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const row = header.map(function (h) {
    if (h === 'key') return key;
    if (h === 'value') return value;
    if (h === 'description') return '수업 설정 (phase0Cleanup이 추가)';
    return '';
  });
  sheet.appendRow(row);
}

function getActiveMaterialSourceHash_(ss) {
  const materials = findSheetByHeaders_(ss, ['materialId', 'sourceHash']);
  if (!materials) return '';
  const values = materials.getDataRange().getValues();
  const header = values[0].map(String);
  const hashCol = header.indexOf('sourceHash');
  const activeCol = header.indexOf('active');
  for (let r = 1; r < values.length; r++) {
    if (activeCol < 0 || isTruthy_(values[r][activeCol])) return String(values[r][hashCol] || '');
  }
  return '';
}

/** "한수진 … 모습. /정예준 기자" 같은 사진 설명과 바이라인, 편집자 주 머리표를 걷어 낸다. */
function stripCaptions_(text) {
  return String(text)
    .replace(/\[편집자\s*주\]\s*/g, '')
    .replace(/\[[^\]]*ㅣ[^\]]*기자\]\s*/g, '')                            // [더팩트ㅣ대전=정예준 기자]
    .replace(/[^.!?。]*(?:모습|장면)\.\s*\/\s*[가-힣]{2,4}\s*기자\s*/g, '')  // … 모습. /정예준 기자
    .replace(/\/\s*[가-힣]{2,4}\s*기자\s*/g, '')                          // 남은 /정예준 기자
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function isGreetingOrSmallTalk_(text) {
  const t = String(text).replace(/\s+/g, '');
  return /^(안녕|하이|헬로|반가워|잘가|고마워|감사|ㅋㅋ|ㅎㅎ)/.test(t) ||
    /^(너|넌|너는)(누구|뭐|이름)/.test(t) ||
    t.length <= 2;
}

if (typeof isTruthy_ !== 'function') {
  function isTruthy_(v) { return v === true || /^(true|1|yes|y|예|참)$/i.test(String(v).trim()); }
}

/** 편집기 실행 버튼은 인수를 못 넘긴다 — 적용용 래퍼. */
function phase0CleanupPreview() { return phase0Cleanup(false); }
function phase0CleanupApply() { return phase0Cleanup(true); }
