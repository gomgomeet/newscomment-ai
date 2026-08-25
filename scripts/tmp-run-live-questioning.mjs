import { mkdir, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";

const baseUrl = (process.env.QUESTIONING_LIVE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const lessonCode =
  process.env.QUESTIONING_LIVE_LESSON_CODE || `Q-LIVE-${Date.now().toString(36).toUpperCase()}`;
const scenario = "live-simulation-actual";
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

const rubric = [
  {
    key: "standard_material_alignment",
    label: "성취기준·자료 연결",
    description: "질문과 반응이 성취기준·자료에 맞닿았는지 본다.",
    observableEvidence: "질문의 핵심, 근거 단서",
    feedbackForward: "근거가 보이는 표현으로 한 단계 더 짚어준다.",
    levels: [
      { score: 5, label: "탁월", descriptor: "근거와 성취기준이 매우 선명하게 연결되어 있다." },
      { score: 4, label: "우수", descriptor: "연결은 되지만 정밀도가 더 필요하다." },
      { score: 3, label: "도달", descriptor: "일부 질문은 연결이 약간 약하다." },
      { score: 2, label: "부분 도달", descriptor: "대부분의 질의가 자료와 약하게 이어진다." },
      { score: 1, label: "시작", descriptor: "연결의 흔적이 부족하다." },
      { score: 0, label: "미제출", descriptor: "기록이 없다." },
    ],
  },
  {
    key: "evidence_check",
    label: "자료 근거 확인",
    description: "주어진 답변을 자료로 검토했는지 본다.",
    observableEvidence: "본문의 문장·숫자·상황 제시",
    feedbackForward: "근거의 위치(문단/문장)를 함께 기록한다.",
    levels: [
      { score: 5, label: "탁월", descriptor: "근거를 구체적으로 재확인한다." },
      { score: 4, label: "우수", descriptor: "근거를 확인하는 과정이 보인다." },
      { score: 3, label: "도달", descriptor: "근거 확인이 부분적이다." },
      { score: 2, label: "부분 도달", descriptor: "근거 확인이 추상적이다." },
      { score: 1, label: "시작", descriptor: "근거 확인이 거의 없다." },
      { score: 0, label: "미제출", descriptor: "기록이 없다." },
    ],
  },
  {
    key: "question_depth",
    label: "질문 유형 확장",
    description: "사실 확인 질문에서 확장 질문으로 이어지는지 본다.",
    observableEvidence: "가설 제시, 대안 탐색, 적용 질문",
    feedbackForward: "하나의 확장 축을 잡아 가벼운 반대 가정을 추가한다.",
    levels: [
      { score: 5, label: "탁월", descriptor: "확장 질문이 다양하고 연속적이다." },
      { score: 4, label: "우수", descriptor: "확장 흐름이 보인다." },
      { score: 3, label: "도달", descriptor: "일부에서 확장이 나타난다." },
      { score: 2, label: "부분 도달", descriptor: "확장이 단절된다." },
      { score: 1, label: "시작", descriptor: "확장이 거의 없다." },
      { score: 0, label: "미제출", descriptor: "기록이 없다." },
    ],
  },
  {
    key: "revision_reflection",
    label: "질문 다시 쓰기·성찰",
    description: "학생이 스스로 질문을 다듬고 성찰하는지가 보이는지 본다.",
    observableEvidence: "질문 수정 발언, 성찰 문장",
    feedbackForward: "어디를 바꿨는지 한 문장으로 요약하게 돕는다.",
    levels: [
      { score: 5, label: "탁월", descriptor: "성찰이 구체적이고 근거 기반이다." },
      { score: 4, label: "우수", descriptor: "수정이나 성찰 시도가 있다." },
      { score: 3, label: "도달", descriptor: "성찰은 있으나 짧다." },
      { score: 2, label: "부분 도달", descriptor: "성찰이 약하다." },
      { score: 1, label: "시작", descriptor: "성찰 시도가 거의 없다." },
      { score: 0, label: "미제출", descriptor: "기록이 없다." },
    ],
  },
];

const material = {
  materialTitle: "선택 급식이 남은 음식에 미치는 영향",
  summary: "선택 급식 도입 후 남은 음식량이 줄어들었다는 가상의 수업 자료",
  visibleText:
    "일부 학교는 급식을 적게 남기고 있다. 학생이 먹을 양을 직접 고르고 부족하면 다시 받을 수 있다. 선택한 메뉴가 아이들의 선택권을 높였고, 남은 음식도 줄어드는 경향이 보였다.",
  keyConcepts: ["선택 배식", "음식물 쓰레기 감소", "의사결정", "자료 근거"],
  vocabulary: [
    {
      term: "선택 배식",
      dictionaryMeaning: "학생이 원하는 메뉴만 직접 선택해 받는 급식 방식",
      contextualMeaning: "필요한 양만 받는 급식 방식",
      contextSentence: "선택 배식은 남은 음식 감소를 유도할 수 있다.",
    },
  ],
  possibleMisconceptions: [
    "더 먹을수록 남은 음식이 늘어난다",
    "메뉴만 바꾸면 무조건 남은 음식이 줄어든다",
  ],
  questionSeeds: ["왜 줄어들었을까요?", "내 학교에서도 가능할까요?"],
  sourceLimit: "기사의 실험 맥락과 수집된 발화 범위 내에서 확인",
  safetyNotice: "개인정보를 넣지 않고 대화해 주세요.",
};

const turns = [
  "남은 음식이 줄었다고 했는데 어떤 기준으로 본 건가요?",
  "우리 학교에도 적용하면 똑같이 될까요?",
  "어떤 친구는 이름을 말하지 않아도 되나요?",
  "왜냐하면 반찬이 싫으면 못 먹어서 많이 남길 수 있어요.",
  "이제 알겠어요.",
];

const studentProfiles = [
  { school: "수연초등학교", classroom: "3학년 1반", number: "01" },
  { school: "수연초등학교", classroom: "3학년 1반", number: "02" },
  { school: "수연초등학교", classroom: "3학년 2반", number: "03" },
  { school: "수연초등학교", classroom: "3학년 2반", number: "04" },
  { school: "수연초등학교", classroom: "3학년 3반", number: "05" },
];

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textCell(value, styleId = "General") {
  return `<Cell ss:StyleID="${styleId}"><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
}

function row(cells, styleId = "General") {
  return `<Row>${cells.map((value) => textCell(value, styleId)).join("")}</Row>`;
}

function buildSimpleWorkbookXml({ subjectUnit, standard, materialTitle, records, standardAnalysis }) {
  const recordRows = records.map((record) =>
    row([
      record.studentKey,
      record.questionCount,
      record.answerableRate,
      record.scores[0] ?? 0,
      record.scores[1] ?? 0,
      record.scores[2] ?? 0,
      record.scores[3] ?? 0,
      record.questions,
      record.answers,
      record.comment,
      record.basis,
      record.feedback,
    ]),
  );

  const rubricRows = rubric
    .map((criterion) =>
      row([
        criterion.label,
        criterion.description,
        criterion.observableEvidence,
        criterion.feedbackForward,
        ...criterion.levels.map((level) => level.descriptor),
      ]),
    )
    .join("");

  const elementRows =
    standardAnalysis.evaluationElements
      ?.map((element) =>
        row([element.label, element.focus, element.studentEvidence, element.rubricUse]),
      )
      .join("") ?? "";

  const filenameTitle = `${subjectUnit || materialTitle || "질문하기 수업"}`;
  const levelHeaders = rubric[0].levels.map((level) => `${level.score}점`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#EEF2F7" ss:Pattern="Solid"/></Style>
    <Style ss:ID="Title"><Font ss:Bold="1" ss:Size="14"/></Style>
  </Styles>
      <Worksheet ss:Name="평가 기록">
    <Table>
      <Column ss:Width="140"/><Column ss:Width="80"/><Column ss:Width="90"/>
      <Column ss:Width="55"/><Column ss:Width="55"/><Column ss:Width="55"/><Column ss:Width="55"/>
      <Column ss:Width="260"/><Column ss:Width="260"/><Column ss:Width="260"/>
      <Column ss:Width="210"/><Column ss:Width="220"/>
      <Row><Cell ss:MergeAcross="10" ss:StyleID="Title"><Data ss:Type="String">${escapeXml(filenameTitle)} 평가 기록</Data></Cell></Row>
      <Row>
        ${textCell("대상", "Header")} ${textCell("초등4", "Header")} ${textCell("성취기준", "Header")} ${textCell(standard, "Header")} ${textCell("수업 자료", "Header")} ${textCell(materialTitle, "Header")}
      </Row>
      <Row>
        ${["학생키", "질문수", "답변가능률", "항목1", "항목2", "항목3", "항목4", "질문 원문", "답변 원문", "코멘트", "기반", "교사 피드백"]
          .map((item) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(item)}</Data></Cell>`)
          .join("")}
      </Row>
      ${recordRows.join("")}
    </Table>
  </Worksheet>
  <Worksheet ss:Name="루브릭">
    <Table>
      <Column ss:Width="140"/><Column ss:Width="240"/><Column ss:Width="220"/><Column ss:Width="220"/>
      ${levelHeaders.map(() => `<Column ss:Width="220"/>`).join("")}
      <Row>${["항목", "설명", "관찰 증거", "피드백 방향", ...levelHeaders]
        .map((item) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(item)}</Data></Cell>`)
        .join("")}</Row>
      ${rubricRows}
    </Table>
  </Worksheet>
  <Worksheet ss:Name="성취기준 분석">
    <Table>
      <Column ss:Width="160"/><Column ss:Width="560"/>
      <Row><Cell><Data ss:Type="String">성취기준</Data></Cell><Cell><Data ss:Type="String">${escapeXml(standard)}</Data></Cell></Row>
      <Row><Cell><Data ss:Type="String">핵심 성취</Data></Cell><Cell><Data ss:Type="String">${escapeXml(standardAnalysis.coreAchievement || "")}</Data></Cell></Row>
      <Row><Cell><Data ss:Type="String">내용 요소</Data></Cell><Cell><Data ss:Type="String">${escapeXml((standardAnalysis.contentTargets || []).join(", "))}</Data></Cell></Row>
      ${elementRows}
    </Table>
  </Worksheet>
</Workbook>`;
}

function sanitizeFilename(name) {
  return String(name)
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 180);
}

