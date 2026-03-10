"""Load planforge.json and resolve planner/implementer provider. Fallback from installed providers."""

import json
from pathlib import Path

from planforge.utils.paths import get_project_root
from planforge.providers.claude import check_claude
from planforge.providers.codex import check_codex


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
    if has_claude and has_codex:
        return {
            "planner": {"provider": "claude", "model": "claude-opus-4-6", "effort": "high"},
            "implementer": {"provider": "codex", "model": "gpt-5.4"},
            "plansDir": ".cursor/plans",
            "contextDir": ".cursor/context",
        }
    if has_claude:
        return {
            "planner": {"provider": "claude", "model": "claude-opus-4-6", "effort": "high"},
            "implementer": {"provider": "claude", "model": "claude-sonnet-4-6", "effort": "medium"},
            "plansDir": ".cursor/plans",
            "contextDir": ".cursor/context",
        }
    if has_codex:
        return {
            "planner": {"provider": "codex", "model": "gpt-5.4", "reasoning": "high"},
            "implementer": {"provider": "codex", "model": "gpt-5.4", "reasoning": "low"},
            "plansDir": ".cursor/plans",
            "contextDir": ".cursor/context",
        }
    return {
        "planner": {"provider": "claude", "model": "claude-opus-4-6"},
        "implementer": {"provider": "claude", "model": "claude-sonnet-4-6"},
        "plansDir": ".cursor/plans",
        "contextDir": ".cursor/context",
    }
