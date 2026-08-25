/**
 * 질문 수업 참여 현황
 *
 * 학생 기록은 `학교_반_번호` 형태로 노션 결과 DB에 쌓인다. 교사가 그 목록을
 * 붙여넣고 학급 인원을 알려 주면, 아직 질문하지 않은 번호를 찾아 준다.
 *
 * 참여 여부만 본다. 질문을 몇 개 했는지는 세지 않으며, 참여율을 성취 점수처럼
 * 쓰지 않도록 화면에서도 그렇게 안내한다.
 */

export type AttendanceSummary = {
  /** 학급 전체 인원 */
  total: number;
  /** 질문 기록이 있는 번호 (오름차순) */
  participatedNumbers: number[];
  /** 기록이 없는 번호 (오름차순) */
  missingNumbers: number[];
  /** 학급 인원 범위를 벗어난 번호 — 오타나 다른 반 기록일 수 있다 */
  outOfRangeNumbers: number[];
  /** 참여율 (0~100, 반올림) */
  participationRate: number;
};

/**
 * 교사가 붙여넣은 기록에서 학생 번호를 뽑는다.
 *
 * 노션 결과 DB의 `학교_반_번호`(예: `푸른초등학교_4-2_15`)를 그대로 붙여넣어도 되고,
 * 번호만 쉼표나 줄바꿈으로 나열해도 된다. 한 줄에서 마지막 숫자를 그 줄의 학생
 * 번호로 본다 — 앞쪽 숫자는 학년·반이라 번호가 아니다.
 */
export function parseParticipatedNumbers(rawInput: string): number[] {
  const found = new Set<number>();

  rawInput
    .split(/[\n,]/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .forEach((line) => {
      const numbers = line.match(/\d+/g);
      if (!numbers || numbers.length === 0) return;
      const candidate = Number.parseInt(numbers[numbers.length - 1], 10);
      if (Number.isFinite(candidate) && candidate > 0) {
        found.add(candidate);
      }
    });

  return Array.from(found).sort((left, right) => left - right);
}

/** 학급 인원과 참여 번호를 견주어 미제출 번호를 찾는다. */
export function summarizeAttendance(total: number, participatedNumbers: number[]): AttendanceSummary {
  const safeTotal = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  const unique = Array.from(new Set(participatedNumbers.filter((value) => value > 0))).sort(
    (left, right) => left - right,
  );

  const inRange = unique.filter((value) => value <= safeTotal);
  const outOfRangeNumbers = unique.filter((value) => value > safeTotal);

  const missingNumbers: number[] = [];
  for (let number = 1; number <= safeTotal; number += 1) {
    if (!inRange.includes(number)) missingNumbers.push(number);
  }

  return {
    total: safeTotal,
    participatedNumbers: inRange,
    missingNumbers,
    outOfRangeNumbers,
    participationRate: safeTotal > 0 ? Math.round((inRange.length / safeTotal) * 100) : 0,
  };
}

/** 교사가 복사해 갈 수 있는 한 줄 요약. */
export function formatAttendanceSummary(summary: AttendanceSummary, classLabel = ""): string {
  const prefix = classLabel.trim() ? `${classLabel.trim()} ` : "";
  if (summary.total === 0) return `${prefix}학급 인원을 입력해 주세요.`;
  if (summary.missingNumbers.length === 0) {
    return `${prefix}${summary.total}명 모두 질문 기록이 있습니다.`;
  }
  return `${prefix}미제출 ${summary.missingNumbers.length}명: ${summary.missingNumbers
    .map((number) => `${number}번`)
    .join(", ")}`;
}
