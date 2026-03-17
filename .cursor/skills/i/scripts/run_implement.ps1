# Run implement command (Windows). Called from Cursor /i with user prompt as arguments.
# Context dir is taken from planforge.json (contextDir) or CLI default; do not hard-code it here.
$ErrorActionPreference = "Stop"
& planforge implement @args
exit $LASTEXITCODE
