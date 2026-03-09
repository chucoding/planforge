# Run implement command (Windows). Called from Cursor /i with user prompt as arguments.
# If .cursor/chat-context.txt exists, pass it as conversation context to the implementer.
$ErrorActionPreference = "Stop"
if (Test-Path ".cursor/chat-context.txt") {
    & planforge implement --context-file .cursor/chat-context.txt @args
} else {
    & planforge implement @args
}
exit $LASTEXITCODE
