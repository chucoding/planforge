"""Shell / process utilities (run claude, codex, etc.)."""

import subprocess
import shutil


def run_command(cmd: str, args: list[str], cwd: str | None = None) -> str:
    result = subprocess.run(
        [cmd, *args],
        capture_output=True,
        text=True,
        cwd=cwd,
    )
    result.check_returncode()
    return (result.stdout or "").strip()


def has_command(cmd: str) -> bool:
    return shutil.which(cmd) is not None
