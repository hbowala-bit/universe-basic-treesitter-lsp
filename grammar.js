/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

// Case-insensitive keyword helper — produces a regex pattern
// Only pass pure alphabetic keywords (no $, #, etc.)
const ci = (keyword) => {
  let pattern = '';
  for (const c of keyword) {
    pattern += `[${c.toLowerCase()}${c.toUpperCase()}]`;
  }
  return new RegExp(pattern);
};

// Case-insensitive pattern for directives with $ or # prefix
const ciDirective = (prefix, keyword) => {
  let pattern = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const c of keyword) {
    pattern += `[${c.toLowerCase()}${c.toUpperCase()}]`;
  }
  return new RegExp(pattern);
};

// Case-insensitive keyword for statements that declare a name (PROGRAM foo,
// SUBROUTINE foo, DIMENSION foo(...), etc). Because `word: $ => $.identifier`
// is set, tree-sitter always prefers a keyword token over `identifier` in any
// state where both are valid — so code that reuses a declaration keyword as a
// plain variable name (e.g. `PROGRAM='X'` or `DIM(1)=`) would otherwise force
// the declaration parse and dead-end into an ERROR node.
//
// Tree-sitter's regex engine has no look-around, so the keyword can't simply
// assert "not followed by = or (". Instead, fold the mandatory separating
// whitespace into the keyword token itself: "PROGRAM " (8 chars, incl. the
// space) beats the bare identifier "PROGRAM" (7 chars) on longest-match when
// a real declaration follows, but the token can't match at all when the
// keyword is glued directly to '=' or '(' with no space — so the lexer falls
// back to `identifier` and lets assignment/array-access rules handle it.
const ciDecl = (keyword) => token(seq(ci(keyword), /[ \t]+/));

