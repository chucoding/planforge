"""planforge install - install Cursor slash commands and templates."""

from planforge.utils.paths import get_project_root
from planforge.templates.install import install_templates


def run_install(args: list[str]) -> None:
    force = "--force" in args or "-f" in args
    project_root = get_project_root()

    try:
        install_templates(project_root, force=force)
        print("PlanForge templates installed to .cursor/skills and .cursor/rules.")
    except Exception as e:
        print("Install failed:", e)
        raise SystemExit(1)
