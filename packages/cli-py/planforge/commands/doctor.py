"""planforge doctor - check environment and providers."""

import json
from pathlib import Path

from planforge.utils.paths import get_project_root, get_plans_dir
from planforge.providers.claude import check_claude
from planforge.providers.codex import check_codex


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

    has_claude_md = (Path(project_root) / "CLAUDE.md").exists()
    checks.append((
        "CLAUDE.md",
        "ok" if has_claude_md else ("warn" if has_claude else "ok"),
        "exists" if has_claude_md else ("missing (run claude /init)" if has_claude else "n/a"),
    ))

    has_agents_md = (Path(project_root) / "AGENTS.md").exists()
    checks.append((
        "AGENTS.md",
        "ok" if has_agents_md else ("warn" if has_codex else "ok"),
        "exists" if has_agents_md else ("missing" if has_codex else "n/a"),
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
