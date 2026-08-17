#!/usr/bin/env bash
# Run the parse-coverage report against local UniVerse BASIC source.
#
#   ./tools/report.sh <file-or-directory> [parse_report.py options...]
#
# Examples:
#   ./tools/report.sh examples
#   ./tools/report.sh ~/code/NVLG2415V --show-errors
#   ./tools/report.sh /d/uv/PROGRAMS --max-error-pct 5
#   ./tools/report.sh ~/code/NVLG2415V --json > report.json
#
# The compiled grammar is a linux/amd64 ELF, so it cannot be loaded by a native
# Windows or macOS Python. This wrapper runs the report inside the same image
# the grammar is built against and mounts the target read-only, so the same
# command works identically on every host.
#
# The target may live anywhere on disk — it does not need to be inside the repo.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_IMAGE="ub-grammar-build"
GRAMMAR="dist/grammars/compiled/pickbasic.so"

if [[ $# -lt 1 ]]; then
  sed -n '2,18p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 2
fi

TARGET="$1"; shift

[[ -e "$TARGET" ]] || { echo "no such file or directory: $TARGET" >&2; exit 1; }
[[ -f "$ROOT/$GRAMMAR" ]] || { echo "grammar not built — run ./tools/build.sh first" >&2; exit 1; }

# Split the target into a directory to mount and the name to report on, so a
# single file can be mounted without exposing its whole parent tree by accident.
if [[ -d "$TARGET" ]]; then
  HOST_DIR="$(cd "$TARGET" && pwd)"
  IN_CONTAINER="/corpus"
else
  HOST_DIR="$(cd "$(dirname "$TARGET")" && pwd)"
  IN_CONTAINER="/corpus/$(basename "$TARGET")"
fi

# Docker needs native paths; Git Bash/MSYS reports /c/... and rewrites bare
# container paths, so convert the mounts and disable the rewriting.
MOUNT_ROOT="$ROOT"
MOUNT_DIR="$HOST_DIR"
if command -v cygpath >/dev/null 2>&1; then
  MOUNT_ROOT="$(cygpath -w "$ROOT")"
  MOUNT_DIR="$(cygpath -w "$HOST_DIR")"
  export MSYS_NO_PATHCONV=1
fi

if ! docker image inspect "$BUILD_IMAGE" >/dev/null 2>&1; then
  echo "==> building $BUILD_IMAGE (first run only)"
  docker build -q -f "$ROOT/tools/Dockerfile.build" -t "$BUILD_IMAGE" "$ROOT/tools" >/dev/null
fi

exec docker run --rm \
  -v "${MOUNT_ROOT}:/work:ro" \
  -v "${MOUNT_DIR}:/corpus:ro" \
  -w /work \
  "$BUILD_IMAGE" \
  python tools/parse_report.py "$IN_CONTAINER" --grammar "$GRAMMAR" "$@"
