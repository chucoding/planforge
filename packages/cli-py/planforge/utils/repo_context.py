"""Collect repository context (git status, diff stat, top-level dirs) for plan prompts. Optionally ripgrep by goal. Capped in size."""

import subprocess
from pathlib import Path

MAX_REPO_CONTEXT_CHARS = 3500
MAX_RIPGREP_CONTEXT_CHARS = 2000
MAX_REPO_CONTEXT_WITH_RG_CHARS = 5000
MAX_RIPGREP_FILES = 15
MAX_RECENT_COMMITS_CHARS = 500
MAX_GOAL_FILES_LOG_CHARS = 600
MAX_GOAL_FILES_LOG_FILES = 5
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


def _get_recent_commits_context(project_root: str) -> str | None:
    out = _run_git(project_root, "log", "--oneline", "-n", "10")
    if not out:
        return None
    block = "## recent commits\n" + out
    if len(block) > MAX_RECENT_COMMITS_CHARS:
        return block[:MAX_RECENT_COMMITS_CHARS] + "\n...(truncated)"
    return block


def _get_ripgrep_file_list(project_root: str, goal: str) -> list[str]:
    pattern = goal.strip()[:100]
    if not pattern:
        return []
    glob_excludes = [
        "!.git/**",
        "!node_modules/**",
        "!.cursor/**",
        "!dist/**",
        "!build/**",
        "!__pycache__/**",
        "!.venv/**",
        "!venv/**",
    ]
    args = (
        ["rg", "-F", "-l", "--max-count", "1", "--max-filesize", "100k"]
        + [x for g in glob_excludes for x in ("-g", g)]
        + ["--", pattern]
    )
    try:
        result = subprocess.run(
            args,
            cwd=project_root,
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode not in (0, 1):
            return []
        return [
            line.strip()
            for line in (result.stdout or "").strip().splitlines()
            if line.strip()
        ][:MAX_GOAL_FILES_LOG_FILES]
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return []


def _get_goal_related_files_log_context(project_root: str, goal: str) -> str | None:
    files = _get_ripgrep_file_list(project_root, goal)
    if not files:
        return None
    lines = []
    for path in files:
        log = _run_git(project_root, "log", "--oneline", "-n", "2", "--", path)
        if log:
            lines.append(path + ":")
            lines.append("\n".join("  " + l for l in log.splitlines()))
    if not lines:
        return None
    block = "## recent changes (goal-related files)\n" + "\n".join(lines)
    if len(block) > MAX_GOAL_FILES_LOG_CHARS:
        block = block[:MAX_GOAL_FILES_LOG_CHARS] + "\n...(truncated)"
    return block


def _get_ripgrep_context(project_root: str, goal: str) -> str | None:
    pattern = goal.strip()[:100]
    if not pattern:
        return None
    glob_excludes = [
        "!.git/**",
        "!node_modules/**",
        "!.cursor/**",
        "!dist/**",
        "!build/**",
        "!__pycache__/**",
        "!.venv/**",
        "!venv/**",
    ]
    args = (
        ["rg", "-F", "-l", "--max-count", "1", "--max-filesize", "100k"]
        + [x for g in glob_excludes for x in ("-g", g)]
        + ["--", pattern]
    )
    try:
        result = subprocess.run(
            args,
            cwd=project_root,
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode not in (0, 1):
            return None
        lines = [
            line.strip()
            for line in (result.stdout or "").strip().splitlines()
            if line.strip()
        ][:MAX_RIPGREP_FILES]
        if not lines:
            return None
        out = "## ripgrep (goal-related)\n" + "\n".join(lines)
        if len(out) > MAX_RIPGREP_CONTEXT_CHARS:
            out = out[:MAX_RIPGREP_CONTEXT_CHARS] + "\n...(truncated)"
        return out
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return None


def get_repo_context(project_root: str, goal: str | None = None) -> str | None:
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
    recent_commits = _get_recent_commits_context(project_root)
    if recent_commits:
        parts.append(recent_commits)
    if not parts and not (goal and goal.strip()):
        return None
    out = "\n\n".join(parts) if parts else ""
    max_base = (
        MAX_REPO_CONTEXT_WITH_RG_CHARS
        - MAX_RIPGREP_CONTEXT_CHARS
        - MAX_RECENT_COMMITS_CHARS
        - MAX_GOAL_FILES_LOG_CHARS
        - 50
        if goal and goal.strip()
        else MAX_REPO_CONTEXT_CHARS - MAX_RECENT_COMMITS_CHARS
    )
    if out and len(out) > max_base:
        out = out[:max_base] + "\n...(truncated)"
    if goal and goal.strip():
        rg_block = _get_ripgrep_context(project_root, goal)
        if rg_block:
            out = (out + "\n\n" + rg_block) if out else rg_block
        goal_log = _get_goal_related_files_log_context(project_root, goal)
        if goal_log:
            out = (out + "\n\n" + goal_log) if out else goal_log
        if len(out) > MAX_REPO_CONTEXT_WITH_RG_CHARS:
            out = out[:MAX_REPO_CONTEXT_WITH_RG_CHARS] + "\n...(truncated)"
    elif out and len(out) > MAX_REPO_CONTEXT_CHARS:
        out = out[:MAX_REPO_CONTEXT_CHARS] + "\n...(truncated)"
    return out or None
