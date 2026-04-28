## Anti-patterns

- **Don't regenerate `CHANGELOG.md` from scratch each release.** Use `--prepend` or `--unreleased`. Full regeneration churns the diff and risks dropping manually edited entries.
- **Don't rely on commit-message linting at release time.** Catch malformed commits at `commit-msg` time (e.g. commitlint, conform). At release the bad commit is already in history.
- **Don't include `chore(release):` commits in the changelog.** Add `{ message = "^chore\\(release\\):", skip = true }` to `commit_parsers` or each release entry will list its own bump commit.
- **Don't push a release tag before regenerating CHANGELOG.md.** The changelog must live IN the tagged commit. If the tag is one commit ahead of the changelog edit, `git show TAG:CHANGELOG.md` lies.
- **Don't mix conventional and free-form messages without configuring it.** Either set `filter_unconventional = false` and accept an "Other" bucket, or enforce conventional commits at commit time. The default silently drops non-matching commits.
- **Don't forget `repository` (or `--repository`) in `cliff.toml`.** Without it, commit links and the `remote.url` template variable resolve to a default that doesn't match this repo.
- **Don't run `git-cliff` against a shallow clone.** It needs full history to walk tags. CI: `actions/checkout@v4` with `fetch-depth: 0`.
- **Don't put the most generic regex first in `commit_parsers`.** `.*` swallows everything; specific rules below it never fire.
