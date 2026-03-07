"""Read AGENTS.md or CLAUDE.md from project root for plan/implement context. Capped in size."""

from pathlib import Path

MAX_PROJECT_CONTEXT_CHARS = 3500
CANDIDATES = ("AGENTS.md", "CLAUDE.md")


def get_project_context(project_root: str) -> str | None:
    """Read project context from AGENTS.md or CLAUDE.md (first existing). Returns None if none found or on error."""
    for name in CANDIDATES:
        path = Path(project_root) / name
        try:
            if not path.is_file():
                continue
            content = path.read_text(encoding="utf-8").strip()
            if not content:
                continue
            if len(content) > MAX_PROJECT_CONTEXT_CHARS:
                return content[:MAX_PROJECT_CONTEXT_CHARS] + "\n...(truncated)"
            return content
        except (OSError, ValueError):
            pass
    return None
