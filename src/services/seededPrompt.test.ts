// End-to-end guard: the ACTUAL request body a cold-start account sends to the model.
//
// The condensed prompt builders inside regenerateSingleCopy / generateTextAdCopy are not exported,
// so a vocabulary-level test can't prove what really goes over the wire. This stubs fetch and
// inspects the real payload.
import { describe, it, expect, vi } from 'vitest';

// The proxy attaches a Supabase session token before it will call out; stub that, not the
// prompt-building code under test.
vi.mock('../lib/authToken', () => ({ getAuthToken: async () => 'test-session-token' }));

import { regenerateSingleCopy, generateTextAdCopy } from './openaiApi';
import { buildSeededAnalysis, buildObservedAnalysis } from '../lib/analysisMode';
import { seedFixture, observedFixture } from '../test/fixtures';

let sentBodies: string[] = [];

function stubChat(reply: unknown) {
  sentBodies = [];
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    sentBodies.push(String(init.body));
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ choices: [{ message: { content: JSON.stringify(reply) } }] }),
      text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }),
    } as unknown as Response;
  });
}

function prompt(): string {
  const body = sentBodies.join('\n');
  // Without this, the `not.toContain` assertions below would pass on an empty string — i.e. they
  // would still pass if the call never reached the network at all.
  expect(body.length).toBeGreaterThan(200);
  return body;
}

describe('regenerateSingleCopy — seeded account', () => {
  it('never sends a null or zero health score, nor 0% CVR winners', async () => {
    stubChat({ text: 'A new headline', rationale: 'because' });
    await regenerateSingleCopy({
      copyType: 'headline',
      existingItems: [],
      audienceType: 'prospecting',
      conceptType: 'social_proof',
      analysisData: buildSeededAnalysis(seedFixture()),
    }).catch(() => {/* parsing of the stub reply is not what's under test */});

    expect(prompt()).not.toContain('null/10');
    expect(prompt()).not.toContain('Overall Health Score');
    expect(prompt()).not.toContain('0.00% CVR');
    expect(prompt()).not.toContain('YOUR TOP PERFORMING ADS');
    expect(prompt()).not.toContain('=== WINNING PATTERNS ===');
  });

  it('frames the seed as untested hypotheses instead', async () => {
    stubChat({ text: 'A new headline', rationale: 'because' });
    await regenerateSingleCopy({
      copyType: 'headline',
      existingItems: [],
      audienceType: 'prospecting',
      conceptType: 'social_proof',
      analysisData: buildSeededAnalysis(seedFixture()),
    }).catch(() => {});

    expect(prompt()).toContain('no ad history');
    expect(prompt()).toContain('UNPROVEN');
    expect(prompt()).toContain('EXEMPLAR');
  });

  it('still sends the measured framing for an account with real ads', async () => {
    stubChat({ text: 'A new headline', rationale: 'because' });
    await regenerateSingleCopy({
      copyType: 'headline',
      existingItems: [],
      audienceType: 'prospecting',
      conceptType: 'social_proof',
      analysisData: buildObservedAnalysis(observedFixture()),
    }).catch(() => {});

    expect(prompt()).toContain('Overall Health Score: 7/10');
    expect(prompt()).toContain('YOUR TOP PERFORMING ADS');
    expect(prompt()).toContain('TOP AD #1 (6.10% CVR)');
    expect(prompt()).toContain('=== WINNING PATTERNS ===');
  });
});

describe('generateTextAdCopy — seeded account', () => {
  it('does not claim top performing patterns inform the suggestions', async () => {
    stubChat({ variations: [] });
    await generateTextAdCopy({
      audienceType: 'prospecting',
      conceptType: 'social_proof',
      analysisData: buildSeededAnalysis(seedFixture()),
    }).catch(() => {});

    expect(prompt()).not.toContain('null/10');
    expect(prompt()).not.toContain('Health Score:');
    expect(prompt()).not.toContain('Top performing patterns');
    expect(prompt()).toContain('NO DELIVERY DATA YET');
  });

  it('keeps the measured wording for an account with real ads', async () => {
    stubChat({ variations: [] });
    await generateTextAdCopy({
      audienceType: 'prospecting',
      conceptType: 'social_proof',
      analysisData: buildObservedAnalysis(observedFixture()),
    }).catch(() => {});

    expect(prompt()).toContain('Health Score: 7/10');
    expect(prompt()).toContain('Top performing patterns from this account inform the suggestions below.');
  });
});
