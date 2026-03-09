# Run plan command (Windows). Called from Cursor /p with user goal as arguments.
# If .cursor/context exists, pass it as markdown context directory.
$ErrorActionPreference = "Stop"
if (Test-Path -PathType Container ".cursor/context") {
    & planforge plan --context-dir .cursor/context @args
} else {
    & planforge plan @args
}
exit $LASTEXITCODE
