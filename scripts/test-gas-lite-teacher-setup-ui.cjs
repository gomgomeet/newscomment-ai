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

const readyData = (settings) => ({
  settings,
  api: { configured:true, verified:true },
  readiness: { distributionReady:true, runtimeReady:true, setupReady:true, checks:[] },
  studentUrl:'https://example.test/student',
  previewUrl:'https://example.test/student?preview=99-999',
});

function createUi(settings) {
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
  takeRequest('getLiteTeacherSetupData').success(readyData(settings));
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

console.log('GAS lite teacher setup UI: toggle, preservation, validation, and saved-mode gates passed');
