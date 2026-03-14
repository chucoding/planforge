"""planforge doctor - check environment and providers."""

import json
import sys
from pathlib import Path

from planforge.utils.paths import (
    get_project_root,
    get_plans_dir,
    get_context_dir,
    get_legacy_context_dir,
    get_templates_root,
)
from planforge.utils.config import load_config
from planforge.providers.claude import check_claude, complete_one_turn as claude_complete_one_turn
from planforge.providers.codex import check_codex, complete_one_turn as codex_complete_one_turn
from planforge.utils.tui import wait_key
from planforge.commands.model import _load_models_catalog

DOCTOR_MODE_STATIC = "static"
DOCTOR_MODE_AI = "ai"


def run_doctor_mode_select() -> None:
    """When doctor is run without subcommand: TTY shows mode selection (static/ai) with descriptions; non-TTY runs static."""
    if not sys.stdin.isatty():
        run_doctor([])
        return
    modes = [
        ("static", "Check environment and providers"),
        ("ai", "Run workflow tests with AI"),
    ]
    total_rows = len(modes) + 1
    index = 0
    print("\n  Mode  [Up/Down]  Enter to confirm\n")
    while True:
        for i, (label, desc) in enumerate(modes):
            prefix = "  > " if i == index else "    "
            print(f"{prefix}{label}  –  {desc}")
        prefix = "  > " if index == len(modes) else "    "
        print(f"{prefix}Quit")
        key = wait_key()
        if key == "quit":
            sys.exit(0)
        if key == "enter":
            if index == len(modes):
                sys.exit(0)
            chosen = modes[index][0]
            if chosen == DOCTOR_MODE_STATIC:
                run_doctor([])
                return
            if chosen == DOCTOR_MODE_AI:
                run_doctor_ai([])
                return
            return
        if key == "up":
            index = (index - 1) % total_rows
        elif key == "down":
            index = (index + 1) % total_rows
        sys.stdout.write("\033[%dA\033[0J" % total_rows)
        sys.stdout.flush()


def _status_symbol(status: str) -> str:
    if status == "ok":
        return "[OK]"
    if status == "warn":
        return "[WARN]"
    return "[ERROR]"


def _is_date_dir_name(name: str) -> bool:
    return len(name) == 10 and name[4] == "-" and name[7] == "-" and name.replace("-", "").isdigit()


def _is_dated_plan_file_name(name: str) -> bool:
    return name.endswith(".plan.md") and len(name) >= len("0000-x.plan.md") and name[:4].isdigit() and name[4] == "-"


