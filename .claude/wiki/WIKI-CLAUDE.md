# Wiki Knowledge Base — Schema & Rules

This is an LLM-maintained knowledge base following the Karpathy Wiki pattern.
The LLM owns the wiki layer entirely — it creates pages, updates them, maintains
cross-references, and keeps everything consistent. The human reads it; the LLM writes it.

> "Obsidian is the IDE; the LLM is the programmer; the wiki is the codebase."

---

## Architecture

```
.claude/wiki/
├── WIKI-CLAUDE.md          # This file — schema and rules
├── index.md                # Master index (READ THIS FIRST)
├── log.md                  # Chronological activity record
├── hot.md                  # Hot cache (~500 words of most recent context)
├── raw/                    # Source documents (immutable staging area)
└── domains/                # Wiki pages organized by knowledge domain
    └── <domain-name>/
        ├── index.md        # Domain sub-index
        ├── <page>.md       # Concept/entity/analysis pages
        └── sources/        # Source summary pages
```

---

## How to Navigate (for agents)

1. **Always read `index.md` first** — it catalogs every domain and page with one-line summaries
2. **Read the domain sub-index** for the relevant domain — it lists all pages in that domain
3. **Read only the specific pages you need** — do NOT load everything
4. **If unsure where to look**, check `hot.md` for the most recent context (~500 words)

**Token efficiency is the goal.** The whole point of this system is that agents load
only the 2-3 relevant pages instead of a massive monolithic file.

---

## Three Core Operations

### 1. Ingest

When new source material is added to `raw/`:

1. Read the source fully
2. Identify key concepts, entities, and insights
3. For each concept/entity, either:
   - **Create** a new wiki page if it doesn't exist
   - **Update** an existing page with new information (append, don't overwrite)
4. Add `[[wikilinks]]` between related pages
5. Write a source summary page in `domains/<domain>/sources/`
6. Update the domain `index.md` with new pages
7. Update the master `index.md`
8. Append an entry to `log.md`
9. Refresh `hot.md` with ~500 word summary of what changed

**A single source should touch 10-15 wiki pages.** If you're only creating one page,
you're not cross-referencing enough.

### 2. Query

When asked a question against the wiki:

1. Read `index.md` to find relevant domains/pages
2. Read relevant pages and synthesize an answer
3. Cite sources using `[source: raw/filename.md]` or `[page: [[page-name]]]`
4. If the answer produces a valuable new insight, **file it back** into the wiki
   as a new page or update to an existing page. Explorations should compound.

### 3. Lint

Periodic health check over the wiki:

1. Find contradictions between pages
2. Find stale claims that newer sources may have superseded
3. Find orphan pages (no inbound `[[wikilinks]]` from other pages)
4. Find important concepts mentioned but lacking their own page
5. Find missing cross-references between related pages
6. Suggest new questions or sources that could fill gaps
7. Report findings — don't silently fix contradictions (flag them for review)

---

## Page Format

### Frontmatter (required on every page)

```yaml
---
title: Page Title
type: concept | entity | source-summary | comparison | analysis | domain-index
sources: [raw/filename.md, raw/other.md]
related: [[other-page]], [[another-page]]
created: YYYY-MM-DD
updated: YYYY-MM-DD
confidence: high | medium | low
---
```

### Naming Convention

- Filenames: `lowercase-kebab-case.md` matching the page title
  - Example: `api-architecture.md` for a page titled "API Architecture"

### Citation Format

- Inline citations: `[source: raw/filename.md]`
- Page references: `[[page-name]]` (Obsidian-compatible wikilinks)
- Full source list in frontmatter `sources:` field

### Content Guidelines

- Lead with the key insight or definition
- Use headers (##, ###) to organize sections
- Bold key terms on first use
- Include `[[wikilinks]]` liberally — more connections = more value
- End with a "Related" section listing connected pages

---

## Index Format

### Master index.md

```markdown
# Wiki Index
Last updated: YYYY-MM-DD

## Domains
- [Domain Name](domains/domain-name/index.md) — one-line description (N pages)

## Recent Activity
- [YYYY-MM-DD] operation | Brief description
```

### Domain sub-index

```markdown
# Domain Name
Last updated: YYYY-MM-DD

## Pages
- [[page-name]] — one-line summary
- [[other-page]] — one-line summary

## Sources
- [[source-summary]] — source title and date ingested
```

---

## Log Format

Append-only. Each entry:

```markdown
## [YYYY-MM-DD] operation-type | Title/Description
Sources: raw/filename.md
Pages created: page-a, page-b
Pages updated: page-c, page-d
Notes: any relevant context
```

---

## Hot Cache (hot.md)

- ~500 words maximum
- Refreshed on every ingest and every query that modifies the wiki
- Contains: what was most recently added/changed, key takeaways, and pointers
  to the most relevant pages for current work
- Purpose: quick orientation for agents that need recent context without
  reading the full index

---

## Critical Rules

1. **NEVER modify files outside `.claude/wiki/`** — the wiki is self-contained
2. **NEVER modify files in `raw/`** — raw sources are immutable
3. **Always update `index.md`** when creating or removing pages
4. **Always log operations** in `log.md`
5. **Prefer updating existing pages** over creating new ones when the topic already exists
6. **Flag contradictions** rather than silently resolving them
7. **Cross-reference liberally** — isolated pages are wasted knowledge
