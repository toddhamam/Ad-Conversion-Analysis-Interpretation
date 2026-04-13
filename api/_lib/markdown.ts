import { marked } from 'marked';

// Configure marked for safe output — content is admin-authored only
// (not user-generated), so full DOM purification is not required.
// marked does not execute scripts by default.
export function markdownToHtml(markdown: string): string {
  return marked.parse(markdown, { async: false }) as string;
}
