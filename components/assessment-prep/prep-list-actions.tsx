"use client";

import { Trash2 } from "lucide-react";
import { deleteAssessmentPrep } from "@/app/dashboard/prep/actions";
import { Button } from "@/components/ui/button";

export function DeleteAssessmentPrepButton({ prepId, title }: { prepId: string; title: string }) {
  return (
    <form
      action={deleteAssessmentPrep}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `“${title}” 평가 설계를 삭제할까요?\n연결된 학생 응답과 평가 기록도 함께 삭제되며 되돌릴 수 없습니다.`,
        );
        if (!confirmed) event.preventDefault();
      }}
    >
      <input type="hidden" name="prep_id" value={prepId} />
      <Button
        type="submit"
        variant="ghost"
        className="h-9 w-9 p-0 text-muted-foreground hover:bg-red-50 hover:text-red-700"
        aria-label={`${title} 삭제`}
        title="평가 설계 삭제"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </form>
  );
}
