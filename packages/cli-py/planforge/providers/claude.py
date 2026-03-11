"""Claude provider - planning (/p) and implementation (/i)."""

import os
import subprocess
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


def check_claude() -> bool:
    return has_command("claude")


def complete_one_turn(
    system_prompt: str,
    user_message: str,
    *,
    cwd: str | None = None,
    model: str | None = None,
) -> str:
    """Single-turn completion for doctor ai workflow tests."""
    cwd = cwd or os.getcwd()
    args = ["--system-prompt", system_prompt.strip(), "-p", user_message.strip()]
    if model:
        args = ["--model", model] + args
    result = subprocess.run(
        ["claude"] + args,
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=120,
    )
    if result.returncode != 0:
        msg = result.stderr or result.stdout or "Claude exited non-zero"
        raise RuntimeError("Claude complete_one_turn failed: " + msg)
    return (result.stdout or "").strip()


def _get_repo_root() -> str:
    return str(Path(get_templates_root()).parent)


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
        body += f"\n\n---\n\nProject context ({opts.get('projectContextSource') or 'CLAUDE.md'}):\n" + (opts["projectContext"] or "").strip()
    if (opts.get("repoContext") or "").strip():
        body += "\n\n---\n\nRepository context:\n" + (opts["repoContext"] or "").strip()
    if (opts.get("context") or "").strip():
        body += "\n\n---\n\nConversation context:\n" + (opts["context"] or "").strip()
    full_prompt = body + "\n\n---\n\nUser goal: " + goal
    result = subprocess.run(
        ["claude"],
        input=full_prompt,
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=300,
    )
    if result.returncode != 0:
        msg = result.stderr or result.stdout or "Claude exited non-zero"
        raise RuntimeError("Claude plan failed: " + msg)
    return (result.stdout or "").strip()


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
        body += f"\n\n---\n\nProject context ({opts.get('projectContextSource') or 'CLAUDE.md'}):\n" + (opts["projectContext"] or "").strip()
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
    result = subprocess.run(
        ["claude"],
        input=full_prompt,
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=300,
    )
    if result.returncode != 0:
        msg = result.stderr or result.stdout or "Claude exited non-zero"
        raise RuntimeError("Claude implement failed: " + msg)
    return (result.stdout or "").strip()
