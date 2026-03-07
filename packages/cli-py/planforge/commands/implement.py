"""planforge implement <prompt> - run implementation via configured implementer provider."""

import re
import sys
from pathlib import Path

from planforge.utils.paths import get_project_root
from planforge.utils.config import load_config
from planforge.utils.active_plan import get_active_plan_path
from planforge.providers.codex import check_codex, run_implement as codex_run_implement
from planforge.providers.claude import check_claude, run_implement as claude_run_implement

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
    context_parts = []
    if opts.get("context_file"):
        ctx_path = Path(cwd) / opts["context_file"]
        try:
            content = ctx_path.read_text(encoding="utf-8").strip()
            if content:
                context_parts.append(content)
        except OSError as e:
            print("Failed to read context file:", e, file=sys.stderr)
            raise SystemExit(1)
    if (opts.get("context") or "").strip():
        context_parts.append(opts["context"].strip())
    context = "\n\n".join(context_parts) if context_parts else None
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
    config = load_config(project_root)
    provider = config["implementer"]["provider"]
    check, run = _get_implementer_runner(provider)
    if not check or not run:
        print(f"Unknown implementer provider: {provider}. Check planforge.json.", file=sys.stderr)
        raise SystemExit(1)
    if not check():
        print(f"{provider} CLI not found. Install the provider CLI to use planforge implement.", file=sys.stderr)
        raise SystemExit(1)
    run_opts = {"cwd": project_root, "context": context, "planContent": plan_content}
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
