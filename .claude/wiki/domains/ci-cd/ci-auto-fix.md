---
title: CI Auto-Fix
type: entity
sources: [raw/claude-md.md]
related: [[pr-review-workflow]], [[vercel-deployment]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# CI Auto-Fix

`ci-auto-fix.yml` triggers on failed Vercel deployments [source: raw/claude-md.md].

## Flow

1. Checks out failing commit
2. Reproduces build locally (`npm run build`) to capture error output
3. Finds associated PR from commit SHA
4. Posts build errors as PR comment with `@claude` tag
5. [[pr-review-workflow]] respond job picks up the mention and attempts fix

## Related

- [[pr-review-workflow]] — The @claude respond job that handles the fix
- [[vercel-deployment]] — Where deployments run and fail
