---
name: gh
description: Use this skill whenever the user works with GitHub from the command line — listing or viewing pull requests, creating PRs and issues, reviewing or merging, watching workflow runs, downloading release assets, or hitting the REST/GraphQL API. Trigger phrases include "open a pull request", "merge this PR", "list my issues", "review the PR", "watch the CI run", "download the release asset", "create a release", "comment on the issue", "check the workflow status", "search GitHub for", "clone the repo", "call the GitHub API". Prefer this skill over raw `git` for anything PR/issue/release/workflow-related, over `curl` for the GitHub REST API, and over hand-built scripts that scrape the web UI. Skip for purely local git operations (commits, branches, rebases) and for non-GitHub forges (GitLab, Gitea, Bitbucket).
---

# gh

## When to use

- User want interact with GitHub artifact: pull request, issue, release, workflow run, gist, repo metadata.
- Agent about call GitHub REST/GraphQL API — `gh api` carry auth, paging, rate-limit free.
- User pipe `curl` against `api.github.com` or scrape `github.com/...` HTML — almost always want `gh`.
- Workflow need watching, release need publishing, PR body longer than tweet (use `--body-file`).
- User search code/repos/issues across GitHub (`gh search`).

**Skip** for: local-only git work (`git commit`, `git rebase`, `git log`); non-GitHub remotes (GitLab → `glab`, Gitea → `tea`, Bitbucket); CI providers other than GitHub Actions (Jenkins, CircleCI, Buildkite).

## Invocation

```bash
# Auth check first when anything fails
gh auth status

# Authenticate non-interactively (token on stdin, never on argv)
gh auth login --with-token < ~/.config/gh/token

# JSON output + jq pipeline (the most common agent shape)
gh pr list --state open --json number,title,author --jq '.[] | "\(.number) \(.author.login) \(.title)"'

# Raw API call with paging
gh api --paginate repos/OWNER/REPO/issues --jq '.[].number'

# Long bodies via file or stdin (never -b "$VAR" with markdown)
gh pr create --title "..." --body-file PR_BODY.md
git diff main | gh pr create --title "..." --body-file -
```

## Patterns

### Pattern A — pull request lifecycle

```bash
gh pr list --state open --assignee @me --json number,title,headRefName
gh pr view 123 --json title,body,reviews,statusCheckRollup
gh pr create --base main --head feat/x --title "..." --body-file PR_BODY.md --draft
gh pr checkout 123                      # local branch tracking the PR
gh pr review 123 --approve --body "LGTM"
gh pr merge 123 --squash --delete-branch
gh pr comment 123 --body-file note.md
```

`--squash` / `--rebase` / `--merge` pick strategy; pair `--auto` to queue once checks pass.

### Pattern B — issues

```bash
gh issue list --label bug --state open --assignee @me --json number,title,labels
gh issue view 42 --comments
gh issue create --title "..." --body-file ISSUE.md --label bug --assignee @me
gh issue edit 42 --add-label triage --remove-label needs-info
gh issue comment 42 --body-file reply.md
gh issue close 42 --comment "Fixed in #45" --reason completed
gh issue transfer 42 owner/other-repo
```

### Pattern C — `gh api` for anything without a subcommand

```bash
# GET with paging (handles Link headers)
gh api --paginate "repos/OWNER/REPO/commits?since=2026-01-01" --jq '.[].sha'

# POST with typed fields: -F = number/bool/null, -f = string, --raw-field = literal string with @file/@-
gh api --method POST repos/OWNER/REPO/issues \
  -f title="API created" \
  -f body="$(cat ISSUE.md)" \
  -F draft=false

# GraphQL
gh api graphql -f query='query($n:String!){repository(owner:"o",name:$n){stargazerCount}}' -F n=fulcrum

# Hit a different host (Enterprise)
gh api --hostname github.example.com user
```

### Pattern D — workflow runs

```bash
gh run list --workflow ci.yml --branch main --limit 5 --json databaseId,status,conclusion,headSha
gh run watch <run-id>                   # blocks until terminal, exits non-zero on failure
gh run view <run-id> --log-failed       # only the failed step logs
gh run rerun <run-id> --failed          # re-run only failed jobs
gh run download <run-id> --name artifact-name --dir ./out
```

