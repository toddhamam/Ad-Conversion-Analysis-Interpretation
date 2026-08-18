// Server-Sent Events writer.
//
// Owns the single question every streaming route has to answer: "have we already
// committed to a response?" Headers are set lazily on the first write, so `started`
// means exactly what it says — unlike `res.headersSent`, which only flips once Node
// flushes and is therefore false in the window between setHeader() and write().
//
// That distinction is load-bearing for /api/ai/chat: a provider that fails BEFORE
// the first byte can be retried on another provider, while one that fails mid-stream
// is unrecoverable. Centralising the flag here keeps that decision in one place
// instead of asking each provider to track it correctly.

import type { VercelResponse } from '@vercel/node';

export class SSEStream {
  /** True once the first byte has been written and the response is committed. */
  started = false;

  constructor(private readonly res: VercelResponse) {}

  write(chunk: string): void {
    if (!this.started) {
      this.started = true;
      this.res.setHeader('Content-Type', 'text/event-stream');
      this.res.setHeader('Cache-Control', 'no-cache');
      this.res.setHeader('Connection', 'keep-alive');
    }
    this.res.write(chunk);
  }

  end(): void {
    this.res.end();
  }
}
