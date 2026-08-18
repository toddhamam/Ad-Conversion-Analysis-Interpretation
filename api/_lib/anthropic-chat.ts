// Anthropic (Claude) chat helper — speaks OpenAI's chat-completions dialect.
//
// ConversionIQ's entire frontend (src/services/openaiApi.ts) is written against the
// OpenAI chat-completions request/response shape. Rather than fork every call site,
// this module translates an OpenAI-shaped request into an Anthropic Messages API call
// and re-emits Anthropic's SSE stream as OpenAI-shaped SSE chunks. The frontend's
// stream reassembler (`openaiProxy` in openaiApi.ts) then works unchanged.
//
// Used by api/meta.ts (`ai-chat` route) as either the PRIMARY provider (ConversionIQ
// analysis + interpretation) or the FALLBACK provider (when OpenAI is out of credits,
// rate limited, or down).

import Anthropic from '@anthropic-ai/sdk';
import type { SSEStream } from './sse-stream.js';

// Claude Fable 5 — Anthropic's most capable widely released model. ConversionIQ
// analysis runs infrequently (only when a meaningful batch of new ad data lands),
// so the highest-reasoning tier is the right trade for interpretation quality.
export const DEFAULT_ANTHROPIC_MODEL = process.env.ANTHROPIC_ANALYSIS_MODEL || 'claude-fable-5';

// Beta flag for server-side refusal fallbacks. Claude Fable 5's safety classifiers
// can decline a request (HTTP 200 + stop_reason "refusal"); with this enabled the
// API transparently re-runs the request on Anthropic's recommended fallback model
// instead of handing us an empty response. Ad-creative analysis occasionally brushes
// classifier-adjacent territory, so this is on by default.
const SERVER_SIDE_FALLBACK_BETA = 'server-side-fallback-2026-07-01';

// ─── Types ──────────────────────────────────────────────────────────────────

type OpenAIContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: string } };

/**
 * The OpenAI chat-completions request shape the frontend sends. Narrowed once by the
 * router (`ai-chat.ts`) so providers don't each cast; unrecognised fields still reach
 * OpenAI at runtime, which is what lets new OpenAI params work without a change here.
 */
export interface OpenAIChatBody {
  model?: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string | OpenAIContentPart[];
  }>;
  max_completion_tokens?: number;
  max_tokens?: number;
  reasoning_effort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh';
  response_format?: { type: 'json_object' | 'text' };
}

/** Error carrying enough context for the caller to decide whether to try another provider. */
export class ProviderError extends Error {
  status: number;
  provider: 'openai' | 'anthropic';
  constructor(provider: 'openai' | 'anthropic', status: number, message: string) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.status = status;
  }
}

export function isAnthropicConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

// ─── Request translation ────────────────────────────────────────────────────

const IMAGE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];

function normalizeMediaType(raw: string): ImageMediaType {
  const lower = raw.toLowerCase();
  if (lower === 'image/jpg') return 'image/jpeg';
  return (IMAGE_MEDIA_TYPES as readonly string[]).includes(lower)
    ? (lower as ImageMediaType)
    : 'image/jpeg';
}

/** Convert one OpenAI content part into an Anthropic content block. Unsupported parts return null. */
function toAnthropicBlock(part: OpenAIContentPart): Anthropic.Beta.BetaContentBlockParam | null {
  if (part.type === 'text') {
    return part.text ? { type: 'text', text: part.text } : null;
  }

  const url = part.image_url?.url;
  if (!url) return null;

  // Data URL → base64 source. The frontend sends cached Meta creatives this way.
  const dataUrlMatch = /^data:([^;,]+);base64,(.*)$/s.exec(url);
  if (dataUrlMatch) {
    const data = dataUrlMatch[2];
    if (!data) return null;
    return {
      type: 'image',
      source: { type: 'base64', media_type: normalizeMediaType(dataUrlMatch[1]), data },
    };
  }

  // Remote URL → url source (Anthropic fetches it server-side).
  if (/^https?:\/\//i.test(url)) {
    return { type: 'image', source: { type: 'url', url } };
  }

  return null;
}

/**
 * Split an OpenAI message list into an Anthropic `system` string plus `messages`.
 * System turns are concatenated (Anthropic keeps them in a dedicated top-level field).
 */
