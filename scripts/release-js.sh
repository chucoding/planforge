#!/usr/bin/env bash
# Release PlanForge CLI (JS/Node)

set -e
cd "$(dirname "$0")/.."

echo "Validating Cursor assets..."
node scripts/validate_cursor_assets.mjs

echo "Release JS package..."
# cd packages/cli-js && npm version patch && npm publish
echo "Done."
