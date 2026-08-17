#!/usr/bin/env python3
"""Parse-coverage report for the UniVerse BASIC tree-sitter grammar.

Runs the compiled grammar over one or more PickBasic / UniVerse BASIC files and
reports how much of each file the grammar actually understands. Intended both
as a developer loop ("did my grammar change help?") and as a CI gate.

Usage
-----
    python tools/parse_report.py examples
    python tools/parse_report.py examples/NVLG2415V.bas --show-errors
    python tools/parse_report.py examples --max-error-pct 5      # CI gate
    python tools/parse_report.py examples --json

The grammar defaults to dist/grammars/compiled/pickbasic.so; override with
--grammar / --symbol.

Exit status is non-zero when any file exceeds --max-error-pct, so this can be
wired straight into CI.
"""

from __future__ import annotations

import argparse
import bisect
import ctypes
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

try:
    from tree_sitter import Language, Parser
except ImportError:  # pragma: no cover
    sys.exit("tree_sitter not installed. pip install 'tree-sitter>=0.25.2,<0.26.0'")

DEFAULT_SYMBOL = "tree_sitter_universe_basic"
GRAMMAR_DIR = Path(__file__).resolve().parent.parent / "dist" / "grammars" / "compiled"

# Native extension first, then the others so a partially-built dist still
# produces the "wrong platform" message below rather than "not found".
_EXT_BY_PLATFORM = {
    "win32": (".dll", ".so", ".dylib"),
    "darwin": (".dylib", ".so", ".dll"),
}


def default_grammar() -> Path:
    for ext in _EXT_BY_PLATFORM.get(sys.platform, (".so", ".dylib", ".dll")):
        candidate = GRAMMAR_DIR / f"pickbasic{ext}"
        if candidate.exists():
            return candidate
    return GRAMMAR_DIR / "pickbasic.so"

# Files with these suffixes (or no suffix at all, the UniVerse norm) are parsed.
SOURCE_SUFFIXES = {".bas", ".b", ".bp", ""}
SKIP_NAMES = {".DS_Store"}

# Declarations that expose a `name` field — used to show what the grammar
# recognises structurally, which is what downstream chunk naming depends on.
NAMED_DECLARATIONS = (
    "program_statement",
    "subroutine_statement",
    "function_statement",
    "deffun_statement",
    "equate_statement",
)


@dataclass
class FileReport:
    path: str
    total_lines: int
    total_bytes: int
    error_nodes: int
    error_bytes: int
    error_lines: list[int] = field(default_factory=list)
    declarations: list[str] = field(default_factory=list)
    node_count: int = 0

    @property
    def error_byte_pct(self) -> float:
        return 100.0 * self.error_bytes / self.total_bytes if self.total_bytes else 0.0

    @property
    def error_line_pct(self) -> float:
        return 100.0 * len(self.error_lines) / self.total_lines if self.total_lines else 0.0

    def to_dict(self) -> dict:
        return {
            "path": self.path,
            "total_lines": self.total_lines,
            "total_bytes": self.total_bytes,
            "node_count": self.node_count,
            "error_nodes": self.error_nodes,
            "error_bytes": self.error_bytes,
            "error_byte_pct": round(self.error_byte_pct, 3),
            "error_line_pct": round(self.error_line_pct, 3),
            "error_lines": self.error_lines,
            "declarations": self.declarations,
        }


def load_language(grammar_path: Path, symbol: str) -> Language:
    """Load a compiled grammar, failing with an actionable message.

    The stock loader hands the file straight to ctypes, so a wrong-platform
    binary surfaces as a bare 'invalid ELF header' from deep inside a call
    stack. Check the magic bytes up front instead.
    """
    if not grammar_path.exists():
        sys.exit(f"grammar not found: {grammar_path}\nRun ./tools/build.sh first.")

    magic = grammar_path.open("rb").read(4)
    kinds = {
        b"\x7fELF": "ELF (Linux)",
        b"\xcf\xfa\xed\xfe": "Mach-O 64-bit (macOS)",
        b"\xca\xfe\xba\xbe": "Mach-O universal (macOS)",
        b"MZ": "PE/DLL (Windows)",
    }
    expected = {"linux": b"\x7fELF", "win32": b"MZ", "darwin": b"\xcf\xfa\xed\xfe"}
    want = next((v for k, v in expected.items() if sys.platform.startswith(k)), None)
    if want and not magic.startswith(want):
        kind = next((v for k, v in kinds.items() if magic.startswith(k)), f"unknown ({magic!r})")
        sys.exit(
            f"{grammar_path} is {kind}, which cannot be loaded on {sys.platform}.\n"
            "Rebuild for this platform: ./tools/build.sh (adds --windows for a DLL),\n"
            "or run the report in the build container: ./tools/report.sh <path>"
        )

    lib = ctypes.cdll.LoadLibrary(str(grammar_path))
    try:
        fn = getattr(lib, symbol)
    except AttributeError:
        sys.exit(f"symbol {symbol!r} not exported by {grammar_path}")
    fn.restype = ctypes.c_void_p
    return Language(fn())


