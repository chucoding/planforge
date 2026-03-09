#!/usr/bin/env bash
# Run plan command (provider from planforge.json). Called from Cursor /p with user goal as arguments.
# If .cursor/context exists, pass it as markdown context directory.
set -e
if [ -d .cursor/context ]; then
  exec planforge plan --context-dir .cursor/context "$@"
else
  exec planforge plan "$@"
fi
