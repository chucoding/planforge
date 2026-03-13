"""planforge implement <prompt> - run implementation via configured implementer provider."""

import re
import subprocess
import sys
from pathlib import Path

from planforge.utils.paths import get_project_root
from planforge.utils.config import load_config
from planforge.utils.context import load_merged_context
from planforge.utils.active_plan import get_active_plan_path
from planforge.utils.plan_files import parse_files_from_plan
from planforge.utils.project_context import get_project_context
from planforge.providers.codex import check_codex, run_implement as codex_run_implement
from planforge.providers.claude import check_claude, run_implement as claude_run_implement

MAX_CODE_CONTEXT_CHARS = 12000
MAX_RECENT_COMMITS_PER_FILE_CHARS = 400
MAX_RECENT_COMMITS_PER_FILE_COUNT = 5

BLOCK_RE = re.compile(
    r"(?:###\s*\d+\)\s*)?`([^`]+)`\s*[\r\n]+\s*```[\w]*\r?\n([\s\S]*?)```",
    re.MULTILINE,
)


def _extract_files_from_output(text: str) -> list[tuple[str, str]]:
    files = []
    for m in BLOCK_RE.finditer(text):
        raw_path = m.group(1).strip().replace("\\", "/").lstrip("/")
        if not raw_path or ".." in raw_path:
            continue
        content = m.group(2).replace("\r\n", "\n").rstrip()
        files.append((raw_path, content))
    return files


def _is_glob(path: str) -> bool:
    return "*" in path


def _build_code_context(project_root: str, files_to_change: list[str]) -> str | None:
    root = Path(project_root)
    parts = []
    total = 0
    for rel in files_to_change:
        if _is_glob(rel) or total >= MAX_CODE_CONTEXT_CHARS:
            continue
        abs_path = (root / rel).resolve()
        if not str(abs_path).startswith(str(root.resolve())):
            continue
        try:
            content = abs_path.read_text(encoding="utf-8")
            block = f"### `{rel}`\n```\n{content}\n```\n"
            if total + len(block) > MAX_CODE_CONTEXT_CHARS:
                remaining = MAX_CODE_CONTEXT_CHARS - total - 50
                if remaining > 0:
                    parts.append(f"### `{rel}`\n```\n{content[:remaining]}\n...(truncated)\n```\n")
                break
            parts.append(block)
            total += len(block)
        except (OSError, ValueError):
            pass
    return "\n".join(parts) if parts else None


def _run_git_log_oneline(project_root: str, rel_path: str) -> str | None:
    try:
        result = subprocess.run(
            ["git", "log", "--oneline", "-n", "1", "--", rel_path],
            cwd=project_root,
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode != 0:
            return None
        return (result.stdout or "").strip()
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return None


def _build_recent_commits_for_files(project_root: str, files_to_change: list[str]) -> str | None:
    root = Path(project_root)
    lines = []
    count = 0
    for rel in files_to_change:
        if count >= MAX_RECENT_COMMITS_PER_FILE_COUNT or _is_glob(rel):
            continue
        abs_path = (root / rel).resolve()
        if not str(abs_path).startswith(str(root.resolve())):
            continue
        msg = _run_git_log_oneline(project_root, rel)
        if msg:
            lines.append(f"{rel}: {msg}")
            count += 1
    if not lines:
        return None
    out = "\n".join(lines)
    if len(out) > MAX_RECENT_COMMITS_PER_FILE_CHARS:
        out = out[:MAX_RECENT_COMMITS_PER_FILE_CHARS] + "\n...(truncated)"
    return out


def _get_implementer_runner(provider: str):
    if provider == "claude":
        return (check_claude, claude_run_implement)
    if provider == "codex":
        return (check_codex, codex_run_implement)
    return (None, None)


def run_implement(args: list[str], opts: dict | None = None) -> None:
    opts = opts or {}
    prompt = " ".join(args).strip()
    if not prompt:
        print("Usage: planforge implement <prompt>", file=sys.stderr)
        raise SystemExit(1)
    cwd = str(Path.cwd())
    project_root = get_project_root(cwd)
    config = load_config(project_root)
    try:
        context = load_merged_context(
            project_root,
            context_dir=opts.get("context_dir") or ".planforge/context",
            inline_context=opts.get("context"),
        )
    except OSError as e:
        print("Failed to load context:", e, file=sys.stderr)
        raise SystemExit(1)
    plan_content = None
    if opts.get("plan_file"):
        plan_path = Path(cwd) / opts["plan_file"]
        try:
            plan_content = plan_path.read_text(encoding="utf-8")
        except OSError as e:
            print("Failed to read plan file:", e, file=sys.stderr)
            raise SystemExit(1)
    else:
        active_path = get_active_plan_path(project_root)
        if active_path:
            try:
                plan_content = Path(active_path).read_text(encoding="utf-8")
            except OSError:
                pass
    provider = config["implementer"]["provider"]
    check, run = _get_implementer_runner(provider)
    if not check or not run:
        print(f"Unknown implementer provider: {provider}. Check planforge.json.", file=sys.stderr)
        raise SystemExit(1)
    if not check():
        print(f"{provider} CLI not found. Install the provider CLI to use planforge implement.", file=sys.stderr)
        raise SystemExit(1)
    files_to_change = opts.get("files") or parse_files_from_plan(plan_content)
    code_context = _build_code_context(project_root, files_to_change) if files_to_change else None
    project_context, project_context_source = get_project_context(project_root, provider)
    recent_commits_per_file = (
        _build_recent_commits_for_files(project_root, files_to_change) if files_to_change else None
    )
    run_opts = {
        "cwd": project_root,
        "context": context,
        "planContent": plan_content,
        "filesToChange": files_to_change if files_to_change else None,
        "codeContext": code_context,
        "projectContext": project_context,
        "projectContextSource": project_context_source,
        "recentCommitsPerFile": recent_commits_per_file,
    }
    try:
        result = run(prompt, run_opts)
    except Exception as e:
        print("Implement failed:", e, file=sys.stderr)
        raise SystemExit(1)
    root = Path(project_root)
    for rel_path, content in _extract_files_from_output(result):
        abs_path = (root / rel_path).resolve()
        if not str(abs_path).startswith(str(root.resolve())):
            continue
        abs_path.parent.mkdir(parents=True, exist_ok=True)
        abs_path.write_text(content, encoding="utf-8")
        print("Written:", rel_path)
    print(result)
