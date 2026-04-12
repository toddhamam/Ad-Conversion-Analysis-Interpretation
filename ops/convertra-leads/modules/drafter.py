"""AI email drafter — direct GPT-5.2 API call via requests."""

import json
import os
import random
import re

import requests

from config import TEMPLATES_PATH, load_config
from modules.pipeline import get_prospect, list_prospects, update_prospect, update_stage


OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"
MODEL = "gpt-5.4"

# Bucket -> template key mapping
BUCKET_TEMPLATE_MAP = {
    "convertra_saas": "saas_founder",
    "enterprise_partner": "agency_owner",
    "media_buying": "saas_founder",
}


def _load_subject_lines():
    """Load active subject line variants from templates.json.

    Returns:
        list of subject line strings from all active tiers.
    """
    templates = {}
    if TEMPLATES_PATH.exists():
        try:
            with open(TEMPLATES_PATH) as f:
                templates = json.load(f)
        except (json.JSONDecodeError, IOError):
            pass

    subject_lines = []
    tiers = templates.get("subject_lines", {})
    for tier_data in tiers.values():
        if tier_data.get("active"):
            subject_lines.extend(tier_data.get("variants", []))

    # Fallback if nothing loaded
    if not subject_lines:
        subject_lines = ["Ad fatigue?", "creative bottleneck?", "quick question"]

    return subject_lines


def _pick_subject_line(prospect):
    """Pick a subject line from the active pool and fill placeholders.

    Args:
        prospect: dict — full prospect record.

    Returns:
        str — filled subject line.
    """
    pool = _load_subject_lines()
    template = random.choice(pool)

    first_name = prospect.get("name", "").split()[0] if prospect.get("name") else ""
    company = prospect.get("company", "your company")
    company_intel = prospect.get("company_intel", {})
    ad_count = company_intel.get("active_ad_count", "")
    role = prospect.get("role", "")

    subs = {
        "first_name": first_name,
        "company": company,
        "ad_count": str(ad_count) if ad_count else "dozens of",
        "role": role if role else "growth lead",
    }

    result = template
    for key, value in subs.items():
        result = result.replace(f"{{{key}}}", value)

    return result


def draft_email(prospect):
    """Draft a personalized cold email for a single prospect.

    Args:
        prospect: dict — full prospect record from pipeline.json

    Returns:
        dict with keys:
            status: "drafted" | "fallback" | "error"
            subject: str
            body: str
            method: "ai" | "template"
            error: str (only if status is "error")
    """
    api_key = os.environ.get("OPENAI_API_KEY", "")

    if not api_key:
        # No API key — use template fallback
        result = _fallback_template(prospect)
        return {"status": "fallback", "method": "template", **result}

    try:
        system_msg, user_msg = build_prompt(prospect)
        response = _call_openai(api_key, system_msg, user_msg)

        if response is None:
            result = _fallback_template(prospect)
            return {"status": "fallback", "method": "template", **result}

        parsed = _parse_ai_response(response)
        if parsed is None:
            result = _fallback_template(prospect)
            return {"status": "fallback", "method": "template", **result}

        return {"status": "drafted", "method": "ai", **parsed}

    except Exception as e:
        result = _fallback_template(prospect)
        return {"status": "fallback", "method": "template", "error": str(e), **result}


def batch_draft(stage="researched", score_min=8):
    """Draft emails for all prospects matching filters that lack draft_email.

    Args:
        stage: Pipeline stage to filter on.
        score_min: Minimum fit_score to include.

    Returns:
        dict with keys: drafted (int), fallback (int), skipped (int), errors (int), results (list)
    """
    result = list_prospects(stage=stage, score_min=score_min)
    prospects = result.get("prospects", [])

    stats = {"drafted": 0, "fallback": 0, "skipped": 0, "errors": 0, "results": []}

    for prospect in prospects:
        pid = prospect.get("id", "")

        # Skip if already has a draft
        existing_draft = prospect.get("draft_email", {})
        if isinstance(existing_draft, dict) and existing_draft.get("body"):
            stats["skipped"] += 1
            continue

        # Skip if no email found yet
        if not prospect.get("email"):
            stats["skipped"] += 1
            continue

        draft_result = draft_email(prospect)

        if draft_result["status"] == "error":
            stats["errors"] += 1
            stats["results"].append({"id": pid, **draft_result})
            continue

        # Store draft on prospect and advance to ready_to_send
        update_prospect(pid, {
            "draft_email": {
                "subject": draft_result["subject"],
                "body": draft_result["body"],
            }
        })
        update_stage(pid, "ready_to_send", interaction={
            "type": "email_drafted",
            "notes": f"Email drafted via {draft_result['method']}",
        })

        if draft_result["method"] == "ai":
            stats["drafted"] += 1
        else:
            stats["fallback"] += 1

        stats["results"].append({"id": pid, "company": prospect.get("company"), **draft_result})

    return stats


