/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const studentHtml = fs.readFileSync(path.join(root, 'gas-lite', 'Student.html'), 'utf8');
const studentClient = fs.readFileSync(path.join(root, 'gas-lite', 'StudentClient.html'), 'utf8');
const studentScript = studentClient.match(/<script>([\s\S]*)<\/script>/)[1];
const teacherHtml = fs.readFileSync(path.join(root, 'gas-lite', 'TeacherSetup.html'), 'utf8');
const teacherScript = teacherHtml.match(/<script>([\s\S]*?)<\/script>/)[1];

function makeNode(dataset = {}) {
  const classes = new Set();
  return {
    hidden:false, disabled:false, value:'', textContent:'', placeholder:'', dataset,
    classList:{ toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }, contains(name) { return classes.has(name); } },
  };
}

const student = vm.createContext({
  document:{ body:{ dataset:{} }, getElementById:() => null },
  window:{ addEventListener() {} },
});
vm.runInContext(studentScript, student, { filename:'StudentClient.html' });
const elements = vm.runInContext('elements', student);
const state = vm.runInContext('state', student);
for (const name of [
  'appName','activityModeLabel','activityModeDescription','chatKicker','subjectChip',
  'materialTitle','materialMeta','lessonGoal','startQuestion','materialText','messageInput',
  'questionTypeBanner','questionTypeCurrent','factQuestionCount','inquiryQuestionCount',
  'applicationQuestionCount','reflectionQuestionCount','unclassifiedQuestionCount',
]) elements[name] = makeNode();
elements.questionTypeChips = ['fact','inquiry','application','reflection','unclassified']
  .map((category) => makeNode({ questionCategory:category }));
state.bootstrapData = { lesson:{ activityMode:'questioning' } };
student.renderLesson({
  activityMode:'questioning', appName:'simbot', materialText:'충분한 수업자료', materialTitle:'오늘의 글',
}, true);
assert.equal(elements.questionTypeBanner.hidden, false);
assert.equal(elements.activityModeLabel.textContent, '질문하기 수업');
assert.match(elements.questionTypeCurrent.textContent, /예상 유형/);
assert.match(elements.messageInput.placeholder, /질문/);

// The browser uses only server-provided metadata; a reply or question text alone never creates a count.
student.updateQuestionTypeBanner({ reply:'어떤 질문이든 할 수 있어요.' });
assert.equal(elements.factQuestionCount.textContent, '0');
student.updateQuestionTypeBanner({
  questionCategory:'inquiry', questionClassificationStatus:'classified',
  questionCounts:{ fact:1, inquiry:2, application:0, reflection:1, unclassified:0 },
});
assert.equal(elements.inquiryQuestionCount.textContent, '2');
assert.equal(elements.reflectionQuestionCount.textContent, '1');
assert.match(elements.questionTypeCurrent.textContent, /탐구 질문/);
assert.equal(elements.questionTypeChips[1].classList.contains('is-current'), true);
assert.equal(elements.questionTypeChips[0].classList.contains('is-current'), false);

// An idempotent retry response keeps the authoritative total; errors do not relabel the last real question.
student.updateQuestionTypeBanner({
  duplicate:true, questionCategory:'inquiry', questionClassificationStatus:'classified',
  questionCounts:{ fact:1, inquiry:2, application:0, reflection:1, unclassified:0 },
});
assert.equal(elements.inquiryQuestionCount.textContent, '2');
student.updateQuestionTypeBanner({ retryable:true, questionCategory:'reflection' });
assert.match(elements.questionTypeCurrent.textContent, /탐구 질문/);

student.updateQuestionTypeBanner({
  questionCategory:'', questionClassificationStatus:'unclassified',
  questionCounts:{ fact:1, inquiry:2, application:0, reflection:1, unclassified:1 },
});
assert.equal(elements.unclassifiedQuestionCount.textContent, '1');
assert.match(elements.questionTypeCurrent.textContent, /분류 보류 · 선생님 확인/);
assert.equal(elements.questionTypeChips[4].classList.contains('is-pending'), true);
assert.equal(elements.questionTypeChips.slice(0, 4).some((chip) => chip.classList.contains('is-current')), false,
  'Unclassified questions are not assigned to any of the four types');
student.updateQuestionTypeBanner({ questionCategory:'', questionClassificationStatus:'' });
assert.match(elements.questionTypeCurrent.textContent, /분류 보류/, 'A non-question does not erase the latest question status');
student.updateQuestionTypeBanner({
  questionCategory:'', questionClassificationStatus:'',
  questionCounts:{ fact:1, inquiry:2, application:0, reflection:1, unclassified:1 }
});
assert.match(elements.questionTypeCurrent.textContent, /분류 보류/,
  'a smalltalk reply with no category does not create a new pending classification');
