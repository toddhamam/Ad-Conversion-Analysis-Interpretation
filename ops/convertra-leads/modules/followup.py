"""Follow-up sequence scheduling — two-touch rule (1 opener + 1 follow-up).

Based on 2026 cold email research:
- Follow-up 1 boosts replies by 49%
- Follow-up 3+ shows 20% fewer responses
- Follow-up 4+ drops response rates by 55%

Non-responders after 2 emails are marked sequence_complete and should be
recycled into a new campaign with a different subject line and angle.
"""

from datetime import datetime, timedelta

from config import load_config
from modules.pipeline import load_pipeline, update_prospect, update_stage


SEQUENCE_STEPS = {
    "followup_1": {"from_stage": "email_1_sent", "to_stage": "followup_1_sent", "sequence_step": 2},
}


def get_due_followups(date=None):
    """Get prospects needing follow-ups, grouped by type."""
    if date is None:
        date = datetime.now().strftime("%Y-%m-%d")

    data = load_pipeline()
    followup_1 = []

    for p in data["prospects"]:
        if should_skip(p):
            continue

        next_action = p.get("next_action", {})
        action_date = next_action.get("date", "")
        action_type = next_action.get("type", "")

        if not action_date or action_date > date:
            continue

        summary = {
            "id": p["id"],
            "name": p.get("name", ""),
            "email": p.get("email", ""),
            "company": p.get("company", ""),
            "stage": p.get("stage", ""),
            "due_date": action_date,
            "action_type": action_type,
        }

        if action_type == "followup_1":
            followup_1.append(summary)

    total = len(followup_1)
    return {
        "followup_1": followup_1,
        "total": total,
        "date": date,
    }


def schedule_followup(prospect_id, step, date=None):
    """Set next_action for a specific follow-up step."""
    if step not in SEQUENCE_STEPS:
        return {"id": prospect_id, "status": "error", "message": f"Invalid step: {step}. Use: followup_1"}

    config = load_config()
    timing = config.get("sequence_timing", {})

    if date is None:
        days = timing.get(f"{step}_days", 3)
        date = (datetime.now() + timedelta(days=days)).strftime("%Y-%m-%d")

    result = update_prospect(prospect_id, {
        "next_action": {
            "type": step,
            "date": date,
            "notes": f"Scheduled {step}",
        }
    })

    if result.get("status") == "not_found":
        return result

    return {"id": prospect_id, "scheduled": step, "date": date}


def mark_sequence_complete(prospect_id):
    """Mark a prospect's sequence as complete after follow-up 1.

    Prospect is ready to be recycled into a new campaign with a different
    subject line and angle.
    """
    update_prospect(prospect_id, {
        "next_action": {
            "type": "recycle",
            "date": None,
            "notes": "Sequence complete. Ready for recycle into new campaign with different angle.",
        }
    })
    update_stage(prospect_id, "sequence_complete", interaction={
        "type": "sequence_complete",
        "notes": "Two-touch sequence finished. Non-responder ready for recycle.",
    })
    return {"id": prospect_id, "status": "sequence_complete"}


def pause_sequence(prospect_id):
    """Pause a prospect's follow-up sequence."""
    result = update_prospect(prospect_id, {
        "next_action": {
            "type": "paused",
            "date": None,
            "notes": f"Paused on {datetime.now().strftime('%Y-%m-%d')}",
        }
    })
    if result.get("status") == "not_found":
        return result
    return {"id": prospect_id, "status": "paused"}


def resume_sequence(prospect_id):
    """Resume a paused sequence — recalculate timing from today."""
    from modules.pipeline import get_prospect

    prospect = get_prospect(prospect_id)
    if not prospect:
        return {"id": prospect_id, "status": "not_found"}

    stage = prospect.get("stage", "")
    config = load_config()
    timing = config.get("sequence_timing", {})

    # Only one follow-up step remains
    if stage == "email_1_sent":
        next_step = "followup_1"
        next_days = timing.get("followup_1_days", 3)
    else:
        return {"id": prospect_id, "status": "error", "message": f"Cannot resume from stage: {stage}. Sequence may already be complete."}

    next_date = (datetime.now() + timedelta(days=next_days)).strftime("%Y-%m-%d")
    next_action = {"type": next_step, "date": next_date, "notes": f"Resumed — {next_step} scheduled"}

    update_prospect(prospect_id, {"next_action": next_action})

    return {"id": prospect_id, "status": "resumed", "next_action": next_action}


def should_skip(prospect):
    """Check if a prospect should be skipped for follow-ups."""
    stage = prospect.get("stage", "")

    # Skip terminal stages
    if stage in ("opted_out", "invalid_email", "replied_interested", "replied_not_interested",
                 "replied_not_now", "meeting_scheduled", "meeting_completed",
                 "opportunity", "won", "lost", "sequence_complete"):
        return True

    # Skip paused
    if prospect.get("next_action", {}).get("type") == "paused":
        return True

    # Skip weekends
    today = datetime.now()
    if today.weekday() >= 5:  # Saturday=5, Sunday=6
        return True

    return False
