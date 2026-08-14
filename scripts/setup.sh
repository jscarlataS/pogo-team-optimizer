#!/usr/bin/env bash
# Bootstrap a fresh checkout of this repo on a new machine.
#
# Everything this script creates is gitignored and reproducible, which is why
# it is not committed: node_modules/ (~78M) and vendor/pvpoke/ (~148M).
# The only thing it CANNOT create is your Poke Genie export — see README.md.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# The vendored PvPoke commit. Keep this in sync with the pin recorded in
# docs/reference/data-sources.md — that doc is the authority for what our
# parsers were verified against, and PvPoke's data shapes shift over time.
PVPOKE_COMMIT="e5ee9b76725c4375180727a5c17ef446e1c58347"
PVPOKE_REMOTE="https://github.com/pvpoke/pvpoke.git"
VENDOR_DIR="vendor/pvpoke"

echo "==> Node toolchain"
if ! command -v node >/dev/null 2>&1; then
  echo "    Node is not installed (need >= 20)." >&2
  echo "    Either use your package manager, or install user-locally without sudo:" >&2
  echo "      curl -fsSLO https://nodejs.org/dist/latest-v24.x/node-v24.x.y-linux-x64.tar.xz" >&2
  echo "      (pick the real filename from https://nodejs.org/dist/latest-v24.x/)" >&2
  echo "      mkdir -p ~/.local/node && tar -xJf node-*.tar.xz -C ~/.local/node --strip-components=1" >&2
  echo "      ln -s ~/.local/node/bin/{node,npm,npx} ~/.local/bin/" >&2
  exit 1
fi
node -v
npm -v

echo
echo "==> Installing dependencies (npm ci)"
npm ci

echo
echo "==> Vendoring PvPoke @ ${PVPOKE_COMMIT:0:10}"
if [ -d "$VENDOR_DIR/.git" ] && \
   [ "$(git -C "$VENDOR_DIR" rev-parse HEAD 2>/dev/null)" = "$PVPOKE_COMMIT" ]; then
  echo "    already at the pinned commit — skipping"
else
  rm -rf "$VENDOR_DIR"
  mkdir -p "$VENDOR_DIR"

  # Partial + shallow + sparse: we only need src/data (gamemaster, rankings)
  # and src/js (Battle.js and friends). The PHP views are dead weight.
  # Fetching the SHA directly rather than cloning a branch keeps the pin exact
  # even though PvPoke's master moves frequently.
  git -C "$VENDOR_DIR" init -q
  git -C "$VENDOR_DIR" remote add origin "$PVPOKE_REMOTE"
  git -C "$VENDOR_DIR" config core.sparseCheckout true
  git -C "$VENDOR_DIR" config core.sparseCheckoutCone true
  git -C "$VENDOR_DIR" sparse-checkout set src/data src/js
  git -C "$VENDOR_DIR" fetch -q --depth 1 --filter=blob:none origin "$PVPOKE_COMMIT"
  git -C "$VENDOR_DIR" checkout -q FETCH_HEAD
fi

echo
echo "==> Verifying the vendored tree"
for required in \
  "$VENDOR_DIR/src/data/gamemaster.json" \
  "$VENDOR_DIR/src/js/battle/Battle.js"
do
  if [ ! -f "$required" ]; then
    echo "    MISSING: $required" >&2
    echo "    The vendor layout changed. Re-verify against docs/reference/data-sources.md." >&2
    exit 1
  fi
  echo "    ok: $required"
done

echo
echo "==> Checking for a roster CSV"
if compgen -G "data/*.csv" > /dev/null; then
  for csv in data/*.csv; do
    echo "    found: $csv ($(wc -l < "$csv" | tr -d ' ') lines)"
  done
else
  echo "    none yet — drop your Poke Genie export in data/ (see README.md)."
fi

echo
echo "==> Setup complete. Next:"
echo "    npm test        # expect the suite green"
echo "    npm run optimize -- --roster data/<your-export>.csv"
