/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const ts = require('typescript');
const {test} = require('node:test');
const root = path.resolve(__dirname,'..');
const input = {activityMode:'evaluation',subject:'사회',grade:'초등 4학년',lessonTitle:'주민 참여',
  lessonGoal:'자료에 나타난 주민 참여 방법과 그 의미를 근거를 들어 설명한다.',
  achievementStandard:'[4사08-02] 주민 참여의 중요성을 설명한다.',rubricScheme:'four_levels',
  materialTitle:'횡단보도',materialText:'우리 마을 주민들은 위험한 횡단보도 문제를 주민 회의에서 논의했다. 주민들은 시청에 신호등 설치를 건의했고 시청은 현장을 조사했다.'};
const questions = [{id:'q1',question:'주민들은 횡단보도 문제에 어떻게 참여했나요?'},
  {id:'q2',question:'자료를 근거로 볼 때 주민 참여가 문제 해결에 어떤 도움이 되었나요?'}];
function item(id) {return {id,expectedAnswer:id==='q1'?'1. 주민 회의에서 문제를 논의했다. 2. 신호등 설치를 건의했다.':'1. 주민이 의견을 모아 시청에 알렸다. 2. 시청의 현장 조사로 이어졌다.',
  assessmentEvidence:'주민들은 시청에 신호등 설치를 건의했고 시청은 현장을 조사했다.',
  assessmentCriteria:'주민 참여의 방법과 의미를 자료의 사실에 연결해 설명한다.',
  rubricHigh:'주민 회의와 건의의 내용을 정확히 밝히고 시청의 조사와 연결해 참여의 의미를 설명한다.',
  rubricGood:'주민 회의와 건의의 내용을 밝히고 참여의 의미를 설명하지만 조사와의 연결은 드러나지 않는다.',
  rubricMeet:'주민 회의 또는 건의 중 한 방법을 밝히지만 참여의 의미는 설명하지 않는다.',
  rubricDeveloping:'횡단보도 문제만 말하여 주민의 참여 방법이 드러나지 않는다.',
  answerExamples:{rubricHigh:'주민들이 회의에서 문제를 모아 신호등 설치를 건의해서 시청이 조사했어요.',
    rubricGood:'주민들이 회의에서 신호등 설치를 건의해 문제를 함께 해결하려고 했어요.',rubricMeet:'시청에 신호등 설치를 건의했어요.',rubricDeveloping:'횡단보도가 위험해요.'},
  evidenceDescription:'이 문항에 대한 학생의 답변과 자료에서 찾은 근거 설명'};}
const fixture = {materialUsable:true,reason:'',items:[item('q1'),item('q2')]};
function harness(options={}) {
  let calls=0,reservations=0,lastRequest;
  const properties=new Map([['TEACHER_OPENAI_API_KEY','synthetic-key'],['LITE_TEACHER_ACCESS_TOKEN','synthetic-teacher']]);
  const context = vm.createContext({
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties.get(key)||null,
      setProperty:(key,value)=>properties.set(key,String(value)),deleteProperty:key=>properties.delete(key)})},
    Utilities:{getUuid:()=> 'synthetic-request',DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},
      computeDigest:(_algorithm,text)=>Array.from(crypto.createHash('sha256').update(text).digest()),
      base64EncodeWebSafe:bytes=>Buffer.from(bytes).toString('base64url')},
    UrlFetchApp:{fetch(_url,request){calls++;lastRequest=JSON.parse(request.payload);return {
      getResponseCode:()=>options.status||200,
      getContentText:()=>JSON.stringify(options.data||{status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(options.draft||fixture)}]}]})
    };}}
  });
  for (const name of ['SetupService.js','EngineClient.js','AssessmentDraftService.js','Code.js']) vm.runInContext(fs.readFileSync(path.join(root,'gas-lite',name),'utf8'),context,{filename:name});
  context.isLiteApiVerified_=()=>options.verified!==false;
  context.safeReserveLiteModelCall_=()=>{reservations++;return {allowed:options.budget!==false};};
  const save=context.saveLiteTeacherSettings_;
  context.saveLiteTeacherSettings_=()=>assert.fail('draft may not save');
  context.getLiteSpreadsheet_=()=>assert.fail('draft may not inspect students');
  return {context,properties,save,calls:()=>calls,reservations:()=>reservations,request:()=>lastRequest};
}
const plain=value=>JSON.parse(JSON.stringify(value));
function generate(h,payload={...input,questions,questionsConfirmed:true}) {return h.context.generateLiteRequiredRubricDraft_(payload);}

