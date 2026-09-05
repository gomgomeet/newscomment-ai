/* Actual public GAS UI: isolated Chrome profile, 30 tabs, DOM interactions only.
 * GAS_WEB_APP_URL, PLAYWRIGHT_MODULE, GAS_REPORT_DIR can be supplied by the operator.
 * Reserved preview codes 99-601..630 must be unused before the first run. */
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.GAS_WEB_APP_URL;
if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url || '')) throw new Error('GAS_WEB_APP_URL is required');
const out = path.resolve(process.env.GAS_REPORT_DIR || 'gas-browser-report');
fs.mkdirSync(out, {recursive: true});
const count = Number(process.env.GAS_TAB_COUNT || 30);
const base = Number(process.env.GAS_STUDENT_BASE || 601);
const uiOnly = process.env.GAS_UI_ONLY === '1';
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  const context = await browser.newContext({viewport: {width: 1280, height: 900}});
  const errors = [];
  const tabs = [];
  const report = {mode: uiOnly ? 'ui-only' : 'load', count, startedAt: new Date().toISOString(), results: [], ui: {}, errors};
  try {
    for (let offset = 0; offset < count; offset += 5) {
      await Promise.all(Array.from({length: Math.min(5, count - offset)}, async (_, j) => {
        const index = offset + j;
        const page = await context.newPage();
        page.on('pageerror', e => errors.push(e.message));
        await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 60000});
        const outer = page.frameLocator('#sandboxFrame');
        const ui = outer.frameLocator('#userHtmlFrame');
        await ui.locator('#student-code-input').waitFor({state: 'visible', timeout: 60000});
        if (index === 0) {
          assert.equal(await ui.locator('#message-input').isDisabled(), true);
          await ui.getByRole('button', {name: '대화 시작', exact: true}).click();
          assert.match(await ui.locator('#status').innerText(), /반-번호/);
          report.ui.identityRequired = true;
        }
        await ui.locator('#student-code-input').fill('99-' + (base + index));
        await ui.getByRole('button', {name: '대화 시작', exact: true}).click();
        await ui.locator('#message-input').waitFor({state: 'visible'});
        await ui.locator('#message-input').fill('고추장은 어떤 재료로 만들었나요?', {timeout: 60000});
        if (!uiOnly) assert.equal(await ui.locator('.message.student').count(), 0, 'Use fresh reserved preview codes');
        tabs[index] = {page, ui, code: '99-' + (base + index), before: await ui.locator('.message.bot').count()};
      }));
      console.log('READY ' + Math.min(offset + 5, count) + '/' + count);
    }
    report.sendStartedAt = Date.now();
    report.results = uiOnly ? [] : await Promise.all(tabs.map(async ({page, ui, code, before}) => {
      const began = Date.now();
      try {
        await ui.getByRole('button', {name: '메시지 보내기', exact: true}).click();
        await ui.locator('.message.bot').nth(before).waitFor({state: 'visible', timeout: 180000});
        const reply = await ui.locator('.message.bot').nth(before).locator('.message-body').innerText();
        const result = {code, ok: /조청|고춧가루|메줏가루/.test(reply), ms: Date.now() - began, began, reply};
        console.log(JSON.stringify({code, ok: result.ok, ms: result.ms}));
        return result;
      } catch (error) {
        return {code, ok: false, ms: Date.now() - began, began, error: error.message,
          status: await ui.locator('#status').innerText().catch(() => '')};
      }
    }));
    const first = tabs[0];
    await first.page.reload({waitUntil: 'domcontentloaded'});
    await first.ui.locator('#student-code-input').waitFor({state: 'visible', timeout: 60000});
    assert.equal(await first.ui.locator('#student-code-input').inputValue(), first.code);
    await first.ui.getByRole('button', {name: '대화 시작', exact: true}).click();
    await first.ui.locator('.message.student').waitFor({state: 'visible', timeout: 60000});
    report.ui.sessionRestored = (await first.ui.locator('.message.student').count()) === 1;
    await first.page.setViewportSize({width: 390, height: 844});
    report.ui.mobileNoOverflow = await first.ui.locator('html').evaluate(el => el.scrollWidth <= window.innerWidth + 1);
    await first.ui.getByRole('button', {name: '지문 보기', exact: true}).click();
    await first.ui.locator('#material-panel.active').waitFor({state: 'visible'});
    await first.ui.getByRole('button', {name: '대화하기', exact: true}).click();
    await first.ui.locator('#chat-panel.active').waitFor({state: 'visible'});
    report.ui.mobilePanelSwitch = !(await first.ui.locator('#material-panel').isVisible());
    report.ui.mobileNoOverflow = report.ui.mobileNoOverflow && await first.ui.locator('html').evaluate(el => el.scrollWidth <= window.innerWidth + 1);
    await first.page.screenshot({path: path.join(out, 'mobile.png'), fullPage: true});
    report.success = report.results.filter(r => r.ok).length;
    const times = report.results.map(r => r.ms).sort((a,b) => a-b);
    report.medianMs = times.length ? (times[Math.floor((times.length - 1) / 2)] + times[Math.floor(times.length / 2)]) / 2 : null;
    report.p95Ms = times[Math.ceil(times.length * .95) - 1];
    report.maxMs = times.at(-1);
    report.launchSpreadMs = Math.max(...report.results.map(r => r.began)) - Math.min(...report.results.map(r => r.began));
    console.log(JSON.stringify({...report, results: undefined}));
    if ((!uiOnly && report.success !== count) || errors.length || Object.values(report.ui).some(v => !v)) process.exitCode = 1;
  } catch (error) {
    report.error = error.stack;
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
})();
