/* One real session on the public web app: sends a list of messages in order and prints every bot reply. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.GAS_WEB_APP_URL;
const code = process.env.GAS_STUDENT_CODE || '99-761';
const messages = JSON.parse(process.env.GAS_MESSAGES || '[]');
(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  const page = await browser.newPage({viewport: {width: 1280, height: 900}});
  try {
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 60000});
    const ui = page.frameLocator('#sandboxFrame').frameLocator('#userHtmlFrame');
    await ui.locator('#student-code-input').waitFor({state: 'visible', timeout: 60000});
    await ui.locator('#student-code-input').fill(code);
    await ui.getByRole('button', {name: '대화 시작', exact: true}).click();
    await ui.locator('#message-input').waitFor({state: 'visible'});
    await page.waitForTimeout(3000);
    const out = [];
    for (const message of messages) {
      const before = await ui.locator('.message.bot').count();
      await ui.locator('#message-input').fill(message);
      const t0 = Date.now();
      await ui.getByRole('button', {name: '메시지 보내기', exact: true}).click();
      await ui.locator('.message.bot').nth(before).waitFor({state: 'visible', timeout: 120000});
      for (let w = 0; w < 240; w++) { if (!(await ui.locator('#message-input').isDisabled())) break; await page.waitForTimeout(500); }
      const reply = await ui.locator('.message.bot').last().locator('.message-body').innerText();
      out.push({message, reply, ms: Date.now() - t0});
      console.log('학생> ' + message + '\n봇> ' + reply.replace(/\n/g, ' ') + '  (' + Math.round((Date.now() - t0) / 100) / 10 + 's)\n');
      if (await ui.locator('#message-input').isDisabled().catch(() => false)) { console.log('(대화가 마쳐져 입력이 닫혔습니다)'); break; }
    }
    require('fs').writeFileSync(process.env.GAS_OUT || 'conversation.json', JSON.stringify(out, null, 2));
  } finally { await browser.close(); }
})();
