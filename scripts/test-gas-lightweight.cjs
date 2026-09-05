const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class RangeMock {
  constructor(sheet, row, column, rowCount = 1, columnCount = 1) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.rowCount = rowCount;
    this.columnCount = columnCount;
  }
  getValues() {
    const rows = [];
    for (let r = 0; r < this.rowCount; r += 1) {
      const row = [];
      for (let c = 0; c < this.columnCount; c += 1) {
        row.push(this.sheet.getCell(this.row + r, this.column + c));
      }
      rows.push(row);
    }
    return rows;
  }
  getDisplayValues() {
    return this.getValues().map((row) => row.map((value) => value == null ? '' : String(value)));
  }
  setValues(values) {
    this.sheet.batchWrites = (this.sheet.batchWrites || 0) + 1;
    values.forEach((row, r) => row.forEach((value, c) => {
      this.sheet.setCell(this.row + r, this.column + c, value);
    }));
    return this;
  }
  setValue(value) {
    this.sheet.setCell(this.row, this.column, value);
    return this;
  }
  setFontWeight() { this.sheet.headerFormatWrites = (this.sheet.headerFormatWrites || 0) + 1; return this; }
  setBackground() { return this; }
  setFontColor() { return this; }
  setWrap() { return this; }
}

class SheetMock {
  constructor(name) {
    this.name = name;
    this.rows = [];
  }
  getCell(row, column) {
    return this.rows[row - 1]?.[column - 1] ?? '';
  }
  setCell(row, column, value) {
    while (this.rows.length < row) this.rows.push([]);
    while (this.rows[row - 1].length < column) this.rows[row - 1].push('');
    this.rows[row - 1][column - 1] = value;
  }
  getLastRow() {
    for (let r = this.rows.length - 1; r >= 0; r -= 1) {
      if (this.rows[r].some((value) => value !== '' && value != null)) return r + 1;
    }
    return 0;
  }
  getLastColumn() {
    return this.rows.reduce((max, row) => Math.max(max, row.length), 0);
  }
  getRange(row, column, rowCount = 1, columnCount = 1) {
    return new RangeMock(this, row, column, rowCount, columnCount);
  }
  getDataRange() {
    return new RangeMock(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn()));
  }
  appendRow(row) {
    this.getRange(this.getLastRow() + 1, 1, 1, row.length).setValues([row]);
  }
  setFrozenRows() { return this; }
}

class SpreadsheetMock {
  constructor() {
    this.id = 'sheet-test';
    this.sheets = new Map();
  }
  getId() { return this.id; }
  copy() {
    const copy = new SpreadsheetMock(); copy.id = 'load-copy-' + (++uuidCounter);
    this.sheets.forEach((sheet, name) => { copy.insertSheet(name).rows = sheet.rows.map(row => row.slice()); });
    spreadsheetRegistry.set(copy.id, copy); return copy;
  }
  getSheetByName(name) { return this.sheets.get(name) || null; }
  insertSheet(name) {
    const sheet = new SheetMock(name);
    this.sheets.set(name, sheet);
    return sheet;
  }
  setActiveSheet(sheet) { this.activeSheet = sheet; }
  toast() {}
}

const spreadsheet = new SpreadsheetMock();
const spreadsheetRegistry = new Map([[spreadsheet.getId(), spreadsheet]]);
const properties = new Map();
const cache = new Map();
const aiRequests = [];
const aiResponses = [];
const addedMenus = [];
let uuidCounter = 0;

