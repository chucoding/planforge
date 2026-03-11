"""planforge init - detect providers, install slash commands, create .cursor/plans."""

import json
import sys
from pathlib import Path

from planforge.utils.paths import get_project_root, get_plans_dir
from planforge.utils.shell import run_command
from planforge.providers.claude import check_claude
from planforge.providers.codex import check_codex
from planforge.templates.install import install_templates
from planforge.utils.config import get_default_config


def _prompt_claude_init() -> bool:
    """Ask user (y/n) whether to run claude /init. Returns True only for y/yes. Non-TTY → False."""
    if not sys.stdin.isatty():
        return False
    raw = input("Run claude /init for this project? (y/n) [y]: ").strip().lower()
    return raw in ("", "y", "yes")


def run_init(args: list[str]) -> None:
    cwd = Path.cwd()
    project_root = get_project_root(str(cwd))
    skip_provider_install = "--skip-provider-install" in args

    try:
        has_claude = check_claude()
        has_codex = check_codex()

        if not skip_provider_install:
            print("\nPlanForge init - provider check\n")
            print(f"  Claude CLI   {'installed' if has_claude else 'not found'}  (recommended for /p planning)")
            print(f"  Codex CLI    {'installed' if has_codex else 'not found'}  (recommended for /i implementation)")
            print("")

        if has_claude and _prompt_claude_init():
            try:
                run_command("claude", ["/init"], project_root)
            except Exception as e:
                print("Warning: claude /init failed:", e)
                print("Claude /init failed (sign in may be required). Run 'claude' to sign in, then run 'claude /init' in this project.")

        install_templates(project_root)

        plans_dir = get_plans_dir(project_root)
        Path(plans_dir).mkdir(parents=True, exist_ok=True)
        print("Created .cursor/plans")
        (Path(project_root) / ".cursor" / "context").mkdir(parents=True, exist_ok=True)
        print("Created .cursor/context")

        config_path = Path(project_root) / "planforge.json"
        if not config_path.exists():
            config_path.write_text(
                json.dumps(get_default_config(has_claude, has_codex), indent=2),
                encoding="utf-8",
            )
            print("Created planforge.json")

        print("PlanForge init complete.")
    except Exception as e:
        print("PlanForge init failed:", e)
        raise SystemExit(1)