`gh run watch` replace `while sleep 30; do gh run list ...; done` — stream status, exit with run conclusion.

### Pattern E — releases

```bash
gh release list --limit 5 --json tagName,publishedAt,isLatest
gh release view v1.4.0 --json assets,body
gh release download v1.4.0 --pattern '*.tar.gz' --dir ./dist
gh release create v1.5.0 --notes-file CHANGELOG.md --target main ./dist/*.tar.gz
gh release create v1.5.0-rc1 --prerelease --generate-notes
```

`--generate-notes` let GitHub auto-render commit summaries; `--notes-file -` read stdin.

### Pattern F — JSON shaping with `--jq` and `--template`

```bash
# Inline jq — same syntax as the jq skill, no extra pipe
gh pr list --json number,title,labels --jq '.[] | select(.labels | map(.name) | index("urgent")) | .number'

# Go-template for human output (no quotes/brackets)
gh pr list --json number,title,author \
  --template '{{range .}}#{{.number}} ({{.author.login}}) {{.title}}{{"\n"}}{{end}}'
```

Use `--jq` when pipe to another tool, `--template` when render for humans. List queryable fields with `gh pr list --json 2>&1 | head` (any unknown `--json` arg print available set).

### Pattern G — search, repo, and clone

```bash
gh search repos --language=rust --stars=">1000" --sort=updated --limit 20 --json name,url,stargazersCount
gh search code 'tokio::spawn language:rust' --limit 10
gh search issues 'is:open author:@me org:my-org'
gh repo view OWNER/REPO --json description,defaultBranchRef,licenseInfo
gh repo clone OWNER/REPO -- --depth=1            # args after `--` go to git
gh repo list my-org --limit 200 --json name,isArchived --jq '.[] | select(.isArchived | not) | .name'
```

### Pattern H — aliases and config

```bash
gh alias set prc 'pr create --fill --web'
gh alias set bugs 'issue list --label bug --state open'
gh config set pager 'less -FRX'
gh config set editor 'code --wait'
gh config set git_protocol ssh --host github.com
```

`--fill` populate title/body from latest commit — handy for stacked-PR workflows.

## Anti-patterns

- **Don't pass markdown bodies through `-b "$VAR"`.** Backticks, quotes, `$` in body get eaten by shell. Use `--body-file path.md` or `--body-file -` and read from stdin.
- **Don't `grep` `gh ... --json` output.** Key order not stable, values may contain newlines. Use `--jq` (built-in) or pipe to `jq`.
- **Don't poll workflow with `while sleep 10; do gh run list ...`.** Use `gh run watch <id>` — stream progress, exit with run conclusion code.
- **Don't paginate by hand** with `--page 2`, `--page 3`, … `--paginate` walk `Link: rel="next"` headers, concatenate results into one stream.
- **Don't put tokens on argv.** `gh auth login --with-token < token.txt` keep secret out of `ps`, shell history, command logs. Never `gh auth login --with-token "$TOKEN"`.
- **Don't reach for `gh api repos/o/r/pulls/123`** when `gh pr view 123` exist. Subcommands carry sensible field selection, terminal formatting, errors; raw `gh api` for endpoints with no dedicated wrapper.
- **Don't shell out to `curl https://api.github.com/...`** in script that already have `gh` — re-implement auth, paging, retries, rate-limit handling badly. `gh api` do all four.
- **Don't assume default branch `main`.** `gh pr create --base $(gh repo view --json defaultBranchRef --jq .defaultBranchRef.name)` or omit `--base` and let `gh` infer.

## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — "use `gh` for any GitHub interaction; never scrape the web UI".
- JSON pipelines: `skills/jq/SKILL.md` — `gh ... --json | jq` canonical agent shape; `--jq` skip pipe entirely.
- Manual: <https://cli.github.com/manual/>
- API helper reference: <https://cli.github.com/manual/gh_api>