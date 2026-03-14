"""Load prompt content from a file path (LangChain-style load_prompt). No fallback: file must exist."""

from pathlib import Path


def load_prompt(path: str | Path) -> str:
    """Load prompt text from a file. Returns stripped content. Raises if file is missing or unreadable."""
    p = Path(path)
    return p.read_text(encoding="utf-8").strip()
