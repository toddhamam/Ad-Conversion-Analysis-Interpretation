"""Lead scoring — 17-point rubric + bucket classification."""

from modules.pipeline import load_pipeline, update_prospect


# 17-point scoring rubric
SCORING_RULES = {
    "active_ads_50_plus": {"points": 4, "description": "50+ active ads"},
    "active_ads_20_49": {"points": 3, "description": "20-49 active ads"},
    "active_ads_10_19": {"points": 2, "description": "10-19 active ads"},
    "multi_platform": {"points": 2, "description": "Ads on 2+ platforms"},
    "long_running_ads": {"points": 2, "description": "Ads running 60+ days"},
    "creative_fatigue": {"points": 3, "description": "Creative fatigue visible"},
    "hiring_creative": {"points": 3, "description": "Hiring creative/media roles"},
    "series_a_plus": {"points": 2, "description": "Series A+ funded"},
    "revenue_1m_plus": {"points": 2, "description": "Revenue $1M+ signals"},
    "active_blog": {"points": 1, "description": "Active blog/content"},
    "shopify_bigcommerce": {"points": 1, "description": "Shopify or BigCommerce"},
    "competitor_tool": {"points": 2, "description": "Using competitor tool"},
    "only_1_2_ads": {"points": -3, "description": "Only 1-2 active ads"},
    "dead_website": {"points": -5, "description": "Dead or dormant website"},
    "solo_operation": {"points": -3, "description": "Solo operation"},
}

# Ad spend estimation based on active ad count
AD_SPEND_TIERS = [
    (150, "enterprise", "$200K+/mo"),
    (75, "excellent", "$75K-$200K/mo"),
    (30, "strong", "$30K-$75K/mo"),
    (15, "good", "$10K-$30K/mo"),
    (5, "moderate", "$2K-$10K/mo"),
    (1, "low", "$500-$2K/mo"),
]


def score_prospect(prospect_data):
    """Apply the 17-point scoring rubric to a prospect.

    Uses company_intel and other fields to calculate score.
    Returns score, breakdown, tier, and bucket.
    """
    intel = prospect_data.get("company_intel", {})
    breakdown = {}
    score = 0

    # Active ad count scoring
    ad_count = intel.get("active_ad_count", 0)
    if ad_count >= 50:
        breakdown["active_ads_50_plus"] = SCORING_RULES["active_ads_50_plus"]["points"]
    elif ad_count >= 20:
        breakdown["active_ads_20_49"] = SCORING_RULES["active_ads_20_49"]["points"]
    elif ad_count >= 10:
        breakdown["active_ads_10_19"] = SCORING_RULES["active_ads_10_19"]["points"]
    elif ad_count <= 2 and ad_count > 0:
        breakdown["only_1_2_ads"] = SCORING_RULES["only_1_2_ads"]["points"]

    # Multi-platform
    platforms = intel.get("platforms", [])
    if len(platforms) >= 2:
        breakdown["multi_platform"] = SCORING_RULES["multi_platform"]["points"]

    # Long-running ads
    if intel.get("longest_running_days", 0) >= 60:
        breakdown["long_running_ads"] = SCORING_RULES["long_running_ads"]["points"]

    # Creative fatigue
    if intel.get("creative_fatigue", False):
        breakdown["creative_fatigue"] = SCORING_RULES["creative_fatigue"]["points"]

    # Hiring signals
    hiring = intel.get("hiring_signals", [])
    creative_roles = ["media buyer", "creative director", "creative strategist",
                      "ad creative", "growth marketer", "performance marketer",
                      "creative designer", "creative lead"]
    if any(role.lower() in " ".join(hiring).lower() for role in creative_roles):
        breakdown["hiring_creative"] = SCORING_RULES["hiring_creative"]["points"]

    # Funding
    funding = intel.get("funding", "")
    if any(term in funding.lower() for term in ["series a", "series b", "series c", "series d", "seed round", "raised"]):
        breakdown["series_a_plus"] = SCORING_RULES["series_a_plus"]["points"]

    # Revenue signals
    revenue_text = str(intel.get("revenue", "")) + " " + str(intel.get("funding", ""))
    if _has_revenue_signals(revenue_text):
        breakdown["revenue_1m_plus"] = SCORING_RULES["revenue_1m_plus"]["points"]

    # Blog/content
    if intel.get("content_marketing", False):
        breakdown["active_blog"] = SCORING_RULES["active_blog"]["points"]

    # Tech stack
    tech = [t.lower() for t in intel.get("tech_stack", [])]
    if any(t in tech for t in ["shopify", "bigcommerce"]):
        breakdown["shopify_bigcommerce"] = SCORING_RULES["shopify_bigcommerce"]["points"]

    # Competitor tools
    competitors = ["motion", "foreplay", "minea", "adcreative.ai", "pencil", "marpipe"]
    if any(c in " ".join(tech).lower() for c in competitors):
        breakdown["competitor_tool"] = SCORING_RULES["competitor_tool"]["points"]

    # Dead website
    if intel.get("dead_website", False):
        breakdown["dead_website"] = SCORING_RULES["dead_website"]["points"]

    # Solo operation
    employees = intel.get("estimated_employees", "")
    if employees and _is_solo(employees):
        breakdown["solo_operation"] = SCORING_RULES["solo_operation"]["points"]

    # Calculate total
    score = sum(breakdown.values())
    tier = classify_tier(score)
    bucket = classify_bucket(prospect_data, ad_count)
    ad_spend = estimate_ad_spend(ad_count)

    return {
        "score": score,
        "breakdown": breakdown,
        "tier": tier,
        "bucket": bucket,
        "estimated_ad_spend": ad_spend,
    }


