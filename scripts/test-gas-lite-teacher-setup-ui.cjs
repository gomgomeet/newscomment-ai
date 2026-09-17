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
  set innerHTML(_value) { assert.fail('Teacher and student data must be rendered as text, never executable HTML'); }
  get href() { return this.getAttribute('href') || ''; }
  set href(value) { this.setAttribute('href', value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  removeChild(child) { this.children = this.children.filter((item) => item !== child); }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  dispatch(name) {
    const event = { target:this, defaultPrevented:false, preventDefault() { this.defaultPrevented = true; } };
    const propagationPath = [this];
    for (let ancestor = this.parentElement; ancestor; ancestor = ancestor.parentElement) propagationPath.push(ancestor);
    for (const element of propagationPath) {
      event.currentTarget = element;
      for (const callback of element.listeners[name] || []) callback.call(element, event);
    }
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
    if (this.attributes.type === 'checkbox') return this.required && !this.checked;
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
  focus() { this.focused = true; }
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
      const [, tagName, rawAttributes] = value.match(/^<([a-z][a-z0-9]*)([^>]*)>/i);
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

// Use the real server readiness rules. An empty checks array would let a stale
// evaluation report survive every toggle test without being noticed.
const readinessContext = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'gas-lite', 'SetupService.js'), 'utf8'),
  readinessContext, { filename:'SetupService.js' });
const readyData = (settings, context = {}) => ({
  settings,
  api: { configured:true, verified:true },
  readiness:readinessContext.buildLiteReadiness_(settings, {
    apiConfigured:true, apiVerified:true, engineConfigured:true, engineVerified:true,
    previewVerified:true, lessonOpen:true, studentUrl:'https://example.test/student', ...context,
  }),
  studentUrl:'https://example.test/student',
  previewUrl:'https://example.test/student?preview=99-999',
});

