"""Resolve which plan file to use for implement: index.json activePlan or latest .plan.md by mtime."""

import json
from pathlib import Path

from planforge.utils.paths import get_plans_dir

INDEX_JSON = "index.json"


def _collect_plan_files(plans_dir: Path) -> list[Path]:
    return [path for path in plans_dir.rglob("*.plan.md") if path.is_file()]


def _resolve_active_plan_candidate(plans_dir: Path, name: str) -> Path | None:
    normalized = Path(name.replace("\\", "/"))
    candidate_with_ext = (
        normalized if normalized.as_posix().endswith(".plan.md") else Path(f"{normalized.as_posix()}.plan.md")
    )
    candidates = [plans_dir / normalized, plans_dir / candidate_with_ext]
    for candidate in candidates:
        if candidate.exists():
            return candidate

    target_names = {candidate.name for candidate in candidates}
    for path in _collect_plan_files(plans_dir):
        if path.name in target_names:
            return path
    return None


def get_active_plan_path(project_root: str) -> str | None:
    plans_dir = get_plans_dir(project_root)
    pdir = Path(plans_dir)
    if not pdir.exists():
        return None
    index_file = pdir / INDEX_JSON
    if index_file.exists():
        try:
            data = json.loads(index_file.read_text(encoding="utf-8"))
            name = (data.get("activePlan") or "").strip()
            if name:
                candidate = _resolve_active_plan_candidate(pdir, name)
                if candidate:
                    return str(candidate)
        except (json.JSONDecodeError, OSError):
            pass
    latest_path = None
    latest_mtime = 0.0
    for entry in _collect_plan_files(pdir):
        mtime = entry.stat().st_mtime
        if mtime > latest_mtime:
            latest_mtime = mtime
            latest_path = str(entry)
    return latest_path
