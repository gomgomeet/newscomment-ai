/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'gas-lite', 'TeacherSetup.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const designFields = {
  'lesson-goal':'lessonGoal',
  'achievement-standard':'achievementStandard',
  'assessment-criteria':'assessmentCriteria',
  'rubric-high':'rubricHigh',
  'rubric-meet':'rubricMeet',
  'rubric-developing':'rubricDeveloping',
  'evidence-description':'evidenceDescription',
};

// Deliberately small browser mock: nodes and form constraints come from the real
// HTML, and all state changes run the actual embedded script, not a reimplementation.
class Element {
  constructor(tagName, attributes = {}) {
    this.tagName = tagName;
    this.attributes = { ...attributes };
    this.id = attributes.id || '';
    this.className = attributes.class || '';
    this.value = attributes.value || '';
    this.checked = Object.hasOwn(attributes, 'checked');
    this.required = Object.hasOwn(attributes, 'required');
    this.disabled = Object.hasOwn(attributes, 'disabled');
    this.noValidate = Object.hasOwn(attributes, 'novalidate');
    this.style = {};
    this.children = [];
    this.listeners = {};
    this.dataset = Object.fromEntries(Object.entries(attributes)
      .filter(([key]) => key.startsWith('data-'))
      .map(([key, value]) => [key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value]));
    this.classList = {
      contains: (name) => this.className.split(/\s+/).includes(name),
      remove: (name) => { this.className = this.className.split(/\s+/).filter((value) => value !== name).join(' '); },
      toggle: (name, force) => {
        const values = new Set(this.className.split(/\s+/).filter(Boolean));
        const include = force == null ? !values.has(name) : force;
        if (include) values.add(name);
        else values.delete(name);
        this.className = [...values].join(' ');
        return include;
      },
    };
    this._text = '';
  }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
  get href() { return this.getAttribute('href') || ''; }
  set href(value) { this.setAttribute('href', value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  removeChild(child) { this.children = this.children.filter((item) => item !== child); }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  dispatch(name) {
    const event = { defaultPrevented:false, preventDefault() { this.defaultPrevented = true; } };
    for (const callback of this.listeners[name] || []) callback.call(this, event);
    return event;
  }
  descendants() { return this.children.flatMap((child) => [child, ...child.descendants()]); }
  closest(selector) {
    if (selector === '.panel' && this.classList.contains('panel')) return this;
    for (let element = this.parentElement; element; element = element.parentElement) {
      if (selector === '.panel' && element.classList.contains('panel')) return element;
    }
    return null;
  }
  effectivelyDisabled() {
    if (this.disabled) return true;
    for (let element = this.parentElement; element; element = element.parentElement) {
      if (element.disabled) return true;
    }
    return false;
  }
  isInvalidControl() {
    if (!['input', 'textarea', 'select'].includes(this.tagName) || this.effectivelyDisabled()) return false;
    if (this.attributes.type === 'hidden') return false;
    const value = String(this.value);
    if (!value) return this.required;
    if (this.attributes.pattern && !new RegExp('^(?:' + this.attributes.pattern + ')$').test(value)) return true;
    if (this.attributes.minlength && value.length < Number(this.attributes.minlength)) return true;
    return false;
  }
  querySelector(selector) {
    assert.equal(selector, ':invalid', 'Add only DOM selectors actually needed by the production script');
    return this.descendants().find((element) => element.isInvalidControl()) || null;
  }
  checkValidity() { return !this.querySelector(':invalid'); }
  reportValidity() { this.reportedValidity = true; return this.checkValidity(); }
  scrollTo() {}
}

function parseForm(markupHtml = html) {
  const root = new Element('document');
  const stack = [root];
  const markup = markupHtml.replace(/<script>[\s\S]*?<\/script>/g, '')
    .replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<\?=[\s\S]*?\?>/g, 'test-teacher-token');
  for (const token of markup.matchAll(/<\/[^>]+>|<[a-z][^>]*>|[^<]+/gi)) {
    const value = token[0];
    if (value.startsWith('</')) {
      const tagName = value.slice(2, -1).trim().toLowerCase();
      const index = stack.findLastIndex((element) => element.tagName === tagName);
      if (index > 0) stack.length = index;
    } else if (value.startsWith('<')) {
      const [, tagName, rawAttributes] = value.match(/^<([a-z]+)([^>]*)>/i);
      const attributes = {};
      for (const attribute of rawAttributes.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
        attributes[attribute[1]] = attribute[2] ?? attribute[3] ?? attribute[4] ?? '';
      }
      const element = new Element(tagName.toLowerCase(), attributes);
      stack.at(-1).appendChild(element);
      if (!['input', 'meta', 'base', 'link', 'br', 'hr', 'img'].includes(element.tagName)) stack.push(element);
    } else {
      stack.at(-1)._text += value;
    }
  }
  const elements = root.descendants();
  for (const element of elements) {
    if (element.tagName === 'textarea') element.value = element.textContent;
    if (element.tagName === 'select') {
      const option = element.children.find((child) => child.tagName === 'option');
      element.value = option ? (option.getAttribute('value') ?? option.textContent.trim()) : '';
    }
  }
  return elements;
}

const readyData = (settings) => ({
  settings,
  api: { configured:true, verified:true },
  readiness: { distributionReady:true, runtimeReady:true, setupReady:true, checks:[] },
  studentUrl:'https://example.test/student',
  previewUrl:'https://example.test/student?preview=99-999',
});

function createUi(settings, api = { configured:true, verified:true }) {
  const elements = parseForm();
  const byId = (id) => {
    const element = elements.find((item) => item.id === id);
    assert.ok(element, `Production form has #${id}`);
    return element;
  };
  const requests = [];
  const windowEvents = {};
  const timers = [];
  const copied = [];
  const document = {
    body:elements.find((element) => element.tagName === 'body'),
    getElementById:byId,
    createElement: (tagName) => new Element(tagName),
    querySelectorAll: (selector) => {
      if (selector === 'button') return elements.filter((element) => element.tagName === 'button');
      assert.equal(selector, '[data-step]');
      return elements.filter((element) => element.dataset.step);
    },
    querySelector: (selector) => {
      if (selector === 'main') return elements.find((element) => element.tagName === 'main');
      const step = selector.match(/^\[data-step="([^"]+)"\]$/)?.[1];
      assert.ok(step, `Unsupported selector ${selector}`);
      return elements.find((element) => element.dataset.step === step);
    },
  };
  function runner(success, failure) {
    return new Proxy({}, {
      get: (_, method) => {
        if (method === 'withSuccessHandler') return (callback) => runner(callback, failure);
        if (method === 'withFailureHandler') return (callback) => runner(success, callback);
        return (...args) => requests.push({ method, args, success, failure });
      },
    });
  }
  const context = vm.createContext({
    document,
    window: {
      addEventListener: (name, callback) => { windowEvents[name] = callback; },
      setTimeout: (callback) => timers.push(callback),
      confirm: () => true,
    },
    navigator: { clipboard: { writeText: (value) => { copied.push(value); return Promise.resolve(); } } },
    google: { script: { run:runner() } },
  });
  vm.runInContext(source, context, { filename:'TeacherSetup.html' });
  function takeRequest(method) {
    const request = requests.shift();
    assert.equal(request?.method, method);
    assert.equal(request.args[0], 'test-teacher-token');
    return request;
  }
  windowEvents.load();
  takeRequest('getLiteTeacherSetupData').success({ ...readyData(settings), api });
  return {
    byId, context, requests, copied, takeRequest,
    click(id) { if (!byId(id).disabled) byId(id).dispatch('click'); },
    switchTo(enabled) {
      const control = byId('backward-design-enabled');
      if (control.disabled) return;
      control.checked = enabled;
      control.dispatch('change');
    },
    selectMode(mode) {
      const control = byId('activity-mode');
      if (control.disabled) return;
      control.value = mode;
      control.dispatch('change');
    },
    submit() { return byId('setup-form').dispatch('submit'); },
    flushTimers() { while (timers.length) timers.shift()(); },
  };
}

const settings = {
  lessonId:'lesson-existing', appName:'simbot', subject:'국어', grade:'초등 4학년',
  lessonTitle:'근거 있는 의견', lessonGoal:'글의 근거를 설명할 수 있다.',
  achievementStandardCode:'[4국02-04]', achievementStandard:'사실과 의견을 구분한다.',
  assessmentCriteria:'자료의 근거를 들어 자신의 의견을 설명한다.',
  rubricHigh:'둘 이상의 근거로 설명한다.', rubricMeet:'한 가지 근거로 설명한다.',
  rubricDeveloping:'교사의 도움으로 근거를 찾는다.', evidenceDescription:'질문과 답변의 근거',
  materialTitle:'우리 동네 이야기', materialText:'학생이 읽고 자신의 생각과 근거를 찾아 설명할 수 있도록 준비한 충분히 긴 수업자료입니다.',
  materialUrl:'', startQuestion:'어떤 점이 궁금한가요?', joinCode:'482731',
  activityMode:'evaluation', version:'v1',
};

function assertMode(ui, enabled) {
  assert.equal(ui.byId('backward-design-enabled').checked, enabled);
  assert.equal(ui.byId('activity-mode').value, enabled ? 'evaluation' : 'exploration');
  assert.equal(ui.byId('backward-design-fields').disabled, !enabled);
  assert.equal(ui.byId('backward-design-fields').classList.contains('hidden'), !enabled);
  for (const id of Object.keys(designFields)) assert.equal(ui.byId(id).required,
    ['lesson-goal', 'achievement-standard'].includes(id) ? false : enabled, id);
}

function assertLinksDisabled(ui) {
  assert.equal(ui.byId('copy-student-url').disabled, true);
  assert.equal(ui.byId('open-student').getAttribute('aria-disabled'), 'true');
  assert.equal(ui.byId('open-student').getAttribute('href'), null);
}

function assertLinksReady(ui) {
  assert.equal(ui.byId('copy-student-url').disabled, false);
  assert.equal(ui.byId('open-student').getAttribute('aria-disabled'), 'false');
  assert.equal(ui.byId('open-student').href, readyData(settings).previewUrl);
}

const ui = createUi(settings);
assert.equal(ui.byId('backward-design-enabled').classList.contains('hidden'), true);
assert.equal(ui.byId('api-settings').open, false, 'Verified AI settings stay collapsed');
assert.equal(ui.byId('panel-design').classList.contains('active'), true, 'Compact setup opens on lesson settings');
assert.equal((html.match(/<button[^>]+data-step="/g) || []).length, 3, 'Keep the three-step teacher setup');
assert.equal(html.includes('1차시에서 학생으로 체험한'), false, 'Do not restore the removed training banner');
assert.equal(ui.byId('setup-form').noValidate, true, 'Custom validation must be able to reveal hidden wizard panels');
assertMode(ui, true);
assertLinksReady(ui);
for (const enabled of [false, true, false, true, false]) {
  ui.switchTo(enabled);
  assertMode(ui, enabled);
  for (const [id, key] of Object.entries(designFields)) assert.equal(ui.byId(id).value, settings[key]);
  assert.equal(ui.byId('standard-code').value, settings.achievementStandardCode);
}
assertLinksDisabled(ui);
ui.click('refresh-readiness');
ui.takeRequest('getLiteTeacherSetupData').success(readyData(settings));
assertMode(ui, false);
assertLinksDisabled(ui);
ui.context.copyStudentUrl();
assert.equal(ui.copied.length, 0, 'Unsaved mode must never copy the old student link');

assert.equal(ui.submit().defaultPrevented, true);
const save = ui.takeRequest('saveLiteTeacherSetup');
const savedPayload = JSON.parse(JSON.stringify(save.args[1]));
assert.equal(savedPayload.activityMode, 'exploration');
for (const key of Object.values(designFields)) assert.equal(savedPayload[key], settings[key], key);
assert.equal(savedPayload.achievementStandardCode, settings.achievementStandardCode);
assert.equal(ui.byId('backward-design-enabled').disabled, true);
assert.equal(ui.byId('activity-mode').disabled, true);
assert.equal(ui.byId('save-setup').disabled, true);
ui.switchTo(true);
ui.selectMode('evaluation');
assertMode(ui, false);
save.success({ ...readyData(savedPayload), lessonId:settings.lessonId, message:'저장했습니다.' });
assert.equal(ui.byId('backward-design-enabled').disabled, false);
assert.equal(ui.byId('activity-mode').disabled, false);
assertLinksReady(ui);

const reopened = createUi(savedPayload);
assertMode(reopened, false);
reopened.switchTo(true);
assertMode(reopened, true);
for (const [id, key] of Object.entries(designFields)) assert.equal(reopened.byId(id).value, settings[key]);
reopened.selectMode('exploration');
assertMode(reopened, false);
reopened.selectMode('evaluation');
assertMode(reopened, true);
assertLinksDisabled(reopened);

const emptyDesign = Object.fromEntries(Object.values(designFields).map((key) => [key, '']));
reopened.context.fillData(readyData({ ...settings, ...emptyDesign, achievementStandardCode:'', activityMode:'exploration' }));
assertMode(reopened, false);
for (const id of Object.keys(designFields)) assert.equal(reopened.byId(id).value, '', 'Server blanks must replace stale inputs');
assert.equal(reopened.byId('standard-code').value, '');
assert.equal(reopened.byId('setup-form').checkValidity(), true, 'Exploration accepts an empty backward design');
reopened.submit();
const emptySave = reopened.takeRequest('saveLiteTeacherSetup');
assert.equal(emptySave.args[1].activityMode, 'exploration');
assert.equal(emptySave.args[1].lessonGoal, '');
emptySave.failure({ message:'일시적인 저장 실패' });
assert.equal(reopened.byId('backward-design-enabled').disabled, false);
assert.equal(reopened.byId('activity-mode').disabled, false);

reopened.switchTo(true);
reopened.context.showStep(3);
assert.equal(reopened.byId('panel-check').classList.contains('active'), true);
reopened.submit();
reopened.flushTimers();
assert.equal(reopened.requests.length, 0, 'Evaluation cannot save without its required design');
assert.equal(reopened.byId('panel-design').classList.contains('active'), true);
assert.equal(reopened.byId('setup-form').reportedValidity, true);
assert.match(reopened.byId('form-status').textContent, /필수 항목/);
assertLinksDisabled(reopened);

const fourSettings = { ...settings, rubricScheme:'four_levels', rubricGood:'근거와 의견을 연결한다.' };
const fourUi = createUi(fourSettings);
assert.equal(fourUi.byId('rubric-high-label').textContent, '매우잘함');
assert.equal(fourUi.byId('rubric-meet-label').textContent, '보통');
assert.equal(fourUi.byId('rubric-developing-label').textContent, '노력요함');
assert.equal(fourUi.byId('rubric-good').required, true);
assert.equal(fourUi.byId('rubric-good-field').classList.contains('hidden'), false);
fourUi.switchTo(false);
assert.equal(fourUi.byId('rubric-good').required, false);
assert.equal(fourUi.byId('rubric-good').value, fourSettings.rubricGood);
fourUi.switchTo(true);
assert.equal(fourUi.byId('rubric-good').required, true);
fourUi.byId('rubric-good').value = '';
fourUi.submit();
assert.equal(fourUi.requests.length, 0, 'Four-level saving requires the good level');
fourUi.byId('rubric-good').value = fourSettings.rubricGood;
fourUi.submit();
const fourSave = fourUi.takeRequest('saveLiteTeacherSetup');
assert.equal(fourSave.args[1].rubricScheme, 'four_levels');
assert.equal(fourSave.args[1].rubricGood, fourSettings.rubricGood);
fourSave.failure({ message:'테스트 저장 중단' });

const legacyUi = createUi(settings);
assert.equal(legacyUi.byId('rubric-scheme').value, 'legacy_three', 'Existing data without a scheme keeps the three original levels');
assert.equal(legacyUi.byId('rubric-high-label').textContent, '도달');
assert.equal(legacyUi.byId('rubric-good').required, false);
assert.equal(legacyUi.byId('rubric-good').disabled, true);
assert.equal(createUi({}).byId('rubric-scheme').value, 'four_levels', 'New blank setups default to four levels');
assert.equal(createUi({}).byId('save-state').textContent, '미저장 변경 있음', 'Generated form defaults are not treated as persisted settings');

const draft = {
  rubricScheme:'four_levels', assessmentCriteria:'자료의 근거와 자신의 생각을 연결한다.',
  rubricHigh:'여러 근거를 정확하게 연결해 독립적으로 설명한다.',
  rubricGood:'적절한 근거를 들어 생각을 설명한다.',
  rubricMeet:'안내를 참고해 근거와 생각을 일부 연결한다.',
  rubricDeveloping:'함께 읽으며 관련 근거를 찾는 연습이 필요하다.',
  evidenceDescription:'질문, 근거 설명, 자신의 의견과 이유',
};
const draftUi = createUi({ ...settings, materialText:'', lessonGoal:'', achievementStandard:'사실과 의견을 구분한다.' });
assert.equal(draftUi.byId('generate-assessment').disabled, false, 'A standard alone enables drafting, even with no material');
draftUi.click('generate-assessment');
const draftRequest = draftUi.takeRequest('generateLiteAssessmentDraft');
assert.equal(draftRequest.args[1].materialText, '');
assert.equal(Object.hasOwn(draftRequest.args[1], 'joinCode'), false, 'Participation codes are not draft inputs');
assert.equal(Object.hasOwn(draftRequest.args[1], 'apiKey'), false, 'Client does not send an API key');
assert.equal(draftUi.byId('generate-assessment').disabled, true);
assert.equal(draftUi.byId('save-setup').disabled, true, 'No save can race with an AI request');
draftUi.click('generate-assessment');
assert.equal(draftUi.requests.length, 0, 'Busy clicks do not duplicate paid requests');
draftUi.submit();
assert.equal(draftUi.requests.length, 0, 'Enter submission cannot race with draft generation');
draftRequest.success({ ok:true, draft });
assert.equal(draftUi.byId('assessment-criteria').value, settings.assessmentCriteria, 'Generation does not overwrite the form');
assert.equal(draftUi.byId('rubric-scheme').value, 'legacy_three', 'Generation does not silently relabel existing levels');
assert.equal(draftUi.byId('assessment-draft').classList.contains('hidden'), false);
assert.equal(draftUi.byId('apply-assessment-draft').disabled, false);
draftUi.click('apply-assessment-draft');
for (const [key, value] of Object.entries(draft)) {
  const id = { rubricScheme:'rubric-scheme', rubricGood:'rubric-good', ...Object.fromEntries(Object.entries(designFields).map(([id, key]) => [key, id])) }[key];
  assert.equal(draftUi.byId(id).value, value, key);
}
assert.equal(draftUi.byId('lesson-goal').value, '', 'Apply preserves the teacher goal');
assert.equal(draftUi.byId('achievement-standard').value, settings.achievementStandard, 'Apply preserves the teacher standard');
assert.equal(draftUi.byId('material-text').value, '', 'Apply does not invent source material');
assert.equal(draftUi.requests.length, 0, 'Apply never autosaves settings');
assert.equal(draftUi.byId('apply-assessment-draft').disabled, true);
assert.equal(draftUi.byId('save-state').textContent, '미저장 변경 있음');
assertLinksDisabled(draftUi);
draftUi.click('refresh-readiness');
draftUi.takeRequest('getLiteTeacherSetupData').success(readyData(settings));
assertLinksDisabled(draftUi);
assert.equal(draftUi.byId('assessment-criteria').value, draft.assessmentCriteria, 'Readiness refresh must preserve an applied but unsaved draft');

const goalOnlyUi = createUi({ ...settings, achievementStandard:'', materialText:'' });
assert.equal(goalOnlyUi.byId('generate-assessment').disabled, false);
const noGoalUi = createUi({ ...settings, lessonGoal:'', achievementStandard:'' });
assert.equal(noGoalUi.byId('generate-assessment').disabled, true);
noGoalUi.submit();
assert.equal(noGoalUi.requests.length, 0, 'Evaluation saving requires either a goal or standard');
assert.match(noGoalUi.byId('form-status').textContent, /목표 또는 성취기준/);
for (const missingField of ['lessonGoal', 'achievementStandard']) {
  const oneGoalUi = createUi({ ...settings, [missingField]:'' });
  oneGoalUi.submit();
  assert.equal(oneGoalUi.takeRequest('saveLiteTeacherSetup').args[1][missingField], '', 'Saving does not require teachers to invent a missing official standard or goal');
}
const noApiUi = createUi(settings, { configured:true, verified:false });
assert.equal(noApiUi.byId('generate-assessment').disabled, true);
assert.equal(noApiUi.byId('api-settings').open, true, 'Unverified AI settings remain discoverable');
noApiUi.click('generate-assessment');
assert.equal(noApiUi.requests.length, 0);
goalOnlyUi.switchTo(false);
assert.equal(goalOnlyUi.byId('generate-assessment').disabled, true);

for (const editPhase of ['pending', 'preview']) {
  const staleUi = createUi(settings);
  staleUi.click('generate-assessment');
  const request = staleUi.takeRequest('generateLiteAssessmentDraft');
  if (editPhase === 'preview') request.success({ ok:true, draft });
  staleUi.byId('lesson-goal').value = '목표 수정';
  staleUi.byId('lesson-goal').dispatch('input');
  staleUi.byId('lesson-goal').value = settings.lessonGoal;
  staleUi.byId('lesson-goal').dispatch('input');
  if (editPhase === 'pending') request.success({ ok:true, draft });
  staleUi.click('apply-assessment-draft');
  assert.equal(staleUi.byId('assessment-draft').classList.contains('hidden'), true, editPhase);
  assert.equal(staleUi.byId('assessment-criteria').value, settings.assessmentCriteria, 'Edited and reverted inputs still invalidate the draft');
}

const failureUi = createUi(settings);
failureUi.click('generate-assessment');
failureUi.takeRequest('generateLiteAssessmentDraft').failure({ message:'<img src=x onerror=alert(1)> 연결 실패' });
assert.equal(failureUi.byId('assessment-ai-status').textContent, '<img src=x onerror=alert(1)> 연결 실패');
assert.equal(failureUi.byId('assessment-ai-status').children.length, 0, 'Errors are text, never HTML');
assert.equal(failureUi.byId('generate-assessment').disabled, false);
failureUi.click('generate-assessment');
failureUi.takeRequest('generateLiteAssessmentDraft').success({ ok:true, draft:{ ...draft, rubricGood:'' } });
assert.equal(failureUi.byId('apply-assessment-draft').disabled, true, 'Incomplete drafts are rejected');
failureUi.click('generate-assessment');
failureUi.takeRequest('generateLiteAssessmentDraft').success({ ok:true, draft:{ ...draft, assessmentCriteria:'<b>근거 확인</b>' } });
assert.ok(failureUi.byId('assessment-draft-content').textContent.includes('<b>근거 확인</b>'));
assert.ok(failureUi.byId('assessment-draft-content').children.every((node) => node.children.length === 0), 'Draft content is plain text');

const urlUi = createUi(settings);
assert.equal(urlUi.byId('save-state').textContent, '저장된 설정');
urlUi.byId('confirmed-student-url').value = 'https://example.test/not-a-deployment';
urlUi.click('save-student-url');
assert.equal(urlUi.requests.length, 0, 'Deployment URL management keeps validation');
urlUi.byId('confirmed-student-url').value = 'https://script.google.com/macros/s/example-test/exec';
urlUi.click('save-student-url');
const urlSave = urlUi.takeRequest('saveLiteStudentUrlForTeacher');
assert.equal(urlSave.args[1], 'https://script.google.com/macros/s/example-test/exec');
urlSave.success({ ...readyData(settings), confirmedStudentUrl:urlSave.args[1] });

const dirtyUi = createUi(settings);
dirtyUi.byId('lesson-title').value = '수업명 변경';
dirtyUi.byId('lesson-title').dispatch('input');
assert.equal(dirtyUi.byId('save-state').textContent, '미저장 변경 있음');
assertLinksDisabled(dirtyUi);
dirtyUi.submit();
const dirtySave = dirtyUi.takeRequest('saveLiteTeacherSetup');
dirtySave.success({ ...readyData(dirtySave.args[1]), lessonId:settings.lessonId });
assert.equal(dirtyUi.byId('save-state').textContent, '저장된 설정');
assertLinksReady(dirtyUi);

const readinessUi = createUi({ ...fourSettings, achievementStandard:'' });
readinessUi.context.renderReadiness({ setupReady:true, runtimeReady:true, distributionReady:true,
  checks:[{ key:'backwardDesign', label:'평가 설계', state:'pass' }],
}, readyData(settings).studentUrl, readyData(settings).previewUrl);
assert.equal(readinessUi.byId('readiness-list').children[0].dataset.state, 'pass', 'Readiness accepts goal-only evaluation');
readinessUi.byId('rubric-good').value = '';
readinessUi.byId('rubric-good').dispatch('input');
assert.equal(readinessUi.byId('readiness-list').children[0].dataset.state, 'block', 'Local readiness requires all four selected levels');
assertLinksDisabled(readinessUi);

const refreshRaceUi = createUi(settings);
refreshRaceUi.click('refresh-readiness');
const outdatedRefresh = refreshRaceUi.takeRequest('getLiteTeacherSetupData');
refreshRaceUi.byId('lesson-title').value = '새로운 수업명';
refreshRaceUi.byId('lesson-title').dispatch('input');
refreshRaceUi.submit();
const raceSave = refreshRaceUi.takeRequest('saveLiteTeacherSetup');
raceSave.success({ ...readyData(raceSave.args[1]), lessonId:settings.lessonId,
  readiness:{ distributionReady:false, runtimeReady:true, setupReady:true, checks:[] } });
outdatedRefresh.success(readyData(settings));
assert.equal(refreshRaceUi.byId('copy-student-url').disabled, true, 'A pre-save refresh cannot restore old distribution approval');

const dashboardHtml = fs.readFileSync(path.join(__dirname, '..', 'gas-lite', 'TeacherDashboard.html'), 'utf8');
const dashboardElements = parseForm(dashboardHtml);
const dashboardById = (id) => dashboardElements.find((element) => element.id === id);
const dashboardContext = vm.createContext({
  document:{
    body:dashboardElements.find((element) => element.tagName === 'body'),
    getElementById:dashboardById, createElement:(tag) => new Element(tag),
    createTextNode:(text) => { const node = new Element('text'); node.textContent = text; return node; },
  },
  window:{ addEventListener() {} },
});
vm.runInContext(dashboardHtml.match(/<script>([\s\S]*?)<\/script>/)[1], dashboardContext);
dashboardContext.renderDashboard({
  lesson:fourSettings, evaluations:[
    { studentCode:'99-991', rubricScheme:'four_levels', teacherDecision:'잘함' },
    { studentCode:'99-992', rubricScheme:'legacy_three', teacherDecision:'성장 중' },
  ],
});
assert.equal(dashboardById('rubric-high-label').textContent, '매우잘함');
assert.equal(dashboardById('rubric-good-field').classList.contains('hidden'), false);
const cards = dashboardById('evaluations').children;
const decisionChoices = (card) => card.descendants().find((element) => element.dataset.field === 'teacherDecision').children.map((option) => option.value);
assert.deepEqual(decisionChoices(cards[0]), ['판단 보류','매우잘함','잘함','보통','노력요함']);
assert.deepEqual(decisionChoices(cards[1]), ['판단 보류','도달','성장 중','도움 필요'], 'Historical evaluation rows keep their own levels');
dashboardContext.renderDashboard({ lesson:settings });
assert.equal(dashboardById('rubric-high-label').textContent, '도달');
assert.equal(dashboardById('rubric-good-field').classList.contains('hidden'), true);

console.log('GAS lite teacher UI: mode gates, four/legacy levels, AI preview/apply, stale requests, and dashboard judgments passed');
