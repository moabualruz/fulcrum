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

`--squash` / `--rebase` / `--merge` pick the strategy; pair with `--auto` to queue once checks pass.

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

`gh run watch` replaces `while sleep 30; do gh run list ...; done` — it streams status and exits with the run's conclusion.

### Pattern E — releases

```bash
gh release list --limit 5 --json tagName,publishedAt,isLatest
gh release view v1.4.0 --json assets,body
gh release download v1.4.0 --pattern '*.tar.gz' --dir ./dist
gh release create v1.5.0 --notes-file CHANGELOG.md --target main ./dist/*.tar.gz
gh release create v1.5.0-rc1 --prerelease --generate-notes
```

`--generate-notes` lets GitHub auto-render commit summaries; `--notes-file -` reads stdin.

### Pattern F — JSON shaping with `--jq` and `--template`

```bash
# Inline jq — same syntax as the jq skill, no extra pipe
gh pr list --json number,title,labels --jq '.[] | select(.labels | map(.name) | index("urgent")) | .number'

# Go-template for human output (no quotes/brackets)
gh pr list --json number,title,author \
  --template '{{range .}}#{{.number}} ({{.author.login}}) {{.title}}{{"\n"}}{{end}}'
```

Use `--jq` when piping to another tool, `--template` when rendering for humans. List queryable fields with `gh pr list --json 2>&1 | head` (any unknown `--json` arg prints the available set).

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

`--fill` populates title/body from the latest commit — handy for stacked-PR workflows.
