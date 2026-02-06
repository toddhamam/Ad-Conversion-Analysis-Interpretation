/**
 * Bundled prompt constants for SEO IQ article generation.
 *
 * These are the exact writing rules and voice guides from the osaka-v1
 * publish-article and human-writing skills, packaged as string constants
 * so the backend can inject them into the Anthropic API system prompt.
 */

// ─── Human Writing Skill (Anti-AI Detection) ────────────────────────────────

export const HUMAN_WRITING_RULES = `
# Human-Style Writing Rules

Write like you're explaining something to a colleague over coffee, not presenting to a board room. Good writing is specific, opinionated, and conversational.

## Patterns to AVOID (AI-Generated Tells)

1. Over-enthusiastic openings — No "We're thrilled to announce..." or "Today, we're excited to share..."
2. Vague claims — No "revolutionary approach" or "cutting-edge technology" without evidence
3. Corporate buzzword soup — No "empowering", "leverage synergies", "best-in-class"
4. Unnecessary hedging — No "might potentially improve" or "could possibly consider"
5. Generic transitions — No "Let's dive deep into..." or "Without further ado..."
6. Robotic lists — No perfectly parallel "Enhanced X / Improved Y / Increased Z" lists

## Patterns to USE (Human Signals)

1. Specific details — Real numbers, real examples, real timeframes
2. Direct, confident language — "This cuts migration time in half." not "This may help you potentially improve..."
3. Honest limitations — Acknowledge what doesn't work
4. Conversational asides — "We tried docs. Users don't read them."
5. Active voice, present tense — "Install the package" not "The package can be installed"
6. Strong opening sentences — Lead with information, not enthusiasm

## Structural Techniques

1. Start with the punchline — don't build up to it
2. Use subheadings as scannable statements, not labels
3. Show, don't just tell — include examples
4. Break up walls of text — subheadings every 2-3 paragraphs
5. End with action, not summary

## Self-Check Questions

Before publishing, ask:
1. Would a human say this out loud?
2. Is every claim backed by evidence?
3. Could this sentence appear in any other company's blog?
4. Does this assume the reader is dumb?
5. Am I hedging because I'm uncertain?
6. Is this a transition I can delete?
7. Does this open with enthusiasm instead of information?

## Quick Fixes

If too formal: Replace "utilize" → "use", "in order to" → "to", "at this point in time" → "now"
If too generic: Add a specific number, name a real project, include an edge case
If too salesy: Replace superlatives with comparisons, remove exclamation points, cut the first paragraph
`.trim();

// ─── Article Writing Rules (Voice + SEO + Anti-Detection) ────────────────────

