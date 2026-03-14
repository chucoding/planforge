"""Path resolution for PlanForge (project root, .cursor/plans, .cursor/contexts)."""

import os
from datetime import datetime
from pathlib import Path


def get_project_root(cwd: str | None = None) -> str:
    cwd = cwd or os.getcwd()
    dir_path = Path(cwd).resolve()
    while True:
        if (
            (dir_path / "planforge.json").exists()
            or (dir_path / ".cursor" / "plans").exists()
            or (dir_path / ".cursor" / "contexts").exists()
        ):
            return str(dir_path)
        parent = dir_path.parent
        if parent == dir_path:
            break
        dir_path = parent
    return cwd


def get_cursor_dir(project_root: str) -> str:
    return str(Path(project_root) / ".cursor")


def get_plans_dir(project_root: str) -> str:
    return str(Path(project_root) / ".cursor" / "plans")


def get_contexts_dir(project_root: str) -> str:
    return str(Path(project_root) / ".cursor" / "contexts")


def get_context_dir(project_root: str) -> str:
    return get_contexts_dir(project_root)


def get_default_context_dirs(project_root: str) -> list[str]:
    return [get_contexts_dir(project_root)]


def get_date_parts(date: datetime | None = None) -> tuple[str, str, str]:
    """Return (yyyy_mm_dd, mmdd, hhmm)."""
    now = date or datetime.now()
    return now.strftime("%Y-%m-%d"), now.strftime("%m%d"), now.strftime("%H%M")


def get_dated_plans_dir(project_root: str, date: datetime | None = None) -> str:
    yyyy_mm_dd, _, _ = get_date_parts(date)
    return str(Path(get_plans_dir(project_root)) / yyyy_mm_dd)


def get_templates_root() -> str:
    """Resolve repo templates dir (monorepo: packages/cli-py/planforge/utils -> repo/templates)."""
    base = Path(__file__).resolve().parent.parent.parent.parent.parent
    return str(base / "templates")


def get_prompts_dir() -> str:
    """Resolve prompts directory from installed planforge_core package."""
    import planforge_core
    return str(Path(planforge_core.__file__).resolve().parent.parent / "prompts")


def get_models_json_path() -> str:
    """Resolve models.json path from installed planforge_core package."""
    import planforge_core
    return str(Path(planforge_core.__file__).resolve().parent.parent / "models.json")