test('question draft makes exactly two editable questions with one budgeted call and no student data',()=>{
  const h=harness({draft:{materialUsable:true,reason:'',questions}});
  const result=h.context.generateLiteRequiredQuestionDraft_({...input,apiKey:'private-key',studentConversations:['private-student'],joinCode:'123456'});
  assert.deepEqual(plain(result.questions),questions);
  assert.equal(h.calls(),1);assert.equal(h.reservations(),1);
  assert.equal(h.request().store,false);assert.equal(h.request().text.format.strict,true);
  assert.doesNotMatch(h.request().input,/private-|123456/);
  assert.equal(JSON.parse(h.request().input).materialExcerpt,input.materialText);
  assert.match(h.request().instructions,/정확히 2개/);
});

test('question counts, IDs, duplicate and oversized questions are rejected',()=>{
  for (const invalid of [questions.slice(0,1),[...questions,questions[0]],
    [{...questions[0],id:'q2'},questions[1]], [{...questions[0],question:''},questions[1]],
    [{...questions[0],question:'가'.repeat(250)+'?'},questions[1]],
    [questions[0],{...questions[1],question:questions[0].question}]]) {
    const h=harness({draft:{materialUsable:true,reason:'',questions:invalid}});
    assert.throws(()=>h.context.generateLiteRequiredQuestionDraft_(input),/문항|질문|250자/);
  }
});

test('both stages validate mode, material and goal before charging; rubrics require explicit question confirmation',()=>{
  const h=harness();
  for(const bad of [{...input,activityMode:'exploration'},{...input,materialText:'짧음'},
    {...input,lessonGoal:'',achievementStandard:'[4사08-02]'}]) {
    assert.throws(()=>h.context.generateLiteRequiredQuestionDraft_(bad));
    assert.throws(()=>generate(h,{...bad,questions,questionsConfirmed:true}));
  }
  for(const questionsConfirmed of [undefined,false,'true',1]) assert.throws(()=>generate(h,{...input,questions,questionsConfirmed}),/확정/);
  assert.equal(h.calls(),0);assert.equal(h.reservations(),0);
});

test('confirmed teacher wording is preserved and each question gets an independent complete table',()=>{
  const h=harness();const edited=[{...questions[0],question:'교사가 수정한 질문: 주민들은 어떤 일을 했나요?'},questions[1]];
  const payload={...input,questions:edited,questionsConfirmed:true};const before=JSON.stringify(payload);
  const result=generate(h,payload).requiredAssessment;
  assert.equal(result.schemaVersion,1);assert.equal(result.questionSetHash.length,24);
  assert.deepEqual(plain(result.items.map(({id,question})=>({id,question}))),edited);
  assert.notEqual(result.items[0].expectedAnswer,result.items[1].expectedAnswer);
  assert.equal(result.items[0].rubricBeginning,'');
  assert.equal(JSON.stringify(payload),before);assert.equal(h.calls(),1);assert.equal(h.reservations(),1);
  const request=h.request();assert.deepEqual(JSON.parse(request.input).questions,edited);
  assert.equal(request.text.format.schema.properties.items.items.additionalProperties,false);
  assert.equal(request.text.format.schema.properties.items.items.properties.question,undefined);
  assert.match(request.instructions,/질문을 새로 만들거나 수정하지/);
});

