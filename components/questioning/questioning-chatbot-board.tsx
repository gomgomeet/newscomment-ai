"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Copy,
  Download,
  ExternalLink,
  FileImage,
  KeyRound,
  RefreshCw,
  SlidersHorizontal,
  ShieldCheck,
  Upload,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  QUESTIONING_AI_SETTINGS_KEY,
  QUESTIONING_CHATBOT_CONFIG_KEY,
  buildRubric,
  buildStandardAssessmentAnalysis,
  createDefaultQuestioningChatbotBehavior,
  createDefaultQuestioningLessonMaterial,
  isQuestioningAiSettings,
  normalizeQuestioningChatbotBehavior,
  questioningAiModelOptions,
  standardOptions,
  standardSource,
  type QuestioningAiSettings,
  type MaterialAnalysis,
  type QuestionClassifierKeywords,
  type QuestioningChatbotConfig,
  type QuestioningChatbotBehavior,
  type RubricCriterion,
  type StandardAssessmentAnalysis,
} from "@/lib/questioning-board";

const studentChatbotPath = "/questioning-chatbot";

const quickQuestions = [
  "자료에서 확인할 수 있는 중요한 사실은 무엇인가요?",
  "왜 이런 결과가 나타났을까요?",
  "우리 반이나 학교에서는 어떻게 적용할 수 있을까요?",
  "내 질문은 자료 속 근거를 확인하기에 좋은 질문인가요?",
];

const defaultAiModel = questioningAiModelOptions[0]?.value || "gemini-2.5-flash";
const defaultLessonMaterial = createDefaultQuestioningLessonMaterial();
const defaultChatbotBehavior = createDefaultQuestioningChatbotBehavior();

const classifierKeywordFields: {
  key: keyof QuestionClassifierKeywords;
  label: string;
  placeholder: string;
}[] = [
  { key: "inference", label: "추론 질문 판별 표현", placeholder: "왜, 어떻게, 까닭, 원인" },
  { key: "application", label: "적용 질문 판별 표현", placeholder: "우리, 나라면, 실천, 해결" },
  { key: "extension", label: "확장 질문 판별 표현", placeholder: "더 알아, 추가, 관련, 조사" },
  { key: "reflection", label: "성찰 질문 판별 표현", placeholder: "내 질문, 내 생각, 배운 점, 성찰" },
  { key: "off_topic", label: "범위 밖 질문 판별 표현", placeholder: "게임, 연예인, 날씨" },
  { key: "safety", label: "안전 확인 판별 표현", placeholder: "전화번호, 주소, 대필, 전체 정답" },
];

const evaluationRecordColumns = [
  { label: "학생이름", placeholder: "학생명" },
  { label: "성취기준·자료 연결", placeholder: "0~5" },
  { label: "자료 근거 확인", placeholder: "0~5" },
  { label: "질문 유형 확장", placeholder: "0~5" },
  { label: "질문 다시 쓰기·성찰", placeholder: "0~5" },
  { label: "총점", placeholder: "자동" },
  { label: "점수 근거", placeholder: "점수를 준 근거" },
  { label: "질문모음", placeholder: "학생 질문 기록" },
  { label: "챗봇 답변모음", placeholder: "챗봇 답변 기록" },
  { label: "세특용 피드백", placeholder: "학생 활동 피드백" },
];

const evaluationRecordGuideRows = [
  {
    label: "학생이름",
    guide: "학생 이름 또는 수업용 식별명을 입력합니다.",
    use: "학생별 평가 기록을 구분합니다.",
  },
  {
    label: "성취기준·자료 연결",
    guide: "학생 질문과 자료 근거가 성취기준의 핵심 행동과 연결되는지 0~5점으로 입력합니다.",
    use: "성취기준 도달 정도를 확인합니다.",
  },
  {
    label: "자료 근거 확인",
    guide: "챗봇 답을 자료 속 문장, 장면, 표로 다시 확인했는지 0~5점으로 입력합니다.",
    use: "AI 답 수용이 아니라 자료 기반 검증이 일어났는지 확인합니다.",
  },
  {
    label: "질문 유형 확장",
    guide: "사실 질문에서 추론, 적용, 성찰 질문으로 사고가 확장되는지 0~5점으로 입력합니다.",
    use: "질문 수준과 사고 확장 과정을 확인합니다.",
  },
  {
    label: "질문 다시 쓰기·성찰",
    guide: "처음 질문을 다시 쓰고 바꾼 이유를 설명하는지 0~5점으로 입력합니다.",
    use: "성취기준별 도달 정도와 총점을 확인합니다.",
  },
  {
    label: "총점",
    guide: "네 개 평가기준 점수를 합산합니다.",
    use: "학생별 전체 수행 수준을 빠르게 파악합니다.",
  },
  {
    label: "점수 근거",
    guide: "점수를 준 이유가 되는 학생 발화, 근거 확인, 질문 변화 내용을 적습니다.",
    use: "평가 판단의 설명 가능성을 높입니다.",
  },
  {
    label: "질문모음",
    guide: "첫 질문, 후속 질문, 확장 질문, 다시 쓴 질문을 모아 둡니다.",
    use: "질문 유형과 사고 확장 과정을 확인합니다.",
  },
  {
    label: "챗봇 답변모음",
    guide: "챗봇의 핵심 답변, 힌트, 다시 질문하도록 돕는 피드백을 모아 둡니다.",
    use: "학생이 받은 지원과 근거 확인 과정을 추적합니다.",
  },
  {
    label: "세특용 피드백",
    guide: "관찰 가능한 활동 내용, 질문의 성장, 다음 과제를 문장으로 정리합니다.",
    use: "세특이나 개별 피드백 초안으로 활용합니다.",
  },
];

