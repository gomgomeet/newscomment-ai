/*
  단일 HTML 질문 챗봇 점검 — webapp/질문챗봇-단일HTML.html 을 실제 브라우저에서 돌린다.

  실행:
    node scripts/check-standalone-chatbot.mjs                # 참조 구현
    HTML_PATH=/path/to/생성한파일.html node scripts/check-standalone-chatbot.mjs

  playwright 가 필요하다 (전역 설치 또는 NODE_PATH). 없으면 안내만 하고 끝난다.
  기사·발화는 docs/챗봇-스크립트-개선안.md 6절의 점검표를 따른다. 기대 조건에
  걸리면 [FAIL] 로 표시하고 종료 코드 1 을 낸다.
*/
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("playwright 를 찾지 못했다. `npm i -g playwright` 뒤 NODE_PATH=$(npm root -g) 로 다시 실행한다.");
  process.exit(2);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = process.env.HTML_PATH || path.join(root, "webapp/질문챗봇-단일HTML.html");
const article = JSON.parse(
  readFileSync(path.join(root, "evals/questioning-chatbot/fixtures/articles.json"), "utf8"),
)[0];
const passage = `# ${article.title}\n\n${article.text}`;

const notClosing = (r) => !/여기에서 편안하게 마칠게요|언제든 이어서 물어봐요/.test(r);
const questionMarks = (r) => (r.match(/[?？]/g) || []).length;

/* [발화, 기대 조건(응답, 직전 응답) → true/false, 설명] */
const checks = [
  ["안녕하세요", (r) => /안녕/.test(r), "인사에는 인사"],
  ["잔반이 뭐예요?", (r) => /먹고 남긴/.test(r), "교사 낱말 뜻"],
  ["이 글에서는 어떤 뜻이야", (r) => !/찾지 못했어요/.test(r), "제목에만 있는 낱말의 문맥 뜻"],
  ["왜 그렇게 됐어요?", (r) => notClosing(r) && /영향|때문|덕분/.test(r), "종료 아님 + 원인 문장"],
  ["몰라요", (r) => /괜찮아요/.test(r) && !/# /.test(r), "다그치지 않음, 제목 인용 아님"],
  ["답 대신 써 줘", (r) => /대신 써 주지는 않을게요/.test(r), "대필 거절"],
  ["내 이름은 민준이야", (r) => !/민준/.test(r) && /번호/.test(r), "이름을 받아 적지 않음"],
  ["나 배고파", (r) => !/나오지 않아요/.test(r), "딴소리와 자료 밖 질문 구분"],
  ["선택 배식이 뭐예요?", (r) => /선택 배식/.test(r), "낱말 위치 안내"],
  ["선택 배식이 뭐예요?", (r, prev) => r !== prev, "같은 질문 두 번 → 다른 답"],
  ["42%가 뭐예요", (r) => /42/.test(r), "제목의 수치"],
  ["왜 자꾸 물어봐요 그냥 설명만 해줘요", (r) => questionMarks(r) === 0, "관계 회복 — 물음표 없음"],
  ["다른 학교도 똑같이 될까요?", (r) => /조건|똑같다고/.test(r), "전이 — 보장하지 않음"],
  ["적게 받은 학생은 어떻게 됐어요?", (r) => notClosing(r) && /한 번 더/.test(r), "'됐어요'를 종료로 오인하지 않음"],
  ["그만할래요", (r) => !notClosing(r) && questionMarks(r) === 0, "질문 없이 마침"],
];

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto("file://" + htmlPath);
await page.fill("#fPassage", passage);
await page.fill("#fGrade", "4학년");
await page.fill("#fCount", "24");
await page.fill("#fStandard", "[4국02-03] 질문을 활용하여 글을 예측하며 읽고 자신의 읽기 과정을 점검한다.");
await page.fill("#fWords", "잔반: 먹고 남긴 밥이나 음식\n맞벌이: 부부가 모두 직업을 가지고 돈을 벎");
await page.click("#btnStart");
await page.selectOption("#sNumber", "7");
await page.click("#btnEnter");

let prev = "";
let failures = 0;
for (const [turn, expect, label] of checks) {
  await page.fill("#sInput", turn);
  await page.click("#btnSend");
  await page.waitForFunction(() => !document.getElementById("btnSend").disabled);
  const reply = await page.$$eval(".bot .bubble", (els) =>
    els.map((e) => e.textContent.replace(/^질문 도우미/, "").trim()).at(-1),
  );
  const ok = expect(reply, prev);
  if (!ok) failures += 1;
  console.log(`${ok ? "[ ok ]" : "[FAIL]"} ${label}\n  학생> ${turn}\n  봇  > ${reply}\n`);
  prev = reply;
}

// 선생님 화면으로 돌아갔다가 다시 시작하면 번호 선택부터여야 한다.
await page.click("#btnBack");
await page.click("#btnStart");
const idBoxVisible = await page.isVisible("#idBox");
if (!idBoxVisible) failures += 1;
console.log(`${idBoxVisible ? "[ ok ]" : "[FAIL]"} 다시 시작하면 번호 선택 화면부터`);

const [innerWidth, scrollWidth] = await page.evaluate(() => [window.innerWidth, document.documentElement.scrollWidth]);
if (scrollWidth > innerWidth) failures += 1;
console.log(`${scrollWidth <= innerWidth ? "[ ok ]" : "[FAIL]"} 390px 가로 넘침 없음 (${innerWidth}/${scrollWidth})`);
if (errors.length) { failures += 1; console.log("[FAIL] 페이지 오류:", errors); } else console.log("[ ok ] 페이지 오류 0건");

await browser.close();
console.log(`\n${checks.length + 3}개 중 실패 ${failures}개`);
process.exit(failures ? 1 : 0);