const context = {
  console,
  SpreadsheetApp: {
    flush() {},
    getActiveSpreadsheet: () => spreadsheet,
    openById: id => { if (!spreadsheetRegistry.has(id)) throw new Error('Unknown spreadsheet'); return spreadsheetRegistry.get(id); },
    getUi: () => ({
      createMenu: (name) => {
        const items = [];
        const menu = {
          addItem(label, functionName) {
            items.push({ label, functionName });
            return menu;
          },
          addSeparator() {
            items.push({ separator: true });
            return menu;
          },
          addToUi() {
            addedMenus.push({ name, items });
          }
        };
        return menu;
      }
    })
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (key) => properties.get(key) || null,
      setProperty: (key, value) => properties.set(key, String(value)),
      deleteProperty: (key) => properties.delete(key)
    })
  },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' },
    Charset: { UTF_8: 'utf8' },
    computeDigest: (_algorithm, value) => crypto.createHash('sha256').update(String(value), 'utf8').digest(),
    base64EncodeWebSafe: (value) => Buffer.from(value).toString('base64url'),
    getUuid: () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '0')}`
  },
  LockService: {
    getScriptLock: () => ({ waitLock() {}, releaseLock() {} })
  },
  CacheService: {
    getScriptCache: () => ({
      get: (key) => cache.get(key) || null,
      put: (key, value) => cache.set(key, value)
    })
  },
  ScriptApp: {
    getService: () => ({
      getUrl: () => 'https://script.google.com/macros/s/test-deployment/exec'
    })
  },
  UrlFetchApp: {
    fetch: (_url, options) => {
      aiRequests.push(JSON.parse(options.payload));
      const next = aiResponses.shift();
      if (!next) throw new Error('Unexpected AI request in integration test.');
      return {
        getResponseCode: () => next.statusCode || 200,
        getContentText: () => next.rawText === undefined
          ? JSON.stringify(next.body)
          : String(next.rawText)
      };
    }
  }
};
vm.createContext(context);

const assert = require('node:assert/strict');
SheetMock.prototype.clearContents = function () { this.rows = []; return this; };
SheetMock.prototype.getName = function () { return this.name; };
SpreadsheetMock.prototype.getName = function () { return 'test'; };
const gasRoot = path.resolve(__dirname, '../gas');
for (const file of fs.readdirSync(gasRoot).filter(f => f.endsWith('.js'))) {
  vm.runInContext(fs.readFileSync(path.join(gasRoot, file), 'utf8'), context, {filename: file});
}
const run = source => vm.runInContext(source, context);
context.CacheService = {getScriptCache() {throw new Error('Retrieval cache must not be accessed');}};
run('setupProject()');
run(`appendObjectsToSheet_(getSpreadsheet_().getSheetByName('MATERIALS'), [{
  materialId:'MAT-1', title:'고추장 수업', grade:'초등 4학년', gradeCode:'E4', standard:'글의 내용을 이해한다',
  text:'학생들은 고추장을 만들 때 고춧가루와 찹쌀을 섞었다. 학교의 정책은 식생활 교육을 통해 정체성을 배우는 것이다.',
  startQuestion:'무엇을 만들었나요?', version:'v1', active:true, status:'approved', activityMode:'discussion'
}]); syncMaterialChunks_();`);
const material = run('getActiveMaterial_()');
const bootstrap = run(`getBootstrapData({}, '03-012')`);
assert.equal(bootstrap.sessionId, 'MAT-1:3-12');
assert.equal(bootstrap.studentCode, '3-12');
assert.throws(() => run(`getBootstrapData({}, '홍길동')`), /반-번호/);
context.testPayload = {sessionId: bootstrap.sessionId, lesson: bootstrap.lesson, message: '고추장은 어떤 재료로 만들었나요?'};
const reply = run('submitTurn(testPayload)');
assert.equal(reply.primaryMove, 'answer');
assert.equal(reply.expectsStudentReply, false);
assert.ok(!reply.reply.includes('?'));
assert.ok(reply.reply.includes('고춧가루'));
assert.equal(run(`getBootstrapData({}, '3-12').history.length`), 2);
assert.equal(run(`getBootstrapData({}, '3-13').history.length`), 0);
run(`getOrCreateTeacherAccessToken_(); setConfigValue_('AI_ENABLED','TRUE'); setConfigValue_('AI_MODEL','test-model');`);
properties.set('OPENAI_API_KEY','test-only');
const chunkId = run('getApprovedMaterialChunks_("MAT-1","v1")[0].chunkId');
aiResponses.push({body:{output_text:JSON.stringify({reply:'고춧가루와 찹쌀을 섞었어요.',usedEvidenceIds:[chunkId]})}});
const beforeCalls = aiRequests.length;
const aiReply = run('submitTurn(testPayload)');
assert.equal(aiRequests.length-beforeCalls, 1);
assert.equal(aiRequests.at(-1).model, 'test-model');
assert.equal(aiRequests.at(-1).text.format.name, 'grounded_tutor_reply');
assert.ok(!aiRequests.at(-1).input.includes('자료 구간'));
assert.ok(aiReply.reply.includes('근거: 자료 구간 1'));
assert.equal(run(`getSessionTurns_('MAT-1:3-12').length`), 4);
const pairWrites = spreadsheet.getSheetByName('TURNS').batchWrites;
context.testPayload.message='안녕하세요?';
run('submitTurn(testPayload)');
assert.equal(aiRequests.length-beforeCalls,1);
assert.equal(spreadsheet.getSheetByName('TURNS').batchWrites, pairWrites+1);
assert.equal(run(`getRowsAsObjects_('REVIEW_QUEUE').length`),0);
context.testPayload.message='정책은 무슨 뜻이에요?';
run('submitTurn(testPayload)');
assert.equal(aiRequests.length-beforeCalls,1,'no evidence means no AI call');
assert.equal(run(`getRowsAsObjects_('REVIEW_QUEUE').length`),1);
const pending = run('getPendingSupplementReviews_(getActiveMaterial_())');
context.reviewPayload={reviewId:pending.items[0].reviewId, sourceHash:material.sourceHash, action:'supplement', term:'정책',definition:'학교가 정한 일의 방향',group:'학교'};
run(`resolveSupplementReview(getOrCreateTeacherAccessToken_(), reviewPayload)`);
assert.equal(run('getPendingSupplementReviews_(getActiveMaterial_()).total'),0);
run(`setConfigValue_('AI_ENABLED','FALSE')`);
assert.ok(run('submitTurn(testPayload)').reply.includes('학교가 정한 일의 방향'));
// Knowledge survives contraction without stored generation/version/approval metadata.
context.knowledgeFixture = {knowledgeId:'KN-TEST-01',materialId:'MAT-1',sourceHash:material.sourceHash,
  knowledgeType:'concept',title:'식생활 교육',content:'정체성을 배운다.',easyExplanation:'먹는 문화를 배운다.',
  evidenceQuote:'고춧가루와 찹쌀을 섞었다',chunkId,status:'draft',active:false};
run(`appendObjectsToSheet_(getSpreadsheet_().getSheetByName('KNOWLEDGE'),[knowledgeFixture])`);
assert.equal(run('getLatestKnowledgePack_(getActiveMaterial_()).generationId'),'KGEN-TEST');
context.knowledgeEdit={generationId:'KGEN-TEST',items:[{...context.knowledgeFixture,keywords:['식생활']} ]};
run('approveKnowledgePackDrafts(getOrCreateTeacherAccessToken_(),knowledgeEdit)');
assert.equal(run('getApprovedKnowledgeItems_(getActiveMaterial_()).length'),1);
assert.throws(()=>run(`getActiveSessionContext_('MAT-1:3-12',{lessonId:'MAT-1',sourceHash:'old'})`),/변경/);
for(const name of ['SESSIONS','RETRIEVAL_LOG','BOARD','READINESS','EVALUATION_LOG','GENERATION_LOG','SOURCE_LIBRARY']) assert.equal(spreadsheet.getSheetByName(name),null);
const schema = run('QUESTION_BOT_HEADERS_');
assert.equal(schema.TURNS.length,18);
assert.equal(schema.KNOWLEDGE.length,11);
assert.equal(schema.REVIEW_QUEUE.length,10);
// Legacy copy conversion retains actual content and active/approval flags.
const legacy = new SpreadsheetMock();
legacy.insertSheet('CONFIG').rows=[['key','value','description'],['AI_MODEL_QUALITY','kept-model',''],['ASK_NICKNAME',true,'']];
legacy.insertSheet('MATERIALS').rows=spreadsheet.getSheetByName('MATERIALS').rows.map(r=>r.slice());
legacy.insertSheet('MATERIAL_CHUNKS').rows=[['chunkId','materialId','chunkOrder','content','version','contentHash','active','status'],
  [chunkId,'MAT-1',1,'이미 캡션을 정리한 본문','v1',run('makeContentHash_(getActiveMaterial_().text)'),true,'approved']];
legacy.insertSheet('KNOWLEDGE_ITEMS').rows=spreadsheet.getSheetByName('KNOWLEDGE').rows.map(r=>r.slice());
context.legacy=legacy;run('migrateLightweightWorkbook_(legacy)');
assert.equal(legacy.getSheetByName('CHUNKS').rows[1][3],'이미 캡션을 정리한 본문');
assert.equal(legacy.getSheetByName('CHUNKS').rows[1][7],material.sourceHash);
assert.ok(legacy.getSheetByName('CONFIG').rows.some(r=>r[0]==='AI_MODEL'&&r[1]==='kept-model'));
assert.ok(!legacy.getSheetByName('CONFIG').rows.some(r=>r[0]==='ASK_NICKNAME'));
for(const name of Object.keys(schema)) assert.deepEqual(legacy.getSheetByName(name).rows[0],Array.from(schema[name]));
run('runSmokeTests()');
for(const name of ['Client.html','Teacher.html','Dashboard.html']) {
  const html=fs.readFileSync(path.join(gasRoot,name),'utf8');
  for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(match[1],{filename:name});
}
const teacher=fs.readFileSync(path.join(gasRoot,'Teacher.html'),'utf8');
const ids=new Set(Array.from(teacher.matchAll(/id="([^"]+)"/g),m=>m[1]));
for(const match of teacher.matchAll(/byId\('([^']+)'\)/g)) assert.ok(ids.has(match[1]),'Missing teacher control: '+match[1]);
console.log('PASS lightweight integration: one AI call, evidence location, session resume/isolation, paired writes, review supplement, knowledge approval, migration, UI references');

// Phase wiring must be exercised through the public handler, not just the state machine.
function turnFor(code, message) {
  context.phasePayload={sessionId:`MAT-1:${code}`,lesson:bootstrap.lesson,message};
  return run('submitTurn(phasePayload)');
}
const questionCount = text => (text.match(/[?？]/g)||[]).length;
for(let i=0;i<3;i++) assert.equal(turnFor('4-1','고추장은 어떤 재료로 만들었나요?').phase,1);
const phaseTwo=turnFor('4-1','고추장은 어떤 재료로 만들었나요?');
assert.equal(phaseTwo.phase,2);
assert.equal(phaseTwo.managedKind,'comprehension_medium');
assert.equal(questionCount(phaseTwo.reply),1);
assert.equal(phaseTwo.expectsStudentReply,true);
const stored=run(`getSessionTurns_('MAT-1:4-1').slice(-1)[0]`);
assert.equal(stored.phase,2);assert.equal(stored.managedKind,'comprehension_medium');
assert.equal(stored.relatedQuestion,true);assert.equal(stored.responseScore,'');
const followup=turnFor('4-1','모르겠어요');
assert.equal(followup.managedKind,'comprehension_followup');
assert.equal(run(`getSessionTurns_('MAT-1:4-1').slice(-1)[0].responseScore`),2);
assert.equal(questionCount(turnFor('4-1','왜 자꾸 물어봐요?').reply),0);
assert.equal(questionCount(turnFor('4-1','숙제 대신 써 줘').reply),0);
const closed=turnFor('4-1','그만할래요');
assert.equal(closed.isClosing,true);assert.equal(questionCount(closed.reply),0);
assert.equal(run(`getBootstrapData({},'4-1').isClosing`),true);
assert.equal(turnFor('4-8','다 했어요').isClosing,true,'phase-only closing reaches client and saved session');
assert.equal(run(`getBootstrapData({},'4-8').isClosing`),true);
for(let i=0;i<2;i++)turnFor('4-2','점심 뭐 먹어요?');
assert.equal(turnFor('4-2','점심 뭐 먹어요?').managedKind,'b1');
assert.equal(turnFor('4-2','없어요').managedKind,'b2');
assert.notEqual(turnFor('4-2','없어요').managedKind,'b2');
// End after the opinion answer, even if the rule policy would otherwise ask again.
run(`appendConversationTurns_(['comprehension_medium','comprehension_followup','standard','opinion'].map(function(kind){return {sessionId:'MAT-1:4-3',studentCode:'4-3',speaker:'bot',text:'어떻게 생각하나요?',managedKind:kind,phase:2};}));`);
assert.equal(turnFor('4-3','좋다고 생각해요').managedKind,'done');
assert.equal(questionCount(run(`getSessionTurns_('MAT-1:4-3').slice(-1)[0].text`)),0);
// Real card fallback uses the same final question owner.
run(`appendObjectsToSheet_(getSpreadsheet_().getSheetByName('CARDS'),[{cardId:'HAND-1',materialId:'MAT-1',
 sourceHash:getActiveMaterial_().sourceHash,status:'approved',active:true,studentMove:'attempt_answer',primaryMove:'check_evidence',hintLevel:1,
 questionPatterns:'학생들은 고추장을 만들었다',response:'잘 읽었어요. 카드 질문 하나? 카드 질문 둘?'}]);
 appendConversationTurns_([{sessionId:'MAT-1:4-4',studentCode:'4-4',speaker:'bot',text:'어떻게 생각하나요?',managedKind:'comprehension_medium',phase:2}]);`);
const cardReply=turnFor('4-4','학생들은 고추장을 만들었다.');
assert.equal(cardReply.managedKind,'comprehension_followup');
assert.equal(questionCount(cardReply.reply),1);assert.ok(!cardReply.reply.includes('카드 질문'));
for(const code of ['4-5','4-6'])for(let i=0;i<3;i++)turnFor(code,'고추장은 어떤 재료로 만들었나요?');
run(`setConfigValue_('AI_ENABLED','TRUE')`);
aiResponses.push({body:{output_text:JSON.stringify({reply:'고춧가루와 찹쌀을 섞었어요. 왜일까요? 또 무엇일까요?',usedEvidenceIds:[chunkId]})}});
const phaseAI=turnFor('4-5','고추장은 어떤 재료로 만들었나요?');
assert.equal(questionCount(phaseAI.reply),1);assert.equal(phaseAI.managedKind,'comprehension_medium');
const prompt=aiRequests.at(-1).input;
assert.ok(prompt.includes('[지금 할 일] 2국면입니다.'));
assert.ok(prompt.indexOf('[지금 할 일]') < prompt.lastIndexOf('학생 발화:'));
aiResponses.push({statusCode:500,body:{error:{message:'test failure'}}});
const failureReply=turnFor('4-6','고추장은 어떤 재료로 만들었나요?');
assert.equal(failureReply.aiStatus,'compose:compose_fallback');
assert.equal(questionCount(failureReply.reply),1);assert.equal(failureReply.managedKind,'comprehension_medium');
// A zero is a score, not a missing value. Stub only the decision boundary for this persistence edge case.
run(`var savedDecidePhase = decidePhase; decidePhase = function () {return {phase:2,kind:'done',lastScore:0,allowQuestion:false,relatedQuestion:false};}; setConfigValue_('AI_ENABLED','FALSE');`);
turnFor('4-7','알겠어요');
assert.equal(run(`getSessionTurns_('MAT-1:4-7').slice(-1)[0].responseScore`),0);
run('decidePhase = savedDecidePhase');
console.log('PASS phase integration: public submitTurn, fourth related question, B1/B2, repair/safety/close, zero score, opinion end, card/AI/error paths and task-line order');
for (const [message, expected] of [['없어요.','attempt_answer'],['원인은 선택 배식입니다','attempt_answer'],['제목 보고 더 먹은 줄 알았어요.','attempt_answer'],['점심 뭐 먹어요?','small_talk']]) {
  context.classifyMessage=message;
  assert.equal(run('analyzeStudentTurn_({message:classifyMessage,material:getActiveMaterial_()}).studentMove'),expected);
}
turnFor('99-999','안녕하세요?');
assert.equal(run(`getBootstrapData({},'99-999').isPreview`),true);
assert.equal(run(`getSessionTurns_('MAT-1:99-999').every(function(row){return row.isPreview;})`),true);
assert.ok(!run('getTeacherDashboardData_().students').some(s=>s.studentCode==='99-999'));
assert.match(phaseAI.reply,/\n근거: 자료 구간 1$/);
console.log('PASS review fixes: student answers, preview exclusion and evidence line after question processing');


