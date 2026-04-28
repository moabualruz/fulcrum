## When to use

- The user wants to interact with a GitHub artifact: pull request, issue, release, workflow run, gist, or repo metadata.
- The agent is about to call the GitHub REST or GraphQL API — `gh api` carries auth, paging, and rate-limit handling for free.
- The user pipes `curl` against `api.github.com` or scrapes `github.com/...` HTML — almost always wants `gh`.
- A workflow needs watching, a release needs publishing, or a PR body is longer than a tweet (use `--body-file`).
- The user asks to search code/repos/issues across GitHub (`gh search`).

**Skip** for: local-only git work (`git commit`, `git rebase`, `git log`); non-GitHub remotes (GitLab → `glab`, Gitea → `tea`, Bitbucket); CI providers other than GitHub Actions (Jenkins, CircleCI, Buildkite).
