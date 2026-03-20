/**
 * Server-side AI channel analysis for external reports.
 *
 * Port of analyzeChannelPerformance() from src/services/openaiApi.ts,
 * adapted for server-side execution (no browser APIs, text-only, no images).
 *
 * This file is a shared helper in api/_lib/ — NOT a serverless function.
 */

import { buildDateParamsForPreset } from './metrics.js';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-5.4';
const GRAPH_API_BASE = 'https://graph.facebook.com/v24.0';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AdCreativeData {
  id: string;
  headline: string;
  bodyText: string;
  campaignName: string;
  adsetName: string;
  spend: number;
  conversions: number;
  conversionRate: number;
  costPerConversion: number;
  clicks: number;
  impressions: number;
  ctr: number;
  roas?: number;
}

export interface ServerAnalysisResult {
  executiveSummary: string;
  overallHealthScore: number;
  performanceBreakdown: {
    totalAdsAnalyzed: number;
    highPerformers: number;
    midPerformers: number;
    lowPerformers: number;
    avgConversionRate: number;
    avgCostPerConversion: number;
    totalSpend: number;
    totalConversions: number;
  };
  winningPatterns: {
    headlines: string[];
    copyElements: string[];
    emotionalTriggers: string[];
    callToActions: string[];
  };
  losingPatterns: {
    headlines: string[];
    copyElements: string[];
    issues: string[];
  };
  recommendations: {
    immediate: string[];
    shortTerm: string[];
    strategic: string[];
    creativeDirection: string[];
  };
  topAds: Array<{
    id: string;
    headline: string;
    conversionRate: number;
    whyItWorks: string;
    psychologicalDrivers: string[];
  }>;
  bottomAds: Array<{
    id: string;
    headline: string;
    conversionRate: number;
    whyItFails: string;
    suggestedFix: string;
  }>;
}

// ─── Business Type Config (server-side port) ─────────────────────────────────

function getAIConversionLanguage(businessType?: string): string {
  if (businessType === 'leadgen') {
    return 'When we say "conversion", we mean a lead submission (form fill, booked call, opt-in). Cost Per Lead is the primary performance metric. ROAS and revenue do NOT apply to this business.';
  }
  return 'When we say "conversion", we mean a completed purchase. ROAS (Return on Ad Spend) and AOV (Average Order Value) are the primary performance metrics.';
}

// ─── Meta API: Fetch Ad-Level Insights ───────────────────────────────────────

async function fetchAdLevelInsights(
  adAccountId: string,
  accessToken: string,
  dateParams: Record<string, string>,
): Promise<Array<Record<string, unknown>>> {
  const accountId = adAccountId.replace('act_', '');
  const fields = 'ad_id,ad_name,campaign_name,adset_name,spend,impressions,clicks,ctr,actions,action_values';

  let allRows: Array<Record<string, unknown>> = [];
  let url: string | null = `${GRAPH_API_BASE}/act_${accountId}/insights?` +
    new URLSearchParams({
      ...dateParams,
      fields,
      level: 'ad',
      limit: '100',
      access_token: accessToken,
    }).toString();

  while (url) {
    const resp = await fetch(url);
    if (!resp.ok) break;
    const data = await resp.json();
    allRows = allRows.concat(data.data || []);

    // Follow pagination
    url = data.paging?.next || null;
    // Cap at 200 ads to stay within token budget
    if (allRows.length >= 200) break;
  }

  return allRows;
}

// ─── Meta API: Fetch Ad Creatives ────────────────────────────────────────────

async function fetchAdCreatives(
  adIds: string[],
  accessToken: string,
): Promise<Map<string, { headline: string; bodyText: string }>> {
  const creativeMap = new Map<string, { headline: string; bodyText: string }>();

  // Batch fetch in groups of 50
  for (let i = 0; i < adIds.length; i += 50) {
    const batch = adIds.slice(i, i + 50);
    const ids = batch.join(',');
    const url = `${GRAPH_API_BASE}/ads?ids=${ids}&fields=name,creative{title,body,object_story_spec}&access_token=${accessToken}`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const data = await resp.json();

      for (const [adId, adData] of Object.entries(data)) {
        const ad = adData as Record<string, unknown>;
        const creative = ad.creative as Record<string, unknown> | undefined;
        if (!creative) continue;

        let headline = (creative.title as string) || '';
        let bodyText = (creative.body as string) || '';

        // Extract from object_story_spec if available
        const spec = creative.object_story_spec as Record<string, unknown> | undefined;
        if (spec) {
          const linkData = spec.link_data as Record<string, unknown> | undefined;
          if (linkData) {
            if (!headline && linkData.name) headline = linkData.name as string;
            if (!bodyText && linkData.message) bodyText = linkData.message as string;
          }
        }

        creativeMap.set(adId, { headline, bodyText });
      }
    } catch {
      // Continue without creative data for this batch
    }
  }

  return creativeMap;
}