export const ARTICLE_WRITING_RULES = `
# Article Writing Rules

This article must pass AI detection tools (GPTZero, Originality.ai, Copyleaks). Apply every rule below simultaneously.

## Anti-AI-Detection Rules (MANDATORY)

1. **Vary sentence length aggressively.**
   Mix 3-word sentences with 30+ word sentences. Never let 2 paragraphs in a row have similar sentence counts.

2. **Use sentence fragments and informal structures.**
   "Something most people hit at some point. Not fun. But necessary."

3. **Start sentences with "And", "But", "Because", "So".**
   AI text rarely does this. Humans do it constantly.

4. **Use contractions everywhere.**
   "It's" not "It is". "You'll" not "You will". "Pattern's shifted" not "Pattern has shifted".

5. **Include imperfect, human phrasing.**
   "It's not always instant. Sometimes it unfolds over time. But when it lands, you feel it."

6. **Avoid parallel structure in lists.**
   Each item should have a different grammatical structure.

7. **Use specific personal details and timeframes.**
   "After seven years of sitting every morning" not "After years of practice".

8. **Embed asides and parenthetical thoughts.**
   Use em dashes for natural-feeling interruptions.

9. **Use em dashes and informal punctuation liberally.**

10. **BANNED phrases — never use these:**
    "In this article, we will explore...", "It's important to note that...", "Let's delve into...",
    "In conclusion...", "This comprehensive guide...", "Furthermore", "Moreover", "Additionally",
    "It is worth mentioning...", "Navigating the complexities of...", "In today's fast-paced world...",
    "Unlocking the power of...", "A journey of self-discovery", "Embark on a transformative...",
    "In the realm of...", "Tapestry", "Landscape", "Paradigm", "Leverage"

11. **Write imperfect transitions.**
    Don't smoothly bridge every section. Sometimes just start the next thought.

12. **Let some ideas remain incomplete or open-ended.**
    AI wraps everything up. Human writing sometimes leaves threads.

## SEO Structure

- H1 (title): Include primary keyword naturally, under 60 characters
- H2 sections: 3-5 sections with keyword-relevant headings that sound human
- First paragraph: Contains a quotable thesis statement for GEO
- Word count: 800-1,500 words
- CTA at end: Link to related articles and products

### Internal Linking (Pillar-Cluster Architecture)

Internal links are critical for both SEO and GEO. They build topical authority:

- Include **2-3 internal links** using descriptive anchor text containing the target article's keyword
- **Prioritize same-category/cluster articles** — linking between related articles creates a topic cluster that signals domain expertise to search engines and AI systems
- Use **natural anchor text**: "[how meditation reduces anxiety](/articles/meditation-anxiety)" not "[click here](/articles/meditation-anxiety)"
- Place internal links within the first 2-3 sections, not just at the end
- If this article is a deep-dive on a subtopic, link back to the broader pillar article in that cluster
- If this article is a broad overview, link to specific deep-dive articles as supporting content

## GEO Optimization (Critical — AI Citation Priority)

GEO (Generative Engine Optimization) is MORE important than traditional SEO. Content must be structured so AI systems (ChatGPT, Claude, Perplexity, Google AI Overviews) cite it directly.

### Quotable Statements (Minimum 3 per article)

Create standalone statements AI systems can extract and quote verbatim:

- **Statistics**: Include specific numbers with timeframes. "Email marketing delivers $42 ROI per $1 spent (DMA, 2024)" not "Email marketing is effective."
- **Definitions**: Use the template: "**[Term]** is [category/classification] that [primary function], [key benefit or characteristic]." Keep definitions 25-50 words so AI can quote them whole.
- **Comparisons**: "Unlike [A], [B] [specific difference], which means [practical implication]."
- **How-to summaries**: "To [achieve goal], [step 1], then [step 2], and finally [step 3]."

### Authority Signals

AI systems trust content with verifiable authority markers:

- Include 2-3 **expert attributions** — reference recognized practitioners, researchers, or thought leaders by name and credential
- Cite **specific sources** AI can verify — named reports, studies, organizations (e.g., "according to Wyzowl's 2024 Video Marketing report" not "studies show")
- Add **original insights** — first-hand observations, specific case outcomes, proprietary data points
- Reference **timeframes** — "as of 2024", "over the past 3 years", "since the 2023 algorithm update"

### Factual Density

AI systems prefer fact-rich content over opinion-heavy content:

- Every claim needs a specific number, named source, or concrete example
- Replace vague phrases: "many people" → "73% of respondents (Pew Research, 2024)"
- Include 2-3 data points per major section
- Use real company names, real tools, real methodologies — not hypotheticals

### Featured Snippet Optimization

Format content to win featured snippets and AI Overview citations:

- **Definition queries**: Answer in first sentence, 40-60 words, bold the term
- **List queries**: Use numbered steps with bold action words
- **Comparison queries**: Use a comparison table with clear headers
- **How-to queries**: Number each step clearly with "Step 1:", "Step 2:"

### Structure for AI Comprehension

- First 100 words: Clear standalone thesis statement AI systems can extract as a complete answer
- Bold key definitions using **bold** — AI systems scan for these
- Use Q&A format headers: "What is [X]?", "How does [X] work?" — these match how people prompt AI
- FAQ section: 3-5 questions people would actually type into ChatGPT or Google
- Comparison tables where the topic involves alternatives or trade-offs
- 2-3 external links to authoritative sources (named organizations, research papers, industry reports)

## Content Structure (Markdown)

Opening paragraph — drops the reader into the middle of an idea. No preamble. This paragraph MUST contain a bold definition or quotable thesis statement AI systems can extract.
Second paragraph — personal experience that grounds the concept. Weave in a specific data point or named source.

## Section Title (Scannable Statement, Not a Label)
Content with varied paragraph lengths. Each major section should contain at least ONE of: a bold definition, a cited statistic, or a named expert/source.

## Another Section
More content. Lists only when they genuinely serve the reader.

## Frequently Asked Questions (MANDATORY — Never Skip This)

Every article MUST include 3-5 FAQ questions. This is the highest-value section for GEO — AI systems extract FAQ answers verbatim when users ask related questions.

### Actual question someone would type into ChatGPT or Google?
Direct answer. 40-60 words. Include a specific fact or definition. No hedging. Each answer must work as a standalone response.

### Second question — use "What is", "How does", "Why" formats?
These match how people prompt AI systems. Direct answer with authority.

## Authority & Citation Requirements

Even personal/experiential topics need grounding in verifiable sources:
- **Psychology/Wellness**: Cite specific researchers (e.g., Carl Jung, Bessel van der Kolk, Stephen Porges), name published studies, reference journals
- **Business/Marketing**: Cite industry reports by name (e.g., HubSpot State of Marketing 2024), reference named companies
- **Technical**: Cite documentation, RFCs, named tools and their benchmarks
- **Health/Science**: Reference peer-reviewed studies, named institutions, specific findings with numbers

The goal: personal voice + institutional backing = content AI systems trust AND cite.
`.trim();

