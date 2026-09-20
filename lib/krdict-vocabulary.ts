export type KrdictVocabulary = {
  term: string;
  meaning: string;
  source: "krdict";
};

const SEARCH_URL = "https://krdict.korean.go.kr/api/search";
const REQUEST_TIMEOUT_MS = 2500;
const MAX_RESPONSE_BYTES = 128_000;
const MAX_CACHE_ENTRIES = 256;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { value: KrdictVocabulary; expiresAt: number }>();

function normalizeTerm(term: string): string | null {
  const normalized = term.normalize("NFC").trim();
  return /^[가-힣]{1,16}$/.test(normalized) ? normalized : null;
}

function decodeXmlText(value: string): string | null {
  let invalidEntity = false;
  const decoded = value.replace(/&(#(?:x[0-9a-fA-F]+|[0-9]+)|[a-zA-Z]+);/g, (_, entity: string) => {
    const predefined: Record<string, string> = {
      amp: "&",
      apos: "'",
      gt: ">",
      lt: "<",
      quot: '"',
    };
    if (entity in predefined) return predefined[entity];
    if (entity.startsWith("#")) {
      const hex = entity[1]?.toLowerCase() === "x";
      const number = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (Number.isInteger(number) && number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff)) {
        return String.fromCodePoint(number);
      }
    }
    invalidEntity = true;
    return "";
  });
  if (invalidEntity || /&(?:#|[a-zA-Z])/.test(decoded) || /[<>\u0000-\u001f\u007f]/.test(decoded)) {
    return null;
  }
  return decoded.replace(/\s+/g, " ").trim();
}

function tagText(section: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>([^<>]*)<\\/${tag}>`).exec(section);
  return match ? decodeXmlText(match[1]) : null;
}

function parseResponse(xml: string, requestedTerm: string): KrdictVocabulary | null {
  if (/<\s*!(?:DOCTYPE|ENTITY)\b/i.test(xml) || !/<channel>/.test(xml) || !/<\/channel>/.test(xml)) {
    return null;
  }

  const meanings: string[] = [];
  const items = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
  for (const item of items) {
    if (tagText(item[1], "word") !== requestedTerm) continue;
    for (const sense of item[1].matchAll(/<sense>([\s\S]*?)<\/sense>/g)) {
      const definition = tagText(sense[1], "definition");
      if (definition && definition.length <= 220 && !meanings.includes(definition)) {
        meanings.push(definition);
      }
      if (meanings.length >= 3) break;
    }
    if (meanings.length >= 3) break;
  }
  if (!meanings.length) return null;

  return {
    term: requestedTerm,
    meaning: meanings.length === 1 ? meanings[0] : meanings.map((meaning, index) => `${index + 1}. ${meaning}`).join(" / "),
    source: "krdict",
  };
}

async function readBoundedResponse(response: Response): Promise<string | null> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) return null;
  if (!response.body) return null;

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let xml = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        return null;
      }
      xml += decoder.decode(value, { stream: true });
    }
    return xml + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

/** Looks up only an exact Korean lemma. No passage or student utterance is sent to the dictionary. */
export async function lookupKrdictVocabulary(
  term: string,
  options: { fetcher?: typeof fetch } = {},
): Promise<KrdictVocabulary | null> {
  const lemma = normalizeTerm(term);
  const key = process.env.KRDIC_API_KEY?.trim();
  if (!lemma || !key || !/^[0-9a-fA-F]{32}$/.test(key)) return null;

  // Test-injected fetchers bypass the production cache so tests stay deterministic.
  if (!options.fetcher) {
    const cached = cache.get(lemma);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (cached) cache.delete(lemma);
  }

  const url = new URL(SEARCH_URL);
  url.searchParams.set("key", key);
  url.searchParams.set("q", lemma);
  url.searchParams.set("method", "exact");
  url.searchParams.set("part", "word");
  url.searchParams.set("num", "10");
  url.searchParams.set("translated", "n");

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await (options.fetcher ?? fetch)(url, {
      method: "GET",
      headers: { accept: "application/xml" },
      signal: abortController.signal,
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) return null;
    const xml = await readBoundedResponse(response);
    if (!xml) return null;
    const result = parseResponse(xml, lemma);
    if (result && !options.fetcher) {
      if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value ?? "");
      cache.set(lemma, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
    }
    return result;
  } catch {
    // Fetch failures can contain the URL and therefore the secret. Never log or rethrow them.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
