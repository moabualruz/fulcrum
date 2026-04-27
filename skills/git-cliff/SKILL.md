---
name: git-cliff
description: Use this skill whenever the user wants to generate a changelog, create release notes from git history, update CHANGELOG.md before tagging a release, produce a changelog from conventional commits, or summarize commits since the last tag. Trigger phrases include "generate a changelog", "create release notes from git history", "update CHANGELOG.md before release", "produce changelog from conventional commits", "summarize commits since last tag", "what changed since v1.0", "bump version and write changelog". git-cliff parses conventional commits via `cliff.toml` and is configured per-repo. Skip this skill for raw `git log` surveys, GitHub Releases UI work (use `gh release`), contributor lists (use `git shortlog`), or hand-written announcement copy.
---

# git-cliff

## When to use

- The user wants a CHANGELOG.md regenerated, prepended, or initialized from conventional commits.
- A release is imminent and the unreleased section needs to be promoted to a versioned entry — `git-cliff --tag vX.Y.Z`.
- The user asks "what changed since the last tag" and wants release-quality grouping (Features / Bug Fixes / …), not a raw commit list.
- The agent is preparing a release commit that must include the updated CHANGELOG **before** the tag is cut.
- The repo already has a `cliff.toml` (this one does — see `/Users/mkh/workspace/fulcrum/cliff.toml`) and `bun run changelog` is wired up.

**Skip** for: raw history survey (`git log --oneline`); contributor stats (`git shortlog -sne`); creating the GitHub Release page (`gh release create`); free-form release announcements (write prose, not parse commits); commit-message linting (use a `commit-msg` hook, not git-cliff).

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

## Patterns

### Pattern A — pre-release: bump + prepend

```bash
git-cliff --bump --unreleased --prepend CHANGELOG.md
git add CHANGELOG.md
git commit -m "chore(release): vX.Y.Z"
git tag vX.Y.Z
```

`--bump` reads commit types since the last tag and computes the next semver. `--prepend` keeps prior sections intact — never regenerate from scratch on a routine release.

### Pattern B — minimal `cliff.toml`

```toml
[changelog]
header = "# Changelog\n"
body = """
{% if version %}## [{{ version }}] - {{ timestamp | date(format="%Y-%m-%d") }}
{% else %}## [unreleased]{% endif %}
{% for group, commits in commits | group_by(attribute="group") %}
### {{ group | upper_first }}
{% for commit in commits %}- {{ commit.message | upper_first }}
{% endfor %}{% endfor %}
"""
trim = true

[git]
conventional_commits = true
filter_unconventional = false
tag_pattern = "v[0-9]*"
sort_commits = "oldest"
commit_parsers = [
    { message = "^feat",                group = "Features" },
    { message = "^fix",                 group = "Bug Fixes" },
    { message = "^docs?",               group = "Documentation" },
    { message = "^perf",                group = "Performance" },
    { message = "^refactor",            group = "Refactor" },
    { message = "^test",                group = "Tests" },
    { message = "^chore\\(release\\):", skip  = true },
    { message = "^Merge ",              skip  = true },
    { message = "^chore",               group = "Chores" },
    { message = ".*",                   group = "Other" },
]
```

Group order in the output mirrors the order parsers appear in this list. The `.*` catch-all + `filter_unconventional = false` keeps free-form commits visible under "Other" rather than dropping them silently.

### Pattern C — commit parsers and skipping

```toml
{ message = "^chore\\(release\\):", skip = true }   # release commits
{ message = "^Merge ",              skip = true }   # merge commits
{ message = "^wip",                 skip = true }   # WIP noise
{ body    = "BREAKING CHANGE",      group = "Breaking" }
{ message = "^feat\\(api\\)",       group = "API Features" }   # narrower wins if listed first
```

Each parser row maps a regex (`message`, `body`, or `footer`) to either a `group` or `skip = true`. Parsers are tried in order — put the most specific patterns first.

### Pattern D — templating with Tera

