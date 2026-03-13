"""Conversation context loaders (markdown directory and inline text)."""

from pathlib import Path

from planforge.utils.paths import get_default_context_dirs


def _resolve_context_bases(cwd: str, context_dir: str | None) -> list[Path]:
    if context_dir:
        base = (Path(cwd) / context_dir).resolve()
        if not base.exists():
            return []
        if not base.is_dir():
            raise OSError(f"Context path is not a directory: {context_dir}")
        return [base]

    bases: list[Path] = []
    for candidate in get_default_context_dirs(cwd):
        base = Path(candidate).resolve()
        if base.exists() and base.is_dir():
            bases.append(base)
    return bases


def load_context_dir(cwd: str, context_dir: str | None) -> str | None:
    root = Path(cwd).resolve()
    bases = _resolve_context_bases(cwd, context_dir)
    if not bases:
        return None

    files: list[Path] = []
    for base in bases:
        files.extend(path for path in base.rglob("*") if path.is_file() and path.name.lower().endswith(".md"))
    files.sort(key=lambda path: (-path.stat().st_mtime, path.as_posix()))

    blocks: list[str] = []
    for path in files:
        content = path.read_text(encoding="utf-8").strip()
        if not content:
            continue
        rel = path.relative_to(root).as_posix()
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
