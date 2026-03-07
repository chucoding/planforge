"""Path resolution for PlanForge (project root, .cursor, plans dir)."""

import os
from pathlib import Path


def get_project_root(cwd: str | None = None) -> str:
    cwd = cwd or os.getcwd()
    # TODO: walk up for planforge.json or .cursor
    return cwd


def get_cursor_dir(project_root: str) -> str:
    return str(Path(project_root) / ".cursor")


def get_plans_dir(project_root: str) -> str:
    return str(Path(project_root) / ".cursor" / "plans")
