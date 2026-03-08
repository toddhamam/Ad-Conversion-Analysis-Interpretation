Set up GitHub Actions CI/CD automations for this repo. Follow these proven patterns from our Convertra repo.

## What to create

### 1. PR Review (`claude-pr-review.yml`)
Auto-reviews every PR for bugs, security issues, and project conventions. Also responds to `@claude` mentions in PR comments.

```yaml
name: Claude PR Review

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  pull_request:
    types: [opened, synchronize]

permissions:
  contents: read
  pull-requests: write
  issues: write
  id-token: write

jobs:
  auto-review:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    continue-on-error: true
    steps:
      - uses: actions/checkout@v4
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            Review this PR. Focus on:
            1. Security vulnerabilities (XSS, injection, token exposure, OWASP top 10)
            2. Logic errors and definite bugs
            3. Performance issues

            Do NOT flag: style preferences, formatting, missing comments, pre-existing issues, or anything a linter would catch.
            Only comment on high-signal issues that could cause production problems.

            [READ THE REPO'S CLAUDE.md FOR PROJECT-SPECIFIC CONVENTIONS AND ADD THEM HERE]
          claude_args: "--max-turns 5"

  respond:
    if: |
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '@claude')) ||
      (github.event_name == 'pull_request_review_comment' && contains(github.event.comment.body, '@claude'))
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          allowed_bots: "github-actions[bot]"
          claude_args: "--max-turns 10"
```

### 2. Daily Health Monitor (`daily-health-monitor.yml`)
IMPORTANT: Use plain bash, NOT claude-code-action. The SDK crashes on workflow_dispatch/schedule triggers.

Adapt the checks to whatever services this repo uses (database, APIs, external services). Post results to Telegram.

```yaml
name: Daily Health Monitor

on:
  schedule:
    - cron: '0 7 * * *'
  workflow_dispatch:

jobs:
  health-check:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Run health checks and notify Telegram
        env:
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          # Add other secrets as needed
        run: |
          REPORT=""
          # Add curl-based health checks here
          # Post to Telegram:
          curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
            -d "chat_id=-1003806442463" \
            -d "message_thread_id=THREAD_ID_HERE" \
            -d "parse_mode=Markdown" \
            --data-urlencode "text=$REPORT"
```

### 3. CI Auto-Fix (`ci-auto-fix.yml`)
Detects failed deployments, reproduces the build, posts errors to PR with @claude tag so the respond job fixes it.

```yaml
name: CI Auto-Fix

on:
  deployment_status:

permissions:
  contents: write
  pull-requests: write
  issues: write
  id-token: write

jobs:
  auto-fix:
    if: github.event.deployment_status.state == 'failure'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    continue-on-error: true
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.deployment.sha }}
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install dependencies
        run: npm ci 2>&1 | tail -5
      - name: Reproduce build failure
        id: build
        continue-on-error: true
        run: npm run build 2>&1 | tee /tmp/build-output.txt
      - name: Find PR and post errors
        if: steps.build.outcome == 'failure'
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          SHA="${{ github.event.deployment.sha }}"
          PR=$(gh pr list --search "$SHA" --state open --json number --jq '.[0].number // empty')
          if [ -z "$PR" ]; then
            BRANCH=$(git branch -r --contains "$SHA" 2>/dev/null | grep -v HEAD | head -1 | sed 's|origin/||' | xargs)
            [ -n "$BRANCH" ] && PR=$(gh pr list --head "$BRANCH" --state open --json number --jq '.[0].number // empty')
          fi
          if [ -n "$PR" ]; then
            ERRORS=$(tail -80 /tmp/build-output.txt)
            cat > /tmp/comment.md << 'HEADER'
          ## Build Failed — Auto-Fix Requested
          <details><summary>Build output</summary>

          ```
          HEADER
            echo "$ERRORS" >> /tmp/comment.md
            echo '```' >> /tmp/comment.md
            echo '</details>' >> /tmp/comment.md
            echo '' >> /tmp/comment.md
            echo '@claude Fix these build errors. Read the errors, identify the root cause, fix the code, and verify with `npm run build`.' >> /tmp/comment.md
            gh pr comment "$PR" --body-file /tmp/comment.md
          fi
```

## Setup steps

1. **Install the Claude GitHub App**: https://github.com/apps/claude — install on the repo
2. **Add `ANTHROPIC_API_KEY` secret**: GitHub repo → Settings → Secrets and variables → Actions → New repository secret
3. **Add `TELEGRAM_BOT_TOKEN` secret** (if using health monitor): Get from @BotFather in Telegram
4. **Read the repo's CLAUDE.md** and customize the PR review prompt with project-specific conventions
5. **Create a Telegram topic** for health reports and update the `message_thread_id`
6. **Commit and push** the workflow files to main (they must be on the default branch for workflow validation to pass)

## Known limitations

- **Do NOT set `--model` in claude_args or settings** — causes SDK crash (`@anthropic-ai/claude-agent-sdk@0.2.70`). Use the default (Sonnet 4.6).
- **Do NOT use claude-code-action for schedule/workflow_dispatch triggers** — SDK crashes without PR context. Use plain bash instead.
- **First PR after adding workflows will fail auto-review** with "Workflow validation failed" — this is expected and self-resolving. The `continue-on-error: true` prevents it from blocking merges.
- **API billing**: These workflows use the Anthropic API key (separate from Claude Code subscription). Estimated ~$30-80/month depending on PR volume.
