"""planforge doctor - check environment and providers."""

import json
import sys
from pathlib import Path

from planforge.utils.paths import get_project_root, get_plans_dir, get_templates_root
from planforge.utils.config import load_config
from planforge.providers.claude import check_claude, complete_one_turn as claude_complete_one_turn
from planforge.providers.codex import check_codex, complete_one_turn as codex_complete_one_turn


def _status_symbol(status: str) -> str:
    if status == "ok":
        return "[OK]"
    if status == "warn":
        return "[WARN]"
    return "[ERROR]"


def run_doctor(args: list[str]) -> None:
    del args
    project_root = get_project_root()
    plans_dir = get_plans_dir(project_root)

    config_path = Path(project_root) / "planforge.json"
    has_config_file = config_path.exists()
    config: dict | None = None
    config_load_error: str | None = None
    if has_config_file:
        try:
            data = json.loads(config_path.read_text(encoding="utf-8"))
            config = data if isinstance(data, dict) else {}
        except (json.JSONDecodeError, OSError) as e:
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

    context_dir = (config or {}).get("contextDir") or ".cursor/context"
    context_dir_path = Path(project_root) / context_dir
    has_context_dir = context_dir_path.exists()
    checks.append((
        "contextDir",
        "ok" if has_context_dir else "warn",
        f"{context_dir} exists" if has_context_dir else f"{context_dir} missing (run planforge init)",
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


def run_doctor_ai(args: list[str]) -> None:
    project_root = get_project_root()
    has_claude = check_claude()
    has_codex = check_codex()
    try:
        config = load_config(project_root)
    except Exception as e:
        print("Failed to load planforge.json:", e, file=sys.stderr)
        raise SystemExit(1) from e

    options = _build_model_list_from_config(config, has_claude, has_codex)
    if not options:
        print("No AI provider available. Install Claude or Codex CLI and run planforge init.", file=sys.stderr)
        raise SystemExit(1)

    provider_arg = None
    model_arg = None
    for i, a in enumerate(args):
        if a == "--provider" and i + 1 < len(args):
            provider_arg = args[i + 1]
        if a == "--model" and i + 1 < len(args):
            model_arg = args[i + 1]

    if provider_arg and model_arg:
        match = next((o for o in options if o[0] == provider_arg and o[1] == model_arg), None)
        if not match:
            print(f"No matching option for --provider {provider_arg} --model {model_arg}", file=sys.stderr)
            raise SystemExit(1)
        selected = (match[0], match[1])
    elif sys.stdin.isatty():
        print("\nPlanForge doctor ai – select AI to run workflow tests\n")
        for i, (prov, model, rec) in enumerate(options, 1):
            rec_str = "  (recommended)" if rec else ""
            print(f"  {i}. {prov} ({model}){rec_str}")
        print("")
        try:
            raw = input("? Select AI to run workflow tests [1-" + str(len(options)) + "]: ").strip()
        except (EOFError, KeyboardInterrupt):
            raise SystemExit(1)
        try:
            n = int(raw)
        except ValueError:
            print("Invalid choice.", file=sys.stderr)
            raise SystemExit(1)
        if n < 1 or n > len(options):
            print("Invalid choice.", file=sys.stderr)
            raise SystemExit(1)
        selected = (options[n - 1][0], options[n - 1][1])
    else:
        selected = (options[0][0], options[0][1])

    workflow_content = _load_workflow_mdc(project_root)
    system_prompt = (
        workflow_content
        + "\n\nAnswer in one sentence only: what command or action you will take for the user request. Do not run anything."
    )

    complete_one_turn = claude_complete_one_turn if selected[0] == "claude" else codex_complete_one_turn
    opts = {"cwd": project_root, "model": selected[1]}

    print("\nRunning workflow tests with " + selected[0] + " (" + selected[1] + ")...\n")

    prompts_path = Path(get_templates_root()) / "doctor-ai" / "prompts.json"
    if not prompts_path.exists():
        raise FileNotFoundError(
            f"Missing or invalid template: {prompts_path}. Run from repo root or ensure templates exist."
        )
    try:
        prompts_data = json.loads(prompts_path.read_text(encoding="utf-8"))
        tc1_msg = prompts_data.get("tc1PlanRequest")
        tc2_msg = prompts_data.get("tc2ImplementRequest")
        if not isinstance(tc1_msg, str) or not isinstance(tc2_msg, str):
            raise RuntimeError(
                f"Missing or invalid template: {prompts_path}. Run from repo root or ensure templates exist."
            )
    except (json.JSONDecodeError, OSError) as e:
        raise RuntimeError(
            f"Missing or invalid template: {prompts_path}. Run from repo root or ensure templates exist."
        ) from e

    tc1_pass = False
    tc2_pass = False
    try:
        tc1_response = complete_one_turn(
            system_prompt,
            tc1_msg,
            **opts,
        )
        tc1_pass = "planforge plan" in tc1_response or "run_plan.sh" in tc1_response
    except Exception as e:
        print("TC1 (plan request) error:", e, file=sys.stderr)
    try:
        tc2_response = complete_one_turn(
            system_prompt,
            tc2_msg,
            **opts,
        )
        tc2_pass = "planforge implement" in tc2_response or "run_implement.sh" in tc2_response
    except Exception as e:
        print("TC2 (implement request) error:", e, file=sys.stderr)

    print("  TC1 (plan request)     : " + ("[OK] pass" if tc1_pass else "[FAIL]"))
    print("  TC2 (implement request): " + ("[OK] pass" if tc2_pass else "[FAIL]"))
    print("")
    if not tc1_pass or not tc2_pass:
        raise SystemExit(1)
