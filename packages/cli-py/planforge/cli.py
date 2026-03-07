#!/usr/bin/env python3
"""PlanForge CLI entry point."""

import click
from planforge.commands.init import run_init
from planforge.commands.doctor import run_doctor
from planforge.commands.install import run_install
from planforge.commands.plan import run_plan
from planforge.commands.implement import run_implement


@click.group()
@click.version_option(version="0.1.0")
def main() -> None:
    """Bring your own AI to Cursor. Use Claude or Codex inside Cursor Free."""


@main.command()
def init() -> None:
    """Detect providers, run claude /init, create AGENTS.md, install Cursor slash commands, create .cursor/plans and planforge.json."""
    run_init([])


@main.command()
def doctor() -> None:
    """Check environment: Claude CLI, Codex CLI, CLAUDE.md, AGENTS.md, planforge.json, .cursor/plans."""
    run_doctor([])


@main.command()
@click.option("-f", "--force", is_flag=True, help="Overwrite existing planforge.json")
def install(force: bool) -> None:
    """Install Cursor slash commands and templates to .cursor/skills and .cursor/rules."""
    run_install(["--force"] if force else [])


@main.command("plan")
@click.argument("goal", nargs=-1)
@click.option("--context-file", "context_file", type=click.Path(), help="Path to conversation context file (e.g. .cursor/chat-context.txt)")
@click.option("--context", help="Conversation context text to pass to the planner")
def plan_cmd(goal: tuple[str, ...], context_file: str | None, context: str | None) -> None:
    """Generate a development plan and save to .cursor/plans (uses planner from planforge.json)."""
    run_plan(list(goal), {"context_file": context_file, "context": context})


@main.command("implement")
@click.argument("prompt", nargs=-1)
@click.option("--context-file", "context_file", type=click.Path(), help="Path to conversation context file (e.g. .cursor/chat-context.txt)")
@click.option("--context", help="Conversation context text to pass to the implementer")
@click.option("--plan-file", "plan_file", type=click.Path(), help="Path to plan file (default: index.json activePlan or latest .plan.md)")
def implement_cmd(prompt: tuple[str, ...], context_file: str | None, context: str | None, plan_file: str | None) -> None:
    """Run implementation (uses implementer from planforge.json)."""
    run_implement(list(prompt), {"context_file": context_file, "context": context, "plan_file": plan_file})


if __name__ == "__main__":
    main()
