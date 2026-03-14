"""planforge doctor - check environment and providers."""

import json
import sys
from pathlib import Path

from planforge.utils.paths import (
    get_project_root,
    get_plans_dir,
    get_context_dir,
    get_templates_root,
)
from planforge.utils.config import load_config, get_default_doctor_ai_config
from planforge.providers.claude import (
    check_claude,
    complete_one_turn as claude_complete_one_turn,
    stream_one_turn as claude_stream_one_turn,
)
from planforge.providers.codex import (
    check_codex,
    complete_one_turn as codex_complete_one_turn,
    stream_one_turn as codex_stream_one_turn,
)
from planforge.utils.tui import print_current_ai_config, select_from_list
from planforge.commands.model import _load_models_catalog

DOCTOR_MODE_STATIC = "static"
DOCTOR_MODE_AI = "ai"


def _run_streaming_doctor_tc(
    label: str,
    system_prompt: str,
    user_message: str,
    expected_keywords: list[str],
    provider: str,
    model: str,
    project_root: str,
) -> tuple[bool, str | None]:
    runner = claude_stream_one_turn if provider == "claude" else codex_stream_one_turn
    response = ""
    pass_shown = False

    def render(suffix: str = "") -> None:
        normalized = " ".join(response.split())
        sys.stdout.write("\r\033[2K")
        sys.stdout.write(f"    response: {normalized}{suffix}")
        sys.stdout.flush()

    print(f"  {label}")
    sys.stdout.write("    response: ")
    sys.stdout.flush()

    def _handle_chunk(chunk: str) -> None:
        nonlocal response, pass_shown
        response += chunk
        if not pass_shown and any(keyword in response for keyword in expected_keywords):
            pass_shown = True
            render("  [OK] pass")
            return
        if not pass_shown:
            render()

    try:
        final_response = runner(
            system_prompt,
            user_message,
            _handle_chunk,
            cwd=project_root,
            model=model,
        )
        response = final_response
        passed = any(keyword in response for keyword in expected_keywords)
        render("  [OK] pass" if passed else "  [FAIL]")
        print("")
        return passed, None
    except Exception as e:
        render("  [FAIL]")
        print("")
        return False, str(e)


