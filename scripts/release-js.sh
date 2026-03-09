#!/usr/bin/env bash
# Prepare PlanForge CLI (JS/Node) release metadata.
# npm publish is handled by GitHub Actions on pushed v* tags.

set -euo pipefail
cd "$(dirname "$0")/.."

BUMP_TYPE="${1:-patch}"

if ! [[ "$BUMP_TYPE" =~ ^(patch|minor|major|prepatch|preminor|premajor|prerelease)$ ]]; then
  echo "Usage: $0 [patch|minor|major|prepatch|preminor|premajor|prerelease]"
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit or stash changes before release."
  exit 1
fi

echo "Validating Cursor assets..."
node scripts/validate_cursor_assets.mjs

echo "Bumping packages/cli-js version (${BUMP_TYPE})..."
cd packages/cli-js
npm version "$BUMP_TYPE" --no-git-tag-version
VERSION="$(node -p "require('./package.json').version")"
cd ../..

echo "Committing and tagging v${VERSION}..."
git add packages/cli-js/package.json
git commit -m "chore(cli-js): release v${VERSION}"
git tag "v${VERSION}"

echo "Pushing commit and tag..."
git push origin HEAD
git push origin "v${VERSION}"

echo "Release prepared: v${VERSION}"
echo "GitHub Actions will publish planforge to npm when the v${VERSION} tag workflow runs."