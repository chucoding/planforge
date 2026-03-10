"""Codex provider - planning (/p) and implementation (/i)."""

import os
import subprocess
import sys
import tempfile
from pathlib import Path

from planforge.utils.shell import has_command
from planforge.utils.paths import get_templates_root

DEFAULT_PLANNER_FALLBACK = (
    "Produce a development plan with sections: Goal, Assumptions, Relevant Codebase Areas, "
    "Proposed Changes, Step-by-Step Plan, Files Likely to Change, Risks, Validation Checklist."
)
DEFAULT_IMPLEMENTER_FALLBACK = (
    "Implement the user request. Produce code or concrete changes as requested."
)


def check_codex() -> bool:
    return has_command("codex")


def _get_repo_root() -> str:
    return str(Path(get_templates_root()).parent)


def _looks_like_plan(stdout: str) -> bool:
    """True if stdout looks like a development plan (expected section headings).
    Used to still save the plan when Codex exits 1 due to rollout recorder / cache errors.
    """
    t = (stdout or "").strip()
    if len(t) < 200:
        return False
    has_goal = "**Goal**" in t or "## Goal" in t
    has_later = (
        "**Step-by-Step Plan**" in t
        or "## Step-by-Step Plan" in t
        or "**Validation Checklist**" in t
        or "## Validation Checklist" in t
    )
    return has_goal and has_later


def _run_codex_exec(full_prompt: str, cwd: str) -> str:
    max_buffer = 1024 * 1024
    if os.name == "nt":
        fd, temp_path = tempfile.mkstemp(suffix=".txt", prefix="planforge-")
        try:
            os.write(fd, full_prompt.encode("utf-8"))
            os.close(fd)
            escaped = temp_path.replace("'", "''")
            script = f"codex exec (Get-Content -Raw -LiteralPath '{escaped}')"
            result = subprocess.run(
                ["powershell", "-NoProfile", "-Command", script],
                cwd=cwd,
                capture_output=True,
                text=True,
                timeout=300,
            )
            out = (result.stdout or "").strip()
            if result.returncode != 0:
                if _looks_like_plan(out):
                    print("Warning: Codex exited with code", result.returncode, "but stdout looks like a plan; saving it anyway.", file=sys.stderr)
                    return out
                msg = result.stderr or result.stdout or "Codex exited non-zero"
                raise RuntimeError(msg)
            return out
        finally:
            try:
                os.unlink(temp_path)
            except OSError:
                pass
    result = subprocess.run(
        ["codex", "exec", full_prompt],
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=300,
    )
    out = (result.stdout or "").strip()
    if result.returncode != 0:
        if _looks_like_plan(out):
            print("Warning: Codex exited with code", result.returncode, "but stdout looks like a plan; saving it anyway.", file=sys.stderr)
            return out
        msg = result.stderr or result.stdout or "Codex exited non-zero"
        raise RuntimeError(msg)
    return out


def run_plan(goal: str, opts: dict | None = None) -> str:
    opts = opts or {}
    cwd = opts.get("cwd") or os.getcwd()
    repo_root = _get_repo_root()
    default_path = Path(repo_root) / "packages" / "core" / "prompts" / "planner-system.md"
    prompt_path = opts.get("systemPromptPath") or str(default_path)
    try:
        body = Path(prompt_path).read_text(encoding="utf-8").strip()
    except (OSError, ValueError):
        body = DEFAULT_PLANNER_FALLBACK
    if (opts.get("projectContext") or "").strip():
        body += "\n\n---\n\nProject context (AGENTS.md):\n" + (opts["projectContext"] or "").strip()
    if (opts.get("repoContext") or "").strip():
        body += "\n\n---\n\nRepository context:\n" + (opts["repoContext"] or "").strip()
    if (opts.get("context") or "").strip():
        body += "\n\n---\n\nConversation context:\n" + (opts["context"] or "").strip()
    full_prompt = body + "\n\n---\n\nUser goal: " + goal
    try:
        return _run_codex_exec(full_prompt, cwd)
    except Exception as e:
        raise RuntimeError("Codex plan failed: " + str(e)) from e


def run_implement(prompt: str, opts: dict | None = None) -> str:
    opts = opts or {}
    cwd = opts.get("cwd") or os.getcwd()
    repo_root = _get_repo_root()
    default_path = Path(repo_root) / "packages" / "core" / "prompts" / "implementer-system.md"
    prompt_path = opts.get("systemPromptPath") or str(default_path)
    try:
        body = Path(prompt_path).read_text(encoding="utf-8").strip()
    except (OSError, ValueError):
        body = DEFAULT_IMPLEMENTER_FALLBACK
    if (opts.get("projectContext") or "").strip():
        body += "\n\n---\n\nProject context (AGENTS.md):\n" + (opts["projectContext"] or "").strip()
    if (opts.get("context") or "").strip():
        body += "\n\n---\n\nConversation context:\n" + (opts["context"] or "").strip()
    if (opts.get("planContent") or "").strip():
        body += "\n\n---\n\nCurrent plan (follow this):\n" + (opts["planContent"] or "").strip()
    files_to_change = opts.get("filesToChange") or []
    if files_to_change:
        body += "\n\n---\n\nFiles to focus on:\n" + "\n".join(files_to_change)
    if (opts.get("recentCommitsPerFile") or "").strip():
        body += "\n\n---\n\nRecent commit (per file):\n" + (opts["recentCommitsPerFile"] or "").strip()
    if (opts.get("codeContext") or "").strip():
        body += "\n\n---\n\nRelevant file contents:\n" + (opts["codeContext"] or "").strip()
    full_prompt = body + "\n\n---\n\nUser request: " + prompt
    try:
        return _run_codex_exec(full_prompt, cwd)
    except Exception as e:
        raise RuntimeError("Codex implement failed: " + str(e)) from e
