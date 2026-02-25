"""Instantly API v2 integration — campaign creation, lead push, and analytics."""

import json
import os
import time

import requests

from config import load_config
from modules.pipeline import list_prospects, update_prospect, update_stage


API_BASE = "https://api.instantly.ai/api/v2"


def _get_api_key():
    """Get Instantly API key from environment."""
    key = os.environ.get("INSTANTLY_API_KEY", "")
    if not key:
        raise RuntimeError("INSTANTLY_API_KEY not set. Add it to .env")
    return key


def _headers():
    return {
        "Authorization": f"Bearer {_get_api_key()}",
        "Content-Type": "application/json",
    }


def _api_get(path, params=None):
    """GET request to Instantly API."""
    resp = requests.get(f"{API_BASE}/{path}", headers=_headers(), params=params, timeout=30)
    if resp.status_code == 429:
        raise RuntimeError("Rate limited by Instantly API. Wait and retry.")
    if resp.status_code != 200:
        raise RuntimeError(f"Instantly API error ({resp.status_code}): {resp.text[:300]}")
    return resp.json()


def _api_post(path, data=None):
    """POST request to Instantly API."""
    resp = requests.post(f"{API_BASE}/{path}", headers=_headers(), json=data or {}, timeout=30)
    if resp.status_code == 429:
        raise RuntimeError("Rate limited by Instantly API. Wait and retry.")
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Instantly API error ({resp.status_code}): {resp.text[:500]}")
    return resp.json()


# ─── Accounts ────────────────────────────────────────────────────────


def list_accounts():
    """List connected sending accounts."""
    data = _api_get("accounts", params={"limit": 50})
    accounts = data.get("items", [])
    return {
        "count": len(accounts),
        "accounts": [
            {
                "email": a.get("email", ""),
                "status": a.get("status", ""),
                "warmup_status": a.get("warmup_status", ""),
                "daily_limit": a.get("daily_limit", 0),
            }
            for a in accounts
        ],
    }


# ─── Campaigns ───────────────────────────────────────────────────────


def list_campaigns():
    """List all campaigns."""
    data = _api_get("campaigns", params={"limit": 50})
    campaigns = data.get("items", [])
    return {
        "count": len(campaigns),
        "campaigns": [
            {
                "id": c.get("id", ""),
                "name": c.get("name", ""),
                "status": c.get("status", ""),
            }
            for c in campaigns
        ],
    }


def get_campaign(campaign_id):
    """Get full campaign details including sequences."""
    return _api_get(f"campaigns/{campaign_id}")


def create_campaign(name, sending_account=None, schedule=None):
    """Create a new Instantly campaign with two-touch email sequence.

    Two-touch rule (from 2026 cold email research):
    - Follow-up 1 boosts replies by 49%
    - Follow-up 3+ shows 20% fewer responses
    - Non-responders are recycled into a new campaign with a different angle

    The campaign is created with:
    - Step 1 (day 0): Initial email using {{subject_line}} and {{email_body}}
    - Step 2 (day 3): Follow-up 1 using {{followup_1_body}}

    Each lead's personalized copy is injected via custom_variables on the lead.

    Args:
        name: Campaign name
        sending_account: Email address of connected sending account (optional, map later)
        schedule: Custom schedule dict (optional, defaults to weekdays 9am-5pm AEST)

    Returns:
        dict with campaign_id and status
    """
    config = load_config()
    timing = config.get("sequence_timing", {})

    followup_1_days = timing.get("followup_1_days", 3)

    if schedule is None:
        schedule = {
            "schedules": [
                {
                    "name": "Weekdays",
                    "timing": {"from": "09:00", "to": "17:00"},
                    "days": {
                        "0": False,
                        "1": True,
                        "2": True,
                        "3": True,
                        "4": True,
                        "5": True,
                        "6": False,
                    },
                    "timezone": "Australia/Brisbane",
                }
            ],
        }

    payload = {
        "name": name,
        "campaign_schedule": schedule,
        "sequences": [
            {
                "steps": [
                    {
                        "type": "email",
                        "delay": 0,
                        "variants": [
                            {
                                "subject": "{{subject_line}}",
                                "body": "{{email_body}}",
                            }
                        ],
                    },
                    {
                        "type": "email",
                        "delay": followup_1_days,
                        "variants": [
                            {
                                "subject": "Re: {{subject_line}}",
                                "body": "{{followup_1_body}}",
                            }
                        ],
                    },
                ],
            }
        ],
        "daily_limit": 50,
        "stop_on_reply": True,
        "stop_on_auto_reply": True,
        "text_only": True,
        "link_tracking": False,
        "open_tracking": True,
    }

    result = _api_post("campaigns", payload)
    campaign_id = result.get("id", "")

    # Map sending account if provided
    if sending_account and campaign_id:
        try:
            _map_account(campaign_id, sending_account)
        except Exception as e:
            return {
                "status": "created_no_account",
                "campaign_id": campaign_id,
                "campaign_name": name,
                "warning": f"Campaign created but failed to map account: {e}",
            }

    return {
        "status": "created",
        "campaign_id": campaign_id,
        "campaign_name": name,
        "sending_account": sending_account or "none (map manually)",
        "sequence_steps": 2,
        "daily_limit": 50,
    }


