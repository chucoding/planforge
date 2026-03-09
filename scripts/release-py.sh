#!/usr/bin/env bash
# Release PlanForge CLI (Python)

set -e
cd "$(dirname "$0")/.."

echo "Validating Cursor assets..."
node scripts/validate_cursor_assets.mjs

echo "Release Python package..."
# cd packages/cli-py && hatch build && hatch publish
echo "Done."
