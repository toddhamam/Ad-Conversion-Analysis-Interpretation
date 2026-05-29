// Axis-level performance attribution for the BlitzScale grid — pure analytics over
// axis-tagged ad data (no AI). Sibling of metaApi's aggregateByType; kept out of the
// AI service (openaiApi) since it does deterministic metric aggregation only.
import { CONCEPT_ANGLES, type AdCreativeData, type AxisStat, type AxisInsights } from './openaiApi';
import { HOOK_LABELS, FORMAT_LABELS } from '../lib/axisTags';

const MIN_AXIS_IMPRESSIONS = 100; // small-sample guard for axis winners

/**
 * Aggregate axis-tagged ads into per-angle / per-hook / per-format performance.
 * Hybrid-aware: `primaryField` selects which conversion count to compare so a
 * lead-CVR is never ranked against a purchase-CVR. Untagged ads are bucketed out.
 */
export function aggregateByAxis(
  ads: AdCreativeData[],
  primaryField: 'purchases' | 'leads' | 'all' = 'all',
): AxisInsights {
  const pickConversions = (ad: AdCreativeData): number => {
    if (primaryField === 'purchases') return ad.purchaseConversions ?? ad.conversions;
    if (primaryField === 'leads') return ad.leadConversions ?? ad.conversions;
    return ad.conversions;
  };
  const angleMap = new Map<string, AxisStat>();
  const hookMap = new Map<string, AxisStat>();
  const formatMap = new Map<string, AxisStat>();
  let taggedAdCount = 0;
  let untaggedAdCount = 0;

  const bump = (map: Map<string, AxisStat>, key: string, label: string, ad: AdCreativeData): void => {
    let s = map.get(key);
    if (!s) {
      s = { key, label, adCount: 0, spend: 0, conversions: 0, clicks: 0, impressions: 0, ctr: 0, cvr: 0, cpa: 0 };
      map.set(key, s);
    }
    s.adCount += 1;
    s.spend += ad.spend || 0;
    s.conversions += pickConversions(ad);
    s.clicks += ad.clicks || 0;
    s.impressions += ad.impressions || 0;
  };

  for (const ad of ads) {
    const tag = ad.axisTag;
    if (!tag) { untaggedAdCount += 1; continue; }
    taggedAdCount += 1;
    bump(angleMap, tag.angle, CONCEPT_ANGLES[tag.angle]?.name ?? tag.angle, ad);
    if (tag.hook) bump(hookMap, tag.hook, HOOK_LABELS[tag.hook] ?? tag.hook, ad);
    if (tag.format) bump(formatMap, tag.format, FORMAT_LABELS[tag.format] ?? tag.format, ad);
  }

  const finalize = (map: Map<string, AxisStat>): AxisStat[] => {
    const arr = Array.from(map.values());
    for (const s of arr) {
      s.ctr = s.impressions > 0 ? (s.clicks / s.impressions) * 100 : 0;
      s.cvr = s.clicks > 0 ? (s.conversions / s.clicks) * 100 : 0;
      s.cpa = s.conversions > 0 ? s.spend / s.conversions : 0;
    }
    arr.sort((a, b) => b.cvr - a.cvr);
    return arr;
  };
  const byAngle = finalize(angleMap);
  const byHook = finalize(hookMap);
  const byFormat = finalize(formatMap);
  const pickWinner = (arr: AxisStat[]): string | undefined => {
    const eligible = arr.filter(s => s.impressions >= MIN_AXIS_IMPRESSIONS);
    return eligible.length > 0 ? eligible[0].key : undefined;
  };
  return {
    byAngle, byHook, byFormat,
    winningAngle: pickWinner(byAngle),
    winningHook: pickWinner(byHook),
    winningFormat: pickWinner(byFormat),
    taggedAdCount,
    untaggedAdCount,
  };
}