def _map_account(campaign_id, email):
    """Map a sending account to a campaign via PATCH."""
    resp = requests.patch(
        f"{API_BASE}/campaigns/{campaign_id}",
        headers=_headers(),
        json={"email_list": [email]},
        timeout=30,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Failed to map account: {resp.text[:300]}")


def activate_campaign(campaign_id):
    """Activate a campaign to start sending."""
    _api_post(f"campaigns/{campaign_id}/activate")
    return {"status": "activated", "campaign_id": campaign_id}


def pause_campaign(campaign_id):
    """Pause a campaign to stop sending."""
    _api_post(f"campaigns/{campaign_id}/pause")
    return {"status": "paused", "campaign_id": campaign_id}


# ─── Leads ───────────────────────────────────────────────────────────


def _build_followup_body(prospect):
    """Build follow-up 1 email body from template.

    Two-touch rule: only 1 follow-up. Non-responders get recycled
    into a new campaign with a different subject line and angle.

    Returns:
        str — follow-up 1 body text
    """
    config = load_config()
    sender_name = config.get("email", {}).get("from_name", "Todd")
    first_name = prospect.get("name", "").split()[0] if prospect.get("name") else "there"

    # Load templates
    from config import TEMPLATES_PATH
    templates = {}
    if TEMPLATES_PATH.exists():
        try:
            with open(TEMPLATES_PATH) as f:
                templates = json.load(f)
        except (json.JSONDecodeError, IOError):
            pass

    followup_1_tmpl = templates.get("followup_1", {})
    body = followup_1_tmpl.get("body", "") if followup_1_tmpl else ""

    if body:
        body = body.replace("{first_name}", first_name)
        body = body.replace("{sender_first_name}", sender_name)
    else:
        body = (
            f"Hi {first_name},\n\n"
            f"Just floating this back up. The ad variations are ready "
            f"whenever you want them.\n\n"
            f"{sender_name}"
        )

    return body


def push_leads(campaign_id, stage="ready_to_send", limit=100):
    """Push leads from pipeline to an Instantly campaign.

    Reads prospects in the given stage, maps their draft_email to
    Instantly custom_variables, and bulk-adds them to the campaign.

    Args:
        campaign_id: Instantly campaign UUID
        stage: Pipeline stage to pull from
        limit: Max leads to push

    Returns:
        dict with pushed count, skipped count, and results
    """
    result = list_prospects(stage=stage, limit=limit)
    prospects = result.get("prospects", [])

    if not prospects:
        return {"pushed": 0, "skipped": 0, "message": f"No prospects in stage '{stage}'"}

    config = load_config()
    signature = config.get("email", {}).get("signature", "")

    leads_payload = []
    pushed_ids = []
    skipped = 0

    for prospect in prospects:
        email = prospect.get("email", "")
        draft = prospect.get("draft_email", {})

        if not email:
            skipped += 1
            continue

        if not isinstance(draft, dict) or not draft.get("body"):
            skipped += 1
            continue

        # Build the email body with signature
        body = draft["body"]
        if signature and "STOP" not in body:
            body = body + signature

        # Build follow-up body (two-touch: 1 opener + 1 follow-up)
        followup_body = _build_followup_body(prospect)

        first_name = prospect.get("name", "").split()[0] if prospect.get("name") else ""
        last_name = " ".join(prospect.get("name", "").split()[1:]) if prospect.get("name") else ""

        lead_data = {
            "email": email,
            "first_name": first_name,
            "last_name": last_name,
            "company_name": prospect.get("company", ""),
            "website": prospect.get("company_url", ""),
            "custom_variables": {
                "subject_line": draft.get("subject", ""),
                "email_body": body,
                "followup_1_body": followup_body,
                "prospect_id": prospect.get("id", ""),
                "company": prospect.get("company", ""),
                "fit_score": str(prospect.get("fit_score", 0)),
            },
        }

        leads_payload.append(lead_data)
        pushed_ids.append(prospect.get("id", ""))

    if not leads_payload:
        return {"pushed": 0, "skipped": skipped, "message": "No leads with valid email + draft"}

    # Instantly API accepts one lead at a time
    errors = []
    successful = []
    for i, lead_data in enumerate(leads_payload):
        try:
            lead_data["campaign"] = campaign_id
            _api_post("leads", lead_data)
            successful.append(pushed_ids[i])
            time.sleep(0.2)  # Rate limit courtesy
        except Exception as e:
            errors.append({"id": pushed_ids[i], "email": lead_data["email"], "error": str(e)})

    # Update pipeline stage for successfully pushed prospects
    for pid in successful:
        update_stage(pid, "email_1_sent", interaction={
            "type": "pushed_to_instantly",
            "notes": f"Added to Instantly campaign {campaign_id}",
        })

    return {
        "pushed": len(successful),
        "skipped": skipped,
        "errors": len(errors),
        "campaign_id": campaign_id,
        "leads": [{"id": pid, "email": leads_payload[i]["email"]} for i, pid in enumerate(successful)],
        "error_details": errors if errors else None,
    }


# ─── Analytics ───────────────────────────────────────────────────────


def campaign_analytics(campaign_id):
    """Get campaign analytics — opens, clicks, replies."""
    try:
        data = _api_get("analytics/campaign", params={"campaign_id": campaign_id})
        return {"status": "ok", "campaign_id": campaign_id, "analytics": data}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ─── Status / overview ───────────────────────────────────────────────


def status():
    """Get Instantly workspace overview — accounts, campaigns, lead counts."""
    try:
        accounts = list_accounts()
        campaigns = list_campaigns()

        return {
            "status": "connected",
            "accounts": accounts,
            "campaigns": campaigns,
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}
