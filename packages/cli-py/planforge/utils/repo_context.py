"""Collect repository context (git status, diff stat, top-level dirs) for plan prompts. Capped in size."""

import subprocess
from pathlib import Path

MAX_REPO_CONTEXT_CHARS = 3500
SKIP_DIRS = frozenset({".git", "node_modules", ".cursor", "dist", "build", "__pycache__", ".venv", "venv"})


def _run_git(cwd: str, *args: str) -> str | None:
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode != 0:
            return None
        return (result.stdout or "").strip()
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return None


def _is_git_repo(cwd: str) -> bool:
    return _run_git(cwd, "rev-parse", "--is-inside-work-tree") == "true"


def _get_top_level_dirs(cwd: str) -> list[str]:
    try:
        return sorted(
            p.name for p in Path(cwd).iterdir()
            if p.is_dir() and p.name not in SKIP_DIRS
        )
    except OSError:
        return []


def get_repo_context(project_root: str) -> str | None:
    if not _is_git_repo(project_root):
        return None
    parts = []
    status = _run_git(project_root, "status", "--short")
    if status:
        parts.append("## git status --short\n" + status)
    diff_stat = _run_git(project_root, "diff", "--stat")
    if diff_stat:
        parts.append("## git diff --stat\n" + diff_stat)
    cached = _run_git(project_root, "diff", "--cached", "--stat")
    if cached:
        parts.append("## git diff --cached --stat\n" + cached)
    dirs = _get_top_level_dirs(project_root)
    if dirs:
        parts.append("## top-level directories\n" + ", ".join(dirs))
    if not parts:
        return None
    out = "\n\n".join(parts)
    if len(out) > MAX_REPO_CONTEXT_CHARS:
        out = out[:MAX_REPO_CONTEXT_CHARS] + "\n...(truncated)"
    return out
