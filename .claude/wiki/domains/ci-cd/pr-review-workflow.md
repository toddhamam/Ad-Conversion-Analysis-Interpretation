---
title: PR Review Workflow
type: entity
sources: [raw/claude-md.md]
related: [[sentry-monitoring]], [[ci-auto-fix]], [[code-quality-principles]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# PR Review Workflow

`claude-pr-review.yml` — two jobs using `claude-code-action` (Sonnet 4.6) [source: raw/claude-md.md].

## Auto-Review (on PR open/update)

Checks for: security vulnerabilities, logic bugs, performance issues (`transition: all`, missing AbortController timeouts, base64 memory leaks), Vercel function count (12 limit), CSS variable usage, Meta token exposure, `catch (error: any)` violations.

`continue-on-error: true` — failures never block merges.

## @claude Respond

Triggers on `@claude` mentions in PR/issue comments. Accepts comments from `github-actions[bot]` to enable [[ci-auto-fix]] chaining.

## Sentry Auto-Triage (`sentry-auto-triage.yml`)

Weekdays 8am UTC. Fetches unresolved issues via REST API, classifies severity, creates fix PRs for critical/high, files GitHub issues for the rest.

## Known Limitations

- PRs modifying workflow files fail auto-review (expected, non-blocking)
- `claude-code-action` SDK crashes with explicit model specification
- `workflow_dispatch`/`schedule` triggers crash without PR context — use bash scripts
- **API billing**: `ANTHROPIC_API_KEY` (not subscription), ~$30-80/month

## Related

- [[sentry-monitoring]] — Error tracking that feeds into triage
- [[ci-auto-fix]] — How deploy failures chain into PR fixes
- [[code-quality-principles]] — Standards enforced by review
