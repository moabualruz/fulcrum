## Invocation

```bash
# One-time per shell: install the hook (put this in ~/.bashrc / ~/.zshrc / config.fish)
eval "$(direnv hook bash)"
eval "$(direnv hook zsh)"
direnv hook fish | source        # fish

# Per-project lifecycle
echo 'export FOO=bar' > .envrc   # author
direnv allow                     # cryptographically allowlist *this content*
direnv reload                    # re-evaluate after editing
direnv status                    # debug: shows loaded RC, allow state, watched files
direnv deny                      # revoke trust until next `allow`
direnv edit                      # open in $EDITOR and auto-allow on save

# Run a command with the .envrc applied without a hook (CI, scripts, agents)
direnv exec . <command>          # use the .envrc in this dir
direnv exec /path/to/proj make   # or any other dir
```

`direnv allow` records a hash of the current `.envrc` contents. Any edit invalidates the allow and the env unloads until you re-allow — that is the entire security model.