assert.equal(elements.unclassifiedQuestionCount.textContent, '1');

// A session reload restores counts and latest genuine student type from persisted history metadata.
state.questionCounts = { fact:0, inquiry:0, application:0, reflection:0, unclassified:0 };
state.latestQuestionCategory = '';
state.latestQuestionClassificationStatus = '';
student.updateQuestionTypeBanner({}, [
  { speaker:'student', text:'무엇인가요?', questionCategory:'reflection' },
  { speaker:'bot', text:'첫 답변', questionCategory:'fact', questionClassificationStatus:'classified' },
  { speaker:'student', text:'내 생각을 다시 보면?', questionCategory:'' },
  { speaker:'bot', text:'둘째 답변', questionCategory:'reflection', questionClassificationStatus:'classified' },
  { speaker:'student', text:'그렇군요', questionCategory:'' },
  { speaker:'bot', text:'안내', questionCategory:'' },
]);
assert.equal(elements.factQuestionCount.textContent, '1');
assert.equal(elements.reflectionQuestionCount.textContent, '1');
assert.match(elements.questionTypeCurrent.textContent, /성찰 질문/);
assert.equal(elements.questionTypeChips[3].classList.contains('is-current'), true);

state.questionCounts = { fact:0, inquiry:0, application:0, reflection:0, unclassified:0 };
state.latestQuestionCategory = '';
state.latestQuestionClassificationStatus = '';
student.updateQuestionTypeBanner({ questionCounts:{ fact:1, inquiry:0, application:0, reflection:0, unclassified:1 } }, [
  { speaker:'student', text:'무슨 뜻인가요?', questionCategory:'' },
  { speaker:'bot', text:'뜻 설명', questionCategory:'fact', questionClassificationStatus:'classified' },
  { speaker:'student', text:'더 궁금해요?', questionCategory:'' },
  { speaker:'bot', text:'교사 확인', questionCategory:'', questionClassificationStatus:'unclassified' },
]);
assert.equal(elements.factQuestionCount.textContent, '1');
assert.equal(elements.unclassifiedQuestionCount.textContent, '1');
assert.match(elements.questionTypeCurrent.textContent, /분류 보류 · 선생님 확인/);

state.bootstrapData.lesson.activityMode = 'evaluation';
student.renderLesson({ activityMode:'evaluation' }, true);
assert.equal(elements.questionTypeBanner.hidden, true, 'Assessment-only UI never shows question-type counts');
assert.match(studentHtml, /data-question-category="reflection">성찰/);
assert.doesNotMatch(studentHtml, /data-question-category="inference"/);

const teacherNodes = new Map();
const teacherNode = (id) => {
  if (!teacherNodes.has(id)) teacherNodes.set(id, makeNode());
  return teacherNodes.get(id);
};
teacherNode('activity-mode').value = 'questioning';
const teacher = vm.createContext({
  document:{ body:{ dataset:{} }, getElementById:teacherNode },
  window:{ addEventListener() {} },
});
vm.runInContext(teacherScript, teacher, { filename:'TeacherSetup.html' });
assert.equal(Array.from(teacher.visibleSteps()).join(','), 'design,material,check');
teacher.showStepByName = () => {};
teacher.syncRubricScheme = () => {};
teacher.updateReadinessDisplay = () => {};
teacher.syncBackwardDesign(false);
assert.equal(teacherNode('backward-design-fields').disabled, true);
assert.equal(teacherNode('evaluation-goal-fields').disabled, true);
assert.equal(teacherNode('assessment-ai-section').classList.contains('hidden'), true);
assert.equal(teacherNode('required-assessment-editor').classList.contains('hidden'), true);
assert.equal(teacherNode('setup-flow').dataset.mode, 'questioning');
assert.match(teacherHtml, /id="check-step-number" class="step-no">3단계</,
  'Questioning mode uses the same three-stage teacher flow');
assert.equal(teacher.collectPayload().activityMode, 'questioning');
assert.match(teacherHtml, /<option value="questioning">질문하기/);
assert.match(teacherHtml, /value\.activityMode === 'questioning' \? 'questioning'/);
assert.match(teacherHtml, /mode === 'questioning' && \['assessmentPlan', 'backwardDesign'\]/);
console.log('questioning UI: four server-derived categories plus unclassified pending, reload and duplicate recovery, assessment isolation, teacher mode passed');
