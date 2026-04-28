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
