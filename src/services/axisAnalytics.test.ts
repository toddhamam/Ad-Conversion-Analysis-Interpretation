import { describe, it, expect } from 'vitest';
import { aggregateByAxis } from './axisAnalytics';
import type { AdCreativeData } from './openaiApi';
import type { AxisTag } from '../lib/axisTags';

/** Above MIN_AXIS_IMPRESSIONS (100) unless a test deliberately goes below it. */
function ad(overrides: Partial<AdCreativeData> & { axisTag?: AxisTag }): AdCreativeData {
  return {
    id: Math.random().toString(36).slice(2),
    name: 'ad',
    imageUrl: '',
    headline: '',
    bodyText: '',
    spend: 100,
    impressions: 1000,
    clicks: 100,
    conversions: 10,
    ...overrides,
  } as AdCreativeData;
}

// ---------------------------------------------------------------------------
// 1. Callout axis
// ---------------------------------------------------------------------------

describe('byCallout', () => {
  it('aggregates per callout and ranks by CVR', () => {
    const insights = aggregateByAxis([
      ad({ axisTag: { angle: 'pain', hook: 'callout', callout: 'dads-over-40' }, clicks: 100, conversions: 20 }),
      ad({ axisTag: { angle: 'pain', hook: 'callout', callout: 'busy-mums' }, clicks: 100, conversions: 5 }),
    ]);

    expect(insights.byCallout?.map(s => s.key)).toEqual(['dads-over-40', 'busy-mums']);
    expect(insights.byCallout?.[0].cvr).toBeCloseTo(20);
    expect(insights.winningCallout).toBe('dads-over-40');
  });

  it('sums ads that share a callout into one bucket', () => {
    const insights = aggregateByAxis([
      ad({ axisTag: { angle: 'pain', callout: 'dads-over-40' }, spend: 50, conversions: 5 }),
      ad({ axisTag: { angle: 'transformation', callout: 'dads-over-40' }, spend: 70, conversions: 3 }),
    ]);

    expect(insights.byCallout).toHaveLength(1);
    expect(insights.byCallout?.[0].adCount).toBe(2);
    expect(insights.byCallout?.[0].spend).toBe(120);
    expect(insights.byCallout?.[0].conversions).toBe(8);
  });

  it('renders a readable label from the slug', () => {
    const insights = aggregateByAxis([ad({ axisTag: { angle: 'pain', callout: 'dads-over-40' } })]);
    expect(insights.byCallout?.[0].label).toBe('Dads Over 40');
  });

  it('applies the small-sample guard before declaring a winner', () => {
    // Below MIN_AXIS_IMPRESSIONS the ranking is noise. The row still renders — it just gets
    // no star, because "best of two impressions" is not a finding.
    const insights = aggregateByAxis([
      ad({ axisTag: { angle: 'pain', callout: 'dads-over-40' }, impressions: 50 }),
    ]);

    expect(insights.byCallout).toHaveLength(1);
    expect(insights.winningCallout).toBeUndefined();
  });

  it('creates no bucket for an ad with no callout', () => {
    const insights = aggregateByAxis([ad({ axisTag: { angle: 'pain', hook: 'question' } })]);
    expect(insights.byCallout).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. Absence must be distinguishable from emptiness
// ---------------------------------------------------------------------------

describe('byCallout absence', () => {
  it('omits the field entirely rather than emitting an empty array', () => {
    // AxisInsights is embedded in the PERSISTED ChannelAnalysisResult. An empty array would
    // make "no callouts were tested" indistinguishable from "callouts were tested and none
    // qualified", and the UI renders those two states differently.
    const insights = aggregateByAxis([ad({ axisTag: { angle: 'pain', hook: 'question' } })]);

    expect('byCallout' in insights).toBe(false);
    expect('winningCallout' in insights).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Regression — the pre-existing axes must be byte-unchanged
// ---------------------------------------------------------------------------

describe('existing axes are unaffected', () => {
  const ads = [
    ad({ axisTag: { angle: 'pain', hook: 'question', format: 'static_graphic' }, clicks: 100, conversions: 20 }),
    ad({ axisTag: { angle: 'transformation', hook: 'stat', format: 'static_screenshot' }, clicks: 100, conversions: 5 }),
    ad({}), // untagged
  ];

  it('produces the same angle/hook/format output for callout-less ads', () => {
    const insights = aggregateByAxis(ads);

    expect(insights.byAngle.map(s => s.key)).toEqual(['pain', 'transformation']);
    expect(insights.byHook.map(s => s.key)).toEqual(['question', 'stat']);
    expect(insights.byFormat.map(s => s.key)).toEqual(['static_graphic', 'static_screenshot']);
    expect(insights.winningAngle).toBe('pain');
    expect(insights.taggedAdCount).toBe(2);
    expect(insights.untaggedAdCount).toBe(1);
  });

  it('still counts a callout ad toward the angle and hook axes', () => {
    // The callout is an additional axis, not a replacement one — a callout-matrix ad must
    // still attribute to the angle it ran under.
    const insights = aggregateByAxis([
      ad({ axisTag: { angle: 'pain', hook: 'callout', callout: 'dads-over-40' } }),
    ]);

    expect(insights.byAngle.map(s => s.key)).toEqual(['pain']);
    expect(insights.byHook.map(s => s.key)).toEqual(['callout']);
    expect(insights.byCallout?.map(s => s.key)).toEqual(['dads-over-40']);
  });
});

// ---------------------------------------------------------------------------
// 4. Hybrid conversion selection applies to callouts too
// ---------------------------------------------------------------------------

describe('primaryField', () => {
  it('ranks callouts on the selected conversion type', () => {
    // A lead-CVR must never be ranked against a purchase-CVR.
    const ads = [
      ad({
        axisTag: { angle: 'pain', callout: 'a' },
        conversions: 10, purchaseConversions: 1, leadConversions: 9,
      }),
      ad({
        axisTag: { angle: 'pain', callout: 'b' },
        conversions: 10, purchaseConversions: 9, leadConversions: 1,
      }),
    ];

    expect(aggregateByAxis(ads, 'purchases').byCallout?.[0].key).toBe('b');
    expect(aggregateByAxis(ads, 'leads').byCallout?.[0].key).toBe('a');
  });
});
