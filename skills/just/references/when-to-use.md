## When to use

- The repo has a `justfile`, `Justfile`, or `.justfile` and the user (or you) wants to run, list, or inspect a recipe.
- The user asks "what tasks does this project expose?" or "how do I build/test/lint this repo?" — `just --list` is the answer.
- The user asks for a Makefile-style runner but the repo uses just (recipe args go after the recipe, not as `VAR=value`).
- The agent is about to run a script that already exists as a recipe — prefer the recipe so dependencies and shell config apply.

**Skip** for: plain `Makefile` (use `make`), `package.json` scripts (use `npm run` / `pnpm run` / `bun run`), `Taskfile.yml` (use `task`), language task runners (`cargo`, `gradle`, `mix`, `dotnet run`), or one-off shell commands that aren't in the justfile.