async function post(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  return { status: response.status, ok: response.ok, json };
}

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`);
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: response.status, ok: response.ok, json };
}

function toString(value) {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  return JSON.stringify(value);
}

function loadEnvFile(path = ".env.local") {
  return new Promise((resolve) => {
    const stream = createReadStream(path, { encoding: "utf8" });
    let content = "";
    stream.on("data", (chunk) => {
      content += chunk;
    });
    stream.on("error", () => resolve());
    stream.on("end", () => {
      for (const line of content.split(/\r?\n/)) {
        if (!line || line.startsWith("#")) continue;
        const idx = line.indexOf("=");
        if (idx <= 0) continue;

        const key = line.slice(0, idx).trim();
        const value = line
          .slice(idx + 1)
          .trim()
          .replace(/^"([^"]*)"$/, "$1");

        if (key && !process.env[key]) process.env[key] = value;
      }
      resolve();
    });
  });
}

async function main() {
  await loadEnvFile(".env.local");
  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";

  const standard =
    "문헌 근거를 사용해 이유를 추론하고 근거와 조건을 구분한다.";
  const targetGrade = "초등4";
  const subjectUnit = "국어·도덕";
  const common = { standard, targetGrade, subjectUnit };
  const sessionId = `sim-live-${timestamp}`;
  const connectionPayload = {
    lessonCode,
    teacherLabel: "실전점검교사",
    notionApiKey: process.env.NOTION_API_KEY || "ntn_temp_for_check",
    notionPrepDatabaseId:
      process.env.NOTION_PREP_DATABASE_ID || "00000000000000000000000000000000",
    notionResultDatabaseId:
      process.env.NOTION_RESULT_DATABASE_ID || "11111111111111111111111111111111",
    geminiApiKey: geminiApiKey || "dummy-gemini-key",
    geminiModel: "gemini-2.5-flash",
    setupToken: process.env.QUESTIONING_CONNECTION_SETUP_TOKEN || "",
    config: {
      ...common,
      material,
      rubric,
      prdText: "실전 점검용 PRD",
      updatedAt: new Date().toISOString(),
    },
    studentChatbotPath: "/questioning-chatbot",
  };

  const saveConnection = await post("/api/questioning-board/connections", connectionPayload);

  const conversation = [];
  const chatSteps = [];
  for (let index = 0; index < turns.length; index += 1) {
    const response = await post("/api/questioning-board/chat", {
      ...common,
      material,
      rubric,
      question: turns[index],
      sessionId,
      lessonCode,
      conversation,
      studentProfile: studentProfiles[index],
    });

    chatSteps.push({
      step: index + 1,
      status: response.status,
      ok: response.ok,
      noticeCode: response.json?.noticeCode,
      studentReply: response.json?.studentReply,
      expectsStudentReply: response.json?.expectsStudentReply,
      isClosing: response.json?.isClosing,
      localFallback: response.json?.localFallback,
      error: response.ok ? undefined : response.json,
    });

    if (response.ok && typeof response.json?.studentReply === "string") {
      conversation.push({ role: "student", content: turns[index] });
      conversation.push({ role: "assistant", content: response.json.studentReply });
    }
  }

  const cardsPayload = {
    ...common,
    lessonCode,
    material,
    setupToken: process.env.QUESTIONING_CONNECTION_SETUP_TOKEN || "",
    geminiApiKey,
    geminiModel: "gemini-2.5-flash",
    useAi: false,
  };

  const cardsBuild = await post("/api/questioning-board/cards", cardsPayload);
  const cardsGet = await getJson(`/api/questioning-board/cards?lessonCode=${encodeURIComponent(lessonCode)}`);

  const analysis = await post("/api/questioning-board/analysis", {
    lessonCode,
    standard: common.standard,
    targetGrade: common.targetGrade,
    geminiApiKey,
    geminiModel: process.env.GEMINI_EVALUATION_MODEL || "gemini-2.5-flash",
  });

  const students = analysis.json?.students ?? [];
  const records = students.map((student) => ({
    studentKey: student.studentKey || "",
    questionCount: student.questionCount ?? 0,
    answerableRate: student.answerableRate ?? 0,
    scores: Array.isArray(student.suggestedScores) ? student.suggestedScores : [0, 0, 0, 0],
    questions: (student.questions ?? student.sampleQuestions ?? []).join(" / "),
    answers: (student.answers ?? []).join(" / "),
    comment: student.comment || "",
    basis: toString(student.suggestedScores),
    feedback: student.comment || "",
  }));

  const workbookXml = buildSimpleWorkbookXml({
    subjectUnit,
    standard,
    materialTitle: material.materialTitle,
    records,
    standardAnalysis: {
      coreAchievement: "학생이 자료를 바탕으로 근거를 제시하고 성찰한다.",
      contentTargets: ["자료 근거 찾기", "질문 확장", "근거 공유"],
      evaluationElements: [
        {
          label: "질문-자료 정합성",
          focus: "학생 질문이 자료와 정합되는지",
          studentEvidence: "질문/답변 로그",
          rubricUse: "루브릭 1항목 기반 판단",
        },
      ],
    },
  });

  const filename = `${sanitizeFilename(subjectUnit || material.materialTitle)}_교사용_평가기록_${timestamp}.xls`;
  const filePath = `output/${filename}`;
  await mkdir("output", { recursive: true });
  await writeFile(filePath, workbookXml, "utf8");

  const success = {
    scenario,
    lessonCode,
    baseUrl,
    chat: {
      totalSteps: chatSteps.length,
      chatSteps,
    },
    cardsBuild,
    cardsGet,
    analysis,
    saveConnection,
    output: {
      excelPath: filePath,
      recordCount: records.length,
    },
  };

  console.log(JSON.stringify(success, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
