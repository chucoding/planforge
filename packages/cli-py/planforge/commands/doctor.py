"""planforge doctor - check environment and providers."""

import json
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

from planforge.utils.paths import (
    get_project_root,
    get_plans_dir,
    get_context_dir,
    get_templates_root,
)
from planforge.utils.config import load_config
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
from planforge.commands.model import _load_models_catalog, _run_model_tui

DOCTOR_MODE_STATIC = "static"
URL_TEST_URL = "https://httpbin.org/get"
URL_TEST_TIMEOUT_S = 5


def _run_url_fetch_tc() -> tuple[bool, str | None]:
    """Run simple URL fetch test; return (passed, error_message or None). Surfaces real fetch errors."""
    req = urllib.request.Request(URL_TEST_URL, headers={"User-Agent": "PlanForge-CLI/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=URL_TEST_TIMEOUT_S) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return (len(body) > 0, None)
    except urllib.error.HTTPError as e:
        return (False, f"HTTP {e.code}")
    except (urllib.error.URLError, OSError, ValueError) as e:
        return (False, str(e))


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

    _dim = "\033[2m"
    _reset = "\033[0m"
    _pass_color = "\033[92m"
    _fail_color = "\033[31m"
    _check = "\u2713"
    _cross = "\u2717"

    def render(suffix: str = "") -> None:
        normalized = " ".join(response.split())
        sys.stdout.write("\r\033[2K")
        sys.stdout.write(f"    {_dim}response:{_reset} {normalized}{suffix}")
        sys.stdout.flush()

    print(f"  \033[36m{label}{_reset}")
    sys.stdout.write(f"    {_dim}response:{_reset} ")
    sys.stdout.flush()

    spinner_stop = threading.Event()
    spinner_frames = ["|", "/", "-", "\\"]

    def _spinner_loop() -> None:
        idx = 0
        while not spinner_stop.is_set():
            sys.stdout.write("\r\033[2K")
            sys.stdout.write(f"    {_dim}response:{_reset} {spinner_frames[idx % 4]}")
            sys.stdout.flush()
            idx += 1
            spinner_stop.wait(0.08)

    def _handle_chunk(chunk: str) -> None:
        nonlocal response, pass_shown
        if not response and chunk:
            spinner_stop.set()
        response += chunk
        if not pass_shown and any(keyword in response for keyword in expected_keywords):
            pass_shown = True
            render(f"  {_pass_color}{_check} PASS{_reset}")
            return
        if not pass_shown:
            render()

    try:
        spinner_thread = threading.Thread(target=_spinner_loop, daemon=True)
        spinner_thread.start()
        final_response = runner(
            system_prompt,
            user_message,
            _handle_chunk,
            cwd=project_root,
            model=model,
        )
        spinner_stop.set()
        spinner_thread.join(timeout=0.2)
        response = final_response
        passed = any(keyword in response for keyword in expected_keywords)
        render(f"  {_pass_color}{_check} PASS{_reset}" if passed else f"  {_fail_color}{_cross} FAIL{_reset}")
        print("")
        return passed, None
    except Exception as e:
        spinner_stop.set()
        spinner_thread.join(timeout=0.2)
        render(f"  {_fail_color}{_cross} FAIL{_reset}")
        print("")
        return False, str(e)


def run_doctor_mode_select() -> None:
    """When doctor is run without subcommand: TTY shows mode selection (static/ai/Quit) first; non-TTY runs static."""
    if not sys.stdin.isatty():
        run_doctor([])
        return
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

    rules_dir = Path(project_root) / ".cursor" / "rules"
    planforge_rule_files = ["planforge-workflow.mdc", "planforge-cursor-agent-terminal.mdc"]
    for rule_file in planforge_rule_files:
        rule_path = rules_dir / rule_file
        has_rule = rule_path.exists()
        checks.append((
            f".cursor/rules/{rule_file}",
            "ok" if has_rule else "warn",
            "exists" if has_rule else "missing (run planforge install)",
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
    sys.exit(0)


def _load_workflow_mdc(project_root: str) -> str:
    installed = Path(project_root) / ".cursor" / "rules" / "planforge-workflow.mdc"
    if installed.exists():
        return installed.read_text(encoding="utf-8")
    templates_path = Path(get_templates_root()) / "cursor" / "rules" / "planforge-workflow.mdc"
    if templates_path.exists():
        return templates_path.read_text(encoding="utf-8")
    raise FileNotFoundError(
        f"Missing or invalid template: {templates_path}. Run from repo root or ensure templates exist."
    )


def _is_valid_provider_model(catalog: dict, provider: str, model: str) -> bool:
    """Validate that provider+model exists in catalog (for --provider --model)."""
    prov = catalog.get("providers", {}).get(provider)
    if not isinstance(prov, dict):
        return False
    models = prov.get("models", [])
    return any(isinstance(m, dict) and m.get("id") == model for m in models)


def run_doctor_ai(args: list[str]) -> None:
    project_root = get_project_root()
    has_claude = check_claude()
    has_codex = check_codex()
    try:
        config = load_config(project_root)
    except Exception as e:
        print("Failed to load planforge.json:", e, file=sys.stderr)
        raise SystemExit(1) from e

    try:
        catalog = _load_models_catalog()
    except FileNotFoundError as e:
        print(e, file=sys.stderr)
        print("doctor ai uses the same model catalog as planforge model. Run pnpm run build in cli-js or use planforge model.", file=sys.stderr)
        raise SystemExit(1) from e

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

    system_prompt = _load_workflow_mdc(project_root)

    is_interactive = sys.stdin.isatty() and not (provider_arg and model_arg)
    exit_code = 0
    selected_planner = None
    selected_implementer = None

    if provider_arg and model_arg:
        if not _is_valid_provider_model(catalog, provider_arg, model_arg):
            print(f"No matching option for --provider {provider_arg} --model {model_arg}. Check models.json catalog.", file=sys.stderr)
            raise SystemExit(1)
        selected_planner = selected_implementer = (provider_arg, model_arg)
    elif is_interactive:
        selected_planner = (config["planner"].get("provider", ""), config["planner"].get("model", ""))
        selected_implementer = (config["implementer"].get("provider", ""), config["implementer"].get("model", ""))
        while True:
            pl = config["planner"]
            impl = config["implementer"]
            pl_extra = f"effort: {pl.get('effort')}" if pl.get("effort") else (f"reasoning: {pl.get('reasoning')}" if pl.get("reasoning") else None)
            impl_extra = f"effort: {impl.get('effort')}" if impl.get("effort") else (f"reasoning: {impl.get('reasoning')}" if impl.get("reasoning") else None)
            print("\n  Doctor AI config (planforge.json)")
            print("  ----------------")
            print(f"  {'planner'.ljust(12)}: {pl.get('provider', '').ljust(6)} / {pl.get('model', '').ljust(20)}{' (' + pl_extra + ')' if pl_extra else ''}")
            print(f"  {'implementer'.ljust(12)}: {impl.get('provider', '').ljust(6)} / {impl.get('model', '').ljust(20)}{' (' + impl_extra + ')' if impl_extra else ''}")

            action = select_from_list(
                [("Run immediately", "run"), ("Change models", "change")],
                "Action  [Up/Down]  Enter to confirm",
            )
            if action is None:
                raise SystemExit(exit_code)
            if action == "run":
                break

            first_role = select_from_list(
                [("planner", "planner"), ("implementer", "implementer")],
                "Role to change  [Up/Down]  Enter to confirm",
            )
            if first_role is None:
                raise SystemExit(exit_code)
            second_role = "implementer" if first_role == "planner" else "planner"

            first_result = _run_model_tui(
                catalog, project_root, has_claude, has_codex, config,
                preselected_mode=first_role,
            )
            if first_result is None:
                raise SystemExit(exit_code)
            second_result = _run_model_tui(
                catalog, project_root, has_claude, has_codex, config,
                preselected_mode=second_role,
            )
            if second_result is None:
                raise SystemExit(exit_code)

            planner_result = first_result if first_role == "planner" else second_result
            implementer_result = second_result if first_role == "planner" else first_result
            selected_planner = (planner_result[1]["provider"], planner_result[1]["model"])
            selected_implementer = (implementer_result[1]["provider"], implementer_result[1]["model"])
            config["planner"] = {**config["planner"], **planner_result[1]}
            config["implementer"] = {**config["implementer"], **implementer_result[1]}
    else:
        selected_planner = (config["planner"].get("provider", ""), config["planner"].get("model", ""))
        selected_implementer = (config["implementer"].get("provider", ""), config["implementer"].get("model", ""))

    planner_complete = claude_complete_one_turn if selected_planner[0] == "claude" else codex_complete_one_turn
    implementer_complete = claude_complete_one_turn if selected_implementer[0] == "claude" else codex_complete_one_turn

    _cyan = "\033[36m"
    _dim = "\033[2m"
    _green = "\033[92m"
    _red = "\033[31m"
    _reset = "\033[0m"
    _check = "\u2713"
    _cross = "\u2717"
    print("")
    print(_cyan + "  \u2500\u2500\u2500 Workflow tests \u2500\u2500\u2500" + _reset)
    print(_dim + "  planner: " + selected_planner[0] + " / " + selected_planner[1] + "  \u00b7  implementer: " + selected_implementer[0] + " / " + selected_implementer[1] + _reset)
    print("")

    tc1_pass = False
    tc2_pass = False
    tc3_pass = False
    tc4_pass = False
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

        print(f"  {_cyan}TC4 (URL fetch){_reset}")
        tc4_pass, tc4_error = _run_url_fetch_tc()
        if tc4_error:
            print("TC4 (URL fetch) error:", tc4_error, file=sys.stderr)
        print("    " + (_green + _check + " PASS  " + _reset if tc4_pass else _red + _cross + " FAIL  " + _reset) + "GET " + URL_TEST_URL)

        print(_cyan + "  \u2500\u2500\u2500 Results \u2500\u2500\u2500" + _reset)
        print("  " + (_green + _check + " PASS" + _reset if tc1_pass else _red + _cross + " FAIL" + _reset) + "  TC1 (plan request)")
        print("  " + (_green + _check + " PASS" + _reset if tc2_pass else _red + _cross + " FAIL" + _reset) + "  TC2 (implement request)")
        print("  " + (_green + _check + " PASS" + _reset if tc3_pass else _red + _cross + " FAIL" + _reset) + "  TC3 (/p with implementation-style request)")
        print("  " + (_green + _check + " PASS" + _reset if tc4_pass else _red + _cross + " FAIL" + _reset) + "  TC4 (URL fetch)")
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
        tc4_pass, tc4_err = _run_url_fetch_tc()
        if tc4_err:
            print("TC4 (URL fetch) error:", tc4_err, file=sys.stderr)

        _cyan2 = "\033[36m"
        _green2 = "\033[92m"
        _red2 = "\033[31m"
        _reset2 = "\033[0m"
        _check2 = "\u2713"
        _cross2 = "\u2717"
        print(_cyan2 + "  \u2500\u2500\u2500 Results \u2500\u2500\u2500" + _reset2)
        print("  " + (_green2 + _check2 + " PASS" + _reset2 if tc1_pass else _red2 + _cross2 + " FAIL" + _reset2) + "  TC1 (plan request)")
        print("  " + (_green2 + _check2 + " PASS" + _reset2 if tc2_pass else _red2 + _cross2 + " FAIL" + _reset2) + "  TC2 (implement request)")
        print("  " + (_green2 + _check2 + " PASS" + _reset2 if tc3_pass else _red2 + _cross2 + " FAIL" + _reset2) + "  TC3 (/p with implementation-style request)")
        print("  " + (_green2 + _check2 + " PASS" + _reset2 if tc4_pass else _red2 + _cross2 + " FAIL" + _reset2) + "  TC4 (URL fetch)")
        print("")
    if not tc1_pass or not tc2_pass or not tc3_pass or not tc4_pass:
        exit_code = 1
    raise SystemExit(exit_code)
