"""Copy PlanForge templates (skills, rules, config) into project."""

import shutil
from pathlib import Path

from planforge.utils.paths import get_templates_root


def install_templates(
    project_root: str,
    *,
    force: bool = False,
) -> None:
    templates_root = Path(get_templates_root())
    cursor_dir = Path(project_root) / ".cursor"
    cursor_dir.mkdir(parents=True, exist_ok=True)
    (cursor_dir / "context").mkdir(parents=True, exist_ok=True)

    cursor_templates = templates_root / "cursor"
    skills_src = cursor_templates / "skills"
    skills_dest = cursor_dir / "skills"
    skills_dest.mkdir(parents=True, exist_ok=True)

    for name in ("p", "i"):
        src = skills_src / name
        if src.exists():
            dest = skills_dest / name
            if dest.exists():
                shutil.rmtree(dest)
            shutil.copytree(src, dest)

    rules_src = cursor_templates / "rules"
    rules_dest = cursor_dir / "rules"
    if rules_src.exists():
        if rules_dest.exists():
            shutil.rmtree(rules_dest)
        shutil.copytree(rules_src, rules_dest)

    config_src = templates_root / "config" / "default-both.json"
    config_dest = Path(project_root) / "planforge.json"
    if config_src.exists() and (force or not config_dest.exists()):
        shutil.copy2(config_src, config_dest)