function createUi(settings, initialDataOrApi = readyData(settings)) {
  const initialData = initialDataOrApi && Object.hasOwn(initialDataOrApi, 'settings')
    ? initialDataOrApi
    : { ...readyData(settings), api:initialDataOrApi };
  const elements = parseForm();
  const liveElements = () => [elements[0], ...elements[0].descendants()];
  const byId = (id) => {
    const element = liveElements().find((item) => item.id === id);
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
      if (selector === 'button') return liveElements().filter((element) => element.tagName === 'button');
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
  takeRequest('getLiteTeacherSetupData').success(initialData);
  return {
    byId, context, requests, copied, takeRequest,
    click(id) { if (!byId(id).effectivelyDisabled()) byId(id).dispatch('click'); },
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
    edit(id, value) {
      byId(id).value = value;
      byId(id).dispatch('input');
    },
    check(id, checked) {
      if (byId(id).effectivelyDisabled()) return;
      byId(id).checked = checked;
      // Native checkbox activation fires input before change. The approval
      // control must keep its new checked state until its change validator runs.
      byId(id).dispatch('input');
      byId(id).dispatch('change');
    },
    select(id, value) {
      if (byId(id).effectivelyDisabled()) return;
      byId(id).value = value;
      byId(id).dispatch('input');
      byId(id).dispatch('change');
    },
    submit() { return byId('setup-form').dispatch('submit'); },
    flushTimers() { while (timers.length) timers.shift()(); },
  };
}

const settings = {
  lessonId:'lesson-existing', appName:'simbot', subject:'국어', grade:'초등 4학년',
  lessonTitle:'근거 있는 의견', lessonGoal:'글의 근거를 설명할 수 있다.',
  achievementStandardCode:'[4국02-04]', achievementStandard:'[4국02-04] 사실과 의견을 구분한다.',
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

function readinessItem(ui, label) {
  const item = ui.byId('readiness-list').children.find((entry) =>
    entry.children.some((child) => child.tagName === 'strong' && child.textContent.includes(label)));
  assert.ok(item, `Step 4 shows the ${label} readiness check`);
  return item;
}

function assertDraft(ui) {
  assert.notEqual(ui.byId('readiness-badge').textContent, '학생 배포 준비 완료',
    'Unsaved settings must not be represented as the deployed lesson');
  assert.match(ui.byId('readiness-badge').textContent, /저장/);
  assert.match(ui.byId('readiness-summary').textContent, /저장/);
  assert.equal(ui.byId('readiness-badge').classList.contains('pass'), false);
  assertLinksDisabled(ui);
}

function assertBackwardReadiness(ui, enabled, complete = true) {
  const item = readinessItem(ui, '백워드 평가 설계');
  assert.equal(item.dataset.state, !enabled || complete ? 'pass' : 'block');
  assert.match(item.textContent, enabled ? (complete ? /준비|완료/ : /필수|입력/) : /사용 안 함/);
  const mode = readinessItem(ui, '운영 모드');
  assert.equal(mode.dataset.state, 'pass');
  assert.match(mode.textContent, enabled ? /평가모드/ : /자료 탐색모드/);
}

// Regression: switching off a partially configured saved evaluation lesson must
// immediately update step 4, without pretending that the draft is already saved.
const missingDesign = Object.fromEntries(Object.values(designFields).map((key) => [key, '']));
const incompleteSettings = { ...settings, ...missingDesign };
const oldEvaluationReport = readyData(incompleteSettings);
const originalReportJson = JSON.stringify(oldEvaluationReport);
const draftUi = createUi(incompleteSettings, oldEvaluationReport);
assertBackwardReadiness(draftUi, true, false);
draftUi.switchTo(false);
draftUi.context.showStep(3);
assertBackwardReadiness(draftUi, false);
assertDraft(draftUi);
assert.equal(JSON.stringify(oldEvaluationReport), originalReportJson, 'Rendering must not mutate the saved report');
draftUi.click('refresh-readiness');
draftUi.takeRequest('getLiteTeacherSetupData').success(oldEvaluationReport);
assertMode(draftUi, false);
assertBackwardReadiness(draftUi, false);
assertDraft(draftUi);
assert.equal(JSON.stringify(oldEvaluationReport), originalReportJson, 'Refresh must not mutate server state');
draftUi.switchTo(true);
assertBackwardReadiness(draftUi, true, false);
assert.equal(draftUi.byId('readiness-badge').textContent, '필수 설정 필요');
draftUi.switchTo(false);
draftUi.submit();
const failedDraftSave = draftUi.takeRequest('saveLiteTeacherSetup');
failedDraftSave.failure({ message:'일시적인 저장 실패' });
assertBackwardReadiness(draftUi, false);
assertDraft(draftUi);
draftUi.submit();
const successfulDraftSave = draftUi.takeRequest('saveLiteTeacherSetup');
const storedExploration = { ...incompleteSettings, activityMode:'exploration' };
successfulDraftSave.success({ ...readyData(storedExploration), lessonId:settings.lessonId, message:'저장했습니다.' });
assertBackwardReadiness(draftUi, false);
assert.equal(draftUi.byId('readiness-badge').textContent, '학생 배포 준비 완료');
assertLinksReady(draftUi);

// Match the reported screenshot: a new lesson can have verified connections
// while its persisted mode, material, code, and backward design are still blank.
const newLessonSettings = { ...incompleteSettings, activityMode:'', materialText:'', joinCode:'' };
const newLessonUi = createUi(newLessonSettings);
newLessonUi.switchTo(false);
newLessonUi.context.showStep(3);
assertBackwardReadiness(newLessonUi, false);
assertDraft(newLessonUi);
assert.equal(readinessItem(newLessonUi, '수업자료').dataset.state, 'block');
assert.match(newLessonUi.byId('join-code').value, /^\d{6}$/);
assert.equal(readinessItem(newLessonUi, '학생 참여코드').dataset.state, 'pass',
  'The generated unsaved code is displayed as current input, with the global save-required warning');
newLessonUi.edit('join-code', '');
assert.equal(readinessItem(newLessonUi, '학생 참여코드').dataset.state, 'block');
assert.equal(readinessItem(newLessonUi, '개인 API 연결 확인').dataset.state, 'pass');
assert.equal(readinessItem(newLessonUi, '기존 챗봇 연결 확인').dataset.state, 'pass');

const ui = createUi(settings);
assert.equal(ui.byId('backward-design-enabled').classList.contains('hidden'), true);
assert.equal(ui.byId('api-settings').open, false, 'Verified AI settings stay collapsed');
assert.equal(ui.byId('panel-design').classList.contains('active'), true, 'Compact setup opens on lesson settings');
assert.equal((html.match(/<button[^>]+data-step="/g) || []).length, 4, 'Keep the goal → material → assessment → save sequence');
assert.equal(html.includes('1차시에서 학생으로 체험한'), false, 'Do not restore the removed training banner');
assert.equal(ui.byId('setup-form').noValidate, true, 'Custom validation must be able to reveal hidden wizard panels');
assert.equal(ui.byId('lesson-goal').closest('.panel').id, 'panel-design');
assert.equal(ui.byId('achievement-standard').closest('.panel').id, 'panel-design');
assert.equal(ui.byId('material-text').closest('.panel').id, 'panel-material');
for (const id of ['generate-assessment', 'start-question', 'expected-answer', 'assessment-evidence', 'answer-examples', 'assessment-criteria']) {
  assert.equal(ui.byId(id).closest('.panel').id, 'panel-assessment', `${id} comes after material input`);
}
assert.equal(ui.byId('standard-code').getAttribute('type'), 'hidden', 'Achievement standard is a single visible field');
assert.equal((html.match(/id="start-question"/g) || []).length, 1, 'One main assessment question is also the student start question');
assert.equal(ui.byId('generate-assessment').textContent, 'AI로 질문·평가기준 생성');
assert.equal(ui.byId('apply-assessment-draft').textContent, '아래 입력란에 적용');
const previewChildren = ui.byId('assessment-draft').children;
assert.ok(previewChildren.indexOf(ui.byId('apply-assessment-draft')) < previewChildren.indexOf(ui.byId('assessment-draft-content')), 'Apply is visible before a long preview');
assert.match(ui.byId('expected-answer').getAttribute('placeholder'), /AI 초안을 적용하면/);
assert.match(ui.byId('assessment-evidence').getAttribute('placeholder'), /지문에서 가져온 실제 근거 문장/);
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
assert.equal(reopened.byId('panel-assessment').classList.contains('active'), true);
assert.equal(reopened.byId('setup-form').reportedValidity, true);
assert.match(reopened.byId('form-status').textContent, /필수 항목/);
assertLinksDisabled(reopened);

// Other form edits must also block old lesson links, and reverting exactly to
// the captured saved form restores the server's authoritative ready state.
const editedUi = createUi(settings);
editedUi.edit('lesson-title', '저장 전 새 수업명');
assertDraft(editedUi);
editedUi.context.copyStudentUrl();
assert.equal(editedUi.copied.length, 0);
editedUi.click('refresh-readiness');
editedUi.takeRequest('getLiteTeacherSetupData').success(readyData(settings));
assert.equal(editedUi.byId('lesson-title').value, '저장 전 새 수업명', 'Refresh must keep unsaved text');
assertDraft(editedUi);
editedUi.edit('lesson-title', settings.lessonTitle);
assert.equal(editedUi.byId('readiness-badge').textContent, '학생 배포 준비 완료');
assertLinksReady(editedUi);

// Text fields remain editable during a save. Its success may acknowledge only
// the captured request, never text entered after the request was dispatched.
editedUi.edit('lesson-title', '이번 요청에서 저장할 수업명');
editedUi.submit();
const inFlightSave = editedUi.takeRequest('saveLiteTeacherSetup');
const inFlightPayload = JSON.parse(JSON.stringify(inFlightSave.args[1]));
editedUi.edit('material-title', '저장 응답 전에 추가한 제목');
inFlightSave.success({ ...readyData(inFlightPayload), lessonId:settings.lessonId, message:'저장했습니다.' });
assert.equal(editedUi.byId('material-title').value, '저장 응답 전에 추가한 제목');
assertDraft(editedUi);
editedUi.submit();
const latestSave = editedUi.takeRequest('saveLiteTeacherSetup');
const latestPayload = JSON.parse(JSON.stringify(latestSave.args[1]));
latestSave.success({ ...readyData(latestPayload), lessonId:settings.lessonId, message:'저장했습니다.' });
assert.equal(editedUi.byId('readiness-badge').textContent, '학생 배포 준비 완료');
assertLinksReady(editedUi);

// A response from a refresh requested before saving must not overwrite the
// newer saved result, nor surface its obsolete error after success.
const raceUi = createUi(incompleteSettings);
raceUi.switchTo(false);
raceUi.click('refresh-readiness');
const staleRefresh = raceUi.takeRequest('getLiteTeacherSetupData');
raceUi.submit();
const raceSave = raceUi.takeRequest('saveLiteTeacherSetup');
raceSave.success({ ...readyData(storedExploration), lessonId:settings.lessonId, message:'새 설정을 저장했습니다.' });
staleRefresh.success(readyData(incompleteSettings));
assertBackwardReadiness(raceUi, false);
assert.equal(raceUi.byId('readiness-badge').textContent, '학생 배포 준비 완료');
assert.equal(raceUi.byId('form-status').textContent, '새 설정을 저장했습니다.');
assertLinksReady(raceUi);
staleRefresh.failure({ message:'이전 요청의 만료 오류' });
assert.equal(raceUi.byId('form-status').textContent, '새 설정을 저장했습니다.');

// Likewise, only the most recently requested readiness refresh can win.
raceUi.click('refresh-readiness');
const olderRefresh = raceUi.takeRequest('getLiteTeacherSetupData');
raceUi.click('refresh-readiness');
const newerRefresh = raceUi.takeRequest('getLiteTeacherSetupData');
newerRefresh.success(readyData(storedExploration));
olderRefresh.success(readyData(storedExploration, { previewVerified:false }));
assert.equal(raceUi.byId('readiness-badge').textContent, '학생 배포 준비 완료');
assertLinksReady(raceUi);

// First-save lesson IDs come from the server and are part of the new baseline,
// not a spurious dirty change made after the request.
const firstSaveUi = createUi({ ...settings, lessonId:'' });
firstSaveUi.submit();
const firstSave = firstSaveUi.takeRequest('saveLiteTeacherSetup');
firstSave.success({ ...readyData(settings), lessonId:settings.lessonId, message:'새 수업을 저장했습니다.' });
assert.equal(firstSaveUi.byId('lesson-id').value, settings.lessonId);
assert.equal(firstSaveUi.byId('readiness-badge').textContent, '학생 배포 준비 완료');
assertLinksReady(firstSaveUi);

const planFixture = {
  schemaVersion:1, approved:true, criteria:[{
    id:'reading-evidence', criterion:'자료에서 근거를 찾아 설명하기', responseKind:'explanation',
    mainQuestion:'글에서 근거를 하나 찾아 설명해 줄래요?',
    followUpQuestion:'그 생각의 근거가 되는 구절을 인용해 줄래요?',
    evidenceDescription:'학생이 찾은 자료 구절과 자기 말로 한 설명',
    sourceQuote:'자신의 생각과 근거를 찾아 설명', requireSourceEvidence:true,
  }],
};
const planSettings = { ...settings, assessmentPlanJson:JSON.stringify(planFixture) };
const readPlan = (ui) => JSON.parse(ui.context.collectPayload().assessmentPlanJson);
const criterionField = (id, key) => 'criterion-' + id + '-' + key;
const assertPlanApproval = (ui, expected) => {
  assert.equal(readPlan(ui).approved, expected);
  assert.equal(ui.byId('assessment-plan-approved').checked, expected);
};

// Legacy lessons remain valid while making the missing criterion plan explicit.
const legacyPlanUi = createUi(settings);
assert.match(legacyPlanUi.byId('assessment-plan-status').textContent, /기준별 질문계획 없음/);
assert.equal(legacyPlanUi.byId('assessment-plan-approved').disabled, true);
assert.equal(readinessItem(legacyPlanUi, '평가기준별 질문계획').dataset.state, 'pass');
assert.deepEqual(readPlan(legacyPlanUi), { schemaVersion:1, approved:false, criteria:[] });
assertLinksReady(legacyPlanUi);

// Empty fields are allowed in drafts, never in an approved plan.
legacyPlanUi.click('add-assessment-criterion');
assert.equal(readPlan(legacyPlanUi).criteria.length, 1);
assert.equal(legacyPlanUi.byId(criterionField('criterion-1', 'criterion')).focused, true);
assertPlanApproval(legacyPlanUi, false);
assert.equal(readinessItem(legacyPlanUi, '평가기준별 질문계획').dataset.state, 'block');
legacyPlanUi.check('assessment-plan-approved', true);
assertPlanApproval(legacyPlanUi, false);
assert.match(legacyPlanUi.byId('form-status').textContent, /모든 내용/);
legacyPlanUi.submit();
const draftPlanSave = legacyPlanUi.takeRequest('saveLiteTeacherSetup');
const draftPlanPayload = JSON.parse(JSON.stringify(draftPlanSave.args[1]));
assert.equal(JSON.parse(draftPlanPayload.assessmentPlanJson).criteria[0].criterion, '');
draftPlanSave.success({ ...readyData(draftPlanPayload), lessonId:settings.lessonId });
assertLinksDisabled(legacyPlanUi);
assert.match(legacyPlanUi.byId('readiness-badge').textContent, /승인 필요/);

// Complete forms require one terminal question mark and a verbatim source hint.
const newCriterion = { ...planFixture.criteria[0], id:'criterion-1' };
for (const key of ['criterion', 'mainQuestion', 'followUpQuestion', 'evidenceDescription', 'sourceQuote']) {
  legacyPlanUi.edit(criterionField('criterion-1', key), newCriterion[key]);
}
legacyPlanUi.check(criterionField('criterion-1', 'requireSourceEvidence'), true);
legacyPlanUi.edit(criterionField('criterion-1', 'mainQuestion'), '무엇인가요? 왜인가요?');
legacyPlanUi.check('assessment-plan-approved', true);
assertPlanApproval(legacyPlanUi, false);
assert.match(legacyPlanUi.byId('form-status').textContent, /물음표 하나/);
legacyPlanUi.edit(criterionField('criterion-1', 'mainQuestion'), newCriterion.mainQuestion);
legacyPlanUi.edit(criterionField('criterion-1', 'sourceQuote'), '자료에 없는 구절');
legacyPlanUi.check('assessment-plan-approved', true);
assertPlanApproval(legacyPlanUi, false);
assert.match(legacyPlanUi.byId('form-status').textContent, /본문에서 그대로/);
legacyPlanUi.edit(criterionField('criterion-1', 'sourceQuote'), '자신의   생각과\n근거를 찾아 설명');
legacyPlanUi.check('assessment-plan-approved', true);
assertPlanApproval(legacyPlanUi, true);
assertDraft(legacyPlanUi);
legacyPlanUi.submit();
const approvedSave = legacyPlanUi.takeRequest('saveLiteTeacherSetup');
const approvedPayload = JSON.parse(JSON.stringify(approvedSave.args[1]));
assert.equal(JSON.parse(approvedPayload.assessmentPlanJson).approved, true);
approvedSave.success({ ...readyData(approvedPayload), lessonId:settings.lessonId });
assertLinksReady(legacyPlanUi);
const reopenedPlanUi = createUi(approvedPayload);
assert.deepEqual(readPlan(reopenedPlanUi), JSON.parse(approvedPayload.assessmentPlanJson));
assertPlanApproval(reopenedPlanUi, true);
assert.equal(reopenedPlanUi.byId('assessment-plan-preview-list').children.length, 1);
reopenedPlanUi.check('assessment-plan-approved', false);
assertPlanApproval(reopenedPlanUi, false);
assertDraft(reopenedPlanUi);
reopenedPlanUi.check('assessment-plan-approved', true);
assertPlanApproval(reopenedPlanUi, true);
assertLinksReady(reopenedPlanUi);

// OFF/ON never destroys or unapproves a reviewed plan; source edits always do.
const preservationUi = createUi(planSettings);
preservationUi.switchTo(false);
assertPlanApproval(preservationUi, true);
assert.equal(readinessItem(preservationUi, '평가기준별 질문계획').dataset.state, 'pass');
preservationUi.switchTo(true);
assert.deepEqual(readPlan(preservationUi), planFixture);
assertLinksReady(preservationUi);
preservationUi.edit('material-text', settings.materialText + ' 추가 수업자료입니다.');
assertPlanApproval(preservationUi, false);
preservationUi.click('refresh-readiness');
preservationUi.takeRequest('getLiteTeacherSetupData').success(readyData(planSettings));
assertPlanApproval(preservationUi, false);
assertDraft(preservationUi);
preservationUi.switchTo(false);
assert.equal(readinessItem(preservationUi, '평가기준별 질문계획').dataset.state, 'pass');
assert.equal(readPlan(preservationUi).criteria.length, 1);

for (const field of ['subject', 'grade', 'lesson-title', 'lesson-goal', 'standard-code',
  'achievement-standard', 'assessment-criteria', 'rubric-high', 'rubric-meet', 'rubric-developing',
  'evidence-description', 'material-title', 'start-question']) {
  const fieldUi = createUi(planSettings);
  fieldUi.edit(field, fieldUi.byId(field).value + ' 수정');
  assertPlanApproval(fieldUi, false);
}
const unrelatedUi = createUi(planSettings);
unrelatedUi.edit('join-code', '123456');
assertPlanApproval(unrelatedUi, true);

// Dynamic select/checkbox/card edits revoke approval, with stable IDs and labels.
const cardUi = createUi(planSettings);
cardUi.select(criterionField('reading-evidence', 'responseKind'), 'student_question');
assert.equal(readPlan(cardUi).criteria[0].responseKind, 'student_question');
assertPlanApproval(cardUi, false);
cardUi.check('assessment-plan-approved', true);
cardUi.check(criterionField('reading-evidence', 'requireSourceEvidence'), false);
assert.equal(readPlan(cardUi).criteria[0].requireSourceEvidence, false);
assertPlanApproval(cardUi, false);
cardUi.check('assessment-plan-approved', true);
cardUi.edit(criterionField('reading-evidence', 'evidenceDescription'), '<img src=x onerror=alert(1)> 학생 설명');
assertPlanApproval(cardUi, false);
const previewItem = cardUi.byId('assessment-plan-preview-list').children[0];
assert.match(previewItem.textContent, /<img src=x onerror=alert\(1\)>/);
assert.equal(previewItem.children.length, 0, 'Preview treats all teacher content as text, not HTML');
for (let count = 0; count < 4; count += 1) cardUi.click('add-assessment-criterion');
assert.equal(readPlan(cardUi).criteria.length, 5);
assert.equal(cardUi.byId('add-assessment-criterion').disabled, true);
cardUi.click('add-assessment-criterion');
assert.equal(readPlan(cardUi).criteria.length, 5);
assert.equal(new Set(readPlan(cardUi).criteria.map((item) => item.id)).size, 5);
cardUi.click('remove-criterion-reading-evidence');
assert.equal(readPlan(cardUi).criteria.length, 4);
assert.equal(cardUi.byId('add-assessment-criterion').disabled, false);
assert.equal(cardUi.byId('add-assessment-criterion').focused, true);
assert.equal(cardUi.byId('criterion-criterion-1-mainQuestion').parentElement.getAttribute('for'), 'criterion-criterion-1-mainQuestion');
const removeApprovedUi = createUi({ ...settings, assessmentPlanJson:JSON.stringify({
  ...planFixture, criteria:[planFixture.criteria[0], { ...planFixture.criteria[0], id:'second-criterion' }],
}) });
removeApprovedUi.click('remove-criterion-second-criterion');
assert.equal(readPlan(removeApprovedUi).criteria.length, 1);
assertPlanApproval(removeApprovedUi, false);
assertDraft(removeApprovedUi);

const trimUi = createUi(planSettings);
trimUi.edit(criterionField('reading-evidence', 'criterion'), '  자료에서 근거를 찾아 설명하기  ');
assert.equal(readPlan(trimUi).criteria[0].criterion, planFixture.criteria[0].criterion,
  'Serialized plans use the same trimmed canonical string values as the server');
assertPlanApproval(trimUi, false);

// A save response can acknowledge only the plan that was actually submitted.
const planRaceUi = createUi(planSettings);
planRaceUi.edit(criterionField('reading-evidence', 'criterion'), '수정한 평가기준');
planRaceUi.check('assessment-plan-approved', true);
planRaceUi.submit();
const planSave = planRaceUi.takeRequest('saveLiteTeacherSetup');
const planCapturedPayload = JSON.parse(JSON.stringify(planSave.args[1]));
assert.equal(planRaceUi.byId('assessment-plan-approved').disabled, true);
assert.equal(planRaceUi.byId('remove-criterion-reading-evidence').disabled, true);
planRaceUi.edit(criterionField('reading-evidence', 'mainQuestion'), '새 질문을 설명해 줄래요?');
planSave.success({ ...readyData(planCapturedPayload), lessonId:settings.lessonId });
assertPlanApproval(planRaceUi, false);
assert.equal(readPlan(planRaceUi).criteria[0].mainQuestion, '새 질문을 설명해 줄래요?');
assertDraft(planRaceUi);

console.log('GAS lite teacher setup UI: draft readiness, toggle, preservation, validation, saved-payload gates, and criterion-plan approval/races passed');

{
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
const fiveSettings = { ...fourSettings, rubricScheme:'five_levels', rubricBeginning:'단계별 질문을 함께 읽으며 근거를 찾는다.' };
const fiveUi = createUi(fiveSettings);
assert.equal(fiveUi.byId('rubric-scheme').value, 'five_levels');
assert.equal(fiveUi.byId('rubric-good').required, true);
assert.equal(fiveUi.byId('rubric-beginning').required, true);
assert.equal(fiveUi.byId('rubric-beginning').value, fiveSettings.rubricBeginning);
assert.equal(fiveUi.byId('rubric-beginning-field').classList.contains('hidden'), false);
assert.deepEqual(['high', 'good', 'meet', 'developing'].map((name) => fiveUi.byId('rubric-' + name + '-label').textContent), ['A','B','C','D']);
assert.equal(fiveUi.byId('rubric-beginning-field').children[0].textContent, 'E');
fiveUi.byId('rubric-beginning').value = '';
fiveUi.submit();
assert.equal(fiveUi.requests.length, 0, 'Five-level evaluation requires its fifth descriptor');
fiveUi.byId('rubric-beginning').value = fiveSettings.rubricBeginning;
fiveUi.submit();
const fiveSave = fiveUi.takeRequest('saveLiteTeacherSetup');
assert.equal(fiveSave.args[1].rubricScheme, 'five_levels');
assert.equal(fiveSave.args[1].rubricBeginning, fiveSettings.rubricBeginning);
fiveSave.success({ ...readyData(fiveSave.args[1]), lessonId:settings.lessonId });
assert.equal(createUi(fiveSave.args[1]).byId('rubric-beginning').value, fiveSettings.rubricBeginning);
for (const scheme of ['four_levels', 'legacy_three', 'five_levels']) {
  fiveUi.byId('rubric-scheme').value = scheme;
  fiveUi.byId('rubric-scheme').dispatch('change');
  assert.equal(fiveUi.byId('rubric-beginning').value, fiveSettings.rubricBeginning, 'Manual switches preserve hidden descriptors');
  assert.equal(fiveUi.byId('rubric-beginning').required, scheme === 'five_levels');
  assert.equal(fiveUi.byId('rubric-good').required, scheme !== 'legacy_three');
  assert.equal(fiveUi.byId('rubric-high-label').textContent, scheme === 'five_levels' ? 'A' : scheme === 'four_levels' ? '매우잘함' : '도달');
  assert.equal(fiveUi.byId('rubric-good-label').textContent, scheme === 'five_levels' ? 'B' : '잘함');
}
fiveUi.selectMode('exploration');
assert.equal(fiveUi.byId('rubric-beginning').required, false);
assert.equal(fiveUi.byId('rubric-beginning').effectivelyDisabled(), true);
assert.equal(fiveUi.byId('rubric-beginning').value, fiveSettings.rubricBeginning);

const draft = {
  rubricScheme:'four_levels', startQuestion:'자료에서 사실을 찾고 자신의 의견을 근거와 함께 설명해 볼까요?', expectedAnswer:'자료의 사실과 그에 따른 자신의 의견을 구분해 설명한다.', assessmentEvidence:settings.materialText, assessmentCriteria:'자료의 근거와 자신의 생각을 연결한다.',
  answerExamples:'매우잘함: 글의 사실 두 가지를 들어 내 생각과 연결할 수 있어요.\n\n잘함: 글의 한 가지 사실을 들어 내 생각을 설명할 수 있어요.\n\n보통: 내 생각은 말했지만 글의 근거를 연결하는 데 도움이 필요해요.\n\n노력요함: 글에서 어떤 문장을 봐야 할지 함께 찾아보고 싶어요.',
  rubricHigh:'여러 근거를 정확하게 연결해 독립적으로 설명한다.',
  rubricGood:'적절한 근거를 들어 생각을 설명한다.',
  rubricMeet:'안내를 참고해 근거와 생각을 일부 연결한다.',
  rubricDeveloping:'함께 읽으며 관련 근거를 찾는 연습이 필요하다.',
  evidenceDescription:'질문, 근거 설명, 자신의 의견과 이유',
};
const selectedLevels = {
  legacy_three:['도달', '성장 중', '도움 필요'],
  four_levels:['매우잘함', '잘함', '보통', '노력요함'],
  five_levels:['A', 'B', 'C', 'D', 'E'],
};
for (const [scheme, labels] of Object.entries(selectedLevels)) {
  const levelUi = createUi(fiveSettings);
  levelUi.byId('rubric-scheme').value = scheme;
  levelUi.byId('rubric-scheme').dispatch('change');
  assert.equal(levelUi.byId('rubric-beginning').value, fiveSettings.rubricBeginning);
  levelUi.click('generate-assessment');
  const request = levelUi.takeRequest('generateLiteMaterialAssessmentDraft');
  assert.equal(request.args[1].rubricScheme, scheme, 'The request carries the selected levels');
  assert.equal(levelUi.byId('rubric-scheme').disabled, true, 'A paid request locks its level selector');
  const generated = { ...draft, rubricScheme:scheme };
  generated.answerExamples = labels.map((label, index) => label + ': 가상 학생 답변 예시 ' + (index + 1)).join('\n\n');
  if (scheme === 'legacy_three') delete generated.rubricGood;
  if (scheme === 'five_levels') generated.rubricBeginning = '작은 단계로 안내받으며 관련 문장을 함께 찾는다.';
  request.success({ ok:true, draft:generated });
  assert.equal(levelUi.byId('apply-assessment-draft').disabled, false);
  assert.equal(levelUi.byId('assessment-draft-title').textContent, `AI 질문·평가기준 초안 · ${labels.length}단계`);
  const previewLabels = levelUi.byId('assessment-draft-content').children.filter((node) => node.tagName === 'dt').map((node) => node.textContent);
  assert.deepEqual(previewLabels.slice(4, 4 + labels.length), labels, 'Preview labels match the selected assessment levels');
  levelUi.click('apply-assessment-draft');
  assert.equal(levelUi.byId('rubric-scheme').value, scheme);
  assert.equal(levelUi.byId('rubric-good').value, scheme === 'legacy_three' ? '' : draft.rubricGood);
  assert.equal(levelUi.byId('rubric-beginning').value, scheme === 'five_levels' ? generated.rubricBeginning : '', 'AI apply clears inactive descriptors');
  assert.equal(levelUi.byId('answer-examples').value, generated.answerExamples, 'Each selected scheme keeps its matching fictional answers');
  assert.equal(levelUi.requests.length, 0, 'Applying any level count does not autosave');
}
const wrongSchemeUi = createUi(settings);
wrongSchemeUi.click('generate-assessment');
wrongSchemeUi.takeRequest('generateLiteMaterialAssessmentDraft').success({ ok:true, draft });
assert.equal(wrongSchemeUi.byId('apply-assessment-draft').disabled, true, 'A different returned level scheme cannot overwrite the teacher selection');
const staleSchemeUi = createUi(fourSettings);
staleSchemeUi.click('generate-assessment');
staleSchemeUi.takeRequest('generateLiteMaterialAssessmentDraft').success({ ok:true, draft });
staleSchemeUi.byId('rubric-scheme').value = 'five_levels';
staleSchemeUi.byId('rubric-scheme').dispatch('change');
assert.equal(staleSchemeUi.byId('apply-assessment-draft').disabled, true, 'Changing levels invalidates the preview');
assert.equal(staleSchemeUi.byId('assessment-draft').classList.contains('hidden'), true);
const missingFifthUi = createUi(fiveSettings);
missingFifthUi.click('generate-assessment');
missingFifthUi.takeRequest('generateLiteMaterialAssessmentDraft').success({ ok:true, draft:{ ...draft, rubricScheme:'five_levels' } });
assert.equal(missingFifthUi.byId('apply-assessment-draft').disabled, true, 'Five-level generated drafts require the fifth descriptor');
const draftUi = createUi({ ...fourSettings, lessonGoal:'' });
draftUi.byId('answer-examples').value = '교사가 직접 기록한 예상 답변';
draftUi.byId('answer-examples').dispatch('input');
assert.equal(draftUi.byId('generate-assessment').disabled, false, 'A standard plus material enables combined drafting without an extra goal');
draftUi.click('generate-assessment');
const draftRequest = draftUi.takeRequest('generateLiteMaterialAssessmentDraft');
assert.equal(draftRequest.args[1].materialText, settings.materialText);
assert.equal(Object.hasOwn(draftRequest.args[1], 'joinCode'), false, 'Participation codes are not draft inputs');
assert.equal(Object.hasOwn(draftRequest.args[1], 'apiKey'), false, 'Client does not send an API key');
assert.equal(Object.hasOwn(draftRequest.args[1], 'answerExamples'), false, 'Existing teacher examples are not instructions to the model');
assert.equal(draftUi.byId('generate-assessment').disabled, true);
assert.equal(draftUi.byId('save-setup').disabled, true, 'No save can race with an AI request');
draftUi.click('generate-assessment');
assert.equal(draftUi.requests.length, 0, 'Busy clicks do not duplicate paid requests');
draftUi.submit();
assert.equal(draftUi.requests.length, 0, 'Enter submission cannot race with draft generation');
draftRequest.success({ ok:true, draft });
assert.equal(draftUi.byId('assessment-criteria').value, settings.assessmentCriteria, 'Generation does not overwrite the form');
assert.equal(draftUi.byId('start-question').value, settings.startQuestion, 'Generation does not silently replace the student question');
assert.equal(draftUi.byId('answer-examples').value, '교사가 직접 기록한 예상 답변', 'Generation does not overwrite existing teacher examples');
assert.equal(draftUi.byId('rubric-scheme').value, 'four_levels', 'Generation keeps the teacher-selected levels');
assert.equal(draftUi.byId('assessment-draft').classList.contains('hidden'), false);
assert.equal(draftUi.byId('apply-assessment-draft').disabled, false);
draftUi.click('apply-assessment-draft');
for (const [key, value] of Object.entries(draft)) {
  const id = { startQuestion:'start-question', expectedAnswer:'expected-answer', assessmentEvidence:'assessment-evidence', answerExamples:'answer-examples', rubricScheme:'rubric-scheme', rubricGood:'rubric-good', ...Object.fromEntries(Object.entries(designFields).map(([id, key]) => [key, id])) }[key];
  assert.equal(draftUi.byId(id).value, value, key);
}
assert.equal(draftUi.byId('lesson-goal').value, '', 'Apply preserves the teacher goal');
assert.equal(draftUi.byId('achievement-standard').value, settings.achievementStandard, 'Apply preserves the teacher standard');
assert.equal(draftUi.byId('material-text').value, settings.materialText, 'Apply preserves the teacher source material');
assert.equal(draftUi.requests.length, 0, 'Apply never autosaves settings');
assert.equal(draftUi.byId('apply-assessment-draft').disabled, true);
assert.equal(draftUi.byId('save-state').textContent, '미저장 변경 있음');
assertLinksDisabled(draftUi);
draftUi.click('refresh-readiness');
draftUi.takeRequest('getLiteTeacherSetupData').success(readyData(settings));
assertLinksDisabled(draftUi);
assert.equal(draftUi.byId('assessment-criteria').value, draft.assessmentCriteria, 'Readiness refresh must preserve an applied but unsaved draft');
draftUi.submit();
const combinedSave = draftUi.takeRequest('saveLiteTeacherSetup');
for (const key of ['startQuestion', 'expectedAnswer', 'assessmentEvidence', 'assessmentCriteria', 'answerExamples']) {
  assert.equal(combinedSave.args[1][key], draft[key], `Combined save includes ${key}`);
}
combinedSave.success({ ...readyData(combinedSave.args[1]), lessonId:settings.lessonId });
const combinedReopened = createUi(combinedSave.args[1]);
assert.equal(combinedReopened.byId('expected-answer').value, draft.expectedAnswer);
assert.equal(combinedReopened.byId('assessment-evidence').value, draft.assessmentEvidence);
assert.equal(combinedReopened.byId('answer-examples').value, draft.answerExamples);
combinedReopened.selectMode('exploration');
assert.equal(combinedReopened.byId('assessment-ai-section').classList.contains('hidden'), true);
assert.equal(combinedReopened.byId('start-question').effectivelyDisabled(), false, 'Exploration keeps an editable start question');
assert.equal(combinedReopened.byId('expected-answer').effectivelyDisabled(), true, 'Teacher assessment helpers do not apply in exploration');
assert.equal(combinedReopened.byId('answer-examples').effectivelyDisabled(), true, 'Teacher-only examples do not apply in exploration');
combinedReopened.byId('start-question').value = '어떤 점이 궁금한가요?';
combinedReopened.byId('start-question').dispatch('input');
combinedReopened.submit();
const explorationSave = combinedReopened.takeRequest('saveLiteTeacherSetup');
assert.equal(explorationSave.args[1].startQuestion, '어떤 점이 궁금한가요?');
assert.equal(explorationSave.args[1].expectedAnswer, draft.expectedAnswer, 'Changing to exploration preserves teacher drafts');
assert.equal(explorationSave.args[1].answerExamples, draft.answerExamples);
const oldLessonUi = createUi({ ...fourSettings, answerExamples:draft.answerExamples });
oldLessonUi.context.fillData(readyData(settings));
assert.equal(oldLessonUi.byId('answer-examples').value, '', 'Opening a lesson without examples must clear another lesson’s private examples');

const goalOnlyUi = createUi({ ...settings, achievementStandard:'', achievementStandardCode:'' });
assert.equal(goalOnlyUi.byId('generate-assessment').disabled, false);
const noGoalUi = createUi({ ...settings, lessonGoal:'', achievementStandard:'' });
assert.equal(noGoalUi.byId('generate-assessment').disabled, true);
noGoalUi.submit();
assert.equal(noGoalUi.requests.length, 0, 'Evaluation saving requires either a goal or standard');
assert.match(noGoalUi.byId('form-status').textContent, /목표 또는 성취기준/);
for (const missingField of ['lessonGoal', 'achievementStandard']) {
  const oneGoalUi = createUi({ ...settings, achievementStandardCode:'', [missingField]:'' });
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

for (const materialText of ['', '짧은 자료', '가'.repeat(29)]) {
  const shortUi = createUi({ ...settings, materialText });
  assert.equal(shortUi.byId('generate-assessment').disabled, true, 'Combined generation needs at least 30 material characters');
  shortUi.click('generate-assessment');
  assert.equal(shortUi.requests.length, 0);
}
const minimumMaterialUi = createUi({ ...settings, materialText:'가'.repeat(30) });
assert.equal(minimumMaterialUi.byId('generate-assessment').disabled, false, 'Thirty characters passes the client length gate; backend judges usefulness');

const separatedStandardUi = createUi({ ...settings, achievementStandardCode:'[4사08-02]', achievementStandard:'여러 지역을 비교한다.' });
assert.equal(separatedStandardUi.byId('achievement-standard').value, '[4사08-02] 여러 지역을 비교한다.');
separatedStandardUi.byId('achievement-standard').value = '[6사01-01] 지역의 변화를 설명한다.';
separatedStandardUi.byId('achievement-standard').dispatch('input');
separatedStandardUi.submit();
const standardSave = separatedStandardUi.takeRequest('saveLiteTeacherSetup');
assert.equal(standardSave.args[1].achievementStandardCode, '[6사01-01]', 'A new visible code replaces the old hidden code');
assert.equal(standardSave.args[1].achievementStandard, '[6사01-01] 지역의 변화를 설명한다.');
standardSave.failure({ message:'테스트 저장 중단' });
separatedStandardUi.byId('achievement-standard').value = '코드를 따로 정하지 않은 교사 기준';
separatedStandardUi.byId('achievement-standard').dispatch('input');
assert.equal(separatedStandardUi.context.collectPayload().achievementStandardCode, '', 'An edited plain standard does not inherit a stale hidden code');
for (const [code, text, expected] of [
  ['[4사08-02]', '[4사08-02] 여러 지역을 비교한다.', '[4사08-02] 여러 지역을 비교한다.'],
  ['[4사08-02] 여러 지역을 비교한다.', '', '[4사08-02] 여러 지역을 비교한다.'],
  ['[4사08-02] 여러 지역을', '[4사08-02] 여러 지역을 비교한다.', '[4사08-02] 여러 지역을 비교한다.'],
]) {
  const standardUi = createUi({ ...settings, achievementStandardCode:code, achievementStandard:text });
  assert.equal(standardUi.byId('achievement-standard').value, expected, 'Legacy combined/truncated code fields do not duplicate the text');
}
const codeOnlyUi = createUi({ ...settings, lessonGoal:'', achievementStandardCode:'', achievementStandard:'[4사08-02]' });
assert.equal(codeOnlyUi.byId('generate-assessment').disabled, true, 'A standard code alone is not an assessment goal');
const longLegacyStandard = '가'.repeat(1000);
const longStandardUi = createUi({ ...settings, achievementStandardCode:'[4국02-04]', achievementStandard:longLegacyStandard });
assert.equal(longStandardUi.byId('achievement-standard').value, '[4국02-04] ' + longLegacyStandard, 'Merging legacy fields must not truncate the teacher standard');
assert.equal(longStandardUi.byId('achievement-standard-limit').classList.contains('hidden'), false);
assert.equal(longStandardUi.byId('generate-assessment').disabled, true, 'An oversized merged standard needs editing before a paid request');
longStandardUi.submit();
assert.equal(longStandardUi.requests.length, 0, 'An oversized prefilled standard is caught before saving');
assert.match(longStandardUi.byId('form-status').textContent, /1,000자/);
longStandardUi.byId('achievement-standard').value = '[4국02-04] ' + '가'.repeat(980);
longStandardUi.byId('achievement-standard').dispatch('input');
assert.equal(longStandardUi.byId('achievement-standard-limit').classList.contains('hidden'), true);
assert.equal(longStandardUi.byId('generate-assessment').disabled, false);
const longExplorationUi = createUi({ ...settings, activityMode:'exploration', achievementStandard:longLegacyStandard });
longExplorationUi.submit();
assert.equal(longExplorationUi.byId('evaluation-goal-fields').classList.contains('hidden'), false, 'A preserved oversized standard remains editable even from exploration');
assert.equal(longExplorationUi.byId('achievement-standard').effectivelyDisabled(), false);
assert.equal(longExplorationUi.byId('activity-mode').value, 'exploration', 'Validation must not silently change the operating mode');

for (const editPhase of ['pending', 'preview']) {
 for (const editedField of ['lesson-goal', 'achievement-standard', 'material-text', 'start-question', 'expected-answer', 'assessment-evidence', 'answer-examples', 'assessment-criteria', 'rubric-beginning']) {
  const staleUi = createUi(fourSettings);
  staleUi.click('generate-assessment');
  const request = staleUi.takeRequest('generateLiteMaterialAssessmentDraft');
  if (editPhase === 'preview') request.success({ ok:true, draft });
  const before = staleUi.byId(editedField).value;
  staleUi.byId(editedField).value = '입력 수정';
  staleUi.byId(editedField).dispatch('input');
  staleUi.byId(editedField).value = before;
  staleUi.byId(editedField).dispatch('input');
  if (editPhase === 'pending') request.success({ ok:true, draft });
  staleUi.click('apply-assessment-draft');
  assert.equal(staleUi.byId('assessment-draft').classList.contains('hidden'), true, editPhase);
  assert.equal(staleUi.byId('assessment-criteria').value, settings.assessmentCriteria, 'Edited and reverted inputs still invalidate the draft');
 }
}

const failureUi = createUi(fourSettings);
failureUi.click('generate-assessment');
failureUi.takeRequest('generateLiteMaterialAssessmentDraft').failure({ message:'<img src=x onerror=alert(1)> 연결 실패' });
assert.equal(failureUi.byId('assessment-ai-status').textContent, '<img src=x onerror=alert(1)> 연결 실패');
assert.equal(failureUi.byId('assessment-ai-status').children.length, 0, 'Errors are text, never HTML');
assert.equal(failureUi.byId('generate-assessment').disabled, false);
failureUi.click('generate-assessment');
failureUi.takeRequest('generateLiteMaterialAssessmentDraft').success({ ok:true, draft:{ ...draft, rubricGood:'' } });
assert.equal(failureUi.byId('apply-assessment-draft').disabled, true, 'Incomplete drafts are rejected');
for (const field of ['startQuestion', 'expectedAnswer', 'assessmentEvidence', 'answerExamples']) {
  failureUi.click('generate-assessment');
  failureUi.takeRequest('generateLiteMaterialAssessmentDraft').success({ ok:true, draft:{ ...draft, [field]:'' } });
  assert.equal(failureUi.byId('apply-assessment-draft').disabled, true, `Combined draft requires ${field}`);
}
for (const answerExamples of [null, ['가상 답변'], '가'.repeat(3501)]) {
  failureUi.click('generate-assessment');
  failureUi.takeRequest('generateLiteMaterialAssessmentDraft').success({ ok:true, draft:{ ...draft, answerExamples } });
  assert.equal(failureUi.byId('apply-assessment-draft').disabled, true, 'Generated examples must be a bounded, nonempty canonical string');
}
failureUi.click('generate-assessment');
failureUi.takeRequest('generateLiteMaterialAssessmentDraft').success({ ok:true, draft:{ ...draft, assessmentCriteria:'<b>근거 확인</b>' } });
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
const fiveReadinessUi = createUi(fiveSettings);
fiveReadinessUi.context.renderReadiness({ setupReady:true, runtimeReady:true, distributionReady:true,
  checks:[{ key:'backwardDesign', label:'평가 설계', state:'pass' }],
}, readyData(settings).studentUrl, readyData(settings).previewUrl);
assert.equal(fiveReadinessUi.byId('readiness-list').children[0].dataset.state, 'pass');
fiveReadinessUi.byId('rubric-beginning').value = '';
fiveReadinessUi.byId('rubric-beginning').dispatch('input');
assert.equal(fiveReadinessUi.byId('readiness-list').children[0].dataset.state, 'block', 'Five-level readiness requires E');
assertLinksDisabled(fiveReadinessUi);

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
assert.equal(dashboardById('assessment-question').textContent, settings.startQuestion);
assert.equal(dashboardById('expected-answer').textContent, '입력된 답변 핵심 요소가 없습니다.');
assert.equal(dashboardById('assessment-evidence').textContent, '입력된 자료 근거 문장이 없습니다.');
assert.equal(dashboardById('answer-examples').textContent, '입력된 수준별 예상 답변 예시가 없습니다.');

const unsafeMarkup = '<img src=x onerror="globalThis.executed=true">';
const privateKeyText = '교사용 답변 요소 ' + unsafeMarkup;
const privateEvidenceText = '교사용 원문 근거 <script>globalThis.executed=true</script>';
const privateExampleText = '잘함: 가상의 답변 <script>globalThis.executed=true</script>';
dashboardContext.renderDashboard({ lesson:{ ...fourSettings, expectedAnswer:privateKeyText, assessmentEvidence:privateEvidenceText, answerExamples:privateExampleText }, evaluations:[
  { studentCode:'99-991', rubricScheme:'four_levels', assessmentResponse:unsafeMarkup, evidenceSummary:'근거 ' + unsafeMarkup },
  { studentCode:'99-992', rubricScheme:'four_levels', assessmentResponse:'' },
  { studentCode:'99-993' },
] });
assert.equal(dashboardById('expected-answer').textContent, privateKeyText);
assert.equal(dashboardById('assessment-evidence').textContent, privateEvidenceText);
assert.equal(dashboardById('answer-examples').textContent, privateExampleText);
assert.equal(dashboardById('expected-answer').children.length, 0);
assert.equal(dashboardById('assessment-evidence').children.length, 0);
assert.equal(dashboardById('answer-examples').children.length, 0, 'Teacher-only fictional answer examples render as text');
const answerCards = dashboardById('evaluations').children;
const responseNode = answerCards[0].children.find((node) => node.className === 'evidence');
assert.equal(responseNode.textContent, unsafeMarkup, 'The original first response is displayed literally');
assert.equal(responseNode.children.length, 0, 'First response never creates img/script elements');
assert.equal(dashboardContext.executed, undefined);
assert.ok(answerCards[0].textContent.includes('공통 관찰 점수는 이 문항의 성적이 아닙니다.'));
assert.ok(answerCards[1].textContent.includes('아직 확인할 첫 답변이 없습니다.'));
assert.equal(answerCards[2].textContent.includes('시작 질문 뒤 첫 응답'), false, 'Historical rows with no response field keep the original card');
assert.deepEqual(decisionChoices(answerCards[2]), ['판단 보류','도달','성장 중','도움 필요']);

dashboardContext.renderDashboard({ lesson:fiveSettings, evaluations:[
  { studentCode:'99-995', rubricScheme:'five_levels', teacherDecision:'D' },
  { studentCode:'99-994', rubricScheme:'four_levels', teacherDecision:'잘함' },
  { studentCode:'99-993', rubricScheme:'legacy_three', teacherDecision:'성장 중' },
] });
assert.deepEqual(['high', 'good', 'meet', 'developing'].map((name) => dashboardById('rubric-' + name + '-label').textContent), ['A','B','C','D']);
assert.equal(dashboardById('rubric-beginning-field').classList.contains('hidden'), false);
assert.equal(dashboardById('rubric-beginning-field').children[0].textContent, 'E');
assert.equal(dashboardById('rubric-beginning').textContent, fiveSettings.rubricBeginning);
const mixedCards = dashboardById('evaluations').children;
assert.deepEqual(decisionChoices(mixedCards[0]), ['판단 보류','A','B','C','D','E']);
assert.deepEqual(decisionChoices(mixedCards[1]), ['판단 보류','매우잘함','잘함','보통','노력요함'], 'A four-level historical row is not relabeled A–D');
assert.deepEqual(decisionChoices(mixedCards[2]), ['판단 보류','도달','성장 중','도움 필요']);
assert.equal(mixedCards[0].descendants().find((node) => node.dataset.field === 'teacherDecision').children.find((option) => option.selected).value, 'D');
dashboardContext.renderDashboard({ lesson:fourSettings });
assert.equal(dashboardById('rubric-high-label').textContent, '매우잘함');
assert.equal(dashboardById('rubric-good-label').textContent, '잘함');
assert.equal(dashboardById('rubric-beginning-field').classList.contains('hidden'), true);

console.log('GAS lite teacher UI: 3/4/5-level selected drafts, A–E dashboard, material-first assessment, and stale/dirty gates passed');
}
