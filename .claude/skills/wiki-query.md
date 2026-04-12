# Wiki Knowledge Base — Agent Skill

You are interacting with an LLM-maintained wiki knowledge base at `.claude/wiki/`.

## Quick Start

1. **Read `.claude/wiki/index.md` first** — this is the master catalog of all domains and pages
2. Navigate to the relevant domain sub-index
3. Read only the specific pages you need
4. Do NOT load everything — token efficiency is the goal

## Operations

### Query (default)

When the user asks a question that the wiki might answer:

1. Read `.claude/wiki/index.md`
2. Identify the relevant domain(s) and pages
3. Read those specific pages
4. Synthesize an answer with citations: `[source: raw/filename.md]` or `[page: [[page-name]]]`
5. If your answer produces a valuable new insight, file it back into the wiki as a new or updated page:
   - Update `index.md` if a new page was created
   - Append to `log.md`
   - Refresh `hot.md` with ~500 words summarizing the change

### Ingest

When the user says "ingest" or adds a new source to `raw/`:

1. Read `.claude/wiki/WIKI-CLAUDE.md` for the full ingest workflow
2. Read the new source in `raw/`
3. Discuss key takeaways with the user
4. Create/update wiki pages under `domains/<domain>/`
5. Update `index.md`, `log.md`, and `hot.md`
6. NEVER modify files outside `.claude/wiki/`

### Lint

When the user says "lint" or "health check":

1. Read `.claude/wiki/WIKI-CLAUDE.md` for the full lint checklist
2. Scan all pages for contradictions, orphans, stale data, missing cross-references
3. Report findings — don't silently fix contradictions

## Rules

- NEVER modify files outside `.claude/wiki/`
- NEVER modify files in `.claude/wiki/raw/` (raw sources are immutable)
- Always update `index.md` when creating/removing pages
- Always log operations in `log.md`
- Cross-reference liberally with `[[wikilinks]]`