test('provider cannot change teacher questions, swap IDs, omit a table or add hidden properties',()=>{
  for(const items of [fixture.items.slice(0,1),[fixture.items[1],fixture.items[0]],
    [{...fixture.items[0],question:'AI가 바꾼 문항'},fixture.items[1]],
    [{...fixture.items[0],secret:'extra'},fixture.items[1]],
    [{...fixture.items[0],expectedAnswer:''},fixture.items[1]]]) {
    assert.throws(()=>generate(harness({draft:{...fixture,items}})),/AI/);
  }
});

test('one fabricated evidence quote or duplicated level invalidates the entire two-question draft',()=>{
  for(const change of [{assessmentEvidence:'시청은 다음날 신호등을 설치하여 문제를 해결했다.'},
    {assessmentEvidence:'주민들은 시청에 시청은 현장을 조사했다.'},
    {rubricGood:fixture.items[0].rubricHigh},
    {answerExamples:{...fixture.items[0].answerExamples,rubricMeet:fixture.items[0].answerExamples.rubricHigh}}]) {
    assert.throws(()=>generate(harness({draft:{...fixture,items:[fixture.items[0],{...fixture.items[1],...change}]}})),/AI/);
  }
});

test('selected 3, 4 or 5 levels constrain both item schemas and normalized saved tables',()=>{
  for(const [rubricScheme,count] of [['legacy_three',3],['four_levels',4],['five_levels',5]]) {
    const draft=plain(fixture);
    for(const row of draft.items) {
      if(count===3) {delete row.rubricGood;delete row.answerExamples.rubricGood;}
      if(count===5) {row.rubricBeginning='문제와 주민 참여의 관련 내용이 아직 나타나지 않는다.';row.answerExamples.rubricBeginning='잘 모르겠어요.';}
    }
    const h=harness({draft});const result=generate(h,{...input,rubricScheme,questions,questionsConfirmed:true}).requiredAssessment;
    assert.equal(h.request().text.format.schema.properties.items.items.required.filter(key=>key.startsWith('rubric')).length,count);
    for(const row of result.items) {
      assert.equal(Object.keys(row).filter(key=>key.startsWith('rubric')&&row[key]).length,count);
      assert.equal(row.answerExamples.split('\n\n').length,count);
      if(count===5) for(const label of ['A','B','C','D','E']) assert.ok(row.answerExamples.includes(label+'\n'));
    }
  }
});

test('empty optional configuration stays legacy-compatible and valid JSON round trips',()=>{
  const h=harness();for(const raw of [undefined,null,'']) assert.equal(h.context.normalizeLiteRequiredAssessment_(raw,input),null);
  const draft=generate(h).requiredAssessment;
  assert.deepEqual(plain(h.context.normalizeLiteRequiredAssessment_(JSON.stringify(draft),input)),plain(draft));
  for(const raw of ['not-json',[],{}, {...draft,schemaVersion:2},{...draft,items:[draft.items[0]]}]) assert.throws(()=>h.context.normalizeLiteRequiredAssessment_(raw,input));
});

test('changing design inputs or confirmed questions invalidates the analysis table instead of grading with stale criteria',()=>{
  const h=harness();const draft=generate(h).requiredAssessment;
  for(const key of ['materialText','materialTitle','lessonTitle','lessonGoal','achievementStandard','subject','grade']) {
    assert.throws(()=>h.context.normalizeLiteRequiredAssessment_(draft,{...input,[key]:input[key]+' 변경'}),/변경|원문/);
  }
  assert.throws(()=>h.context.normalizeLiteRequiredAssessment_(draft,{...input,rubricScheme:'five_levels'}),/변경/);
  const changed=plain(draft);changed.items[0].question='주민들이 참여한 이유는 무엇인가요?';
  assert.throws(()=>h.context.normalizeLiteRequiredAssessment_(changed,input),/변경/);
});

