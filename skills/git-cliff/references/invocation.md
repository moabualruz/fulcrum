## Invocation

```bash
# Full history into CHANGELOG.md (default config = ./cliff.toml)
git-cliff -o CHANGELOG.md

# Label the unreleased section with a version (use just before tagging)
git-cliff --tag v1.2.0 -o CHANGELOG.md

# Only commits since the last tag
git-cliff --unreleased

# Only the most recent tag's section
git-cliff --latest

# Only commits reachable from the current branch
git-cliff --current

# Arbitrary commit range
git-cliff v1.0.0..HEAD

# Auto-detect next semver from commit types (feat→minor, fix→patch, !→major)
git-cliff --bump

# Prepend a new section to the top of an existing file (preserves history)
git-cliff --unreleased --tag v1.2.0 --prepend CHANGELOG.md

# Override repository for commit links
git-cliff --repository https://github.com/owner/repo -o CHANGELOG.md

# In this repo
bun run changelog                                   # = git-cliff -o CHANGELOG.md
```

Output is markdown by default; pipe to stdout by omitting `-o`.
