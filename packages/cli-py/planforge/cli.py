#!/usr/bin/env python3
"""PlanForge CLI entry point."""

import click
from planforge.commands.init import run_init
from planforge.commands.doctor import run_doctor, run_doctor_mode_select
from planforge.commands.install import run_install
from planforge.commands.plan import run_plan
from planforge.commands.implement import run_implement
from planforge.commands.model import run_model


@click.group()
@click.version_option(version="0.1.8")
def main() -> None:
    """Bring your own AI to Cursor. Use Claude or Codex inside Cursor Free."""


@main.command()
@click.option("--skip-provider-install", is_flag=True, help="Skip interactive provider (Claude/Codex) install prompt")
def init(skip_provider_install: bool) -> None:
    """Detect providers, run claude /init when available, install Cursor slash commands, create .cursor/plans, .cursor/contexts, and planforge.json."""
    run_init(["--skip-provider-install"] if skip_provider_install else [])


@main.group(invoke_without_command=True)
@click.pass_context
def doctor(ctx: click.Context) -> None:
    """Check environment or run AI workflow tests (static / ai)."""
    if ctx.invoked_subcommand is None:
        run_doctor_mode_select()


@doctor.command("static")
def doctor_static() -> None:
    """Check environment and providers (Claude/Codex CLI, planforge.json, .cursor/plans, .cursor/contexts)."""
    run_doctor([])


@doctor.command("ai")
@click.option("--provider", help="Use this provider (skip interactive selection)")
@click.option("--model", help="Use this model (use with --provider)")
def doctor_ai(provider: str | None, model: str | None) -> None:
    """Run workflow compliance tests with AI (select planner/implementer, run TC1/TC2/TC3)."""
    args: list[str] = []
    if provider:
        args.extend(["--provider", provider])
    if model:
        args.extend(["--model", model])
    from planforge.commands.doctor import run_doctor_ai
    run_doctor_ai(args)


@main.command()
@click.option("-f", "--force", is_flag=True, help="Overwrite existing planforge.json")
def install(force: bool) -> None:
    """Install Cursor slash commands and templates to .cursor/skills and .cursor/rules."""
    run_install(["--force"] if force else [])


@main.command("model")
def model_cmd() -> None:
    """Interactive model selection: mode => provider => model (with effort/reasoning). Updates planforge.json."""
    run_model([])


@main.command("plan")
@click.argument("goal", nargs=-1)
@click.option("--context-dir", "context_dir", type=click.Path(), help="Path to markdown context directory (default: .cursor/contexts)")
@click.option("--context", help="Conversation context text to pass to the planner")
@click.option("--slug", help="Override output filename slug (default: from plan body or goal)")
def plan_cmd(goal: tuple[str, ...], context_dir: str | None, context: str | None, slug: str | None) -> None:
    """Generate a development plan and save to .cursor/plans (uses planner from planforge.json)."""
    opts = {"context_dir": context_dir, "context": context}
    if slug is not None:
        opts["slug"] = slug
    run_plan(list(goal), opts)


@main.command("implement")
@click.argument("prompt", nargs=-1)
@click.option("--context-dir", "context_dir", type=click.Path(), help="Path to markdown context directory (default: .cursor/contexts)")
@click.option("--context", help="Conversation context text to pass to the implementer")
@click.option("--plan-file", "plan_file", type=click.Path(), help="Path to plan file (default: index.json activePlan or latest dated .plan.md)")
@click.option("--files", "files", multiple=True, type=click.Path(), help="File paths to focus on (overrides plan's Files Likely to Change)")
def implement_cmd(
    prompt: tuple[str, ...],
    context_dir: str | None,
    context: str | None,
    plan_file: str | None,
    files: tuple[str, ...],
) -> None:
    """Run implementation (uses implementer from planforge.json)."""
    opts = {"context_dir": context_dir, "context": context, "plan_file": plan_file}
    if files:
        opts["files"] = list(files)
    run_implement(list(prompt), opts)


if __name__ == "__main__":
    main()
