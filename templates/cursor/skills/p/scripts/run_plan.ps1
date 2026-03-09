# Run plan command (Windows). Called from Cursor /p with user goal as arguments.
# If .cursor/chat-context.txt exists, pass it as conversation context to the planner.
$ErrorActionPreference = "Stop"
if (Test-Path ".cursor/chat-context.txt") {
    & planforge plan --context-file .cursor/chat-context.txt @args
} else {
    & planforge plan @args
}
exit $LASTEXITCODE