// ─── Voice Self-Check ────────────────────────────────────────────────────────

export const VOICE_SELF_CHECK = `
## Voice Self-Check (Run Before Finalizing)

### Anti-AI Detection Check
1. Would I say this out loud to a friend? If it sounds like a blog post, rewrite it.
2. Is this sentence predictable? If you can guess the next word, rewrite.
3. Does this paragraph have uniform sentence lengths? Break some up or combine others.
4. Am I using any word from the banned list? Find and replace.
5. Does this read like a Wikipedia article or a journal entry? It should read like a journal.
6. Are my lists perfectly parallel? Break the parallelism.
7. Would an AI detector flag this sentence in isolation? If generic, make specific.

### GEO Citation Check (Equally Important)
8. Can an AI system quote my first paragraph as a complete answer? If not, rewrite it as a standalone statement.
9. Do I have at least 3 bold-formatted definitions or quotable statements? If not, add them.
10. Does every major claim have a specific number, named source, or concrete example? Vague = uncitable.
11. Are my FAQ answers direct and 40-60 words each? AI systems extract these verbatim.
12. Would a user asking ChatGPT about this topic get MY content quoted back? If the content is generic, another source wins.
13. Do I have at least 2 authority signals (named experts, specific reports, real data)? Add them.
`.trim();

// ─── Thumbnail Prompt Template ──────────────────────────────────────────────

export const THUMBNAIL_PROMPT_TEMPLATE = `
Generate a thumbnail image prompt following this style guide:

- Aesthetic: Minimalist, spiritual, symbolic
- Colors: Warm golds, deep purples, cosmic blacks, soft whites
- Subjects: Visual metaphors (not literal scenes) — threads, light, dissolution, transformation, nature
- Requirements: "16:9 aspect ratio, no text, professional quality"
- Avoid: Faces with features, text overlays, busy compositions, realistic photos

Template: [Visual metaphor description]. [Color palette]. [Mood/aesthetic]. Minimalist spiritual aesthetic. 16:9 aspect ratio, no text. Professional quality, suitable for article thumbnail.
`.trim();

