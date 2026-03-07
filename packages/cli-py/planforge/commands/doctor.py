"""planforge doctor - check environment and providers."""

from pathlib import Path

from rich.console import Console
from rich.table import Table

from planforge.utils.paths import get_project_root, get_plans_dir
from planforge.providers.claude import check_claude
from planforge.providers.codex import check_codex


def run_doctor(args: list[str]) -> None:
    console = Console()
    project_root = get_project_root()
    plans_dir = get_plans_dir(project_root)

    has_claude = check_claude()
    has_codex = check_codex()

    rows = []

    rows.append((
        "Claude CLI",
        "✓" if has_claude else "?",
        "available" if has_claude else "not found (planning /p will be limited)",
    ))
    rows.append((
        "Codex CLI",
        "✓" if has_codex else "?",
        "available" if has_codex else "not found (implementation /i will be limited)",
    ))

    claude_md = Path(project_root) / "CLAUDE.md"
    has_claude_md = claude_md.exists()
    rows.append((
        "CLAUDE.md",
        "✓" if has_claude_md else ("?" if has_claude else "✓"),
        "exists" if has_claude_md else ("missing (run claude /init)" if has_claude else "n/a"),
    ))

    agents_md = Path(project_root) / "AGENTS.md"
    has_agents_md = agents_md.exists()
    rows.append((
        "AGENTS.md",
        "✓" if has_agents_md else ("?" if has_codex else "✓"),
        "exists" if has_agents_md else ("missing" if has_codex else "n/a"),
    ))

    config_path = Path(project_root) / "planforge.json"
    has_config = config_path.exists()
    rows.append((
        "planforge.json",
        "✓" if has_config else "✗",
        "exists" if has_config else "missing (run planforge init)",
    ))

    has_plans_dir = Path(plans_dir).exists()
    rows.append((
        ".cursor/plans",
        "✓" if has_plans_dir else "✗",
        "exists" if has_plans_dir else "missing (run planforge init)",
    ))

    table = Table(show_header=True, header_style="bold")
    table.add_column("Check", style="dim")
    table.add_column("Status", width=4)
    table.add_column("Message")
    for name, status, msg in rows:
        table.add_row(name, status, msg)

    console.print("\nPlanForge doctor\n")
    console.print(table)
    console.print()

    if any(r[1] == "✗" for r in rows):
        raise SystemExit(1)
