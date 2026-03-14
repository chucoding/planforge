"""planforge model - interactive mode => provider => model selection with effort/reasoning."""

import json
import sys
from pathlib import Path

from planforge.utils.paths import get_project_root, get_models_json_path
from planforge.utils.config import get_default_config
from planforge.utils.tui import wait_key, print_current_ai_config
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

    # Step 1: mode (with Quit option)
    mode_options = list(modes) + ["Quit"]
    mode_index = 0
    print("\n  Mode: [Up/Down]  Enter to confirm\n")
    while True:
        for i, m in enumerate(mode_options):
            prefix = "  > " if i == mode_index else "    "
            print(f"{prefix} {m}")
        key = wait_key()
        if key == "quit":
            return None
        if key == "enter":
            if mode_index == len(mode_options) - 1:
                return None  # Quit
            break
        if key == "up":
            mode_index = (mode_index - 1) % len(mode_options)
        elif key == "down":
            mode_index = (mode_index + 1) % len(mode_options)
        if key in ("up", "down"):
            sys.stdout.write(f"\033[{len(mode_options)}A\033[0J")
            sys.stdout.flush()
    mode = modes[mode_index]
    provider_ids = mode_providers.get(mode, list(providers_data.keys()))
    available = [p for p in provider_ids if (p == "claude" and has_claude) or (p == "codex" and has_codex)]
    if not available:
        print("No provider available for this mode. Install Claude or Codex CLI.", file=sys.stderr)
        return None

    # Step 2: provider (skip if single)
    if len(available) == 1:
        provider_id = available[0]
    else:
        prov_index = 0
        print("\n  Provider: [Up/Down]  Enter to confirm\n")
        while True:
            for i, p in enumerate(available):
                name = providers_data.get(p, {}).get("name", p)
                prefix = "  > " if i == prov_index else "    "
                print(f"{prefix} {name} ({p})")
            key = wait_key()
            if key == "quit":
                return None
            if key == "enter":
                break
            if key == "up":
                prov_index = (prov_index - 1) % len(available)
            elif key == "down":
                prov_index = (prov_index + 1) % len(available)
            if key in ("up", "down"):
                sys.stdout.write(f"\033[{len(available)}A\033[0J")
                sys.stdout.flush()
        provider_id = available[prov_index]

    prov = providers_data.get(provider_id, {})
    models = prov.get("models", [])
    is_claude = provider_id == "claude"
    effort_opts = prov.get("effort", ["low", "medium", "high"])
    reasoning_opts = prov.get("reasoning", ["none", "low", "medium", "high"])
    if not models:
        print("No models defined for this provider.", file=sys.stderr)
        return None

    # Step 3a: model selection (Up/Down, Enter to confirm). Recommended = default config for this mode (config/default-*.json).
    default_model_id = None
    if default_config and mode in default_config:
        role = default_config[mode]
        if isinstance(role, dict) and role.get("provider") == provider_id:
            default_model_id = role.get("model")
    model_index = 0
    print("\n  [Up/Down] model  Enter to confirm\n")
    while True:
        for i, m in enumerate(models):
            prefix = "  > " if i == model_index else "    "
            mid = m.get("id", "")
            rec = "  (recommended)" if default_model_id and mid == default_model_id else ""
            print(f"{prefix}{m['label']} ({mid}){rec}")
        key = wait_key()
        if key == "quit":
            return None
        if key == "enter":
            break
        if key == "up":
            model_index = (model_index - 1) % len(models)
        elif key == "down":
            model_index = (model_index + 1) % len(models)
        if key in ("up", "down"):
            sys.stdout.write(f"\033[{len(models)}A\033[0J")
            sys.stdout.flush()

    # Step 3b: Effort (Claude, only if model supports it) or Reasoning (Codex) selection
    selected_model = models[model_index]
    claude_supports_effort = is_claude and selected_model.get("effort", True) is not False
    opts = (effort_opts if claude_supports_effort else []) if is_claude else reasoning_opts
    label = "Effort" if is_claude else "Reasoning"
    opt_index = min(1, len(opts) - 1) if opts else 0
    if opts:
        print(f"\n  [Up/Down] {label}  Enter to confirm\n")
        while True:
            for i, val in enumerate(opts):
                prefix = "  > " if i == opt_index else "    "
                print(prefix + val)
            key = wait_key()
            if key == "quit":
                return None
            if key == "enter":
                break
            if key == "up":
                opt_index = (opt_index - 1) % len(opts)
            elif key == "down":
                opt_index = (opt_index + 1) % len(opts)
            if key in ("up", "down"):
                sys.stdout.write(f"\033[{len(opts)}A\033[0J")
                sys.stdout.flush()

    model_id = models[model_index]["id"]
    result = {
        "provider": provider_id,
        "model": model_id,
    }
    if is_claude and claude_supports_effort:
        result["effort"] = effort_opts[opt_index]
    elif not is_claude:
        result["reasoning"] = reasoning_opts[opt_index]
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
