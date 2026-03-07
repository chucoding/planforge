#!/usr/bin/env python3
"""PlanForge CLI entry point."""

import click
from planforge.commands.init import run_init
from planforge.commands.doctor import run_doctor
from planforge.commands.install import run_install


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


if __name__ == "__main__":
    main()
