"""Pipeline CRM — JSON-based prospect tracking."""

import fcntl
import json
import shutil
from datetime import datetime, timedelta
from pathlib import Path

from config import PIPELINE_PATH, DATA_DIR, load_config

# Stage -> next action mapping
STAGE_TRANSITIONS = {
    "researched": {"next_type": "draft_email", "delay_days": 0},
    "discovered": {"next_type": "research", "delay_days": 0},
    "ready_to_send": {"next_type": "send_initial", "delay_days": 0},
    "email_1_sent": {"next_type": "followup_1", "delay_days": 3},
    "followup_1_sent": {"next_type": "followup_2", "delay_days": 4},
    "followup_2_sent": {"next_type": "breakup", "delay_days": 7},
    "breakup_sent": {"next_type": "mark_complete", "delay_days": 7},
    "sequence_complete": {"next_type": "revisit", "delay_days": 60},
    "replied_interested": {"next_type": "schedule_call", "delay_days": 0},
    "replied_not_now": {"next_type": "follow_up_later", "delay_days": 30},
    "replied_not_interested": {"next_type": None, "delay_days": None},
    "meeting_scheduled": {"next_type": "attend_meeting", "delay_days": 0},
    "meeting_completed": {"next_type": "follow_up_next_steps", "delay_days": 1},
    "opportunity": {"next_type": "track_deal", "delay_days": 0},
    "won": {"next_type": None, "delay_days": None},
    "lost": {"next_type": "revisit", "delay_days": 90},
    "opted_out": {"next_type": None, "delay_days": None},
    "invalid_email": {"next_type": "find_alt_email", "delay_days": 0},
}

ALL_STAGES = list(STAGE_TRANSITIONS.keys())


def load_pipeline():
    """Load pipeline.json with file locking."""
    PIPELINE_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not PIPELINE_PATH.exists():
        default = {
            "metadata": {
                "created": _today(),
                "last_updated": _today(),
                "total_prospects": 0,
                "campaigns": [],
            },
            "prospects": [],
        }
        save_pipeline(default)
        return default

    with open(PIPELINE_PATH) as f:
        fcntl.flock(f, fcntl.LOCK_SH)
        try:
            data = json.load(f)
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)
    return data


def save_pipeline(data):
    """Save pipeline.json with exclusive file locking."""
    PIPELINE_PATH.parent.mkdir(parents=True, exist_ok=True)
    data["metadata"]["last_updated"] = _today()
    data["metadata"]["total_prospects"] = len(data["prospects"])

    with open(PIPELINE_PATH, "w") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        try:
            json.dump(data, f, indent=2)
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)


def generate_next_id(prospects):
    """Generate the next sequential prospect ID (p_001, p_002, ...)."""
    if not prospects:
        return "p_001"
    max_num = 0
    for p in prospects:
        pid = p.get("id", "")
        if pid.startswith("p_"):
            try:
                num = int(pid[2:])
                max_num = max(max_num, num)
            except ValueError:
                pass
    return f"p_{max_num + 1:03d}"


def add_prospect(prospect_dict):
    """Add a new prospect to the pipeline."""
    data = load_pipeline()
    pid = generate_next_id(data["prospects"])
    now = _today()

    prospect = {
        "id": pid,
        "name": prospect_dict.get("name", ""),
        "email": prospect_dict.get("email", ""),
        "company": prospect_dict.get("company", ""),
        "role": prospect_dict.get("role", ""),
        "company_url": prospect_dict.get("company_url", ""),
        "linkedin_url": prospect_dict.get("linkedin_url", ""),
        "company_type": prospect_dict.get("company_type", ""),
        "fit_score": prospect_dict.get("fit_score", 0),
        "campaign": prospect_dict.get("campaign", ""),
        "stage": prospect_dict.get("stage", "researched"),
        "source": prospect_dict.get("source", ""),
        "prospect_buckets": prospect_dict.get("prospect_buckets", []),
        "estimated_ad_spend": prospect_dict.get("estimated_ad_spend", ""),
        "personalization_hooks": prospect_dict.get("personalization_hooks", []),
        "pain_signals": prospect_dict.get("pain_signals", []),
        "company_intel": prospect_dict.get("company_intel", {}),
        "email_source": prospect_dict.get("email_source", ""),
        "email_verified": prospect_dict.get("email_verified", False),
        "interactions": prospect_dict.get("interactions", []),
        "next_action": prospect_dict.get("next_action", _default_next_action(prospect_dict.get("stage", "researched"))),
        "tags": prospect_dict.get("tags", []),
        "notes": prospect_dict.get("notes", ""),
        "created": now,
        "updated": now,
    }

    # Track campaign
    campaign = prospect.get("campaign")
    if campaign and campaign not in data["metadata"]["campaigns"]:
        data["metadata"]["campaigns"].append(campaign)

    data["prospects"].append(prospect)
    save_pipeline(data)
    return {"id": pid, "status": "added"}


