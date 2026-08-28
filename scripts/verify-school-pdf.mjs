import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { PDFDocument, rgb } from "pdf-lib";

const require = createRequire(import.meta.url);
const fontkitModule = require("@pdf-lib/fontkit");
const fontkit = fontkitModule.default ?? fontkitModule;

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) throw new Error("input PDF와 output PDF 경로가 필요합니다.");

const document = await PDFDocument.load(await readFile(input));
document.registerFontkit(fontkit);
const font = await document.embedFont(await readFile("assets/fonts/NanumGothic.ttf"), { subset: false });
const values = {
  student_key: "시연학생-01",
  assessment_period: "2026학년도 1학기",
  project_title: "뉴스 댓글로 근거 있는 의견 쓰기",
  achievement_standards: "주장과 근거의 관계를 파악하고 타당한 근거를 들어 의견을 표현한다.",
  feedback_forward: "다음 활동에서는 반대 관점의 근거를 한 가지 더 비교하여 주장의 설득력을 높여 보세요.",
  teacher_final_text: "뉴스 댓글 활동에서 핵심 쟁점을 파악하고 자료의 근거를 활용해 자신의 의견을 구체적으로 표현함. 교사 피드백을 반영하여 근거를 보완하는 모습을 보였으며, 다음 활동에서는 상반된 관점을 비교해 판단의 폭을 넓힐 필요가 있음.",
};
const form = document.getForm();
const pages = document.getPages();
for (const [name, value] of Object.entries(values)) {
  const field = form.getTextField(name);
  const size = name === "teacher_final_text" ? 8 : 9;
  const widgets = field.acroField.getWidgets().map((widget) => ({ rectangle: widget.getRectangle(), pageRef: widget.P()?.toString() }));
  form.removeField(field);
  for (const widget of widgets) {
    const page = pages.find((candidate) => candidate.ref.toString() === widget.pageRef) ?? pages[0];
    const { x, y, width, height } = widget.rectangle;
    page.drawRectangle({ x, y, width, height, color: rgb(0.973, 0.98, 0.988), borderColor: rgb(0.796, 0.835, 0.882), borderWidth: 0.75 });
    page.drawText(value, { x: x + 4, y: y + height - size - 5, maxWidth: width - 8, font, size, color: rgb(0.08, 0.1, 0.12), lineHeight: size * 1.35 });
  }
}
await writeFile(output, await document.save({ useObjectStreams: false }));
console.log(`filled=${Object.keys(values).length}, pages=${document.getPageCount()}`);