function translateMessages(body: OpenAIChatBody): {
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
} {
  const systemParts: string[] = [];
  const messages: Anthropic.Beta.BetaMessageParam[] = [];

  for (const msg of body.messages || []) {
    if (msg.role === 'system') {
      if (typeof msg.content === 'string') {
        systemParts.push(msg.content);
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text' && part.text) systemParts.push(part.text);
        }
      }
      continue;
    }

    const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (typeof msg.content === 'string') {
      if (msg.content) blocks.push({ type: 'text', text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        const block = toAnthropicBlock(part);
        if (block) blocks.push(block);
      }
    }

    // Anthropic rejects empty content arrays.
    if (blocks.length === 0) continue;
    messages.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: blocks });
  }

  // The first turn must be a user turn.
  while (messages.length > 0 && messages[0].role === 'assistant') {
    messages.shift();
  }
  if (messages.length === 0) {
    messages.push({ role: 'user', content: [{ type: 'text', text: 'Continue.' }] });
  }

  // OpenAI's `response_format: json_object` has no direct Anthropic equivalent
  // (Anthropic's structured outputs require a full JSON schema, which these call
  // sites don't supply). A system-level directive gets the same result.
  if (body.response_format?.type === 'json_object') {
    systemParts.push(
      'CRITICAL OUTPUT FORMAT: Respond with a single valid JSON object and nothing else. ' +
        'No markdown code fences, no prose before or after, no trailing commentary. ' +
        'The very first character of your response must be "{" and the last must be "}".'
    );
  }

  return { system: systemParts.join('\n\n'), messages };
}

/** OpenAI reasoning_effort → Anthropic output_config.effort. */
function translateEffort(effort?: string): 'low' | 'medium' | 'high' | 'xhigh' {
  switch (effort) {
    case 'none':
    case 'low':
      return 'low';
    case 'high':
      return 'high';
    case 'xhigh':
      return 'xhigh';
    default:
      return 'medium';
  }
}

/**
 * Anthropic's `max_tokens` is a hard ceiling on thinking + visible output, and thinking
 * is always on for Claude Fable 5. The caller's budget was sized for OpenAI, where
 * reasoning tokens are billed separately from the completion, so give Claude headroom —
 * otherwise long JSON analyses truncate mid-object. Safe because we always stream.
 */
function translateMaxTokens(body: OpenAIChatBody): number {
  const requested = body.max_completion_tokens ?? body.max_tokens ?? 4096;
  return Math.min(64000, Math.max(8192, requested * 3));
}

/** Anthropic stop_reason → OpenAI finish_reason. */
function translateStopReason(stopReason: string | null | undefined): string {
  switch (stopReason) {
    case 'max_tokens':
      return 'length';
    case 'refusal':
      return 'content_filter';
    case 'tool_use':
      return 'tool_calls';
    default:
      return 'stop';
  }
}

// ─── Streaming ──────────────────────────────────────────────────────────────

