---
title: Code Quality Principles
type: concept
sources: [raw/rules-md.md]
related: [[product-philosophy]], [[ux-design-standards]]
created: 2026-04-12
updated: 2026-04-12
confidence: high
---

# Code Quality Principles

Karpathy-inspired development principles that prioritize clarity and maintainability over cleverness. These are non-negotiable standards for all code in the Convertra codebase [source: raw/rules-md.md].

## Core Principles

- **Simplicity** — Keep implementations straightforward; avoid unnecessary complexity
- **Consistency** — Follow established patterns across the codebase
- **Clarity** — Code should be self-explanatory; favor readability
- **Incremental changes** — Make small, focused changes rather than large refactors
- **Avoid over-engineering** — Build only what's needed now, not hypothetical future needs
- **Minimal abstraction** — Don't abstract prematurely; concrete code is often clearer
- **Thoroughness** — When fixing issues, check all similar functionality in the codebase — don't just fix the one instance that triggered the error

## Feature Removal Checklist

When removing a page or feature, clean up all associated artifacts:

1. Delete the component file (e.g., `src/pages/Feature.tsx`)
2. Delete the associated CSS file (e.g., `src/pages/Feature.css`)
3. Remove the route from `src/App.tsx`
4. Remove the nav item from `src/components/Sidebar.tsx`
5. Remove any related state variables
6. Verify build compiles cleanly with `npm run build`

## Debugging Standards

- **Don't assume the first fix works** — trace the full flow comprehensively
- **Verify at every layer** — API call fires → response correct → state updated → UI re-renders
- **Iterative order** — API changes first, then component logic, then UI/UX polish
- **Console logging** — Add meaningful logs for debugging critical operations
- **Feature flags** — Use debug flags to isolate issues (`SKIP_LOCALSTORAGE`, `DEBUG_MODE`)

## Git Workflow Standards

- Commit before creating PRs; provide PR URL after creation
- Separate PRs for distinct fixes — don't bundle unrelated changes
- Verify active branch matches intended PR target before committing
- Review `git diff` before committing to avoid losing uncommitted changes

## Related

- [[product-philosophy]] — Why stability and clarity are prioritized
- [[ux-design-standards]] — How code quality manifests in UI patterns
