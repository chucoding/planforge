"""Extract http(s) URLs from goal and fetch content for plan context. Notion URLs are skipped (use Cursor /p with MCP)."""

import re
import urllib.error
import urllib.request

URL_RE = re.compile(r"https?://[^\s]+")
NOTION_HOST_RE = re.compile(r"^https?://([^/]*\.)?(notion\.(?:so|site))(\/|$)", re.IGNORECASE)
FETCH_TIMEOUT_S = 10
MAX_BODY = 100_000


def _trim_trailing_punctuation(url: str) -> str:
    return re.sub(r"[.,;:)!?\]]+$", "", url)


def extract_urls_from_goal(goal: str) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for m in URL_RE.finditer(goal):
        raw = m.group(0)
        url = _trim_trailing_punctuation(raw)
        if NOTION_HOST_RE.search(url):
            continue
        if url not in seen:
            seen.add(url)
            out.append(url)
    return out


def _fetch_url_content(url: str, timeout: int = FETCH_TIMEOUT_S) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "PlanForge-CLI/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return body[:MAX_BODY]
    except (urllib.error.URLError, OSError, ValueError):
        return ""


def fetch_urls_context(goal: str) -> str | None:
    """Fetch all non-Notion URLs from goal and return a single markdown block for context, or None if none."""
    urls = extract_urls_from_goal(goal)
    if not urls:
        return None
    blocks: list[str] = []
    for url in urls:
        content = _fetch_url_content(url).strip()
        if not content:
            continue
        blocks.append(f"## {url}\n\n{content[:50_000]}")
    if not blocks:
        return None
    return "---\n\n### Fetched URLs\n\n" + "\n\n".join(blocks)
