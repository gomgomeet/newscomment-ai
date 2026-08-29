export type StudentRecordActivityInput = {
  projectId: string;
  activityTitle: string;
  subject: string;
  targetGrade: string | null;
  achievementStandards: unknown;
  evaluationIds: string[];
  answers: string[];
  teacherFeedback: string[];
  criterionEvidence: { criterion: string; rationale: string | null }[];
};

export type AiStudentRecordResult = {
  model: string;
  activityRecords: {
    projectId: string;
    recordText: string;
    evidenceSummary: string;
  }[];
  representativeProjectId: string;
  representativeReason: string;
  cumulativeRecord: string;
  summaryKind: "one-time" | "cumulative";
};

const STUDENT_RECORD_GUIDELINES = [
  "교사가 이미 확정한 평가와 학생 답안의 직접 근거만 사용한다.",
  "입력된 활동은 모두 같은 과목이며 다른 과목의 근거를 섞지 않는다.",
  "각 활동 기록은 최종 세특이 아니라 과목별 통합 문장을 만들기 위한 근거 메모로 작성한다.",
  "학생 답안의 실제 문장, 글감, 세부 주장, 사례, 고유한 표현을 세특 문장에 직접 쓰거나 요약하지 않는다.",
  "답안 내용은 수행능력을 판단하는 근거로만 사용하고, 문장은 읽기·쓰기·탐구·표현 등 교과 역량과 평가요소 중심으로 작성한다.",
  "국어 읽기·쓰기 활동에서는 글의 중심 내용 파악, 근거와 의견의 연결, 자신의 생각 조직, 표현의 적절성처럼 관찰 가능한 수행능력을 중심으로 쓴다.",
  "과목별 통합 기록은 성취기준에 따른 성취수준 특성과 수업 과정의 참여, 자기주도적 변화와 성장 중 직접 확인된 내용을 전 영역에서 종합한다.",
  "과목별 통합 기록에 활동명을 차례로 나열하거나 성취기준의 지식을 그대로 되풀이하지 않는다.",
  "문장은 생활기록부 초안에 맞게 '~함', '~보임', '~활용함' 형태로 쓰고 500자 이내로 제한한다.",
  "점수, 백분율, AI, 루브릭 번호를 문장에 직접 드러내지 않는다.",
  "답안과 근거에 없는 태도, 성격, 지속성, 성장, 다른 학생과의 비교를 추측하지 않는다.",
  "한 활동만 있으면 반복적 성장으로 단정하지 않는 1회성 기록으로 작성한다.",
  "여러 활동이 있으면 각 근거가 보여 주는 성취 특성을 연결하고, 실제로 반복 확인된 강점만 과목별 기록에 종합한다.",
  "향상이나 변화는 서로 비교 가능한 여러 시점의 직접 근거가 있을 때만 표현한다.",
  "대표 활동은 점수가 가장 높은 활동이 아니라 관찰 근거가 가장 구체적이고 기록 문장이 충실한 활동으로 고른다.",
  "이 결과는 교사가 수정하고 확정할 AI 초안이며 교사 확정 문장을 대신하지 않는다.",
].join(" ");

function extractOutputText(response: { output_text?: unknown; output?: unknown }) {
  if (typeof response.output_text === "string") return response.output_text;
  if (!Array.isArray(response.output)) return null;

  for (const outputItem of response.output) {
    if (!outputItem || typeof outputItem !== "object" || !("content" in outputItem) || !Array.isArray(outputItem.content)) continue;
    for (const contentItem of outputItem.content) {
      if (contentItem && typeof contentItem === "object" && "text" in contentItem && typeof contentItem.text === "string") {
        return contentItem.text;
      }
    }
  }
  return null;
}

function isResultPayload(value: unknown, projectIds: Set<string>): value is Omit<AiStudentRecordResult, "model"> {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  if (
    !Array.isArray(payload.activityRecords) ||
    typeof payload.representativeProjectId !== "string" ||
    !projectIds.has(payload.representativeProjectId) ||
    typeof payload.representativeReason !== "string" ||
    typeof payload.cumulativeRecord !== "string" ||
    (payload.summaryKind !== "one-time" && payload.summaryKind !== "cumulative")
  ) {
    return false;
  }

  const returnedProjectIds = new Set<string>();
  for (const item of payload.activityRecords) {
    if (!item || typeof item !== "object") return false;
    const record = item as Record<string, unknown>;
    if (
      typeof record.projectId !== "string" ||
      !projectIds.has(record.projectId) ||
      typeof record.recordText !== "string" ||
      typeof record.evidenceSummary !== "string"
    ) {
      return false;
    }
    returnedProjectIds.add(record.projectId);
  }
  return returnedProjectIds.size === projectIds.size;
}

export async function generateStudentRecordWithOpenAI({
  studentKey,
  periodLabel,
  subject,
  activities,
}: {
  studentKey: string;
  periodLabel: string;
  subject: string;
  activities: StudentRecordActivityInput[];
}): Promise<AiStudentRecordResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY가 설정되어 있지 않습니다.");
  if (activities.length === 0) throw new Error("세특을 작성할 확정 활동이 없습니다.");
  if (activities.some((activity) => activity.subject !== subject)) {
    throw new Error("서로 다른 과목의 평가 근거는 한 세특으로 합칠 수 없습니다.");
  }

  const model = process.env.OPENAI_EVALUATION_MODEL || "gpt-5.6";
  const projectIds = activities.map((activity) => activity.projectId);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      input: [
        { role: "system", content: STUDENT_RECORD_GUIDELINES },
        {
          role: "user",
          content: JSON.stringify({
            student_key: studentKey,
            period_label: periodLabel,
            subject,
            activities: activities.map((activity) => ({
              project_id: activity.projectId,
              activity_title: activity.activityTitle,
              subject: activity.subject,
              target_grade: activity.targetGrade,
              achievement_standards: activity.achievementStandards,
              answers: activity.answers.map((answer) => answer.slice(0, 4000)),
              teacher_confirmed_feedback: activity.teacherFeedback,
              teacher_confirmed_criterion_evidence: activity.criterionEvidence,
            })),
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "student_activity_records",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["activityRecords", "representativeProjectId", "representativeReason", "cumulativeRecord", "summaryKind"],
            properties: {
              activityRecords: {
                type: "array",
                minItems: activities.length,
                maxItems: activities.length,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["projectId", "recordText", "evidenceSummary"],
                  properties: {
                    projectId: { type: "string", enum: projectIds },
                    recordText: { type: "string", maxLength: 500 },
                    evidenceSummary: { type: "string", maxLength: 300 },
                  },
                },
              },
              representativeProjectId: { type: "string", enum: projectIds },
              representativeReason: { type: "string", maxLength: 300 },
              cumulativeRecord: { type: "string", maxLength: 500 },
              summaryKind: { type: "string", enum: ["one-time", "cumulative"] },
            },
          },
        },
      },
    }),
  });

  const raw = (await response.json()) as { error?: { message?: string }; output_text?: unknown; output?: unknown };
  if (!response.ok) throw new Error(raw.error?.message || "AI 세특 초안 작성에 실패했습니다.");
  const outputText = extractOutputText(raw);
  if (!outputText) throw new Error("AI 세특 응답에서 결과를 찾을 수 없습니다.");

  const parsed = JSON.parse(outputText) as unknown;
  if (!isResultPayload(parsed, new Set(projectIds))) throw new Error("AI 세특 응답 형식이 올바르지 않습니다.");

  return { model, ...parsed };
}
