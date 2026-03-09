# Run plan command (Windows). Called from Cursor /p with user goal as arguments.
# If .cursor/chat-context.txt exists as a file, pass it as conversation context to the planner.
# Use -PathType Leaf so we only pass regular files (matches bash [ -f ... ]); passing a directory would fail.
$ErrorActionPreference = "Stop"
if (Test-Path -PathType Leaf ".cursor/chat-context.txt") {
    & planforge plan --context-file .cursor/chat-context.txt @args
} else {
    & planforge plan @args
}
exit $LASTEXITCODE
