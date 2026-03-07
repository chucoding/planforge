"""Parse '## Files Likely to Change' section from plan markdown and return file paths/globs."""

import re

SECTION_HEADING = "## Files Likely to Change"
LIST_ITEM_RE = re.compile(r"^[-*]\s+(?:`([^`]+)`|(.+))$")


def parse_files_from_plan(plan_content: str | None) -> list[str]:
    """Extract file paths from the 'Files Likely to Change' section of a plan document.
    Returns unique non-empty paths (backticks stripped). Globs are included as strings.
    """
    if not (plan_content and plan_content.strip()):
        return []
    lines = plan_content.splitlines()
    in_section = False
    seen: set[str] = set()
    paths: list[str] = []
    for line in lines:
        trimmed = line.strip()
        if trimmed.startswith("## "):
            if trimmed.lower().startswith(SECTION_HEADING.lower()):
                in_section = True
            else:
                in_section = False
            continue
        if not in_section:
            continue
        m = LIST_ITEM_RE.match(trimmed)
        if not m:
            continue
        raw = (m.group(1) or m.group(2) or "").strip()
        path = raw.lstrip("/").replace("\\", "/")
        if not path or ".." in path or path in seen:
            continue
        seen.add(path)
        paths.append(path)
    return paths
