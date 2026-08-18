// Route: ai-chat — multi-provider chat completions proxy. API keys stay server-side.
//
// The frontend speaks one dialect (OpenAI chat-completions) and this route serves it
// from whichever provider is available:
//   • OpenAI    — the SSE stream is piped straight through
//   • Anthropic — translated by ./anthropic-chat.ts
//
// Whichever provider is asked for first, the others follow as fallbacks when it can't
// serve the request (exhausted credits, rate limit, invalid key, retired model,
// outage). That is what keeps ConversionIQ™ alive when one provider's billing dries up.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateRequest } from './auth.js';
import { captureError, flushSentry } from './sentry.js';
import { SSEStream } from './sse-stream.js';
import {
  streamAnthropicAsOpenAI,
  isAnthropicConfigured,
  shouldTryNextProvider,
  ProviderError,
  type OpenAIChatBody,
} from './anthropic-chat.js';

// ─── Provider registry ──────────────────────────────────────────────────────

const PROVIDER_IDS = ['openai', 'anthropic'] as const;
export type AIProvider = (typeof PROVIDER_IDS)[number];

/** Every provider streams OpenAI-shaped SSE into the same writer. */
type ChatStreamFn = (body: OpenAIChatBody, sse: SSEStream) => Promise<void>;

interface ProviderAdapter {
  stream: ChatStreamFn;
  isConfigured: () => boolean;
}

const openAIKey = () => process.env.OPENAI_API_KEY;

const PROVIDERS: Record<AIProvider, ProviderAdapter> = {
  openai: { stream: streamOpenAIChat, isConfigured: () => !!openAIKey() },
  anthropic: { stream: streamAnthropicAsOpenAI, isConfigured: isAnthropicConfigured },
};

function isProvider(value: unknown): value is AIProvider {
  return typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value);
}

/**
 * Order the providers to try, most-preferred first:
 *   1. `ci_provider` on the request body — set per call site by the frontend
 *      (ConversionIQ™ analysis asks for Anthropic; generation paths ask for OpenAI)
 *   2. `AI_PRIMARY_PROVIDER` env var — account-wide default
 *   3. OpenAI
 *
 * Everything else follows as a fallback; unconfigured providers are dropped.
 */
function resolveProviderOrder(hint: string | undefined): AIProvider[] {
  const primary: AIProvider = isProvider(hint)
    ? hint
    : isProvider(process.env.AI_PRIMARY_PROVIDER)
      ? process.env.AI_PRIMARY_PROVIDER
      : 'openai';

  return [primary, ...PROVIDER_IDS.filter((id) => id !== primary)].filter((id) =>
    PROVIDERS[id].isConfigured()
  );
}

// ─── Request parsing ────────────────────────────────────────────────────────

interface ParsedChatRequest {
  body: OpenAIChatBody;
  /** Our own routing hint — never forwarded upstream. */
  providerHint?: string;
}

/**
 * Narrow the untyped request body once, here at the edge, so both providers receive a
 * typed `OpenAIChatBody` instead of each casting a `Record<string, unknown>` themselves.
 * Unrecognised fields still pass through to the provider at runtime (types are erased),
 * which is what lets new OpenAI params work without a change here.
 */
function parseChatRequest(raw: unknown): ParsedChatRequest | null {
  if (!raw || typeof raw !== 'object') return null;

  const { ci_provider: providerHint, ...rest } = raw as Record<string, unknown>;
  if (!Array.isArray(rest.messages) || rest.messages.length === 0) return null;

  return {
    body: rest as unknown as OpenAIChatBody,
    providerHint: typeof providerHint === 'string' ? providerHint : undefined,
  };
}

// ─── OpenAI provider ────────────────────────────────────────────────────────

/**
 * Pipe OpenAI's SSE stream straight through — the frontend already speaks this shape.
 *
 * Throws `ProviderError` on any failure; the caller decides what that means based on
 * whether the stream has already started.
 */
async function streamOpenAIChat(body: OpenAIChatBody, sse: SSEStream): Promise<void> {
  const apiKey = openAIKey();
  if (!apiKey) {
    throw new ProviderError('openai', 500, 'OpenAI API key not configured on server');
  }

  // Stream to keep the serverless function alive. Without streaming, reasoning +
  // images exceeds the function limit because the ENTIRE response must complete
  // before any data is sent back; with streaming, tokens flow within seconds and
  // the connection stays active throughout.
  const streamBody = { ...body, stream: true, stream_options: { include_usage: true } };

  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(streamBody),
    });
  } catch (err: unknown) {
    throw new ProviderError('openai', 503, err instanceof Error ? err.message : 'OpenAI request failed');
  }

  if (!response.ok) {
    throw new ProviderError('openai', response.status, await extractOpenAIError(response));
  }
  if (!response.body) {
    throw new ProviderError('openai', 502, 'Failed to read AI response stream');
  }

  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      sse.write(decoder.decode(value, { stream: true }));
    }
  } catch (err: unknown) {
    throw new ProviderError('openai', 502, err instanceof Error ? err.message : 'OpenAI stream failed');
  }
}

async function extractOpenAIError(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    if (parsed?.error?.message) return parsed.error.message;
  } catch {
    // Non-JSON error body — fall through to the raw text.
  }
  return text ? text.slice(0, 300) : `HTTP ${response.status}`;
}

// ─── Route handler ──────────────────────────────────────────────────────────

export async function handleAIChat(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed — use POST' });
  }

  const auth = await authenticateRequest(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = parseChatRequest(req.body);
  if (!parsed) {
    return res.status(400).json({ error: 'Request body with a non-empty messages array is required' });
  }

  const providers = resolveProviderOrder(parsed.providerHint);
  if (providers.length === 0) {
    return res.status(500).json({
      error: { message: 'No AI provider configured on the server. Set OPENAI_API_KEY and/or ANTHROPIC_API_KEY.' },
    });
  }

  const sse = new SSEStream(res);
  let lastError: unknown = null;

  for (const [index, provider] of providers.entries()) {
    try {
      await PROVIDERS[provider].stream(parsed.body, sse);

      // A provider that returns without writing anything hasn't served the request —
      // treat it like any other failure so the next provider gets a turn.
      if (!sse.started) {
        throw new ProviderError(provider, 502, `${provider} returned an empty response`);
      }

      sse.end();
      return;
    } catch (err: unknown) {
      lastError = err;

      // Once bytes are on the wire the response is committed — no second attempt is
      // possible, so close the connection and let the client surface the truncation.
      if (sse.started) {
        console.error(`[ai-chat] ${provider} failed after streaming started:`, err);
        sse.end();
        return;
      }

      const next = providers[index + 1];
      if (next && shouldTryNextProvider(err)) {
        console.warn(
          `[ai-chat] ${provider} unavailable (${err instanceof Error ? err.message : 'unknown'}) — falling back to ${next}`
        );
        continue;
      }
      break;
    }
  }

  const status = lastError instanceof ProviderError ? lastError.status : 500;
  const message = lastError instanceof Error ? lastError.message : 'AI service error';
  captureError(lastError, { route: 'meta/ai-chat', organizationId: auth.organizationId });
  await flushSentry();
  return res.status(status >= 400 && status < 600 ? status : 502).json({
    error: { message: `AI service error: ${message}` },
  });
}
