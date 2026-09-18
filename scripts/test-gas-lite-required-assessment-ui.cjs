/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Reuse the existing real-HTML browser mock without running its legacy scenarios.
const harnessSource = fs.readFileSync(path.join(__dirname, 'test-gas-lite-teacher-setup-ui.cjs'), 'utf8').split('\nconst settings = {')[0];
const harnessContext = vm.createContext({ require, __dirname, console });
vm.runInContext(harnessSource + '\nthis.testHarness = { createUi, parseForm, Element };', harnessContext);
const { createUi, parseForm, Element } = harnessContext.testHarness;
const base = {
  lessonId:'test-lesson', appName:'simbot', subject:'사회', grade:'초등 4학년', lessonTitle:'지역 갈등과 참여',
  lessonGoal:'지역의 문제를 이해하고 주민 참여의 중요성을 설명한다.', achievementStandard:'[4사08-02] 주민 참여의 중요성을 이해한다.',
  materialTitle:'동네 시설 확장', materialText:'주민들은 시설을 더 크게 만들기 전에 안전하게 생활할 수 있는 방법과 편의시설을 마련해야 한다고 주장했습니다.',
  startQuestion:'우리 동네에 어떤 일이 생겼나요?', joinCode:'482731', activityMode:'evaluation', version:'v1',
  rubricScheme:'four_levels', assessmentCriteria:'기존 기준', rubricHigh:'기존 매우잘함', rubricGood:'기존 잘함',
  rubricMeet:'기존 보통', rubricDeveloping:'기존 노력요함', evidenceDescription:'기존 근거',
};
const questions = [{id:'q1',question:'주민들은 왜 시설 확장에 반대했나요?'},{id:'q2',question:'문제를 해결하려면 주민은 어떻게 참여할 수 있을까요?'}];
const clone = (value) => JSON.parse(JSON.stringify(value));
const envelope = (scheme = 'four_levels') => ({ schemaVersion:1, questionSetHash:'test-question-hash', items:questions.map((item) => ({
  ...item, expectedAnswer:'주민의 안전과 생활을 고려한다.', assessmentEvidence:'안전하게 생활할 수 있는 방법과 편의시설을 마련해야 한다',
  assessmentCriteria:'자료의 근거를 들어 이유를 설명한다.', rubricHigh:'근거와 이유를 정확히 연결한다.',
  rubricGood:scheme === 'legacy_three' ? '' : '관련 근거를 찾아 설명한다.', rubricMeet:'일부 근거를 찾는다.',
  rubricDeveloping:'근거를 찾는 데 도움이 필요하다.', rubricBeginning:scheme === 'five_levels' ? '답변에 관련 내용이 드러나지 않는다.' : '',
  answerExamples:'매우잘함\n주민은 안전한 생활을 원하기 때문에 반대했습니다.', evidenceDescription:'문항에 제출한 학생 답변',
})) });
function requiredUi() {
  const ui = createUi(base);
  ui.byId('required-assessment-mode').value = 'required_two'; ui.byId('required-assessment-mode').dispatch('change');
  return ui;
}
function draftQuestions(ui) {
  ui.click('generate-required-questions');
  const request = ui.takeRequest('generateLiteRequiredQuestionDraft');
  assert.equal(request.args[1].materialText, base.materialText);
  request.success({ok:true, questions:clone(questions)});
}
function draftRubrics(ui, scheme = 'four_levels') {
  ui.click('confirm-required-questions');
  ui.click('generate-required-rubrics');
  const request = ui.takeRequest('generateLiteRequiredRubricDraft');
  assert.equal(request.args[1].questionsConfirmed, true);
  assert.deepEqual(clone(request.args[1].questions), questions);
  request.success({ok:true, requiredAssessment:envelope(scheme)});
}

const legacy = createUi(base);
assert.equal(legacy.byId('required-assessment-mode').value, 'legacy', 'Saved legacy lessons stay unchanged');
assert.equal(legacy.byId('backward-design-fields').disabled, false);
assert.equal(createUi({...base,lessonId:''}).byId('required-assessment-mode').value, 'required_two', 'New lessons start with two required questions');

const ui = requiredUi();
assert.equal(ui.byId('backward-design-fields').disabled, true, 'Hide duplicate overall rubric fields');
assert.equal(ui.byId('legacy-assessment-generator').classList.contains('hidden'), true);
ui.submit(); assert.equal(ui.requests.length, 0); assert.match(ui.byId('form-status').textContent, /필수 문항 2개/);
draftQuestions(ui);
assert.equal(ui.byId('start-question').value, base.startQuestion, 'The conversation opener is not overwritten by assessment questions');
assert.equal(ui.byId('generate-required-rubrics').disabled, true, 'Teacher confirmation is required before rubric generation');
draftRubrics(ui);
assert.equal(vm.runInContext('requiredAssessmentReady()',ui.context),true);
const rubricInput = ui.byId('required-rubric-items').descendants().find((node) => node.tagName === 'textarea');
rubricInput.value = '교사가 다듬은 답변 핵심'; rubricInput.dispatch('input');
assert.equal(vm.runInContext('requiredAssessmentReady()',ui.context),true,'Editing criteria preserves question confirmation');
ui.submit();
const save = ui.takeRequest('saveLiteTeacherSetup');
assert.equal(save.args[1].requiredAssessmentMode,'required_two');
assert.equal(save.args[1].requiredAssessment.items[0].expectedAnswer,'교사가 다듬은 답변 핵심');
assert.equal(save.args[1].startQuestion,base.startQuestion);

