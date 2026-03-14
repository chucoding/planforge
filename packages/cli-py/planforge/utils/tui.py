"""Shared TUI key handling for arrow-key selection (doctor, model commands)."""

import sys

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


def select_from_list(
    items: list[tuple[str, object]],
    prompt: str,
    *,
    quit_label: str = "Quit",
    initial_index: int = 0,
) -> object | None:
    """Show list with arrow keys; Enter selects, Quit row or key returns None. items = [(label, value), ...]."""
    if not items:
        return None
    total_rows = len(items) + 1
    index = max(0, min(initial_index, len(items) - 1))
    print(f"\n  {prompt}\n")
    while True:
        for i, (label, _) in enumerate(items):
            prefix = "  > " if i == index else "    "
            print(f"{prefix}{label}")
        prefix = "  > " if index == len(items) else "    "
        print(f"{prefix}{quit_label}")
        key = wait_key()
        if key == "quit":
            return None
        if key == "enter":
            if index == len(items):
                return None
            return items[index][1]
        if key == "up":
            index = (index - 1) % total_rows
        elif key == "down":
            index = (index + 1) % total_rows
        sys.stdout.write(f"\033[{total_rows}A\033[0J")
        sys.stdout.flush()


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