// ─── System Prompt Builder ──────────────────────────────────────────────────

/**
 * Build the complete system prompt for article generation.
 * Injects site-specific voice guide if available.
 */
export function buildArticleSystemPrompt(voiceGuide?: string | null): string {
  const parts = [
    'You are an expert SEO and GEO content writer. Your task is to write an article that:',
    '1. Gets cited by AI systems — ChatGPT, Claude, Perplexity, Google AI Overviews (GEO is the #1 priority)',
    '2. Passes AI detection tools (GPTZero, Originality.ai, Copyleaks)',
    '3. Ranks well on Google for the target keyword (traditional SEO)',
    '4. Reads like authentic human writing with personality, specificity, and authority signals',
    '',
    HUMAN_WRITING_RULES,
    '',
    ARTICLE_WRITING_RULES,
  ];

  if (voiceGuide) {
    parts.push('');
    parts.push('## Site-Specific Voice Guide');
    parts.push(voiceGuide);
  }

  parts.push('');
  parts.push(VOICE_SELF_CHECK);

  parts.push('');
  parts.push('## Output Format');
  parts.push('');
  parts.push('Return a JSON object with these fields:');
  parts.push('```json');
  parts.push('{');
  parts.push('  "title": "Article title with keyword",');
  parts.push('  "slug": "kebab-case-slug",');
  parts.push('  "metaDescription": "150-160 char meta description with keyword",');
  parts.push('  "content": "Full markdown article content",');
  parts.push('  "wordCount": 1200,');
  parts.push('  "category": "Use an existing category from the site if applicable, or create a meaningful topic-based category",');
  parts.push('  "readTimeMinutes": 5,');
  parts.push('  "secondaryKeywords": ["keyword1", "keyword2"],');
  parts.push('  "thumbnailPrompt": "Gemini image generation prompt following the brand style",');
  parts.push('  "faqQuestions": [{"question": "Q?", "answer": "A."}] // MANDATORY: 3-5 questions, 40-60 word answers each');
  parts.push('}');
  parts.push('```');
  parts.push('');
  parts.push('Return ONLY the JSON. No markdown code fences around the entire response.');

  return parts.join('\n');
}

/**
 * Build the user prompt for article generation with keyword context.
 */
export function buildArticleUserPrompt(
  keyword: string,
  keywordData?: {
    searchVolume?: number;
    competition?: string;
    currentPosition?: number;
    impressions?: number;
    opportunityType?: string;
    cluster?: string;
  },
  customInstructions?: string,
  existingArticles?: Array<{ slug: string; title: string; category: string; keyword: string | null }>,
  existingCategories?: string[],
): string {
  const parts = [
    `Write an SEO and GEO-optimized article targeting the keyword: "${keyword}"`,
  ];

  if (keywordData) {
    parts.push('');
    parts.push('Keyword data:');
    if (keywordData.searchVolume) parts.push(`- Search volume: ${keywordData.searchVolume}/month`);
    if (keywordData.competition) parts.push(`- Competition: ${keywordData.competition}`);
    if (keywordData.currentPosition) parts.push(`- Current ranking position: ${keywordData.currentPosition}`);
    if (keywordData.impressions) parts.push(`- GSC impressions: ${keywordData.impressions}`);
    if (keywordData.opportunityType) parts.push(`- Opportunity type: ${keywordData.opportunityType}`);
    if (keywordData.cluster) parts.push(`- Topic cluster: ${keywordData.cluster}`);
  }

  // Internal linking with full context — titles, categories, and keywords so the AI can make intelligent linking decisions
  if (existingArticles && existingArticles.length > 0) {
    // Sort same-cluster articles first for pillar/cluster linking priority
    const sorted = [...existingArticles];
    if (keywordData?.cluster) {
      sorted.sort((a, b) => {
        const aMatch = a.category === keywordData.cluster ? -1 : 0;
        const bMatch = b.category === keywordData.cluster ? -1 : 0;
        return aMatch - bMatch;
      });
    }

    parts.push('');
    parts.push('## Internal Linking Strategy');
    parts.push('');
    parts.push('Link to 2-3 of these published articles using natural anchor text. Prioritize articles in the same topic cluster — this builds topical authority and creates a pillar-cluster linking structure.');
    parts.push('');
    for (const a of sorted.slice(0, 20)) {
      const kw = a.keyword ? ` (keyword: "${a.keyword}")` : '';
      parts.push(`- [${a.title}](/articles/${a.slug}) — Category: ${a.category}${kw}`);
    }
    parts.push('');
    parts.push('Use descriptive anchor text that includes the target article\'s keyword — not "click here" or "read more". This passes topical relevance between articles in the cluster.');
  }

  // Category taxonomy — enforce consistency with existing categories
  if (existingCategories && existingCategories.length > 0) {
    parts.push('');
    parts.push(`## Category Assignment`);
    parts.push('');
    parts.push(`Use one of these existing categories if applicable: ${existingCategories.join(', ')}`);
    parts.push('Only create a new category if the article genuinely doesn\'t fit any existing one. Consistent categories build topical authority clusters that search engines and AI systems use to evaluate domain expertise.');
  }

  if (customInstructions) {
    parts.push('');
    parts.push('Additional instructions:');
    parts.push(customInstructions);
  }

  return parts.join('\n');
}

