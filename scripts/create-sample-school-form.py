from pathlib import Path
import sys

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4


def make_sample(output_path: Path) -> None:
    project_root = Path(__file__).resolve().parents[1]
    font_path = project_root / "assets" / "fonts" / "NanumGothic.ttf"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    pdfmetrics.registerFont(TTFont("NanumGothic", str(font_path)))

    page_width, page_height = A4
    pdf = canvas.Canvas(str(output_path), pagesize=A4)
    pdf.setTitle("과정중심평가 성장 기록 샘플 양식")
    pdf.setAuthor("newscomment-ai demo")
    pdf.setFillColor(HexColor("#312E81"))
    pdf.rect(0, page_height - 92, page_width, 92, fill=1, stroke=0)
    pdf.setFillColor(HexColor("#FFFFFF"))
    pdf.setFont("NanumGothic", 20)
    pdf.drawString(40, page_height - 52, "과정중심평가 성장 기록")
    pdf.setFont("NanumGothic", 9)
    pdf.drawString(40, page_height - 72, "시연용 학교 PDF · 개인정보 없는 샘플")

    form = pdf.acroForm

    def field(label: str, name: str, y: float, height: float = 26, multiline: bool = False) -> None:
        pdf.setFillColor(HexColor("#111827"))
        pdf.setFont("NanumGothic", 9)
        pdf.drawString(40, y + height + 7, label)
        form.textfield(
            name=name,
            x=40,
            y=y,
            width=page_width - 80,
            height=height,
            borderWidth=1,
            borderColor=HexColor("#CBD5E1"),
            fillColor=HexColor("#F8FAFC"),
            textColor=HexColor("#111827"),
            forceBorder=True,
            fontName="Helvetica",
            fontSize=9,
            maxlen=2000,
            fieldFlags=4096 if multiline else 0,
        )

    field("학생 식별자", "student_key", 676)
    field("평가 기간", "assessment_period", 624)
    field("평가활동명", "project_title", 572)
    field("성취기준", "achievement_standards", 476, 62, True)
    field("다음 평가 포워드", "feedback_forward", 370, 72, True)
    field("교사 확정 성장 기록·세특 문장", "teacher_final_text", 154, 176, True)

    pdf.setFillColor(HexColor("#64748B"))
    pdf.setFont("NanumGothic", 8)
    pdf.drawString(40, 126, "※ 자동 초안이 아니라 교사가 최종 확정한 문장만 이 양식에 작성됩니다.")
    pdf.drawString(40, 110, "※ 샘플 양식에는 실제 학생 이름이나 학교 개인정보가 포함되어 있지 않습니다.")
    pdf.save()


if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("output/pdf/school-evaluation-template-sample.pdf")
    make_sample(target.resolve())
