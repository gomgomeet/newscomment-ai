"use client";

import { useState } from "react";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import {
  addAssessmentRubricCriterion,
  deleteAssessmentRubricCriterion,
  updateAssessmentRubricCriterion,
} from "@/app/dashboard/prep/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Database } from "@/lib/db/types";

type Criterion = Database["public"]["Tables"]["rubric_criteria"]["Row"];

export function PrepRubricCriteria({ prepId, criteria }: { prepId: string; criteria: Criterion[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-3">
      {criteria.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          아직 생성된 평가 기준이 없습니다.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {criteria.map((criterion, index) => {
            const editing = editingId === criterion.id;
            return (
              <div key={criterion.id} className="rounded-md border p-4">
            {editing ? (
              <form action={updateAssessmentRubricCriterion} className="space-y-3">
                <input type="hidden" name="prep_id" value={prepId} />
                <input type="hidden" name="criterion_id" value={criterion.id} />
                <div className="space-y-1.5">
                  <Label htmlFor={`prep_criterion_label_${criterion.id}`}>평가 요소</Label>
                  <Input
                    id={`prep_criterion_label_${criterion.id}`}
                    name="label"
                    defaultValue={criterion.label}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`prep_criterion_description_${criterion.id}`}>성취수준별 관찰 기준</Label>
                  <Textarea
                    id={`prep_criterion_description_${criterion.id}`}
                    name="description"
                    defaultValue={criterion.description}
                    rows={4}
                    required
                  />
                </div>
                <div className="max-w-40 space-y-1.5">
                  <Label htmlFor={`prep_criterion_order_${criterion.id}`}>표시 순서</Label>
                  <Input
                    id={`prep_criterion_order_${criterion.id}`}
                    name="sort_order"
                    type="number"
                    min={0}
                    defaultValue={criterion.sort_order}
                    required
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                    <X className="h-4 w-4" /> 취소
                  </Button>
                  <Button type="submit" size="sm">
                    <Save className="h-4 w-4" /> 저장
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">평가 요소 {index + 1}</p>
                    <p className="mt-1 font-semibold">{criterion.label}</p>
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">
                  {criterion.description}
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <form
                    action={deleteAssessmentRubricCriterion}
                    onSubmit={(event) => {
                      if (!window.confirm(`‘${criterion.label}’ 기준을 삭제할까요?`)) event.preventDefault();
                    }}
                  >
                    <input type="hidden" name="prep_id" value={prepId} />
                    <input type="hidden" name="criterion_id" value={criterion.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 px-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`${criterion.label} 삭제`}
                      title="평가 기준 삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </form>
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditingId(criterion.id)}>
                    <Pencil className="h-4 w-4" /> 수정
                  </Button>
                </div>
              </>
            )}
              </div>
            );
          })}
        </div>
      )}

      {adding ? (
        <form action={addAssessmentRubricCriterion} className="space-y-3 rounded-md border bg-muted/20 p-4">
          <input type="hidden" name="prep_id" value={prepId} />
          <div className="space-y-1.5">
            <Label htmlFor="new_rubric_criterion_label">평가 요소</Label>
            <Input id="new_rubric_criterion_label" name="label" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new_rubric_criterion_description">성취수준별 관찰 기준</Label>
            <Textarea id="new_rubric_criterion_description" name="description" rows={8} required />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
              <X className="h-4 w-4" /> 취소
            </Button>
            <Button type="submit" size="sm">
              <Save className="h-4 w-4" /> 추가 저장
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> 루브릭 추가하기
          </Button>
        </div>
      )}
    </div>
  );
}