for (const field of ['required-question-1','material-text','material-title','lesson-title','lesson-goal','achievement-standard','rubric-scheme']) {
  const changed = requiredUi(); draftQuestions(changed); draftRubrics(changed);
  changed.byId(field).value = field === 'rubric-scheme' ? 'five_levels' : changed.byId(field).value + ' 변경';
  changed.byId(field).dispatch(field === 'rubric-scheme' ? 'change' : 'input');
  assert.equal(vm.runInContext('requiredAssessmentReady()',changed.context),false,field+' invalidates the old criteria');
  assert.equal(changed.byId('generate-required-rubrics').disabled,true);
  changed.submit(); assert.equal(changed.requests.length,0);
}

const stale = requiredUi(); draftQuestions(stale); stale.click('confirm-required-questions'); stale.click('generate-required-rubrics');
const staleRequest = stale.takeRequest('generateLiteRequiredRubricDraft');
stale.byId('required-question-2').value += ' 바꿈'; stale.byId('required-question-2').dispatch('input');
staleRequest.success({ok:true,requiredAssessment:envelope()});
assert.equal(vm.runInContext('requiredAssessment',stale.context),null,'An old asynchronous response cannot attach criteria to revised questions');
assert.match(stale.byId('required-assessment-status').textContent,/생성 중 입력이 바뀌어/);

const changedQuestionDraft = requiredUi(); changedQuestionDraft.click('generate-required-questions');
const oldQuestions = changedQuestionDraft.takeRequest('generateLiteRequiredQuestionDraft');
changedQuestionDraft.byId('material-text').value += ' 수정'; changedQuestionDraft.byId('material-text').dispatch('input');
oldQuestions.success({ok:true,questions:clone(questions)});
assert.equal(changedQuestionDraft.byId('required-question-1').value,'');

const incomplete = requiredUi(); draftQuestions(incomplete); draftRubrics(incomplete);
const firstCriterion = incomplete.byId('required-rubric-items').descendants().find((node) => node.tagName === 'textarea');
firstCriterion.value = ''; firstCriterion.dispatch('input'); incomplete.submit(); assert.equal(incomplete.requests.length,0);

for (const scheme of ['legacy_three','four_levels','five_levels']) {
  const saved = createUi({...base,rubricScheme:scheme,requiredAssessmentMode:'required_two',requiredAssessment:envelope(scheme)});
  assert.equal(vm.runInContext('requiredAssessmentReady()',saved.context),true,'Reopen saved '+scheme+' criteria');
  assert.equal(saved.byId('save-state').textContent,'저장된 설정');
  const tables = saved.byId('required-rubric-items').descendants().filter((node) => node.tagName === 'table');
  assert.equal(tables.length,2);
  const levelLabels = tables[0].descendants().filter((node) => node.tagName === 'th').map((node) => node.textContent);
  assert.equal(levelLabels.includes('E'),scheme === 'five_levels');
  assert.equal(levelLabels.includes('잘함'),scheme === 'four_levels');
}

const dashboardHtml = fs.readFileSync(path.join(__dirname,'..','gas-lite','TeacherDashboard.html'),'utf8');
const elements = parseForm(dashboardHtml); const byId = (id) => elements.find((node) => node.id === id);
const dashboard = vm.createContext({document:{body:elements.find((node) => node.tagName === 'body'),getElementById:byId,
  createElement:(tag) => new Element(tag),createTextNode:(text) => {const node=new Element('text');node.textContent=text;return node;}},window:{addEventListener(){}}});
vm.runInContext(dashboardHtml.match(/<script>([\s\S]*?)<\/script>/)[1],dashboard);
const literal = '<img src=x onerror="alert(1)">';
dashboard.renderDashboard({lesson:{...base,requiredAssessment:envelope()},requiredAssessmentSubmissions:[{
  studentCode:'4-12',submittedAt:'2026-09-18T12:00:00Z',analysisStatus:'completed',items:questions,
  answers:[{questionId:'q1',text:literal},{questionId:'q2',text:'주민이 토론회에서 의견을 말해요.'}],
  analysis:[{questionId:'q1',level:'잘함',answerQuote:literal,rationale:'관련 근거가 드러남',feedback:'이유를 연결해 보세요.'}]
}],evaluations:[{studentCode:'4-12',questionId:'q1',assessmentQuestion:questions[0].question,assessmentResponse:literal,rubricScheme:'four_levels'}]});
assert.equal(byId('legacy-lesson-criteria').classList.contains('hidden'),true);
assert.match(byId('required-submissions').textContent,/AI 분석 완료/);
assert.ok(byId('required-submissions').textContent.includes(literal));
assert.ok(byId('evaluations').textContent.includes('문항 1'));
assert.ok(byId('evaluations').textContent.includes(questions[0].question));
assert.equal(byId('evaluations').textContent.includes('시작 질문 뒤 첫 응답'),false);
assert.equal(byId('required-submissions').descendants().some((node)=>node.tagName==='img'),false);
console.log('Required assessment UI: teacher-confirmed two-question generation, per-item editable criteria, 3/4/5 levels, stale-source invalidation, legacy preservation, and safe dashboard analysis passed');
