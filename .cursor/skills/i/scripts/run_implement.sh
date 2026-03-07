#!/usr/bin/env bash
# Run implement command (uses implementer from planforge.json). Called from Cursor /i with user prompt as arguments.
# If .cursor/chat-context.txt exists, pass it as conversation context to the implementer.
set -e
if [ -f .cursor/chat-context.txt ]; then
  exec planforge implement --context-file .cursor/chat-context.txt "$@"
else
  exec planforge implement "$@"
fi
