#!/usr/bin/env bash
#
# Bump the platform version, write the changelog entry, and tag the release.
#
# This script does not push and does not deploy. Pushing is a separate
# deliberate act, and deploying is scripts/cutover.sh.
#
# Usage: scripts/bump-version.sh <patch|minor|major>
set -euo pipefail

LEVEL="${1:?usage: bump-version.sh <patch|minor|major>}"

case "$LEVEL" in
  patch|minor|major) ;;
  *) echo "error: level must be patch, minor or major" >&2; exit 1 ;;
esac

# A bump on a dirty tree tags a commit that does not match what was tested.
if [ -n "$(git status --porcelain)" ]; then
  echo "error: working tree is dirty, commit or stash first" >&2
  exit 1
fi

# A bump off main tags work that was never reviewed.
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" != "main" ]; then
  echo "error: releases are cut from main, currently on ${BRANCH}" >&2
  exit 1
fi

CURRENT="$(node -e "import('./scripts/version.js').then(m => console.log(m.readVersions().root))")"
NEXT="$(node -e "import('./scripts/version.js').then(m => console.log(m.nextVersion('${CURRENT}', '${LEVEL}')))")"

echo "bumping ${CURRENT} to ${NEXT}"

node -e "import('./scripts/version.js').then(m => m.writeVersion('${NEXT}'))"

# Insert a dated section directly beneath the Unreleased heading.
TODAY="$(date +%Y-%m-%d)"
TMP="$(mktemp)"
awk -v ver="$NEXT" -v day="$TODAY" '
  { print }
  /^## Unreleased$/ && !done { print ""; print "## " ver " (" day ")"; print ""; print "- "; done = 1 }
' CHANGELOG.md > "$TMP"
mv "$TMP" CHANGELOG.md

"${EDITOR:-vi}" CHANGELOG.md

git add package.json server/package.json client/package.json CHANGELOG.md
git commit -m "release: v${NEXT}"
git tag -a "v${NEXT}" -m "v${NEXT}"

echo "tagged v${NEXT}"
echo "next: git push && git push origin v${NEXT}, then scripts/cutover.sh v${NEXT}"
