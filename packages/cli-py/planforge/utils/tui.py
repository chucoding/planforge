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
