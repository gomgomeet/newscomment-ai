import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFTextField, rgb, type PDFFont } from "pdf-lib";

export const PDF_SOURCE_KEYS = [
  "student_key",
  "project_title",
  "assessment_period",
  "achievement_standards",
  "learning_goal",
  "criterion_results",
  "strengths",
  "growth_needs",
  "feedback_forward",
  "growth_summary",
  "special_record_draft",
  "teacher_final_text",
] as const;

export type PdfSourceKey = typeof PDF_SOURCE_KEYS[number];

export type SchoolPdfField = {
  page_number: number;
  field_label: string;
  acroform_name: string | null;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  source_key: string;
  char_limit: number | null;
  line_limit: number | null;
  font_size: number;
  is_required: boolean;
};

export async function analyzeSchoolPdf(bytes: Uint8Array) {
  const document = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
  const pages = document.getPages();
  const fields = document.getForm().getFields().flatMap((field, index) => {
    if (!(field instanceof PDFTextField)) return [];
    const normalizedName = field.getName().trim().toLowerCase();
    const pageRef = field.acroField.getWidgets()[0]?.P();
    const pageIndex = pageRef ? pages.findIndex((page) => page.ref.toString() === pageRef.toString()) : -1;
    return [{
      page_number: pageIndex >= 0 ? pageIndex + 1 : 1,
      field_label: field.getName(),
      acroform_name: field.getName(),
      source_key: PDF_SOURCE_KEYS.includes(normalizedName as PdfSourceKey) ? normalizedName : "teacher_final_text",
      font_size: 10,
      is_required: false,
      sort_order: index,
    }];
  });

  return {
    pageCount: document.getPageCount(),
    hasAcroform: fields.length > 0,
    fields,
  };
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number, lineLimit: number) {
  const lines: string[] = [];
  let current = "";
  for (const character of text) {
    if (character === "\n") {
      lines.push(current);
      current = "";
    } else if (font.widthOfTextAtSize(`${current}${character}`, fontSize) > maxWidth && current) {
      lines.push(current);
      current = character;
    } else {
      current += character;
    }
    if (lines.length >= lineLimit) break;
  }
  if (lines.length < lineLimit && current) lines.push(current);
  return lines.slice(0, lineLimit);
}

export async function fillSchoolPdf({
  sourceBytes,
  fields,
  values,
}: {
  sourceBytes: Uint8Array;
  fields: SchoolPdfField[];
  values: Record<string, string>;
}) {
  const document = await PDFDocument.load(sourceBytes, { ignoreEncryption: false, updateMetadata: false });
  document.registerFontkit(fontkit);
  const fontBytes = await readFile(path.join(process.cwd(), "assets", "fonts", "NanumGothic.ttf"));
  // pdf-lib/fontkit의 CJK subset은 일부 뷰어에서 글리프가 누락될 수 있어
  // 2MB 정적 OFL 글꼴을 전체 임베딩한다. 생성 PDF는 실측 약 1MB 이하다.
  const koreanFont = await document.embedFont(fontBytes, { subset: false });
  const form = document.getForm();
  const pages = document.getPages();
  const warnings: string[] = [];

  for (const field of fields) {
    const original = values[field.source_key] ?? "";
    const text = field.char_limit ? original.slice(0, field.char_limit) : original;
    if (field.is_required && !text.trim()) {
      warnings.push(`${field.field_label}: 필수 값이 없습니다.`);
      continue;
    }
    if (field.char_limit && original.length > field.char_limit) {
      warnings.push(`${field.field_label}: ${field.char_limit}자로 축약했습니다.`);
    }

    if (field.acroform_name) {
      try {
        const textField = form.getTextField(field.acroform_name);
        const pdfMaxLength = textField.getMaxLength();
        const acroformText = pdfMaxLength && text.length > pdfMaxLength ? text.slice(0, pdfMaxLength) : text;
        if (pdfMaxLength && text.length > pdfMaxLength) {
          warnings.push(`${field.field_label}: PDF 입력 칸 제한 ${pdfMaxLength}자로 축약했습니다.`);
        }
        const widgets = textField.acroField.getWidgets().map((widget) => ({
          rectangle: widget.getRectangle(),
          pageRef: widget.P()?.toString(),
        }));
        form.removeField(textField);
        if (!widgets.length) {
          warnings.push(`${field.field_label}: PDF 입력 칸 위치를 찾지 못했습니다.`);
          continue;
        }
        for (const widget of widgets) {
          const page = pages.find((candidate) => candidate.ref.toString() === widget.pageRef)
            ?? document.getPage(field.page_number - 1);
          const { x, y, width, height } = widget.rectangle;
          const padding = 4;
          page.drawRectangle({
            x,
            y,
            width,
            height,
            color: rgb(0.973, 0.98, 0.988),
            borderColor: rgb(0.796, 0.835, 0.882),
            borderWidth: 0.75,
          });
          const lineHeight = field.font_size * 1.35;
          const inferredLines = Math.max(1, Math.floor((height - padding * 2) / lineHeight));
          const lines = wrapText(
            acroformText,
            koreanFont,
            field.font_size,
            Math.max(1, width - padding * 2),
            field.line_limit ?? inferredLines,
          );
          lines.forEach((line, lineIndex) => {
            page.drawText(line, {
              x: x + padding,
              y: y + height - padding - lineHeight * (lineIndex + 1),
              maxWidth: width - padding * 2,
              size: field.font_size,
              font: koreanFont,
              color: rgb(0.08, 0.1, 0.12),
            });
          });
          if (lines.join("").length < acroformText.replace(/\n/g, "").length) {
            warnings.push(`${field.field_label}: PDF 입력 칸 크기로 인해 일부 문장이 잘렸습니다.`);
          }
        }
      } catch {
        warnings.push(`${field.field_label}: PDF 입력 칸을 찾지 못했습니다.`);
      }
      continue;
    }

    const page = document.getPage(field.page_number - 1);
    if (!page || field.x == null || field.y == null || field.width == null || field.height == null) {
      warnings.push(`${field.field_label}: 수동 영역 좌표가 완성되지 않았습니다.`);
      continue;
    }
    const lineHeight = field.font_size * 1.35;
    const inferredLines = Math.max(1, Math.floor(field.height / lineHeight));
    const lines = wrapText(text, koreanFont, field.font_size, field.width, field.line_limit ?? inferredLines);
    lines.forEach((line, index) => {
      page.drawText(line, {
        x: field.x!,
        y: field.y! + field.height! - lineHeight * (index + 1),
        maxWidth: field.width!,
        size: field.font_size,
        font: koreanFont,
        color: rgb(0.08, 0.1, 0.12),
      });
    });
    if (lines.join("").length < text.replace(/\n/g, "").length) {
      warnings.push(`${field.field_label}: 영역 크기로 인해 일부 문장이 잘렸습니다.`);
    }
  }

  const bytes = await document.save({ useObjectStreams: false });
  return { bytes, warnings };
}
