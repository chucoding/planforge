# Run implement command (Windows). Called from Cursor /i with user prompt as arguments.
# If .cursor/context exists, pass it as markdown context directory.
$ErrorActionPreference = "Stop"
if (Test-Path -PathType Container ".cursor/context") {
    & planforge implement --context-dir .cursor/context @args
} else {
    & planforge implement @args
}
exit $LASTEXITCODE
