## Invocation

```bash
# Always discover first — never guess a recipe name
just --list                          # full table
just -l                              # short alias
just --summary                       # space-separated one-liner
just --show <recipe>                 # print the recipe body without running
just --evaluate                      # show all variables and their resolved values

# Run a recipe (recipe args come after the recipe name)
just <recipe>
just <recipe> arg1 arg2

# Use a justfile elsewhere (no chdir to its directory)
just --justfile path/to/justfile <recipe>

# Run as if from a different directory (cd-equivalent)
just -d path/to/dir <recipe>

# Override variables and shell
just --set name=value <recipe>
just --shell bash <recipe>

# Custom working directory (rarely needed — recipes assume justfile's dir)
just --working-directory /tmp <recipe>
```

just walks up from the current directory looking for `justfile` / `.justfile` / `Justfile` (case-insensitive on case-insensitive filesystems), so you can invoke from any subdirectory.
