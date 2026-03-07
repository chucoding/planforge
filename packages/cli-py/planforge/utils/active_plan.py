"""Resolve which plan file to use for implement: index.json activePlan or latest .plan.md by mtime."""

import json
from pathlib import Path

from planforge.utils.paths import get_plans_dir

INDEX_JSON = "index.json"


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
                candidate = pdir / name
                if candidate.exists():
                    return str(candidate)
                if not name.endswith(".plan.md"):
                    candidate = pdir / f"{name}.plan.md"
                if candidate.exists():
                    return str(candidate)
        except (json.JSONDecodeError, OSError):
            pass
    latest_path = None
    latest_mtime = 0.0
    for entry in pdir.iterdir():
        if not entry.is_file() or not entry.name.endswith(".plan.md"):
            continue
        mtime = entry.stat().st_mtime
        if mtime > latest_mtime:
            latest_mtime = mtime
            latest_path = str(entry)
    return latest_path
