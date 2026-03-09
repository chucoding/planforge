"""planforge plan <goal> - generate .cursor/plans/<summary>-<hash>.plan.md via configured planner."""

import re
import secrets
from pathlib import Path

from planforge.utils.paths import get_project_root, get_plans_dir
from planforge.utils.config import load_config
from planforge.utils.context import load_merged_context
from planforge.utils.repo_context import get_repo_context
from planforge.utils.project_context import get_project_context
from planforge.providers.codex import check_codex, run_plan as codex_run_plan
from planforge.providers.claude import check_claude, run_plan as claude_run_plan

FILENAME_UNSAFE = re.compile(r'[\\/:*?"<>|]')


def _is_slug_valid(slug: str) -> bool:
    return len(slug) > 0 and not re.match(r"^-+$", slug)


def _slugify_ascii(text: str) -> str:
    slug = (
        text.lower()
        .strip()
        .replace(" ", "-")
        .replace("\t", "-")
    )
    slug = re.sub(r"[^a-z0-9-]", "", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")[:40]
    return slug if _is_slug_valid(slug) else ""


def _slugify_for_filename(text: str) -> str:
    s = text.strip()
    s = FILENAME_UNSAFE.sub("", s)
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"-+", "-", s).strip(".- ")[:40]
    return s if _is_slug_valid(s) else ""


def _short_hash() -> str:
    return secrets.token_hex(4)


def _extract_title_from_plan_body(plan_body: str) -> str:
    for line in plan_body.splitlines():
        line = line.strip()
        if not line:
            continue
        m = re.match(r"^#+\s*(.+)$", line)
        return (m.group(1).strip() if m else line)[:80]
    return ""


def _get_planner_runner(provider: str):
    if provider == "claude":
        return (check_claude, claude_run_plan)
    if provider == "codex":
        return (check_codex, codex_run_plan)
    return (None, None)


def run_plan(args: list[str], opts: dict | None = None) -> None:
    opts = opts or {}
    goal = " ".join(args).strip()
    if not goal:
        print("Usage: planforge plan <goal>", file=__import__("sys").stderr)
        raise SystemExit(1)
    cwd = str(Path.cwd())
    project_root = get_project_root(cwd)
    config = load_config(project_root)
    try:
        context = load_merged_context(
            cwd,
            context_dir=opts.get("context_dir") or config.get("contextDir"),
            inline_context=opts.get("context"),
        )
    except OSError as e:
        print("Failed to load context:", e, file=__import__("sys").stderr)
        raise SystemExit(1)
    provider = config["planner"]["provider"]
    check, run = _get_planner_runner(provider)
    if not check or not run:
        print(f"Unknown planner provider: {provider}. Check planforge.json.", file=__import__("sys").stderr)
        raise SystemExit(1)
    if not check():
        print(f"{provider} CLI not found. Install the provider CLI to use planforge plan.", file=__import__("sys").stderr)
        raise SystemExit(1)
    repo_context = get_repo_context(project_root, goal)
    project_context = get_project_context(project_root)
    run_opts = {
        "cwd": project_root,
        "context": context,
        "repoContext": repo_context,
        "projectContext": project_context,
    }
    try:
        plan_body = run(goal, run_opts)
    except Exception as e:
        print("Plan generation failed:", e, file=__import__("sys").stderr)
        raise SystemExit(1)
    ascii_slug = config.get("planner", {}).get("asciiSlug") or (
        __import__("os").environ.get("PLANFORGE_ASCII_SLUG") == "1"
    )
    slug = _slugify_ascii(goal) if ascii_slug else _slugify_for_filename(goal)
    if not _is_slug_valid(slug):
        slug = _slugify_ascii(goal) or _slugify_for_filename(goal)
    if not _is_slug_valid(slug):
        title = _extract_title_from_plan_body(plan_body)
        if title:
            slug = _slugify_ascii(title) if ascii_slug else _slugify_for_filename(title)
            if not _is_slug_valid(slug):
                slug = _slugify_ascii(title)
    if not _is_slug_valid(slug):
        slug = "plan"
    h = _short_hash()
    plans_dir = Path(get_plans_dir(project_root))
    plans_dir.mkdir(parents=True, exist_ok=True)
    file_path = plans_dir / f"{slug}-{h}.plan.md"
    file_path.write_text(plan_body, encoding="utf-8")
    print("Created:", file_path)
