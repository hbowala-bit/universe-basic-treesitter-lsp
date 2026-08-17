#!/usr/bin/env python3
"""One-command parse check for a local UniVerse BASIC file or folder.

    python tools/check.py "C:\\path\\to\\MYPROGRAM"
    python tools/check.py /path/to/PROGRAMS
    python tools/check.py ~/code/PROG --quiet

Thin wrapper over tools/parse_report.py: picks the grammar for this platform,
turns on error listing by default, and prints a plain verdict. Use
parse_report.py directly for JSON, CI thresholds, or declaration dumps.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from parse_report import (  # noqa: E402
    DEFAULT_SYMBOL,
    analyse,
    collect,
    default_grammar,
    load_language,
)

try:
    from tree_sitter import Parser  # noqa: E402
except ImportError:
    sys.exit(
        'tree_sitter is not installed.\n'
        '    pip install "tree-sitter>=0.25.2,<0.26.0"'
    )


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    quiet = "--quiet" in sys.argv or "-q" in sys.argv

    if not args:
        print(__doc__)
        return 2

    grammar = default_grammar()
    if not grammar.exists():
        sys.exit(
            f"compiled grammar not found at {grammar}\n"
            "Build it first:\n"
            "    ./tools/build.sh"
        )

    parser = Parser(load_language(grammar, DEFAULT_SYMBOL))
    files = collect(args)
    if not files:
        sys.exit("no UniVerse BASIC files matched (.bas, .b, .bp, or no extension)")

    print(f"grammar: {grammar.name}   files: {len(files)}\n")

    worst = 0.0
    for report in (analyse(parser, f) for f in files):
        worst = max(worst, report.error_byte_pct)
        name = Path(report.path).name
        if report.error_nodes == 0:
            print(f"  OK    {name}  ({report.total_lines} lines, fully parsed)")
            continue

        print(
            f"  WARN  {name}  ({report.total_lines} lines): "
            f"{report.error_nodes} error node(s), {report.error_byte_pct:.2f}% of bytes unparsed"
        )
        if not quiet:
            src_lines = Path(report.path).read_text(encoding="utf-8", errors="replace").split("\n")
            for ln in report.error_lines:
                print(f"        {ln:>5} | {src_lines[ln - 1].rstrip()[:96]}")

    print()
    if worst == 0.0:
        print("VERDICT: clean. The grammar understands every construct in these files.")
    elif worst < 1.0:
        print(f"VERDICT: good. Worst file {worst:.2f}% unparsed.")
        print("         Check the flagged lines: some are genuine defects in the source,")
        print("         the rest are grammar gaps worth reporting.")
    else:
        print(f"VERDICT: {worst:.2f}% unparsed in the worst file. Likely a grammar gap.")
        print("         Reduce to a minimal snippet and add it to")
        print("         examples/regression_constructs.bas before fixing grammar.js.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
