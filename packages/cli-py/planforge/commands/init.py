"""planforge init - detect providers, install slash commands, create .cursor/plans."""

import json
from pathlib import Path

from planforge.utils.paths import get_project_root, get_plans_dir
from planforge.utils.shell import run_command
from planforge.providers.claude import check_claude
from planforge.providers.codex import check_codex
from planforge.templates.install import install_templates

DEFAULT_CLAUDE_MD = """# CLAUDE.md

Claude project context. Run 'claude /init' after signing in, or edit this file.
"""

DEFAULT_AGENTS_MD = """# AGENTS.md

Codex/OpenAI agent context for this project.
Customize this file to give the implementer (/i) relevant project context.
"""


def _get_preset_for_providers(has_claude: bool, has_codex: bool) -> dict:
    if has_claude and has_codex:
        return {
            "planner": {"provider": "claude", "model": "claude-opus-4-6", "effort": "high"},
            "implementer": {"provider": "codex", "model": "gpt-5.4"},
            "plansDir": ".cursor/plans",
            "contextDir": ".cursor/context",
        }
    if has_claude:
        return {
            "planner": {"provider": "claude", "model": "claude-opus-4-6", "effort": "high"},
            "implementer": {"provider": "claude", "model": "claude-sonnet-4-6", "effort": "medium"},
            "plansDir": ".cursor/plans",
            "contextDir": ".cursor/context",
        }
    if has_codex:
        return {
            "planner": {"provider": "codex", "model": "gpt-5.4", "reasoning": "high"},
            "implementer": {"provider": "codex", "model": "gpt-5.4", "reasoning": "low"},
            "plansDir": ".cursor/plans",
            "contextDir": ".cursor/context",
        }
    return {
        "planner": {"provider": "claude", "model": "claude-opus-4-6", "effort": "high"},
        "implementer": {"provider": "claude", "model": "claude-sonnet-4-6", "effort": "medium"},
        "plansDir": ".cursor/plans",
        "contextDir": ".cursor/context",
    }


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

        if has_claude:
            try:
                run_command("claude", ["/init"], project_root)
            except Exception as e:
                print("Warning: claude /init failed:", e)
                claude_path = Path(project_root) / "CLAUDE.md"
                if not claude_path.exists():
                    claude_path.write_text(DEFAULT_CLAUDE_MD, encoding="utf-8")
                    print("Created CLAUDE.md")
                print("Claude /init failed (sign in may be required). Run 'claude' to sign in, then run 'claude /init' in this project.")

        if has_codex:
            agents_path = Path(project_root) / "AGENTS.md"
            if not agents_path.exists():
                agents_path.write_text(DEFAULT_AGENTS_MD, encoding="utf-8")
                print("Created AGENTS.md")

        install_templates(project_root)

        plans_dir = get_plans_dir(project_root)
        Path(plans_dir).mkdir(parents=True, exist_ok=True)
        print("Created .cursor/plans")
        (Path(project_root) / ".cursor" / "context").mkdir(parents=True, exist_ok=True)
        print("Created .cursor/context")

        config_path = Path(project_root) / "planforge.json"
        if not config_path.exists():
            config_path.write_text(
                json.dumps(_get_preset_for_providers(has_claude, has_codex), indent=2),
                encoding="utf-8",
            )
            print("Created planforge.json")

        print("PlanForge init complete.")
    except Exception as e:
        print("PlanForge init failed:", e)
        raise SystemExit(1)
