"""AI email drafter — direct GPT-5.2 API call via requests."""

import json
import os
import random
import re

import requests

from config import TEMPLATES_PATH, load_config
from modules.pipeline import get_prospect, list_prospects, update_prospect, update_stage


OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"
MODEL = "gpt-5.2"

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
        system_msg, user_msg = _build_prompt(prospect)
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


def _build_prompt(prospect):
    """Build the GPT-5.2 system + user prompt from prospect data.

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

    if is_agency:
        cta_instruction = f"""4. CTA (exact format): "Convertra can help you pump out fresh winning creatives to test for your clients in less than 3 minutes. I shot a video to show you how. Want me to send it over?"
   Note: For agencies, Convertra is named because they are evaluating tooling for their workflow."""
        bridge_suffix = " for each client"
    else:
        cta_instruction = f"""4. CTA (exact format): "I mocked up 2 fresh ad variations based on what's already winning in your account. Want me to send them over?"
   Note: For SaaS/DTC founders, do NOT mention Convertra by name. The product is introduced on the reply, not the cold open."""
        bridge_suffix = ""

    system_message = f"""You are an expert cold email copywriter for Convertra, an AI-powered ad creative platform.

WHAT CONVERTRA DOES (use this context to understand the product, do NOT describe it in the email unless this is an agency prospect):
Convertra automates ad creative generation. It maps the patterns already driving results in a brand's Meta ad account, then auto-generates (and publishes) winning creatives inside their ad account... without waiting on designers, copywriters, or even media buyers.

FOCUS: Meta/Facebook ads ONLY. Never mention Google Ads, multi-channel, or other platforms.

STRUCTURE: every email must follow this exact 4-part structure:

1. GREETING: "Hi {{first_name}}," on its own line. Never use an em dash after the name.

2. OPENING + BRIDGE (2 sentences max): Start with "Just" followed by a specific observation about their business (ad count, hiring, product launches, growth signals). Then connect it to the universal challenge: "At that volume, the biggest challenge is usually keeping enough fresh variations flowing into testing{bridge_suffix}." Do NOT frame this as criticism of their team. Frame it as a natural challenge that comes with scale. Do NOT mention tech stack names (Shopify, Klaviyo, HubSpot, etc.) or "Meta Pixel". Do NOT say "I looked you up on LinkedIn."

{cta_instruction}

5. SIGN-OFF: Just the first name on its own line: {sender_name}

SUBJECT LINE: Use this exact subject line: "{subject_line}"

Rules, follow these exactly:
- NEVER use em dashes anywhere in the email. Em dashes are a dead giveaway of AI-written copy. Use periods, commas, or ellipsis (...) instead.
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
        hook = f"saw {company} is running {company_intel['active_ad_count']}+ Meta ads"
    elif company_intel.get("hiring_signals"):
        hook = f"noticed you're hiring a {company_intel['hiring_signals'][0]}"
    elif pains:
        hook = pains[0]
    else:
        hook = f"saw {company} is investing in paid social"

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

    # If template was empty, use a generic fallback
    is_agency = first_bucket == "enterprise_partner"
    if not body:
        if is_agency:
            body = (
                f"Hi {first_name},\n\n"
                f"Just {hook}. At that volume, the biggest challenge is usually "
                f"keeping enough fresh variations flowing into testing for each client.\n\n"
                f"Convertra can help you pump out fresh winning creatives to test "
                f"for your clients in less than 3 minutes. I shot a video to show "
                f"you how. Want me to send it over?\n\n"
                f"{sender_name}"
            )
        else:
            body = (
                f"Hi {first_name},\n\n"
                f"Just {hook}. At that volume, the biggest challenge is usually "
                f"keeping enough fresh variations flowing into testing.\n\n"
                f"I mocked up 2 fresh ad variations based on what's already winning "
                f"in your account. Want me to send them over?\n\n"
                f"{sender_name}"
            )

    return {"subject": subject, "body": body}