// ─── Build AdCreativeData Array ──────────────────────────────────────────────

function buildAdCreativeDataArray(
  adRows: Array<Record<string, unknown>>,
  creativeMap: Map<string, { headline: string; bodyText: string }>,
): AdCreativeData[] {
  const ads: AdCreativeData[] = [];

  for (const row of adRows) {
    const adId = row.ad_id as string;
    const spend = Number(row.spend || 0);
    const clicks = Number(row.clicks || 0);
    const impressions = Number(row.impressions || 0);

    const actions = (row.actions as Array<{ action_type: string; value: string }>) || [];
    const actionValues = (row.action_values as Array<{ action_type: string; value: string }>) || [];

    const conversions = Number(actions.find(a => a.action_type === 'offsite_conversion.fb_pixel_purchase')?.value || 0);
    const revenue = Number(actionValues.find(a => a.action_type === 'offsite_conversion.fb_pixel_purchase')?.value || 0);

    const creative = creativeMap.get(adId);

    ads.push({
      id: adId,
      headline: creative?.headline || (row.ad_name as string) || '',
      bodyText: creative?.bodyText || '',
      campaignName: (row.campaign_name as string) || '',
      adsetName: (row.adset_name as string) || '',
      spend,
      conversions,
      conversionRate: clicks > 0 ? (conversions / clicks) * 100 : 0,
      costPerConversion: conversions > 0 ? spend / conversions : 0,
      clicks,
      impressions,
      ctr: Number(row.ctr || 0),
      roas: spend > 0 ? revenue / spend : undefined,
    });
  }

  // Sort by spend descending and limit to top 50
  return ads
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 50);
}

// ─── JSON Repair (ported from openaiApi.ts) ──────────────────────────────────

function attemptJsonRepair(input: string): string | null {
  const jsonStart = input.indexOf('{');
  if (jsonStart === -1) return null;

  let json = input.slice(jsonStart);
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }

  if (stack.length === 0) return null;

  json = json.replace(/,\s*$/, '');
  if (inString) json += '"';
  json = json.replace(/,?\s*"[^"]*":\s*"?[^",}\]]*$/, '');

  while (stack.length > 0) {
    json += stack.pop();
  }

  try {
    JSON.parse(json);
    return json;
  } catch {
    return null;
  }
}

// ─── Multi-Strategy JSON Parser ──────────────────────────────────────────────

function parseAnalysisResponse(response: string): Record<string, unknown> {
  let cleanedResponse = response.trim();

  // Strategy 1: Direct parse
  try {
    return JSON.parse(cleanedResponse);
  } catch {
    // Continue to next strategy
  }

  // Strategy 2: Extract from markdown code fences
  const jsonBlockMatch = cleanedResponse.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (jsonBlockMatch) {
    cleanedResponse = jsonBlockMatch[1].trim();
  } else {
    // Strategy 3: Brace matching
    const jsonStart = cleanedResponse.indexOf('{');
    if (jsonStart !== -1) {
      let depth = 0;
      let jsonEnd = -1;
      for (let i = jsonStart; i < cleanedResponse.length; i++) {
        if (cleanedResponse[i] === '{') depth++;
        else if (cleanedResponse[i] === '}') {
          depth--;
          if (depth === 0) { jsonEnd = i; break; }
        }
      }
      if (jsonEnd !== -1) {
        cleanedResponse = cleanedResponse.slice(jsonStart, jsonEnd + 1);
      } else {
        const lastBrace = cleanedResponse.lastIndexOf('}');
        if (lastBrace > jsonStart) {
          cleanedResponse = cleanedResponse.slice(jsonStart, lastBrace + 1);
        }
      }
    }
  }

  try {
    return JSON.parse(cleanedResponse.trim());
  } catch {
    // Strategy 4: JSON repair
    const repaired = attemptJsonRepair(cleanedResponse.trim());
    if (repaired) {
      return JSON.parse(repaired);
    }
    throw new Error('All JSON parsing strategies failed');
  }
}

// ─── Main Analysis Function ──────────────────────────────────────────────────

