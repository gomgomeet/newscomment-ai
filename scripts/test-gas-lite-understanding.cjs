/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createHash, createHmac} = require('node:crypto');

class Sheet {
  constructor() { this.rows = []; this.failWrites = 0; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return Math.max(0, ...this.rows.map(row => row.length)); }
  getRange(row, col, count = 1, columns = 1) {
    const values = () => Array.from({length:count}, (_, r) => Array.from({length:columns}, (_, c) => this.rows[row - 1 + r]?.[col - 1 + c] ?? ''));
    return {getValues:values, getDisplayValues:() => values().map(entry => entry.map(String)),
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

function setup() {
  const sheets = new Map(), properties = new Map([['LITE_SESSION_SECRET','synthetic-secret']]);
  const spreadsheet = {getId:() => 'synthetic-sheet', getSheetByName:name => sheets.get(name),
    insertSheet:name => {const sheet = new Sheet(); sheets.set(name,sheet); return sheet;}};
  let locked = false, engineCalls = 0, evaluationWrites = 0, providerCalls = 0;
  const context = vm.createContext({console,
    SpreadsheetApp:{getActiveSpreadsheet:() => spreadsheet,openById:() => spreadsheet,flush() {}},
    PropertiesService:{getScriptProperties:() => ({getProperty:key => properties.get(key) || null,
      getProperties:() => Object.fromEntries(properties),setProperty:(key,value) => properties.set(key,String(value)),
      deleteProperty:key => properties.delete(key)})},
    LockService:{getScriptLock:() => ({waitLock() {assert.equal(locked,false);locked=true;},
      tryLock() {assert.equal(locked,false);locked=true;return true;},releaseLock() {locked=false;}})},
    Utilities:{Charset:{UTF_8:'utf8'},DigestAlgorithm:{SHA_256:'sha256'},
      computeDigest:(alg,text) => createHash(alg).update(text).digest(),
      computeHmacSha256Signature:(text,key) => createHmac('sha256',key).update(text).digest(),
      base64EncodeWebSafe:bytes => Buffer.from(bytes).toString('base64url'),
      newBlob:text => ({getBytes:() => Buffer.from(text)})}
  });
  for (const file of ['SetupService','ConversationService','EngineClient']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..','gas-lite',file+'.js'),'utf8'),context,{filename:file});
  }
  const settings = {lessonId:'understanding-test',lessonRevision:1,sourceHash:'a'.repeat(24),activityMode:'evaluation',
    joinCode:'123456',materialText:'주민들은 변전소 건설에 반대했다. 주민들은 안전한 생활을 원했다.',
    assessmentPlanJson:JSON.stringify({schemaVersion:1,approved:true,criteria:['q1','q2'].map((id,index) => ({
      id,criterion:id+' 기준',responseKind:'explanation',mainQuestion:index ? '어떻게 해결하면 좋을까요?' : '주민들은 왜 반대하나요?',
      followUpQuestion:'글에서 근거를 찾아 줄래요?',evidenceDescription:'근거를 연결한 학생 답변',
      sourceQuote:'주민들은 안전한 생활을 원했다.',requireSourceEvidence:true}))})};
  const payload = {lessonId:settings.lessonId,lessonRevision:1,sourceHash:settings.sourceHash,studentCode:'3-12',
    deviceToken:'understanding-device-1234',joinCode:settings.joinCode,requestId:'understanding-request-0001',
    action:'message',message:'변전소는 무슨 뜻인가요?'};
  context.readLiteTeacherSettings_ = () => settings;
  context.buildLiteCurrentReadiness_ = () => ({lessonOpen:true,runtimeReady:true,distributionReady:true});
  context.readLiteEngineRuntimeSnapshot_ = () => ({endpoint:'https://synthetic.invalid/plan',key:'verified',policyVersion:'warmup-policy'});
  context.safeClaimLiteInFlightRequest_ = () => ({claimed:true});
  context.safeClaimLiteInFlightScopes_ = () => ({claimed:true});
  context.safeReleaseLiteInFlightRequest_ = () => {};
  context.hasLiteEngineEndpoint_ = context.hasLiteApiKey_ = () => true;
  context.safeReserveLiteEngineRequest_ = () => ({allowed:true});
  context.upsertLiteEvaluationDraft_ = () => {evaluationWrites++;};
  context.callLiteOpenAI_ = () => {providerCalls++;throw new Error('unexpected paid call');};
  context.ensureLiteWorkbook_(spreadsheet);
  const observations = [];
  context.requestLiteEnginePlan_ = (turn, lesson, history) => {
    assert.equal(locked,false,'network is outside script lock'); engineCalls++;
    const input = context.buildLiteEnginePayload_(turn,lesson,history);
    observations.push(input);
    const observation = input.understanding
      ? {understanding:true,conversationPhase:1,relatedQuestion:turn.message !== '안녕하세요',
        questionType:'vocabulary',sourceStatus:'supported',responseScore:null,rubricScores:[],isClosing:turn.message==='마칠래요'}
      : {conversationPhase:2,assessmentProgress:turn.assessmentProgress,responseScore:null,rubricScores:[]};
    context.assertLiteAssessmentEngineResponse_(input,{observation});
    return {skipModel:true,policyVersion:'warmup-policy',fallbackReply:'변전소는 전기의 전압을 바꾸는 시설이에요.',
      observation,enforcement:{maximumQuestionCount:0}};
  };
  return {context,settings,payload,sheets,spreadsheet,observations,
    get engineCalls(){return engineCalls;},get evaluationWrites(){return evaluationWrites;},get providerCalls(){return providerCalls;}};
}
const plain = value => JSON.parse(JSON.stringify(value));

{
  const x=setup(), {context:c,payload:p,settings:s}=x;
  let session=c.startLiteStudentSession(p);
  assert.equal(session.learningStage,'understanding');assert.equal(session.canStartAssessment,false);
  assert.match(session.history[0].text,/글을 읽고 궁금한 것을 질문해 주세요! 제목을 보고 어떤 내용인지 생각해 볼까요\?/);
  assert.notEqual(session.history[0].text,c.liteAssessmentStartQuestion_(s));
  assert.throws(() => c.submitLiteTurn({...p,action:'start_assessment'}),/먼저 글/);
  assert.throws(() => c.submitLiteTurn({...p,action:'forged-action'}),/종류/);
  assert.throws(() => c.submitLiteTurn({...p,joinCode:'000000'}),/참여코드/);
  assert.equal(x.engineCalls,0);
  let reply=c.submitLiteTurn({...p,message:'안녕하세요'});
  assert.equal(reply.canStartAssessment,false,'greeting is not a passage exchange');
  reply=c.submitLiteTurn({...p,requestId:'understanding-source-0002',learningStage:'complete',assessmentProgress:{forged:true}});
  assert.equal(reply.learningStage,'understanding');assert.equal(reply.canStartAssessment,true);
  assert.equal(x.evaluationWrites,0);assert.equal(x.providerCalls,0);
  assert.equal(x.observations[1].understanding,true);assert.equal(x.observations[1].activityMode,'exploration');
  assert.equal(x.observations[1].lesson.assessmentPlan,undefined);
  const qa=x.sheets.get('질문과 답변');
  let rows=c.liteRowsAsObjects_(qa);
  assert.equal(rows.every(row => !row.assessmentProgressJson && !row.responseScore),true);
  const repeat=c.submitLiteTurn({...p,requestId:'understanding-source-0002'});
  assert.equal(repeat.duplicate,true);assert.equal(repeat.canStartAssessment,true);assert.equal(x.engineCalls,2);
  session=c.startLiteStudentSession(p);
  assert.equal(session.canStartAssessment,true);assert.equal(session.history.length,5);
  const start={...p,requestId:'start-assessment-0003',action:'start_assessment',message:''};
  reply=c.submitLiteTurn(start);
  assert.equal(reply.learningStage,'assessment');assert.equal(reply.canStartAssessment,false);
  assert.equal(reply.reply,c.liteAssessmentStartQuestion_(s));assert.equal(x.engineCalls,2);
  assert.equal(x.evaluationWrites,0,'transition is not an evaluated answer');
  rows=c.liteRowsAsObjects_(qa);
  const progress=c.latestLiteAssessmentProgress_(rows);
  c.assertLiteAssessmentEngineResponse_({activityMode:'evaluation',lesson:{...s,assessmentPlan:c.liteAssessmentPlan_(s)}},{observation:{assessmentProgress:progress}});
  assert.equal(progress.lastEvent.kind,'prompt');assert.equal(progress.activeIndex,0);
  assert.equal(progress.items.every(item => item.status==='pending' && !item.answerRequestId),true);
  assert.equal(c.submitLiteTurn(start).duplicate,true);assert.equal(x.evaluationWrites,0);
  assert.throws(() => c.submitLiteTurn({...start,action:'',message:'평가 시작'}),/다른 수업/);
  assert.throws(() => c.submitLiteTurn({...start,requestId:'second-start-action-0004'}),/이미 평가/);
  reply=c.submitLiteTurn({...p,requestId:'formal-answer-0005',message:'안전한 생활을 원하기 때문이에요.'});
  assert.equal(reply.learningStage,'assessment');assert.equal(x.evaluationWrites,1);
  const formal=x.observations.at(-1);
  assert.equal(formal.understanding,undefined);assert.equal(formal.activityMode,'evaluation');
  assert.deepEqual(plain(formal.history),[{speaker:'bot',text:c.liteAssessmentStartQuestion_(s)}]);
  session=c.startLiteStudentSession(p);
  assert.equal(session.learningStage,'assessment');assert.equal(session.history.length,9,'UI retains full conversation');
}

{
  const x=setup(), {context:c,payload:p,settings:s}=x;
  const turn=c.prepareLiteStudentTurn_(p,s);
  assert.equal(turn.action,'');
  assert.equal(c.liteTurnFingerprint_(turn),c.liteTurnFingerprint_(c.prepareLiteRecoveryTurn_({...p,action:undefined},s)),
    'explicit message action keeps the pre-existing request fingerprint');
  assert.equal(c.prepareLiteRecoveryTurn_({...p,action:'close'},s).action,'');
  Object.assign(turn,{activityMode:'exploration',lessonActivityMode:'evaluation',understanding:true,learningStage:'understanding',startQuestion:c.liteUnderstandingStartQuestion_(s)});
  const observation={understanding:true,relatedQuestion:true,conversationPhase:1,responseScore:null,rubricScores:[]};
  c.saveLitePendingState_(turn,'candidate_ready',{plan:{policyVersion:'warmup-policy'},candidateReply:'saved candidate'});
  c.prepareLiteCandidateResult_=(restored,lesson,history) => {
    assert.equal(restored.understanding,true);assert.equal(restored.activityMode,'exploration');
    assert.equal(c.buildLiteEnginePayload_(restored,lesson,history).understanding,true);
    return {reply:'저장한 이해 답변',observation,engineStatus:'finalized:warmup-policy',aiStatus:'ok:synthetic'};
  };
  x.sheets.get('질문과 답변').failWrites=1;
  assert.throws(() => c.submitLiteTurn(p),/synthetic write failure/);
  assert.equal(c.readLitePendingState_(turn).state,'result_ready');
  const reply=c.submitLiteTurn(p);
  assert.equal(reply.learningStage,'understanding');assert.equal(reply.canStartAssessment,true);
  assert.equal(x.providerCalls,0);assert.equal(x.engineCalls,0);assert.equal(x.evaluationWrites,0);
  assert.equal(c.readLitePendingState_(turn),null);
}

{
  const x=setup(), {context:c,payload:p,settings:s}=x;
  c.submitLiteTurn(p);
  c.submitLiteTurn({...p,requestId:'understanding-close-0002',action:'close',message:'마칠래요'});
  assert.equal(c.startLiteStudentSession(p).isClosing,true);
  assert.throws(() => c.submitLiteTurn({...p,requestId:'closed-start-0003',action:'start_assessment'}),/먼저 글/);
  const progress=c.liteInitialAssessmentProgress_(s,'existing-0001');
  progress.stage='complete';progress.activeIndex=2;
  assert.equal(c.liteLearningState_(s,[],progress).learningStage,'complete');
  progress.planId='other-plan';
  assert.throws(() => c.liteLearningState_(s,[],progress),/중앙 엔진/);
  assert.throws(() => c.assertLiteAssessmentEngineResponse_({understanding:true},{observation:{responseScore:null,rubricScores:[]}}),/글 이해/);
  assert.throws(() => c.assertLiteAssessmentEngineResponse_({understanding:true},{observation:{understanding:true,responseScore:3,rubricScores:[]}}),/글 이해/);
}

{
  const x=setup(), {context:c,payload:p,settings:s}=x;
  s.activityMode='exploration';s.startQuestion='글에서 무엇이 궁금한가요?';
  const session=c.startLiteStudentSession(p);
  assert.equal(session.learningStage,'');assert.equal(session.canStartAssessment,false);
  assert.equal(session.lesson.understandingEnabled,false);assert.equal(session.history[0].text,s.startQuestion);
  assert.throws(() => c.submitLiteTurn({...p,action:'start_assessment'}),/평가 수업/);
  assert.equal(c.submitLiteTurn(p).learningStage,'');
  assert.equal(x.observations[0].understanding,undefined);
}

{
  const x=setup(), {context:c,payload:p}=x;
  for (let index=0;index<12;index++) {
    assert.equal(c.submitLiteTurn({...p,requestId:'warmup-budget-'+String(index).padStart(4,'0')}).canStartAssessment,true);
  }
  const before=x.sheets.get('질문과 답변').getLastRow();
  const capped=c.submitLiteTurn({...p,requestId:'warmup-budget-overflow'});
  assert.equal(capped.canStartAssessment,true);assert.equal(capped.isClosing,false);
  assert.equal(x.engineCalls,12);assert.equal(x.sheets.get('질문과 답변').getLastRow(),before);
  assert.equal(c.submitLiteTurn({...p,requestId:'budget-start-action',action:'start_assessment'}).learningStage,'assessment');
  assert.equal(c.submitLiteTurn({...p,requestId:'budget-formal-answer'}).learningStage,'assessment');
  assert.equal(x.engineCalls,13,'formal answer still has reserved request capacity');
}
console.log('gas-lite understanding: passed (entry, explicit transition, history isolation, no grading, retries, recovery, closure, compatibility)');
