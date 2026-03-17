# Run plan command (Windows). Called from Cursor /p with user goal as arguments.
# Context dir is taken from planforge.json (contextDir) or CLI default; do not hard-code it here.
$ErrorActionPreference = "Stop"
& planforge plan @args
exit $LASTEXITCODE
