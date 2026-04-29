## When to use

- The user wants a CHANGELOG.md regenerated, prepended, or initialized from conventional commits.
- A release is imminent and the unreleased section needs to be promoted to a versioned entry — `git-cliff --tag vX.Y.Z`.
- The user asks "what changed since the last tag" and wants release-quality grouping (Features / Bug Fixes / …), not a raw commit list.
- The agent is preparing a release commit that must include the updated CHANGELOG **before** the tag is cut.
- The repo already has a `cliff.toml` (this one does — see `/Users/mkh/workspace/fulcrum/cliff.toml`) and `bun run changelog` is wired up.

**Skip** for: raw history survey (`git log --oneline`); contributor stats (`git shortlog -sne`); creating the GitHub Release page (`gh release create`); free-form release announcements (write prose, not parse commits); commit-message linting (use a `commit-msg` hook, not git-cliff).
