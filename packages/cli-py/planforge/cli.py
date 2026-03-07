#!/usr/bin/env python3
"""PlanForge CLI entry point."""

import sys
from planforge.commands.init import run_init
from planforge.commands.doctor import run_doctor
from planforge.commands.install import run_install


def main() -> None:
    args = sys.argv[1:]
    if not args:
        print("Usage: planforge <init|doctor|install> [options]")
        sys.exit(1)
    cmd, rest = args[0], args[1:]
    if cmd == "init":
        run_init(rest)
    elif cmd == "doctor":
        run_doctor(rest)
    elif cmd == "install":
        run_install(rest)
    else:
        print("Usage: planforge <init|doctor|install> [options]")
        sys.exit(1)


if __name__ == "__main__":
    main()
