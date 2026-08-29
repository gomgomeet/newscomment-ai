"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { verifyAssessmentSurveyToken, readAssessmentSurveyConfig } from "@/lib/evaluation/assessment-survey";
import { createAdminClient } from "@/lib/supabase/admin";

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function maskStudentName(name: string) {
  const characters = Array.from(name.replace(/\s+/g, ""));
  if (characters.length <= 1) return "O";
  if (characters.length === 2) return `${characters[0]}O`;
  return `${characters[0]}${"O".repeat(characters.length - 2)}${characters.at(-1)}`;
}

export async function submitAssessmentSurvey(formData: FormData) {
  const projectId = readText(formData, "project_id");
  const versionId = readText(formData, "version_id");
  const token = readText(formData, "token");
  const schoolYear = readText(formData, "school_year");
  const gradeNumber = readText(formData, "grade_number");
  const classNumber = readText(formData, "class_number");
  const studentNumber = readText(formData, "student_number");
  const studentName = readText(formData, "student_name");
  const honeypot = readText(formData, "website");
  const surveyPath = `/assessment/${projectId}/${token}`;

  if (honeypot) redirect(`${surveyPath}?submitted=1`);
  if (!projectId || !versionId || !token || !verifyAssessmentSurveyToken(projectId, versionId, token)) {
    redirect("/login?message=유효하지 않은 학생 설문 링크입니다.");
  }
  if (!/^\d{4}$/.test(schoolYear) || Number(schoolYear) < 2000 || Number(schoolYear) > 2100) {
    redirect(`${surveyPath}?message=${encodeURIComponent("학년도를 네 자리 숫자로 입력해 주세요.")}`);
  }
  if (!/^\d$/.test(gradeNumber) || Number(gradeNumber) < 1 || Number(gradeNumber) > 6) {
    redirect(`${surveyPath}?message=${encodeURIComponent("학년을 1부터 6까지의 숫자로 입력해 주세요.")}`);
  }
  if (!/^\d{1,2}$/.test(classNumber) || Number(classNumber) < 1 || Number(classNumber) > 30) {
    redirect(`${surveyPath}?message=${encodeURIComponent("반을 숫자로 입력해 주세요.")}`);
  }
  if (!/^\d{1,2}$/.test(studentNumber) || Number(studentNumber) < 1 || Number(studentNumber) > 99) {
    redirect(`${surveyPath}?message=${encodeURIComponent("번호를 숫자로 입력해 주세요.")}`);
  }
  if (!studentName || studentName.length > 50) {
    redirect(`${surveyPath}?message=${encodeURIComponent("이름을 입력해 주세요.")}`);
  }
  const maskedStudentName = maskStudentName(studentName);

  const supabase = createAdminClient();
  const [{ data: project, error: projectError }, { data: prep, error: prepError }] = await Promise.all([
    supabase.from("projects").select("id, notion_source").eq("id", projectId).single(),
    supabase.from("assessment_preps").select("active_version_id").eq("project_id", projectId).single(),
  ]);

  const survey = project ? readAssessmentSurveyConfig(project.notion_source) : null;
  if (
    projectError || !project || prepError || !prep?.active_version_id
    || prep.active_version_id !== versionId || survey?.versionId !== versionId
  ) {
    redirect(`${surveyPath}?message=${encodeURIComponent("현재 사용할 수 없는 설문입니다. 선생님께 새 링크를 받아 주세요.")}`);
  }

  const answers = survey.prompts.map((_, index) => readText(formData, `answer_${index}`));
  if (answers.some((answer) => !answer)) {
    redirect(`${surveyPath}?message=${encodeURIComponent("모든 문항에 답을 입력해 주세요.")}`);
  }
  if (answers.some((answer) => answer.length > 5000) || answers.join("").length > 20000) {
    redirect(`${surveyPath}?message=${encodeURIComponent("입력한 답이 너무 깁니다.")}`);
  }

  const { error } = await supabase.from("comments").insert(
    survey.prompts.map((prompt, index) => ({
      project_id: project.id,
      student_name: maskedStudentName,
      content: `문항: ${prompt}\n답: ${answers[index]}`,
      metadata: {
        source: "assessment-survey",
        assessment_prep_version_id: versionId,
        survey_title: survey.title,
        school_year: Number(schoolYear),
        grade_number: Number(gradeNumber),
        class_number: Number(classNumber),
        student_number: Number(studentNumber),
        survey_prompt: prompt,
        question_number: index + 1,
        answer: answers[index],
      },
    })),
  );

  if (error) {
    redirect(`${surveyPath}?message=${encodeURIComponent("답을 저장하지 못했습니다. 잠시 후 다시 제출해 주세요.")}`);
  }

  revalidatePath("/dashboard/evaluation");
  revalidatePath(`/dashboard/projects/${project.id}`);
  redirect(`${surveyPath}?submitted=1`);
}
