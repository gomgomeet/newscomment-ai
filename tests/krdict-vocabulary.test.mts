import assert from "node:assert/strict";
import test from "node:test";
import { lookupKrdictVocabulary } from "../lib/krdict-vocabulary.ts";

const TEST_KEY = "0123456789abcdef0123456789abcdef";
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<channel><total>1</total><item><word>맹수</word><sense>
<sense_order>1</sense_order><definition>사납고 힘이 센 짐승.</definition>
</sense></item></channel>`;

function withKey<T>(key: string | undefined, run: () => Promise<T>): Promise<T> {
  const original = process.env.KRDIC_API_KEY;
  if (key === undefined) delete process.env.KRDIC_API_KEY;
  else process.env.KRDIC_API_KEY = key;
  return run().finally(() => {
    if (original === undefined) delete process.env.KRDIC_API_KEY;
    else process.env.KRDIC_API_KEY = original;
  });
}

test("looks up only an exact Korean lemma, never a sentence", async () => {
  await withKey(TEST_KEY, async () => {
    let calls = 0;
    const fetcher: typeof fetch = async (input) => {
      calls += 1;
      const url = new URL(String(input));
      assert.equal(url.origin + url.pathname, "https://krdict.korean.go.kr/api/search");
      assert.equal(url.searchParams.get("q"), "맹수");
      assert.equal(url.searchParams.get("method"), "exact");
      assert.equal(url.searchParams.get("part"), "word");
      assert.equal(url.searchParams.get("num"), "10");
      assert.equal(url.searchParams.get("key"), TEST_KEY);
      return new Response(XML, { status: 200 });
    };
    assert.deepEqual(await lookupKrdictVocabulary(" 맹수 ", { fetcher }), {
      term: "맹수",
      meaning: "사납고 힘이 센 짐승.",
      source: "krdict",
    });
    assert.equal(await lookupKrdictVocabulary("맹수는 뭐야?", { fetcher }), null);
    assert.equal(calls, 1);
  });
});

test("does not make a request without a valid server key", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    return new Response(XML);
  };
  await withKey(undefined, async () => assert.equal(await lookupKrdictVocabulary("맹수", { fetcher }), null));
  await withKey("invalid", async () => assert.equal(await lookupKrdictVocabulary("맹수", { fetcher }), null));
  assert.equal(calls, 0);
});

test("rejects failed HTTP responses, mismatched entries and dictionary errors", async () => {
  await withKey(TEST_KEY, async () => {
    const failed: typeof fetch = async () => new Response(XML, { status: 503 });
    const mismatch: typeof fetch = async () => new Response(XML.replace("<word>맹수</word>", "<word>사자</word>"));
    const apiError: typeof fetch = async () => new Response("<error><error_code>020</error_code><message>Unregistered key</message></error>");
    assert.equal(await lookupKrdictVocabulary("맹수", { fetcher: failed }), null);
    assert.equal(await lookupKrdictVocabulary("맹수", { fetcher: mismatch }), null);
    assert.equal(await lookupKrdictVocabulary("맹수", { fetcher: apiError }), null);
  });
});

test("decodes safe XML entities and lists a bounded number of senses", async () => {
  await withKey(TEST_KEY, async () => {
    const xml = `<channel><item><word>나무</word>
      <sense><definition>줄기와 가지가 있는 식물 &amp; 자연 자원.</definition></sense>
      <sense><definition>가구를 만드는 재목.</definition></sense>
      <sense><definition>불을 때는 &#xB098;&#xBB34;.</definition></sense>
      <sense><definition>네 번째 뜻.</definition></sense>
    </item></channel>`;
    const fetcher: typeof fetch = async () => new Response(xml);
    const result = await lookupKrdictVocabulary("나무", { fetcher });
    assert.equal(result?.meaning, "1. 줄기와 가지가 있는 식물 & 자연 자원. / 2. 가구를 만드는 재목. / 3. 불을 때는 나무.");
  });
});

test("rejects unsafe XML, oversized bodies and URL-bearing network errors without logging the key", async () => {
  await withKey(TEST_KEY, async () => {
    const unsafe: typeof fetch = async () => new Response(`<channel><item><word>맹수</word><sense><definition>&lt;script&gt;bad&lt;/script&gt;</definition></sense></item></channel>`);
    const dtd: typeof fetch = async () => new Response(`<!DOCTYPE channel [<!ENTITY leak SYSTEM "file:///etc/passwd">]>${XML}`);
    const oversized: typeof fetch = async () => new Response("x".repeat(128_001));
    const networkError: typeof fetch = async (input) => { throw new Error(String(input)); };
    const originalError = console.error;
    const logs: string[] = [];
    console.error = (...args: unknown[]) => { logs.push(args.map(String).join(" ")); };
    try {
      assert.equal(await lookupKrdictVocabulary("맹수", { fetcher: unsafe }), null);
      assert.equal(await lookupKrdictVocabulary("맹수", { fetcher: dtd }), null);
      assert.equal(await lookupKrdictVocabulary("맹수", { fetcher: oversized }), null);
      assert.equal(await lookupKrdictVocabulary("맹수", { fetcher: networkError }), null);
      assert.equal(logs.join(" ").includes(TEST_KEY), false);
    } finally {
      console.error = originalError;
    }
  });
});
