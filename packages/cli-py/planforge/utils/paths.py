"""Path resolution for PlanForge (project root, .planforge plans/context dirs)."""

import os
from pathlib import Path


def get_project_root(cwd: str | None = None) -> str:
    cwd = cwd or os.getcwd()
    dir_path = Path(cwd).resolve()
    while True:
        if (dir_path / "planforge.json").exists() or (dir_path / ".planforge").exists():
            return str(dir_path)
        parent = dir_path.parent
        if parent == dir_path:
            break
        dir_path = parent
    return cwd


def get_cursor_dir(project_root: str) -> str:
    return str(Path(project_root) / ".cursor")


def get_plans_dir(project_root: str) -> str:
    return str(Path(project_root) / ".planforge" / "plans")


def get_context_dir(project_root: str) -> str:
    return str(Path(project_root) / ".planforge" / "context")


def get_templates_root() -> str:
    """Resolve repo templates dir (monorepo: packages/cli-py/planforge/utils -> repo/templates)."""
    # From planforge/utils/paths.py: utils -> planforge -> cli-py -> packages -> root
    base = Path(__file__).resolve().parent.parent.parent.parent.parent
    return str(base / "templates")