def run_doctor(args: list[str]) -> None:
    del args
    project_root = get_project_root()
    plans_dir = get_plans_dir(project_root)

    config_path = Path(project_root) / "planforge.json"
    has_config_file = config_path.exists()
    config_load_error: str | None = None
    if has_config_file:
        try:
            data = json.loads(config_path.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                raise ValueError("top-level JSON must be an object")
        except (ValueError, json.JSONDecodeError, OSError) as e:
            config_load_error = str(e)

    has_claude = check_claude()
    has_codex = check_codex()

    checks: list[tuple[str, str, str]] = []
    checks.append((
        "Claude CLI",
        "ok" if has_claude else "warn",
        "available" if has_claude else "not found (planning /p will be limited)",
    ))
    checks.append((
        "Codex CLI",
        "ok" if has_codex else "warn",
        "available" if has_codex else "not found (implementation /i will be limited)",
    ))

    if not has_config_file:
        checks.append((
            "planforge.json",
            "error",
            "missing (run planforge init)",
        ))
    elif config_load_error:
        checks.append((
            "planforge.json",
            "error",
            f"invalid or unreadable ({config_load_error})",
        ))
    else:
        checks.append((
            "planforge.json",
            "ok",
            "exists",
        ))

    has_plans_dir = Path(plans_dir).exists()
    checks.append((
        ".planforge/plans",
        "ok" if has_plans_dir else "error",
        "exists" if has_plans_dir else "missing (run planforge init)",
    ))

    context_dir_path = Path(get_context_dir(project_root))
    has_context_dir = context_dir_path.exists()
    checks.append((
        ".planforge/contexts",
        "ok" if has_context_dir else "warn",
        "exists" if has_context_dir else "missing (run planforge init)",
    ))

    # TODO: 06-13에 제거 (레거시 경로/플랫 플랜 경고 블록)
    legacy_context_dir = Path(get_legacy_context_dir(project_root))
    if legacy_context_dir.exists():
        checks.append((
            ".planforge/context",
            "warn",
            "legacy path detected (migrate to .planforge/contexts)",
        ))

    # TODO: 06-13에 제거 (위 레거시 블록과 함께)
    if has_plans_dir:
        plan_root = Path(plans_dir)
        root_entries = list(plan_root.iterdir())
        has_legacy_flat_plans = any(entry.is_file() and entry.name.endswith(".plan.md") for entry in root_entries)
        if has_legacy_flat_plans:
            checks.append((
                "plans layout",
                "warn",
                "legacy flat plan files detected (use YYYY-MM-DD/MMDD-... .plan.md)",
            ))

        invalid_plan_dirs = [entry.name for entry in root_entries if entry.is_dir() and not _is_date_dir_name(entry.name)]
        if invalid_plan_dirs:
            checks.append((
                "plans layout",
                "warn",
                "unexpected plan subdirs: " + ", ".join(invalid_plan_dirs),
            ))

        for entry in root_entries:
            if not entry.is_dir() or not _is_date_dir_name(entry.name):
                continue
            invalid_files = [
                item.name
                for item in entry.iterdir()
                if item.is_file() and item.name.endswith(".plan.md") and not _is_dated_plan_file_name(item.name)
            ]
            if invalid_files:
                checks.append((
                    f"plans/{entry.name}",
                    "warn",
                    "unexpected filenames: " + ", ".join(invalid_files),
                ))

    print("\nPlanForge doctor")
    print("  ------------------------------\n")
    max_name = max(len(name) for name, _, _ in checks)
    for name, status, message in checks:
        print(f"  {_status_symbol(status)}  {name.ljust(max_name)}  {message}")

    print("")
    if not has_claude or not has_codex:
        print("  Run planforge init to install missing providers.")
    print("")

    if any(status == "error" for _, status, _ in checks):
        raise SystemExit(1)


def _load_workflow_mdc(project_root: str) -> str:
    installed = Path(project_root) / ".cursor" / "rules" / "workflow.mdc"
    if installed.exists():
        return installed.read_text(encoding="utf-8")
    templates_path = Path(get_templates_root()) / "cursor" / "rules" / "workflow.mdc"
    if templates_path.exists():
        return templates_path.read_text(encoding="utf-8")
    raise FileNotFoundError(
        f"Missing or invalid template: {templates_path}. Run from repo root or ensure templates exist."
    )


def _build_model_list_from_config(config: dict, has_claude: bool, has_codex: bool) -> list[tuple[str, str, bool]]:
    seen: set[str] = set()
    options: list[tuple[str, str, bool]] = []
    planner = config.get("planner") or {}
    implementer = config.get("implementer") or {}
    rec_key = f"{planner.get('provider', '')}|{planner.get('model', '')}"
    for role in (planner, implementer):
        prov = role.get("provider", "")
        model = role.get("model", "")
        key = f"{prov}|{model}"
        if key in seen:
            continue
        seen.add(key)
        if prov == "claude" and not has_claude:
            continue
        if prov == "codex" and not has_codex:
            continue
        options.append((prov, model, key == rec_key))
    return options


def _build_options_from_catalog(
    catalog: dict, has_claude: bool, has_codex: bool
) -> list[tuple[str, str, bool]]:
    """Build flat (provider, model, recommended) from models.json catalog for available providers."""
    options: list[tuple[str, str, bool]] = []
    seen: set[str] = set()
    for provider_id, prov_data in catalog.get("providers", {}).items():
        if provider_id == "claude" and not has_claude:
            continue
        if provider_id == "codex" and not has_codex:
            continue
        models = prov_data.get("models", []) if isinstance(prov_data, dict) else []
        for m in models:
            model_id = m.get("id", "") if isinstance(m, dict) else ""
            key = f"{provider_id}|{model_id}"
            if key in seen:
                continue
            seen.add(key)
            options.append((provider_id, model_id, False))
    return options


def _select_provider_and_model(
    catalog: dict,
    has_claude: bool,
    has_codex: bool,
    role_label: str,
    exit_code: int,
) -> tuple[str, str] | None:
    """Interactive: select provider then model (last model = recommended). Returns (provider, model) or None if Quit."""
    providers_data = catalog.get("providers", {})
    provider_ids = [
        p for p in providers_data
        if (p == "claude" and has_claude) or (p == "codex" and has_codex)
    ]
    if not provider_ids:
        return None

    while True:
        prov_names = [providers_data.get(p, {}).get("name", p) if isinstance(providers_data.get(p), dict) else p for p in provider_ids]
        total_prov = len(prov_names) + 1
        pi = 0
        print(f"\n  Select {role_label}  [Up/Down]  Enter to confirm\n")
        while True:
            for i, name in enumerate(prov_names):
                prefix = "  > " if i == pi else "    "
                print(f"{prefix}{name} ({provider_ids[i]})")
            prefix = "  > " if pi == len(prov_names) else "    "
            print(f"{prefix}Quit")
            key = wait_key()
            if key == "quit":
                raise SystemExit(exit_code)
            if key == "enter":
                if pi == len(prov_names):
                    return None
                break
            if key == "up":
                pi = (pi - 1) % total_prov
            elif key == "down":
                pi = (pi + 1) % total_prov
            sys.stdout.write("\033[%dA\033[0J" % total_prov)
            sys.stdout.flush()
        provider_id = provider_ids[pi]
        prov = providers_data.get(provider_id) or {}
        models = prov.get("models", []) if isinstance(prov, dict) else []
        if not models:
            continue
        total_mod = len(models) + 1
        mi = 0
        print("\n  [Up/Down] model  Enter to confirm  (last = recommended)\n")
        while True:
            for i, m in enumerate(models):
                rec = "  (recommended)" if i == len(models) - 1 else ""
                prefix = "  > " if i == mi else "    "
                mid = m.get("id", "") if isinstance(m, dict) else ""
                label = m.get("label", mid) if isinstance(m, dict) else mid
                print(f"{prefix}{label} ({mid}){rec}")
            prefix = "  > " if mi == len(models) else "    "
            print(f"{prefix}Quit")
            key = wait_key()
            if key == "quit":
                raise SystemExit(exit_code)
            if key == "enter":
                if mi == len(models):
                    break
                model_id = models[mi].get("id", "") if isinstance(models[mi], dict) else ""
                return (provider_id, model_id)
            if key == "up":
                mi = (mi - 1) % total_mod
            elif key == "down":
                mi = (mi + 1) % total_mod
            sys.stdout.write("\033[%dA\033[0J" % total_mod)
            sys.stdout.flush()


def run_doctor_ai(args: list[str]) -> None:
    project_root = get_project_root()
    has_claude = check_claude()
    has_codex = check_codex()
    try:
        config = load_config(project_root)
    except Exception as e:
        print("Failed to load planforge.json:", e, file=sys.stderr)
        raise SystemExit(1) from e

    catalog = None
    try:
        catalog = _load_models_catalog()
    except FileNotFoundError:
        catalog = None

    if catalog is not None:
        options = _build_options_from_catalog(catalog, has_claude, has_codex)
    else:
        options = _build_model_list_from_config(config, has_claude, has_codex)

    if not options:
        print("No AI provider available. Install Claude or Codex CLI and run planforge init.", file=sys.stderr)
        raise SystemExit(1)

    # recommended = current planforge.json planner (plan assumption)
    planner_key = f"{config.planner.get('provider', '')}|{config.planner.get('model', '')}"
    options = [(p, m, (p + "|" + m) == planner_key) for (p, m, _) in options]

    provider_arg = None
    model_arg = None
    for i, a in enumerate(args):
        if a == "--provider" and i + 1 < len(args):
            provider_arg = args[i + 1]
        if a == "--model" and i + 1 < len(args):
            model_arg = args[i + 1]

    prompts_path = Path(get_templates_root()) / "doctor-ai" / "prompts.json"
    if not prompts_path.exists():
        raise FileNotFoundError(
            f"Missing or invalid template: {prompts_path}. Run from repo root or ensure templates exist."
        )
    try:
        prompts_data = json.loads(prompts_path.read_text(encoding="utf-8"))
        tc1_msg = prompts_data.get("tc1PlanRequest")
        tc2_msg = prompts_data.get("tc2ImplementRequest")
        tc3_msg = prompts_data.get("tc3SlashPWithImplementationStyleContent")
        if not isinstance(tc1_msg, str) or not isinstance(tc2_msg, str) or not isinstance(tc3_msg, str):
            raise RuntimeError("invalid prompts.json")
    except (RuntimeError, json.JSONDecodeError, OSError) as e:
        raise RuntimeError(
            f"Missing or invalid template: {prompts_path}. Run from repo root or ensure templates exist."
        ) from e

    workflow_content = _load_workflow_mdc(project_root)
    system_prompt = (
        workflow_content
        + "\n\nAnswer in one sentence only: what command or action you will take for the user request. Do not run anything."
    )

    is_interactive = sys.stdin.isatty() and not (provider_arg and model_arg)
    use_planner_implementer_selection = is_interactive and catalog is not None
    exit_code = 0
    while True:
        if provider_arg and model_arg:
            match = next((o for o in options if o[0] == provider_arg and o[1] == model_arg), None)
            if not match:
                print(f"No matching option for --provider {provider_arg} --model {model_arg}", file=sys.stderr)
                raise SystemExit(1)
            selected_planner = selected_implementer = (match[0], match[1])
        elif use_planner_implementer_selection:
            pl = config.planner
            impl = config.implementer
            pl_extra = f"effort: {pl['effort']}" if pl.get("effort") else (f"reasoning: {pl['reasoning']}" if pl.get("reasoning") else None)
            impl_extra = f"effort: {impl['effort']}" if impl.get("effort") else (f"reasoning: {impl['reasoning']}" if impl.get("reasoning") else None)
            print("\n  Current AI config")
            print("  -----------------")
            print(f"  {'planner'.ljust(12)}: {pl.get('provider', '').ljust(6)} / {pl.get('model', '').ljust(20)}{' (' + pl_extra + ')' if pl_extra else ''}")
            print(f"  {'implementer'.ljust(12)}: {impl.get('provider', '').ljust(6)} / {impl.get('model', '').ljust(20)}{' (' + impl_extra + ')' if impl_extra else ''}")

            modes = ["planner", "implementer"]
            total_mode = len(modes) + 1
            mode_index = 0
            print("\n  Mode  [Up/Down]  Enter to confirm\n")
            while True:
                for i, m in enumerate(modes):
                    prefix = "  > " if i == mode_index else "    "
                    print(f"{prefix}{m}")
                prefix = "  > " if mode_index == len(modes) else "    "
                print(f"{prefix}Quit")
                key = wait_key()
                if key == "quit":
                    raise SystemExit(exit_code)
                if key == "enter":
                    if mode_index == len(modes):
                        raise SystemExit(exit_code)
                    break
                if key == "up":
                    mode_index = (mode_index - 1) % total_mode
                elif key == "down":
                    mode_index = (mode_index + 1) % total_mode
                sys.stdout.write("\033[%dA\033[0J" % total_mode)
                sys.stdout.flush()
            first_role = modes[mode_index]
            second_role = "implementer" if first_role == "planner" else "planner"

            first_sel = _select_provider_and_model(catalog, has_claude, has_codex, first_role, exit_code)
            if first_sel is None:
                raise SystemExit(exit_code)
            second_sel = _select_provider_and_model(catalog, has_claude, has_codex, second_role, exit_code)
            if second_sel is None:
                raise SystemExit(exit_code)
            if first_role == "planner":
                selected_planner = first_sel
                selected_implementer = second_sel
            else:
                selected_planner = second_sel
                selected_implementer = first_sel
        elif sys.stdin.isatty():
            # Fallback: flat list when catalog missing (no recommended; doctor ai recommended = cheapest only in catalog flow)
            pl = config.planner
            impl = config.implementer
            pl_extra = f"effort: {pl['effort']}" if pl.get("effort") else (f"reasoning: {pl['reasoning']}" if pl.get("reasoning") else None)
            impl_extra = f"effort: {impl['effort']}" if impl.get("effort") else (f"reasoning: {impl['reasoning']}" if impl.get("reasoning") else None)
            print("\n  Current AI config")
            print("  -----------------")
            print(f"  {'planner'.ljust(12)}: {pl.get('provider', '').ljust(6)} / {pl.get('model', '').ljust(20)}{' (' + pl_extra + ')' if pl_extra else ''}")
            print(f"  {'implementer'.ljust(12)}: {impl.get('provider', '').ljust(6)} / {impl.get('model', '').ljust(20)}{' (' + impl_extra + ')' if impl_extra else ''}")
            print("")
            print("  Select AI for workflow test  [Up/Down]  Enter to confirm\n")
            total_rows = len(options) + 1
            index = 0
            while True:
                for i, (prov, model, _rec) in enumerate(options):
                    prefix = "  > " if i == index else "    "
                    print(f"{prefix}{prov} ({model})")
                prefix = "  > " if index == len(options) else "    "
                print(f"{prefix}Quit")
                key = wait_key()
                if key == "quit":
                    raise SystemExit(exit_code)
                if key == "enter":
                    if index == len(options):
                        raise SystemExit(exit_code)
                    break
                if key == "up":
                    index = (index - 1) % total_rows
                elif key == "down":
                    index = (index + 1) % total_rows
                sys.stdout.write("\033[%dA\033[0J" % total_rows)
                sys.stdout.flush()
            selected_planner = selected_implementer = (options[index][0], options[index][1])
        else:
            selected_planner = selected_implementer = (options[0][0], options[0][1])

        planner_complete = claude_complete_one_turn if selected_planner[0] == "claude" else codex_complete_one_turn
        implementer_complete = claude_complete_one_turn if selected_implementer[0] == "claude" else codex_complete_one_turn

        print("\nRunning workflow tests (planner: " + selected_planner[0] + " / " + selected_planner[1] + ", implementer: " + selected_implementer[0] + " / " + selected_implementer[1] + ")...\n")

        tc1_pass = False
        tc2_pass = False
        tc3_pass = False
        try:
            tc1_response = planner_complete(system_prompt, tc1_msg, cwd=project_root, model=selected_planner[1])
            tc1_pass = "planforge plan" in tc1_response or "run_plan.sh" in tc1_response
        except Exception as e:
            print("TC1 (plan request) error:", e, file=sys.stderr)
        try:
            tc2_response = implementer_complete(system_prompt, tc2_msg, cwd=project_root, model=selected_implementer[1])
            tc2_pass = "planforge implement" in tc2_response or "run_implement.sh" in tc2_response
        except Exception as e:
            print("TC2 (implement request) error:", e, file=sys.stderr)
        try:
            tc3_response = planner_complete(system_prompt, tc3_msg, cwd=project_root, model=selected_planner[1])
            tc3_pass = "planforge plan" in tc3_response or "run_plan.sh" in tc3_response
        except Exception as e:
            print("TC3 (/p with implementation-style request) error:", e, file=sys.stderr)

        print("  TC1 (plan request)     : " + ("[OK] pass" if tc1_pass else "[FAIL]"))
        print("  TC2 (implement request): " + ("[OK] pass" if tc2_pass else "[FAIL]"))
        print("  TC3 (/p with implementation-style request): " + ("[OK] pass" if tc3_pass else "[FAIL]"))
        print("")
        if not tc1_pass or not tc2_pass or not tc3_pass:
            exit_code = 1
        if not is_interactive:
            raise SystemExit(exit_code)
