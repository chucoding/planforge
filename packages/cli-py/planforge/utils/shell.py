"""Shell / process utilities (run claude, codex, etc.)."""

import os
import subprocess
import shutil
from pathlib import Path


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


def get_npm_global_exe_candidates(cmd: str) -> list[str]:
    """Common npm global install locations (for sandboxed environments where PATH may be restricted)."""
    if os.name == "nt":
        candidates = []
        app_data = os.environ.get("APPDATA")
        local_app_data = os.environ.get("LOCALAPPDATA")
        if app_data:
            candidates.append(str(Path(app_data) / "npm" / f"{cmd}.cmd"))
            candidates.append(str(Path(app_data) / "npm" / cmd))
        if local_app_data:
            candidates.append(str(Path(local_app_data) / "npm" / f"{cmd}.cmd"))
            candidates.append(str(Path(local_app_data) / "npm" / cmd))
        return candidates
    home = os.environ.get("HOME")
    if not home:
        return []
    return [
        str(Path(home) / ".npm-global" / "bin" / cmd),
        str(Path(home) / ".local" / "bin" / cmd),
        str(Path(home) / "npm" / "bin" / cmd),
        f"/usr/local/bin/{cmd}",
    ]


def resolve_command_path_with_npm_fallback(cmd: str) -> str | None:
    """Resolve full path to command: try PATH first, then common npm global locations.
    Works in sandboxed environments (e.g. Cursor agent) where PATH may not include npm global bin.
    """
    exe = shutil.which(cmd)
    if exe:
        return exe
    for path in get_npm_global_exe_candidates(cmd):
        if os.path.isfile(path):
            return path
    return None
