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

function parseForm() {
  const root = new Element('document');
  const stack = [root];
  const markup = html.replace(/<script>[\s\S]*?<\/script>/g, '')
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

function createUi(settings, initialData = readyData(settings)) {
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
  for (const id of Object.keys(designFields)) assert.equal(ui.byId(id).required, enabled, id);
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
assert.equal(ui.byId('backward-design-enabled').getAttribute('role'), 'switch');
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
