"""Load planforge.json and resolve planner/implementer provider. Default config from templates; missing template raises."""

import json
from pathlib import Path

from planforge.utils.paths import get_project_root, get_templates_root
from planforge.providers.claude import check_claude
from planforge.providers.codex import check_codex


def get_default_config(has_claude: bool, has_codex: bool) -> dict:
    """Default config when planforge.json is missing. Reads from templates/config/default-*.json. Raises if missing or invalid."""
    if has_claude and has_codex:
        filename = "default-both.json"
    elif has_claude:
        filename = "default-claude-only.json"
    elif has_codex:
        filename = "default-codex-only.json"
    else:
        filename = "default-claude-only.json"

    template_path = Path(get_templates_root()) / "config" / filename
    if not template_path.exists():
        raise FileNotFoundError(
            f"Missing or invalid template: {template_path}. Run from repo root or ensure templates exist."
        )
    try:
        return json.loads(template_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        raise RuntimeError(
            f"Missing or invalid template: {template_path}. Run from repo root or ensure templates exist."
        ) from e


def load_config(project_root: str | None = None) -> dict:
    cwd = project_root or str(Path.cwd())
    root = get_project_root(cwd)
    config_path = Path(root) / "planforge.json"
    if config_path.exists():
        try:
            data = json.loads(config_path.read_text(encoding="utf-8"))
            planner = data.get("planner") or {}
            implementer = data.get("implementer") or {}
            return {
                "planner": {"provider": planner.get("provider", "claude"), **planner},
                "implementer": {"provider": implementer.get("provider", "codex"), **implementer},
                "plansDir": data.get("plansDir", ".cursor/plans"),
                "contextDir": data.get("contextDir", ".cursor/context"),
            }
        except (json.JSONDecodeError, OSError):
            pass
    has_claude = check_claude()
    has_codex = check_codex()
    return get_default_config(has_claude, has_codex)