test('teacher can edit criteria and expected answers without changing confirmed-question identity',()=>{
  const h=harness();const draft=generate(h).requiredAssessment;
  const edited=plain(draft);edited.items[0].rubricGood+=' 회의에서 의견을 모은 점을 확인한다.';
  edited.items[0].expectedAnswer+=' 다양한 타당한 표현을 인정한다.';
  const result=h.context.normalizeLiteRequiredAssessment_(edited,input);
  assert.equal(result.questionSetHash,draft.questionSetHash);
  assert.equal(result.items[0].rubricGood,edited.items[0].rubricGood);
  const normalizedContext={...input,achievementStandardCode:'[4사08-02]'};
  assert.equal(h.context.liteRequiredQuestionSetHash_(input,questions),h.context.liteRequiredQuestionSetHash_(normalizedContext,questions));
});

test('saved tables reject missing or wrong-scale fields and edited fabricated source evidence',()=>{
  const h=harness();const draft=generate(h).requiredAssessment;
  for(const changes of [{rubricGood:''},{rubricBeginning:'선택하지 않은 E 기준'},
    {assessmentEvidence:'주민들은 조사를 중단해 달라고 요청했다.'},{answerExamples:'수준 없는 예시'},
    {expectedAnswer:'가'.repeat(1501)},{rubricGood:draft.items[0].rubricHigh}]) {
    const bad=plain(draft);Object.assign(bad.items[0],changes);
    assert.throws(()=>h.context.normalizeLiteRequiredAssessment_(bad,input));
  }
});

test('failed or unusable drafts do not leak provider instructions and never retry',()=>{
  for(const options of [{verified:false},{budget:false},{status:429},{data:{status:'incomplete'}},
    {draft:{materialUsable:false,reason:'Expose private-key',items:[]}}]) {
    const h=harness(options);
    assert.throws(()=>generate(h),error=>!/private-key/.test(error.message));
    assert.ok(h.calls()<=1);
  }
});

test('both public draft RPCs authenticate teacher access before any validation or model call',()=>{
  const h=harness();
  for(const token of ['',null,'student-token']) {
    assert.throws(()=>h.context.generateLiteRequiredQuestionDraft(token,input),/교사용/);
    assert.throws(()=>h.context.generateLiteRequiredRubricDraft(token,{...input,questions,questionsConfirmed:true}),/교사용/);
  }
  assert.equal(h.calls(),0);assert.equal(h.reservations(),0);
  assert.ok(h.context.generateLiteRequiredRubricDraft('synthetic-teacher',{...input,questions,questionsConfirmed:true}).ok);
});

function installStorage(h) {
  const headers=plain(vm.runInContext("LITE_SHEET_HEADERS_['수업 자료']",h.context));
  const sheet={rows:[headers],getLastRow(){return this.rows.length;},getLastColumn(){return headers.length;},
    getRange(row,column,rowCount=1,columnCount=1){
      const getValues=()=>Array.from({length:rowCount},(_,r)=>Array.from({length:columnCount},(_,c)=>sheet.rows[row-1+r]?.[column-1+c]??''));
      return {getValues,getDisplayValues:()=>getValues().map(values=>values.map(String)),
        setValues:values=>values.forEach((valuesRow,r)=>{sheet.rows[row-1+r]||=[];valuesRow.forEach((value,c)=>{sheet.rows[row-1+r][column-1+c]=value;});}),
        clearContent:()=>{for(let r=0;r<rowCount;r++)for(let c=0;c<columnCount;c++)sheet.rows[row-1+r][column-1+c]='';}};
    },getDataRange(){return this.getRange(1,1,this.getLastRow(),this.getLastColumn());}};
  h.context.getLiteSpreadsheet_=()=>({getSheetByName:name=>name==='수업 자료'?sheet:null});
  h.context.ensureLiteWorkbook_=()=>{};
  h.context.saveLiteTeacherSettings_=h.save;
  return sheet;
}

