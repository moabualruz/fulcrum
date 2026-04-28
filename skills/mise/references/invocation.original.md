## Invocation

```bash
# Install everything declared in .mise.toml / .tool-versions (idempotent)
mise install

# Set a per-project (local) version — writes/updates .mise.toml in cwd
mise use python@3.12
mise use node@22 go@1.23

# Set a global version — writes ~/.config/mise/config.toml
mise use -g node@22

# What is active right now (resolved per-tool)?
mise current
mise current python

# What is installed (across all tools, all versions)?
mise ls
mise ls python

# Drift report against latest releases
mise outdated
mise upgrade            # bumps installed versions per the spec

# Run a one-shot in a tool version without activating
mise exec node@22 -- node app.js
mise exec -- pytest     # uses the resolved version from .mise.toml

# Print the env mise would set (PATH, [env] vars)
mise env
mise env -s bash        # eval-able

# Set tool versions for the current shell session (alias: `mise sh`).
# Prints export statements; must be eval'd. Does NOT spawn a subshell.
eval "$(mise shell node@22 python@3.12)"

# To actually launch a subshell with the tools active, use `mise exec`:
mise exec node@22 -- bash
```
