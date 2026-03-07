#!/usr/bin/env bash
# Run plan command (Claude provider). Called from Cursor /p with user goal as arguments.
# If .cursor/chat-context.txt exists, pass it as conversation context to the planner.
set -e
if [ -f .cursor/chat-context.txt ]; then
  exec planforge plan --context-file .cursor/chat-context.txt "$@"
else
  exec planforge plan "$@"
fi
