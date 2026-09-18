/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash, createHmac } = require('node:crypto');
const root = path.resolve(__dirname, '..');
class Sheet {
  constructor(name) { this.name = name; this.rows = []; this.failWrites = 0; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return Math.max(0, ...this.rows.map((row) => row.length)); }
  getRange(row, col, count = 1, columns = 1) {
    const values = () => Array.from({length:count}, (_, r) => Array.from({length:columns}, (_, c) => this.rows[row - 1 + r]?.[col - 1 + c] ?? ''));
    return {getValues:values, getDisplayValues:() => values().map((entry) => entry.map(String)),
      setValues:entries => {
        if (this.failWrites && row > 1) { this.failWrites--; throw new Error('synthetic write failure'); }
        entries.forEach((entry, r) => { this.rows[row - 1 + r] ||= []; entry.forEach((value, c) => { this.rows[row - 1 + r][col - 1 + c] = value; }); });
      }};
  }
  getDataRange() { return this.getRange(1, 1, this.getLastRow(), this.getLastColumn()); }
  clearContents() { this.rows = []; }
  setFrozenRows() {}
  autoResizeColumns() {}
}
function setup(scheme = 'four_levels') {
  const sheets = new Map(), properties = new Map();
  let locked = false, calls = 0, provider = null, uuid = 0;
  const spreadsheet = {getId:() => 'required-test-sheet', getSheetByName:name => sheets.get(name), insertSheet:name => {const sheet = new Sheet(name); sheets.set(name, sheet); return sheet;}};
  const context = vm.createContext({console, SpreadsheetApp:{getActiveSpreadsheet:() => spreadsheet, openById:() => spreadsheet},
    PropertiesService:{getScriptProperties:() => ({getProperty:key => properties.get(key) || null,
      setProperty:(key,value) => properties.set(key,String(value)), deleteProperty:key => properties.delete(key)})},
    LockService:{getScriptLock:() => ({waitLock:() => {assert.equal(locked,false, 'nested lock'); locked = true;}, releaseLock:() => {locked = false;}})},
    Utilities:{Charset:{UTF_8:'utf8'}, DigestAlgorithm:{SHA_256:'sha256'}, getUuid:() => `test-uuid-${++uuid}`,
      computeDigest:(alg,text) => createHash(alg).update(text).digest(), computeHmacSha256Signature:(text,key) => createHmac('sha256',key).update(text).digest(),
      base64EncodeWebSafe:bytes => Buffer.from(bytes).toString('base64url')}
  });
  for (const file of ['SetupService','ConversationService','EngineClient','EvaluationService','AssessmentDraftService','RequiredAssessmentService']) {
    vm.runInContext(fs.readFileSync(path.join(root,'gas-lite',`${file}.js`),'utf8'),context);
  }
  const settings = {lessonId:'lesson-required-test', lessonRevision:1, sourceHash:'a'.repeat(24), activityMode:'evaluation',
    joinCode:'123456', rubricScheme:scheme, lessonGoal:'주민 의견을 근거로 설명한다.', achievementStandard:'민주적 의사결정을 설명한다.',
    materialText:'주민들은 안전하게 생활할 수 있는 방법과 편의시설을 마련해야 한다고 주장했다.',
    requiredAssessment:{schemaVersion:1,questionSetHash:'question-test-hash',items:['q1','q2'].map((id,index) => ({id,
      question:index ? '서로의 의견을 어떻게 조정하면 좋을까요?' : '주민들은 왜 반대하나요?',
      expectedAnswer:index ? '서로 의견을 듣고 합의한다.' : '안전과 생활을 먼저 생각한다.',
      assessmentEvidence:'주민들은 안전하게 생활할 수 있는 방법과 편의시설을 마련해야 한다고 주장했다.',
      assessmentCriteria:'지문에 맞는 이유와 근거를 설명한다.', rubricHigh:'이유와 근거를 정확하게 설명한다.',
      rubricGood:'이유를 정확하게 설명한다.', rubricMeet:'이유의 일부를 설명한다.', rubricDeveloping:'관련 내용을 표현한다.', rubricBeginning:'관련 내용을 확인하기 어렵다.', answerExamples:'예상 답변', evidenceDescription:'학생 답변'}))}};
  context.readLiteTeacherSettings_ = () => settings;
  // The original separate-answer contract remains testable; chat cases install a saved plan below.
  context.liteAssessmentPlan_ = () => settings.testChatPlan || {schemaVersion:1,approved:false,criteria:[]};
  context.buildLiteCurrentReadiness_ = () => ({lessonOpen:true,runtimeReady:true,distributionReady:true});
  context.readLiteEngineRuntimeSnapshot_ = () => ({endpoint:'https://synthetic.invalid', key:'synthetic',policyVersion:'test'});
  context.isLitePreviewAccessToken_ = token => token === 'preview-test';
  properties.set('LITE_SESSION_SECRET', 'synthetic-session-secret');
  context.ensureLiteWorkbook_(spreadsheet);
  const payload = {studentCode:'3-12',deviceToken:'device-required-123456',lessonId:settings.lessonId,
    lessonRevision:1,sourceHash:settings.sourceHash,joinCode:'123456',requestId:'required-request-00001',
    answers:[{questionId:'q1',text:'안전과 생활을 먼저 생각해야 하기 때문입니다.'},{questionId:'q2',text:'주민들과 이야기를 나누고 합의하면 좋겠습니다.'}]};
  context.requestLiteAssessmentDraft_ = request => {
    assert.equal(locked,false,'model request must be outside lock'); calls++;
    if (provider) return provider(request);
    const input = JSON.parse(request.input);
    const level = scheme === 'five_levels' ? 'B' : scheme === 'legacy_three' ? '도달' : '잘함';
    return {status:'completed', model:'synthetic-model', usage:{input_tokens:100,output_tokens:30,total_tokens:130},
      output_text:JSON.stringify({results:input.answers.map(answer => ({questionId:answer.questionId,level:answer.text ? level : '판단 보류',
        answerQuote:answer.text.slice(0,18),rationale:'핵심 이유를 답변에서 확인할 수 있습니다.',feedback:'자료의 근거도 연결해 보세요.'}))})};
  };
  return {context,settings,payload,sheets,spreadsheet,properties,get calls(){return calls;},setProvider(fn){provider=fn;}};
}
const plain = value => JSON.parse(JSON.stringify(value));
function setupChat(options = {}) {
  const x=setup(options.scheme);
  const {context,settings,payload,spreadsheet}=x;
  if (options.preview) {payload.studentCode='99-999'; payload.previewAccessToken='preview-test';}
  settings.testChatPlan={schemaVersion:1,approved:true,criteria:settings.requiredAssessment.items.map(item=>({
    id:item.id,criterion:item.id+' 기준',responseKind:'explanation',mainQuestion:item.question,
    followUpQuestion:'자료에서 근거를 찾아 설명해 줄래요?',evidenceDescription:'학생의 실제 답변',
    sourceQuote:settings.materialText,requireSourceEvidence:item.id==='q1'}))};
  const identity=JSON.stringify([settings.lessonId,settings.lessonRevision,settings.sourceHash]);
  const planId=context.liteFingerprint_(JSON.stringify([identity,settings.testChatPlan]),100);
  const sessionId=context.makeLiteSessionId_(settings.lessonId,settings.lessonRevision,settings.sourceHash,payload.studentCode,payload.deviceToken);
  const sheet=x.sheets.get('질문과 답변');
  const item=(id,extra={})=>({id,label:id+' 기준',status:'pending',attempts:0,hintCount:0,assisted:false,answerRequestId:'',evidenceRequestId:'',...extra});
  const items=[item('q1'),item('q2')];
  let lastProgress=null;
  const add=(speaker,requestId,text,progress)=>context.writeLiteRequiredRow_(sheet,{sessionId,studentCode:payload.studentCode,
    lessonId:settings.lessonId,lessonRevision:settings.lessonRevision,sourceHash:settings.sourceHash,
    speaker,requestId,text,turnNo:sheet.getLastRow(),isPreview:Boolean(options.preview),engineStatus:'finalized:test',
    assessmentProgressJson:progress ? JSON.stringify(progress) : ''});
  const answer=(requestId,text,id,kind,index,stage,changes,verified=false)=>{
    add('student',requestId,text);
    Object.assign(items[id==='q1'?0:1],changes);
    lastProgress={schemaVersion:1,planId,activeIndex:index,stage,items:structuredClone(items),
      lastEvent:{requestId,criterionId:id,kind,evidenceVerified:verified}};
    add('bot',requestId,index===0 ? '자료의 근거도 설명해 줄래요?' : index===1 ? settings.requiredAssessment.items[1].question : '답변을 남겼어요.',lastProgress);
  };
  add('bot','seed_chat',settings.requiredAssessment.items[0].question);
  if (options.skipAll) {
    answer('chat-skip-one','넘어갈래요.','q1','skip',1,'main',{status:'needs_review'});
  } else {
    answer('chat-first-answer',payload.answers[0].text,'q1','answer',0,'followup',{status:'awaiting_evidence',attempts:1,answerRequestId:'chat-first-answer'});
    answer('chat-hint-request','힌트 주세요.','q1','hint',0,'followup',{hintCount:1,assisted:true});
    answer('chat-source-answer','안전하게 생활할 수 있는 방법과 편의시설을 마련해야 한다고 했습니다.','q1','answer',1,'main',
      {status:'collected',attempts:2,answerRequestId:'chat-source-answer',evidenceRequestId:'chat-source-answer'},true);
  }
  if (!options.incomplete) {
    if (options.skipAll || options.skipSecond) answer('chat-skip-two','넘어갈래요.','q2','skip',2,'complete',{status:'needs_review'});
    else answer('chat-second-answer',payload.answers[1].text,'q2','answer',2,'complete',{status:'collected',attempts:1,answerRequestId:'chat-second-answer'});
  }
  return {...x, get calls(){return x.calls;},sessionId,lastProgress,spreadsheet};
}
let count = 0;
function test(name, fn) {fn(); count++; console.log(`ok ${count} - ${name}`);}
test('both explicit answers required; invalid input never reaches model', () => {
  const x = setup();
  for (const answers of [[],x.payload.answers.slice(0,1),[x.payload.answers[0],x.payload.answers[0]],
    [{questionId:'q1',text:' '},x.payload.answers[1]],[{questionId:'q1',text:'가'.repeat(801)},x.payload.answers[1]],
    [{questionId:'q3',text:'오류'},x.payload.answers[1]]]) {
    assert.throws(() => x.context.submitLiteRequiredAnswers({...x.payload,answers}));
  }
  assert.equal(x.calls,0);
  assert.equal(x.sheets.get('필수 평가 응답').getLastRow(),1);
});
test('student access, lesson identity and preview token remain enforced', () => {
  const x = setup();
  for (const overrides of [{joinCode:'000000'},{lessonRevision:2},{sourceHash:'b'.repeat(24)},{studentCode:'99-999',previewAccessToken:'wrong'}]) {
    assert.throws(() => x.context.submitLiteRequiredAnswers({...x.payload,...overrides}));
  }
  assert.equal(x.calls,0);
});
test('one paid call for two questions; analysis hidden from student and no common scores', () => {
  const x = setup();
  const response = x.context.submitLiteRequiredAnswers(x.payload);
  assert.equal(response.submitted,true); assert.equal(response.analysisStatus,'completed');
  assert.deepEqual(Object.keys(response).sort(),['analysisStatus','message','ok','submitted']);
  assert.equal(x.calls,1);
  const evaluations = x.context.liteRowsAsObjects_(x.sheets.get('교사 평가'));
  assert.equal(evaluations.length,2);
  assert.equal(evaluations[0].teacherDecision,'판단 보류');
  assert.equal(evaluations[0].questioningBest,'');
  x.context.upsertLiteEvaluationDraft_(x.settings,{...x.payload,sessionId:evaluations[0].sessionId},{rubricScores:[{criterionKey:'questioning',score:5}]});
  assert.equal(x.sheets.get('교사 평가').getLastRow(),3);
  const resumed = x.context.getLiteRequiredSubmissionForStudent_(x.settings,evaluations[0].sessionId,x.spreadsheet);
  assert.deepEqual(plain(resumed.answers),x.payload.answers);
  assert.equal(Object.hasOwn(resumed,'analysis'),false);
});
test('same request and same session with a new request cannot charge again', () => {
  const x = setup();
  x.context.submitLiteRequiredAnswers(x.payload);
  x.context.submitLiteRequiredAnswers(x.payload);
  x.context.submitLiteRequiredAnswers({...x.payload,requestId:'required-request-00002'});
  assert.equal(x.calls,1); assert.equal(x.sheets.get('필수 평가 응답').getLastRow(),2);
  assert.throws(() => x.context.submitLiteRequiredAnswers({...x.payload,answers:[{questionId:'q1',text:'바뀐 답변'},x.payload.answers[1]]}),/이미 제출/);
});
test('concurrent request sees persisted claim and does not reenter model', () => {
  const x = setup();
  x.setProvider(request => {
    const duplicate = x.context.submitLiteRequiredAnswers(x.payload);
    assert.equal(duplicate.analysisStatus,'processing');
    const input = JSON.parse(request.input);
    return {status:'completed', output_text:JSON.stringify({results:input.answers.map(a => ({questionId:a.questionId,level:'보통',answerQuote:a.text,rationale:'근거',feedback:'보완'}))})};
  });
  x.context.submitLiteRequiredAnswers(x.payload);
  assert.equal(x.calls,1);
});
test('personal information redacted before the provider and sheet', () => {
  const x = setup();
  const answers = [{questionId:'q1',text:'제 이름은 홍길동입니다. 연락처는 010-1234-5678입니다.'},x.payload.answers[1]];
  x.context.submitLiteRequiredAnswers({...x.payload,answers});
  const row = x.context.liteRowsAsObjects_(x.sheets.get('필수 평가 응답'))[0];
  assert.doesNotMatch(row.answersJson,/홍길동|010-1234-5678/);
});
test('provider failure saves both answers and pending review without retry', () => {
  const x = setup(); x.setProvider(() => {throw new Error('synthetic provider outage');});
  assert.equal(x.context.submitLiteRequiredAnswers(x.payload).analysisStatus,'pending');
  assert.equal(x.context.submitLiteRequiredAnswers(x.payload).submitted,true);
  assert.equal(x.calls,1); assert.equal(x.sheets.get('교사 평가').getLastRow(),3);
});
test('fabricated quote, wrong scheme and duplicate question results are rejected', () => {
  for (const mode of ['quote','level','duplicate']) {
    const x = setup(); x.setProvider(request => {
      const input = JSON.parse(request.input);
      const results = input.answers.map(a => ({questionId:a.questionId,level:'잘함',answerQuote:a.text,rationale:'근거',feedback:'보완'}));
      if (mode === 'quote') results[0].answerQuote='학생이 하지 않은 말';
      if (mode === 'level') results[0].level='A';
      if (mode === 'duplicate') results[1].questionId='q1';
      return {status:'completed', output_text:JSON.stringify({results})};
    });
    assert.equal(x.context.submitLiteRequiredAnswers(x.payload).analysisStatus,'pending');
  }
});
test('failed analysis sheet write recovers paid result without another call', () => {
  const x = setup();
  x.setProvider(request => {
    x.sheets.get('필수 평가 응답').failWrites=1;
    return {status:'completed', output_text:JSON.stringify({results:JSON.parse(request.input).answers.map(a => ({questionId:a.questionId,level:'잘함',answerQuote:a.text,rationale:'근거',feedback:'보완'}))})};
  });
  assert.equal(x.context.submitLiteRequiredAnswers(x.payload).analysisStatus,'pending');
  assert.equal(x.context.submitLiteRequiredAnswers(x.payload).analysisStatus,'completed');
  assert.equal(x.calls,1);
  assert.equal([...x.properties.keys()].filter(key => key.startsWith('LITE_REQUIRED_RESULT_')).length,0);
});
test('student resume and dashboard read repair the paid journal without resubmission', () => {
  for (const reader of ['student','teacher']) {
    const x=setup();
    x.setProvider(request => {
      x.sheets.get('필수 평가 응답').failWrites=1;
      return {status:'completed',output_text:JSON.stringify({results:JSON.parse(request.input).answers.map(a => ({
        questionId:a.questionId,level:'잘함',answerQuote:a.text,rationale:'저장된 분석 근거',feedback:'보완'}))})};
    });
    const submitted=x.context.submitLiteRequiredAnswers(x.payload);
    assert.equal(submitted.ok,true); assert.equal(submitted.submitted,true); assert.equal(submitted.analysisStatus,'pending');
    const row=x.context.liteRowsAsObjects_(x.sheets.get('필수 평가 응답'))[0];
    assert.equal(row.analysisStatus,'processing');
    if (reader==='student') {
      const other=x.context.getLiteRequiredSubmissionForStudent_(x.settings,'another-student-session',x.spreadsheet);
      assert.equal(other.submitted,false);
      assert.equal(x.context.liteRowsAsObjects_(x.sheets.get('필수 평가 응답'))[0].analysisStatus,'processing');
      const resumed=x.context.getLiteRequiredSubmissionForStudent_(x.settings,row.sessionId,x.spreadsheet);
      assert.equal(resumed.analysisStatus,'completed'); assert.equal(Object.hasOwn(resumed,'analysis'),false);
    } else {
      const dashboard=x.context.getLiteTeacherDashboardData(x.context.getOrCreateLiteTeacherAccessToken_());
      assert.equal(dashboard.requiredAssessmentSubmissions[0].analysisStatus,'completed');
      assert.match(dashboard.evaluations[0].evidenceSummary,/저장된 분석 근거/);
    }
    assert.equal(x.calls,1);
    assert.equal([...x.properties.keys()].filter(key => key.startsWith('LITE_REQUIRED_RESULT_')).length,0);
  }
});
test('read repairs secondary teacher rows from completed submission without a journal', () => {
  for (const reader of ['student','teacher']) {
    const x=setup();
    x.setProvider(request => {
      x.sheets.get('교사 평가').failWrites=1;
      return {status:'completed',output_text:JSON.stringify({results:JSON.parse(request.input).answers.map(a => ({
        questionId:a.questionId,level:'잘함',answerQuote:a.text,rationale:'복구할 문항별 근거',feedback:'보완'}))})};
    });
    x.context.submitLiteRequiredAnswers(x.payload);
    for (const key of x.properties.keys()) if (key.startsWith('LITE_REQUIRED_RESULT_')) x.properties.delete(key);
    const row=x.context.liteRowsAsObjects_(x.sheets.get('필수 평가 응답'))[0];
    assert.equal(row.analysisStatus,'completed');
    if (reader==='student') x.context.getLiteRequiredSubmissionForStudent_(x.settings,row.sessionId,x.spreadsheet);
    else x.context.getLiteTeacherDashboardData(x.context.getOrCreateLiteTeacherAccessToken_());
    const evaluations=x.context.liteRowsAsObjects_(x.sheets.get('교사 평가'));
    assert.equal(evaluations.length,2);
    for (const evaluation of evaluations) assert.match(evaluation.evidenceSummary,/복구할 문항별 근거/);
    assert.equal(x.calls,1);
  }
});
test('incomplete, failed and absent provider statuses cannot become an analysis', () => {
  for (const status of ['incomplete','failed',undefined]) {
    const x=setup();
    x.setProvider(request => ({status,output_text:JSON.stringify({results:JSON.parse(request.input).answers.map(a => ({
      questionId:a.questionId,level:'잘함',answerQuote:a.text,rationale:'완료되지 않은 근거',feedback:'보완'}))})}));
    assert.equal(x.context.submitLiteRequiredAnswers(x.payload).analysisStatus,'pending');
    const row=x.context.liteRowsAsObjects_(x.sheets.get('필수 평가 응답'))[0];
    assert.equal(row.analysisJson,'');
    x.context.getLiteRequiredSubmissionForStudent_(x.settings,row.sessionId,x.spreadsheet);
    assert.equal(x.calls,1);
  }
});
test('initial answer save failure never calls model and retry can safely submit', () => {
  const x = setup(); x.sheets.get('필수 평가 응답').failWrites=1;
  assert.throws(() => x.context.submitLiteRequiredAnswers(x.payload)); assert.equal(x.calls,0);
  assert.equal(x.context.submitLiteRequiredAnswers(x.payload).analysisStatus,'completed'); assert.equal(x.calls,1);
});
test('analysis fingerprint includes every teacher criterion and rubric scheme', () => {
  const x = setup(); const before=x.context.liteRequiredAnalysisFingerprint_(x.settings,x.payload.answers);
  x.settings.requiredAssessment.items[1].rubricHigh='수정한 문항2 기준';
  assert.notEqual(x.context.liteRequiredAnalysisFingerprint_(x.settings,x.payload.answers),before);
});
test('teacher review is per-question and preserved during duplicate repair', () => {
  const x = setup(); x.context.submitLiteRequiredAnswers(x.payload);
  const token=x.context.getOrCreateLiteTeacherAccessToken_();
  let dashboard=x.context.getLiteTeacherDashboardData(token);
  assert.equal(dashboard.requiredAssessmentSubmissions.length,1); assert.equal(dashboard.uniqueStudentCount,1);
  assert.equal(dashboard.apiUsage.totalTokens,130);
  const q1=dashboard.evaluations.find(row=>row.questionId==='q1');
  x.context.saveLiteTeacherEvaluation(token,{...q1,expectedReviewVersion:q1.reviewVersion,teacherDecision:'매우잘함',
    teacherFeedback:'근거를 정확히 찾았어요.',improvementSuggestion:'다른 입장도 찾아보세요.',finalStatus:'최종 확정'});
  x.context.submitLiteRequiredAnswers(x.payload);
  dashboard=x.context.getLiteTeacherDashboardData(token);
  assert.equal(dashboard.evaluations.find(row=>row.questionId==='q1').teacherDecision,'매우잘함');
  assert.equal(dashboard.evaluations.find(row=>row.questionId==='q1').finalStatus,'최종 확정');
  assert.equal(dashboard.evaluations.find(row=>row.questionId==='q2').teacherDecision,'판단 보류');
});
test('preview can analyze but never creates real evaluation rows or student totals', () => {
  const x=setup(); x.context.submitLiteRequiredAnswers({...x.payload,studentCode:'99-999',previewAccessToken:'preview-test'});
  assert.equal(x.calls,1); assert.equal(x.sheets.get('교사 평가').getLastRow(),1);
  const dashboard=x.context.getLiteTeacherDashboardData(x.context.getOrCreateLiteTeacherAccessToken_());
  assert.equal(dashboard.uniqueStudentCount,0); assert.equal(dashboard.requiredAssessmentSubmissions.length,0);
  assert.equal(dashboard.apiUsage.previewTotalTokens,130);
});
test('3 and 5 levels use exact saved scheme', () => {
  for (const scheme of ['legacy_three','five_levels']) {
    const x=setup(scheme); assert.equal(x.context.submitLiteRequiredAnswers(x.payload).analysisStatus,'completed');
    const row=x.context.liteRowsAsObjects_(x.sheets.get('교사 평가'))[0];
    assert.equal(row.rubricScheme,scheme);
    assert.match(row.automaticJudgment,scheme==='five_levels' ? /B/ : /도달/);
  }
});
test('chat completion derives both actual answers and verified evidence, never client answers', () => {
  const x=setupChat();
  const collected=x.context.collectLiteRequiredChatAnswers_(x.settings,x.sessionId,x.spreadsheet);
  assert.equal(collected.answers[0].segments.length,2);
  assert.equal(collected.answers[0].assisted,true);
  assert.doesNotMatch(collected.answers[0].text,/힌트 주세요/);
  assert.match(collected.answers[0].text,/안전과 생활/);
  assert.equal(collected.answers[0].evidenceRequestId,'chat-source-answer');
  const result=x.context.finalizeLiteRequiredAssessment({...x.payload,answers:[{questionId:'q1',text:'위조한 답변'}]});
  assert.equal(result.analysisStatus,'completed'); assert.equal(x.calls,1);
  const row=x.context.liteRowsAsObjects_(x.sheets.get('필수 평가 응답'))[0];
  assert.doesNotMatch(row.answersJson,/위조한 답변/);
  const evaluations=x.context.liteRowsAsObjects_(x.sheets.get('교사 평가'));
  assert.equal(evaluations.length,2);
  assert.match(evaluations[0].evidenceRequestIds,/chat-first-answer.*chat-source-answer/);
  assert.equal(JSON.parse(evaluations[0].criterionEvidenceJson).stage,'complete');
});
test('unfinished chat and wrong authentication cannot trigger analysis', () => {
  const x=setupChat({incomplete:true});
  assert.equal(x.context.finalizeLiteRequiredAssessment(x.payload).analysisStatus,'not_ready');
  assert.equal(x.calls,0);
  assert.throws(()=>x.context.finalizeLiteRequiredAssessment({...x.payload,joinCode:'000000'}));
  assert.throws(()=>x.context.submitLiteRequiredAnswers(x.payload),/대화/);
  const state=x.context.liteRequiredChatState_(x.settings,x.lastProgress);
  assert.deepEqual(plain(state.requiredAssessmentProgress),{completed:1,total:2});
});
test('chat duplicate and resume do not repay; dashboard can start missing browser analysis', () => {
  const x=setupChat();
  const token=x.context.getOrCreateLiteTeacherAccessToken_();
  const initial=x.context.getLiteTeacherDashboardData(token);
  assert.equal(initial.requiredAssessmentSubmissions[0].analysisStatus,'ready'); assert.equal(x.calls,0);
  const resumed=x.context.getLiteRequiredSubmissionForStudent_(x.settings,x.sessionId,x.spreadsheet);
  assert.equal(resumed.analysisStatus,'ready');
  assert.equal(x.context.analyzeLiteRequiredAssessment(token,{sessionId:x.sessionId}).analysisStatus,'completed');
  x.context.finalizeLiteRequiredAssessment(x.payload);
  x.context.analyzeLiteRequiredAssessment(token,{sessionId:x.sessionId});
  assert.equal(x.calls,1);
});
test('skips preserve judgment withheld and never masquerade as student answers', () => {
  const x=setupChat({skipSecond:true});
  assert.equal(x.context.finalizeLiteRequiredAssessment(x.payload).analysisStatus,'completed');
  const row=x.context.liteRowsAsObjects_(x.sheets.get('필수 평가 응답'))[0];
  const answers=JSON.parse(row.answersJson),analysis=JSON.parse(row.analysisJson);
  assert.equal(answers[1].text,''); assert.equal(analysis[1].level,'판단 보류'); assert.equal(analysis[1].answerQuote,'');
  const all=setupChat({skipAll:true});
  assert.equal(all.context.finalizeLiteRequiredAssessment(all.payload).analysisStatus,'completed'); assert.equal(all.calls,0);
});
test('missing or forged source response links cannot become an analysis', () => {
  for (const mode of ['missing','other-revision','bad-event']) {
    const x=setupChat();
    const sheet=x.sheets.get('질문과 답변'),heads=sheet.rows[0];
    const student=sheet.rows.find(row=>row[heads.indexOf('speaker')]==='student' && row[heads.indexOf('requestId')]==='chat-source-answer');
    if (mode==='missing') sheet.rows=sheet.rows.filter(row=>row!==student);
    if (mode==='other-revision') student[heads.indexOf('lessonRevision')]=999;
    if (mode==='bad-event') {
      const bot=sheet.rows.find(row=>row[heads.indexOf('speaker')]==='bot' && row[heads.indexOf('requestId')]==='chat-source-answer');
      const state=JSON.parse(bot[heads.indexOf('assessmentProgressJson')]); state.lastEvent.kind='hint';
      bot[heads.indexOf('assessmentProgressJson')]=JSON.stringify(state);
    }
    assert.throws(()=>x.context.finalizeLiteRequiredAssessment(x.payload),/원본/); assert.equal(x.calls,0);
  }
});
test('analysis quotation cannot combine separate chat answers into a fabricated quote', () => {
  const x=setupChat();
  x.setProvider(request=>({status:'completed',output_text:JSON.stringify({results:JSON.parse(request.input).answers.map(a=>({
    questionId:a.questionId,level:'잘함',answerQuote:a.text,rationale:'근거',feedback:'보완'}))})}));
  assert.equal(x.context.finalizeLiteRequiredAssessment(x.payload).analysisStatus,'pending');
  assert.equal(x.calls,1);
});
test('session resume exposes only progress and own answers, then analysis remains teacher-only', () => {
  const x=setupChat();
  const initial=x.context.startLiteStudentSession(x.payload);
  assert.equal(initial.requiredAssessmentReady,true);
  assert.deepEqual(plain(initial.requiredAssessmentProgress),{completed:2,total:2});
  assert.equal(initial.requiredSubmission.analysisStatus,'ready');
  assert.equal(Object.hasOwn(initial.requiredSubmission,'analysis'),false);
  assert.equal(Object.hasOwn(initial.lesson,'expectedAnswer'),false);
  x.context.finalizeLiteRequiredAssessment(x.payload);
  const resumed=x.context.startLiteStudentSession(x.payload);
  assert.equal(resumed.requiredSubmission.analysisStatus,'completed'); assert.equal(x.calls,1);
  const dashboard=x.context.getLiteTeacherDashboardData(x.context.getOrCreateLiteTeacherAccessToken_());
  for(const row of dashboard.evaluations) {
    assert.equal(row.criterionEvidence.length,1); assert.equal(row.criterionEvidence[0].id,row.questionId);
  }
});
test('chat preview analysis does not become real student evaluations', () => {
  const x=setupChat({preview:true});
  assert.equal(x.context.finalizeLiteRequiredAssessment(x.payload).analysisStatus,'completed');
  const token=x.context.getOrCreateLiteTeacherAccessToken_();
  const dashboard=x.context.getLiteTeacherDashboardData(token);
  assert.equal(dashboard.requiredAssessmentSubmissions.length,0);
  assert.equal(dashboard.evaluations.length,0);
  assert.equal(dashboard.apiUsage.previewTotalTokens,130);
  assert.equal(x.context.analyzeLiteRequiredAssessment(token,{sessionId:x.sessionId}).submitted,false);
  assert.equal(x.calls,1);
});
console.log(`PASS ${count} required-assessment runtime cases`);
