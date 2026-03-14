"""planforge model - interactive mode => provider => model selection with effort/reasoning."""

import json
import sys
from pathlib import Path

from planforge.utils.paths import get_project_root, get_models_json_path
from planforge.utils.config import get_default_config
from planforge.utils.tui import print_current_ai_config, select_from_list
from planforge.providers.claude import check_claude
from planforge.providers.codex import check_codex


def _load_models_catalog() -> dict:
    path = Path(get_models_json_path())
    if not path.exists():
        raise FileNotFoundError(f"models.json not found at {path}. Check planforge-core package.")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _run_model_tui(
    catalog: dict,
    project_root: str,
    has_claude: bool,
    has_codex: bool,
    default_config: dict | None = None,
) -> tuple[str, dict] | None:
    """Interactive TUI: mode => provider => model + effort/reasoning. Returns (mode, role_config) or None if quit."""
    modes = catalog.get("modes", ["planner", "implementer"])
    mode_providers = catalog.get("modeProviders", {})
    providers_data = catalog.get("providers", {})

    mode = select_from_list([(m, m) for m in modes], "Mode: [Up/Down]  Enter to confirm")
    if mode is None:
        return None

    provider_ids = mode_providers.get(mode, list(providers_data.keys()))
    available = [p for p in provider_ids if (p == "claude" and has_claude) or (p == "codex" and has_codex)]
    if not available:
        print("No provider available for this mode. Install Claude or Codex CLI.", file=sys.stderr)
        return None

    if len(available) == 1:
        provider_id = available[0]
    else:
        provider_items = [
            (f"{providers_data.get(p, {}).get('name', p)} ({p})", p)
            for p in available
        ]
        provider_id = select_from_list(provider_items, "Provider: [Up/Down]  Enter to confirm")
        if provider_id is None:
            return None

    prov = providers_data.get(provider_id, {})
    models = prov.get("models", [])
    is_claude = provider_id == "claude"
    effort_opts = prov.get("effort", ["low", "medium", "high"])
    reasoning_opts = prov.get("reasoning", ["none", "low", "medium", "high"])
    if not models:
        print("No models defined for this provider.", file=sys.stderr)
        return None

    default_model_id = None
    if default_config and mode in default_config:
        role = default_config[mode]
        if isinstance(role, dict) and role.get("provider") == provider_id:
            default_model_id = role.get("model")

    model_items = []
    for m in models:
        mid = m.get("id", "")
        rec = "  (recommended)" if default_model_id and mid == default_model_id else ""
        label = m.get("label", mid)
        model_items.append((f"{label} ({mid}){rec}", mid))
    model_id = select_from_list(model_items, "[Up/Down] model  Enter to confirm")
    if model_id is None:
        return None

    selected_model = next((m for m in models if m.get("id") == model_id), {})
    claude_supports_effort = is_claude and selected_model.get("effort", True) is not False
    opts = (effort_opts if claude_supports_effort else []) if is_claude else reasoning_opts
    opt_label = "Effort" if is_claude else "Reasoning"

    selected_opt = None
    if opts:
        selected_opt = select_from_list(
            [(o, o) for o in opts],
            f"[Up/Down] {opt_label}  Enter to confirm",
            initial_index=min(1, len(opts) - 1),
        )
        if selected_opt is None:
            return None

    result = {
        "provider": provider_id,
        "model": model_id,
    }
    if is_claude and claude_supports_effort and selected_opt is not None:
        result["effort"] = selected_opt
    elif not is_claude and selected_opt is not None:
        result["reasoning"] = selected_opt
    return (mode, result)


def run_model(args: list[str]) -> None:
    """Run interactive model selection and write chosen config to planforge.json for the selected mode."""
    del args
    project_root = get_project_root()
    config_path = Path(project_root) / "planforge.json"

    try:
        catalog = _load_models_catalog()
    except FileNotFoundError as e:
        print(e, file=sys.stderr)
        raise SystemExit(1) from e

    has_claude = check_claude()
    has_codex = check_codex()
    default_config = None
    try:
        default_config = get_default_config(has_claude, has_codex)
    except (FileNotFoundError, OSError):
        pass

    if not sys.stdin.isatty():
        print("planforge model requires an interactive terminal.", file=sys.stderr)
        raise SystemExit(1)

    if config_path.exists():
        try:
            data = json.loads(config_path.read_text(encoding="utf-8"))
            print_current_ai_config(data)
        except (json.JSONDecodeError, OSError):
            pass

    selected = _run_model_tui(catalog, project_root, has_claude, has_codex, default_config)
    if selected is None:
        raise SystemExit(0)

    mode, role_config = selected

    if config_path.exists():
        try:
            data = json.loads(config_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            print(f"Could not read planforge.json: {e}", file=sys.stderr)
            raise SystemExit(1) from e
    else:
        data = {"planner": {"provider": "codex", "model": "gpt-5.4"}, "implementer": {"provider": "codex", "model": "gpt-5.4"}}

    data[mode] = role_config
    config_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    extra = f" (effort: {role_config['effort']})" if role_config.get("effort") else f" (reasoning: {role_config['reasoning']})" if role_config.get("reasoning") else ""
    print(f"\nUpdated planforge.json: {mode} -> {role_config.get('provider')} / {role_config.get('model')}{extra}")
    sys.exit(0)
