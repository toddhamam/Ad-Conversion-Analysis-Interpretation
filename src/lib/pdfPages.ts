// Rasterizing an agency deck into page images.
//
// Its own module rather than part of the Inspiration API client: this is image processing, not
// transport, and it carries a heavyweight optional dependency that has no business being
// reachable from a file every ingest path imports.

/**
 * Render the pages of a PDF into JPEG files.
 *
 * `pdfjs-dist` is a ~1MB bundle with its own worker, so the import is DYNAMIC — a static one
 * would make every page load in the app pay for a feature almost nobody opens. Server-side
 * rasterization was not an option: it needs a native dependency and, realistically, a new
 * serverless function, and the project is at 11 of Vercel's 12.
 *
 * Returns [] rather than throwing on any failure, so a malformed deck degrades to "no pages
 * found" instead of losing the rest of a mixed upload.
 */
export async function extractPdfPages(
  file: File,
  options: { maxPages?: number; onProgress?: (done: number, total: number) => void } = {}
): Promise<File[]> {
  const maxPages = options.maxPages ?? 20;

  try {
    const pdfjs = await import('pdfjs-dist');
    // `new URL(..., import.meta.url)` is what lets Vite fingerprint and emit the worker;
    // a bare path 404s in production.
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();

    const buffer = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buffer }).promise;
    const pageCount = Math.min(doc.numPages, maxPages);
    const pages: File[] = [];

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      // Scale 2 so a slide rasterizes above the 480px quality gate rather than landing just
      // under it and being silently excluded from the reference set.
      const viewport = page.getViewport({ scale: 2 });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      await page.render({ canvas, canvasContext: ctx, viewport }).promise;

      const blob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(resolve, 'image/jpeg', 0.85)
      );
      if (blob) {
        pages.push(new File([blob], `${file.name}-p${pageNumber}.jpg`, { type: 'image/jpeg' }));
      }
      options.onProgress?.(pageNumber, pageCount);
    }

    return pages;
  } catch (error: unknown) {
    console.warn('PDF extraction failed:', error instanceof Error ? error.message : error);
    return [];
  }
}
