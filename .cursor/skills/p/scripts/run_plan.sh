#!/usr/bin/env bash
# Run plan command (provider from planforge.json). Called from Cursor /p with user goal as arguments.
# Context dir is taken from planforge.json (contextDir) or CLI default; do not hard-code it here.
set -e
exec planforge plan "$@"
