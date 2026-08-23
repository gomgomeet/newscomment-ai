import { analyzeMaterialImageWithOpenAI } from "@/lib/openai/questioning-board";

const MAX_IMAGE_DATA_URL_LENGTH = 7_500_000;

type AnalyzeImageRequest = {
  imageDataUrl?: unknown;
  standard?: unknown;
  targetGrade?: unknown;
  subjectUnit?: unknown;
  teacherNotes?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AnalyzeImageRequest;
    const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl : "";

    if (!imageDataUrl.startsWith("data:image/")) {
      return Response.json({ error: "이미지 파일을 data URL 형식으로 보내 주세요." }, { status: 400 });
    }

    if (imageDataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
      return Response.json({ error: "이미지 파일이 너무 큽니다. 더 작은 이미지로 다시 시도해 주세요." }, { status: 413 });
    }

    const result = await analyzeMaterialImageWithOpenAI({
      imageDataUrl,
      standard: typeof body.standard === "string" ? body.standard : "",
      targetGrade: typeof body.targetGrade === "string" ? body.targetGrade : "",
      subjectUnit: typeof body.subjectUnit === "string" ? body.subjectUnit : "",
      teacherNotes: typeof body.teacherNotes === "string" ? body.teacherNotes : "",
    });

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "이미지 분석에 실패했습니다.";
    const status = message.includes("OPENAI_API_KEY") ? 503 : 500;
    return Response.json({ error: message }, { status });
  }
}
