#!/usr/bin/env bash
# Run implement command (uses implementer from planforge.json). Called from Cursor /i with user prompt as arguments.
# Context dir is taken from planforge.json (contextDir) or CLI default; do not hard-code it here.
set -e
exec planforge implement "$@"
