"""Load planforge.json and resolve planner/implementer provider. Fallback to default config when file is missing."""

import json
from pathlib import Path

from planforge.utils.paths import get_project_root, get_templates_root
from planforge.providers.claude import check_claude
from planforge.providers.codex import check_codex

# Fallback when template JSON is missing (e.g. installed package without templates).
_DEFAULT_CONFIGS = {
    "both": {
        "planner": {"provider": "claude", "model": "claude-opus-4-6", "effort": "high"},
        "implementer": {"provider": "codex", "model": "gpt-5.4"},
        "plansDir": ".cursor/plans",
        "contextDir": ".cursor/context",
    },
    "claude_only": {
        "planner": {"provider": "claude", "model": "claude-opus-4-6", "effort": "high"},
        "implementer": {"provider": "claude", "model": "claude-sonnet-4-6", "effort": "medium"},
        "plansDir": ".cursor/plans",
        "contextDir": ".cursor/context",
    },
    "codex_only": {
        "planner": {"provider": "codex", "model": "gpt-5.4", "reasoning": "high"},
        "implementer": {"provider": "codex", "model": "gpt-5.4", "reasoning": "low"},
        "plansDir": ".cursor/plans",
        "contextDir": ".cursor/context",
    },
}


def get_default_config(has_claude: bool, has_codex: bool) -> dict:
    """Default config when planforge.json is missing. Reads from templates/config/default-*.json when present."""
    if has_claude and has_codex:
        key, filename = "both", "default-both.json"
    elif has_claude:
        key, filename = "claude_only", "default-claude-only.json"
    elif has_codex:
        key, filename = "codex_only", "default-codex-only.json"
    else:
        key, filename = "claude_only", "default-claude-only.json"

    template_path = Path(get_templates_root()) / "config" / filename
    try:
        if template_path.exists():
            return json.loads(template_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        pass
    return _DEFAULT_CONFIGS[key]


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
