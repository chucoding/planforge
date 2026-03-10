"""Conversation context loaders (markdown directory and inline text)."""

from pathlib import Path


def load_context_dir(cwd: str, context_dir: str | None) -> str | None:
    if not context_dir:
        return None
    base = (Path(cwd) / context_dir).resolve()
    if not base.exists():
        return None
    if not base.is_dir():
        raise OSError(f"Context path is not a directory: {context_dir}")

    files = [p for p in base.rglob("*") if p.is_file() and p.name.lower().endswith(".md")]
    files.sort(key=lambda p: (-p.stat().st_mtime, p.as_posix()))

    blocks: list[str] = []
    for path in files:
        content = path.read_text(encoding="utf-8").strip()
        if not content:
            continue
        rel = path.relative_to(base).as_posix()
        blocks.append(f"### {rel}\n\n{content}")
    if not blocks:
        return None
    return "\n\n".join(blocks)


def load_merged_context(
    cwd: str,
    *,
    context_dir: str | None,
    inline_context: str | None,
) -> str | None:
    parts: list[str] = []

    dir_content = load_context_dir(cwd, context_dir)
    if dir_content:
        parts.append(dir_content)

    if (inline_context or "").strip():
        parts.append((inline_context or "").strip())

    return "\n\n".join(parts) if parts else None
