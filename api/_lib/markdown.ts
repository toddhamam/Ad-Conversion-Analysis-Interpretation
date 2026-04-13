import { marked } from 'marked';

// Content is admin-authored only (not user-generated), so full DOM
// purification is not required. isomorphic-dompurify depends on jsdom
// which crashes in Vercel's serverless environment.
export function markdownToHtml(markdown: string): string {
  return marked.parse(markdown, { async: false }) as string;
}