module.exports = grammar({
  name: 'universe_basic',

  extras: $ => [/[ \t]/, $.line_continuation],

  word: $ => $.identifier,

  conflicts: $ => [
    [$.lhs_expression, $._primary_expression],
    [$._expression, $.lhs_expression],
    [$.statement_label, $._primary_expression],
    [$.concatenation_expression],
  ],

  rules: {
    source_file: $ => repeat(choice(
      $.statement_line,
      $.label_line,
      $.compiler_directive,
      $._comment,
      $._newline,
    )),

    _newline: _ => /\r?\n/,

    line_continuation: _ => token(seq('...', /\r?\n/)),

    // =========================================
    // Comments
    // =========================================
    _comment: $ => choice(
      $.rem_comment,
      $.star_comment,
      $.bang_comment,
      $.dollar_star_comment,
    ),

    rem_comment: _ => token(seq(ci('REM'), /[^\n]*/)),
    star_comment: _ => token(seq('*', /[^\n]*/)),
    bang_comment: _ => token(seq('!', /[^\n]*/)),
    dollar_star_comment: _ => token(seq('$', '*', /[^\n]*/)),

    // =========================================
    // Statement lines
    // =========================================
    statement_line: $ => seq(
      optional($.statement_label),
      $._statement,
      repeat(seq(';', choice($._statement, $._comment))),
      $._newline,
    ),

    // A label may stand alone on its line, optionally followed by an empty
    // statement separator and/or a comment — e.g. `9000 ;* Error processing`.
    label_line: $ => seq(
      $.statement_label,
      optional(';'),
      optional($._comment),
      $._newline,
    ),

    statement_label: $ => choice(
      seq($.numeric_label, optional(':')),
      seq($.identifier, ':'),
      seq($._keyword_as_label, ':'),
    ),

    _keyword_as_label: _ => choice(
      ci('EXIT'), ci('RETURN'), ci('STOP'), ci('END'),
      ci('NULL'), ci('CONTINUE'), ci('DEBUG'),
    ),

    numeric_label: _ => /[0-9]+/,

    // =========================================
    // Statements
    // =========================================
    _statement: $ => choice(
      // Declarations
      $.program_statement,
      $.subroutine_statement,
      $.function_statement,
      $.deffun_statement,
      $.dimension_statement,
      $.common_statement,
      $.equate_statement,

      // Assignment
      $.assignment_statement,
      $.let_statement,
      $.mat_statement,
      $._swap_statement,
      $._clear_statement,

      // Control flow
      $.if_statement,
      $.if_block,
      $.begin_case_statement,
      $.for_statement,
      $.loop_statement,
      $._goto_statement,
      $._gosub_statement,
      $._on_statement,
      $._return_statement,
      $._stop_statement,
      $._abort_statement,
      $._end_statement,
      $._null_statement,
      $._continue_statement,
      $._exit_statement,
      $._while_statement,
      $._until_statement,

      // Subroutine calls
      $._call_statement,
      $._enter_statement,
      $._execute_statement,
      $._perform_statement,
      $._chain_statement,

      // I/O - File
      $._open_statement,
      $._osread_statement,
      $._close_statement,
      $._read_statement,
      $._write_statement,
      $._delete_statement,
      $._lock_statement,
      $._unlock_statement,
      $._release_statement,
      $._filelock_statement,
      $._fileunlock_statement,
      $._select_statement,
      $._selectindex_statement,
      $._readnext_statement,
      $._clearselect_statement,
      $._readlist_statement,
      $._writelist_statement,
      $._getlist_statement,
      $._deletelist_statement,
      $._formlist_statement,
      $._bscan_statement,
      $._clearfile_statement,

      // I/O - Sequential
      $._openseq_statement,
      $._readseq_statement,
      $._writeseq_statement,
      $._writeseqf_statement,
      $._readblk_statement,
      $._writeblk_statement,
      $._seek_statement,
      $._closeseq_statement,
      $._weofseq_statement,
      $._nobuf_statement,
      $._flush_statement,
      $._openpath_statement,
      $._create_statement,
      // NOTE: there is deliberately no `STATUS ... TO ...` statement rule.
      // In real UniVerse code STATUS is overwhelmingly an ordinary variable
      // receiving a function result (`STATUS = RBO.getProperty(...)`), and
      // STATUS() is a function. Treating it as a statement keyword makes every
      // such assignment unparseable, and no lexical trick recovers the spaced
      // form (`STATUS = 0`) because tree-sitter's lexer cannot look ahead.
      // See tools/parse_report.py + examples/regression_constructs.bas.

      // I/O - Print/Terminal
      $._print_statement,
      $._crt_statement,
      $._display_statement,
      $._input_statement,
      $._heading_statement,
      $._footing_statement,
      $._page_statement,
      $._printer_statement,
      $._hush_statement,
      $._break_statement,
      $._echo_statement,
      $._prompt_statement,
      $._tabstop_statement,
      $._tprint_statement,
      $._errmsg_statement,
      $._printerr_statement,
      $._data_statement,
      $._cleardata_statement,
      $._inputtrap_statement,
      $._keyedit_statement,
      $._keytrap_statement,
      $._keyexit_statement,

      // I/O - Tape
      $._readt_statement,
      $._writet_statement,
      $._rewind_statement,
      $._weof_statement,

      // I/O - Device
      $._opendev_statement,
      $._get_statement,
      $._send_statement,
      $._ttyctl_statement,
      $._ttyget_statement,
      $._ttyset_statement,

      // Transaction
      $._begin_transaction_statement,
      $._end_transaction_statement,
      $._commit_statement,
      $._rollback_statement,
      $._set_transaction_statement,

      // String
      $._locate_statement,
      $._locate_call_statement,
      $._find_statement,
      $._findstr_statement,
      $._ins_statement,
      $._del_statement,
      $._remove_statement,
      $._convert_statement,
      $._matparse_statement,
      $._matbuild_statement,

      // Other
      $._debug_statement,
      $._sleep_statement,
      $._nap_statement,
      $._precision_statement,
      $._randomize_statement,
      $._procread_statement,
      $._procwrite_statement,
      $._timeout_statement,
      $._authorization_statement,
      $._opencheck_statement,
      $._recordlockl_statement,
      $._recordlocku_statement,
      $._setrem_statement,
      $._inputclear_statement,
      $._clearprompts_statement,

      // Catch-all for function calls used as statements
      $._expression_statement,
    ),

    // =========================================
    // Compiler Directives
    // =========================================
    compiler_directive: $ => choice(
      $.include_directive,
      $.chain_directive,
      $.define_directive,
      $.undefine_directive,
      $.ifdef_directive,
      $.ifndef_directive,
      $.options_directive,
      $.copyright_directive,
      $.page_directive,
      $.map_directive,
    ),

    include_directive: $ => seq(
      choice(
        ciDirective('$', 'INCLUDE'),
        ciDirective('$', 'INSERT'),
        ciDirective('#', 'INCLUDE'),
        ci('INCLUDE'),
      ),
      optional($.identifier),
      optional($.identifier),
      $._newline,
    ),

    chain_directive: $ => seq(
      ciDirective('$', 'CHAIN'),
      optional($.identifier),
      optional($.identifier),
      $._newline,
    ),

    define_directive: $ => seq(
      ciDirective('$', 'DEFINE'),
      $.identifier,
      optional(field('value', $._expression)),
      $._newline,
    ),

    undefine_directive: $ => seq(
      ciDirective('$', 'UNDEFINE'),
      $.identifier,
      $._newline,
    ),

    ifdef_directive: $ => seq(
      ciDirective('$', 'IFDEF'),
      $.identifier,
      $._newline,
      optional($._body),
      optional(seq(
        ciDirective('$', 'ELSE'), $._newline,
        optional($._body),
      )),
      ciDirective('$', 'ENDIF'), $._newline,
    ),

    ifndef_directive: $ => seq(
      ciDirective('$', 'IFNDEF'),
      $.identifier,
      $._newline,
      optional($._body),
      optional(seq(
        ciDirective('$', 'ELSE'), $._newline,
        optional($._body),
      )),
      ciDirective('$', 'ENDIF'), $._newline,
    ),

    options_directive: $ => seq(
      ciDirective('$', 'OPTIONS'),
      /[^\n]+/,
      $._newline,
    ),

    copyright_directive: $ => seq(
      ciDirective('$', 'COPYRIGHT'),
      /[^\n]*/,
      $._newline,
    ),

    page_directive: $ => seq(
      choice(ciDirective('$', 'PAGE'), ciDirective('$', 'EJECT')),
      $._newline,
    ),

    map_directive: $ => seq(
      ciDirective('$', 'MAP'),
      /[^\n]+/,
      $._newline,
    ),

    // =========================================
    // Declaration Statements
    // =========================================
    // Declarations expose their identifier under the `name` field so that
    // downstream consumers can read it via child_by_field_name("name").
    program_statement: $ => seq(
      choice(ciDecl('PROGRAM'), ciDecl('PROG')),
      field('name', $.identifier),
    ),

    subroutine_statement: $ => seq(
      ciDecl('SUBROUTINE'),
      optional(seq(
        field('name', $.identifier),
        optional($.parameter_list),
      )),
    ),

    function_statement: $ => seq(
      ciDecl('FUNCTION'),
      field('name', $.identifier),
      optional($.parameter_list),
    ),

    deffun_statement: $ => seq(
      ciDecl('DEFFUN'),
      field('name', $.identifier),
      optional($.parameter_list),
      optional(seq(ci('CALLING'), choice($.string, $.identifier))),
    ),

    parameter_list: $ => seq('(', commaSep($._expression), ')'),

    dimension_statement: $ => seq(
      choice(ciDecl('DIMENSION'), ciDecl('DIM')),
      commaSep1($.dim_specifier),
    ),

    dim_specifier: $ => seq(
      $.identifier,
      '(',
      $._expression,
      optional(seq(',', $._expression)),
      ')',
    ),

    common_statement: $ => seq(
      ciDecl('COMMON'),
      optional(seq('/', $.identifier, '/')),
      commaSep1(choice($.dim_specifier, $.identifier)),
    ),

    equate_statement: $ => seq(
      choice(ciDecl('EQUATE'), ciDecl('EQU')),
      field('name', $.identifier),
      choice(ci('TO'), ci('LIT'), ci('LITERALLY')),
      $._expression,
    ),

    // =========================================
    // Assignment Statements
    // =========================================
    assignment_statement: $ => prec.right(seq(
      $.lhs_expression,
      choice('=', '+=', '-=', ':='),
      $._expression,
    )),

    let_statement: $ => seq(
      ci('LET'),
      $.lhs_expression,
      '=',
      $._expression,
    ),

    mat_statement: $ => seq(
      ci('MAT'),
      $.identifier,
      '=',
      $._expression,
    ),

    _swap_statement: $ => seq(
      ci('SWAP'),
      $.lhs_expression,
      ci('WITH'),
      $.lhs_expression,
    ),

    _clear_statement: $ => seq(
      ci('CLEAR'),
      optional(commaSep1($.identifier)),
    ),

    _expression_statement: $ => $._expression,

    // =========================================
    // Control Flow Statements
    // =========================================
    if_statement: $ => prec.right(seq(
      ci('IF'),
      field('condition', $._expression),
      optional(ci('THEN')),
      optional($._then_body),
      optional(seq(ci('ELSE'), optional($._else_body))),
    )),

    // `_block_head_break` (repeat1 of blank-lines-or-comment-lines) is ONLY safe where
    // nothing else after it can also start with a bare newline/comment — otherwise the
    // parser can't tell which rule "owns" a run of blank/comment lines (a real
    // generate-time conflict, caught trying this more broadly). `_body` already
    // tolerates leading blank lines and comments itself (two of its choices are a bare
    // $._newline and $._comment), so every construct that follows its header newline
    // with `optional($._body)` (if_block, case_clause, for_statement, loop_statement,
    // _then_else_clause) needs no change here. `begin_case_statement` is the one
    // exception: nothing but `repeat($.case_clause)` follows its header newline, and
    // `case_clause` cannot start with a bare blank/comment line, so it needs this fix
    // directly. Confirmed against real code: a blank line, or a `*comment` line, between
    // `BEGIN CASE` and its first `CASE` clause (NVLG2415E and others, logistic-ru-poc
    // corpus — one of the largest recurring error clusters in a 165-file scan).
    _block_head_break: $ => repeat1(choice($._newline, seq($._comment, $._newline))),

    if_block: $ => prec.right(1, seq(
      ci('IF'),
      field('condition', $._expression),
      optional(ci('THEN')),
      $._newline,
      optional($._body),
      choice(
        seq(
          $._end_else,
          $._newline,
          optional($._body),
          ci('END'),
        ),
        ci('END'),
      ),
    )),

    _end_else: _ => token(seq(
      /[eE][nN][dD]/,
      /\s+/,
      /[eE][lL][sS][eE]/,
    )),

    // Trailing `;* comment` after the last statement — the same idiom fixed on
    // label_line/case_clause (e.g. `IF W="" THEN W="35"   ;* Internal CH4`). Confirmed
    // common in real code (logistic-ru-poc corpus, NVLG1608 and others).
    _then_body: $ => prec.right(seq($._statement, repeat(seq(';', $._statement)), optional(seq(';', $._comment)))),
    _else_body: $ => prec.right(seq($._statement, repeat(seq(';', $._statement)), optional(seq(';', $._comment)))),

    _body: $ => repeat1(choice($.statement_line, $.label_line, $.compiler_directive, $._comment, $._newline)),

    begin_case_statement: $ => seq(
      ci('BEGIN'), ci('CASE'),
      $._block_head_break,
      repeat($.case_clause),
      $._end_case,
    ),

    _end_case: _ => token(seq(
      /[eE][nN][dD]/,
      /\s+/,
      /[cC][aA][sS][eE]/,
    )),

    // The CASE line can carry trailing `;`-joined statements and/or a `;* comment`,
    // exactly like `statement_line` does (e.g. `CASE TYPE = 1  ;* Service Change Header`,
    // `CASE 1; MSGNO=999; MSG=PROGRAM:' [':ERR:']'`). Confirmed extremely common in real
    // code (logistic-ru-poc corpus) — the single largest error cluster found in a
    // 165-file scan (~200 leaf ERROR nodes with a bare `;` tail).
    case_clause: $ => prec.right(seq(
      ci('CASE'),
      $._expression,
      repeat(seq(';', choice($._statement, $._comment))),
      $._newline,
      optional($._body),
    )),

    for_statement: $ => seq(
      ci('FOR'),
      $.identifier,
      '=',
      $._expression,
      ci('TO'),
      $._expression,
      optional(seq(ci('STEP'), $._expression)),
      $._newline,
      optional($._body),
      ci('NEXT'),
      optional($.identifier),
    ),

    // UniVerse allows the loop head to carry an initialising statement and/or
    // the terminating condition on the LOOP line itself:
    //   LOOP <newline> ... REPEAT
    //   LOOP XX+=1 UNTIL COND <newline> ... REPEAT
    //   LOOP WHILE COND DO <newline> ... REPEAT
    // The pre-statement is deliberately restricted to assignment forms so it
    // cannot collide with the standalone _while_statement/_until_statement
    // rules that remain valid inside the loop body.
    loop_statement: $ => prec.right(seq(
      ci('LOOP'),
      optional($._loop_control),
      $._newline,
      optional($._body),
      ci('REPEAT'),
    )),

    _loop_control: $ => choice(
      $._loop_condition,
      seq($._loop_pre_statement, optional($._loop_condition)),
    ),

    // `LOOP READNEXT key ELSE EXIT` — the classic "iterate an active select list"
    // idiom, a third loop-head form alongside the pre-statement/condition forms above.
    // Confirmed common in real code (logistic-ru-poc corpus, NVLG1787 and others).
    _loop_pre_statement: $ => choice(
      $.assignment_statement,
      $.let_statement,
      $._readnext_statement,
    ),

    _loop_condition: $ => seq(
      choice(ci('WHILE'), ci('UNTIL')),
      $._expression,
      optional(ci('DO')),
    ),

    _goto_statement: $ => seq(
      choice(ci('GOTO'), ci('GO'), seq(ci('GO'), ci('TO'))),
      choice($.identifier, $.numeric_label),
    ),

    _gosub_statement: $ => seq(
      choice(ci('GOSUB'), seq(ci('GO'), ci('SUB'))),
      choice($.identifier, $.numeric_label),
    ),

    _on_statement: $ => seq(
      ci('ON'),
      $._expression,
      choice(ci('GOTO'), ci('GOSUB'), seq(ci('GO'), ci('TO')), seq(ci('GO'), ci('SUB'))),
      commaSep1(choice($.identifier, $.numeric_label)),
    ),

    _return_statement: $ => seq(
      ci('RETURN'),
      optional(choice(
        seq(ci('TO'), choice($.identifier, $.numeric_label)),
        seq('(', $._expression, ')'),
      )),
    ),

    _stop_statement: $ => seq(ci('STOP'), optional($._expression)),
    _abort_statement: $ => seq(ci('ABORT'), optional($._expression)),
    _end_statement: _ => ci('END'),
    _null_statement: _ => ci('NULL'),
    _continue_statement: _ => ci('CONTINUE'),
    _exit_statement: _ => ci('EXIT'),
    _while_statement: $ => seq(ci('WHILE'), $._expression, optional(ci('DO'))),
    _until_statement: $ => seq(ci('UNTIL'), $._expression, optional(ci('DO'))),

    // =========================================
    // Subroutine Call Statements
    // =========================================
    _call_statement: $ => seq(
      ci('CALL'),
      choice(
        $.identifier,
        seq('@', $.identifier),
        seq('*', $.identifier),
      ),
      optional($.argument_list),
    ),

    _enter_statement: $ => seq(
      ci('ENTER'),
      $._expression,
    ),

    _execute_statement: $ => seq(
      ci('EXECUTE'),
      $._expression,
      repeat(choice(
        seq(ci('CAPTURING'), $.identifier),
        seq(ci('RETURNING'), $.identifier),
        seq(ci('PASSLIST'), optional($.identifier)),
        seq(ci('RTNLIST'), optional($.identifier)),
        seq(ci('SETTING'), $.identifier),
      )),
    ),

    // PCPERFORM (perform on the client/PC side) takes the same clause set as PERFORM.
    // Confirmed against real code (logistic-ru-poc corpus, SEND.SUBCON) — was previously
    // entirely unhandled.
    _perform_statement: $ => seq(
      choice(ci('PERFORM'), ci('PCPERFORM')),
      $._expression,
      repeat(choice(
        seq(ci('CAPTURING'), $.identifier),
        seq(ci('RETURNING'), $.identifier),
        seq(ci('PASSLIST'), optional($.identifier)),
        seq(ci('RTNLIST'), optional($.identifier)),
        seq(ci('SETTING'), $.identifier),
      )),
    ),

    _chain_statement: $ => seq(
      ci('CHAIN'),
      $._expression,
    ),

    // =========================================
    // File I/O Statements
    // =========================================
    _open_statement: $ => prec.right(seq(
      ci('OPEN'),
      optional(seq($._expression, ',')),
      $._expression,
      ci('TO'),
      $.lhs_expression,
      optional($._on_error_clause),
      optional($._then_else_clause),
    )),

    // OSREAD reads an OS-level (non-UniVerse-file) file into a variable:
    //   OSREAD var FROM '/path/to/file' THEN ... [ELSE ... END] END
    // Confirmed against real code (CHECK.APPLICATION, logistic-ru-poc corpus) — was
    // previously entirely unhandled, corrupting the surrounding IF/FOR/NEXT structure.
    _osread_statement: $ => prec.right(seq(
      ci('OSREAD'),
      $.lhs_expression,
      ci('FROM'),
      $._expression,
      optional($._then_else_clause),
    )),

    _close_statement: $ => seq(
      ci('CLOSE'),
      $._expression,
      optional($._on_error_clause),
    ),

    _read_statement: $ => prec.right(seq(
      choice(
        ci('READ'), ci('READL'), ci('READU'),
        ci('READV'), ci('READVL'), ci('READVU'),
        ci('MATREAD'), ci('MATREADL'), ci('MATREADU'),
      ),
      $.lhs_expression,
      ci('FROM'),
      // READV/READVL/READVU take a third argument: the field (attribute)
      // position — e.g. `READV D FROM F, KEY, 3 THEN ... END`.
      $._expression, ',', $._expression,
      optional(seq(',', $._expression)),
      optional(seq(ci('ON'), ci('ERROR'), $._then_body)),
      optional($._locked_clause),
      optional($._then_else_clause),
    )),

    // WRITEV/WRITEVU take an optional third argument (the field/attribute position),
    // mirroring _read_statement's READV/READVL/READVU third argument — confirmed common
    // in real code (`WRITEV "" TO F$DEPOT, L$DEPOT<XX>, 71`, logistic-ru-poc corpus);
    // this was previously an asymmetric fix (READV got it, WRITEV didn't).
    _write_statement: $ => prec.right(seq(
      choice(
        ci('WRITE'), ci('WRITEU'),
        ci('WRITEV'), ci('WRITEVU'),
        ci('MATWRITE'), ci('MATWRITEU'),
      ),
      $._expression,
      optional(seq(
        choice(ci('TO'), ci('ON')),
        $._expression, ',', $._expression,
        optional(seq(',', $._expression)),
      )),
      optional(seq(ci('ON'), ci('ERROR'), $._then_body)),
      optional($._then_else_clause),
    )),

    _delete_statement: $ => prec.right(seq(
      choice(ci('DELETE'), ci('DELETEU')),
      $._expression, ',', $._expression,
      optional(seq(ci('ON'), ci('ERROR'), $._then_body)),
      optional($._then_else_clause),
    )),

    _lock_statement: $ => prec.right(seq(
      ci('LOCK'),
      $._expression,
      optional($._then_else_clause),
    )),

    _unlock_statement: $ => seq(
      ci('UNLOCK'),
      $._expression,
    ),

    _release_statement: $ => seq(
      ci('RELEASE'),
      optional(seq($._expression, optional(seq(',', $._expression)))),
    ),

    _filelock_statement: $ => prec.right(seq(
      ci('FILELOCK'),
      $._expression,
      optional($._on_error_clause),
      optional($._then_else_clause),
    )),

    _fileunlock_statement: $ => seq(
      ci('FILEUNLOCK'),
      $._expression,
      optional($._on_error_clause),
    ),

    _select_statement: $ => seq(
      choice(ci('SELECT'), ci('SSELECT')),
      optional($._expression),
      optional(seq(ci('TO'), $._expression)),
      optional($._on_error_clause),
    ),

    // SELECTINDEX field, key FROM FILEVAR(...) — builds a select list from an indexed
    // file. Confirmed against real code (logistic-ru-poc corpus, NVLG2614/NVLG2804) —
    // was previously entirely unhandled. No optional THEN/ELSE: not observed in any real
    // occurrence, and adding it speculatively created a real dangling-else-style
    // ambiguity with the enclosing IF at generate time.
    _selectindex_statement: $ => seq(
      ci('SELECTINDEX'),
      $._expression, ',', $._expression,
      ci('FROM'),
      $._expression,
    ),

    _readnext_statement: $ => prec.right(seq(
      ci('READNEXT'),
      $.lhs_expression,
      optional(seq(ci('FROM'), $._expression)),
      optional($._then_else_clause),
    )),

    _clearselect_statement: $ => seq(
      ci('CLEARSELECT'),
      optional($._expression),
    ),

    _readlist_statement: $ => prec.right(seq(
      ci('READLIST'),
      $.lhs_expression,
      optional(seq(ci('FROM'), $._expression)),
      optional($._then_else_clause),
    )),

    _writelist_statement: $ => seq(
      ci('WRITELIST'),
      $._expression,
      optional(seq(ci('TO'), $._expression)),
    ),

    _getlist_statement: $ => prec.right(seq(
      ci('GETLIST'),
      $._expression,
      optional(seq(ci('TO'), $._expression)),
      optional($._then_else_clause),
    )),

    _deletelist_statement: $ => seq(
      ci('DELETELIST'),
      $._expression,
    ),

    _formlist_statement: $ => seq(
        ci('FORMLIST'),
        $._expression,
        optional(seq(ci('TO'), $._expression)),
    ),

    _bscan_statement: $ => prec.right(seq(
      ci('BSCAN'),
      $.lhs_expression,
      ci('FROM'),
      $._expression, ',', $._expression,
      optional(seq(ci('USING'), $._expression)),
      optional(seq(ci('RESET')),),
      optional($._then_else_clause),
    )),

    _clearfile_statement: $ => seq(
      ci('CLEARFILE'),
      $._expression,
      optional($._on_error_clause),
    ),

    // =========================================
    // Sequential File I/O
    // =========================================
    _openseq_statement: $ => prec.right(seq(
      ci('OPENSEQ'),
      $._expression,
      optional(seq(',', $._expression)),
      ci('TO'),
      $.lhs_expression,
      optional(seq(ci('USING'), $.lhs_expression)),
      optional(seq(ci('ON'), ci('ERROR'), $._then_body)),
      optional($._locked_clause),
      optional($._then_else_clause),
    )),

    _readseq_statement: $ => prec.right(seq(
      ci('READSEQ'),
      $.lhs_expression,
      ci('FROM'),
      $._expression,
      optional(seq(ci('ON'), ci('ERROR'), $._then_body)),
      optional($._then_else_clause),
    )),

    _writeseq_statement: $ => prec.right(seq(
      ci('WRITESEQ'),
      $._expression,
      choice(ci('TO'), ci('ON'), ci('APPEND')),
      $._expression,
      optional(seq(ci('ON'), ci('ERROR'), $._then_body)),
      optional($._then_else_clause),
    )),

    _writeseqf_statement: $ => prec.right(seq(
      ci('WRITESEQF'),
      $._expression,
      choice(ci('TO'), ci('ON'), ci('APPEND')),
      $._expression,
      optional(seq(ci('ON'), ci('ERROR'), $._then_body)),
      optional($._then_else_clause),
    )),

    _readblk_statement: $ => prec.right(seq(
      ci('READBLK'),
      $.lhs_expression,
      ci('FROM'),
      $._expression, ',', $._expression,
      optional(seq(ci('ON'), ci('ERROR'), $._then_body)),
      optional($._then_else_clause),
    )),

    _writeblk_statement: $ => prec.right(seq(
      ci('WRITEBLK'),
      $._expression,
      choice(ci('TO'), ci('ON')),
      $._expression,
      optional(seq(ci('ON'), ci('ERROR'), $._then_body)),
      optional($._then_else_clause),
    )),

    _seek_statement: $ => prec.right(seq(
      ci('SEEK'),
      $._expression,
      optional(seq(',', $._expression)),
      optional(seq(',', $._expression)),
      optional(seq(ci('ON'), ci('ERROR'), $._then_body)),
      optional($._then_else_clause),
    )),

    _closeseq_statement: $ => seq(
      ci('CLOSESEQ'),
      $._expression,
      optional(seq(ci('ON'), ci('ERROR'), $._then_body)),
    ),

    _weofseq_statement: $ => seq(
      ci('WEOFSEQ'),
      $._expression,
      optional(seq(ci('ON'), ci('ERROR'), $._then_body)),
    ),

    _nobuf_statement: $ => seq(ci('NOBUF'), $._expression),
    _flush_statement: $ => seq(ci('FLUSH'), $._expression),

    _openpath_statement: $ => prec.right(seq(
      ci('OPENPATH'),
      $._expression,
      ci('TO'),
      $.lhs_expression,
      optional($._on_error_clause),
      optional($._then_else_clause),
    )),

    _create_statement: $ => prec.right(seq(
      ci('CREATE'),
      $._expression,
      optional($._then_else_clause),
    )),

    // =========================================
    // Print/Terminal I/O
    // =========================================
    _print_statement: $ => seq(
      ci('PRINT'),
      optional(seq(ci('ON'), $._expression)),
      optional($.print_list),
    ),

    _crt_statement: $ => seq(ci('CRT'), optional($.print_list)),
    _display_statement: $ => seq(ci('DISPLAY'), optional($.print_list)),

    print_list: $ => seq(
      $._print_item,
      repeat(seq(choice(',', ':'), optional($._print_item))),
    ),

    _print_item: $ => $._expression,

    _input_statement: $ => seq(
      choice(ci('INPUT'), ci('INPUTIF'), ci('INPUTDISP'), ci('INPUTDP')),
      optional(seq('@', '(', $._expression, ',', $._expression, ')')),
      optional(seq($.lhs_expression, optional(seq(
        optional(seq(',', $._expression)),
        optional(seq(':', $._expression)),
        optional(seq('_')),
      )))),
    ),

    _heading_statement: $ => seq(
      choice(ci('HEADING'), ci('HEADINGE'), ci('HEADINGN')),
      $._expression,
    ),

    _footing_statement: $ => seq(ci('FOOTING'), $._expression),
    _page_statement: $ => seq(ci('PAGE'), optional($._expression)),

    _printer_statement: $ => seq(
      ci('PRINTER'),
      choice(ci('ON'), ci('OFF'), ci('CLOSE'), ci('RESET')),
    ),

    _hush_statement: $ => seq(ci('HUSH'), optional(choice(ci('ON'), ci('OFF'), $._expression))),
    _break_statement: $ => seq(ci('BREAK'), optional(choice(ci('ON'), ci('OFF'), ci('KEY'), $._expression))),
    _echo_statement: $ => seq(ci('ECHO'), optional(choice(ci('ON'), ci('OFF'), $._expression))),

    _prompt_statement: $ => seq(ci('PROMPT'), $._expression),
    _tabstop_statement: $ => seq(ci('TABSTOP'), $._expression),

    _tprint_statement: $ => seq(
      ci('TPRINT'),
      optional(seq(ci('ON'), $._expression)),
      optional($.print_list),
    ),

    _errmsg_statement: $ => seq(ci('ERRMSG'), $._expression, optional(seq(',', commaSep1($._expression)))),
    _printerr_statement: $ => seq(ci('PRINTERR'), $._expression, optional(seq(',', commaSep1($._expression)))),

    _data_statement: $ => seq(ci('DATA'), $._expression),
    _cleardata_statement: _ => ci('CLEARDATA'),

    _inputtrap_statement: $ => seq(ci('INPUTTRAP'), $._expression),
    _keyedit_statement: $ => seq(ci('KEYEDIT'), commaSep1($._expression)),
    _keytrap_statement: $ => seq(ci('KEYTRAP'), commaSep1($._expression)),
    _keyexit_statement: $ => seq(ci('KEYEXIT'), commaSep1($._expression)),

    // =========================================
    // Tape I/O
    // =========================================
    _readt_statement: $ => prec.right(seq(ci('READT'), $.lhs_expression, optional($._then_else_clause))),
    _writet_statement: $ => prec.right(seq(ci('WRITET'), $._expression, optional($._then_else_clause))),
    _rewind_statement: $ => prec.right(seq(ci('REWIND'), optional($._then_else_clause))),
    _weof_statement: $ => prec.right(seq(ci('WEOF'), optional($._then_else_clause))),

    // =========================================
    // Device I/O
    // =========================================
    _opendev_statement: $ => prec.right(seq(
      ci('OPENDEV'),
      $._expression,
      ci('TO'),
      $.lhs_expression,
      optional($._then_else_clause),
    )),

    _get_statement: $ => prec.right(seq(
      choice(ci('GET'), ci('GETX')),
      $.lhs_expression,
      optional(seq(',', $._expression)),
      ci('FROM'),
      $._expression,
      optional(seq(ci('UNTIL'), $._expression)),
      optional(seq(ci('RETURNING'), $.lhs_expression)),
      optional(seq(ci('WAITING'), $._expression)),
      optional($._then_else_clause),
    )),

    _send_statement: $ => prec.right(seq(
      ci('SEND'),
      $._expression,
      ci('TO'),
      $._expression,
      optional($._then_else_clause),
    )),

    _ttyctl_statement: $ => seq(ci('TTYCTL'), $._expression, ',', $._expression),
    _ttyget_statement: $ => seq(ci('TTYGET'), $.lhs_expression, optional(seq(ci('FROM'), $._expression))),
    _ttyset_statement: $ => seq(ci('TTYSET'), $._expression, optional(seq(ci('TO'), $._expression))),

    // =========================================
    // Transaction Statements
    // =========================================
    _begin_transaction_statement: $ => seq(
      ci('BEGIN'), ci('TRANSACTION'),
      optional(seq(ci('ISOLATION'), ci('LEVEL'), $._expression)),
    ),
    _end_transaction_statement: _ => token(seq(
      /[eE][nN][dD]/,
      /\s+/,
      /[tT][rR][aA][nN][sS][aA][cC][tT][iI][oO][nN]/,
    )),
    _commit_statement: _ => ci('COMMIT'),
    _rollback_statement: _ => ci('ROLLBACK'),

    _set_transaction_statement: $ => seq(
      ci('SET'), ci('TRANSACTION'), ci('ISOLATION'), ci('LEVEL'),
      $._expression,
    ),

    // =========================================
    // String Manipulation Statements
    // =========================================
    _locate_statement: $ => prec.right(seq(
      ci('LOCATE'),
      $._expression,
      ci('IN'),
      $._expression,
      optional(seq(choice(',', ';'), $._expression)),
      optional(seq(ci('BY'), $._expression)),
      ci('SETTING'),
      $.lhs_expression,
      optional($._then_else_clause),
    )),

    // Function-call-style LOCATE: LOCATE(value, array[, start]; result_var) THEN/ELSE —
    // a completely different shape from the IN/SETTING form above (no keywords at all,
    // the result variable is the last, semicolon-separated argument inside the parens).
    // Confirmed against real code (logistic-ru-poc corpus, NTF.ENV.WATER.BREACH.V).
    _locate_call_statement: $ => prec.right(seq(
      ci('LOCATE'),
      token.immediate('('),
      commaSep1($._expression),
      ';',
      $.lhs_expression,
      ')',
      optional($._then_else_clause),
    )),

    _find_statement: $ => prec.right(seq(
      ci('FIND'),
      $._expression,
      ci('IN'),
      $._expression,
      ci('SETTING'),
      $.lhs_expression, ',', $.lhs_expression, ',', $.lhs_expression,
      optional($._then_else_clause),
    )),

    _findstr_statement: $ => prec.right(seq(
      ci('FINDSTR'),
      $._expression,
      ci('IN'),
      $._expression,
      ci('SETTING'),
      $.lhs_expression, ',', $.lhs_expression,
      optional($._then_else_clause),
    )),

    _ins_statement: $ => seq(
      ci('INS'),
      $._expression,
      ci('BEFORE'),
      $._expression,
    ),

    _del_statement: $ => seq(
      ci('DEL'),
      $._expression,
    ),

    _remove_statement: $ => seq(
      choice(ci('REMOVE'), ci('REVREMOVE')),
      $._expression,
      ci('FROM'),
      $._expression,
      ci('SETTING'),
      $.lhs_expression,
    ),

    _convert_statement: $ => seq(
      ci('CONVERT'),
      $._expression,
      ci('TO'),
      $._expression,
      ci('IN'),
      $.lhs_expression,
    ),

    _matparse_statement: $ => seq(
      ci('MATPARSE'),
      $.identifier,
      ci('FROM'),
      $._expression,
      optional(seq(choice(',', ci('USING')), $._expression)),
      optional(seq(ci('SETTING'), $.lhs_expression)),
    ),

    _matbuild_statement: $ => seq(
      ci('MATBUILD'),
      $.lhs_expression,
      ci('FROM'),
      $.identifier,
      optional(seq(',', $._expression, ',', $._expression)),
      optional(seq(ci('USING'), $._expression)),
    ),

    // =========================================
    // Other Statements
    // =========================================
    _debug_statement: _ => ci('DEBUG'),
    _sleep_statement: $ => seq(ci('SLEEP'), optional($._expression)),
    _nap_statement: $ => seq(ci('NAP'), $._expression),
    _precision_statement: $ => seq(ci('PRECISION'), $._expression),
    _randomize_statement: $ => seq(ci('RANDOMIZE'), optional($._expression)),
    _procread_statement: $ => prec.right(seq(ci('PROCREAD'), $.lhs_expression, optional($._then_else_clause))),
    _procwrite_statement: $ => seq(ci('PROCWRITE'), $._expression),
    _timeout_statement: $ => seq(ci('TIMEOUT'), $._expression, ',', $._expression),
    _authorization_statement: $ => seq(ci('AUTHORIZATION'), $._expression),
    _opencheck_statement: $ => prec.right(seq(ci('OPENCHECK'), $._expression, ci('TO'), $.lhs_expression, optional($._then_else_clause))),
    _recordlockl_statement: $ => prec.right(seq(ci('RECORDLOCKL'), $._expression, ',', $._expression, optional($._then_else_clause))),
    _recordlocku_statement: $ => prec.right(seq(ci('RECORDLOCKU'), $._expression, ',', $._expression, optional($._then_else_clause))),
    _setrem_statement: $ => seq(ci('SETREM'), $._expression, ci('ON'), $._expression),
    _inputclear_statement: _ => ci('INPUTCLEAR'),
    _clearprompts_statement: _ => ci('CLEARPROMPTS'),

    // =========================================
    // Clauses (reused by many statements)
    // =========================================
    _then_else_clause: $ => prec.right(1, choice(
      // Single-line: THEN stmt ELSE stmt
      seq(ci('THEN'), optional($._then_body), optional(seq(ci('ELSE'), optional($._else_body)))),
      seq(ci('ELSE'), optional($._else_body)),
      // Multi-line: THEN \n body END [ELSE \n body END]
      seq(ci('THEN'), $._newline, optional($._body), choice(
        seq($._end_else, $._newline, optional($._body), ci('END')),
        ci('END'),
      )),
      // Multi-line standalone ELSE: ELSE \n body END
      seq(ci('ELSE'), $._newline, optional($._body), ci('END')),
    )),

    _on_error_clause: $ => seq(ci('ON'), ci('ERROR'), $._then_body),

    // LOCKED can carry either a single-line body (`LOCKED stmt1; stmt2`) or a full
    // multi-line block closed with its own END, independent of any trailing THEN/ELSE
    // that follows the whole statement (`READU ... LOCKED \n body END THEN \n body END`).
    // Confirmed common in real code (logistic-ru-poc corpus, NVLG3734/NVLG3346) — the
    // multi-line form was previously entirely unhandled.
    _locked_clause: $ => prec.right(2, seq(
      ci('LOCKED'),
      choice(
        seq($._newline, optional($._body), prec(2, ci('END'))),
        optional($._then_body),
      ),
    )),

    // =========================================
    // Expressions
    // =========================================
    _expression: $ => choice(
      $._primary_expression,
      $.unary_expression,
      $.binary_expression,
      $.logical_expression,
      $.comparison_expression,
      $.concatenation_expression,
      $.match_expression,
      $.if_expression,
      $.function_call,
      $.at_variable,
      $.at_function,
      $.parenthesized_expression,
      $.dynamic_array_access,
      $.substring_expression,
      $.array_access,
      $.format_expression,
    ),

    _primary_expression: $ => choice(
      $.identifier,
      $.number,
      $.string,
    ),

    lhs_expression: $ => choice(
      $.identifier,
      $.array_access,
      $.dynamic_array_access,
      $.substring_expression,
    ),

    parenthesized_expression: $ => seq('(', $._expression, ')'),

    unary_expression: $ => choice(
      prec(9, seq('-', $._expression)),
      prec(9, seq(ci('NOT'), $._expression)),
    ),

    binary_expression: $ => choice(
      prec.left(7, seq($._expression, '^', $._expression)),
      prec.left(7, seq($._expression, '**', $._expression)),
      prec.left(6, seq($._expression, '*', $._expression)),
      prec.left(6, seq($._expression, '/', $._expression)),
      prec.left(5, seq($._expression, '+', $._expression)),
      prec.left(5, seq($._expression, '-', $._expression)),
    ),

    logical_expression: $ => choice(
      prec.left(1, seq($._expression, ci('AND'), $._expression)),
      prec.left(1, seq($._expression, '&', $._expression)),
      prec.left(0, seq($._expression, ci('OR'), $._expression)),
      prec.left(0, seq($._expression, '!', $._expression)),
    ),

    comparison_expression: $ => prec.left(3, seq(
      $._expression,
      choice(
        '=', '#', '<>', '><',
        '<', '>', '<=', '>=', '=>', '=<', '#>',  '#<',
        ci('EQ'), ci('NE'), ci('LT'), ci('GT'), ci('LE'), ci('GE'),
      ),
      $._expression,
    )),

    concatenation_expression: $ => choice(
      prec.left(4, seq($._expression, choice(':', ci('CAT')), $._expression)),
      prec(4, seq($._expression, ':')),
    ),

    match_expression: $ => prec.left(3, seq(
      $._expression,
      choice(ci('MATCH'), ci('MATCHES')),
      $._expression,
    )),

    if_expression: $ => prec.right(2, seq(
      ci('IF'),
      $._expression,
      ci('THEN'),
      $._expression,
      ci('ELSE'),
      $._expression,
    )),

    format_expression: $ => prec.left(2, seq(
      $._expression,
      $.format_string,
    )),

    format_string: _ => /[0-9]*[RLT][#0-9]*/,

    // =========================================
    // Array/Dynamic Array Access
    // =========================================
    array_access: $ => prec(10, seq(
      $.identifier,
      '(',
      $._expression,
      optional(seq(',', $._expression)),
      ')',
    )),

    // The closing '>' carries explicit lexical precedence so it beats the
    // longer '>=' token. Without this, `A<1,2>=B` lexes as `A` `<` `1` `,` `2`
    // `>=` `B` and the extraction is never closed — by far the most common
    // parse failure in real UniVerse code, where subscripted assignment is
    // written without spaces (`LOC.ARR<2,POS>=LOC.ARR<2,POS>+OON`).
    dynamic_array_access: $ => prec(10, seq(
      choice($.identifier, $.array_access),
      token.immediate('<'),
      $._expression,
      optional(seq(',', $._expression, optional(seq(',', $._expression)))),
      token(prec(1, '>')),
    )),

    // `function_call` is a valid substring base too — confirmed against real code
    // (logistic-ru-poc corpus, NVLG2415B): `FIELD(ACCDATE,'/',3)[3,2]` applies a
    // substring extraction directly to a function call's return value.
    substring_expression: $ => prec(10, seq(
      choice($.identifier, $.array_access, $.dynamic_array_access, $.function_call),
      '[',
      $._expression,
      ',',
      $._expression,
      ']',
    )),

    // =========================================
    // Function Calls
    // =========================================
    function_call: $ => prec(10, seq(
      $.identifier,
      $.argument_list,
    )),

    argument_list: $ => seq('(', optional(commaSep1(choice($._expression, $.mat_argument))), ')'),

    mat_argument: $ => seq(ci('MAT'), $.identifier),

    // =========================================
    // @Variables
    // =========================================
    at_variable: _ => token(seq('@', /[a-zA-Z][a-zA-Z0-9._]*/)),

    at_function: $ => seq('@', '(', $._expression, optional(seq(',', $._expression)), ')'),

    // =========================================
    // Terminals
    // =========================================
    identifier: _ => /[a-zA-Z$][a-zA-Z0-9._$%]*/,

    number: _ => token(choice(
      // Integer
      /[0-9]+/,
      // Decimal
      /[0-9]*\.[0-9]+/,
      /[0-9]+\.[0-9]*/,
      // Scientific notation
      /[0-9]*\.?[0-9]+[eE][+-]?[0-9]+/,
    )),

    string: _ => choice(
      seq('"', /[^"\n]*/, '"'),
      seq("'", /[^'\n]*/, "'"),
      seq('\\', /[^\\\n]*/, '\\'),
    ),
  },
});

/**
 * Comma-separated list (optional elements)
 */
function commaSep(rule) {
  return optional(commaSep1(rule));
}

/**
 * Comma-separated list (at least one element)
 */
function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)));
}
