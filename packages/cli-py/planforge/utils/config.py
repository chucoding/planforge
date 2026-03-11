"""load_config: runtime only, reads planforge.json; raises if missing. get_default_config: init/config suggest only, reads templates."""

import json
from pathlib import Path

from planforge.utils.paths import get_project_root, get_templates_root


# Inline defaults used only when merging partial planforge.json (file exists).
_MERGE_DEFAULTS = {
    "planner": {"provider": "claude", "model": "claude-opus-4-6"},
    "implementer": {"provider": "codex", "model": "gpt-5.4"},
    "plansDir": ".cursor/plans",
    "contextDir": ".cursor/context",
}


def get_default_config(has_claude: bool, has_codex: bool) -> dict:
    """Used only by init and config suggest. Reads templates/config/default-*.json. Raises if missing or invalid."""
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
    """Load planforge.json for runtime commands (plan, implement, doctor). No template fallback. Raises if missing."""
    cwd = project_root or str(Path.cwd())
    root = get_project_root(cwd)
    config_path = Path(root) / "planforge.json"
    if not config_path.exists():
        raise FileNotFoundError("planforge.json not found. Run planforge init.")
    try:
        data = json.loads(config_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        raise RuntimeError("planforge.json is invalid.") from e
    planner = data.get("planner") or {}
    implementer = data.get("implementer") or {}
    return {
        "planner": {**_MERGE_DEFAULTS["planner"], **planner, "provider": planner.get("provider", _MERGE_DEFAULTS["planner"]["provider"])},
        "implementer": {**_MERGE_DEFAULTS["implementer"], **implementer, "provider": implementer.get("provider", _MERGE_DEFAULTS["implementer"]["provider"])},
        "plansDir": data.get("plansDir", _MERGE_DEFAULTS["plansDir"]),
        "contextDir": data.get("contextDir", _MERGE_DEFAULTS["contextDir"]),
    }
