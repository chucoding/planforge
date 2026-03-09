"""planforge init - detect providers, install slash commands, create .cursor/plans."""

import json
import shutil
from pathlib import Path

from planforge.utils.paths import get_project_root, get_plans_dir, get_templates_root
from planforge.utils.shell import run_command
from planforge.providers.claude import check_claude
from planforge.providers.codex import check_codex
from planforge.templates.install import install_templates

DEFAULT_AGENTS_MD = """# AGENTS.md

Codex/OpenAI agent context for this project.
Customize this file to give the implementer (/i) relevant project context.
"""


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

        if has_codex:
            agents_path = Path(project_root) / "AGENTS.md"
            if not agents_path.exists():
                agents_path.write_text(DEFAULT_AGENTS_MD, encoding="utf-8")
                print("Created AGENTS.md")

        install_templates(project_root)

        plans_dir = get_plans_dir(project_root)
        Path(plans_dir).mkdir(parents=True, exist_ok=True)
        print("Created .cursor/plans")

        config_path = Path(project_root) / "planforge.json"
        if not config_path.exists():
            template_config = Path(get_templates_root()) / "config" / "planforge.json"
            if template_config.exists():
                shutil.copy2(template_config, config_path)
            else:
                config_path.write_text(
                    json.dumps(
                        {
                            "planner": {"provider": "claude", "model": "opus", "effort": "high"},
                            "implementer": {"provider": "codex", "model": "codex"},
                            "plansDir": ".cursor/plans",
                        },
                        indent=2,
                    ),
                    encoding="utf-8",
                )
            print("Created planforge.json")

        print("PlanForge init complete.")
    except Exception as e:
        print("PlanForge init failed:", e)
        raise SystemExit(1)
