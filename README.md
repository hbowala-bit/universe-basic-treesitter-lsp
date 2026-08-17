# universe-basic-treesitter-lsp

A [Tree-sitter](https://tree-sitter.github.io/tree-sitter/) grammar and LSP server for [Rocket UniVerse BASIC](https://www.rocketsoftware.com/products/rocket-universe).

## Overview

This project provides:

1. A **Tree-sitter parser grammar** for UniVerse BASIC (Pick BASIC), enabling syntax highlighting, code navigation, and structural analysis.
2. A **Language Server** (LSP) built with [pygls](https://github.com/openlawlibrary/pygls), providing IDE features for any editor that supports the Language Server Protocol.
3. A **VS Code extension** with syntax coloring, language configuration, and LSP client integration.

## LSP Features

- **Syntax Coloring** — Full TextMate grammar for keywords, strings, numbers, comments, labels, operators, built-in functions, @variables, and compiler directives
- **Diagnostics** — Real-time parse error reporting via tree-sitter
- **Document Symbols** — Outline of programs, subroutines, functions, labels, variables, constants, and arrays
- **Go to Definition** — Jump to label, variable, subroutine, and equate definitions
- **Find References** — Find all occurrences of a symbol in the current document
- **Hover** — Documentation for 100+ keywords and 60+ built-in functions
- **Completion** — Auto-complete keywords, built-in functions (with snippets), and document symbols

## Installation

### Prerequisites

- Node.js (for tree-sitter CLI)
- Python 3.11+
- [Poetry](https://python-poetry.org/)

### 1. Clone the repository

```sh
git clone git@github.com:avishek-sen-gupta/universe-basic-treesitter-lsp.git
cd universe-basic-treesitter-lsp
```

### 2. Build the tree-sitter grammar

```sh
npm install
npx tree-sitter generate
mkdir -p build
npx tree-sitter build -o build/universe_basic.dylib   # macOS
# npx tree-sitter build -o build/universe_basic.so    # Linux
```

### 3. Install the Python LSP server

```sh
poetry install
```

Verify it works:

```sh
poetry run python -m universe_basic_lsp --help
```

### 4. Build the VS Code extension

```sh
cd editors/vscode
npm install
npm run compile
cd ../..
```

### 5. Install the extension into VS Code

**Option A: Symlink (recommended for development)**

```sh
ln -s "$(pwd)/editors/vscode" ~/.vscode/extensions/universe-basic
```

**Option B: Package as .vsix**

```sh
cd editors/vscode
npx @vscode/vsce package
code --install-extension universe-basic-0.1.0.vsix
```

### 6. Configure VS Code

Open VS Code settings (`Cmd+,` / `Ctrl+,`), search for "universe basic", and set:

- **`universeBasic.lsp.projectPath`** — path to this repository's root directory

Or add to your `settings.json`:

```json
{
  "universeBasic.lsp.projectPath": "/path/to/universe-basic-treesitter-lsp"
}
```

### 7. Restart VS Code and open a `.bas` file

You should see syntax coloring immediately, and LSP features (diagnostics, hover, completion, go-to-definition, etc.) once the server starts.

## Testing the Extension with the Extension Development Host

You can test the extension without installing it by using VS Code's built-in Extension Development Host:

1. Open the `editors/vscode/` directory as a workspace in VS Code:
   ```sh
   code editors/vscode
   ```

2. Press **F5** (or go to **Run > Start Debugging**).

3. A new VS Code window (the Extension Development Host) opens with the extension loaded. It automatically opens the `examples/` directory so you have `.bas` files to test with.

4. Open `hello.bas` or `subroutine.bas` to see syntax coloring and LSP features in action.

5. To see LSP server logs, open the Output panel (`View > Output`) and select **"UniVerse BASIC LSP"** from the dropdown.

6. Changes to the extension source are picked up on the next F5 launch. Use `npm run watch` in the `editors/vscode/` directory for automatic TypeScript recompilation during development.

## Running the LSP Server Standalone

```sh
# stdio (default, for editor integration)
poetry run python -m universe_basic_lsp

# TCP (for development/debugging)
poetry run python -m universe_basic_lsp --tcp --port 2087
```

## Running Tests

```sh
# Run all tests (parser, analyzer, LSP server integration)
poetry run pytest tests/ -v
```

The test suite includes:
- **45 parser tests** — parsing of all language constructs
- **19 analyzer tests** — symbol extraction, diagnostics, definitions
- **11 server integration tests** — full LSP protocol tests over stdio

## Neovim Configuration

```lua
vim.api.nvim_create_autocmd("FileType", {
  pattern = "universe-basic",
  callback = function()
    vim.lsp.start({
      name = "universe-basic-lsp",
      cmd = { "poetry", "run", "python", "-m", "universe_basic_lsp" },
      root_dir = vim.fn.getcwd(),
    })
  end,
})
```

## Language Coverage

- **Declarations** — `PROGRAM`, `SUBROUTINE`, `FUNCTION`, `DEFFUN`, `DIM`, `COMMON`, `EQUATE`
- **Control Flow** — `IF/THEN/ELSE/END`, `BEGIN CASE/END CASE`, `FOR/NEXT`, `LOOP/REPEAT`, `WHILE/UNTIL`, `GOTO`, `GOSUB`, `ON GOTO/GOSUB`, `CALL`, `RETURN`
- **File I/O** — `OPEN`, `READ`, `WRITE`, `DELETE`, `LOCK`, `UNLOCK`, `FILELOCK`, `SELECT`, `READNEXT`, `CLEARFILE`
- **Sequential I/O** — `OPENSEQ`, `READSEQ`, `WRITESEQ`, `READBLK`, `WRITEBLK`, `SEEK`, `CLOSESEQ`
- **Device I/O** — `OPENDEV`, `GET`, `SEND`
- **Tape I/O** — `READT`, `WRITET`, `REWIND`, `WEOF`
- **Print/Terminal** — `PRINT`, `CRT`, `DISPLAY`, `INPUT`, `HEADING`, `FOOTING`, `TPRINT`
- **String Manipulation** — `LOCATE`, `FIND`, `FINDSTR`, `INS`, `DEL`, `CONVERT`, `SWAP`
- **Transactions** — `BEGIN TRANSACTION`, `END TRANSACTION`, `COMMIT`, `ROLLBACK`
- **Expressions** — Arithmetic, string concatenation, relational, logical, pattern matching, dynamic array access, substring, function calls
- **Compiler Directives** — `$INCLUDE`, `$DEFINE`, `$IFDEF/$IFNDEF`, `$OPTIONS`, `$CHAIN`, `$MAP`
- **Comments** — `*`, `!`, `REM`, `$*`

### Known limitations

- **`STATUS` is not a statement keyword.** In real code `STATUS` is
  overwhelmingly an ordinary variable (`STATUS = RBO.getProperty(...)`) and
  `STATUS()` is a function. A `STATUS ... TO ...` statement rule makes every
  such assignment unparseable, and no lexical trick recovers the spaced form
  because tree-sitter's lexer cannot look ahead. The variable reading wins.
- **Two block terminators on one line** — `END<TAB>END` closing nested blocks
  is not supported. `statement_line` requires a newline terminator; accepting a
  sibling `END` instead needs an external scanner.
- **`>=` vs. the closing `>` of `<...>`** is resolved by giving the closing
  bracket explicit lexical precedence. A genuine `>=` comparison written
  *inside* a subscript (`A<X >= Y>`) would therefore mis-lex. Not observed in
  practice; an external scanner would remove the caveat entirely.

## Packaging the grammar for the NovoLingo gen_ai chunker

`gen_ai/libs/src/libs/utils/chunker` resolves a compiled grammar named
`pickbasic` from `grammars/compiled/`. `tools/build.sh` produces that artifact
in the exact layout the resolver expects.

```bash
./tools/build.sh                 # generate + compile + package + verify
./tools/build.sh --skip-gen      # reuse an existing src/parser.c
```

Output:

```
dist/grammars/compiled/pickbasic.so          # ELF x86-64, glibc 2.36  (production)
dist/grammars/compiled/pickbasic.dll         # PE32+ x86-64            (Windows dev)
dist/grammars/compiled/pickbasic.meta.json   # { symbol, abi_version }
```

Copy `dist/grammars/compiled/` over
`gen_ai/libs/src/libs/utils/chunker/grammars/compiled/`. No gen_ai code changes
are required — `GrammarResolver` picks the artifact up automatically, and
`GrammarArtifactStore` prefers the native extension per platform.

The `.dll` is cross-compiled with mingw-w64 from the same Linux container, so no
Windows toolchain is needed to produce it. It exists purely so Windows machines
can run the tooling natively; production loads the `.so`.

> A `.so` filename does not make a binary ELF. Shipping a macOS Mach-O named
> `pickbasic.so` is what made the grammar unloadable on every non-macOS host —
> the build now emits per-platform artifacts and verifies each with `file`.

### Why the build is two-stage

| Stage | Image | Reason |
|-------|-------|--------|
| generate `src/parser.c` | `node:22-trixie` | tree-sitter-cli ≥ 0.26 requires glibc ≥ 2.39 |
| compile the `.so`       | `python:3.11.9-slim-bookworm` | must match the gen_ai runtime (glibc 2.36) |

Compiling on the newer base yields a shared object the production image cannot
load. Equally, a `.so` filename does not make a binary ELF — verify with `file`
before shipping. `tools/parse_report.py` checks the magic bytes on load and
fails with an actionable message rather than a bare `invalid ELF header`.

The build aborts if the generated grammar ABI falls outside 13–15, the range
py-tree-sitter 0.25.x accepts.

## Measuring parse coverage

`tools/parse_report.py` reports how much of a file the grammar actually
understands — the developer loop for grammar changes, and a CI gate.

It takes any path, so you can point it at real UniVerse source anywhere on disk
without copying customer code into this repo.

```bash
pip install "tree-sitter>=0.25.2,<0.26.0"     # once
./tools/build.sh                              # once, produces dist/

# any local file or directory
python tools/parse_report.py /path/to/PROGRAMS
python tools/parse_report.py ~/code/NVLG2415V --show-errors

# declarations recovered via field('name')
python tools/parse_report.py examples --show-declarations

# CI gate — non-zero exit if any file exceeds the threshold
python tools/parse_report.py examples --max-error-pct 0

# machine-readable
python tools/parse_report.py /path/to/PROGRAMS --json > report.json
```

Files are matched by extension: `.bas`, `.b`, `.bp`, and **no extension at all**
(the UniVerse norm). The grammar is auto-selected for the host platform;
override with `--grammar` / `--symbol`.

### If you can't run it natively

macOS needs a `.dylib`, which is not cross-compiled by `tools/build.sh`. Use the
container wrapper instead — same output, no local Python or grammar needed:

```bash
./tools/report.sh /path/to/PROGRAMS --show-errors
./tools/report.sh ~/code/NVLG2415V --max-error-pct 5
```

It mounts the target read-only and runs the report inside the build image.

`examples/regression_constructs.bas` is the guard for the constructs that
previously failed; it must stay at `--max-error-pct 0`.

## Project Structure

```
grammar.js                  # Tree-sitter grammar definition
tree-sitter.json            # Tree-sitter project configuration
package.json                # Node.js package manifest (tree-sitter-cli)
pyproject.toml              # Python project (Poetry)
universe_basic_lsp/         # LSP server package
  __init__.py
  __main__.py               # Entry point
  server.py                 # pygls Language Server
  parser.py                 # Tree-sitter grammar loader
  analyzer.py               # Parse tree analysis (symbols, diagnostics, definitions)
  keywords.py               # Keyword and built-in function documentation
tests/                      # Test suite (pytest)
  test_parser.py            # Tree-sitter parser tests
  test_analyzer.py          # Analyzer unit tests
  test_server.py            # LSP server integration tests
editors/vscode/             # VS Code extension
  src/extension.ts          # Extension entry point (LSP client)
  syntaxes/                 # TextMate grammar for syntax coloring
  language-configuration.json
  .vscode/launch.json       # F5 Extension Development Host config
build/                      # Compiled grammar shared library (gitignored)
tools/                      # Grammar packaging + parse-coverage tooling
  build.sh                  # Two-stage build -> dist/grammars/compiled/
  Dockerfile.build          # Compile/test image, pinned to the gen_ai runtime
  parse_report.py           # Parse-coverage report / CI gate
  report.sh                 # Container wrapper for parse_report.py
dist/grammars/compiled/     # Packaged artifacts (.so for prod, .dll for Windows dev)
examples/                   # Example UniVerse BASIC source files
  regression_constructs.bas # Guard for previously-failing constructs
reference/                  # Language reference documentation
src/                        # Generated parser (auto-generated, gitignored)
```

## Reference

Grammar developed against the *UniVerse BASIC User Guide* (Version 11.3.5, January 2023).

## License

[MIT](LICENSE.md)