function settingsPayload(requiredAssessment) {
  return {...input,appName:'simbot',joinCode:'123456',materialUrl:'',startQuestion:questions[0].question,version:'v1',
    requiredAssessmentMode:'required_two',requiredAssessment,requiredAssessmentApproved:true};
}

test('two-question design validates, saves to appended JSON columns, reopens, and exposes only questions to students',()=>{
  const h=harness();const requiredAssessment=generate(h).requiredAssessment;const sheet=installStorage(h);
  const validated=h.context.validateLiteTeacherSetup_(settingsPayload(requiredAssessment));
  assert.equal(validated.assessmentCriteria,requiredAssessment.items[0].assessmentCriteria);
  assert.equal(validated.expectedAnswer,requiredAssessment.items[0].expectedAnswer);
  const saved=h.context.saveLiteTeacherSettings_(validated);
  assert.equal(saved.lessonRevision,1);
  assert.equal(sheet.rows[0].at(-2),'requiredAssessmentMode');assert.equal(sheet.rows[0].at(-1),'requiredAssessmentJson');
  assert.equal(sheet.rows[1][sheet.rows[0].indexOf('requiredAssessmentMode')],'required_two');
  const loaded=h.context.readLiteTeacherSettings_();
  assert.deepEqual(plain(loaded.requiredAssessment),plain(requiredAssessment));
  assert.equal(loaded.sourceHash,saved.sourceHash);
  assert.equal(h.context.saveLiteTeacherSettings_(h.context.validateLiteTeacherSetup_(loaded)).lessonRevision,1);
  const student=h.context.sanitizeLiteSettingsForStudent_(loaded);
  assert.deepEqual(plain(student.requiredQuestions),questions);
  for(const name of ['requiredAssessment','requiredAssessmentJson','expectedAnswer','assessmentEvidence','assessmentCriteria','rubricHigh','answerExamples']) assert.equal(Object.hasOwn(student,name),false);
  const exploration=h.context.validateLiteTeacherSetup_({...loaded,activityMode:'exploration'});
  assert.deepEqual(plain(exploration.requiredAssessment),plain(requiredAssessment));
  assert.deepEqual(plain(h.context.sanitizeLiteSettingsForStudent_(exploration).requiredQuestions),[]);
});

test('question, passage and criteria edits all change the saved revision and invalidate preview verification',()=>{
  const h=harness();const requiredAssessment=generate(h).requiredAssessment;installStorage(h);
  let saved=h.context.saveLiteTeacherSettings_(h.context.validateLiteTeacherSetup_(settingsPayload(requiredAssessment)));
  for(const kind of ['criteria','question','passage']) {
    const next=plain(saved);next.requiredAssessment=plain(saved.requiredAssessment);
    if(kind==='criteria') next.requiredAssessment.items[1].rubricGood+=' 주민들의 의견을 모은 과정을 확인한다.';
    if(kind==='question') next.requiredAssessment.items[1].question='주민 참여의 의미를 알 수 있는 원문 근거는 무엇인가요?';
    if(kind==='passage') next.materialText+=' 이후 주민들은 조사 결과를 함께 확인했다.';
    if(kind!=='criteria') next.requiredAssessment.questionSetHash=h.context.liteRequiredQuestionSetHash_(next,next.requiredAssessment.items);
    h.properties.set('LITE_PREVIEW_ACCESS_TOKEN','old-preview');
    const updated=h.context.saveLiteTeacherSettings_(h.context.validateLiteTeacherSetup_(next));
    assert.notEqual(updated.sourceHash,saved.sourceHash);
    assert.equal(updated.lessonRevision,saved.lessonRevision+1);
    assert.equal(h.properties.has('LITE_PREVIEW_ACCESS_TOKEN'),false);
    assert.deepEqual(plain(h.context.readLiteTeacherSettings_().requiredAssessment),plain(updated.requiredAssessment));
    saved=updated;
  }
});