export async function analyzeServerSide(
  accessToken: string,
  adAccountId: string,
  datePreset: string,
  businessType?: string,
): Promise<ServerAnalysisResult> {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not configured');
  }

  // Fetch ad-level insights
  const dateParams = buildDateParamsForPreset(datePreset);
  const adRows = await fetchAdLevelInsights(adAccountId, accessToken, dateParams);

  if (adRows.length === 0) {
    throw new Error('No ad data found for this period');
  }

  // Fetch creative details
  const adIds = adRows.map(r => r.ad_id as string);
  const creativeMap = await fetchAdCreatives(adIds, accessToken);

  // Build structured data
  const ads = buildAdCreativeDataArray(adRows, creativeMap);

  // Calculate aggregated statistics
  const totalSpend = ads.reduce((sum, ad) => sum + ad.spend, 0);
  const totalConversions = ads.reduce((sum, ad) => sum + ad.conversions, 0);
  const avgConversionRate = ads.reduce((sum, ad) => sum + ad.conversionRate, 0) / ads.length;
  const avgCostPerConversion = totalConversions > 0 ? totalSpend / totalConversions : 0;

  const sortedAds = [...ads].sort((a, b) => b.conversionRate - a.conversionRate);
  const highPerformers = sortedAds.filter(ad => ad.conversionRate > avgConversionRate * 1.5);
  const lowPerformers = sortedAds.filter(ad => ad.conversionRate < avgConversionRate * 0.5);
  const midPerformers = sortedAds.filter(ad =>
    ad.conversionRate >= avgConversionRate * 0.5 && ad.conversionRate <= avgConversionRate * 1.5,
  );

  const top5 = sortedAds.slice(0, Math.min(5, sortedAds.length));
  const bottom5 = sortedAds.slice(-Math.min(5, sortedAds.length)).reverse();

  // Headline grouping
  const headlineGroups = new Map<string, AdCreativeData[]>();
  ads.forEach(ad => {
    const existing = headlineGroups.get(ad.headline) || [];
    existing.push(ad);
    headlineGroups.set(ad.headline, existing);
  });

  const sameHeadlineDifferentPerformance = Array.from(headlineGroups.entries())
    .filter(([, grouped]) => grouped.length > 1)
    .map(([headline, grouped]) => {
      const sorted = [...grouped].sort((a, b) => b.conversionRate - a.conversionRate);
      return {
        headline,
        ads: sorted,
        best: sorted[0],
        worst: sorted[sorted.length - 1],
        performanceDiff: sorted[0].conversionRate - sorted[sorted.length - 1].conversionRate,
      };
    })
    .filter(group => group.performanceDiff > 1)
    .sort((a, b) => b.performanceDiff - a.performanceDiff)
    .slice(0, 3);

  // Build prompt (text-only — no images for server-side)
  const conversionLanguage = getAIConversionLanguage(businessType);

  const systemPrompt = `You are an EXPERT advertising creative analyst and conversion optimization specialist.

YOUR PRIMARY TASK: Analyze ad performance data to understand WHY certain ads convert and others don't.

Focus on:
1. HEADLINE PATTERNS: Analyze what makes certain headlines convert better
2. COPY ANALYSIS: What body text patterns correlate with high/low conversion
3. CAMPAIGN/ADSET CONTEXT: Use campaign and adset names to infer creative strategies
4. PSYCHOLOGICAL TRIGGERS in copy: Identify persuasion techniques, emotional triggers, urgency cues
5. SAME HEADLINE COMPARISON: When the same headline has different performance, identify differentiators
6. CONVERSION PSYCHOLOGY: Apply principles like cognitive dissonance reduction, social proof, fear resolution`;

  const analysisPrompt = `
BUSINESS CONTEXT:
${conversionLanguage}

**ACCOUNT OVERVIEW:**
- Total Ads: ${ads.length}
- Total Spend: $${totalSpend.toFixed(2)}
- Total Conversions: ${totalConversions}
- Average CVR: ${avgConversionRate.toFixed(2)}%
- High Performers: ${highPerformers.length} | Mid: ${midPerformers.length} | Low: ${lowPerformers.length}

**TOP 5 ADS - DETAILED:**
${top5.map((ad, i) => `
${i + 1}. Ad ID: ${ad.id}
   Headline: "${ad.headline}"
   Body: "${ad.bodyText}"
   Campaign: ${ad.campaignName}
   Ad Set: ${ad.adsetName}
   CVR: ${ad.conversionRate.toFixed(2)}% | Spend: $${ad.spend.toFixed(2)} | Conversions: ${ad.conversions}
