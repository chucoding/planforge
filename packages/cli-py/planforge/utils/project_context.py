"""Read provider-specific instruction files from project root for plan/implement context."""

from pathlib import Path

MAX_PROJECT_CONTEXT_CHARS = 3500


def get_preferred_instruction_file(provider: str) -> str | None:
    if provider == "codex":
        return "AGENTS.md"
    if provider == "claude":
        return "CLAUDE.md"
    return None


def _get_instruction_candidates(provider: str) -> tuple[str, ...]:
    preferred = get_preferred_instruction_file(provider)
    if preferred == "AGENTS.md":
        return ("AGENTS.md", "CLAUDE.md")
    if preferred == "CLAUDE.md":
        return ("CLAUDE.md", "AGENTS.md")
    return ("AGENTS.md", "CLAUDE.md")


def get_project_context(project_root: str, provider: str) -> tuple[str | None, str | None]:
    """Read provider-preferred project context with fallback to the other instruction file."""
    for name in _get_instruction_candidates(provider):
        path = Path(project_root) / name
        try:
            if not path.is_file():
                continue
            content = path.read_text(encoding="utf-8").strip()
            if not content:
                continue
            if len(content) > MAX_PROJECT_CONTEXT_CHARS:
                return (content[:MAX_PROJECT_CONTEXT_CHARS] + "\n...(truncated)", name)
            return (content, name)
        except (OSError, ValueError):
            pass
    return (None, None)
