## When to use

- The user wants to substitute a string or regex inside one or more files and is reaching for `sed -i 's/.../.../g'`.
- The agent needs to rename a symbol across a tree (`fd -t f -e ts -x sd 'old' 'new'`).
- The replacement involves capture groups, slashes, or other characters that make sed quoting painful.
- The user asks to preview a change before mutating files.

**Skip** for: deleting/inserting whole lines or address-scoped edits (use `sed`/`awk`); searching without replacing (`rg`); finding files (`fd`); refactors that must understand syntax — function renames, type changes (`ast-grep`).
