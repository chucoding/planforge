"""planforge plan <goal> - generate dated .plan.md files via configured planner."""

import json
import re
import sys
from datetime import datetime
from pathlib import Path

from planforge.utils.paths import get_project_root, get_plans_dir, get_dated_plans_dir, get_date_parts
from planforge.utils.config import load_config, resolve_planner_stream_timeout_sec
from planforge.utils.context import load_merged_context
from planforge.utils.url_fetch import fetch_urls_context
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


def _extract_title_from_plan_body(plan_body: str) -> str:
    for line in plan_body.splitlines():
        line = line.strip()
        if not line:
            continue
        m = re.match(r"^#+\s*(.+)$", line)
        return (m.group(1).strip() if m else line)[:80]
    return ""


# Pattern for "Filename slug: <slug>" at end of plan. Slug: 1–3 segments, lowercase alphanumeric + hyphens, max 2 hyphens.
_FILENAME_SLUG_RE = re.compile(r"Filename slug:\s*([a-z0-9]+(?:-[a-z0-9]+){0,2})\s*$", re.IGNORECASE | re.MULTILINE)


def _parse_slug_from_plan_body(plan_body: str) -> str | None:
    """Parse slug from plan body if present and valid (ASCII, max 2 hyphens). Returns None if missing or invalid."""
    m = _FILENAME_SLUG_RE.search(plan_body)
    if not m:
        return None
    slug = m.group(1).strip().lower()
    if not slug or slug.count("-") > 2:
        return None
    if not re.match(r"^[a-z0-9-]+$", slug):
        return None
    return slug if _is_slug_valid(slug) else None


def _strip_filename_slug_line(plan_body: str) -> str:
    """Remove the 'Filename slug: ...' line from plan body so it is not shown in the saved file."""
    lines = [line for line in plan_body.splitlines() if not re.match(r"^\s*Filename slug:\s*.+$", line, re.IGNORECASE)]
    return "\n".join(lines).rstrip()


def _limit_slug_hyphens(slug: str) -> str:
    """Limit slug to at most 2 hyphens by taking first 3 segments."""
    parts = slug.split("-")
    return slug if len(parts) <= 3 else "-".join(parts[:3])


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
            project_root,
            context_dir=opts.get("context_dir"),
            inline_context=opts.get("context"),
        )
    except OSError as e:
        print("Failed to load context:", e, file=__import__("sys").stderr)
        raise SystemExit(1)
    url_context = fetch_urls_context(goal)
    if url_context:
        context = url_context + "\n\n" + (context or "")
    provider = config["planner"]["provider"]
    check, run = _get_planner_runner(provider)
    if not check or not run:
        print(f"Unknown planner provider: {provider}. Check planforge.json.", file=__import__("sys").stderr)
        raise SystemExit(1)
    if not check():
        print(f"{provider} CLI not found. Install the provider CLI to use planforge plan.", file=__import__("sys").stderr)
        raise SystemExit(1)
    repo_context = get_repo_context(project_root, goal)
    project_context, project_context_source = get_project_context(project_root, provider)
    stream_timeout_sec = resolve_planner_stream_timeout_sec(config["planner"])
    run_opts = {
        "cwd": project_root,
        "context": context,
        "repoContext": repo_context,
        "projectContext": project_context,
        "projectContextSource": project_context_source,
        "streamTimeoutSec": stream_timeout_sec,
    }
    if sys.stdout.isatty():
        print("Loading...", flush=True)
    try:
        plan_body = run(goal, run_opts)
    except Exception as e:
        print("Plan generation failed:", e, file=__import__("sys").stderr)
        raise SystemExit(1)
    body_to_write = _strip_filename_slug_line(plan_body)
    if opts.get("slug", "").strip():
        raw = re.sub(r"[^a-z0-9-]", "", opts["slug"].strip().lower())
        raw = re.sub(r"-+", "-", raw).strip("-")
        slug = _limit_slug_hyphens(raw) if _is_slug_valid(raw) else "plan"
    else:
        slug = _parse_slug_from_plan_body(plan_body)
        if not slug:
            slug = _slugify_ascii(goal)
            if not _is_slug_valid(slug):
                title = _extract_title_from_plan_body(plan_body)
                if title:
                    slug = _slugify_ascii(title)
            if not _is_slug_valid(slug):
                slug = "plan"
            slug = _limit_slug_hyphens(slug)
    now = datetime.now()
    plans_dir = Path(get_plans_dir(project_root))
    dated_plans_dir = Path(get_dated_plans_dir(project_root, now))
    dated_plans_dir.mkdir(parents=True, exist_ok=True)
    _, _, hhmm = get_date_parts(now)
    file_path = dated_plans_dir / f"{hhmm}-{slug}.plan.md"
    file_path.write_text(body_to_write, encoding="utf-8")
    (plans_dir / "index.json").write_text(
        json.dumps({"activePlan": file_path.relative_to(plans_dir).as_posix()}, indent=2),
        encoding="utf-8",
    )
    print("Created:", file_path)
