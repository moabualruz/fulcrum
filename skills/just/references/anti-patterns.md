## Anti-patterns

- **Don't guess recipe names.** Run `just --list` (or `just -l`) first. Recipes are repo-specific and frequently renamed.
- **Don't run `just <recipe>` blind on something that might deploy, migrate, or push.** Preview with `just --show <recipe>` and read the body first.
- **Don't assume bash.** The default shell is POSIX `sh`. Check for `set shell := [...]` at the top of the justfile before relying on bash features.
- **Don't override `--working-directory`** unless you understand it. Recipes typically assume the justfile's directory; overriding breaks any relative path inside.
- **Don't confuse with `make`.** `make test FOO=foo` becomes `just test foo` (positional). For variable overrides use `just --set FOO=foo test`, not `FOO=foo just test` (the env var won't bind to a recipe variable unless `set export` or the recipe reads `env_var("FOO")`).
- **Don't ignore exit codes.** A failed recipe exits non-zero; chain with `&&` rather than `;` if subsequent steps depend on success.
- **Don't edit a recipe to "test" something.** Use `just --set name=value` or pass arguments — keep the justfile clean for everyone else.
