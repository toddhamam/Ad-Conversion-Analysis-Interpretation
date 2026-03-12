/**
 * Meta Ad Policy Compliance Guard
 *
 * Screens AI-generated ad copy and image prompts against Meta's Advertising Standards.
 * Uses a dual-layer approach:
 *   1. Prompt injection (preventive) — policy rules embedded in GPT system prompts
 *   2. Post-generation regex scan (detective) — catches violations that slip through
 *
 * Reference: https://transparency.meta.com/policies/ad-standards
 * Full policy extract: .context/meta-ad-policy-reference.md
 */

// =============================================================================
// TYPES
// =============================================================================

export type PolicySeverity = 'block' | 'warn';
export type PolicyCategory = 'prohibited' | 'restricted' | 'objectionable' | 'quality';

export interface PolicyViolation {
  ruleId: string;
  category: PolicyCategory;
  severity: PolicySeverity;
  field: 'headline' | 'bodyText' | 'callToAction' | 'imagePrompt';
  itemIndex?: number;
  matchedText: string;
  explanation: string;
  suggestion?: string;
}

export interface PolicyScanResult {
  passed: boolean;
  violations: PolicyViolation[];
  hasBlockers: boolean;
  hasWarnings: boolean;
}

interface CopyItem {
  text: string;
  field: 'headline' | 'bodyText' | 'callToAction';
  index: number;
}

// =============================================================================
// POLICY RULES — Derived from Meta Advertising Standards
// =============================================================================

interface PolicyRule {
  id: string;
  category: PolicyCategory;
  severity: PolicySeverity;
  description: string;
  patterns: RegExp[];
  suggestion?: string;
}