test('live approved-plan lesson hash and revision are unchanged by absent new required assessment columns',()=>{
  const h=harness();const sheet=installStorage(h);
  const legacy={...settingsPayload(null),...item('q1'),rubricScheme:'legacy_three',rubricGood:'',answerExamples:'',
    achievementStandardCode:'[4사08-02]',requiredAssessmentMode:'legacy',requiredAssessment:null,requiredAssessmentJson:'',
    expectedAnswer:'',assessmentEvidence:''};
  delete legacy.id;delete legacy.answerExamples;
  const plan={schemaVersion:1,approved:true,criteria:Array.from({length:5},(_,index)=>({
    id:'criterion-'+(index+1),criterion:'주민 참여 기준 '+(index+1),responseKind:index===4?'student_question':'explanation',
    mainQuestion:'주민 참여의 의미 '+(index+1)+'은 무엇인가요?',followUpQuestion:'자료에서 확인한 구절은 무엇인가요?',
    evidenceDescription:'학생이 말한 근거 설명',sourceQuote:input.materialText.slice(0,35),requireSourceEvidence:index!==4
  }))};
  legacy.assessmentPlanJson=JSON.stringify(plan);
  const originalFields=['appName','subject','grade','lessonTitle','joinCode','lessonGoal','achievementStandardCode','achievementStandard',
    'assessmentCriteria','rubricHigh','rubricMeet','rubricDeveloping','evidenceDescription','materialTitle','materialText','materialUrl',
    'activityMode','version','assessmentPlanJson'];
  const oldHash=crypto.createHash('sha256').update(originalFields.map(key=>key+'='+String(legacy[key]??'').trim()).join('\n')).digest('base64url').slice(0,24);
  assert.equal(h.context.makeLiteSettingsHash_(legacy),oldHash);
  const oldRow={...legacy,lessonId:'LESSON-OLD',lessonRevision:7,sourceHash:oldHash};
  sheet.rows[1]=sheet.rows[0].map(key=>oldRow[key]??'');
  const reopened=h.context.readLiteTeacherSettings_();
  const saved=h.context.saveLiteTeacherSettings_(h.context.validateLiteTeacherSetup_(reopened));
  assert.equal(saved.sourceHash,oldHash);assert.equal(saved.lessonRevision,7);assert.equal(saved.requiredAssessment,null);
  assert.deepEqual(JSON.parse(saved.assessmentPlanJson),plan);
  assert.equal(h.context.liteAssessmentStartQuestion_(saved),plan.criteria[0].mainQuestion);
});

test('required mode derives exactly two approved live-plan criteria, ignoring a spoofed extra plan',()=>{
  const h=harness();const result=generate(h);const requiredAssessment=plain(result.requiredAssessment);
  requiredAssessment.items[0].assessmentCriteria+=' 구체적인 근거와 의미를 확인한다.'.repeat(35);
  requiredAssessment.items[0].evidenceDescription+=' 답변에서 내용과 근거의 연결을 확인한다.'.repeat(20);
  const payload={...settingsPayload(requiredAssessment),assessmentPlanJson:'invalid forged plan'};
  const saved=h.context.validateLiteTeacherSetup_(payload);
  const plan=JSON.parse(saved.assessmentPlanJson);
  assert.equal(plan.approved,true);assert.equal(plan.criteria.length,2);
  assert.deepEqual(plan.criteria.map(item=>item.id),['q1','q2']);
  assert.deepEqual(plan.criteria.map(item=>item.mainQuestion),questions.map(item=>item.question));
  assert.ok(plan.criteria.every(item=>item.criterion.length<=180 && item.evidenceDescription.length<=300 && item.sourceQuote.length<=240));
  assert.equal(saved.requiredAssessment.items[0].assessmentCriteria,requiredAssessment.items[0].assessmentCriteria);
  assert.equal(saved.requiredAssessment.items[0].evidenceDescription,requiredAssessment.items[0].evidenceDescription);
  assert.equal(h.context.sanitizeLiteSettingsForStudent_(saved).startQuestion,h.context.liteUnderstandingStartQuestion_(saved));
  assert.equal(h.context.liteAssessmentStartQuestion_(saved),questions[0].question);
  assert.equal(JSON.parse(result.assessmentPlanJson).criteria[0].mainQuestion,questions[0].question);
  for(const requiredAssessmentApproved of [undefined,false,'true']) assert.throws(()=>h.context.validateLiteTeacherSetup_({...payload,requiredAssessmentApproved}),/승인/);
});

