"""Load doctor AI test prompts from templates/doctor-ai/prompts.json (shared with cli-js)."""

import json
from pathlib import Path

from planforge.utils.paths import get_templates_root

_DEFAULT_PROMPTS = {
    "tc1PlanRequest": "Give me a plan for this project.",
    "tc2ImplementRequest": "Implement according to the plan.",
}


def get_doctor_ai_prompts() -> dict[str, str]:
    """Return tc1PlanRequest and tc2ImplementRequest from template JSON, or defaults."""
    path = Path(get_templates_root()) / "doctor-ai" / "prompts.json"
    try:
        if path.exists():
            data = json.loads(path.read_text(encoding="utf-8"))
            return {
                "tc1PlanRequest": data.get("tc1PlanRequest") or _DEFAULT_PROMPTS["tc1PlanRequest"],
                "tc2ImplementRequest": data.get("tc2ImplementRequest") or _DEFAULT_PROMPTS["tc2ImplementRequest"],
            }
    except (json.JSONDecodeError, OSError):
        pass
    return dict(_DEFAULT_PROMPTS)