`).join('')}

**BOTTOM 5 ADS - DETAILED:**
${bottom5.map((ad, i) => `
${i + 1}. Ad ID: ${ad.id}
   Headline: "${ad.headline}"
   Body: "${ad.bodyText}"
   Campaign: ${ad.campaignName}
   Ad Set: ${ad.adsetName}
   CVR: ${ad.conversionRate.toFixed(2)}% | Spend: $${ad.spend.toFixed(2)} | Conversions: ${ad.conversions}
`).join('')}

**SAME HEADLINE, DIFFERENT PERFORMANCE:**
${sameHeadlineDifferentPerformance.length > 0 ? sameHeadlineDifferentPerformance.map(group => `
Headline: "${group.headline}"
- Best: ${group.best.conversionRate.toFixed(2)}% CVR (Ad ${group.best.id}, AdSet: ${group.best.adsetName})
- Worst: ${group.worst.conversionRate.toFixed(2)}% CVR (Ad ${group.worst.id}, AdSet: ${group.worst.adsetName})
- Gap: ${group.performanceDiff.toFixed(2)}% difference across ${group.ads.length} variations
`).join('') : 'No headlines with multiple variations found.'}

**ALL ADS PERFORMANCE:**
${sortedAds.map(ad => `- "${ad.headline}" | CVR: ${ad.conversionRate.toFixed(2)}% | Ad ${ad.id} | AdSet: ${ad.adsetName}`).join('\n')}

Based on the performance data and copy patterns, provide comprehensive insights in this JSON format:
{
  "executiveSummary": "<2-3 paragraphs focusing on copy patterns, psychological triggers, and performance drivers>",
  "overallHealthScore": <1-10>,
  "winningPatterns": {
    "headlines": ["<pattern 1>", "<pattern 2>"],
    "copyElements": ["<pattern 1>", "<pattern 2>"],
    "emotionalTriggers": ["<trigger 1>", "<trigger 2>"],
    "callToActions": ["<CTA pattern 1>", "<CTA pattern 2>"]
  },
  "losingPatterns": {
    "headlines": ["<pattern 1>", "<pattern 2>"],
    "copyElements": ["<pattern 1>", "<pattern 2>"],
    "issues": ["<issue 1>", "<issue 2>"]
  },
  "recommendations": {
    "immediate": ["<action 1>", "<action 2>"],
    "shortTerm": ["<action 1>", "<action 2>"],
    "strategic": ["<action 1>", "<action 2>"],
    "creativeDirection": ["<recommendation 1>", "<rec 2>"]
  },
  "topAds": [
    {
      "id": "<ad id>",
      "headline": "<headline>",
      "conversionRate": <rate>,
      "whyItWorks": "<explanation>",
      "psychologicalDrivers": ["<principle 1>", "<principle 2>"]
    }
  ],
  "bottomAds": [
    {
      "id": "<ad id>",
      "headline": "<headline>",
      "conversionRate": <rate>,
      "whyItFails": "<explanation>",
      "suggestedFix": "<specific fix>"
    }
  ]
}

Return ONLY the JSON object, no additional text.`;

  // Call OpenAI
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000); // 55s to leave room for response

  try {
    const resp = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: analysisPrompt },
        ],
        max_completion_tokens: 16384,
        reasoning: { effort: 'high' },
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({}));
      throw new Error(`OpenAI API error (${resp.status}): ${errorData?.error?.message || resp.statusText}`);
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    // Parse with multi-strategy parser
    const parsed = parseAnalysisResponse(content) as Record<string, unknown>;

    return {
      executiveSummary: (parsed.executiveSummary as string) || '',
      overallHealthScore: (parsed.overallHealthScore as number) || 0,
      performanceBreakdown: {
        totalAdsAnalyzed: ads.length,
        highPerformers: highPerformers.length,
        midPerformers: midPerformers.length,
        lowPerformers: lowPerformers.length,
        avgConversionRate,
        avgCostPerConversion,
        totalSpend,
        totalConversions,
      },
      winningPatterns: (parsed.winningPatterns as ServerAnalysisResult['winningPatterns']) || {
        headlines: [], copyElements: [], emotionalTriggers: [], callToActions: [],
      },
      losingPatterns: (parsed.losingPatterns as ServerAnalysisResult['losingPatterns']) || {
        headlines: [], copyElements: [], issues: [],
      },
      recommendations: (parsed.recommendations as ServerAnalysisResult['recommendations']) || {
        immediate: [], shortTerm: [], strategic: [], creativeDirection: [],
      },
      topAds: (parsed.topAds as ServerAnalysisResult['topAds']) || [],
      bottomAds: (parsed.bottomAds as ServerAnalysisResult['bottomAds']) || [],
    };
  } finally {
    clearTimeout(timeout);
  }
}
