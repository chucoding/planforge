"""load_config: runtime only, reads planforge.json and merges with template (default-*.json) by installed providers.
get_default_config: reads templates for init, config suggest, and as merge base in load_config."""

import json
from pathlib import Path

from planforge.utils.paths import get_project_root, get_templates_root

# Default seconds by effort when streamTimeoutSec is not set (planner and implementer).
_PLANNER_EFFORT_DEFAULT_SEC = {"high": 300, "medium": 180, "low": 120}
_IMPLEMENTER_DEFAULT_SEC = 300


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


def get_default_doctor_ai_config(has_claude: bool, has_codex: bool) -> dict:
    """Default Doctor AI config (cheap models for workflow tests). Reads templates/doctor/default-*.json."""
    if has_claude and has_codex:
        filename = "default-both.json"
    elif has_claude:
        filename = "default-claude-only.json"
    elif has_codex:
        filename = "default-codex-only.json"
    else:
        filename = "default-claude-only.json"

    template_path = Path(get_templates_root()) / "doctor" / filename
    if not template_path.exists():
        raise FileNotFoundError(
            f"Missing doctor template: {template_path}. Run from repo root or ensure templates exist."
        )
    try:
        return json.loads(template_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        raise RuntimeError(
            f"Missing or invalid template: {template_path}. Run from repo root or ensure templates exist."
        ) from e



def resolve_planner_stream_timeout_sec(planner: dict) -> int:
    """Resolve planner stream timeout in seconds. 0 = no timeout."""
    if planner.get("streamTimeoutSec") is not None:
        return max(0, int(planner["streamTimeoutSec"]))
    effort = (planner.get("effort") or "").lower()
    return _PLANNER_EFFORT_DEFAULT_SEC.get(effort, 120)


def resolve_implementer_stream_timeout_sec(implementer: dict) -> int:
    """Resolve implementer stream timeout in seconds. 0 = no timeout."""
    if implementer.get("streamTimeoutSec") is not None:
        return max(0, int(implementer["streamTimeoutSec"]))
    effort = (implementer.get("effort") or "").lower()
    return _PLANNER_EFFORT_DEFAULT_SEC.get(effort, _IMPLEMENTER_DEFAULT_SEC)


def load_config(project_root: str | None = None) -> dict:
    """Load planforge.json for runtime commands (plan, implement, doctor). Merges with template (default-*.json) by installed providers. Raises if missing."""
    from planforge.providers.claude import check_claude
    from planforge.providers.codex import check_codex

    cwd = project_root or str(Path.cwd())
    root = get_project_root(cwd)
    config_path = Path(root) / "planforge.json"
    if not config_path.exists():
        raise FileNotFoundError("planforge.json not found. Run planforge init.")
    try:
        data = json.loads(config_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        raise RuntimeError("planforge.json is invalid.") from e
    merge_base = get_default_config(check_claude(), check_codex())
    planner = data.get("planner") or {}
    implementer = data.get("implementer") or {}
    return {
        "planner": {**merge_base["planner"], **planner, "provider": planner.get("provider", merge_base["planner"]["provider"])},
        "implementer": {**merge_base["implementer"], **implementer, "provider": implementer.get("provider", merge_base["implementer"]["provider"])},
    }
