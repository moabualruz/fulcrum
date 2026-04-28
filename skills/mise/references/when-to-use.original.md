## When to use

- The repo contains a `.mise.toml`, `mise.toml`, or `.tool-versions` file and the user (or you) needs to install or run with the right toolchain.
- The user asks "what version of node/python/go does this repo need?" — `mise current` is the answer.
- The user wants to pin a runtime per project, switch versions when `cd`-ing, or replace asdf with something faster.
- The agent is about to invoke `node`, `python`, `go`, etc. in a non-interactive shell where `mise activate` did not run — reach for `mise exec` or `mise activate --shims`.

**Skip** for: system packages (`brew`, `apt`, `yum`, `pacman`); container/image management (`docker`, `podman`); per-project *env vars only* without tools (`direnv`); language-internal virtualenvs (`python -m venv`, `poetry`, `uv venv`); dependency vulnerability scans (`osv-scanner`, `npm audit`).
