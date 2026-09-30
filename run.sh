#!/usr/bin/env bash
# VANISKARA test runner — bundles the TS sources, then runs the assertions.
#   bash tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."

npx esbuild src/game/Game.ts   --bundle --format=esm --outfile=tests/game_bundle.mjs   --log-level=error
npx esbuild src/game/share.ts  --bundle --format=esm --outfile=tests/share_bundle.mjs  --log-level=error
npx esbuild src/game/save.ts   --bundle --format=esm --outfile=tests/save_bundle.mjs   --log-level=error

node tests/suite.mjs

# Bundles are build artefacts — keep the tree clean.
rm -f tests/game_bundle.mjs tests/share_bundle.mjs tests/save_bundle.mjs