def get_prospect(prospect_id):
    """Get a single prospect by ID."""
    data = load_pipeline()
    for p in data["prospects"]:
        if p["id"] == prospect_id:
            return p
    return None


def update_prospect(prospect_id, updates):
    """Update a prospect's fields."""
    data = load_pipeline()
    for p in data["prospects"]:
        if p["id"] == prospect_id:
            for key, value in updates.items():
                if key != "id":
                    p[key] = value
            p["updated"] = _today()
            save_pipeline(data)
            return {"id": prospect_id, "status": "updated"}
    return {"id": prospect_id, "status": "not_found"}


def update_stage(prospect_id, new_stage, interaction=None):
    """Update a prospect's stage, log interaction, set next_action."""
    data = load_pipeline()
    for p in data["prospects"]:
        if p["id"] == prospect_id:
            p["stage"] = new_stage
            p["updated"] = _today()

            if interaction:
                if "interactions" not in p:
                    p["interactions"] = []
                if "date" not in interaction:
                    interaction["date"] = _now_iso()
                p["interactions"].append(interaction)

            p["next_action"] = _default_next_action(new_stage)

            save_pipeline(data)
            return {"id": prospect_id, "status": "updated", "stage": new_stage}
    return {"id": prospect_id, "status": "not_found"}


def list_prospects(stage=None, campaign=None, tag=None, limit=None, score_min=None):
    """List prospects with optional filters."""
    data = load_pipeline()
    results = data["prospects"]

    if stage:
        results = [p for p in results if p.get("stage") == stage]
    if campaign:
        results = [p for p in results if p.get("campaign") == campaign]
    if tag:
        results = [p for p in results if tag in p.get("tags", [])]
    if score_min is not None:
        results = [p for p in results if p.get("fit_score", 0) >= score_min]

    # Sort by fit_score descending
    results.sort(key=lambda p: p.get("fit_score", 0), reverse=True)

    if limit:
        results = results[:limit]

    return {"prospects": results, "total": len(results)}


def search_prospects(query):
    """Search prospects by name, company, email, or notes."""
    data = load_pipeline()
    query_lower = query.lower()
    results = []
    for p in data["prospects"]:
        searchable = " ".join([
            p.get("name", ""),
            p.get("company", ""),
            p.get("email", ""),
            p.get("notes", ""),
            p.get("role", ""),
        ]).lower()
        if query_lower in searchable:
            results.append(p)
    return {"results": results, "total": len(results)}


def get_due_actions(date=None):
    """Get all prospects with next_action due on or before the given date."""
    if date is None:
        date = _today()
    data = load_pipeline()
    due = []
    for p in data["prospects"]:
        next_action = p.get("next_action", {})
        action_date = next_action.get("date", "")
        if action_date and action_date <= date:
            # Skip opted_out and invalid_email
            if p.get("stage") not in ("opted_out", "invalid_email"):
                due.append(p)

    due.sort(key=lambda p: p.get("next_action", {}).get("date", ""))
    return {"due_actions": due, "total": len(due)}


def delete_prospect(prospect_id):
    """Delete a prospect (except opted_out — those are kept forever)."""
    data = load_pipeline()
    for i, p in enumerate(data["prospects"]):
        if p["id"] == prospect_id:
            if p.get("stage") == "opted_out":
                return {"id": prospect_id, "status": "error", "message": "Cannot delete opted_out prospects"}
            data["prospects"].pop(i)
            save_pipeline(data)
            return {"id": prospect_id, "status": "deleted"}
    return {"id": prospect_id, "status": "not_found"}


def backup_pipeline():
    """Create a dated backup of pipeline.json."""
    if not PIPELINE_PATH.exists():
        return {"status": "error", "message": "No pipeline.json to backup"}
    backup_name = f"pipeline-backup-{_today()}.json"
    backup_path = DATA_DIR / backup_name
    shutil.copy2(PIPELINE_PATH, backup_path)
    return {"backup_file": backup_name, "status": "backed_up"}


def _today():
    return datetime.now().strftime("%Y-%m-%d")


def _now_iso():
    return datetime.now().isoformat() + "Z"


def _default_next_action(stage):
    """Generate the default next_action for a given stage."""
    transition = STAGE_TRANSITIONS.get(stage)
    if not transition or transition["next_type"] is None:
        return {"type": None, "date": None, "notes": ""}

    delay = transition["delay_days"]
    if delay is not None and delay > 0:
        action_date = (datetime.now() + timedelta(days=delay)).strftime("%Y-%m-%d")
    else:
        action_date = _today()

    return {
        "type": transition["next_type"],
        "date": action_date,
        "notes": "",
    }