def line_index(src: bytes) -> list[int]:
    starts = [0]
    for i, b in enumerate(src):
        if b == 0x0A:
            starts.append(i + 1)
    return starts


def analyse(parser: Parser, path: Path) -> FileReport:
    src = path.read_bytes()
    tree = parser.parse(src)
    starts = line_index(src)
    to_line = lambda off: bisect.bisect_right(starts, off)  # noqa: E731

    errors: list = []
    declarations: list[str] = []
    node_count = 0

    def walk(node) -> None:
        nonlocal node_count
        node_count += 1
        if node.type == "ERROR" or node.is_missing:
            errors.append(node)
        elif node.type in NAMED_DECLARATIONS:
            name_node = node.child_by_field_name("name")
            if name_node is not None:
                declarations.append(
                    f"{node.type}:{src[name_node.start_byte:name_node.end_byte].decode('utf-8', 'replace')}"
                )
        for child in node.children:
            walk(child)

    walk(tree.root_node)

    error_bytes: set[int] = set()
    for node in errors:
        error_bytes.update(range(node.start_byte, node.end_byte))

    total_lines = src.count(b"\n") or 1
    return FileReport(
        path=str(path),
        total_lines=total_lines,
        total_bytes=len(src),
        node_count=node_count,
        error_nodes=len(errors),
        error_bytes=len(error_bytes),
        error_lines=sorted({to_line(o) for o in error_bytes}),
        declarations=declarations,
    )


def collect(targets: list[str]) -> list[Path]:
    out: list[Path] = []
    for target in targets:
        p = Path(target)
        if p.is_dir():
            out.extend(
                f
                for f in sorted(p.rglob("*"))
                if f.is_file() and f.name not in SKIP_NAMES and f.suffix.lower() in SOURCE_SUFFIXES
            )
        elif p.is_file():
            out.append(p)
        else:
            sys.exit(f"no such file or directory: {target}")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("targets", nargs="+", help="PickBasic files or directories")
    ap.add_argument("--grammar", default=None,
                    help="compiled grammar path (default: auto-select from dist/ for this platform)")
    ap.add_argument("--symbol", default=DEFAULT_SYMBOL)
    ap.add_argument("--show-errors", action="store_true", help="print each error line with its source")
    ap.add_argument("--show-declarations", action="store_true", help="print declarations found via field('name')")
    ap.add_argument("--max-error-pct", type=float, default=None,
                    help="exit non-zero if any file exceeds this error-byte %%")
    ap.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    args = ap.parse_args()

    grammar_path = Path(args.grammar) if args.grammar else default_grammar()
    parser = Parser(load_language(grammar_path, args.symbol))
    files = collect(args.targets)
    if not files:
        sys.exit("no source files matched")

    reports = [analyse(parser, f) for f in files]

    if args.json:
        print(json.dumps([r.to_dict() for r in reports], indent=2))
    else:
        print(f"{'FILE':<34} {'LINES':>6} {'NODES':>7} {'ERRNODES':>9} {'ERR BYTES':>10} {'ERR LINES':>10}")
        print("-" * 82)
        for r in reports:
            print(
                f"{Path(r.path).name:<34} {r.total_lines:>6} {r.node_count:>7} "
                f"{r.error_nodes:>9} {r.error_byte_pct:>9.2f}% {r.error_line_pct:>9.2f}%"
            )
        total_bytes = sum(r.total_bytes for r in reports)
        total_err = sum(r.error_bytes for r in reports)
        print("-" * 82)
        print(f"{'TOTAL':<34} {sum(r.total_lines for r in reports):>6} "
              f"{sum(r.node_count for r in reports):>7} {sum(r.error_nodes for r in reports):>9} "
              f"{100.0 * total_err / total_bytes if total_bytes else 0:>9.2f}%")

        for r in reports:
            if args.show_declarations and r.declarations:
                print(f"\n{Path(r.path).name} declarations:")
                for d in r.declarations:
                    print(f"   {d}")
            if args.show_errors and r.error_lines:
                print(f"\n{Path(r.path).name} error lines:")
                src_lines = Path(r.path).read_text(encoding="utf-8", errors="replace").split("\n")
                for ln in r.error_lines:
                    print(f"   {ln:>5}| {src_lines[ln - 1][:100]}")

    if args.max_error_pct is not None:
        over = [r for r in reports if r.error_byte_pct > args.max_error_pct]
        if over:
            print(f"\nFAIL: {len(over)} file(s) above {args.max_error_pct}% error bytes:", file=sys.stderr)
            for r in over:
                print(f"   {r.path}  {r.error_byte_pct:.2f}%", file=sys.stderr)
            return 1
        print(f"\nPASS: all files at or below {args.max_error_pct}% error bytes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