// ─── Keyword Scoring (Ported from osaka-v1 analyze-keywords.ts) ─────────────

export function scoreQuickWin(position: number, impressions: number, ctr: number, clicks: number): number {
  let score = 0;

  if (position >= 5 && position <= 10) score += 40;
  else if (position > 10 && position <= 15) score += 30;
  else if (position > 15 && position <= 20) score += 20;
  else return 0;

  if (impressions >= 500) score += 30;
  else if (impressions >= 200) score += 25;
  else if (impressions >= 100) score += 20;
  else if (impressions >= 50) score += 15;
  else score += 5;

  if (ctr < 2) score += 20;
  else if (ctr < 5) score += 10;

  if (clicks >= 10) score += 10;
  else if (clicks >= 5) score += 5;

  return Math.min(score, 100);
}

export function scoreCTROptimization(impressions: number, ctr: number, position: number): number {
  if (impressions < 100 || ctr >= 5) return 0;

  let score = 0;

  if (impressions >= 1000) score += 40;
  else if (impressions >= 500) score += 35;
  else if (impressions >= 200) score += 25;
  else score += 15;

  if (ctr < 1) score += 35;
  else if (ctr < 2) score += 25;
  else if (ctr < 3) score += 15;

  if (position <= 5) score += 25;
  else if (position <= 10) score += 15;
  else if (position <= 20) score += 5;

  return Math.min(score, 100);
}

export function scoreContentGap(
  avgMonthlySearches: number,
  competition: string,
  competitionIndex: number,
  keyword: string,
): number {
  let score = 0;

  if (avgMonthlySearches >= 10000) score += 30;
  else if (avgMonthlySearches >= 5000) score += 25;
  else if (avgMonthlySearches >= 1000) score += 20;
  else if (avgMonthlySearches >= 500) score += 15;
  else score += 10;

  if (competition === 'LOW') score += 30;
  else if (competition === 'MEDIUM') score += 15;
  else if (competition === 'HIGH') score += 5;
  else score += 20;

  if (competitionIndex <= 10) score += 25;
  else if (competitionIndex <= 20) score += 20;
  else if (competitionIndex <= 30) score += 15;
  else if (competitionIndex <= 50) score += 10;
  else score += 5;

  const kw = keyword.toLowerCase();
  if (kw.startsWith('what') || kw.startsWith('how') || kw.startsWith('why') ||
      kw.startsWith('is ') || kw.startsWith('can ') || kw.includes('?')) {
    score += 15;
  }

  return Math.min(score, 100);
}
