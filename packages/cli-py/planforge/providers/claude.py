"""Claude provider - planning (/p) and implementation (/i)."""

import os
import subprocess
import sys
import threading
from pathlib import Path

from planforge.utils.shell import has_command
from planforge.utils.paths import get_prompts_dir
from planforge.utils.prompt import load_prompt


def _run_claude_streaming(full_prompt: str, cwd: str) -> str:
    """Run Claude with streaming: forward stdout/stderr to the current process so the user
    sees logs in real time. Returns collected stdout when done.
    """
    proc = subprocess.Popen(
        ["claude"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=cwd,
        text=True,
    )
    proc.stdin.write(full_prompt)
    proc.stdin.close()

    stdout_chunks: list[str] = []

    def read_stdout() -> None:
        if proc.stdout is None:
            return
        for line in iter(proc.stdout.readline, ""):
            stdout_chunks.append(line)
            sys.stdout.write(line)
            sys.stdout.flush()

    def read_stderr() -> None:
        if proc.stderr is None:
            return
        for line in iter(proc.stderr.readline, ""):
            sys.stderr.write(line)
            sys.stderr.flush()

    t_out = threading.Thread(target=read_stdout)
    t_err = threading.Thread(target=read_stderr)
    t_out.daemon = True
    t_err.daemon = True
    t_out.start()
    t_err.start()
    proc.wait()
    t_out.join(timeout=1.0)
    t_err.join(timeout=1.0)

    out = "".join(stdout_chunks).strip()
    if proc.returncode != 0:
        raise RuntimeError("Claude exited with code " + str(proc.returncode))
    return out


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


def run_plan(goal: str, opts: dict | None = None) -> str:
    opts = opts or {}
    cwd = opts.get("cwd") or os.getcwd()
    prompts_dir = Path(get_prompts_dir())
    default_path = prompts_dir / "planner-system.md"
    prompt_path = opts.get("systemPromptPath") or str(default_path)
    body = Path(prompt_path).read_text(encoding="utf-8").strip()
    if (opts.get("projectContext") or "").strip():
        body += f"\n\n---\n\nProject context ({opts.get('projectContextSource') or 'CLAUDE.md'}):\n" + (opts["projectContext"] or "").strip()
    if (opts.get("repoContext") or "").strip():
        body += "\n\n---\n\nRepository context:\n" + (opts["repoContext"] or "").strip()
    if (opts.get("context") or "").strip():
        body += "\n\n---\n\nConversation context:\n" + (opts["context"] or "").strip()
    body += "\n\n---\n\n" + load_prompt(prompts_dir / "append-i18n.md") + "\n\n" + load_prompt(prompts_dir / "append-slug.md")
    full_prompt = body + "\n\n---\n\nUser goal: " + goal
    try:
        return _run_claude_streaming(full_prompt, cwd)
    except Exception as e:
        raise RuntimeError("Claude plan failed: " + str(e)) from e


def run_implement(prompt: str, opts: dict | None = None) -> str:
    opts = opts or {}
    cwd = opts.get("cwd") or os.getcwd()
    prompts_dir = Path(get_prompts_dir())
    default_path = prompts_dir / "implementer-system.md"
    prompt_path = opts.get("systemPromptPath") or str(default_path)
    body = Path(prompt_path).read_text(encoding="utf-8").strip()
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
