#!/usr/bin/env bash
# Run implement command (uses implementer from planforge.json). Called from Cursor /i with user prompt as arguments.
# If .cursor/context exists, pass it as markdown context directory.
set -e
if [ -d .cursor/context ]; then
  exec planforge implement --context-dir .cursor/context "$@"
else
  exec planforge implement "$@"
fi
