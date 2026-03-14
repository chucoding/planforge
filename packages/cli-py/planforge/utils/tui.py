"""Shared TUI key handling for arrow-key selection (doctor, model commands)."""

import readchar


def _normalize_key(key: str) -> str | None:
    """Map readchar key or escape sequence to up/down/left/right/enter/quit."""
    if key in ("\r", "\n"):
        return "enter"
    key_mod = getattr(readchar, "key", None)
    up = getattr(key_mod, "UP", None) if key_mod else None
    down = getattr(key_mod, "DOWN", None) if key_mod else None
    left = getattr(key_mod, "LEFT", None) if key_mod else None
    right = getattr(key_mod, "RIGHT", None) if key_mod else None
    if key in ("\x1b[A", "w", "k") or key == up:
        return "up"
    if key in ("\x1b[B", "s", "j") or key == down:
        return "down"
    if key in ("\x1b[D", "a", "h") or key == left:
        return "left"
    if key in ("\x1b[C", "d", "l") or key == right:
        return "right"
    if key == "\x03":  # Ctrl+C
        return "quit"
    return None


def wait_key() -> str | None:
    """Read one key and return up/down/left/right/enter/quit or None."""
    try:
        key = readchar.readkey()
    except KeyboardInterrupt:
        return "quit"
    return _normalize_key(key)


def _format_role_line(role: str, role_config: dict) -> str:
    """Format a single role line for Current AI config display."""
    provider = role_config.get("provider", "")
    model = role_config.get("model", "")
    extra = ""
    if role_config.get("effort") is not None:
        extra = f" (effort: {role_config['effort']})"
    elif role_config.get("reasoning") is not None:
        extra = f" (reasoning: {role_config['reasoning']})"
    return f"  {role.ljust(12)}: {provider.ljust(6)} / {model.ljust(20)}{extra}"


def print_current_ai_config(
    config: dict,
    heading: str = "Current AI config",
) -> None:
    """Print planner/implementer config block (e.g. at start of planforge model)."""
    print(f"\n  {heading}")
    print(f"  {'-' * len(heading)}")
    print(_format_role_line("planner", config.get("planner", {})))
    print(_format_role_line("implementer", config.get("implementer", {})))
