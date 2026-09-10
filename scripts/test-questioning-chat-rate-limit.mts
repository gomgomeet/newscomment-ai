import assert from "node:assert/strict";

import { checkQuestioningChatRateLimit } from "../lib/questioning-chat-rate-limit-core.ts";

function requestFrom(address: string) {
  return new Request("https://example.test/api/chat", {
    headers: { "x-forwarded-for": address },
  });
}

for (let index = 0; index < 120; index += 1) {
  assert.equal(
    checkQuestioningChatRateLimit(
      requestFrom("192.0.2.10"), "lesson-a", `session_a_${String(index).padStart(3, "0")}`,
    ).allowed,
    true,
  );
}
assert.equal(
  checkQuestioningChatRateLimit(requestFrom("192.0.2.10"), "lesson-a", "session_a_over").allowed,
  false,
);
assert.equal(
  checkQuestioningChatRateLimit(requestFrom("192.0.2.10"), "lesson-b", "session_b_first").allowed,
  true,
  "기존 웹 챗봇의 다른 수업은 같은 학교 NAT의 수업별 한도를 공유하면 안 된다",
);

for (let index = 0; index < 120; index += 1) {
  assert.equal(
    checkQuestioningChatRateLimit(
      requestFrom(`198.51.100.${index + 1}`),
      `lite-scope-lesson-${index}`,
      `scope_session_${String(index).padStart(3, "0")}`,
      { addressScope: "lite:deployment-scope-test" },
    ).allowed,
    true,
  );
}
assert.equal(
  checkQuestioningChatRateLimit(
    requestFrom("198.51.101.1"), "lite-scope-over", "scope_session_over",
    { addressScope: "lite:deployment-scope-test" },
  ).allowed,
  false,
  "경량앱 배포 ID를 공유하는 요청은 출구 IP가 달라도 분당 상한을 가져야 한다",
);

for (let scope = 0; scope < 3; scope += 1) {
  for (let index = 0; index < 120; index += 1) {
    assert.equal(
      checkQuestioningChatRateLimit(
        requestFrom("203.0.113.10"),
        `lite-global-${scope}`,
        `global_${scope}_${String(index).padStart(3, "0")}`,
        { addressScope: `lite:deployment-global-${scope}` },
      ).allowed,
      true,
    );
  }
}
assert.equal(
  checkQuestioningChatRateLimit(
    requestFrom("203.0.113.10"), "lite-global-over", "global_session_over",
    { addressScope: "lite:deployment-global-over" },
  ).allowed,
  false,
  "배포 ID를 바꾸더라도 경량앱 출구 IP 전체 상한을 우회하면 안 된다",
);

console.log("questioning chat rate-limit checks: all passed");
