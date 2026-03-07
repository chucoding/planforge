"""Codex provider - implementation (e.g. /i)."""

from planforge.utils.shell import has_command


def check_codex() -> bool:
    return has_command("codex")


def run_implement(prompt: str, opts: dict | None = None) -> str:
    # v0.2
    return prompt