def build_prompt(prospect):
    """Build the GPT-5.4 system + user prompt from prospect data.

    Public interface: also used by managed agent drafter for prompt reuse.

    Returns:
        tuple: (system_message: str, user_message: str)
    """
    config = load_config()
    sender_name = config.get("email", {}).get("from_name", "Todd")

    company_name = prospect.get("company", "your brand")
    buckets = prospect.get("prospect_buckets", [])
    first_bucket = buckets[0] if buckets else "convertra_saas"
    is_agency = first_bucket == "enterprise_partner"

    # Pick a subject line from the active pool
    subject_line = _pick_subject_line(prospect)

    # Get ad count for offer specificity (only if meaningful)
    ad_count = prospect.get("company_intel", {}).get("active_ad_count", 0)
    ad_count_context = ""
    if ad_count and int(ad_count) > 0:
        ad_count_context = f" The prospect is running {ad_count} ads right now. If this number is significant (20+), reference it to make the offer specific, e.g., 'You're running {ad_count} ads right now, what if you could test 5x that without adding headcount?'"

    if is_agency:
        cta_instruction = f"""4. CTA (exact format): "Convertra can help you pump out fresh winning creatives to test for your clients in less than 3 minutes. I shot a video to show you how. Want me to send it over?"
   Note: For agencies, Convertra is named because they are evaluating tooling for their workflow."""
        bridge_suffix = " for each client"
    else:
        cta_instruction = f"""4. CTA (exact format): "I recorded a quick video for you showing how we're helping businesses just like {company_name} transform their full Meta ad creative generation and testing process from days into just minutes, (literally, under 3 minutes)... No designers. No briefs. No agencies. No waiting...\n\nWant me to send it over?"
   Note: For SaaS/DTC founders, do NOT mention Convertra by name. The product is introduced on the reply, not the cold open.{ad_count_context}"""
        bridge_suffix = ""

    system_message = f"""You are an expert cold email copywriter for Convertra, an AI-powered ad creative platform.

WHAT CONVERTRA DOES (use this context to understand the product, do NOT describe it in the email unless this is an agency prospect):
Convertra automates ad creative generation. It maps the patterns already driving results in a brand's Meta ad account, then auto-generates (and publishes) winning creatives inside their ad account... without waiting on designers, copywriters, or even media buyers.

FOCUS: Meta/Facebook ads ONLY. Never mention Google Ads, multi-channel, or other platforms.

STRUCTURE: every email must follow this exact 5-part structure:

1. GREETING: "Hi {{first_name}}," on its own line. Never use an em dash after the name.

2. OPENING + BRIDGE (2 sentences max): Start with "Just" followed by a specific observation about their business — their Meta ads activity, growth signals (hiring, scaling, ecommerce growth), or what they're building. Use whatever personalization hook is strongest from the data provided. Never reference blogs, newsletters, content marketing, or general website activity. Then connect it to the universal challenge: "At that volume, the biggest challenge is usually keeping enough fresh ad creatives flowing into Meta testing{bridge_suffix}." Do NOT frame this as criticism of their team. Frame it as a natural challenge that comes with scale. Do NOT mention tech stack names (Shopify, Klaviyo, HubSpot, etc.) or "Meta Pixel". Do NOT say "I looked you up on LinkedIn."

3. PROOF (1 sentence max): Include a brief, specific result that builds trust. Vary the phrasing each time, choosing from angles like:
   - A user/brand in a similar space achieving a specific outcome (e.g., "went from X creatives/month to Y")
   - A time savings result (e.g., "cut creative production from days to minutes")
   - A testing velocity result (e.g., "now testing 40+ variations a month, zero designers")
   - A competitive advantage framing (e.g., "brands using this are outpacing their competitors on creative volume")
   Do NOT make up specific company names. Keep it vague enough to be true but specific enough to be credible. Do NOT use the same proof framing more than once if you can help it.

{cta_instruction}

5. SIGN-OFF: Just the first name on its own line: {sender_name}

SUBJECT LINE: Use this exact subject line: "{subject_line}"

Rules, follow these exactly:
- NEVER use em dashes anywhere in the email. Em dashes are a dead giveaway of AI-written copy. Use periods, commas, or ellipsis (...) instead.
- Casualize the company name: strip suffixes like Inc, LLC, Ltd, Corp, Pty Ltd, Group, Holdings. Use the short form people would actually say aloud. E.g., "Leftclick Incorporated" becomes "Leftclick", "Pacific Creative Group LLC" becomes "Pacific Creative" or "PCG".
- Plain text only, no HTML, no markdown, no images, no bold, no formatting
- No links in the email (zero URLs)
- Body must be under 80 words (shorter is better)
- Do NOT include "Reply STOP to opt out" or any unsubscribe language, this is a personal email, not a marketing blast
- Tone: casual, direct, peer-to-peer, like a founder messaging another founder
- Do NOT frame the bridge as criticism. Do NOT say things like "your team is spending more time on X than Y" or imply they are doing something wrong. The bottleneck is situational, not their fault.
- The opening observation should be specific and positive (acknowledging their growth/activity), then the bridge names the universal challenge that comes with it.

Respond with ONLY this JSON format, no other text:
{{"subject": "...", "body": "..."}}"""

    # Build user message with prospect context
    company_intel = prospect.get("company_intel", {})
    hooks = prospect.get("personalization_hooks", [])
    pains = prospect.get("pain_signals", [])
    first_name = prospect.get("name", "").split()[0] if prospect.get("name") else ""

    # Build enrichment context (if available from Hunter.io)
    enrichment_lines = []
    if company_intel.get("seniority"):
        enrichment_lines.append(f"Seniority: {company_intel['seniority']}")
    if company_intel.get("location"):
        enrichment_lines.append(f"Location: {company_intel['location']}")
    if company_intel.get("industry"):
        enrichment_lines.append(f"Industry: {company_intel['industry']}")
    if company_intel.get("twitter"):
        enrichment_lines.append(f"Twitter: {company_intel['twitter']}")
    enrichment_context = "\n".join(enrichment_lines)

    user_message = f"""Draft a cold email for this prospect:

Name: {prospect.get('name', 'Unknown')}
Company: {prospect.get('company', 'Unknown')}
Website: {prospect.get('company_url', '')}
Role: {prospect.get('role', '')}
Bucket: {', '.join(buckets) if buckets else 'convertra_saas'}
Estimated Ad Spend: {prospect.get('estimated_ad_spend', 'unknown')}
{enrichment_context}

Company Intel:
- Active ads: {company_intel.get('active_ad_count', 'unknown')}
- Platforms: {', '.join(company_intel.get('platforms', []))}
- Hiring signals: {', '.join(company_intel.get('hiring_signals', []))}
- Tech stack: {', '.join(company_intel.get('tech_stack', []))}
- Team size: {company_intel.get('estimated_employees', 'unknown')}
- Funding: {company_intel.get('funding', 'unknown')}
- Creative fatigue: {company_intel.get('creative_fatigue', False)}

Personalization hooks: {', '.join(hooks) if hooks else 'None available, use company intel to craft opening observation'}
Pain signals: {', '.join(pains) if pains else 'None detected, use ad count or general growth signal for opening'}"""

    return system_message, user_message