function sseChunk(model: string, payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify({
    id: 'chatcmpl-anthropic',
    object: 'chat.completion.chunk',
    model,
    ...payload,
  })}\n\n`;
}

/**
 * Run an OpenAI-shaped chat request against Claude and write the result to `sse` as an
 * OpenAI-shaped SSE stream.
 *
 * Throws `ProviderError` on failure and never closes the stream — the caller owns both
 * the failover decision (via `sse.started`) and the end of the response.
 */
export async function streamAnthropicAsOpenAI(
  body: OpenAIChatBody,
  sse: SSEStream
): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ProviderError('anthropic', 500, 'ANTHROPIC_API_KEY not configured on server');
  }

  const client = new Anthropic({ apiKey });
  const model = DEFAULT_ANTHROPIC_MODEL;
  const { system, messages } = translateMessages(body);

  const params: Anthropic.Beta.MessageCreateParamsStreaming = {
    model,
    max_tokens: translateMaxTokens(body),
    output_config: { effort: translateEffort(body.reasoning_effort) },
    messages,
    stream: true,
    ...(system ? { system } : {}),
  };

  let servedModel = model;
  let stopReason: string | null = null;
  let usage: Record<string, number> | null = null;

  const pipeEvents = async (
    stream: AsyncIterable<Anthropic.Beta.BetaRawMessageStreamEvent>
  ): Promise<void> => {
    for await (const event of stream) {
      switch (event.type) {
        case 'message_start':
          servedModel = event.message.model || servedModel;
          break;

        case 'content_block_delta':
          // Only forward visible text. `thinking_delta` carries reasoning, which the
          // OpenAI-shaped consumers neither expect nor know how to strip out.
          if (event.delta.type === 'text_delta' && event.delta.text) {
            sse.write(
              sseChunk(servedModel, {
                choices: [{ index: 0, delta: { content: event.delta.text }, finish_reason: null }],
              })
            );
          }
          break;

        case 'message_delta':
          stopReason = event.delta.stop_reason ?? stopReason;
          if (event.usage) {
            usage = {
              prompt_tokens: event.usage.input_tokens ?? 0,
              completion_tokens: event.usage.output_tokens ?? 0,
              total_tokens: (event.usage.input_tokens ?? 0) + (event.usage.output_tokens ?? 0),
            };
          }
          break;

        default:
          break;
      }
    }
  };

  // `client.beta.messages.stream()` returns synchronously and issues the request lazily,
  // so API errors surface while iterating — not at the call site. Everything that escapes
  // is normalized to a ProviderError here, so callers only ever handle one error type.
  const consume = async (withFallbacks: boolean): Promise<void> => {
    const stream = withFallbacks
      ? client.beta.messages.stream({
          ...params,
          betas: [SERVER_SIDE_FALLBACK_BETA],
          fallbacks: 'default',
        })
      : client.beta.messages.stream(params);

    try {
      await pipeEvents(stream);
    } catch (err: unknown) {
      throw toProviderError(err);
    }
  };

  try {
    await consume(true);
  } catch (err: unknown) {
    // Mid-stream failures are unrecoverable, and anything other than the beta being
    // unavailable is a real error — either way it's the caller's decision. Otherwise the
    // org isn't enrolled in the server-side-fallback beta and the API rejected the
    // parameter, so retry once without it rather than failing the call outright.
    if (sse.started || !isFallbackParamRejection(err)) throw err;

    console.warn('[anthropic] server-side refusal fallbacks unavailable — retrying without');
    await consume(false);
  }

  // A refusal with no text at all is a hard failure. The caller's empty-response guard
  // would catch it anyway; naming the cause here makes classifier declines legible in
  // the logs instead of showing up as a generic empty stream.
  if (!sse.started && stopReason === 'refusal') {
    throw new ProviderError(
      'anthropic',
      502,
      'Claude declined this request (safety classifier)'
    );
  }

  sse.write(
    sseChunk(servedModel, {
      choices: [{ index: 0, delta: {}, finish_reason: translateStopReason(stopReason) }],
      ...(usage ? { usage } : {}),
    })
  );
  sse.write('data: [DONE]\n\n');
}

// ─── Error classification ───────────────────────────────────────────────────

/** Did the API reject the `fallbacks` param itself (org not enrolled in the beta)? */
function isFallbackParamRejection(err: unknown): boolean {
  if (!(err instanceof ProviderError)) return false;
  if (err.status !== 400 && err.status !== 404) return false;
  const message = err.message.toLowerCase();
  return message.includes('fallback') || message.includes('beta');
}

function toProviderError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof Anthropic.APIError) {
    return new ProviderError('anthropic', err.status ?? 502, err.message || 'Anthropic API error');
  }
  return new ProviderError(
    'anthropic',
    502,
    err instanceof Error ? err.message : 'Anthropic request failed'
  );
}

/**
 * Should a failure on one provider trigger a retry on the other?
 *
 * Yes for anything that means "this provider can't serve the request right now" —
 * missing/invalid key, exhausted credits, rate limits, retired models, outages.
 * No for request-shape errors (400/422), which would fail identically everywhere and
 * would only double the user's wait.
 */
export function shouldTryNextProvider(err: unknown): boolean {
  if (!(err instanceof ProviderError)) return true; // network/unknown → worth retrying elsewhere
  const { status } = err;
  if (status === 400 || status === 422) return false;
  return (
    status === 401 ||
    status === 402 ||
    status === 403 ||
    status === 404 ||
    status === 408 ||
    status === 409 ||
    status === 429 ||
    status >= 500
  );
}