test('required question wording must fit the existing live engine contract without silent truncation',()=>{
  const h=harness();
  for(const question of ['물음표 없는 지시문입니다.','무엇인가요? 이유는 무엇인가요?','질문인가요? 뒤에 설명','가'.repeat(250)+'?']) {
    assert.throws(()=>generate(h,{...input,questions:[{id:'q1',question},questions[1]],questionsConfirmed:true}),/문항|250자/);
  }
  assert.equal(h.calls(),0);
});

test('unapproved rubric edits saved in exploration remain unapproved after reload and require review before evaluation',()=>{
  const h=harness();const generated=generate(h);installStorage(h);
  const approved=h.context.saveLiteTeacherSettings_(h.context.validateLiteTeacherSetup_(settingsPayload(generated.requiredAssessment)));
  const edited=plain(approved);
  edited.activityMode='exploration';
  edited.requiredAssessmentApproved=false;
  edited.requiredAssessment.items[1].rubricGood+=' 주민 의견을 모으는 과정을 확인한다.';
  const pending=h.context.validateLiteTeacherSetup_(edited);
  assert.equal(pending.requiredAssessmentApproved,false);
  assert.equal(JSON.parse(pending.assessmentPlanJson).approved,false);
  const saved=h.context.saveLiteTeacherSettings_(pending);
  const loaded=h.context.readLiteTeacherSettings_();
  assert.equal(saved.requiredAssessmentApproved,false);
  assert.equal(loaded.requiredAssessmentApproved,false);
  assert.equal(h.context.liteAssessmentPlan_(loaded).approved,false);
  assert.equal(loaded.requiredAssessment.items[1].rubricGood,edited.requiredAssessment.items[1].rubricGood);
  assert.throws(()=>h.context.validateLiteTeacherSetup_({...loaded,activityMode:'evaluation'}),/승인/);
  assert.equal(h.context.liteAssessmentStartQuestion_({...loaded,activityMode:'evaluation'}),'');
  const reapproved=h.context.validateLiteTeacherSetup_({...loaded,activityMode:'evaluation',requiredAssessmentApproved:true});
  assert.equal(JSON.parse(reapproved.assessmentPlanJson).approved,true);
  assert.equal(reapproved.requiredAssessmentApproved,true);
  assert.equal(h.context.liteAssessmentStartQuestion_(reapproved),questions[0].question);
});

test('pre-live and live sheet schemas gain columns only at the end without moving existing data',()=>{
  const h=harness();
  const expected=plain(vm.runInContext("LITE_SHEET_HEADERS_",h.context));
  for(const name of ['수업 자료','질문과 답변','교사 평가']) {
    const newer=name==='수업 자료'?['assessmentPlanJson','requiredAssessmentMode','requiredAssessmentJson']:
      name==='질문과 답변'?['assessmentProgressJson']:['criterionEvidenceJson','questionId'];
    for(const prior of ['pre-live','live']) {
      const missing=prior==='pre-live'?newer:newer.filter(key=>!['assessmentPlanJson','assessmentProgressJson','criterionEvidenceJson'].includes(key));
      const headers=expected[name].filter(key=>!missing.includes(key));
      const originalValues=headers.map((key,index)=>key+'-original-'+index);
      const rows=[headers.slice(),originalValues.slice()];
      const sheet={getLastRow:()=>rows.length,getLastColumn:()=>rows[0].length,setFrozenRows(){},
        getRange(row,column,rowCount=1,columnCount=1){return {
          getDisplayValues:()=>Array.from({length:rowCount},(_,r)=>Array.from({length:columnCount},(_,c)=>String(rows[row-1+r]?.[column-1+c]??''))),
          setValues:values=>values.forEach((valuesRow,r)=>{rows[row-1+r]||=[];valuesRow.forEach((value,c)=>rows[row-1+r][column-1+c]=value);})
        };}};
      h.context.ensureLiteSheet_({getSheetByName:()=>sheet},name,expected[name]);
      assert.deepEqual(rows[0].slice(0,headers.length),headers);
      assert.deepEqual(rows[0].slice(headers.length),missing);
      assert.deepEqual(rows[1],originalValues);
    }
  }
});

