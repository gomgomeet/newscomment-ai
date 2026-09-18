const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../gas-lite/StudentClient.html'), 'utf8').match(/<script>([\s\S]*)<\/script>/)[1];

function harness(storage = new Map()) {
  const nodes = new Map(); const calls = []; let success; let failure;
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, {value:'', textContent:'', hidden:false, disabled:false, readOnly:false,
      dataset:{panel:id === 'material-tab' ? 'material' : 'chat'}, classList:{toggle(){},remove(){}}, setAttribute(){}, focus(){},
      set innerHTML(value) {throw Error('Unsafe rendering');}});
    return nodes.get(id);
  }
  const run = {withSuccessHandler(fn){success=fn;return run;},withFailureHandler(fn){failure=fn;return run;},
    submitLiteRequiredAnswers(payload){calls.push(JSON.parse(JSON.stringify(payload)));}};
  const context = vm.createContext({console, document:{body:{dataset:{}},getElementById:node,querySelector:node},
    window:{addEventListener(){},clearTimeout(){},confirm(){return true;},location:{reload(){}}},
    sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    crypto:{randomUUID:()=> '12345678-1234-1234-1234-123456789012'}, google:{script:{run}}});
  vm.runInContext(source, context);
  context.node=node;
  vm.runInContext(`
    ['open-required-assessment','required-assessment-panel','required-assessment-status','required-answer-q1','required-answer-q2',
      'required-question-q1','required-question-q2','submit-required-assessment','refresh-required-assessment'].forEach(id=>elements[toCamel(id)]=node(id));
    elements.mobileTabs=[node('material-tab'),node('chat-tab')];
    state.ready=true; state.studentCode='3-12'; state.sessionId='test-session'; state.joinCode='123456';
    state.bootstrapData={lesson:{lessonId:'TEST',lessonRevision:2,sourceHash:'a'.repeat(24),activityMode:'evaluation',
      requiredQuestions:[{id:'q1',question:'주민들이 무엇을 요구하나요?'},{id:'q2',question:'두 입장의 차이는 무엇인가요?'}]}};
  `,context);
  return {context,node,calls,storage,success:result=>success(result),failure:error=>failure(error),
    state:()=>vm.runInContext('state',context),submit:()=>context.submitRequiredAssessment({preventDefault(){}})};
}
const h=harness();h.context.renderRequiredAssessment(null);
assert.equal(h.node('open-required-assessment').hidden,false);
assert.equal(h.node('required-question-q1').textContent,'주민들이 무엇을 요구하나요?');
assert.equal(h.node('required-assessment-panel').hidden,false);
assert.equal(h.node('.conversation-area').hidden,true);
h.node('required-answer-q1').value='안전한 생활을 요구합니다.';h.submit();
assert.equal(h.calls.length,0,'한 문항의 누락은 전송 전 차단');
h.node('required-answer-q2').value='정부는 전력 공급을, 주민은 생활의 안전을 중요하게 여깁니다.';
h.submit();h.submit();assert.equal(h.calls.length,1,'제출 중 중복 클릭은 한 번만 전송');
assert.deepEqual(h.calls[0].answers.map(x=>x.questionId),['q1','q2']);
assert.equal(h.calls[0].answers[0].text,'안전한 생활을 요구합니다.');
assert.equal(h.node('required-answer-q1').readOnly,true);
h.failure({message:'응답 지연'});
assert.equal(h.node('submit-required-assessment').textContent,'제출 결과 다시 확인');
h.node('required-answer-q1').value='외부 변경';h.submit();
assert.deepEqual(h.calls[1],h.calls[0],'연결 오류 후에는 같은 ID와 원래 답변으로만 조회');
h.success({ok:true,submitted:true,analysisStatus:'pending',message:'답변 제출 완료'});
assert.equal(h.node('open-required-assessment').textContent,'필수 평가 제출 완료');
assert.equal(h.node('submit-required-assessment').disabled,true);
assert.equal(h.node('required-answer-q2').readOnly,true);
assert.equal([...h.storage.keys()].some(key=>key.startsWith('lite-required-answers:')),false);
h.submit();assert.equal(h.calls.length,2,'성공 후 다시 분석하지 않음');

const p=harness();p.context.renderRequiredAssessment(null);
p.node('required-answer-q1').value='첫 답';p.node('required-answer-q2').value='둘째 답';p.submit();
const resumed=harness(p.storage);resumed.context.renderRequiredAssessment(null);
assert.equal(resumed.node('required-answer-q1').value,'첫 답');
assert.equal(resumed.node('required-answer-q1').readOnly,true);
resumed.submit();assert.equal(resumed.calls[0].requestId,p.calls[0].requestId);
const completed=harness();completed.context.renderRequiredAssessment({submitted:true,analysisStatus:'completed',answers:[{questionId:'q1',text:'가'},{questionId:'q2',text:'나'}]});
assert.equal(completed.node('required-answer-q2').value,'나');
assert.equal(completed.node('submit-required-assessment').disabled,true);
assert.equal(completed.node('required-assessment-panel').hidden,true);
const exploration=harness();exploration.state().bootstrapData.lesson.activityMode='exploration';
exploration.context.renderRequiredAssessment(null);assert.equal(exploration.node('open-required-assessment').hidden,true);
const stale=harness();stale.context.renderRequiredAssessment(null);
stale.node('required-answer-q1').value='가';stale.node('required-answer-q2').value='나';stale.submit();
stale.failure({message:'선생님이 수업자료를 새로 준비했습니다. 화면을 새로고침한 뒤 다시 시작해 주세요.'});
assert.equal(stale.state().requiredPending,null);
assert.equal(stale.node('refresh-required-assessment').hidden,false);
assert.equal(stale.node('submit-required-assessment').disabled,true);
stale.submit();assert.equal(stale.calls.length,1,'오래된 수업은 반복 제출 대신 새로고침');
console.log('required student UI: explicit pairing, duplicate prevention, safe retry, reload recovery, submitted lock, exploration isolation passed');
