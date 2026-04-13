import { marked } from 'marked';
import createDOMPurify from 'isomorphic-dompurify';

const DOMPurify = createDOMPurify;

export function markdownToHtml(markdown: string): string {
  const raw = marked.parse(markdown, { async: false }) as string;
  return DOMPurify.sanitize(raw);
}
