// End-to-end guard on the ACTUAL image-generation request body.
//
// The per-engine prompt builders (generateAdImageWithGemini / generateAdImageWithGptImage) are
// private, so a vocabulary-level test cannot prove what really goes over the wire. This stubs
// fetch and inspects the real payload sent to the image model.
//
// The assertion that matters: an account generating from references with no delivery data must
// NEVER be told those references are proven winners. That claim used to be gated on how many
// images were attached, so a cold-start account with only uploads or competitor captures was
// told its references had "PROVEN CONVERSIONS".
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/authToken', () => ({ getAuthToken: async () => 'test-session-token' }));

import { generateAdImage } from './openaiApi';
import type { StyleReference } from '../lib/referenceProvenance';

let sentBodies: string[] = [];

/**
 * Gemini replies with an inline image part. The generation call is the only fetch this test
 * reaches — precomputedRefs suppresses the separate analyzeReferenceImages round trip.
 */
function stubImageApi() {
  sentBodies = [];
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    sentBodies.push(String(init?.body ?? ''));
    const payload = {
      candidates: [
        { content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }] }, finishReason: 'STOP' },
      ],
    };
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    } as unknown as Response;
  });
}

function prompt(): string {
  const body = sentBodies.join('\n');
  // Without this guard every `not.toContain` below would pass on an empty string — i.e. they
  // would still pass if the call never reached the network at all.
  expect(body.length).toBeGreaterThan(200);
  return body;
}

const REF_ANALYSIS = {
  visualStyle: 'Clean studio product photography',
  colorPalette: 'Warm neutrals with a lime accent',
  composition: 'Centered product, generous negative space',
  keyElements: ['product', 'flat backdrop'],
  mood: 'Confident, calm',
  lighting: 'Soft key light from the left',
  textOverlays: 'Single bold line, upper third',
  productPresentation: 'Front-facing, no hands',
};

function ownRef(id: string, conversions: number, conversionRate: number): StyleReference {
  return { id, source: 'own_winner', data: 'QUFBQQ==', mimeType: 'image/jpeg', conversions, conversionRate };
}

function externalRef(id: string, advertiser: string, daysRunning?: number): StyleReference {
  return {
    id,
    source: 'external',
    data: 'QUFBQQ==',
    mimeType: 'image/jpeg',
    advertiser,
    daysRunning,
    lane: 'ad_library',
  };
}

function uploadRef(id: string): StyleReference {
  return { id, source: 'own_upload', data: 'QUFBQQ==', mimeType: 'image/jpeg' };
}

function configWith(styleRefs: StyleReference[]) {
  return {
    conceptType: 'social_proof' as const,
    audienceType: 'prospecting' as const,
    analysisData: null,
    variationIndex: 0,
    totalVariations: 1,
    imageModel: 'gemini' as const,
    precomputedRefs: { styleRefs, productImages: [], refAnalysis: REF_ANALYSIS },
  };
}

async function bodyFor(styleRefs: StyleReference[]): Promise<string> {
  stubImageApi();
  await generateAdImage(configWith(styleRefs)).catch(() => {
    /* decoding the stub reply is not what's under test */
  });
  return prompt();
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// 1. Own-account winners — existing behaviour must not drift
// ---------------------------------------------------------------------------

describe('image prompt — own-account winners', () => {
  it('keeps the measured wording byte-for-byte', async () => {
    const body = await bodyFor([ownRef('a', 42, 3.2), ownRef('b', 5, 1.1)]);

    expect(body).toContain('ads with PROVEN CONVERSIONS');
    expect(body).toContain('CONVERSION PERFORMANCE DATA');
    expect(body).toContain('STYLE REFERENCE 1: 42 conversions (3.2% CVR)');
    expect(body).toContain(
      'Study the [STYLE REFERENCE] images and match the visual style of the highest-converting ones for the scene.'
    );
  });

  it('labels each inline image with the legacy style-reference role text', async () => {
    const body = await bodyFor([ownRef('a', 9, 1.0), ownRef('b', 2, 0.5)]);

    expect(body).toContain(
      '[STYLE REFERENCE 1 of 2] A high-converting ad. Emulate its visual style for the scene only.'
    );
  });
});

// ---------------------------------------------------------------------------
// 2. External references only — THE CORE HONESTY GUARANTEE
// ---------------------------------------------------------------------------

describe('image prompt — external references only', () => {
  const refs = [externalRef('x1', 'Acme Supplements', 214), externalRef('x2', 'Rival Co', 61)];

  it('never claims the references have proven conversions', async () => {
    const body = await bodyFor(refs);

    expect(body).not.toContain('PROVEN CONVERSIONS');
    expect(body).not.toContain('CONVERSION PERFORMANCE DATA');
    expect(body).not.toContain('% CVR');
  });

  it('says the references are unproven instead of silently dropping the claim', async () => {
    const body = await bodyFor(refs);

    expect(body).toContain('NO conversion data for this account');
    expect(body).toContain('UNPROVEN here');
    expect(body).toContain('hypothesis to test, not a formula that already works');
  });

  it('does not point at a highest-converting reference that does not exist', async () => {
    const body = await bodyFor(refs);

    expect(body).not.toContain('match the visual style of the highest-converting ones');
    expect(body).toContain('there is no highest-converting one to prioritize');
  });

  it('still attaches and labels the reference images', async () => {
    // Suppressing the performance claim must not suppress the references themselves —
    // otherwise a cold-start account generates with no visual anchor at all.
    expect(await bodyFor(refs)).toContain('[STYLE REFERENCE 1 of 2]');
  });
});

// ---------------------------------------------------------------------------
// 3. Uploads only — real brand assets, still no delivery data
// ---------------------------------------------------------------------------

describe('image prompt — operator uploads only', () => {
  it('makes no performance claim about an uploaded brand asset', async () => {
    // Uploads used to be stamped with a fake 10% CVR, which meant they were described to the
    // model as proven winners.
    const body = await bodyFor([uploadRef('u1'), uploadRef('u2')]);

    expect(body).not.toContain('PROVEN CONVERSIONS');
    expect(body).not.toContain('% CVR');
    expect(body).toContain('NO conversion data for this account');
  });
});

// ---------------------------------------------------------------------------
// 4. Mixed set — a measured reference is present, so measured wording is correct again
// ---------------------------------------------------------------------------

describe('image prompt — mixed own + external', () => {
  const refs = [ownRef('a', 42, 3.2), externalRef('x1', 'Acme Supplements', 214)];

  it('reports the measured reference and only the measured one', async () => {
    const body = await bodyFor(refs);

    expect(body).toContain('CONVERSION PERFORMANCE DATA');
    expect(body).toContain('STYLE REFERENCE 1: 42 conversions (3.2% CVR)');
    // The external reference must not acquire a conversion line by sitting next to one.
    expect(body).not.toContain('STYLE REFERENCE 2: 0 conversions');
  });

  it('presents the measured reference before the unproven one', async () => {
    const body = await bodyFor(refs);

    const first = body.indexOf('[STYLE REFERENCE 1 of 2]');
    const second = body.indexOf('[STYLE REFERENCE 2 of 2]');
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
  });
});
