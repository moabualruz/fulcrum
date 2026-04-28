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
