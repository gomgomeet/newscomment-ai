import { createNewsArticleRubric } from "@/app/dashboard/rubrics/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  NEWS_ARTICLE_STANDARDS,
  SCHOOL_LEVEL_LABELS,
  type SchoolLevel,
} from "@/lib/curriculum/news-article-rubric";

const levelOptions = Object.entries(SCHOOL_LEVEL_LABELS) as [SchoolLevel, string][];

export function NewsArticleRubricGenerator({ message }: { message?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>신문기사 루브릭 자동 생성</CardTitle>
        <CardDescription>
          성취기준을 선택하면 Supabase에 루브릭과 평가 기준을 만들고, 생성 후 교사가 바로 수정할 수 있습니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={createNewsArticleRubric} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="news_rubric_title">루브릭 제목</Label>
            <Input
              id="news_rubric_title"
              name="title"
              defaultValue="신문기사 의견쓰기 루브릭"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="school_level">학교급</Label>
            <Select id="school_level" name="school_level" defaultValue="elementary56" required>
              {levelOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="article_topic">기사 주제 또는 수업 맥락</Label>
            <Input
              id="article_topic"
              name="article_topic"
              placeholder="예: 기후위기, 지역 문제, 인공지능 윤리"
            />
          </div>
          <fieldset className="space-y-3 rounded-md border border-border p-3">
            <legend className="px-1 text-sm font-medium">반영할 성취기준</legend>
            <div className="space-y-3">
              {NEWS_ARTICLE_STANDARDS.map((standard) => (
                <label
                  key={standard.code}
                  className="flex items-start gap-3 rounded-md border border-border p-3 text-sm"
                >
                  <input
                    name="standard_codes"
                    type="checkbox"
                    value={standard.code}
                    defaultChecked={standard.level === "elementary56"}
                    className="mt-1 h-4 w-4 accent-primary"
                  />
                  <span className="space-y-1">
                    <span className="block font-medium">
                      {standard.code} · {SCHOOL_LEVEL_LABELS[standard.level]} · {standard.subject}
                    </span>
                    <span className="block text-muted-foreground">{standard.summary}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {message ? <p className="text-sm text-destructive">{message}</p> : null}
          <Button type="submit">자동 생성</Button>
        </form>
      </CardContent>
    </Card>
  );
}
