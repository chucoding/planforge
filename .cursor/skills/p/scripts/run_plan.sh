#!/usr/bin/env bash
# Run plan command (Claude provider). Called from Cursor /p with user goal as arguments.
set -e
exec planforge plan "$@"