The `[changelog].body` template is [Tera](https://keats.github.io/tera/docs/) (Rust). Common helpers:

```text
{{ commit.message | upper_first }}
{{ commit.id | truncate(length=7, end="") }}
{{ timestamp | date(format="%Y-%m-%d") }}
{% if commit.breaking %}[**breaking**] {% endif %}
{% if commit.scope %}*({{ commit.scope }})* {% endif %}
{{ remote.url | default(value="https://github.com/owner/repo") }}/commit/{{ commit.id }}
```

Iterate with `{% for group, commits in commits | group_by(attribute="group") %}`. Filters chain with `|`.

### Pattern E — release workflow

```bash
# 1. Decide version (or let git-cliff bump)
NEXT=$(git-cliff --bumped-version)            # prints v0.3.0 etc., no file write

# 2. Update CHANGELOG (prepend so history is stable)
git-cliff --tag "$NEXT" --unreleased --prepend CHANGELOG.md

# 3. Commit, then tag — the tag points at the commit that CONTAINS the changelog
git add CHANGELOG.md
git commit -m "chore(release): $NEXT"
git tag "$NEXT"

# 4. Push commit + tag, then create the GitHub Release
git push --follow-tags
gh release create "$NEXT" --notes "$(git-cliff --latest --strip all)"
```

The changelog must be in the tagged commit so `git show vX.Y.Z:CHANGELOG.md` matches the release.

### Pattern F — output ranges and selection

```bash
git-cliff vX..vY                 # commits between two tags
git-cliff --include-path 'src/**' --exclude-path 'docs/**'   # path-scoped
git-cliff --topo-order           # topological order (good for merges)
git-cliff --strip all            # drop header/footer (for embedding elsewhere)
```

`--strip` is useful when piping into `gh release create --notes` so the page doesn't double up the title.

## Anti-patterns

- **Don't regenerate `CHANGELOG.md` from scratch each release.** Use `--prepend` or `--unreleased`. Full regeneration churns the diff and risks dropping manually edited entries.
- **Don't rely on commit-message linting at release time.** Catch malformed commits at `commit-msg` time (e.g. commitlint, conform). At release the bad commit is already in history.
- **Don't include `chore(release):` commits in the changelog.** Add `{ message = "^chore\\(release\\):", skip = true }` to `commit_parsers` or each release entry will list its own bump commit.
- **Don't push a release tag before regenerating CHANGELOG.md.** The changelog must live IN the tagged commit. If the tag is one commit ahead of the changelog edit, `git show TAG:CHANGELOG.md` lies.
- **Don't mix conventional and free-form messages without configuring it.** Either set `filter_unconventional = false` and accept an "Other" bucket, or enforce conventional commits at commit time. The default silently drops non-matching commits.
- **Don't forget `repository` (or `--repository`) in `cliff.toml`.** Without it, commit links and the `remote.url` template variable resolve to a default that doesn't match this repo.
- **Don't run `git-cliff` against a shallow clone.** It needs full history to walk tags. CI: `actions/checkout@v4` with `fetch-depth: 0`.
- **Don't put the most generic regex first in `commit_parsers`.** `.*` swallows everything; specific rules below it never fire.

## Cross-refs

- Behavioral rule: `rules/AGENTS.md` §4 — "use `git-cliff` for CHANGELOGs; conventional commits format".
- This repo's config: `/Users/mkh/workspace/fulcrum/cliff.toml` (Features / Bug Fixes / Refactor / Documentation / Performance / Tests / Build/CI / Styling / Chores / Other; tags match `v[0-9]*`).
- This repo's runner: `bun run changelog` → `git-cliff -o CHANGELOG.md`.
- Pairs with: `release-please`, `semantic-release` (heavier, opinionated). git-cliff is the language-agnostic, lightweight option — own the `cliff.toml` and you own the format.
- Manual: <https://git-cliff.org/docs/>
- Configuration: <https://git-cliff.org/docs/configuration>
- Tera templating: <https://keats.github.io/tera/docs/>
