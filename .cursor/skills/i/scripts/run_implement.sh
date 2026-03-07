#!/usr/bin/env bash
# Run implement command (uses implementer from planforge.json). Called from Cursor /i with user prompt as arguments.
set -e
exec planforge implement "$@"