def classify_tier(score):
    """Classify score into tier: hot, warm, cool, skip.

    Thresholds calibrated for achievable scores:
    - Website research alone can yield ~5-7 pts (hiring + funding + tech + content)
    - Ad Library data adds ~2-4 pts (ad count + platforms)
    - Combined realistic max is ~11 pts (creative_fatigue/longest_running_days rarely available)
    """
    if score >= 8:
        return "hot"
    elif score >= 5:
        return "warm"
    elif score >= 3:
        return "cool"
    else:
        return "skip"


def classify_bucket(prospect_data, ad_count=0):
    """Classify prospect into bucket for outreach targeting."""
    company_type = prospect_data.get("company_type", "").lower()
    intel = prospect_data.get("company_intel", {})
    employees = str(intel.get("estimated_employees", ""))

    # enterprise_partner: agencies or large operations
    if company_type == "agency":
        return "enterprise_partner"
    if ad_count > 100:
        return "enterprise_partner"
    if _employee_count(employees) > 100:
        return "enterprise_partner"

    # media_buying: brands with creative fatigue and high spend
    if intel.get("creative_fatigue", False):
        spend = prospect_data.get("estimated_ad_spend", "").lower()
        if spend in ("high", "excellent", "enterprise", "strong"):
            return "media_buying"

    # convertra_saas: DTC, ecommerce, course creators — smaller teams
    if company_type in ("dtc_brand", "ecommerce", "course_creator", "saas"):
        return "convertra_saas"

    # Default based on ad count
    if ad_count >= 10:
        return "convertra_saas"
    return "convertra_saas"


def estimate_ad_spend(ad_count):
    """Estimate monthly ad spend based on active ad count."""
    for threshold, quality, amount in AD_SPEND_TIERS:
        if ad_count >= threshold:
            return {"quality": quality, "estimated_monthly": amount}
    return {"quality": "unknown", "estimated_monthly": "unknown"}


def score_and_update(prospect_id):
    """Score a prospect and update their record in the pipeline."""
    from modules.pipeline import get_prospect

    prospect = get_prospect(prospect_id)
    if not prospect:
        return {"id": prospect_id, "status": "not_found"}

    result = score_prospect(prospect)

    updates = {
        "fit_score": result["score"],
        "estimated_ad_spend": result["estimated_ad_spend"]["quality"],
    }

    # Add tier tag
    tier = result["tier"]
    tags = prospect.get("tags", [])
    # Remove old tier tags
    tags = [t for t in tags if t not in ("hot", "warm", "cool", "skip")]
    tags.append(tier)
    updates["tags"] = tags

    # Set bucket
    if result["bucket"]:
        buckets = prospect.get("prospect_buckets", [])
        if result["bucket"] not in buckets:
            buckets.append(result["bucket"])
        updates["prospect_buckets"] = buckets

    update_prospect(prospect_id, updates)

    return {
        "id": prospect_id,
        "score": result["score"],
        "tier": tier,
        "bucket": result["bucket"],
        "breakdown": result["breakdown"],
        "estimated_ad_spend": result["estimated_ad_spend"],
    }


def batch_score(stage=None, score_min=None):
    """Score all prospects matching filters."""
    data = load_pipeline()
    results = []

    for prospect in data["prospects"]:
        if stage and prospect.get("stage") != stage:
            continue

        result = score_and_update(prospect["id"])
        if result.get("status") == "not_found":
            continue

        if score_min is not None and result["score"] < score_min:
            continue

        results.append(result)

    # Sort by score descending
    results.sort(key=lambda r: r["score"], reverse=True)

    # Count tiers
    tiers = {"hot": 0, "warm": 0, "cool": 0, "skip": 0}
    for r in results:
        tier = r.get("tier", "skip")
        tiers[tier] = tiers.get(tier, 0) + 1

    return {
        "scored": len(results),
        "hot": tiers["hot"],
        "warm": tiers["warm"],
        "cool": tiers["cool"],
        "skip": tiers["skip"],
        "results": results,
    }


def _has_revenue_signals(text):
    """Check if text contains revenue signals suggesting $1M+."""
    import re
    text = text.lower()
    # Match patterns like $5M, $10M, $1.5M, $100K (100K+ = $1M+ revenue likely)
    patterns = [
        r"\$\d+\.?\d*\s*m",  # $5M, $1.5M
        r"\$\d{3,}\s*k",  # $100K+
        r"million",
        r"revenue.*\d",
    ]
    return any(re.search(p, text) for p in patterns)


def _is_solo(employees_str):
    """Check if the employee count suggests a solo operation."""
    employees_str = str(employees_str).lower()
    if employees_str in ("1", "solo", "1-2", "freelancer"):
        return True
    try:
        if int(employees_str) <= 2:
            return True
    except (ValueError, TypeError):
        pass
    # Check ranges like "1-5"
    if "-" in employees_str:
        try:
            low = int(employees_str.split("-")[0])
            if low <= 1:
                return True
        except (ValueError, TypeError):
            pass
    return False


def _employee_count(employees_str):
    """Extract a numeric employee count estimate."""
    employees_str = str(employees_str).lower().strip()
    try:
        return int(employees_str)
    except (ValueError, TypeError):
        pass
    # Handle ranges like "50-100"
    if "-" in employees_str:
        try:
            parts = employees_str.split("-")
            return (int(parts[0]) + int(parts[1])) // 2
        except (ValueError, TypeError):
            pass
    return 0
