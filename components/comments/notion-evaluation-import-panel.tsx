"use client";

import { useMemo, useState } from "react";
import { Database, FileCheck2 } from "lucide-react";
import { importCommentsFromNotion } from "@/app/dashboard/projects/[projectId]/evaluation/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { NotionSourceDefaults } from "@/lib/notion/project-source";

export type NotionEvaluationImportProject = {
  id: string;
  title: string;
  description: string | null;
  commentCount: number;
  aiDraftCount: number;
  teacherConfirmedCount: number;
  designReady: boolean;
  defaults: NotionSourceDefaults;
};

export function NotionEvaluationImportPanel({
  projects,
  configured,
  connectionLabel,
}: {
  projects: NotionEvaluationImportProject[];
  configured: boolean;
  connectionLabel: string | null;
}) {
  const firstReadyProject = projects.find((project) => project.designReady) ?? projects[0] ?? null;
  const [selectedProjectId, setSelectedProjectId] = useState(firstReadyProject?.id ?? "");
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? firstReadyProject,
    [firstReadyProject, projects, selectedProjectId],
  );
  const defaults = selectedProject?.defaults;
  const fieldId = (name: string) => `notion-evaluation-${name}`;

  return (
    <section id="notion-evaluation-import" className="rounded-md border bg-card px-5 py-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold text-teal-700">
            <Database className="h-4 w-4" /> Notion 평가 결과물
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Notion 평가 결과물 평가하기</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            평가계획을 먼저 고른 뒤 Notion 데이터베이스의 학생 결과물을 읽어옵니다. 가져온 결과물은 선택한 계획의 성취기준,
            평가목표, 루브릭과 연결되어 이 보드의 결과 평가와 AI 초안 생성에 사용됩니다.
          </p>
        </div>
        <div className="rounded-md border bg-background px-4 py-3 text-sm">
          <p className="font-semibold">{configured ? connectionLabel || "내 Notion" : "Notion 연결 필요"}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {configured ? "읽기 전용으로 결과물을 가져오며 원본 Notion은 수정하지 않습니다." : "평가 준비에서 Notion 연결을 먼저 완료해 주세요."}
          </p>
        </div>
      </div>

      <form action={importCommentsFromNotion} className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-2 lg:col-span-2">
          <Label htmlFor={fieldId("project_id")}>평가계획 선택</Label>
          <Select
            id={fieldId("project_id")}
            name="project_id"
            value={selectedProject?.id ?? ""}
            onChange={(event) => setSelectedProjectId(event.target.value)}
            required
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}{project.designReady ? "" : " - 설계 미확정"}
              </option>
            ))}
          </Select>
          {selectedProject ? (
            <p className="text-xs leading-5 text-muted-foreground">
              현재 결과물 {selectedProject.commentCount}개, AI 초안 {selectedProject.aiDraftCount}개, 교사 확정 {selectedProject.teacherConfirmedCount}개가
              이 평가계획에 연결되어 있습니다.
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor={fieldId("response_collection_url")}>학생용 질문지·수정 링크</Label>
          <Input
            key={`response-${selectedProject?.id ?? "none"}`}
            id={fieldId("response_collection_url")}
            name="response_collection_url"
            type="url"
            defaultValue={defaults?.response_collection_url ?? ""}
            placeholder="Google Form, 보드 학생 링크, Notion 제출 링크"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={fieldId("source_page_url")}>Notion 수업/연수 원본 페이지</Label>
          <Input
            key={`source-${selectedProject?.id ?? "none"}`}
            id={fieldId("source_page_url")}
            name="source_page_url"
            type="url"
            defaultValue={defaults?.source_page_url ?? ""}
            placeholder="https://www.notion.so/..."
          />
        </div>
        <div className="space-y-2 lg:col-span-2">
          <Label htmlFor={fieldId("notion_database")}>Notion 데이터베이스 URL</Label>
          <Input
            key={`database-${selectedProject?.id ?? "none"}`}
            id={fieldId("notion_database")}
            name="notion_database"
            defaultValue={defaults?.database_url ?? ""}
            placeholder="https://www.notion.so/workspace/1a2b3c..."
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={fieldId("content_mode")}>결과물이 작성된 위치</Label>
          <Select
            key={`mode-${selectedProject?.id ?? "none"}`}
            id={fieldId("content_mode")}
            name="content_mode"
            defaultValue={defaults?.content_mode ?? "property"}
          >
            <option value="property">데이터베이스 속성</option>
            <option value="page_body">각 학생 페이지 본문</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={fieldId("content_property")}>결과물 내용 속성</Label>
          <Input
            key={`content-${selectedProject?.id ?? "none"}`}
            id={fieldId("content_property")}
            name="content_property"
            defaultValue={defaults?.content_property || "답변"}
            placeholder="답변"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={fieldId("student_property")}>학생 이름 속성</Label>
          <Input
            key={`student-${selectedProject?.id ?? "none"}`}
            id={fieldId("student_property")}
            name="student_property"
            defaultValue={defaults?.student_property ?? ""}
            placeholder="이름 또는 반번호"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={fieldId("topic_property")}>기사 주제 속성</Label>
          <Input
            key={`topic-${selectedProject?.id ?? "none"}`}
            id={fieldId("topic_property")}
            name="topic_property"
            defaultValue={defaults?.topic_property ?? ""}
            placeholder="주제"
          />
        </div>

        <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-4 lg:col-span-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-muted-foreground">
            읽어온 결과물은 해당 평가계획의 결과물로 저장됩니다. 이후 이 보드의 <span className="font-medium">결과 평가</span>와
            <span className="font-medium"> 전체 AI 초안 만들기</span>가 같은 설계 내용을 기준으로 점수와 피드백을 채웁니다.
          </p>
          <Button type="submit" name="return_to" value="evaluation" disabled={!configured || !selectedProject}>
            <FileCheck2 className="h-4 w-4" /> 선택한 평가계획으로 가져오기
          </Button>
        </div>
      </form>
    </section>
  );
}