test('generated required tables produce plans accepted unchanged by the real central-engine contract',()=>{
  // During the live-v19 integration the contract may still be on origin/main.
  // Once merged, always exercise the checked-out module used by the build.
  const contractPath=path.join(root,'lib','lite-assessment-plan.ts');
  const contractSource=fs.existsSync(contractPath)?fs.readFileSync(contractPath,'utf8'):
    execFileSync('git',['-c','safe.directory='+root,'show','origin/main:lib/lite-assessment-plan.ts'],{cwd:root,encoding:'utf8'});
  const code=ts.transpileModule(contractSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exported={};
  const central=vm.createContext({exports:exported,module:{exports:exported},require(specifier){
    if(specifier==='node:crypto') return crypto;
    // The unrelated conversation classifier is imported by this module, but the
    // real normalization/hash functions below must never call it.
    if(specifier==='@/lib/questioning-board') return {isQuestioningHintRequest(){assert.fail('normalization must not classify student text');}};
    throw new Error('Unexpected contract import: '+specifier);
  }});
  vm.runInContext(code,central,{filename:'central-lite-assessment-plan.js'});
  for(const [rubricScheme,count] of [['legacy_three',3],['four_levels',4],['five_levels',5]]) {
    const draft=plain(fixture);
    for(const row of draft.items) {
      if(count===3){delete row.rubricGood;delete row.answerExamples.rubricGood;}
      if(count===5){row.rubricBeginning='주민 참여와 관련된 내용이 아직 드러나지 않는다.';row.answerExamples.rubricBeginning='잘 모르겠어요.';}
    }
    const editedQuestions=[{id:'q1',question:'주민들이 실제로 참여한 두 가지 방법은 무엇인가요?'},questions[1]];
    const h=harness({draft});
    const generated=generate(h,{...input,rubricScheme,questions:editedQuestions,questionsConfirmed:true});
    const plan=JSON.parse(generated.assessmentPlanJson);
    const normalized=exported.normalizeAssessmentPlan(plan,input.materialText,true);
    assert.deepEqual(plain(normalized),plan);
    assert.deepEqual(plan.criteria.map(row=>({id:row.id,question:row.mainQuestion})),editedQuestions);
    assert.ok(plan.criteria.every(row=>input.materialText.includes(row.sourceQuote)));
    const lessonIdentity=JSON.stringify(['LESSON-CENTRAL-CONTRACT',1,'synthetic-source-hash']);
    const planId=exported.createAssessmentPlanId(normalized,lessonIdentity);
    assert.equal(planId,crypto.createHash('sha256').update(JSON.stringify([lessonIdentity,plan])).digest('base64url'));
    const publicLesson=h.context.sanitizeLiteSettingsForStudent_(h.context.validateLiteTeacherSetup_({
      ...settingsPayload(generated.requiredAssessment),rubricScheme
    }));
    assert.equal(publicLesson.startQuestion,h.context.liteUnderstandingStartQuestion_({activityMode:'evaluation'}));
    assert.equal(publicLesson.understandingEnabled,true);
    assert.deepEqual(plain(publicLesson.requiredQuestions),editedQuestions);
    assert.equal(Object.hasOwn(publicLesson,'assessmentPlanJson'),false);
    assert.equal(Object.hasOwn(publicLesson,'requiredAssessment'),false);
  }
});