const POLICY_RULES: PolicyRule[] = [
  // ── PERSONAL ATTRIBUTE ASSERTIONS (Section 4.6) ─────────────────────
  // The #1 cause of ad rejection. Ads must NOT assert or imply knowledge
  // of the viewer's personal attributes.
  {
    id: 'personal-attr-health',
    category: 'objectionable',
    severity: 'block',
    description: 'Asserts or implies knowledge of the viewer\'s health condition. Meta prohibits ads that contain "direct or indirect assertions or implications about a person\'s physical or mental health."',
    patterns: [
      /\b(?:do you (?:have|suffer|struggle|deal|live) (?:with|from))\b.{0,30}?\b(?:diabet\w*|depress\w*|anxiet\w*|cancer|adhd|ptsd|insomnia|arthrit\w*|obesity|overweight|chronic\s+(?:pain|fatigue)|high\s+blood\s+pressure|heart\s+disease|acne|eczema|migraine\w*|asthma)\b/gi,
      /\b(?:are you)\b.{0,20}?\b(?:diabetic|depressed|anxious|overweight|obese|stressed|exhausted|burnt?\s*out|struggling|suffering|in\s+pain)\b/gi,
      /\b(?:if you'?re|if you are)\b.{0,20}?\b(?:diabetic|depressed|anxious|overweight|obese|stressed|exhausted|suffering|struggling)\b/gi,
      /\b(?:as (?:a|an))\b.{0,20}?\b(?:diabetic|cancer\s+(?:patient|survivor)|depression\s+sufferer|anxiety\s+sufferer|chronic\s+pain\s+sufferer)\b/gi,
      /\byour (?:diabetes|depression|anxiety|cancer|adhd|ptsd|insomnia|arthritis|chronic\s+pain|condition|disorder|illness|disease)\b/gi,
    ],
    suggestion: 'Focus on the product/solution, not the viewer\'s condition. Instead of "Do you have diabetes?", try "A clinically-backed approach to blood sugar management."',
  },
  {
    id: 'personal-attr-financial',
    category: 'objectionable',
    severity: 'block',
    description: 'Asserts or implies knowledge of the viewer\'s financial status. Meta prohibits assertions about "vulnerable financial status."',
    patterns: [
      /\b(?:are you|if you'?re|if you are)\b.{0,20}?\b(?:broke|bankrupt|in\s+debt|poor|struggling\s+financ\w*|financially\s+stru\w*)\b/gi,
      /\byour (?:debt|bankruptcy|financial\s+(?:struggle|problem|crisis|hardship))\b/gi,
      /\b(?:drowning in|crushed by|buried in|crippled by)\s+(?:debt|bills|payments)\b/gi,
    ],
    suggestion: 'Focus on the financial solution. Instead of "Are you in debt?", try "Smart strategies for financial freedom."',
  },
  {
    id: 'personal-attr-other-group',
    category: 'objectionable',
    severity: 'block',
    description: 'Uses "other" language that implies the viewer belongs to a specific group. "Meet other seniors" implies the viewer is a senior. "Meet seniors" is allowed.',
    patterns: [
      /\bmeet (?:other|fellow)\s+(?:senior\w*|christian\w*|muslim\w*|jewish|hindu\w*|buddhist\w*|gay\w*|lesbian\w*|transgender|disabled|black|hispanic|latino|asian)\b/gi,
      /\bjoin (?:other|fellow)\s+(?:senior\w*|christian\w*|muslim\w*|jewish|hindu\w*|buddhist\w*|gay\w*|lesbian\w*|transgender|disabled|sufferer\w*|survivor\w*)\b/gi,
    ],
    suggestion: 'Remove the word "other" or "fellow" — it implies the viewer belongs to that group.',
  },
  {
    id: 'personal-attr-age',
    category: 'objectionable',
    severity: 'block',
    description: 'Asserts or implies knowledge of the viewer\'s specific age.',
    patterns: [
      /\b(?:are you|if you'?re)\s+\d{2,3}\s+(?:years?\s+old|or\s+older|or\s+over|\+)\b/gi,
      /\b(?:now that you'?re|since you'?re|at your age|at age)\s+\d{2,3}\b/gi,
    ],
    suggestion: 'Reference the age group generally. Instead of "Are you 50?", try "Adults over 50 are discovering..."',
  },
  {
    id: 'personal-attr-name',
    category: 'objectionable',
    severity: 'block',
    description: 'Implies knowledge of the viewer\'s personally identifiable information or name.',
    patterns: [
      /\b(?:records show|our records|we (?:know|see|noticed) (?:that )?you)\b/gi,
      /\byour (?:ballot|voter\s+registration|criminal\s+record|driving\s+licen[cs]e)\b/gi,
    ],
    suggestion: 'Remove any language that implies you have access to the viewer\'s personal records.',
  },

  // ── HEALTH CURE CLAIMS (Section 2.10) ──────────────────────────────
  {
    id: 'health-cure-claims',
    category: 'prohibited',
    severity: 'block',
    description: 'Claims to cure, heal, or eliminate an incurable/terminal illness. Meta explicitly bans cure claims for: diabetes, herpes, thyroid, psoriasis, Ebola, cancer, autism, Alzheimer\'s, Parkinson\'s, ALS, HIV.',
    patterns: [
      /\b(?:cure|heal|eliminat\w*|eradicat\w*|revers\w*|get rid of)\s+(?:your\s+)?(?:diabetes|herpes|thyroid|psoriasis|ebola|cancer|autism|alzheimer'?s?|parkinson'?s?|als|hiv|aids)\b/gi,
      /\b(?:diabetes|herpes|thyroid|psoriasis|cancer|autism|alzheimer'?s?|parkinson'?s?|als|hiv)\s+(?:cure|remedy|solution|fix|gone\s+(?:for\s+)?(?:good|forever))\b/gi,
      /\b(?:no more|say goodbye to|finally free (?:from|of)|end your)\s+(?:diabetes|herpes|cancer|psoriasis|thyroid)\b/gi,
    ],
    suggestion: 'You cannot claim to cure these conditions. Instead, focus on management or support: "A new approach to managing blood sugar levels."',
  },

  // ── NEGATIVE SELF-PERCEPTION (Section 3.5) ─────────────────────────
  {
    id: 'negative-self-perception',
    category: 'restricted',
    severity: 'warn',
    description: 'May generate negative self-perception about body, appearance, or weight. Meta prohibits ads that "imply or attempt to generate negative self-perception" to promote health/weight/cosmetic products.',
    patterns: [
      /\b(?:hate your|sick of your|embarrassed (?:by|of) your|ashamed of your)\s+(?:body|face|skin|look\w*|weight|belly|stomach|arm\w*|thigh\w*|appearance)\b/gi,
      /\b(?:tired of looking|tired of feeling|tired of being)\s+(?:old|fat|ugly|unattractive|overweight|out of shape|flabby|wrinkled)\b/gi,
      /\b(?:ugly|disgusting|gross|hideous|repulsive)\s+(?:body|belly|skin|fat|wrinkle\w*|cellulite)\b/gi,
      /\bpinch(?:ing)?\s+(?:your\s+)?(?:fat|belly|skin|flab)\b/gi,
      /\b(?:muffin top|love handles|bat wings|double chin|saggy|flabby)\b.{0,30}?\b(?:embarrass\w*|hate|rid of|eliminat\w*|fix|problem)\b/gi,
    ],
    suggestion: 'Focus on positive aspirations rather than current dissatisfaction. Instead of "Hate your body?", try "Discover a science-backed path to your strongest self."',
  },

  // ── UNREALISTIC PROMISES (Section 2.11) ────────────────────────────
  {
    id: 'unrealistic-promises',
    category: 'restricted',
    severity: 'warn',
    description: 'May contain unrealistic or exaggerated claims. Meta prohibits "deceptive or exaggerated claims about the success of a product."',
    patterns: [
      /\b(?:guaranteed|100%\s+(?:proven|effective|guaranteed|results))\b/gi,
      /\b(?:make|earn)\s+\$[\d,]+\s+(?:in|per|every|a)\s+(?:\d+\s+)?(?:day|week|month|hour|minute)\b/gi,
      /\b(?:instant|immediate|overnight)\s+(?:result\w*|transformation\w*|cure|fix|success|wealth|riches|millionaire)\b/gi,
      /\blose\s+\d{2,}\s+(?:lb|lbs|pound|pounds|kg|kilos?)\s+in\s+\d+\s+(?:day|week)\b/gi,
      /\b(?:get rich|become (?:a )?millionaire|financial freedom)\s+(?:quick\w*|fast|overnight|in\s+\d+\s+(?:day|week))\b/gi,
      /\b(?:never\s+(?:work|worry)\s+again|quit your job|retire\s+(?:early|in\s+\d+))\b/gi,
    ],
    suggestion: 'Add qualifiers or use realistic language. Instead of "Guaranteed results!", try "Results backed by [specific evidence]." Include disclaimers where required.',
  },

  // ── PROFANITY (Section 4.5) ────────────────────────────────────────
  {
    id: 'profanity',
    category: 'objectionable',
    severity: 'block',
    description: 'Contains profanity. Meta explicitly prohibits profanity in ads.',
    patterns: [
      /\b(?:fuck\w*|shit\w*|bitch\w*|ass(?:hole)?|damn\w*|crap|hell|piss\w*|bastard|dick(?:head)?|cock(?:sucker)?|bullshit|wtf|stfu|lmfao)\b/gi,
    ],
    suggestion: 'Remove all profanity. Ads on Meta must not contain any swear words.',
  },

  // ── DECEPTIVE CONTENT (Section 2.10, 2.11) ────────────────────────
  {
    id: 'deceptive-celebrity',
    category: 'prohibited',
    severity: 'block',
    description: 'May use a famous person\'s name/image with misleading claims. Meta prohibits "using the image of a famous person and misleading tactics to bait people."',
    patterns: [
      /\b(?:elon\s+musk|jeff\s+bezos|oprah|dr\.?\s+oz|warren\s+buffett|mark\s+zuckerberg|bill\s+gates|trump|obama|biden)\b.{0,50}?\b(?:endors\w*|recommend\w*|approv\w*|secret|reveal\w*|invest\w*|support\w*)\b/gi,
    ],
    suggestion: 'Do not use celebrity names to imply endorsement unless you have verified authorization.',
  },
  {
    id: 'deceptive-financial-entity',
    category: 'prohibited',
    severity: 'block',
    description: 'Misrepresents a financial entity or news outlet. Meta prohibits "promising financial benefits by misrepresenting an entity, industry association, or news outlet."',
    patterns: [
      /\b(?:as (?:seen|featured|reported) (?:on|in|by))\s+(?:cnn|fox\s+news|bbc|cnbc|forbes|wall\s+street\s+journal|new york times|reuters|bloomberg)\b/gi,
    ],
    suggestion: 'Only reference media outlets if you have genuine, verifiable coverage. Consider removing the claim entirely.',
  },

  // ── HEALTH TIME-BOUND CLAIMS (Section 2.10) ───────────────────────
  {
    id: 'health-timebound-claims',
    category: 'restricted',
    severity: 'warn',
    description: 'Promises specific health results in a specific timeframe without qualifiers. Meta prohibits "promising specific health-related results in specific time with no qualifying or disclaimer language."',
    patterns: [
      /\b(?:lose|drop|shed|burn)\s+\d+\s+(?:lb|lbs|pound|pounds|kg|kilo\w*)\s+in\s+\d+\s+(?:day|week|month)\b/gi,
      /\b(?:cure|heal|fix|clear|eliminate)\s+(?:your\s+)?(?:acne|eczema|pain|inflammation|symptoms?)\s+in\s+\d+\s+(?:day|week|hour)\b/gi,
      /\b(?:flat\s+stomach|six[- ]pack|abs)\s+in\s+\d+\s+(?:day|week)\b/gi,
    ],
    suggestion: 'Add qualifiers like "results may vary" or remove the specific timeframe. Focus on the method rather than guaranteeing outcomes.',
  },

  // ── CLICKBAIT HEALTH TACTICS (Section 2.10) ───────────────────────
  {
    id: 'health-clickbait',
    category: 'restricted',
    severity: 'warn',
    description: 'Uses sensational or clickbait language in a health context. Meta prohibits "click-bait tactics in a health context, such as the use of sensational language that makes exaggerated or extreme health claims."',
    patterns: [
      /\b(?:doctors?\s+(?:don'?t\s+want|hate|are\s+furious|won'?t\s+tell)|big\s+pharma\s+(?:doesn'?t|hates|is\s+hiding))\b/gi,
      /\b(?:one\s+(?:weird|simple|strange)\s+trick|this\s+(?:weird|strange|simple)\s+(?:trick|hack|method|food|ingredient))\b/gi,
      /\b(?:miracle\s+(?:cure|pill|supplement|food|ingredient|formula)|wonder\s+(?:drug|pill|cure))\b/gi,
    ],
    suggestion: 'Avoid sensational health language. Instead of "Doctors hate this one weird trick", try "A research-backed approach that\'s gaining attention."',
  },

  // ── BANNED FINANCIAL PRODUCTS (Section 3.13) ──────────────────────
  {
    id: 'banned-financial-products',
    category: 'prohibited',
    severity: 'block',
    description: 'Promotes a banned financial product. Meta bans: payday loans, salary advances, bail bonds, short-term loans (90 days or less), binary options, CFD trading, ICOs, penny auctions.',
    patterns: [
      /\b(?:payday\s+loan|salary\s+advance|bail\s+bond)\b/gi,
      /\b(?:binary\s+option\w*|contract\s+for\s+difference|cfd\s+trading)\b/gi,
      /\b(?:initial\s+coin\s+offering|ico\s+(?:sale|launch|invest))\b/gi,
      /\b(?:penny\s+auction|bidding\s+fee\s+auction)\b/gi,
    ],
    suggestion: 'These financial products cannot be advertised on Meta platforms under any circumstances.',
  },

  // ── EATING DISORDERS / BODY IMAGERY (Section 4.8) ─────────────────
  {
    id: 'eating-disorder-content',
    category: 'objectionable',
    severity: 'block',
    description: 'References eating disorders, extreme weight loss, or banned body imagery in a recovery/wellness context. Meta bans: depictions of ribs, thigh gaps, concave stomach, protruding spine, hollow cheeks in recovery context.',
    patterns: [
      /\b(?:thigh\s+gap|collar\s+bone\w*|concave\s+stomach|protruding\s+spine|hollow\s+cheek\w*|visible\s+(?:bone|rib)\w*)\b/gi,
      /\b(?:anorexi\w*|bulimi\w*|binge\s+(?:eating|purging)|pro[- ]?ana|thinspo|thinspiration)\b/gi,
      /\b(?:extreme\s+(?:weight\s+loss|diet|fasting|starvation))\b/gi,
    ],
    suggestion: 'Avoid references to eating disorders, extreme dieting, or body parts associated with underweight conditions.',
  },

  // ── TOBACCO / DRUGS (Sections 3.9, 3.11) ──────────────────────────
  {
    id: 'tobacco-drugs',
    category: 'prohibited',
    severity: 'block',
    description: 'Promotes tobacco, vaping, nicotine products, or recreational drugs. These are completely banned on Meta.',
    patterns: [
      /\b(?:buy|order|shop|get)\s+(?:your\s+)?(?:cigarette\w*|cigar\w*|vape\w*|e[- ]?cig\w*|tobacco|nicotine\s+pouch\w*|rolling\s+paper\w*|hookah|bong|weed|marijuana|cannabis|thc|cbd\s+(?:oil|gumm\w*|tincture))\b/gi,
      /\b(?:vape|vaping|e[- ]?cigarette\w*|juul|hookah)\s+(?:shop|store|deal\w*|discount|sale|free)\b/gi,
    ],
    suggestion: 'Tobacco, vaping, nicotine, and recreational drug products cannot be advertised on Meta.',
  },

  // ── WEAPONS (Section 3.10) ────────────────────────────────────────
  {
    id: 'weapons',
    category: 'prohibited',
    severity: 'block',
    description: 'Promotes the sale or use of weapons, ammunition, or explosives.',
    patterns: [
      /\b(?:buy|order|shop|sale|deal\w*|discount)\s+(?:your\s+)?(?:gun\w*|firearm\w*|rifle\w*|pistol\w*|shotgun\w*|ammunit\w*|ammo|knife|knives|taser\w*|pepper\s+spray|explosiv\w*)\b/gi,
    ],
    suggestion: 'Weapons and ammunition cannot be advertised on Meta.',
  },

  // ── DISCRIMINATION (Section 2.5) ──────────────────────────────────
  {
    id: 'discriminatory-content',
    category: 'prohibited',
    severity: 'block',
    description: 'Contains discriminatory content based on protected characteristics.',
    patterns: [
      /\b(?:only\s+for|not\s+for|no\s+(?:blacks?|whites?|asians?|hispanics?|jews?|muslims?|christians?|gays?|lesbians?|transgenders?|disabled|women|men))\b/gi,
    ],
    suggestion: 'Remove any language that excludes or discriminates against protected groups.',
  },

  // ── CRISIS EXPLOITATION (Section 3.2) ─────────────────────────────
  {
    id: 'crisis-exploitation',
    category: 'restricted',
    severity: 'warn',
    description: 'May exploit a crisis or controversial event for commercial purposes. Meta prohibits implying urgency or using language that may contribute to panic or fear around crises.',
    patterns: [
      /\b(?:before\s+(?:it'?s\s+too\s+late|the\s+(?:government|fda|they)\s+ban\w*|(?:supplies?|stock)\s+run\s+out))\b/gi,
      /\b(?:pandemic|outbreak|lockdown|quarantine|martial\s+law)\s+(?:proof|ready|survival|prep\w*|essential)\b/gi,
    ],
    suggestion: 'Remove panic/fear language tied to crises. Focus on the product\'s inherent value without exploiting current events.',
  },

  // ── VACCINE DISCOURAGEMENT (Section 2.9) ──────────────────────────
  {
    id: 'vaccine-discouragement',
    category: 'prohibited',
    severity: 'block',
    description: 'Discourages vaccination or advocates against vaccines.',
    patterns: [
      /\b(?:anti[- ]?vax|vaccines?\s+(?:cause|are\s+(?:dangerous|harmful|deadly|poison)|don'?t\s+work)|don'?t\s+(?:get\s+)?vaccin\w*)\b/gi,
    ],
    suggestion: 'Meta prohibits any content that discourages vaccination.',
  },
];

// =============================================================================
// IMAGE PROMPT RULES — Separate set for screening Gemini prompts
// =============================================================================

const IMAGE_PROMPT_RULES: PolicyRule[] = [
  {
    id: 'img-nudity',
    category: 'objectionable',
    severity: 'block',
    description: 'Image prompt may produce nudity or sexually suggestive content.',
    patterns: [
      /\b(?:nude|naked|topless|lingerie\s+model|bikini\s+(?:model|babe)|cleavage|provocative\s+pose|seductive|sensual)\b/gi,
      /\b(?:sex\w*\s+(?:position|pose|act)|erotic|pornograph\w*)\b/gi,
    ],
    suggestion: 'Remove sexually suggestive elements from the image prompt.',
  },
  {
    id: 'img-violence',
    category: 'objectionable',
    severity: 'block',
    description: 'Image prompt may produce violent or graphic content.',
    patterns: [
      /\b(?:blood\w*|gore|wound\w*|dead\s+bod\w*|murder|violent|graphic\s+injur\w*|torture|mutilat\w*)\b/gi,
    ],
    suggestion: 'Remove violent or graphic imagery from the image prompt.',
  },
  {
    id: 'img-weapons',
    category: 'prohibited',
    severity: 'block',
    description: 'Image prompt may produce weapons in a sales context.',
    patterns: [
      /\b(?:gun|firearm|rifle|pistol|shotgun|knife|sword|bomb|explosive|grenade)\b.{0,30}?\b(?:buy|sale|shop|deal|discount|product)\b/gi,
    ],
    suggestion: 'Remove weapon references from the image prompt.',
  },
  {
    id: 'img-tobacco-drugs',
    category: 'prohibited',
    severity: 'block',
    description: 'Image prompt may produce tobacco, drug, or smoking imagery.',
    patterns: [
      /\b(?:smoking|cigarette|vaping|vape|joint|bong|drug\s+(?:use|paraphernalia)|syringe|needle\s+inject\w*)\b/gi,
    ],
    suggestion: 'Remove tobacco/drug references from the image prompt.',
  },
  {
    id: 'img-before-after',
    category: 'restricted',
    severity: 'warn',
    description: 'Image prompt may produce before/after weight loss comparison (banned for weight loss products).',
    patterns: [
      /\b(?:before\s+and\s+after|side[- ]by[- ]side\s+(?:comparison|transformation))\b.{0,40}?\b(?:weight|fat|body|slim|thin|fit)\b/gi,
    ],
    suggestion: 'Before/after weight loss comparisons are restricted. Show the product or positive outcomes instead.',
  },
  {
    id: 'img-deceptive-ui',
    category: 'prohibited',
    severity: 'block',
    description: 'Image prompt may produce fake UI elements (play buttons, notifications, interface elements).',
    patterns: [
      /\b(?:fake\s+(?:play\s+button|notification|interface|ui|dialog|popup|alert)|mock\s+(?:interface|notification))\b/gi,
    ],
    suggestion: 'Do not include fake UI elements in ad images — they violate Meta\'s deceptive content policy.',
  },
];

// =============================================================================
// PROMPT INJECTION TEXT — Injected into GPT system prompts during copy generation
// =============================================================================

export const META_AD_POLICY_PROMPT = `META ADVERTISING POLICY COMPLIANCE (MANDATORY — violations cause ad rejection and account bans):
- NEVER assert or imply knowledge of the reader's personal attributes (health, financial status, age, race, religion, sexual orientation, gender identity, disability, criminal record, name, voting status).
  BAD: "Are you diabetic?" / "Depression getting you down?" / "Meet other seniors" / "Are you in debt?"
  GOOD: "New diabetes management approach" / "Depression counselling available" / "Meet seniors" / "Smart strategies for financial freedom"
- NEVER use "other" or "fellow" before a demographic group — it implies the viewer belongs to that group.
- NEVER claim to cure, heal, or eliminate: diabetes, herpes, thyroid conditions, psoriasis, cancer, autism, Alzheimer's, Parkinson's, ALS, HIV/AIDS, or Ebola.
- NEVER promise specific health results in a specific timeframe without qualifiers (e.g., "Lose 30 lbs in 2 weeks").
- NEVER use language that generates negative self-perception about body, weight, appearance, or age (e.g., "Hate your body?", "Tired of looking old?").
- NEVER include profanity of any kind.
- NEVER use sensational/clickbait health language ("Doctors hate this trick", "Miracle cure").
- NEVER use celebrity names to imply endorsement without authorization.
- NEVER misrepresent media outlets ("As seen on CNN" without genuine coverage).
- NEVER promise unrealistic financial results ("Make $10K overnight", "Get rich quick").
- Use "you/your" language freely — but WITHOUT personal attribute assertions. "Transform your routine" is fine. "As a diabetic, transform your routine" is not.
- For health/wellness: focus on the product/method, not the viewer's current condition.`;

// =============================================================================
// QUICK SCAN — Regex-based instant compliance check (no API call)
// =============================================================================

/**
 * Instantly scan copy items for Meta Ad Policy violations using regex patterns.
 * Returns an array of violations found. Fast and synchronous — no API call.
 */
export function quickScanCopy(items: CopyItem[]): PolicyViolation[] {
  const violations: PolicyViolation[] = [];

  for (const item of items) {
    const text = item.text;
    if (!text) continue;

    for (const rule of POLICY_RULES) {
      for (const pattern of rule.patterns) {
        // Reset lastIndex for global regexes
        pattern.lastIndex = 0;
        const match = pattern.exec(text);
        if (match) {
          violations.push({
            ruleId: rule.id,
            category: rule.category,
            severity: rule.severity,
            field: item.field,
            itemIndex: item.index,
            matchedText: match[0],
            explanation: rule.description,
            suggestion: rule.suggestion,
          });
          break; // One match per rule per item is enough
        }
      }
    }
  }

  return violations;
}

/**
 * Scan an image generation prompt for Meta Ad Policy violations.
 * Returns violations found. Synchronous — runs before sending to Gemini.
 */
export function screenImagePrompt(promptParts: string[]): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  const fullPrompt = promptParts.join(' ');

  for (const rule of IMAGE_PROMPT_RULES) {
    for (const pattern of rule.patterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(fullPrompt);
      if (match) {
        violations.push({
          ruleId: rule.id,
          category: rule.category,
          severity: rule.severity,
          field: 'imagePrompt',
          matchedText: match[0],
          explanation: rule.description,
          suggestion: rule.suggestion,
        });
        break;
      }
    }
  }

  return violations;
}

/**
 * Build a combined PolicyScanResult from an array of violations.
 */
export function buildScanResult(violations: PolicyViolation[]): PolicyScanResult {
  return {
    passed: !violations.some(v => v.severity === 'block'),
    violations,
    hasBlockers: violations.some(v => v.severity === 'block'),
    hasWarnings: violations.some(v => v.severity === 'warn'),
  };
}

/**
 * Get the image safety directive to append to Gemini prompts.
 * This is always added to reduce the chance of policy-violating image generation.
 */
export const IMAGE_SAFETY_DIRECTIVE = `
IMPORTANT CONTENT RESTRICTIONS — The generated image MUST NOT contain:
- Nudity, sexually suggestive poses, or explicit content
- Weapons, firearms, knives, or explosives
- Tobacco products, cigarettes, vaping devices, or drug paraphernalia
- Blood, gore, violence, or graphic injuries
- Before/after body transformation comparisons
- Fake UI elements (play buttons, notifications, dialog boxes)
- Content that could be perceived as shocking, sensational, or disturbing
- Text that asserts knowledge of the viewer's personal attributes
The image should be professional, brand-safe, and suitable for all audiences on Meta platforms.`;

/**
 * Flat regex array for silent sanitization in sanitizeCopyText().
 * These are the same patterns from POLICY_RULES, flattened for direct use
 * in the existing banned-phrase replacement loop.
 */
export const POLICY_SANITIZE_PATTERNS: RegExp[] = POLICY_RULES.flatMap(rule => rule.patterns);