def run_doctor_mode_select() -> None:
    """When doctor is run without subcommand: TTY shows Doctor AI config (default) then mode selection (static/ai/Quit); non-TTY runs static."""
    if not sys.stdin.isatty():
        run_doctor([])
        return
    has_claude = check_claude()
    has_codex = check_codex()
    try:
        doctor_ai_config = get_default_doctor_ai_config(has_claude, has_codex)
        print_current_ai_config(doctor_ai_config, "Doctor AI config (default)")
    except (FileNotFoundError, RuntimeError):
        pass
    mode_items = [
        ("static – Check environment and providers", DOCTOR_MODE_STATIC),
        ("ai – Run workflow tests with AI", DOCTOR_MODE_AI),
    ]
    chosen = select_from_list(mode_items, "Mode  [Up/Down]  Enter to confirm")
    if chosen is None:
        sys.exit(0)
    if chosen == DOCTOR_MODE_STATIC:
        run_doctor([])
        return
    if chosen == DOCTOR_MODE_AI:
        run_doctor_ai([])
        return


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
        ".cursor/plans",
        "ok" if has_plans_dir else "error",
        "exists" if has_plans_dir else "missing (run planforge init)",
    ))

    context_dir_path = Path(get_context_dir(project_root))
    has_context_dir = context_dir_path.exists()
    checks.append((
        ".cursor/contexts",
        "ok" if has_context_dir else "warn",
        "exists" if has_context_dir else "missing (run planforge init)",
    ))

    if has_plans_dir:
        plan_root = Path(plans_dir)
        root_entries = list(plan_root.iterdir())
        has_legacy_flat_plans = any(entry.is_file() and entry.name.endswith(".plan.md") for entry in root_entries)
        if has_legacy_flat_plans:
            checks.append((
                "plans layout",
                "warn",
                "flat plan files in plans root (use YYYY-MM-DD/HHMM-slug.plan.md)",
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
        provider_items = [
            (
                f"{providers_data.get(p, {}).get('name', p) if isinstance(providers_data.get(p), dict) else p} ({p})",
                p,
            )
            for p in provider_ids
        ]
        provider_id = select_from_list(
            provider_items,
            f"Select {role_label}  [Up/Down]  Enter to confirm",
        )
        if provider_id is None:
            return None
        prov = providers_data.get(provider_id) or {}
        models = prov.get("models", []) if isinstance(prov, dict) else []
        if not models:
            continue
        model_items = []
        for i, m in enumerate(models):
            mid = m.get("id", "") if isinstance(m, dict) else ""
            label = m.get("label", mid) if isinstance(m, dict) else mid
            rec = "  (recommended)" if i == len(models) - 1 else ""
            model_items.append((f"{label} ({mid}){rec}", mid))
        model_id = select_from_list(
            model_items,
            "[Up/Down] model  Enter to confirm  (last = recommended)",
        )
        if model_id is None:
            continue
        return (provider_id, model_id)


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

    prompts_path = Path(get_templates_root()) / "doctor" / "prompts.json"
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
    doctor_ai_config = None
    if is_interactive:
        try:
            doctor_ai_config = get_default_doctor_ai_config(has_claude, has_codex)
        except (FileNotFoundError, RuntimeError):
            pass
    while True:
        if provider_arg and model_arg:
            match = next((o for o in options if o[0] == provider_arg and o[1] == model_arg), None)
            if not match:
                print(f"No matching option for --provider {provider_arg} --model {model_arg}", file=sys.stderr)
                raise SystemExit(1)
            selected_planner = selected_implementer = (match[0], match[1])
        elif use_planner_implementer_selection:
            pl = (doctor_ai_config or config)["planner"]
            impl = (doctor_ai_config or config)["implementer"]
            pl_extra = f"effort: {pl['effort']}" if pl.get("effort") else (f"reasoning: {pl['reasoning']}" if pl.get("reasoning") else None)
            impl_extra = f"effort: {impl['effort']}" if impl.get("effort") else (f"reasoning: {impl['reasoning']}" if impl.get("reasoning") else None)
            print("\n  Doctor AI config")
            print("  ----------------")
            print(f"  {'planner'.ljust(12)}: {pl.get('provider', '').ljust(6)} / {pl.get('model', '').ljust(20)}{' (' + pl_extra + ')' if pl_extra else ''}")
            print(f"  {'implementer'.ljust(12)}: {impl.get('provider', '').ljust(6)} / {impl.get('model', '').ljust(20)}{' (' + impl_extra + ')' if impl_extra else ''}")

            first_role = select_from_list(
                [("planner", "planner"), ("implementer", "implementer")],
                "Mode  [Up/Down]  Enter to confirm",
            )
            if first_role is None:
                raise SystemExit(exit_code)
            second_role = "implementer" if first_role == "planner" else "planner"

            first_sel = _select_provider_and_model(catalog, has_claude, has_codex, first_role)
            if first_sel is None:
                raise SystemExit(exit_code)
            second_sel = _select_provider_and_model(catalog, has_claude, has_codex, second_role)
            if second_sel is None:
                raise SystemExit(exit_code)
            if first_role == "planner":
                selected_planner = first_sel
                selected_implementer = second_sel
            else:
                selected_planner = second_sel
                selected_implementer = first_sel
        elif sys.stdin.isatty():
            # Fallback: flat list when catalog missing
            pl = (doctor_ai_config or config)["planner"]
            impl = (doctor_ai_config or config)["implementer"]
            pl_extra = f"effort: {pl['effort']}" if pl.get("effort") else (f"reasoning: {pl['reasoning']}" if pl.get("reasoning") else None)
            impl_extra = f"effort: {impl['effort']}" if impl.get("effort") else (f"reasoning: {impl['reasoning']}" if impl.get("reasoning") else None)
            print("\n  Doctor AI config")
            print("  ----------------")
            print(f"  {'planner'.ljust(12)}: {pl.get('provider', '').ljust(6)} / {pl.get('model', '').ljust(20)}{' (' + pl_extra + ')' if pl_extra else ''}")
            print(f"  {'implementer'.ljust(12)}: {impl.get('provider', '').ljust(6)} / {impl.get('model', '').ljust(20)}{' (' + impl_extra + ')' if impl_extra else ''}")
            flat_items = [(f"{prov} ({model})", (prov, model)) for (prov, model, _) in options]
            selected = select_from_list(
                flat_items,
                "Select AI for workflow test  [Up/Down]  Enter to confirm",
            )
            if selected is None:
                raise SystemExit(exit_code)
            selected_planner = selected_implementer = selected
        else:
            selected_planner = selected_implementer = (options[0][0], options[0][1])

        planner_complete = claude_complete_one_turn if selected_planner[0] == "claude" else codex_complete_one_turn
        implementer_complete = claude_complete_one_turn if selected_implementer[0] == "claude" else codex_complete_one_turn

        print("\nRunning workflow tests (planner: " + selected_planner[0] + " / " + selected_planner[1] + ", implementer: " + selected_implementer[0] + " / " + selected_implementer[1] + ")...\n")

        tc1_pass = False
        tc2_pass = False
        tc3_pass = False
        if sys.stdout.isatty():
            tc1_pass, tc1_error = _run_streaming_doctor_tc(
                "TC1 (plan request)",
                system_prompt,
                tc1_msg,
                ["planforge plan", "run_plan.sh", "run_plan.ps1"],
                selected_planner[0],
                selected_planner[1],
                project_root,
            )
            if tc1_error:
                print("TC1 (plan request) error:", tc1_error, file=sys.stderr)

            tc2_pass, tc2_error = _run_streaming_doctor_tc(
                "TC2 (implement request)",
                system_prompt,
                tc2_msg,
                ["planforge implement", "run_implement.sh", "run_implement.ps1"],
                selected_implementer[0],
                selected_implementer[1],
                project_root,
            )
            if tc2_error:
                print("TC2 (implement request) error:", tc2_error, file=sys.stderr)

            tc3_pass, tc3_error = _run_streaming_doctor_tc(
                "TC3 (/p with implementation-style request)",
                system_prompt,
                tc3_msg,
                ["planforge plan", "run_plan.sh", "run_plan.ps1"],
                selected_planner[0],
                selected_planner[1],
                project_root,
            )
            if tc3_error:
                print("TC3 (/p with implementation-style request) error:", tc3_error, file=sys.stderr)
            _green = "\033[32m"
            _red = "\033[31m"
            _reset = "\033[0m"
            print("  Test case results:")
            print("  TC1 (plan request)     : " + (_green + "[OK] pass" + _reset if tc1_pass else _red + "[FAIL]" + _reset))
            print("  TC2 (implement request): " + (_green + "[OK] pass" + _reset if tc2_pass else _red + "[FAIL]" + _reset))
            print("  TC3 (/p with implementation-style request): " + (_green + "[OK] pass" + _reset if tc3_pass else _red + "[FAIL]" + _reset))
            print("")
        else:
            try:
                tc1_response = planner_complete(system_prompt, tc1_msg, cwd=project_root, model=selected_planner[1])
                tc1_pass = "planforge plan" in tc1_response or "run_plan.sh" in tc1_response or "run_plan.ps1" in tc1_response
            except Exception as e:
                print("TC1 (plan request) error:", e, file=sys.stderr)
            try:
                tc2_response = implementer_complete(system_prompt, tc2_msg, cwd=project_root, model=selected_implementer[1])
                tc2_pass = "planforge implement" in tc2_response or "run_implement.sh" in tc2_response or "run_implement.ps1" in tc2_response
            except Exception as e:
                print("TC2 (implement request) error:", e, file=sys.stderr)
            try:
                tc3_response = planner_complete(system_prompt, tc3_msg, cwd=project_root, model=selected_planner[1])
                tc3_pass = "planforge plan" in tc3_response or "run_plan.sh" in tc3_response or "run_plan.ps1" in tc3_response
            except Exception as e:
                print("TC3 (/p with implementation-style request) error:", e, file=sys.stderr)

            _green = "\033[32m"
            _red = "\033[31m"
            _reset = "\033[0m"
            print("  Test case results:")
            print("  TC1 (plan request)     : " + (_green + "[OK] pass" + _reset if tc1_pass else _red + "[FAIL]" + _reset))
            print("  TC2 (implement request): " + (_green + "[OK] pass" + _reset if tc2_pass else _red + "[FAIL]" + _reset))
            print("  TC3 (/p with implementation-style request): " + (_green + "[OK] pass" + _reset if tc3_pass else _red + "[FAIL]" + _reset))
            print("")
        if not tc1_pass or not tc2_pass or not tc3_pass:
            exit_code = 1
        if not is_interactive:
            raise SystemExit(exit_code)
