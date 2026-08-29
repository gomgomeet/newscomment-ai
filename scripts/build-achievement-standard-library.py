from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "tmp" / "curriculum-pdfs"
OUTPUT = ROOT / "lib" / "curriculum" / "achievement-standards.ts"


SUBJECTS = [
    ("국어", "korean-curriculum.txt", "[별책5] 국어과 교육과정"),
    ("사회", "social-curriculum.txt", "[별책7] 사회과 교육과정"),
    ("도덕", "moral-curriculum.txt", "[별책6] 도덕과 교육과정"),
    ("수학", "math-curriculum.txt", "[별책8] 수학과 교육과정"),
    ("과학", "science-curriculum.txt", "[별책9] 과학과 교육과정"),
    ("영어", "english-curriculum.txt", "[별책14] 영어과 교육과정"),
]

CODE_RE = re.compile(r"\[([0-9]{1,2}[^\]\s]{1,24}-[0-9]{2}(?:-[0-9]{2})?)\]\s*([^\r\n]*)")
CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]+")
NOISE_RE = re.compile(r"^[\s,.;:·⋅\]\)]+")

GRADE_BANDS = [
    ("2", "초등 1-2학년"),
    ("4", "초등 3-4학년"),
    ("6", "초등 5-6학년"),
    ("9", "중학교 1-3학년"),
    ("10", "고등학교 1학년 공통"),
    ("12", "고등학교 2-3학년 선택"),
]

DOMAIN_MAPS = {
    "국어": {
        "01": "듣기·말하기",
        "02": "읽기",
        "03": "쓰기",
        "04": "문법",
        "05": "문학",
        "06": "매체",
    },
    "수학": {
        "01": "수와 연산",
        "02": "변화와 관계",
        "03": "도형과 측정",
        "04": "자료와 가능성",
    },
    "도덕": {
        "01": "자신과의 관계",
        "02": "타인과의 관계",
        "03": "사회·공동체와의 관계",
        "04": "자연과의 관계",
    },
    "영어": {
        "01": "이해",
        "02": "표현",
    },
}

DEFAULT_DOMAIN = {
    "국어": "국어",
    "사회": "사회",
    "도덕": "도덕",
    "수학": "수학",
    "과학": "과학",
    "영어": "영어",
}

ELEMENT_RULES = {
    "국어": [
        ("korean-reading-core", ["중심", "핵심", "요약", "간추", "읽", "내용", "정보"]),
        ("korean-reading-critical", ["출처", "신뢰", "타당", "비판", "관점", "매체"]),
        ("korean-writing-evidence", ["의견", "생각", "쓰기", "쓴다", "근거", "주장", "표현"]),
        ("korean-communication", ["듣", "말", "토의", "토론", "발표", "소통", "대화", "질문"]),
    ],
    "사회": [
        ("social-problem", ["사회", "문제", "쟁점", "생활", "공동체", "변화"]),
        ("social-evidence", ["자료", "정보", "지도", "통계", "사료", "조사", "탐구"]),
        ("social-cause", ["원인", "영향", "결과", "변화", "관계", "특징"]),
        ("social-solution", ["해결", "방안", "실천", "참여", "정책", "의사 결정", "대안"]),
    ],
    "도덕": [
        ("moral-value", ["가치", "규범", "예절", "책임", "존중", "덕목"]),
        ("moral-judgement", ["판단", "갈등", "선택", "이유", "근거", "탐구"]),
        ("moral-empathy", ["공감", "타인", "친구", "관계", "배려", "감정"]),
        ("moral-practice", ["실천", "계획", "약속", "생활", "행동", "수양"]),
    ],
    "수학": [
        ("math-concept", ["개념", "원리", "성질", "이해", "적용"]),
        ("math-problem", ["문제", "해결", "전략", "조건", "구하", "계산"]),
        ("math-reasoning", ["추론", "규칙", "관계", "증명", "근거", "탐구"]),
        ("math-communication", ["설명", "표현", "식", "표", "그래프", "그림"]),
        ("math-connection-data", ["연결", "정보", "자료", "공학", "실생활", "통계"]),
    ],
    "과학": [
        ("science-concept", ["개념", "원리", "현상", "이유", "설명", "특징"]),
        ("science-inquiry", ["탐구", "실험", "관찰", "측정", "변인", "조사", "설계"]),
        ("science-data", ["자료", "그래프", "결과", "분석", "증거", "결론"]),
        ("science-attitude", ["안전", "협력", "환경", "실천", "사회", "책임", "윤리"]),
    ],
    "영어": [
        ("english-listen-read", ["듣", "읽", "이해", "파악", "정보", "listen", "read"]),
        ("english-interaction", ["대화", "묻", "답", "상호", "토론", "의사소통"]),
        ("english-expression", ["말", "쓰", "표현", "의견", "설명", "발표", "write", "speak"]),
        ("english-culture", ["문화", "존중", "다양", "포용", "공감", "culture"]),
    ],
}


