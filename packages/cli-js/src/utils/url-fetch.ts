/**
 * Extract http(s) URLs from text. Notion URLs (notion.so, notion.site) are excluded
 * so the CLI does not fetch them (use Cursor /p with MCP for Notion).
 */
const URL_RE = /https?:\/\/[^\s]+/g;
const NOTION_HOST_RE = /^https?:\/\/([^/]*\.)?(notion\.(so|site))(\/|$)/i;

function trimTrailingPunctuation(url: string): string {
  return url.replace(/[.,;:)!?\]]+$/, "");
}

export function extractUrlsFromGoal(goal: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(goal)) !== null) {
    const raw = m[0];
    const url = trimTrailingPunctuation(raw);
    if (NOTION_HOST_RE.test(url)) continue;
    if (!seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}

const FETCH_TIMEOUT_MS = 10_000;

/**
 * Fetch URL and return body as plain text / simplified markdown. Returns empty string on failure.
 */
export async function fetchUrlContent(url: string, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<string> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "PlanForge-CLI/1.0" },
    });
    if (!res.ok) return "";
    const text = await res.text();
    return text.slice(0, 100_000);
  } catch {
    return "";
  } finally {
    clearTimeout(t);
  }
}

/**
 * Fetch all non-Notion URLs from goal and return a single markdown block for context, or undefined if none.
 */
export async function fetchUrlsContext(goal: string): Promise<string | undefined> {
  const urls = extractUrlsFromGoal(goal);
  if (urls.length === 0) return undefined;
  const blocks: string[] = [];
  for (const url of urls) {
    const content = await fetchUrlContent(url);
    if (!content.trim()) continue;
    blocks.push(`## ${url}\n\n${content.trim().slice(0, 50_000)}`);
  }
  if (blocks.length === 0) return undefined;
  return "---\n\n### Fetched URLs\n\n" + blocks.join("\n\n");
}
