#!/usr/bin/env bash
# Build the UniVerse BASIC tree-sitter grammar into a drop-in artifact for the
# NovoLingo gen_ai chunker.
#
#   ./tools/build.sh              # generate + compile + package + verify
#   ./tools/build.sh --skip-gen   # reuse existing src/parser.c
#
# Output (mirrors gen_ai/libs/src/libs/utils/chunker/grammars/):
#   dist/grammars/compiled/pickbasic.so
#   dist/grammars/compiled/pickbasic.meta.json
#
# Two stages, because the toolchains disagree on glibc:
#   1. GENERATE  node:22-trixie            tree-sitter-cli >= 0.26 needs glibc >= 2.39
#   2. COMPILE   python:3.11.9-slim-bookworm   matches the gen_ai runtime (glibc 2.36)
#
# Compiling on the newer base would produce a shared object the production
# image cannot load — the exact failure mode this build replaces.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Docker needs a native path. Git Bash / MSYS reports /c/... which the daemon
# rejects, and it also rewrites bare container paths like -w /work, so mounts
# are built from `pwd -W` and MSYS_NO_PATHCONV is set for the docker calls.
MOUNT_ROOT="$ROOT"
if command -v cygpath >/dev/null 2>&1; then
  MOUNT_ROOT="$(pwd -W 2>/dev/null || echo "$ROOT")"
  export MSYS_NO_PATHCONV=1
fi

GEN_IMAGE="node:22-trixie"
BUILD_IMAGE="ub-grammar-build"
SYMBOL="tree_sitter_universe_basic"
OUT_DIR="dist/grammars/compiled"
OUT_NAME="pickbasic"          # the language_id gen_ai's GrammarResolver looks up

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }

# --- stage 0: build image -----------------------------------------------------
log "building compile/test image ($BUILD_IMAGE)"
docker build -q -f tools/Dockerfile.build -t "$BUILD_IMAGE" tools/ >/dev/null

# --- stage 1: generate parser.c ----------------------------------------------
if [[ "${1:-}" != "--skip-gen" ]]; then
  log "generating src/parser.c from grammar.js ($GEN_IMAGE)"
  docker run --rm -v "$MOUNT_ROOT:/g" -w /g "$GEN_IMAGE" \
    bash -c "npm install --no-audit --no-fund --silent && npx tree-sitter generate"
else
  log "skipping generate (--skip-gen)"
fi

[[ -f src/parser.c ]] || { echo "src/parser.c missing — run without --skip-gen"; exit 1; }

ABI="$(grep -m1 'define LANGUAGE_VERSION' src/parser.c | awk '{print $3}')"
log "grammar ABI version: $ABI"
if [[ "$ABI" -lt 13 || "$ABI" -gt 15 ]]; then
  echo "ERROR: ABI $ABI outside the 13-15 range supported by py-tree-sitter 0.25.x" >&2
  exit 1
fi

# --- stage 2: compile + package ----------------------------------------------
mkdir -p "$OUT_DIR"
log "compiling $OUT_DIR/$OUT_NAME.so (linux/amd64, glibc 2.36)"
docker run --rm -v "$MOUNT_ROOT:/work" -w /work "$BUILD_IMAGE" bash -c "
  set -e
  gcc -shared -fPIC -O2 -I src -o '$OUT_DIR/$OUT_NAME.so' src/parser.c
  file '$OUT_DIR/$OUT_NAME.so'

  # Windows DLL, cross-compiled from the same container. This is a developer
  # convenience only — production loads the .so. Without it, Windows machines
  # cannot run tools/parse_report.py natively, because the resolver on win32
  # tries .dll first and a mislabelled ELF fails with a bare WinError 193.
  # -static-libgcc avoids a runtime dependency on libgcc_s_seh-1.dll.
  x86_64-w64-mingw32-gcc -shared -O2 -I src -static-libgcc \
    -o '$OUT_DIR/$OUT_NAME.dll' src/parser.c -Wl,--export-all-symbols
  file '$OUT_DIR/$OUT_NAME.dll'
"

cat > "$OUT_DIR/$OUT_NAME.meta.json" <<JSON
{
  "symbol": "$SYMBOL",
  "abi_version": $ABI
}
JSON
log "wrote $OUT_DIR/$OUT_NAME.meta.json"

# --- stage 3: verify it loads and parses --------------------------------------
log "verifying the artifact loads and parses"
docker run --rm -v "$MOUNT_ROOT:/work" -w /work "$BUILD_IMAGE" \
  python tools/parse_report.py --grammar "$OUT_DIR/$OUT_NAME.so" --symbol "$SYMBOL" examples

log "done — drop $OUT_DIR/ into gen_ai/libs/src/libs/utils/chunker/grammars/"
