# Run implement command (Windows). Called from Cursor /i with user prompt as arguments.
# If .cursor/chat-context.txt exists as a file, pass it as conversation context to the implementer.
# Use -PathType Leaf so we only pass regular files (matches bash [ -f ... ]); passing a directory would fail.
$ErrorActionPreference = "Stop"
if (Test-Path -PathType Leaf ".cursor/chat-context.txt") {
    & planforge implement --context-file .cursor/chat-context.txt @args
} else {
    & planforge implement @args
}
exit $LASTEXITCODE