function splitLines(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function createManualMaterial({
  title,
  notes,
}: {
  title: string;
  notes: string;
}): MaterialAnalysis {
  const lines = splitLines(notes);
  return {
    materialTitle: title.trim() || "교사 입력 수업 자료",
    summary: notes.trim() || "교사가 수업 중 제시한 자료를 바탕으로 질문을 만들고 근거를 확인합니다.",
    visibleText: notes.trim(),
    keyConcepts: lines.slice(0, 5),
    possibleMisconceptions: ["챗봇 답을 그대로 믿고 자료 근거를 확인하지 않을 수 있음"],
    questionSeeds: quickQuestions,
    sourceLimit: "교사가 입력한 질문 자료 전체 내용 안에서만 답합니다.",
    safetyNotice: "학생 개인정보와 사진 속 식별 정보는 입력하지 않습니다.",
  };
}

function buildPrdText({
  targetGrade,
  subjectUnit,
  standard,
  assessmentAnalysis,
  material,
  rubric,
  behavior,
}: {
  targetGrade: string;
  subjectUnit: string;
  standard: string;
  assessmentAnalysis: StandardAssessmentAnalysis;
  material: MaterialAnalysis;
  rubric: RubricCriterion[];
  behavior: QuestioningChatbotBehavior;
}) {
  const rubricSummary = rubric
    .map(
      (criterion) =>
        `- ${criterion.label}: ${criterion.description}\n  관찰 증거: ${criterion.observableEvidence}\n  피드백 방향: ${criterion.feedbackForward}`,
    )
    .join("\n");

  const questionSeeds = (material.questionSeeds.length ? material.questionSeeds : quickQuestions)
    .slice(0, 4)
    .map((seed) => `- ${seed}`)
    .join("\n");

  const classifierSummary = classifierKeywordFields
    .map((field) => `- ${field.label}: ${behavior.classifierKeywords[field.key].join(", ") || "사용 안 함"}`)
    .join("\n");

  return `# 질문하기 수업용 학생 챗봇 제작 PRD

## 1. 수업 기본 정보
- 대상: ${targetGrade || "미정"}
- 교과/단원: ${subjectUnit || "미정"}
- 성취기준: ${standard || "미정"}
- 수업 자료: ${material.materialTitle || "미정"}
- 기본 성취기준 자료: ${standardSource.title} (${standardSource.url})

## 2. 이 HTML의 구조
- 교사용 보드: 성취기준, 루브릭, 수업 자료, 평가 산출물 구조를 준비한다.
- 학생용 질문 도우미 챗봇: 교사용 보드에서 저장한 자료 범위를 받아 학생의 질문·대답·생각과 대화한다.
- 질문 자료 표시 원칙: 교사용 보드에 반영한 전체 텍스트를 요약하거나 생략하지 않고 문단과 줄바꿈을 유지해 학생에게 보여 준다.

## 3. 학생 챗봇 역할
학생이 한 질문·대답·생각을 먼저 구체적으로 받아 주고 질문 자료와 연결해 대화한다. 질문 종류나 분석 결과를 학생에게 설명하지 않고, 자연스러운 후속 질문 하나로 학생이 스스로 더 분명하고 깊은 질문을 만들도록 돕는다. 활동지 정답 전체 작성이나 수행평가 대필은 하지 않는다.

### 3-1. 질문 응답 역할 상세
1. 학생이 ‘채팅 시작’을 누르면 챗봇이 먼저 인사하고 질문 자료에서 눈에 들어온 내용이나 궁금한 점을 묻는다.
2. 학생 발화가 질문이면 질문 자료의 구체적인 사실과 표현을 근거로 답한다.
3. 학생 발화가 챗봇의 후속 질문에 대한 대답이나 생각이면 그 내용을 먼저 구체적으로 받아 주고 앞선 대화와 연결한다.
4. 응답 뒤에는 학생이 자신의 생각을 더 말하거나 새로운 궁금증을 만들 수 있는 짧고 자연스러운 후속 질문을 하나만 묻는다.
5. 사실·추론·적용·확장·성찰 등의 질문 분류와 루브릭 분석은 교사용 내부 평가 정보로만 저장하고 학생 화면에는 표시하지 않는다.
6. 자료에 직접 없는 내용은 질문 종류를 말하지 않고 수업 주제와 연결되는 범위와 추가 확인이 필요함을 자연스럽게 설명한다.
7. 실시간 검색이나 교사가 제공한 추가 자료가 없으면 출처를 지어내지 않고, 확인할 검색어·출처 유형·점검 질문을 제안한다.
8. 수업 내용과 상관없는 질문에는 “수업 내용과 관련된 질문에 대해서만 응답할 수 있어요.”라고 답하고, 자료와 연결된 후속 질문으로 대화를 다시 잇는다.
9. 학생 발화가 짧거나 막연해도 틀렸다고 말하지 않고 가능한 의미를 먼저 받아 준 뒤, 후속 질문으로 생각을 구체화하도록 돕는다.

### 3-2. 자연스러운 후속 질문 예시
- 그렇게 생각했군요. 자료의 어떤 장면이 그 생각과 가장 잘 연결되나요?
- 이 내용을 알고 나니 다음으로 무엇이 궁금해졌나요?
- 우리 생활에 옮겨 본다면 가장 먼저 무엇을 해 볼 수 있을까요?

## 4. 성취기준 분석
- 핵심 성취: ${assessmentAnalysis.coreAchievement}
- 내용 요소: ${assessmentAnalysis.contentTargets.join(", ")}
- 수행 행동: ${assessmentAnalysis.performanceBehaviors.join(" / ")}
- 학생 산출물: ${assessmentAnalysis.studentProducts.join(", ")}

## 5. 질문 유형과 평가 연결
${assessmentAnalysis.questionTypeLinks
  .map((link) => `- ${link.label}: ${link.assessmentRole} / 수집 증거: ${link.evidenceToCollect}`)
  .join("\n")}

## 6. 학생에게 보여 줄 질문 자료 전체 내용
${material.visibleText || material.summary || "질문 자료 전체 내용을 입력해야 합니다."}

## 7. 핵심 개념
${material.keyConcepts.map((concept) => `- ${concept}`).join("\n") || "- 미정"}

## 8. 루브릭
${rubricSummary}

## 9. 학생 기록 필드
- 학생이름
- 성취기준·자료 연결
- 자료 근거 확인
- 질문 유형 확장
- 질문 다시 쓰기·성찰
- 총점
- 점수 근거
- 질문모음
- 챗봇 답변모음
- 세특용 피드백

## 10. 질문 씨앗
${questionSeeds}

## 11. 교사 편집 챗봇 동작 설정
${classifierSummary}
- 사실 질문: 다른 유형의 판별 표현이 없을 때 기본 분류
- 범위 밖 질문 응답: ${behavior.offTopicResponse}
- 짧거나 막연한 발화 이어가기: ${behavior.insufficientQuestionResponse}
- 추가 지시: ${behavior.additionalInstructions}

## 12. 응답 제한
${material.sourceLimit || "교사가 제공한 수업 자료 범위 안에서만 답한다."}

## 13. 안전 규칙
${material.safetyNotice || "개인정보, 정답 대필, 원문 전체 복사 요청을 제한한다."}
`;
}

function escapeXml(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function textCell(value: string | number, styleId?: string) {
  const style = styleId ? ` ss:StyleID="${styleId}"` : "";
  return `<Cell${style}><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
}

function numberCell(value: number, styleId?: string) {
  const style = styleId ? ` ss:StyleID="${styleId}"` : "";
  return `<Cell${style}><Data ss:Type="Number">${value}</Data></Cell>`;
}

function formulaCell(formula: string, styleId?: string) {
  const style = styleId ? ` ss:StyleID="${styleId}"` : "";
  return `<Cell${style} ss:Formula="${escapeXml(formula)}"><Data ss:Type="Number">0</Data></Cell>`;
}

function sanitizeFilename(value: string) {
  return (value.trim() || "질문하기_평가기록")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "_")
    .slice(0, 48);
}

function buildEvaluationWorkbookXml({
  targetGrade,
  subjectUnit,
  standard,
  assessmentAnalysis,
  materialTitle,
  rubric,
}: {
  targetGrade: string;
  subjectUnit: string;
  standard: string;
  assessmentAnalysis: StandardAssessmentAnalysis;
  materialTitle: string;
  rubric: RubricCriterion[];
}) {
  const recordHeaders = [
    ...evaluationRecordColumns.map((column) => column.label),
  ];
  const scoreColumnCount = 4;
  const mergedHeaderColumns = recordHeaders.length - 1;
  const blankRows = Array.from({ length: 30 }, (_, index) => {
    const cells = [
      textCell(index === 0 ? "예: 김OO" : ""),
      ...Array.from({ length: scoreColumnCount }, () => numberCell(0)),
      formulaCell(`=SUM(RC[-${scoreColumnCount}]:RC[-1])`, "Score"),
      ...Array.from({ length: 4 }, () => textCell("")),
    ];
    return `<Row>${cells.join("")}</Row>`;
  }).join("");

  const levelScores = [0, 1, 2, 3, 4, 5];
  const rubricRows = rubric
    .map((criterion) => {
      const levelMap = new Map(criterion.levels.map((level) => [level.score, `${level.label}: ${level.descriptor}`]));
      return `<Row>${[
        textCell(criterion.label),
        textCell(criterion.description),
        textCell(criterion.observableEvidence),
        textCell(criterion.feedbackForward),
        ...levelScores.map((score) => textCell(levelMap.get(score) || "")),
      ].join("")}</Row>`;
    })
    .join("");

  const recordFieldWorkbookRows = evaluationRecordGuideRows
    .map((row) => `<Row>${[textCell(row.label), textCell(row.guide), textCell(row.use)].join("")}</Row>`)
    .join("");

  const behaviorRows = assessmentAnalysis.performanceBehaviors
    .map((behavior) => `<Row>${[textCell("수행 행동"), textCell(behavior)].join("")}</Row>`)
    .join("");
  const elementRows = assessmentAnalysis.evaluationElements
    .map((element) =>
      `<Row>${[
        textCell(element.label),
        textCell(element.focus),
        textCell(element.studentEvidence),
        textCell(element.rubricUse),
      ].join("")}</Row>`,
    )
    .join("");
  const questionTypeRows = assessmentAnalysis.questionTypeLinks
    .map((link) =>
      `<Row>${[textCell(link.label), textCell(link.assessmentRole), textCell(link.evidenceToCollect)].join("")}</Row>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#EEF2F7" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:WrapText="1"/></Style>
    <Style ss:ID="Title"><Font ss:Bold="1" ss:Size="14"/><Alignment ss:Vertical="Center"/></Style>
    <Style ss:ID="Score"><NumberFormat ss:Format="0"/></Style>
  </Styles>
  <Worksheet ss:Name="평가 기록">
    <Table>
      <Column ss:Width="110"/>
      <Column ss:Width="105"/>
      <Column ss:Width="105"/>
      <Column ss:Width="105"/>
      <Column ss:Width="125"/>
      <Column ss:Width="60"/>
      <Column ss:Width="260"/>
      <Column ss:Width="260"/>
      <Column ss:Width="260"/>
      <Column ss:Width="320"/>
      <Row><Cell ss:MergeAcross="${mergedHeaderColumns}" ss:StyleID="Title"><Data ss:Type="String">${escapeXml(subjectUnit || "질문하기 수업")} 평가 기록</Data></Cell></Row>
      <Row>${[textCell("대상", "Header"), textCell(targetGrade || "미정"), textCell("성취기준", "Header"), textCell(standard || "미정"), textCell("수업 자료", "Header"), textCell(materialTitle || "미정")].join("")}</Row>
      <Row>${recordHeaders.map((header) => textCell(header, "Header")).join("")}</Row>
      ${blankRows}
    </Table>
  </Worksheet>
  <Worksheet ss:Name="성취기준 분석">
    <Table>
      <Column ss:Width="150"/>
      <Column ss:Width="420"/>
      <Column ss:Width="260"/>
      <Column ss:Width="260"/>
      <Row><Cell ss:MergeAcross="3" ss:StyleID="Title"><Data ss:Type="String">성취기준 분석</Data></Cell></Row>
      <Row>${[textCell("기본 자료", "Header"), textCell(`${standardSource.title} (${standardSource.url})`)].join("")}</Row>
      <Row>${[textCell("성취기준", "Header"), textCell(standard || "미정")].join("")}</Row>
      <Row>${[textCell("핵심 성취", "Header"), textCell(assessmentAnalysis.coreAchievement)].join("")}</Row>
      <Row>${[textCell("내용 요소", "Header"), textCell(assessmentAnalysis.contentTargets.join(", "))].join("")}</Row>
      ${behaviorRows}
      <Row>${["평가 요소", "평가 초점", "학생 산출물/관찰 증거", "루브릭 활용"].map((header) => textCell(header, "Header")).join("")}</Row>
      ${elementRows}
      <Row>${["질문 유형", "평가에서의 역할", "수집할 증거"].map((header) => textCell(header, "Header")).join("")}</Row>
      ${questionTypeRows}
    </Table>
  </Worksheet>
  <Worksheet ss:Name="루브릭">
    <Table>
      <Column ss:Width="140"/>
      <Column ss:Width="240"/>
      <Column ss:Width="260"/>
      <Column ss:Width="260"/>
      ${levelScores.map(() => '<Column ss:Width="240"/>').join("")}
      <Row>${["항목", "설명", "관찰 증거", "피드백 방향", ...levelScores.map((score) => `${score}점`)].map((header) => textCell(header, "Header")).join("")}</Row>
      ${rubricRows}
    </Table>
  </Worksheet>
  <Worksheet ss:Name="평가 기록 작성 기준">
    <Table>
      <Column ss:Width="150"/>
      <Column ss:Width="320"/>
      <Column ss:Width="280"/>
      <Row>${["열 이름", "작성 내용", "활용"].map((header) => textCell(header, "Header")).join("")}</Row>
      ${recordFieldWorkbookRows}
    </Table>
  </Worksheet>
</Workbook>`;
}

function downloadExcelWorkbook(workbookXml: string, filename: string) {
  const blob = new Blob([workbookXml], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export function QuestioningChatbotBoard() {
  const [selectedStandardId, setSelectedStandardId] = useState(standardOptions[0].id);
  const [customStandard, setCustomStandard] = useState("");
  const [targetGrade, setTargetGrade] = useState(standardOptions[0].gradeBand);
  const [subjectUnit, setSubjectUnit] = useState(`${standardOptions[0].subject} / 질문하기 수업`);
  const [materialTitle, setMaterialTitle] = useState(defaultLessonMaterial.materialTitle);
  const [teacherNotes, setTeacherNotes] = useState(defaultLessonMaterial.visibleText);
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [imageName, setImageName] = useState("");
  const [material, setMaterial] = useState<MaterialAnalysis>(defaultLessonMaterial);
  const [behavior, setBehavior] = useState<QuestioningChatbotBehavior>(defaultChatbotBehavior);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRubricOpen, setIsRubricOpen] = useState(false);
  const [isStandardDetailsOpen, setIsStandardDetailsOpen] = useState(false);
  const [isBehaviorSettingsOpen, setIsBehaviorSettingsOpen] = useState(false);
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModel, setAiModel] = useState(defaultAiModel);
  const [isAiKeySaved, setIsAiKeySaved] = useState(false);
  const [notice, setNotice] = useState("");

  const selectedStandard = standardOptions.find((option) => option.id === selectedStandardId) || standardOptions[0];
  const standardText = selectedStandardId === "custom" ? customStandard : selectedStandard.standard;
  const assessmentAnalysis = useMemo(() => buildStandardAssessmentAnalysis(standardText), [standardText]);
  const rubric = useMemo(() => buildRubric(standardText), [standardText]);
  const totalScore = rubric.length * 5;
  const configuredMaterial = useMemo(() => {
    const fullText = teacherNotes.trim();
    const nextTitle = materialTitle.trim() || material.materialTitle || "교사 입력 질문 자료";

    if (!fullText || fullText === material.visibleText.trim()) {
      return {
        ...material,
        materialTitle: nextTitle,
      };
    }

    return createManualMaterial({ title: nextTitle, notes: fullText });
  }, [material, materialTitle, teacherNotes]);
  const prdText = useMemo(
    () =>
      buildPrdText({
        targetGrade,
        subjectUnit,
        standard: standardText,
        assessmentAnalysis,
        material: configuredMaterial,
        rubric,
        behavior,
      }),
    [assessmentAnalysis, behavior, configuredMaterial, rubric, standardText, subjectUnit, targetGrade],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = window.localStorage.getItem(QUESTIONING_AI_SETTINGS_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as unknown;
          if (isQuestioningAiSettings(parsed)) {
            setAiApiKey(parsed.apiKey);
            setAiModel(parsed.model || defaultAiModel);
            setIsAiKeySaved(Boolean(parsed.apiKey.trim()));
          }
        } catch {
          window.localStorage.removeItem(QUESTIONING_AI_SETTINGS_KEY);
        }
      }

      const storedConfig = window.localStorage.getItem(QUESTIONING_CHATBOT_CONFIG_KEY);
      if (storedConfig) {
        try {
          const parsedConfig = JSON.parse(storedConfig) as { behavior?: unknown };
          setBehavior(normalizeQuestioningChatbotBehavior(parsedConfig.behavior));
        } catch {
          setBehavior(createDefaultQuestioningChatbotBehavior());
        }
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  function getAiRequestPayload() {
    const apiKey = aiApiKey.trim();
    return {
      model: aiModel,
      ...(apiKey ? { apiKey } : {}),
    };
  }

  function handleSaveAiSettings() {
    const apiKey = aiApiKey.trim();
    if (!apiKey) {
      window.localStorage.removeItem(QUESTIONING_AI_SETTINGS_KEY);
      setIsAiKeySaved(false);
      setNotice("API 키 없이 서버 기본 설정 또는 로컬 예비 모드로 사용합니다.");
      return;
    }

    const settings: QuestioningAiSettings = {
      provider: "gemini",
      apiKey,
      model: aiModel,
    };
    window.localStorage.setItem(QUESTIONING_AI_SETTINGS_KEY, JSON.stringify(settings));
    setAiApiKey(apiKey);
    setIsAiKeySaved(true);
    setNotice("Gemini API 키를 이 브라우저에 저장했습니다.");
  }

  function handleClearAiSettings() {
    window.localStorage.removeItem(QUESTIONING_AI_SETTINGS_KEY);
    setAiApiKey("");
    setAiModel(defaultAiModel);
    setIsAiKeySaved(false);
    setNotice("Gemini API 키를 이 브라우저에서 삭제했습니다.");
  }

  function handleStandardChange(value: string) {
    setSelectedStandardId(value);
    if (value !== "custom") {
      const nextStandard = standardOptions.find((option) => option.id === value);
      if (nextStandard) {
        setTargetGrade(nextStandard.gradeBand);
        setSubjectUnit(`${nextStandard.subject} / ${nextStandard.title}`);
      }
    }
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setNotice("이미지 파일만 업로드할 수 있습니다.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setImageDataUrl(result);
      setImageName(file.name);
      setNotice("");
      if (!materialTitle || materialTitle === "수업 자료") {
        setMaterialTitle(file.name.replace(/\.[^.]+$/, ""));
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleAnalyzeImage() {
    if (!imageDataUrl) {
      setNotice("먼저 수업 자료 이미지를 업로드해 주세요.");
      return;
    }

    setIsAnalyzing(true);
    setNotice("");

    try {
      const response = await fetch("/api/questioning-board/analyze-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl,
          standard: standardText,
          targetGrade,
          subjectUnit,
          teacherNotes,
          ...getAiRequestPayload(),
        }),
      });
      const payload = (await response.json()) as Partial<MaterialAnalysis> & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "이미지 분석에 실패했습니다.");
      }

      const analyzedMaterial: MaterialAnalysis = {
        materialTitle: payload.materialTitle || materialTitle,
        summary: payload.summary || teacherNotes,
        visibleText: payload.visibleText || teacherNotes,
        keyConcepts: payload.keyConcepts || [],
        possibleMisconceptions: payload.possibleMisconceptions || [],
        questionSeeds: payload.questionSeeds || quickQuestions,
        sourceLimit: payload.sourceLimit || "분석된 수업 자료 범위 안에서만 답합니다.",
        safetyNotice: payload.safetyNotice || "학생 개인정보는 입력하지 않습니다.",
      };
      setMaterial(analyzedMaterial);
      setMaterialTitle(analyzedMaterial.materialTitle);
      setTeacherNotes(analyzedMaterial.visibleText);
      setNotice("이미지에서 추출한 질문 자료 전체 내용을 학생용 챗봇에 반영할 준비를 마쳤습니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "이미지 분석에 실패했습니다.";
      setNotice(`${message} 질문 자료 전체 내용을 직접 입력해도 보드를 사용할 수 있습니다.`);
    } finally {
      setIsAnalyzing(false);
    }
  }

  function handleUseManualMaterial() {
    setMaterial(createManualMaterial({ title: materialTitle, notes: teacherNotes }));
    setNotice("교사가 입력한 질문 자료 전체 내용을 학생용 챗봇에 반영했습니다.");
  }

  function handleClassifierKeywordsChange(key: keyof QuestionClassifierKeywords, value: string) {
    setBehavior((current) => ({
      ...current,
      classifierKeywords: {
        ...current.classifierKeywords,
        [key]: splitLines(value),
      },
    }));
  }

  function handleBehaviorTextChange(
    key: "offTopicResponse" | "insufficientQuestionResponse" | "additionalInstructions",
    value: string,
  ) {
    setBehavior((current) => ({ ...current, [key]: value }));
  }

  function saveStudentChatbotConfig(successNotice = "현재 설정을 학생용 질문 도우미 챗봇에 연결했습니다.") {
    if (!configuredMaterial.visibleText.trim() && !configuredMaterial.summary.trim()) {
      setNotice("학생용 챗봇을 열기 전에 질문 자료 전체 내용을 입력해 주세요.");
      return false;
    }

    const normalizedBehavior = normalizeQuestioningChatbotBehavior(behavior);
    const normalizedPrdText = buildPrdText({
      targetGrade,
      subjectUnit,
      standard: standardText,
      assessmentAnalysis,
      material: configuredMaterial,
      rubric,
      behavior: normalizedBehavior,
    });
    const config: QuestioningChatbotConfig = {
      targetGrade,
      subjectUnit,
      standard: standardText,
      assessmentAnalysis,
      material: configuredMaterial,
      rubric,
      behavior: normalizedBehavior,
      prdText: normalizedPrdText,
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(QUESTIONING_CHATBOT_CONFIG_KEY, JSON.stringify(config));
    setMaterial(configuredMaterial);
    setBehavior(normalizedBehavior);
    setNotice(successNotice);
    return true;
  }

  function handleApplyChatbotSettings() {
    saveStudentChatbotConfig("질문 자료 전체 내용과 챗봇 동작 설정을 학생용 챗봇에 적용했습니다.");
  }

  function handleOpenStudentChatbot() {
    if (saveStudentChatbotConfig()) {
      window.open(studentChatbotPath, "_blank", "noopener,noreferrer");
    }
  }

  async function handleCopyPrd() {
    await navigator.clipboard.writeText(prdText);
    setNotice("현재 보드 설정을 챗봇 제작 PRD로 복사했습니다.");
  }

  function handleDownloadEvaluationWorkbook() {
    const workbookXml = buildEvaluationWorkbookXml({
      targetGrade,
      subjectUnit,
      standard: standardText,
      assessmentAnalysis,
      materialTitle: configuredMaterial.materialTitle || materialTitle,
      rubric,
    });
    const filename = `${sanitizeFilename(subjectUnit || materialTitle)}_교사용_평가기록.xls`;
    downloadExcelWorkbook(workbookXml, filename);
    setNotice("5번 교사용 평가 기록 엑셀 파일을 내려받았습니다.");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <div className="rounded-md border border-border bg-background p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <KeyRound className="size-4 text-primary" aria-hidden="true" />
              <p className="font-semibold">Gemini API 연결</p>
              <p className="text-muted-foreground">
                Google AI Studio에서 발급한 키를 넣으면 이미지 분석과 학생 챗봇 응답을 Gemini가 처리합니다.
              </p>
            </div>
            <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_220px_auto_auto]">
              <Label htmlFor="ai-api-key" className="sr-only">
                Gemini API 키
              </Label>
              <Input
                id="ai-api-key"
                type="password"
                value={aiApiKey}
                onChange={(event) => {
                  setAiApiKey(event.target.value);
                  setIsAiKeySaved(false);
                }}
                placeholder="Gemini API 키 입력"
                autoComplete="off"
              />
              <Label htmlFor="ai-model" className="sr-only">
                Gemini 모델
              </Label>
              <Select id="ai-model" value={aiModel} onChange={(event) => setAiModel(event.target.value)}>
                {questioningAiModelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <Button type="button" variant="outline" onClick={handleSaveAiSettings}>
                키 저장
              </Button>
              <Button type="button" variant="outline" onClick={handleClearAiSettings}>
                키 지우기
              </Button>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              키는 이 브라우저(localStorage)에만 저장됩니다. 코드나 문서에는 포함되지 않으며, 학교 공용 PC에서는 사용 후 키를 지워 주세요.{" "}
              <span className="font-medium text-foreground">
                {isAiKeySaved ? "키 저장됨" : "키 없음 — 서버 기본 설정 또는 로컬 예비 모드 사용 가능"}
              </span>
            </p>
          </div>
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <h1 className="text-2xl font-semibold leading-tight sm:text-3xl">
                질문 챗봇 제작보드(교사용)
              </h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={handleCopyPrd}>
                <Copy className="size-4" aria-hidden="true" />
                PRD 복사
              </Button>
              <Button type="button" onClick={handleOpenStudentChatbot}>
                <ExternalLink className="size-4" aria-hidden="true" />
                학생용 챗봇 열기
              </Button>
            </div>
          </div>
          {notice ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>{notice}</p>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl items-start gap-4 px-4 py-5 sm:grid-cols-2 sm:px-6 lg:px-8 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,0.85fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
        <>
          <div className="rounded-md border border-border bg-card">
            <div className="border-b border-border p-4">
              <div className="flex items-center gap-2">
                <ClipboardList className="size-5 text-primary" aria-hidden="true" />
                <h2 className="text-base font-semibold">1. 성취기준 선택</h2>
              </div>
            </div>
            <div className="space-y-4 p-4">
              <div className="space-y-2">
                <Label htmlFor="target-grade">대상</Label>
                <Input
                  id="target-grade"
                  value={targetGrade}
                  onChange={(event) => setTargetGrade(event.target.value)}
                  placeholder="예: 초등 5학년"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject-unit">교과 / 단원</Label>
                <Input
                  id="subject-unit"
                  value={subjectUnit}
                  onChange={(event) => setSubjectUnit(event.target.value)}
                  placeholder="예: 국어 / 자료 읽고 질문하기"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="standard-select">성취기준</Label>
                <Select
                  id="standard-select"
                  value={selectedStandardId}
                  onChange={(event) => handleStandardChange(event.target.value)}
                >
                  {standardOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.gradeBand} · {option.subject} · {option.title}
                    </option>
                  ))}
                  <option value="custom">직접 입력</option>
                </Select>
              </div>
              {selectedStandardId === "custom" ? (
                <div className="space-y-2">
                  <Label htmlFor="custom-standard">직접 입력한 성취기준</Label>
                  <Textarea
                    id="custom-standard"
                    value={customStandard}
                    onChange={(event) => setCustomStandard(event.target.value)}
                    placeholder="성취기준 또는 수업 목표를 입력하세요."
                  />
                </div>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="w-full justify-between"
                aria-expanded={isStandardDetailsOpen}
                onClick={() => setIsStandardDetailsOpen((current) => !current)}
              >
                성취기준 상세 분석 {isStandardDetailsOpen ? "접기" : "펼쳐보기"}
                {isStandardDetailsOpen ? (
                  <ChevronUp className="size-4" aria-hidden="true" />
                ) : (
                  <ChevronDown className="size-4" aria-hidden="true" />
                )}
              </Button>
              {isStandardDetailsOpen ? (
                <div className="space-y-4">
                  {selectedStandardId === "custom" ? null : (
                    <div className="rounded-md border border-border bg-background p-3 text-sm leading-6">
                      <p className="font-medium">{selectedStandard.gradeBand}</p>
                      <p className="mt-1 text-muted-foreground">{selectedStandard.standard}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{selectedStandard.classroomGoal}</p>
                    </div>
                  )}
                  <div className="rounded-md border border-border bg-background p-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
                      <h3 className="text-sm font-semibold">성취기준 분석</h3>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      핵심 성취: {assessmentAnalysis.coreAchievement}
                    </p>
                    <div className="mt-3 space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">내용 요소</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {assessmentAnalysis.contentTargets.map((target) => (
                            <span key={target} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                              {target}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">수행 행동</p>
                        <ul className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
                          {assessmentAnalysis.performanceBehaviors.slice(0, 4).map((behavior) => (
                            <li key={behavior}>- {behavior}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">평가 요소</p>
                        <div className="mt-2 grid gap-2">
                          {assessmentAnalysis.evaluationElements.map((element) => (
                            <div key={element.key} className="rounded-md border border-border bg-card p-2">
                              <p className="text-xs font-semibold">{element.label}</p>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">{element.focus}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-md border border-border bg-card">
            <div className="border-b border-border p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
                <h2 className="text-base font-semibold">2. 평가 루브릭</h2>
              </div>
            </div>
            <div className="space-y-3 p-4">
              <div className="rounded-md border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">총 {totalScore}점 · 4개 평가 항목</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      성취기준 기반 루브릭으로 학생 산출물에서 보이는 증거와 다음 피드백을 함께 확인합니다.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setIsRubricOpen((current) => !current)}
                  >
                    {isRubricOpen ? "접기" : "전체 보기"}
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {rubric.map((criterion) => (
                    <span key={criterion.key} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                      {criterion.label}
                    </span>
                  ))}
                </div>
              </div>

              {isRubricOpen ? (
                <div className="space-y-3">
                  {rubric.map((criterion) => (
                    <div key={criterion.key} className="rounded-md border border-border bg-background p-3">
                      <h3 className="text-sm font-semibold">{criterion.label}</h3>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">{criterion.description}</p>
                      <div className="mt-3 grid gap-2 text-xs leading-5 text-muted-foreground">
                        <p>
                          <b className="text-foreground">관찰 증거</b> · {criterion.observableEvidence}
                        </p>
                        <p>
                          <b className="text-foreground">피드백 방향</b> · {criterion.feedbackForward}
                        </p>
                      </div>
                      <div className="mt-3 grid gap-2">
                        {criterion.levels.map((level) => (
                          <div key={level.score} className="grid grid-cols-[34px_minmax(0,1fr)] gap-2 text-xs">
                            <span className="rounded-md bg-muted px-2 py-1 text-center font-semibold">{level.score}</span>
                            <span className="leading-5 text-muted-foreground">
                              <b className="text-foreground">{level.label}</b> · {level.descriptor}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <div className="rounded-md border border-border bg-card">
            <div className="border-b border-border p-4">
              <div className="flex items-center gap-2">
                <FileImage className="size-5 text-primary" aria-hidden="true" />
                <h2 className="text-base font-semibold">3. 질문 자료 입력</h2>
              </div>
            </div>
            <div className="grid gap-4 p-4 2xl:grid-cols-[240px_minmax(0,1fr)]">
              <div className="space-y-3">
                <Label htmlFor="material-title">자료 이름</Label>
                <Input
                  id="material-title"
                  value={materialTitle}
                  onChange={(event) => setMaterialTitle(event.target.value)}
                  placeholder="예: 신문기사 사진, 교과서 지문"
                />
                <label className="flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-border bg-background p-4 text-center text-sm text-muted-foreground hover:bg-muted">
                  <Upload className="mb-3 size-6 text-primary" aria-hidden="true" />
                  <span className="font-medium text-foreground">이미지 업로드</span>
                  <span className="mt-1 text-xs">JPG, PNG 등 수업 자료 이미지</span>
                  <input type="file" accept="image/*" className="sr-only" onChange={handleImageChange} />
                </label>
                {imageDataUrl ? (
                  <div className="overflow-hidden rounded-md border border-border bg-background">
                    <Image
                      src={imageDataUrl}
                      alt={imageName || "업로드한 수업 자료"}
                      width={520}
                      height={360}
                      unoptimized
                      className="max-h-56 w-full object-contain"
                    />
                    <p className="truncate border-t border-border px-3 py-2 text-xs text-muted-foreground">{imageName}</p>
                  </div>
                ) : null}
              </div>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="teacher-notes">질문 자료 전체 내용</Label>
                  <Textarea
                    id="teacher-notes"
                    value={teacherNotes}
                    onChange={(event) => setTeacherNotes(event.target.value)}
                    className="min-h-40"
                    placeholder="학생에게 보여 줄 질문 자료 전체 내용을 문단과 줄바꿈을 유지해 입력하세요."
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={handleAnalyzeImage} disabled={isAnalyzing || !imageDataUrl}>
                    {isAnalyzing ? <RefreshCw className="size-4 animate-spin" aria-hidden="true" /> : <Wand2 className="size-4" aria-hidden="true" />}
                    AI 전체 텍스트 추출
                  </Button>
                  <Button type="button" variant="outline" onClick={handleUseManualMaterial}>
                    전체 내용 반영
                  </Button>
                </div>
              </div>
            </div>
          </div>

        </>

        <>
          <div className="rounded-md border border-border bg-card">
            <div className="border-b border-border p-4">
              <div className="flex items-center gap-2">
                <Bot className="size-5 text-primary" aria-hidden="true" />
                <h2 className="text-base font-semibold">4. 챗봇 제작 PRD</h2>
              </div>
            </div>
            <div className="space-y-4 p-4">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-between"
                aria-expanded={isBehaviorSettingsOpen}
                onClick={() => setIsBehaviorSettingsOpen((current) => !current)}
              >
                <span className="flex items-center gap-2">
                  <SlidersHorizontal className="size-4" aria-hidden="true" />
                  챗봇 동작 설정 {isBehaviorSettingsOpen ? "접기" : "펼쳐보기"}
                </span>
                {isBehaviorSettingsOpen ? (
                  <ChevronUp className="size-4" aria-hidden="true" />
                ) : (
                  <ChevronDown className="size-4" aria-hidden="true" />
                )}
              </Button>
              {isBehaviorSettingsOpen ? (
                <div className="space-y-4 border-b border-border pb-4">
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold">로컬 질문 분류 기준</h3>
                    {classifierKeywordFields.map((field) => (
                      <div key={field.key} className="space-y-2">
                        <Label htmlFor={`classifier-${field.key}`}>{field.label}</Label>
                        <Textarea
                          id={`classifier-${field.key}`}
                          value={behavior.classifierKeywords[field.key].join(", ")}
                          onChange={(event) => handleClassifierKeywordsChange(field.key, event.target.value)}
                          placeholder={field.placeholder}
                          className="min-h-16"
                        />
                      </div>
                    ))}
                    <p className="text-xs leading-5 text-muted-foreground">
                      위 판별 표현에 해당하지 않으면 사실 질문으로 분류합니다.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold">학생 응답 문구</h3>
                    <div className="space-y-2">
                      <Label htmlFor="off-topic-response">범위 밖 질문 응답</Label>
                      <Textarea
                        id="off-topic-response"
                        value={behavior.offTopicResponse}
                        onChange={(event) => handleBehaviorTextChange("offTopicResponse", event.target.value)}
                        className="min-h-24"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="insufficient-question-response">짧거나 막연한 발화 이어가기</Label>
                      <Textarea
                        id="insufficient-question-response"
                        value={behavior.insufficientQuestionResponse}
                        onChange={(event) =>
                          handleBehaviorTextChange("insufficientQuestionResponse", event.target.value)
                        }
                        className="min-h-24"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="additional-chatbot-instructions">추가 챗봇 지시</Label>
                      <Textarea
                        id="additional-chatbot-instructions"
                        value={behavior.additionalInstructions}
                        onChange={(event) => handleBehaviorTextChange("additionalInstructions", event.target.value)}
                        className="min-h-28"
                      />
                    </div>
                  </div>
                </div>
              ) : null}
              <Button type="button" className="w-full" onClick={handleApplyChatbotSettings}>
                <CheckCircle2 className="size-4" aria-hidden="true" />
                현재 설정을 챗봇에 적용
              </Button>
              <Textarea value={prdText} readOnly className="min-h-[520px] font-mono text-xs leading-5" />
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                <Button type="button" variant="outline" onClick={handleCopyPrd}>
                  <Copy className="size-4" aria-hidden="true" />
                  PRD 복사
                </Button>
                <Button type="button" onClick={handleOpenStudentChatbot}>
                  <ExternalLink className="size-4" aria-hidden="true" />
                  학생용 챗봇 열기
                </Button>
              </div>
              <div className="rounded-md border border-border bg-background p-3 text-xs leading-5 text-muted-foreground">
                학생용 챗봇 경로: <span className="font-medium text-foreground">{studentChatbotPath}</span>
              </div>
            </div>
          </div>
          <div className="rounded-md border border-border bg-card sm:col-span-2 xl:col-span-4">
            <div className="border-b border-border p-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2">
                  <ClipboardList className="size-5 text-primary" aria-hidden="true" />
                  <h2 className="text-base font-semibold">5. 교사용 평가 기록</h2>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={handleDownloadEvaluationWorkbook}>
                  <Download className="size-4" aria-hidden="true" />
                  엑셀 다운로드
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1320px] text-left text-sm">
                <thead className="border-b border-border bg-muted text-xs text-muted-foreground">
                  <tr>
                    {evaluationRecordColumns.map((column) => (
                      <th key={column.label} className="px-4 py-3 font-semibold">
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 4 }, (_, rowIndex) => (
                    <tr key={rowIndex} className="border-b border-border align-top">
                      {evaluationRecordColumns.map((column, columnIndex) => (
                        <td key={column.label} className="px-4 py-3 text-muted-foreground">
                          {rowIndex === 0 && columnIndex === 0 ? "예: 김OO" : column.placeholder}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      </main>
    </div>
  );
}
