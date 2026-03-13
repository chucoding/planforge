"""planforge model - interactive mode => provider => model selection with effort/reasoning."""

import json
import sys
from pathlib import Path

import readchar

from planforge.utils.paths import get_project_root, get_models_json_path
from planforge.providers.claude import check_claude
from planforge.providers.codex import check_codex


def _load_models_catalog() -> dict:
    path = Path(get_models_json_path())
    if not path.exists():
        raise FileNotFoundError(f"models.json not found at {path}. Check planforge-core package.")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _normalize_key(key: str) -> str | None:
    """Map readchar key or escape sequence to up/down/left/right/enter."""
    if key in ("\r", "\n"):
        return "enter"
    key_mod = getattr(readchar, "key", None)
    up = getattr(key_mod, "UP", None) if key_mod else None
    down = getattr(key_mod, "DOWN", None) if key_mod else None
    left = getattr(key_mod, "LEFT", None) if key_mod else None
    right = getattr(key_mod, "RIGHT", None) if key_mod else None
    if key in ("\x1b[A", "w", "k") or key == up:
        return "up"
    if key in ("\x1b[B", "s", "j") or key == down:
        return "down"
    if key in ("\x1b[D", "a", "h") or key == left:
        return "left"
    if key in ("\x1b[C", "d", "l") or key == right:
        return "right"
    if key == "\x03":  # Ctrl+C
        return "quit"
    return None


def _run_model_tui(catalog: dict, project_root: str, has_claude: bool, has_codex: bool) -> tuple[str, dict] | None:
    """Interactive TUI: mode => provider => model + effort/reasoning. Returns (mode, role_config) or None if quit."""
    modes = catalog.get("modes", ["planner", "implementer"])
    mode_providers = catalog.get("modeProviders", {})
    providers_data = catalog.get("providers", {})

    # Step 1: mode
    mode_index = 0
    print("\n  Mode: [Up/Down]  Enter to confirm\n")
    while True:
        for i, m in enumerate(modes):
            prefix = "  > " if i == mode_index else "    "
            print(f"{prefix} {m}")
        key = _normalize_key(readchar.readkey())
        if key == "quit":
            return None
        if key == "enter":
            break
        if key == "up":
            mode_index = (mode_index - 1) % len(modes)
        elif key == "down":
            mode_index = (mode_index + 1) % len(modes)
        if key in ("up", "down"):
            sys.stdout.write(f"\033[{len(modes)}A\033[0J")
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
            key = _normalize_key(readchar.readkey())
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

    # Step 3a: model selection (Up/Down, Enter to confirm)
    model_index = 0
    print("\n  [Up/Down] model  Enter to confirm\n")
    while True:
        for i, m in enumerate(models):
            prefix = "  > " if i == model_index else "    "
            print(f"{prefix}{m['label']} ({m['id']})")
        key = _normalize_key(readchar.readkey())
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

    # Step 3b: Effort (Claude) or Reasoning (Codex) selection (Up/Down, Enter to confirm)
    opts = effort_opts if is_claude else reasoning_opts
    label = "Effort" if is_claude else "Reasoning"
    opt_index = min(1, len(opts) - 1) if opts else 0
    print(f"\n  [Up/Down] {label}  Enter to confirm\n")
    while True:
        for i, val in enumerate(opts):
            prefix = "  > " if i == opt_index else "    "
            print(prefix + val)
        key = _normalize_key(readchar.readkey())
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
    if is_claude:
        result["effort"] = effort_opts[opt_index]
    else:
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

    if not sys.stdin.isatty():
        print("planforge model requires an interactive terminal.", file=sys.stderr)
        raise SystemExit(1)

    selected = _run_model_tui(catalog, project_root, has_claude, has_codex)
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
