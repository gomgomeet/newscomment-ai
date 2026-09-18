const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../gas-lite/StudentClient.html'),'utf8').match(/<script>([\s\S]*)<\/script>/)[1];
function harness(){
 const nodes=new Map(),calls=[];let success,failure;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:false,disabled:false,dataset:{},classList:{remove(){}}});return nodes.get(id);};
 const run={withSuccessHandler(fn){success=fn;return run;},withFailureHandler(fn){failure=fn;return run;},finalizeLiteRequiredAssessment(payload){calls.push(JSON.parse(JSON.stringify(payload)));}};
 const context=vm.createContext({console,document:{body:{dataset:{}},getElementById:node},window:{addEventListener(){},clearTimeout(){},confirm(){return true;},location:{reload(){}}},sessionStorage:{getItem(){return null;},setItem(){},removeItem(){}},crypto:{randomUUID:()=> '12345678-1234-1234-1234-123456789012'},google:{script:{run}}});
 vm.runInContext(source,context);context.node=node;
 vm.runInContext(`['required-assessment-notice','required-assessment-status','retry-required-assessment'].forEach(id=>elements[toCamel(id)]=node(id));state.ready=true;state.studentCode='3-12';state.sessionId='test-session';state.joinCode='123456';state.bootstrapData={lesson:{lessonId:'TEST',lessonRevision:2,sourceHash:'a'.repeat(24),activityMode:'evaluation',requiredQuestions:[{id:'q1',question:'첫 질문?'},{id:'q2',question:'둘째 질문?'}]}};`,context);
 return{context,node,calls,success:result=>success(result),failure:error=>failure(error),state:()=>vm.runInContext('state',context)};
}
const h=harness();h.context.updateRequiredAssessment({requiredAssessmentProgress:{completed:1,total:2}});
assert.match(h.node('required-assessment-status').textContent,/1\/2/);assert.equal(h.calls.length,0,'미완료 대화를 분석하지 않는다');
h.context.updateRequiredAssessment({requiredAssessmentReady:true});h.context.finalizeRequiredAssessment();assert.equal(h.calls.length,1,'동시 분석 요청을 막는다');
assert.equal(h.calls[0].studentCode,'3-12');assert.equal(h.calls[0].lessonRevision,2);
assert.equal('answers' in h.calls[0],false,'답변은 저장된 대화에서 서버가 결정한다');assert.equal('requestId' in h.calls[0],false);
h.failure({message:'응답 지연'});assert.equal(h.node('retry-required-assessment').hidden,false);
h.context.finalizeRequiredAssessment();assert.deepEqual(h.calls[1],h.calls[0]);
h.success({ok:true,submitted:true,analysisStatus:'completed',analysis:[{level:'A',answerQuote:'teacher-only'}]});
assert.match(h.node('required-assessment-status').textContent,/선생님이 확인/);assert.doesNotMatch(h.node('required-assessment-status').textContent,/teacher-only/);
h.context.updateRequiredAssessment({requiredAssessmentReady:true});assert.equal(h.calls.length,2,'완료된 분석을 반복하지 않는다');
const resumed=harness();resumed.context.updateRequiredAssessment({requiredAssessmentReady:true,requiredSubmission:{submitted:true,analysisStatus:'ready'}});assert.equal(resumed.calls.length,1,'대기 기록은 분석할 수 있다');
const finished=harness();finished.context.updateRequiredAssessment({requiredAssessmentReady:true,requiredSubmission:{submitted:true,analysisStatus:'pending'}});assert.equal(finished.calls.length,0,'검토 대기는 재과금하지 않는다');
const stale=harness();stale.context.updateRequiredAssessment({requiredAssessmentReady:true});stale.failure({message:'선생님이 수업자료를 새로 준비했습니다. 화면을 새로고침한 뒤 다시 시작해 주세요.'});assert.equal(stale.node('retry-required-assessment').hidden,true);assert.match(stale.node('required-assessment-status').textContent,/새로고침/);
const exploration=harness();exploration.state().bootstrapData.lesson.activityMode='exploration';exploration.context.updateRequiredAssessment({requiredAssessmentReady:true});assert.equal(exploration.node('required-assessment-notice').hidden,true);assert.equal(exploration.calls.length,0);
const html=fs.readFileSync(path.join(__dirname,'../gas-lite/Student.html'),'utf8');assert.doesNotMatch(html,/required-answer-q1|hint-button/);assert.match(source,/state\.closed && !hasRequiredQuestions\(\)/);
console.log('required student UI: chat completion, server-derived answers, duplicate prevention, retry, resume, privacy, exploration isolation passed');
