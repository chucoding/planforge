"""Claude provider - planning (e.g. /p)."""

from planforge.utils.shell import has_command


def check_claude() -> bool:
    return has_command("claude")


def run_plan(prompt: str, opts: dict | None = None) -> str:
    # Plan generation is implemented in Node CLI for MVP
    return prompt
