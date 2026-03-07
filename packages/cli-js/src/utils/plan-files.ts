/**
 * Parse "## Files Likely to Change" section from plan markdown and return file paths/globs.
 * Lines like "- path" or "- `path`" are extracted; globs are kept as-is for "files to focus on" text.
 */

const SECTION_HEADING = "## Files Likely to Change";
const LIST_ITEM_RE = /^[-*]\s+(?:`([^`]+)`|(.+))$/;

/**
 * Extract file paths from the "Files Likely to Change" section of a plan document.
 * Returns unique non-empty paths (backticks stripped). Globs are included as strings.
 */
export function parseFilesFromPlan(planContent: string | undefined): string[] {
  if (!planContent?.trim()) return [];

  const lines = planContent.split(/\r?\n/);
  let inSection = false;
  const seen = new Set<string>();
  const paths: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## ")) {
      if (trimmed.toLowerCase().startsWith(SECTION_HEADING.toLowerCase())) {
        inSection = true;
        continue;
      }
      inSection = false;
      continue;
    }
    if (!inSection) continue;
    const m = trimmed.match(LIST_ITEM_RE);
    if (!m) continue;
    const path = (m[1] ?? m[2] ?? "").trim().replace(/^\/+/, "").replace(/\\/g, "/");
    if (!path || path.includes("..")) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    paths.push(path);
  }

  return paths;
}