def _call_openai(api_key, system_message, user_message):
    """Make a direct HTTP POST to OpenAI chat completions.

    Returns:
        dict: parsed JSON response, or None on failure.
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system_message},
            {"role": "user", "content": user_message},
        ],
        "max_completion_tokens": 1024,
        "temperature": 0.7,
    }

    try:
        resp = requests.post(OPENAI_API_URL, headers=headers, json=payload, timeout=60)
        if resp.status_code != 200:
            print(f"  [drafter] OpenAI error: Status {resp.status_code}, {resp.text[:300]}")
            return None
        return resp.json()
    except Exception as e:
        print(f"  [drafter] OpenAI request failed: {e}")
        return None


def _parse_ai_response(response_json):
    """Extract subject and body from GPT response.

    Returns:
        dict with keys: subject (str), body (str) — or None if parsing fails.
    """
    try:
        content = response_json["choices"][0]["message"]["content"]

        # Strip markdown code fences if present
        content = content.strip()
        if content.startswith("```"):
            content = re.sub(r"^```(?:json)?\s*", "", content)
            content = re.sub(r"\s*```$", "", content)

        parsed = json.loads(content)

        subject = parsed.get("subject", "").strip()
        body = parsed.get("body", "").strip()

        if not subject or not body:
            return None

        return {"subject": subject, "body": body}

    except (KeyError, json.JSONDecodeError, IndexError, TypeError):
        return None


def _fallback_template(prospect):
    """Load and fill a template from templates.json as fallback.

    Returns:
        dict with keys: subject (str), body (str)
    """
    templates = {}
    if TEMPLATES_PATH.exists():
        try:
            with open(TEMPLATES_PATH) as f:
                templates = json.load(f)
        except (json.JSONDecodeError, IOError):
            pass

    # Select template by bucket
    buckets = prospect.get("prospect_buckets", [])
    first_bucket = buckets[0] if buckets else "convertra_saas"
    template_key = BUCKET_TEMPLATE_MAP.get(first_bucket, "saas_founder")
    template = templates.get(template_key, {})

    config = load_config()
    sender_name = config.get("email", {}).get("from_name", "Todd")
    first_name = prospect.get("name", "").split()[0] if prospect.get("name") else "there"
    company = prospect.get("company", "your company")

    # Build personalization hook from available data
    hooks = prospect.get("personalization_hooks", [])
    pains = prospect.get("pain_signals", [])
    company_intel = prospect.get("company_intel", {})

    if hooks:
        hook = hooks[0]
    elif company_intel.get("active_ad_count", 0) > 10:
        hook = f"saw {company} is running {company_intel['active_ad_count']}+ ads on Meta"
    elif company_intel.get("hiring_signals"):
        hook = f"noticed {company} is hiring a {company_intel['hiring_signals'][0]}"
    elif company_intel.get("has_meta_pixel"):
        hook = f"saw {company} is running Meta ads"
    elif company_intel.get("is_ecommerce_store"):
        hook = f"came across {company}'s store and saw you're scaling"
    elif pains:
        hook = pains[0]
    else:
        hook = f"came across {company} and saw what you're building"

    # Pick subject line from active pool
    subject = _pick_subject_line(prospect)

    # Fill template placeholders
    subs = {
        "first_name": first_name,
        "company": company,
        "personalization_hook": hook,
        "sender_first_name": sender_name,
    }

    body = template.get("body", "")

    for key, value in subs.items():
        body = body.replace(f"{{{key}}}", value)

    # Pick the right bridge based on whether we have volume data
    has_volume = company_intel.get("active_ad_count", 0) > 5
    if has_volume:
        bridge = "At that volume, the biggest challenge is usually"
    else:
        bridge = "The biggest challenge for brands scaling Meta ads is usually"

    # If template was empty, use a generic fallback
    is_agency = first_bucket == "enterprise_partner"
    if not body:
        if is_agency:
            body = (
                f"Hi {first_name},\n\n"
                f"Just {hook}. {bridge} "
                f"keeping enough fresh ad creatives flowing into Meta testing for each client.\n\n"
                f"Convertra can help you pump out fresh winning creatives to test "
                f"for your clients in less than 3 minutes. I shot a video to show "
                f"you how. Want me to send it over?\n\n"
                f"{sender_name}"
            )
        else:
            body = (
                f"Hi {first_name},\n\n"
                f"Just {hook}. {bridge} "
                f"keeping enough fresh ad creatives flowing into Meta testing.\n\n"
                f"I recorded a quick video for you showing how we're helping businesses "
                f"just like {company} transform their full Meta ad creative generation "
                f"and testing process from days into just minutes, (literally, under 3 "
                f"minutes)... No designers. No briefs. No agencies. No waiting...\n\n"
                f"Want me to send it over?\n\n"
                f"{sender_name}"
            )

    return {"subject": subject, "body": body}