def clean_text(value: str) -> str:
    value = CONTROL_RE.sub("", value)
    value = value.replace("⋅", "·").replace(" ∼ ", "-").replace("–", "-").replace("—", "-")
    value = re.sub(r"\s+", " ", value)
    value = NOISE_RE.sub("", value).strip()
    return value


def grade_band_for(code: str) -> str:
    for prefix, band in sorted(GRADE_BANDS, key=lambda item: len(item[0]), reverse=True):
        if code.startswith(prefix):
            return band
    return "학년군 미분류"


def domain_key_for(code: str) -> str | None:
    match = re.search(r"([0-9]{2})-[0-9]{2}$", code)
    return match.group(1) if match else None


def domain_for(subject: str, code: str) -> str:
    key = domain_key_for(code)
    return DOMAIN_MAPS.get(subject, {}).get(key or "", DEFAULT_DOMAIN[subject])


def element_keys_for(subject: str, text: str) -> list[str]:
    keys = [
        key
        for key, keywords in ELEMENT_RULES[subject]
        if any(keyword.lower() in text.lower() for keyword in keywords)
    ]
    if keys:
        return keys[:4]
    return [ELEMENT_RULES[subject][0][0]]


def looks_like_explanation(text: str) -> bool:
    return (
        text.startswith("이 성취기준")
        or text.startswith("성취기준")
        or text.startswith(("은 ", "은", "는 ", "는", "에서는", "에서 "))
        or "이 성취기준은" in text[:40]
        or "설정한 것이다" in text
        or "의도하였다" in text
        or "하도록 한다" in text
        or "하게 한다" in text
        or "기회를 제공" in text
        or text.startswith("영역의 ")
        or text.startswith("성취수준")
    )


def extract_subject(subject: str, filename: str, source_file: str) -> list[dict[str, object]]:
    path = SOURCE_DIR / filename
    content = path.read_text(encoding="utf-8")
    seen: set[str] = set()
    standards: list[dict[str, object]] = []

    for line_no, line in enumerate(content.splitlines(), start=1):
        line = line.replace("–", "-").replace("—", "-")
        for match in CODE_RE.finditer(line):
            code = match.group(1).strip()
            if code in seen:
                continue
            text = clean_text(match.group(2))
            if not text or looks_like_explanation(text):
                continue
            seen.add(code)
            domain = domain_for(subject, code)
            standards.append({
                "id": re.sub(r"[^0-9A-Za-z가-힣]+", "-", code).strip("-"),
                "code": code,
                "subject": subject,
                "gradeBand": grade_band_for(code),
                "domain": domain,
                "text": text,
                "assessmentElementKeys": element_keys_for(subject, f"{domain} {text}"),
                "sourceFile": source_file,
                "sourceLine": line_no,
            })

    return standards


def ts_literal(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2)


def main() -> None:
    standards: list[dict[str, object]] = []
    for subject, filename, source_file in SUBJECTS:
        standards.extend(extract_subject(subject, filename, source_file))

    standards.sort(key=lambda item: (str(item["subject"]), str(item["code"])))
    content = """import type { CurriculumSubject } from "./assessment-design-library";

export type AchievementStandard = {
  id: string;
  code: string;
  subject: CurriculumSubject;
  gradeBand: string;
  domain: string;
  text: string;
  assessmentElementKeys: readonly string[];
  sourceFile: string;
  sourceLine: number;
};

export type CurriculumStandardOption = {
  id: string;
  subject: string;
  gradeBand: string;
  title: string;
  standard: string;
  classroomGoal: string;
};

export const ACHIEVEMENT_STANDARDS = __STANDARDS__ as const satisfies readonly AchievementStandard[];

export function getAchievementStandardsFor({
  subject,
  gradeBand,
}: {
  subject?: string;
  gradeBand?: string;
}) {
  return ACHIEVEMENT_STANDARDS.filter((standard) => {
    if (subject && standard.subject !== subject) return false;
    if (gradeBand && standard.gradeBand !== gradeBand) return false;
    return true;
  });
}

export function buildStandardOptions(): CurriculumStandardOption[] {
  return ACHIEVEMENT_STANDARDS.map((standard) => ({
    id: standard.id,
    subject: standard.subject,
    gradeBand: standard.gradeBand,
    title: `[${standard.code}] ${standard.domain}`,
    standard: `[${standard.code}] ${standard.text}`,
    classroomGoal: `${standard.domain} 성취기준을 이번 수업 맥락에서 구체적으로 평가합니다.`,
  }));
}

export const standardOptions = buildStandardOptions();
""".replace("__STANDARDS__", ts_literal(standards))
    OUTPUT.write_text(content, encoding="utf-8")
    print(f"Wrote {len(standards)} standards to {OUTPUT}")
    by_subject: dict[str, int] = {}
    for standard in standards:
        by_subject[str(standard["subject"])] = by_subject.get(str(standard["subject"]), 0) + 1
    for subject, count in by_subject.items():
        print(f"{subject}: {count}")


if __name__ == "__main__":
    main()
