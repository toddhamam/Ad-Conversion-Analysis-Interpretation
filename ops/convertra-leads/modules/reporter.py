"""Campaign reporting — metrics aggregation from pipeline data."""

from datetime import datetime

from modules.pipeline import load_pipeline
from config import load_config


def campaign_report(campaign=None):
    """Generate performance metrics for a campaign (or all campaigns)."""
    data = load_pipeline()
    prospects = data["prospects"]

    if campaign:
        prospects = [p for p in prospects if p.get("campaign") == campaign]

    total = len(prospects)
    if total == 0:
        return {"campaign": campaign or "all", "total_prospects": 0, "message": "No prospects found"}

    # Count emails sent by step (two-touch rule: opener + 1 follow-up)
    emails_initial = 0
    emails_followup_1 = 0

    for p in prospects:
        for interaction in p.get("interactions", []):
            if interaction.get("type") == "email_sent":
                step = interaction.get("sequence_step", 0)
                if step == 1:
                    emails_initial += 1
                elif step == 2:
                    emails_followup_1 += 1

    total_emails = emails_initial + emails_followup_1

    # Count by reply type
    replied_interested = _count_stage(prospects, "replied_interested")
    replied_not_now = _count_stage(prospects, "replied_not_now")
    replied_not_interested = _count_stage(prospects, "replied_not_interested")
    opted_out = _count_stage(prospects, "opted_out")
    invalid_email = _count_stage(prospects, "invalid_email")
    total_replies = replied_interested + replied_not_now + replied_not_interested

    # Count meetings and pipeline
    meetings_scheduled = _count_stage(prospects, "meeting_scheduled")
    meetings_completed = _count_stage(prospects, "meeting_completed")
    opportunities = _count_stage(prospects, "opportunity")
    won = _count_stage(prospects, "won")
    lost = _count_stage(prospects, "lost")

    # Rates
    reply_rate = (total_replies / emails_initial * 100) if emails_initial > 0 else 0
    bounce_rate = (invalid_email / emails_initial * 100) if emails_initial > 0 else 0
    positive_rate = (replied_interested / total_replies * 100) if total_replies > 0 else 0

    # Pipeline by stage (two-touch: opener + followup_1 only)
    in_sequence = sum(1 for p in prospects if p.get("stage") in (
        "email_1_sent", "followup_1_sent"
    ))

    return {
        "campaign": campaign or "all",
        "total_prospects": total,
        "emails_sent": {
            "total": total_emails,
            "initial": emails_initial,
            "followup_1": emails_followup_1,
        },
        "replies": {
            "total": total_replies,
            "interested": replied_interested,
            "not_now": replied_not_now,
            "not_interested": replied_not_interested,
        },
        "rates": {
            "reply_rate": round(reply_rate, 1),
            "bounce_rate": round(bounce_rate, 1),
            "positive_reply_rate": round(positive_rate, 1),
        },
        "opted_out": opted_out,
        "invalid_email": invalid_email,
        "meetings": {
            "scheduled": meetings_scheduled,
            "completed": meetings_completed,
        },
        "pipeline": {
            "researched": _count_stage(prospects, "researched"),
            "discovered": _count_stage(prospects, "discovered"),
            "ready_to_send": _count_stage(prospects, "ready_to_send"),
            "in_sequence": in_sequence,
            "replied_active": replied_interested + replied_not_now,
            "meetings": meetings_scheduled + meetings_completed,
            "opportunities": opportunities,
            "won": won,
            "lost": lost,
            "sequence_complete": _count_stage(prospects, "sequence_complete"),
        },
    }


def daily_report():
    """Generate today's activity summary."""
    data = load_pipeline()
    prospects = data["prospects"]
    today = datetime.now().strftime("%Y-%m-%d")
    config = load_config()

    # Today's sends
    sent_today = 0
    replies_today = 0
    bounces_today = 0

    for p in prospects:
        for interaction in p.get("interactions", []):
            idate = interaction.get("date", "")
            if idate.startswith(today):
                if interaction.get("type") == "email_sent":
                    sent_today += 1
                elif interaction.get("type") == "email_received":
                    replies_today += 1

        # Count bounces updated today
        if p.get("stage") == "invalid_email" and p.get("updated", "").startswith(today):
            bounces_today += 1

    # Due follow-ups
    due_count = 0
    for p in prospects:
        next_action = p.get("next_action", {})
        action_date = next_action.get("date", "")
        if action_date and action_date <= today:
            if p.get("stage") not in ("opted_out", "invalid_email"):
                due_count += 1

    # Warmup info
    warmup = config.get("warmup", {})
    daily_limit = warmup.get("daily_limit", 5)

    return {
        "date": today,
        "sent_today": sent_today,
        "daily_limit": daily_limit,
        "remaining_sends": max(0, daily_limit - sent_today),
        "replies_today": replies_today,
        "bounces_today": bounces_today,
        "due_followups": due_count,
        "total_prospects": len(prospects),
    }


def pipeline_summary():
    """Aggregate pipeline metrics by stage, campaign, and bucket."""
    data = load_pipeline()
    prospects = data["prospects"]

    # By stage
    by_stage = {}
    for p in prospects:
        stage = p.get("stage", "unknown")
        by_stage[stage] = by_stage.get(stage, 0) + 1

    # By campaign
    by_campaign = {}
    for p in prospects:
        campaign = p.get("campaign", "uncategorized")
        if campaign not in by_campaign:
            by_campaign[campaign] = {"total": 0, "stages": {}}
        by_campaign[campaign]["total"] += 1
        stage = p.get("stage", "unknown")
        by_campaign[campaign]["stages"][stage] = by_campaign[campaign]["stages"].get(stage, 0) + 1

    # By bucket
    by_bucket = {"convertra_saas": 0, "enterprise_partner": 0, "media_buying": 0, "unclassified": 0}
    for p in prospects:
        buckets = p.get("prospect_buckets", [])
        if not buckets:
            by_bucket["unclassified"] += 1
        else:
            for b in buckets:
                by_bucket[b] = by_bucket.get(b, 0) + 1

    # By tier (based on tags)
    by_tier = {"hot": 0, "warm": 0, "cool": 0, "skip": 0, "unscored": 0}
    for p in prospects:
        tags = p.get("tags", [])
        scored = False
        for tier in ("hot", "warm", "cool", "skip"):
            if tier in tags:
                by_tier[tier] += 1
                scored = True
                break
        if not scored:
            by_tier["unscored"] += 1

    # Score distribution
    scores = [p.get("fit_score", 0) for p in prospects]
    avg_score = round(sum(scores) / len(scores), 1) if scores else 0

    return {
        "total_prospects": len(prospects),
        "by_stage": by_stage,
        "by_campaign": by_campaign,
        "by_bucket": by_bucket,
        "by_tier": by_tier,
        "score_stats": {
            "average": avg_score,
            "highest": max(scores) if scores else 0,
            "lowest": min(scores) if scores else 0,
        },
    }


def _count_stage(prospects, stage):
    """Count prospects in a specific stage."""
    return sum(1 for p in prospects if p.get("stage") == stage)
