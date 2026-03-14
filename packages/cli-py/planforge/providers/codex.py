"""Codex provider - planning (/p) and implementation (/i)."""

import os
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

from planforge.utils.shell import has_command, resolve_command_path_with_npm_fallback
from planforge.utils.paths import get_prompts_dir
from planforge.utils.prompt import load_prompt


CODEX_NOT_FOUND_MSG = "codex not found in PATH or common locations. Install: npm install -g @openai/codex"


def _resolve_codex_exe() -> str | None:
    return resolve_command_path_with_npm_fallback("codex")


def check_codex() -> bool:
    return has_command("codex") or _resolve_codex_exe() is not None


def complete_one_turn(
    system_prompt: str,
    user_message: str,
    *,
    cwd: str | None = None,
    model: str | None = None,
) -> str:
    """Single-turn completion for doctor ai workflow tests."""
    cwd = cwd or os.getcwd()
    full_prompt = system_prompt.strip() + "\n\n---\n\nUser: " + user_message.strip()
    return _run_codex_exec(full_prompt, cwd, allow_plan_fallback=False)


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


def _run_codex_exec(full_prompt: str, cwd: str, *, allow_plan_fallback: bool = False) -> str:
    """Run codex exec. When allow_plan_fallback is True (plan only), exit code 1 may still
    return stdout if it looks like a plan (e.g. Codex 1 due to rollout/cache). Other non-zero
    (timeout, signals) are never accepted. For implement, leave False so non-zero is always failure.
    """
    exe = _resolve_codex_exe()
    if not exe:
        raise RuntimeError(CODEX_NOT_FOUND_MSG)

    if os.name == "nt":
        fd, temp_path = tempfile.mkstemp(suffix=".txt", prefix="planforge-")
        try:
            os.write(fd, full_prompt.encode("utf-8"))
            os.close(fd)
            escaped = temp_path.replace("'", "''")
            escaped_exe = exe.replace("'", "''")
            script = f"Get-Content -Raw -LiteralPath '{escaped}' -Encoding UTF8 | & '{escaped_exe}' exec -"
            result = subprocess.run(
                ["powershell", "-NoProfile", "-Command", script],
                cwd=cwd,
                capture_output=True,
                text=True,
                timeout=300,
            )
            out = (result.stdout or "").strip()
            if result.returncode != 0:
                if allow_plan_fallback and result.returncode == 1 and _looks_like_plan(out):
                    print("Warning: Codex exited with code 1 but stdout looks like a plan; saving it anyway.", file=sys.stderr)
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
        [exe, "exec", full_prompt],
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=300,
    )
    out = (result.stdout or "").strip()
    if result.returncode != 0:
        if allow_plan_fallback and result.returncode == 1 and _looks_like_plan(out):
            print("Warning: Codex exited with code 1 but stdout looks like a plan; saving it anyway.", file=sys.stderr)
            return out
        msg = result.stderr or result.stdout or "Codex exited non-zero"
        raise RuntimeError(msg)
    return out


def _run_codex_exec_streaming(
    full_prompt: str, cwd: str, *, allow_plan_fallback: bool = False
) -> str:
    """Run codex exec with streaming: forward stdout/stderr to the current process so the user
    sees logs in real time. Returns collected stdout when done. When allow_plan_fallback is True
    (plan only), exit code 1 may still return stdout if it looks like a plan.
    """
    exe = _resolve_codex_exe()
    if not exe:
        raise RuntimeError(CODEX_NOT_FOUND_MSG)

    stdout_chunks: list[str] = []

    def read_stdout(proc: subprocess.Popen) -> None:
        if proc.stdout is None:
            return
        for line in iter(proc.stdout.readline, ""):
            stdout_chunks.append(line)
            sys.stdout.write(line)
            sys.stdout.flush()

    def read_stderr(proc: subprocess.Popen) -> None:
        if proc.stderr is None:
            return
        for line in iter(proc.stderr.readline, ""):
            sys.stderr.write(line)
            sys.stderr.flush()

    if os.name == "nt":
        fd, temp_path = tempfile.mkstemp(suffix=".txt", prefix="planforge-")
        try:
            os.write(fd, full_prompt.encode("utf-8"))
            os.close(fd)
            escaped = temp_path.replace("'", "''")
            escaped_exe = exe.replace("'", "''")
            script = f"Get-Content -Raw -LiteralPath '{escaped}' -Encoding UTF8 | & '{escaped_exe}' exec -"
            proc = subprocess.Popen(
                ["powershell", "-NoProfile", "-Command", script],
                cwd=cwd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
        except Exception:
            try:
                os.unlink(temp_path)
            except OSError:
                pass
            raise
    else:
        proc = subprocess.Popen(
            [exe, "exec", full_prompt],
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        temp_path = None

    t_out = threading.Thread(target=read_stdout, args=(proc,))
    t_err = threading.Thread(target=read_stderr, args=(proc,))
    t_out.daemon = True
    t_err.daemon = True
    t_out.start()
    t_err.start()
    proc.wait()

    if temp_path is not None:
        try:
            os.unlink(temp_path)
        except OSError:
            pass

    t_out.join(timeout=1.0)
    t_err.join(timeout=1.0)

    out = "".join(stdout_chunks).strip()
    if proc.returncode == 0:
        return out
    if allow_plan_fallback and proc.returncode == 1 and _looks_like_plan(out):
        print(
            "Warning: Codex exited with code 1 but stdout looks like a plan; saving it anyway.",
            file=sys.stderr,
        )
        return out
    raise RuntimeError("Codex exited with code " + str(proc.returncode))


def run_plan(goal: str, opts: dict | None = None) -> str:
    opts = opts or {}
    cwd = opts.get("cwd") or os.getcwd()
    prompts_dir = Path(get_prompts_dir())
    default_path = prompts_dir / "planner-system.md"
    prompt_path = opts.get("systemPromptPath") or str(default_path)
    body = Path(prompt_path).read_text(encoding="utf-8").strip()
    if (opts.get("projectContext") or "").strip():
        body += f"\n\n---\n\nProject context ({opts.get('projectContextSource') or 'AGENTS.md'}):\n" + (opts["projectContext"] or "").strip()
    if (opts.get("repoContext") or "").strip():
        body += "\n\n---\n\nRepository context:\n" + (opts["repoContext"] or "").strip()
    if (opts.get("context") or "").strip():
        body += "\n\n---\n\nConversation context:\n" + (opts["context"] or "").strip()
    body += "\n\n---\n\n" + load_prompt(prompts_dir / "append-i18n.md") + "\n\n" + load_prompt(prompts_dir / "append-slug.md")
    full_prompt = body + "\n\n---\n\nUser goal: " + goal
    try:
        return _run_codex_exec_streaming(full_prompt, cwd, allow_plan_fallback=True)
    except Exception as e:
        raise RuntimeError("Codex plan failed: " + str(e)) from e


def run_implement(prompt: str, opts: dict | None = None) -> str:
    opts = opts or {}
    cwd = opts.get("cwd") or os.getcwd()
    prompts_dir = Path(get_prompts_dir())
    default_path = prompts_dir / "implementer-system.md"
    prompt_path = opts.get("systemPromptPath") or str(default_path)
    body = Path(prompt_path).read_text(encoding="utf-8").strip()
    if (opts.get("projectContext") or "").strip():
        body += f"\n\n---\n\nProject context ({opts.get('projectContextSource') or 'AGENTS.md'}):\n" + (opts["projectContext"] or "").strip()
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
