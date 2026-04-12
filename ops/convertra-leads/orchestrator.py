#!/usr/bin/env python3
"""Convertra Leads Orchestrator — cron-driven pipeline automation.

Replaces OpenClaw bot. Six modes:
  - daily: inbox -> followups -> send -> report -> notify
  - weekly: health check + red flag detection
  - campaign: discover -> research -> score -> email-find -> draft -> notify
  - prospect: loop discovery until N hot leads, then batch email-find + draft
  - fill: daily cron — hunt leads + push to Instantly (runs before sending window)
  - optimize: self-optimizing email copy A/B testing (auto-research pattern)

Usage:
  python3 orchestrator.py daily
  python3 orchestrator.py weekly
  python3 orchestrator.py campaign --niches "supplements,skincare" [--include-jobs] [--campaign "feb-2026"]
  python3 orchestrator.py prospect --target 20 [--niches "supplements,skincare"] [--max-rounds 10]
  python3 orchestrator.py fill --target 25 [--campaign-id "8b466981-..."]
  python3 orchestrator.py optimize [--reset] [--dry-run] [--force-eval] [--from-best]
"""

import argparse
import json
import logging
import random
import sys
import os
import time
from datetime import datetime

# Ensure project root on path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import load_env, load_config, TEMPLATES_PATH

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("orchestrator")


# ──────────────────────────────────────────────────────────────────────
# DAILY ROUTINE
# ──────────────────────────────────────────────────────────────────────

def run_daily():
    """Execute the full daily routine.

    Steps:
    1. Check inbox replies (bounces, opt-outs, interested)
    2. Check warmup status / remaining capacity
    3. Send due follow-ups using templates (NOT AI)
    4. Send ready-to-send initial emails (already drafted)
    5. Generate daily report
    6. Send Telegram notification

    Returns:
        dict: summary of all actions taken
    """
    log.info("=== DAILY ROUTINE START ===")
    results = {"timestamp": datetime.now().isoformat(), "mode": "daily"}

    # Step 1: Check inbox replies (FIRST — never follow up on someone who replied)
    log.info("Step 1: Checking inbox for replies...")
    inbox_result = _process_inbox()
    results["inbox"] = inbox_result
    log.info(
        f"  Replies: {inbox_result['replies_processed']}, "
        f"Bounces: {inbox_result['bounces_processed']}, "
        f"Opt-outs: {inbox_result['optouts_processed']}"
    )

    # Step 2: Check warmup status
    log.info("Step 2: Checking warmup status...")
    from modules.mailer import get_daily_status
    status = get_daily_status()
    remaining = status.get("remaining", 0)
    results["warmup"] = status
    log.info(
        f"  Warmup week {status.get('warmup_week')}: "
        f"{status.get('sent_today')}/{status.get('limit')} sent, "
        f"{remaining} remaining"
    )

    # Step 2b: Vayne health check (non-blocking — just logs + flags)
    vayne_healthy = True
    if os.environ.get("VAYNE_API_KEY", ""):
        try:
            from modules.vayne import check_health as vayne_check
            vayne_status = vayne_check()
            results["vayne"] = vayne_status
            vayne_healthy = vayne_status.get("healthy", False)
            if vayne_healthy:
                credits = vayne_status.get("credits", {})
                log.info(f"  Vayne: healthy ({credits.get('credit_available', '?')} credits)")
            else:
                log.warning(
                    f"  Vayne: UNHEALTHY — LinkedIn cookie "
                    f"{vayne_status.get('linkedin_authentication', 'unknown')}"
                )
        except Exception as e:
            log.warning(f"  Vayne health check failed: {e}")
            results["vayne"] = {"healthy": False, "error": str(e)}
            vayne_healthy = False

    if remaining <= 0:
        log.info("  No send capacity remaining — skipping send steps.")
        results["followups"] = {"sent": 0, "skipped": 0, "message": "No capacity"}
        results["sends"] = {"sent": 0, "skipped": 0, "message": "No capacity"}
    else:
        # Step 3: Send due follow-ups (templates, NOT AI)
        log.info("Step 3: Sending due follow-ups...")
        followup_result = _send_due_followups(remaining)
        results["followups"] = followup_result
        remaining -= followup_result.get("capacity_used", 0)
        log.info(
            f"  Follow-ups: {followup_result['sent']} sent, "
            f"{followup_result['failed']} failed"
        )

        # Step 4: Send ready-to-send initial emails
        if remaining > 0:
            log.info("Step 4: Sending ready-to-send emails...")
            send_result = _send_ready_emails(remaining)
            results["sends"] = send_result
            log.info(
                f"  Sent: {send_result.get('sent', 0)}, "
                f"Failed: {send_result.get('failed', 0)}"
            )
        else:
            log.info("Step 4: Skipped — no remaining capacity after follow-ups.")
            results["sends"] = {"sent": 0, "message": "Capacity used by follow-ups"}

    # Step 5: Daily report
    log.info("Step 5: Generating daily report...")
    from modules.reporter import daily_report
    report = daily_report()
    results["report"] = report

    # Step 6: Telegram notification
    log.info("Step 6: Sending Telegram notification...")
    from modules.notifier import send_notification, format_daily_summary
    message = format_daily_summary(
        report, inbox_result,
        results.get("followups"),
        results.get("sends"),
    )
    if not vayne_healthy and os.environ.get("VAYNE_API_KEY", ""):
        message += "\n⚠️ Vayne LinkedIn cookie expired — update via: cli.py vayne update-cookie"
    notify_result = send_notification(message)
    results["notification"] = notify_result

    log.info("=== DAILY ROUTINE COMPLETE ===")
    return results


# ──────────────────────────────────────────────────────────────────────
# WEEKLY REVIEW
# ──────────────────────────────────────────────────────────────────────

def run_weekly():
    """Execute the weekly health check.

    Steps:
    1. Generate pipeline summary
    2. Generate campaign report (all campaigns)
    3. Detect red flags
    4. Auto-pause if critical
    5. Send Telegram notification

    Returns:
        dict: summary + red_flags list
    """
    log.info("=== WEEKLY REVIEW START ===")
    results = {"timestamp": datetime.now().isoformat(), "mode": "weekly"}

    # Step 1: Pipeline summary
    log.info("Step 1: Generating pipeline summary...")
    from modules.reporter import pipeline_summary, campaign_report
    summary = pipeline_summary()
    results["pipeline_summary"] = summary
    log.info(f"  Total prospects: {summary.get('total_prospects', 0)}")

    # Step 2: Campaign report
    log.info("Step 2: Generating campaign report...")
    report = campaign_report()
    results["campaign_report"] = report

    # Step 3: Detect red flags
    log.info("Step 3: Detecting red flags...")
    red_flags = _detect_red_flags(report, summary)
    results["red_flags"] = red_flags

    if red_flags:
        for flag in red_flags:
            log.warning(f"  {flag}")
    else:
        log.info("  All clear — no red flags.")

    # Step 4: Auto-pause if critical
    critical_flags = [f for f in red_flags if f.startswith("CRITICAL")]
    if critical_flags:
        log.warning("Step 4: Critical flags detected — auto-pausing sequences...")
        paused = _auto_pause_sequences()
        results["auto_paused"] = paused
        log.warning(f"  Paused {paused} active sequences.")
    else:
        results["auto_paused"] = 0

    # Step 5: Telegram notification
    log.info("Step 5: Sending Telegram notification...")
    from modules.notifier import send_notification, format_weekly_summary
    message = format_weekly_summary(summary, report, red_flags)
    notify_result = send_notification(message)
    results["notification"] = notify_result

    log.info("=== WEEKLY REVIEW COMPLETE ===")
    return results


# ──────────────────────────────────────────────────────────────────────
# CAMPAIGN PIPELINE
# ──────────────────────────────────────────────────────────────────────

def run_campaign(niches, include_jobs=False, campaign_name=None):
    """Execute the full campaign pipeline: discover -> research -> score -> email-find -> draft.

    Args:
        niches: list of str — niche keywords for discovery
        include_jobs: bool — also search job listings for media buyer hires
        campaign_name: str — optional campaign tag

    Returns:
        dict: full campaign summary with counts at each stage
    """
    log.info("=== CAMPAIGN PIPELINE START ===")
    if not campaign_name:
        campaign_name = f"campaign-{datetime.now().strftime('%Y-%m-%d')}"

    results = {"timestamp": datetime.now().isoformat(), "mode": "campaign", "campaign": campaign_name}

    # Phase 1: Discovery
    log.info("Phase 1: Discovery...")
    discovery = _run_discovery(niches, include_jobs, campaign_name)
    results["discovery"] = discovery
    log.info(
        f"  DuckDuckGo: {discovery['ddg_found']}, "
        f"Ad Library: {discovery['adlib_found']}, "
        f"Jobs: {discovery.get('jobs_found', 0)}, "
        f"Total added: {discovery['total_added']}"
    )

    if discovery["total_added"] == 0:
        log.info("  No new prospects found — skipping remaining phases.")
        results["research"] = {"researched": 0}
        results["scoring"] = {"scored": 0}
        results["email_finding"] = {"found": 0}
        results["drafting"] = {"drafted": 0}
    else:
        # Phase 2: Research
        log.info("Phase 2: Research...")
        research_result = _run_research(stage="discovered")
        results["research"] = {"researched": research_result.get("researched", 0)}
        log.info(f"  Researched: {research_result.get('researched', 0)} prospects")

        # Phase 3: Score
        log.info("Phase 3: Scoring...")
        from modules.scorer import batch_score
        score_result = batch_score(stage="researched")
        results["scoring"] = {
            "scored": score_result.get("scored", 0),
            "hot": score_result.get("hot", 0),
            "warm": score_result.get("warm", 0),
        }
        log.info(
            f"  Scored: {score_result.get('scored', 0)} "
            f"(hot: {score_result.get('hot', 0)}, warm: {score_result.get('warm', 0)})"
        )

        # Phase 4: Enrich + Find emails (warm+ leads, score >= 5)
        log.info("Phase 4: Enrichment + email finding...")

        # Step 4a: Enrichment (Apollo primary, Hunter fallback — also finds emails)
        enrich_stats = {"enriched": 0, "emails_found": 0, "credits_used": 0}
        has_enrichment = bool(os.environ.get("APOLLO_API_KEY", "") or os.environ.get("HUNTER_API_KEY", ""))
        if has_enrichment:
            try:
                from modules.enrichment import batch_enrich
                enrich_stats = batch_enrich(stage="researched", score_min=5, max_credits=500)
                provider = enrich_stats.get("provider", "unknown")
                log.info(
                    f"  {provider.title()}: {enrich_stats.get('enriched', 0)} enriched, "
                    f"{enrich_stats.get('emails_found', 0)} emails found, "
                    f"{enrich_stats.get('credits_used', 0)} credits used"
                )
            except Exception as e:
                log.error(f"  Enrichment failed: {e}")
        else:
            log.info("  No enrichment API configured — skipping.")

        # Step 4b: Pattern-guess fallback for prospects enrichment missed
        from modules.email_finder import batch_find_emails
        email_result = batch_find_emails(stage="researched", score_min=5, skip_enrichment=True)
        results["enrichment"] = {
            "enriched": enrich_stats.get("enriched", 0),
            "emails_found": enrich_stats.get("emails_found", 0),
            "credits_used": enrich_stats.get("credits_used", 0),
            "provider": enrich_stats.get("provider", "none"),
        }
        results["email_finding"] = {
            "found": email_result.get("found", 0),
            "not_found": email_result.get("not_found", 0),
        }
        log.info(
            f"  Total emails: {email_result.get('found', 0)}, "
            f"Not found: {email_result.get('not_found', 0)}"
        )

        # Phase 5: AI Draft emails (ONLY AI step, warm+ leads)
        log.info("Phase 5: AI email drafting...")
        draft_result = _run_drafting(stage="researched", score_min=5)
        results["drafting"] = {
            "drafted": draft_result.get("drafted", 0),
            "fallback": draft_result.get("fallback", 0),
            "errors": draft_result.get("errors", 0),
        }
        ai_count = draft_result.get("drafted", 0) - draft_result.get("fallback", 0)
        log.info(
            f"  Drafted: {draft_result.get('drafted', 0)} "
            f"(AI: {ai_count}, template fallback: {draft_result.get('fallback', 0)})"
        )

    # Phase 6: Summary + notification
    log.info("Phase 6: Summary + notification...")
    from modules.reporter import pipeline_summary
    from modules.notifier import send_notification, format_campaign_summary
    summary = pipeline_summary()
    results["pipeline_summary"] = summary

    message = format_campaign_summary(
        discovery_count=discovery["total_added"],
        research_count=results.get("research", {}).get("researched", 0),
        scored_count=results.get("scoring", {}).get("scored", 0),
        emails_found=results.get("email_finding", {}).get("found", 0),
        drafted_count=results.get("drafting", {}).get("drafted", 0),
        enrichment=results.get("enrichment"),
    )
    notify_result = send_notification(message)
    results["notification"] = notify_result

    log.info("=== CAMPAIGN PIPELINE COMPLETE ===")
    return results


# ──────────────────────────────────────────────────────────────────────
# AGENT WRAPPERS — agent-first with deterministic fallback
# ──────────────────────────────────────────────────────────────────────


def _run_research(stage="discovered"):
    """Wraps batch_research() with managed agent research + fallback.

    Integration points: ~264, ~971, ~1279, ~1440
    """
    from modules.research import batch_research

    try:
        from modules.agents import agents_enabled, is_shadow_mode, research_prospect, log_shadow_comparison
    except ImportError:
        return batch_research(stage=stage)

    if not agents_enabled():
        return batch_research(stage=stage)

    if is_shadow_mode():
        # Shadow mode: snapshot candidates, run deterministic, then agent (read-only)
        from modules.pipeline import load_pipeline, get_prospect
        data = load_pipeline()
        candidates = [
            p["id"] for p in data["prospects"]
            if p.get("stage") == stage and not p.get("company_intel", {}).get("tech_stack")
        ]

        # Run deterministic research (advances stages, writes pipeline)
        result = batch_research(stage=stage)

        # Run agent on same candidates (read-only — log only, never write)
        for pid in candidates:
            prospect = get_prospect(pid)
            if prospect:
                agent_result = research_prospect(prospect)
                log_shadow_comparison(pid, agent_result, prospect.get("company_intel", {}))

        return result

    # Live mode: agent-first with fallback
    from modules.pipeline import load_pipeline, update_prospect
    from modules.research import scrape_company

    data = load_pipeline()
    researched = 0
    results = []

    for prospect in data["prospects"]:
        if prospect.get("stage") != stage:
            continue
        if prospect.get("company_intel", {}).get("tech_stack"):
            continue

        url = prospect.get("company_url", "")
        if not url:
            continue

        # Try agent first
        agent_result = research_prospect(prospect)

        if agent_result:
            # Agent succeeded — merge into existing intel to preserve Ad Library fields
            intel = prospect.get("company_intel", {})
            intel.update(agent_result.get("company_intel", {}))
            hooks = [h["hook"] for h in agent_result.get("personalization_hooks", []) if h.get("hook")]
            pains = agent_result.get("pain_signals", [])

            updates = {
                "company_intel": intel,
                "personalization_hooks": hooks,
                "pain_signals": pains,
                "stage": "researched",
            }
            if agent_result.get("company_name"):
                updates["company"] = agent_result["company_name"]
            if agent_result.get("contact_name") and not prospect.get("name"):
                updates["name"] = agent_result["contact_name"]
            if agent_result.get("contact_role") and not prospect.get("role"):
                updates["role"] = agent_result["contact_role"]

            update_prospect(prospect["id"], updates)
            researched += 1
        else:
            # Agent failed — fallback to deterministic scraper, merge into existing intel
            research = scrape_company(url)
            signals = research.get("signals", {})
            intel = prospect.get("company_intel", {})
            intel.update({
                "tech_stack": signals.get("tech_stack", []),
                "estimated_employees": signals.get("team_size", ""),
                "funding": signals.get("funding", ""),
                "hiring_signals": signals.get("hiring_signals", []),
                "content_marketing": signals.get("content_marketing", False),
                "dead_website": signals.get("dead_website", False),
                "has_meta_pixel": signals.get("has_meta_pixel", False),
                "has_google_ads": signals.get("has_google_ads", False),
                "is_ecommerce_store": signals.get("is_ecommerce_store", False),
                "contacts": signals.get("contacts", []),
            })
            update_prospect(prospect["id"], {
                "company_intel": intel,
                "stage": "researched",
            })
            researched += 1

    return {"researched": researched, "results": results}


def _run_drafting(stage="researched", score_min=8):
    """Wraps batch_draft() with managed agent drafting + fallback.

    Integration points: ~324, ~1117, ~1321, ~1471
    """
    from modules.drafter import batch_draft

    try:
        from modules.agents import agents_enabled, draft_email_agent, LEARNINGS_PATH, _load_json
    except ImportError:
        return batch_draft(stage=stage, score_min=score_min)

    if not agents_enabled():
        return batch_draft(stage=stage, score_min=score_min)

    # Load learnings for drafter context
    learnings = _load_json(LEARNINGS_PATH, default={})

    from modules.pipeline import list_prospects, update_prospect, update_stage

    result_obj = list_prospects(stage=stage, score_min=score_min)
    prospects = result_obj.get("prospects", [])

    stats = {"drafted": 0, "fallback": 0, "skipped": 0, "errors": 0, "results": []}

    for prospect in prospects:
        pid = prospect.get("id", "")

        # Skip if already has a draft
        existing_draft = prospect.get("draft_email", {})
        if isinstance(existing_draft, dict) and existing_draft.get("body"):
            stats["skipped"] += 1
            continue
        if not prospect.get("email"):
            stats["skipped"] += 1
            continue

        # Try agent first
        agent_result = draft_email_agent(prospect, learnings)

        if agent_result and agent_result.get("subject") and agent_result.get("body"):
            update_prospect(pid, {
                "draft_email": {
                    "subject": agent_result["subject"],
                    "body": agent_result["body"],
                }
            })
            update_stage(pid, "ready_to_send", interaction={
                "type": "email_drafted",
                "notes": "Email drafted via managed agent",
            })
            stats["drafted"] += 1
            stats["results"].append({"id": pid, "method": "agent", "status": "drafted"})
        else:
            # Fallback to GPT-5.4 drafter
            from modules.drafter import draft_email
            draft_result = draft_email(prospect)

            if draft_result["status"] == "error":
                stats["errors"] += 1
                continue

            update_prospect(pid, {
                "draft_email": {
                    "subject": draft_result["subject"],
                    "body": draft_result["body"],
                }
            })
            update_stage(pid, "ready_to_send", interaction={
                "type": "email_drafted",
                "notes": f"Email drafted via {draft_result['method']} (agent fallback)",
            })
            if draft_result["method"] == "ai":
                stats["drafted"] += 1
            else:
                stats["fallback"] += 1
            stats["results"].append({"id": pid, "method": draft_result["method"], "status": "drafted"})

    return stats


def _run_classification(body_preview, prospect_id=None):
    """Wraps _classify_reply() with managed agent classification + fallback.

    Returns: str — pipeline stage (replied_interested, replied_not_interested, replied_not_now)
    """
    try:
        from modules.agents import agents_enabled, classify_reply_agent
    except ImportError:
        return _classify_reply(body_preview)

    if not agents_enabled():
        return _classify_reply(body_preview)

    # Try agent first (sends raw reply text, no PII)
    agent_result = classify_reply_agent(body_preview, prospect_id)

    if agent_result and agent_result.get("stage"):
        return agent_result["stage"]

    # Fallback to keyword-based classification
    return _classify_reply(body_preview)


# ──────────────────────────────────────────────────────────────────────
# INTERNAL HELPERS
# ──────────────────────────────────────────────────────────────────────

def _process_inbox():
    """Check inbox and process replies, bounces, opt-outs.

    Returns:
        dict with keys: replies_processed, bounces_processed, optouts_processed,
                        interested, not_interested, not_now, errors
    """
    from modules.inbox import check_replies_for_pipeline
    from modules.pipeline import update_stage

    stats = {
        "replies_processed": 0, "bounces_processed": 0, "optouts_processed": 0,
        "interested": 0, "not_interested": 0, "not_now": 0, "errors": [],
    }

    try:
        inbox = check_replies_for_pipeline()
    except Exception as e:
        stats["errors"].append(f"Inbox error: {e}")
        return stats

    if inbox.get("error"):
        stats["errors"].append(f"Inbox error: {inbox['error']}")
        return stats

    # Process bounces
    for bounce in inbox.get("bounces", []):
        pid = bounce.get("prospect_id")
        if pid:
            try:
                update_stage(pid, "invalid_email", interaction={
                    "type": "bounce",
                    "date": datetime.now().isoformat() + "Z",
                    "notes": f"Bounce detected: {bounce.get('subject', '')[:80]}",
                })
                stats["bounces_processed"] += 1
            except Exception as e:
                stats["errors"].append(f"Bounce update failed for {pid}: {e}")

    # Process opt-outs
    for optout in inbox.get("opt_outs", []):
        pid = optout.get("prospect_id")
        if pid:
            try:
                update_stage(pid, "opted_out", interaction={
                    "type": "opt_out",
                    "date": datetime.now().isoformat() + "Z",
                    "notes": "Opt-out detected in reply",
                })
                stats["optouts_processed"] += 1
            except Exception as e:
                stats["errors"].append(f"Opt-out update failed for {pid}: {e}")

    # Process replies (not bounces, not opt-outs)
    for reply in inbox.get("replies", []):
        pid = reply.get("prospect_id")
        if pid:
            try:
                body = reply.get("body_preview", "").lower()
                classification = _run_classification(body, prospect_id=pid)
                update_stage(pid, classification, interaction={
                    "type": "email_received",
                    "date": datetime.now().isoformat() + "Z",
                    "notes": f"Reply classified as: {classification}. Preview: {reply.get('body_preview', '')[:100]}",
                })
                stats["replies_processed"] += 1
                if classification == "replied_interested":
                    stats["interested"] += 1
                elif classification == "replied_not_interested":
                    stats["not_interested"] += 1
                else:
                    stats["not_now"] += 1
            except Exception as e:
                stats["errors"].append(f"Reply update failed for {pid}: {e}")

    return stats


def _classify_reply(body_preview):
    """Deterministic reply classification based on keyword matching.

    Args:
        body_preview: str (lowercased reply text)

    Returns:
        str: "replied_interested" | "replied_not_interested" | "replied_not_now"
    """
    text = body_preview.lower()

    # Check for negative signals first
    negative_phrases = [
        "not interested", "no thanks", "no thank you", "remove me",
        "don't contact", "do not contact", "not relevant", "not a fit",
        "waste of time", "stop emailing", "never", "no need",
        "not for us", "we're not looking", "please don't",
    ]
    if any(phrase in text for phrase in negative_phrases):
        return "replied_not_interested"

    # Check for "not now" / deferral signals
    defer_phrases = [
        "not right now", "not at this time", "maybe later", "reach out later",
        "circle back", "not a good time", "busy right now", "next quarter",
        "end of year", "check back", "not yet", "bad timing",
        "touch base later", "revisit", "come back", "few months",
    ]
    if any(phrase in text for phrase in defer_phrases):
        return "replied_not_now"

    # Default: if they replied and it's not negative/deferred, treat as interested
    return "replied_interested"


def _send_due_followups(remaining_capacity):
    """Send all due follow-ups using templates from templates.json.

    Args:
        remaining_capacity: int — max emails we can send today.

    Returns:
        dict with keys: sent (int), failed (int), skipped (int), capacity_used (int)
    """
    from modules.followup import get_due_followups, SEQUENCE_STEPS
    from modules.pipeline import get_prospect, update_stage
    from modules.mailer import send_email

    config = load_config()
    delay = config.get("email", {}).get("send_delay_seconds", 45)

    due = get_due_followups()
    stats = {"sent": 0, "failed": 0, "skipped": 0, "capacity_used": 0}

    # Two-touch rule: only followup_1 (non-responders recycled into new campaign)
    for followup_type in ["followup_1"]:
        for item in due.get(followup_type, []):
            if stats["capacity_used"] >= remaining_capacity:
                stats["skipped"] += 1
                continue

            pid = item["id"]
            prospect = get_prospect(pid)
            if not prospect or not prospect.get("email"):
                stats["skipped"] += 1
                continue

            filled = _fill_followup_template(followup_type, prospect)
            result = send_email(prospect["email"], filled["subject"], filled["body"])

            if result.get("status") == "sent":
                step_info = SEQUENCE_STEPS.get(followup_type, {})
                new_stage = step_info.get("to_stage", f"{followup_type}_sent")
                update_stage(pid, new_stage, interaction={
                    "type": "email_sent",
                    "subject": filled["subject"],
                    "sequence_step": step_info.get("sequence_step", 0),
                    "notes": f"{followup_type} sent to {prospect['email']}",
                })
                stats["sent"] += 1
                stats["capacity_used"] += 1

                # Delay between sends
                time.sleep(delay)
            else:
                stats["failed"] += 1
                log.warning(f"  Follow-up send failed for {pid}: {result.get('message', '')}")

    return stats


def _fill_followup_template(template_key, prospect):
    """Fill the follow-up template with prospect data.

    Two-touch rule: only followup_1 is used. Non-responders are recycled
    into a new campaign with a different subject line and angle.

    Args:
        template_key: "followup_1"
        prospect: dict — prospect record

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

    template = templates.get(template_key, {})
    config = load_config()
    sender_name = config.get("email", {}).get("from_name", "")

    first_name = prospect.get("name", "").split()[0] if prospect.get("name") else "there"
    company = prospect.get("company", "your company")

    subs = {
        "first_name": first_name,
        "company": company,
        "sender_first_name": sender_name,
    }

    body = template.get("body", "")

    # For follow-ups, use RE: original subject
    original_subject = ""
    for interaction in prospect.get("interactions", []):
        if interaction.get("sequence_step") == 1 and interaction.get("subject"):
            original_subject = interaction["subject"]
            break

    subject = f"RE: {original_subject}" if original_subject else f"RE: {company} ad creative"

    # Fill placeholders
    for key, value in subs.items():
        body = body.replace(f"{{{key}}}", value)

    # Append signature if not present
    signature = config.get("email", {}).get("signature", "")
    if signature and "STOP" not in body:
        body += signature

    # If template was empty, use a minimal fallback
    if not body:
        body = (
            f"Hi {first_name},\n\n"
            f"Just floating this back up. The ad variations are ready whenever you want them.\n\n"
            f"{sender_name}"
        )

    return {"subject": subject, "body": body}


def _send_ready_emails(remaining_capacity):
    """Send initial emails for prospects in ready_to_send stage.

    Uses mailer.send_batch with remaining daily capacity.

    Returns:
        dict from mailer.send_batch()
    """
    from modules.mailer import send_batch
    return send_batch(stage="ready_to_send", limit=remaining_capacity)


def _detect_red_flags(campaign_report, pipeline_summary):
    """Check for operational red flags.

    Returns:
        list of str: warning messages (empty if healthy)
    """
    flags = []
    rates = campaign_report.get("rates", {})
    emails_sent = campaign_report.get("emails_sent", {})

    # Bounce rate > 3%
    bounce_rate = rates.get("bounce_rate", 0)
    if isinstance(bounce_rate, (int, float)) and bounce_rate > 3:
        flags.append(
            f"CRITICAL: Bounce rate {bounce_rate:.1f}% exceeds 3%. "
            f"All cold outreach should be paused."
        )

    # Reply rate < 2% after 50+ initial sends
    reply_rate = rates.get("reply_rate", 0)
    initial_sends = emails_sent.get("initial", 0) if isinstance(emails_sent, dict) else 0
    if initial_sends >= 50 and isinstance(reply_rate, (int, float)) and reply_rate < 2:
        flags.append(
            f"WARNING: Reply rate {reply_rate:.1f}% below 2% after {initial_sends} "
            f"initial sends. Review email copy and targeting."
        )

    # Pipeline low
    by_stage = pipeline_summary.get("by_stage", {})
    ready_count = by_stage.get("ready_to_send", 0) if isinstance(by_stage, dict) else 0
    if ready_count < 10:
        flags.append(
            f"INFO: Pipeline low — only {ready_count} prospects ready to send. "
            f"Consider running a campaign."
        )

    # Opt-out rate > 5%
    opted_out = 0
    if isinstance(by_stage, dict):
        opted_out = by_stage.get("opted_out", 0)
    if initial_sends > 0 and opted_out > 0:
        optout_rate = opted_out / initial_sends * 100
        if optout_rate > 5:
            flags.append(
                f"WARNING: Opt-out rate {optout_rate:.1f}% is high. "
                f"Review targeting and messaging."
            )

    return flags


def _auto_pause_sequences():
    """Pause all active follow-up sequences when critical flags detected.

    Returns:
        int: number of sequences paused
    """
    from modules.pipeline import list_prospects
    from modules.followup import pause_sequence

    paused = 0
    active_stages = ["email_1_sent", "followup_1_sent"]

    for stage in active_stages:
        result = list_prospects(stage=stage)
        for prospect in result.get("prospects", []):
            pid = prospect.get("id")
            if pid:
                pause_sequence(pid)
                paused += 1

    return paused


def _run_discovery(niches, include_jobs, campaign_name, source_type="niche"):
    """Phase 1: Multi-source discovery.

    Supports original sources (DDG, Ad Library, Jobs) and new sources
    (LinkedIn, Shopify, Agencies).

    Args:
        niches: list of niche/keyword strings for DDG + Ad Library.
        include_jobs: whether to search job listings.
        campaign_name: campaign tag for pipeline.
        source_type: "niche" (DDG+AdLib), "jobs", "linkedin_people",
                     "linkedin_companies", "shopify", "agencies".

    Returns:
        dict with keys: ddg_found, adlib_found, jobs_found, linkedin_found,
                        shopify_found, agencies_found, total_added
    """
    from modules.pipeline import add_prospect

    stats = {
        "ddg_found": 0, "adlib_found": 0, "jobs_found": 0,
        "linkedin_found": 0, "shopify_found": 0, "agencies_found": 0,
        "total_added": 0,
    }

    # ── LinkedIn people discovery ──
    if source_type == "linkedin_people":
        try:
            from modules.linkedin_discovery import search_linkedin_people, batch_add_linkedin_people
            # Rotate through personas based on niche hint
            persona = _niche_to_linkedin_persona(niches[0] if niches else "")
            result = search_linkedin_people(persona=persona, limit=50)
            added = batch_add_linkedin_people(
                result.get("results", []), campaign=campaign_name, persona=persona
            )
            stats["linkedin_found"] = added.get("added", 0)
            stats["total_added"] += stats["linkedin_found"]
            log.info(f"  LinkedIn people ({persona}): {stats['linkedin_found']} added")
        except Exception as e:
            log.error(f"  LinkedIn people discovery failed: {e}")
        return stats

    # ── LinkedIn company discovery ──
    if source_type == "linkedin_companies":
        try:
            from modules.linkedin_discovery import search_linkedin_companies, batch_add_linkedin_companies
            persona = _niche_to_linkedin_persona(niches[0] if niches else "")
            result = search_linkedin_companies(persona=persona, limit=50)
            added = batch_add_linkedin_companies(
                result.get("results", []), campaign=campaign_name, persona=persona
            )
            stats["linkedin_found"] = added.get("added", 0)
            stats["total_added"] += stats["linkedin_found"]
            log.info(f"  LinkedIn companies ({persona}): {stats['linkedin_found']} added")
        except Exception as e:
            log.error(f"  LinkedIn company discovery failed: {e}")
        return stats

    # ── Shopify store discovery ──
    if source_type == "shopify":
        try:
            from modules.shopify_discovery import search_shopify_stores, batch_add_shopify_stores
            niche = niches[0] if niches else "supplements"
            result = search_shopify_stores(niche=niche, limit=50, verify=True)
            added = batch_add_shopify_stores(result.get("results", []), campaign=campaign_name)
            stats["shopify_found"] = added.get("added", 0)
            stats["total_added"] += stats["shopify_found"]
            log.info(f"  Shopify stores ({niche}): {stats['shopify_found']} added")
        except Exception as e:
            log.error(f"  Shopify discovery failed: {e}")
        return stats

    # ── Agency directory discovery ──
    if source_type == "agencies":
        try:
            from modules.google_business import search_agencies, batch_add_agencies
            # Use niche hint as location or default to US cities
            location = niches[0] if niches else None
            result = search_agencies(location=location, limit=50)
            added = batch_add_agencies(result.get("results", []), campaign=campaign_name)
            stats["agencies_found"] = added.get("added", 0)
            stats["total_added"] += stats["agencies_found"]
            log.info(f"  Agencies: {stats['agencies_found']} added")
        except Exception as e:
            log.error(f"  Agency discovery failed: {e}")
        return stats

    # ── Original sources: DDG + Ad Library + Jobs ──

    from modules.discovery import batch_discover
    from modules.scraper import search_ad_library

    # DuckDuckGo discovery
    try:
        ddg_result = batch_discover(niches=niches, limit_per_niche=50)
        for niche, results in ddg_result.get("results_by_niche", {}).items():
            for r in results:
                prospect_data = {
                    "company": r.get("company", ""),
                    "company_url": r.get("url", ""),
                    "source": "ddg_search",
                    "stage": "discovered",
                    "campaign": campaign_name,
                    "notes": r.get("description", "")[:200],
                }
                add_prospect(prospect_data)
                stats["ddg_found"] += 1
                stats["total_added"] += 1
    except Exception as e:
        log.error(f"  DuckDuckGo discovery failed: {e}")

    # Meta Ad Library scraping
    for niche in niches:
        try:
            adlib_result = search_ad_library(search_terms=niche, limit=20)
            for page in adlib_result.get("results", []):
                prospect_data = {
                    "company": page.get("page_name", ""),
                    "source": "ad_library",
                    "stage": "discovered",
                    "campaign": campaign_name,
                    "company_intel": {
                        "active_ad_count": page.get("ad_count", 0),
                        "platforms": page.get("platforms", []),
                    },
                }
                add_prospect(prospect_data)
                stats["adlib_found"] += 1
                stats["total_added"] += 1
        except Exception as e:
            log.error(f"  Ad Library scrape failed for '{niche}': {e}")

    # Job listing discovery (optional)
    if include_jobs:
        try:
            from modules.job_scraper import search_job_listings, batch_add_job_prospects
            job_result = search_job_listings(limit=50)
            added = batch_add_job_prospects(job_result.get("results", []), campaign=campaign_name)
            stats["jobs_found"] = added.get("added", 0)
            stats["total_added"] += stats["jobs_found"]
        except Exception as e:
            log.error(f"  Job listing discovery failed: {e}")

    return stats


def _niche_to_linkedin_persona(niche_hint):
    """Map a niche hint to the best LinkedIn persona.

    Used by the orchestrator to pick a relevant persona when LinkedIn
    is selected as a discovery source.
    """
    niche_lower = (niche_hint or "").lower()

    if any(kw in niche_lower for kw in ["agency", "performance", "media"]):
        return "agency_owners"
    if any(kw in niche_lower for kw in ["saas", "software", "b2b"]):
        return "saas_founders"
    if any(kw in niche_lower for kw in ["enterprise", "cmo", "vp"]):
        return "enterprise_marketing"
    if any(kw in niche_lower for kw in ["buyer", "paid", "growth"]):
        return "media_buyers"

    # Default rotation based on day of week
    from datetime import datetime
    day = datetime.now().weekday()
    personas = ["agency_owners", "enterprise_marketing", "media_buyers", "saas_founders"]
    return personas[day % len(personas)]


# ──────────────────────────────────────────────────────────────────────
# PROSPECT HUNT — Loop until N hot leads
# ──────────────────────────────────────────────────────────────────────

def run_prospect_hunt(target=20, niches=None, include_jobs=True, max_rounds=10,
                      score_threshold=8, email_score_min=5, campaign_name=None):
    """Loop discovery until target hot leads are found, then batch email-find + draft.

    Rotates through niches round-robin, inserts job listings every 3rd round,
    detects niche exhaustion, and expands to keyword variants when needed.
    All leads are kept (hot, warm, cool, skip) — target only controls when the loop stops.

    Args:
        target: Number of hot leads (fit_score >= score_threshold) to accumulate before stopping.
        niches: List of niche keywords. Defaults to all 6 built-in niches.
        include_jobs: Whether to include job listing searches in rotation.
        max_rounds: Maximum discovery rounds before stopping regardless.
        score_threshold: What counts as "hot" (default 12).
        email_score_min: Minimum score for email finding + drafting (default 8 = warm+hot).
        campaign_name: Optional campaign tag.

    Returns:
        dict: Full hunt summary with per-round stats and final pipeline counts.
    """
    from collections import deque
    from modules.discovery import DEFAULT_NICHES

    log.info("=== PROSPECT HUNT START ===")
    log.info(f"  Target: {target} hot leads (score >= {score_threshold})")
    log.info(f"  Max rounds: {max_rounds}, Include jobs: {include_jobs}")

    # Reset per-session query dedup caches so repeated niche rotations
    # skip queries already seen this run (DDG is deterministic).
    from modules.discovery import reset_query_cache
    reset_query_cache()

    start_time = time.time()
    if not campaign_name:
        campaign_name = f"hunt-{datetime.now().strftime('%Y-%m-%d')}"

    all_niches = niches if niches else list(DEFAULT_NICHES)
    niche_queue = deque(all_niches)
    exhausted_niches = set()
    jobs_used = False
    round_results = []

    results = {
        "timestamp": datetime.now().isoformat(),
        "mode": "prospect_hunt",
        "campaign": campaign_name,
        "target": target,
        "score_threshold": score_threshold,
        "email_score_min": email_score_min,
    }

    # ── Discovery + enrichment loop ──
    # Each round: discover → research → score → enrich → email find → draft
    # Target is checked against ready_to_send count (not scored count)
    # so the loop keeps going until enough prospects actually get emails and drafts.
    from modules.notifier import send_notification

    for round_num in range(1, max_rounds + 1):
        # Check if target already met (only count ready_to_send)
        hot_ready = _count_hot_ready(score_threshold)
        if hot_ready >= target:
            log.info(f"  Target met! {hot_ready}/{target} hot leads ready to send.")
            break

        # Pick next source
        source, source_type = _pick_next_source(
            niche_queue, exhausted_niches, round_num, include_jobs, jobs_used
        )

        if source is None:
            # Try expanded keywords
            expanded = _expand_keywords(all_niches, exhausted_niches)
            if expanded:
                log.info(f"  All standard niches exhausted — trying expanded keywords...")
                for kw in expanded:
                    niche_queue.append(kw)
                source, source_type = niche_queue.popleft(), "expanded"
            else:
                log.info(f"  All sources exhausted after {round_num - 1} rounds.")
                break

        log.info(f"--- Round {round_num}/{max_rounds}: {source} ({source_type}) ---")

        # Phase 1: Discovery (single source)
        discovery = _run_discovery(
            niches=[source] if source_type not in ("jobs", "linkedin_people", "linkedin_companies", "agencies") else [],
            include_jobs=(source_type == "jobs"),
            campaign_name=campaign_name,
            source_type=source_type,
        )
        discovered = discovery["total_added"]
        log.info(f"  Discovered: {discovered} new prospects")

        if discovered < 3:
            exhausted_niches.add(source)
            if discovered == 0:
                log.info(f"  Niche '{source}' exhausted (0 new) — will skip in future rounds.")
            else:
                log.info(f"  Niche '{source}' low-yield ({discovered} new) — marking exhausted.")
            # Inject sub-niches for the exhausted niche into the queue immediately
            from modules.discovery import SUB_NICHES
            sub_list = SUB_NICHES.get(source, [])
            injected = 0
            for sub in sub_list:
                if sub not in exhausted_niches:
                    niche_queue.append(sub)
                    injected += 1
                    if injected >= 5:  # Inject up to 5 sub-niches per exhausted parent
                        break
            if injected > 0:
                log.info(f"  Injected {injected} sub-niches for '{source}' into queue.")
        if discovered > 0:
            # Phase 2: Research
            log.info(f"  Researching...")
            research_result = _run_research(stage="discovered")
            researched = research_result.get("researched", 0)
            log.info(f"  Researched: {researched}")

            # Phase 3: Score
            log.info(f"  Scoring...")
            from modules.scorer import batch_score
            score_result = batch_score(stage="researched")
            log.info(
                f"  Scored: {score_result.get('scored', 0)} "
                f"(hot: {score_result.get('hot', 0)}, warm: {score_result.get('warm', 0)})"
            )

            # Phase 4: Enrich + email find + draft (process this round's leads)
            log.info(f"  Enriching + finding emails + drafting...")
            _run_enrichment_pass(email_score_min)

        if source_type == "jobs":
            jobs_used = True

        # Track round stats
        hot_ready = _count_hot_ready(score_threshold)
        round_info = {
            "round": round_num,
            "source": source,
            "source_type": source_type,
            "discovered": discovered,
            "hot_ready_total": hot_ready,
            "target": target,
        }
        round_results.append(round_info)

        # Telegram progress update
        progress_msg = (
            f"*Prospect Hunt -- Round {round_num}/{max_rounds}*\n"
            f"Source: {source} ({source_type})\n"
            f"Discovered: {discovered} new\n"
            f"Ready to send: {hot_ready}/{target} target\n"
            f"Remaining: {max(0, target - hot_ready)} more needed"
        )
        send_notification(progress_msg)

    # ── Final safety pass: catch any stragglers still in researched ──
    log.info("=== FINAL PASS: Enrichment + Email finding + AI drafting ===")
    _run_enrichment_pass(email_score_min)

    # ── Final counts ──
    from modules.pipeline import list_prospects
    hot_ready = list_prospects(stage="ready_to_send", score_min=score_threshold).get("total", 0)
    warm_ready = list_prospects(stage="ready_to_send", score_min=email_score_min).get("total", 0)
    total_ready = list_prospects(stage="ready_to_send").get("total", 0)
    hot_total = _count_hot_scored(score_threshold)
    warm_total = _count_hot_scored(email_score_min)

    elapsed = time.time() - start_time
    duration = f"{int(elapsed // 60)}m {int(elapsed % 60)}s"

    results.update({
        "rounds_completed": len(round_results),
        "max_rounds": max_rounds,
        "duration": duration,
        "target_met": hot_ready >= target,
        "rounds": round_results,
        "totals": {
            "total_discovered": sum(r["discovered"] for r in round_results),
            "niches_exhausted": len(exhausted_niches),
            "hot_scored": hot_total,
            "warm_scored": warm_total,
        },
        "final_counts": {
            "hot_ready": hot_ready,
            "warm_ready": warm_ready,
            "total_ready": total_ready,
        },
    })

    # ── Final Telegram summary ──
    from modules.notifier import send_notification, format_prospect_hunt_summary
    message = format_prospect_hunt_summary(results)
    notify_result = send_notification(message)
    results["notification"] = notify_result

    status = "TARGET MET" if hot_ready >= target else "TARGET NOT MET"
    log.info(f"=== PROSPECT HUNT COMPLETE ({status}) ===")
    log.info(f"  Hot ready: {hot_ready}/{target} | Warm ready: {warm_ready} | Duration: {duration}")
    return results


def _count_hot_scored(threshold):
    """Count prospects with fit_score >= threshold that are still actionable.

    Only counts prospects in pre-send stages (discovered, researched, ready_to_send).
    Prospects already pushed to Instantly (email_1_sent, followup_1_sent, etc.)
    are excluded — they've already been handled and shouldn't count toward the
    discovery target.
    """
    from modules.pipeline import list_prospects
    actionable_stages = ["discovered", "researched", "ready_to_send"]
    total = 0
    for stage in actionable_stages:
        result = list_prospects(stage=stage, score_min=threshold)
        total += result.get("total", 0)
    return total


def _count_hot_ready(threshold):
    """Count prospects with fit_score >= threshold AND stage == ready_to_send."""
    from modules.pipeline import list_prospects
    result = list_prospects(stage="ready_to_send", score_min=threshold)
    return result.get("total", 0)


def _run_enrichment_pass(email_score_min):
    """Run enrichment + pattern-guess email finding + AI drafting.

    Uses Apollo (primary) or Hunter (fallback) for enrichment.
    Processes all researched prospects with score >= email_score_min.
    Skips prospects already marked as enrichment dead ends.
    Advances successful prospects to ready_to_send.
    """
    has_enrichment = bool(os.environ.get("APOLLO_API_KEY", "") or os.environ.get("HUNTER_API_KEY", ""))
    if has_enrichment:
        try:
            from modules.enrichment import batch_enrich
            enrich_stats = batch_enrich(
                stage="researched", score_min=email_score_min, max_credits=300
            )
            provider = enrich_stats.get("provider", "unknown")
            log.info(
                f"    {provider.title()}: {enrich_stats.get('enriched', 0)} enriched, "
                f"{enrich_stats.get('emails_found', 0)} emails, "
                f"{enrich_stats.get('credits_used', 0)} credits"
            )
        except Exception as e:
            log.error(f"    Enrichment failed: {e}")

    from modules.email_finder import batch_find_emails

    email_result = batch_find_emails(stage="researched", score_min=email_score_min, skip_enrichment=True)
    log.info(
        f"    Emails: {email_result.get('found', 0)} found, "
        f"{email_result.get('not_found', 0)} not found"
    )

    draft_result = _run_drafting(stage="researched", score_min=email_score_min)
    log.info(
        f"    Drafted: {draft_result.get('drafted', 0)} "
        f"(AI: {draft_result.get('drafted', 0) - draft_result.get('fallback', 0)}, "
        f"template: {draft_result.get('fallback', 0)})"
    )


def _pick_next_source(niche_queue, exhausted, round_num, include_jobs, jobs_used):
    """Pick the next discovery source, rotating through all available sources.

    Source rotation schedule (6-round cycle, LinkedIn People runs 2x):
    - Round 1: niche (DDG + Ad Library)
    - Round 2: linkedin_people (agency owners, enterprise, etc.)
    - Round 3: niche (DDG — different niche from round 1)
    - Round 4: jobs OR shopify
    - Round 5: linkedin_people (different persona from round 2)
    - Round 6: agencies OR linkedin_companies
    - Round 7+: repeat cycle

    LinkedIn People runs twice per cycle (rounds 2+5, 8+11, ...) because it's
    the only source that reliably produces named contacts, making enrichment
    work consistently.

    Returns:
        tuple: (source_name, source_type) or (None, None) if all exhausted.
    """
    cycle_position = (round_num - 1) % 6

    # LinkedIn people (rounds 2, 5, 8, 11, 14, 17, 20, 23, ...)
    if cycle_position in (1, 4):
        return ("linkedin_people", "linkedin_people")

    # Shopify or Jobs (rounds 4, 10, 16, 22, ...)
    if cycle_position == 3:
        if include_jobs and not jobs_used:
            return ("job_listings", "jobs")
        # Pick a Shopify niche from the queue
        shopify_niches = ["supplements", "skincare", "fitness", "fashion", "beauty",
                          "pets", "home", "food_beverage"]
        for sn in shopify_niches:
            if f"shopify_{sn}" not in exhausted:
                return (sn, "shopify")
        return ("supplements", "shopify")

    # Agencies or LinkedIn companies (rounds 6, 12, 18, 24, ...)
    if cycle_position == 5:
        # Alternate between agencies and linkedin_companies
        if (round_num // 6) % 2 == 0:
            return ("agencies", "agencies")
        return ("linkedin_companies", "linkedin_companies")

    # Default: niche-based DDG + Ad Library (rounds 1, 3, 7, 9, 13, 15, ...)
    tried = 0
    while niche_queue and tried < len(niche_queue):
        niche = niche_queue.popleft()
        if niche not in exhausted:
            niche_queue.append(niche)  # Re-add to end for rotation
            return (niche, "niche")
        tried += 1

    # All standard niches exhausted — try jobs as fallback
    if include_jobs and not jobs_used:
        return ("job_listings", "jobs")

    # Fall back to LinkedIn (always has fresh results)
    return ("linkedin_people", "linkedin_people")


def _expand_keywords(all_niches, exhausted):
    """Generate expanded keyword variants when standard niches are exhausted.

    Strategy (in priority order):
    1. Sub-niche product categories (e.g. "collagen supplement" instead of "supplements")
       — these yield completely different DDG results
    2. LinkedIn persona variants (always fresh — LinkedIn profiles are vast)
    3. Shopify niche variants
    4. Location/business-type modifiers as a final fallback

    Returns:
        list of str: new keywords to try (up to 30).
    """
    from modules.discovery import SUB_NICHES

    expanded = []

    # Priority 1: Sub-niche product categories
    for niche in all_niches:
        sub_list = SUB_NICHES.get(niche, [])
        for sub in sub_list:
            if sub not in exhausted:
                expanded.append(sub)
                if len(expanded) >= 30:
                    return expanded

    # Priority 2: Modifier variants (fallback)
    modifiers = [
        "2026", "startup", "new brand", "Australia", "UK",
        "online store", "DTC brand", "independent brand",
    ]
    for niche in all_niches:
        for mod in modifiers:
            key = f"{niche} {mod}"
            if key not in exhausted:
                expanded.append(key)
                if len(expanded) >= 30:
                    return expanded

    return expanded


# ──────────────────────────────────────────────────────────────────────
# SALES NAV CSV IMPORT — Import → Enrich → Score → Draft → Push
# ──────────────────────────────────────────────────────────────────────

def run_import(csv_path, campaign="sales-nav", source="sales_navigator",
               score_default=5, score_threshold=8, push_campaign_id=None):
    """Full pipeline for Sales Navigator CSV imports.

    Steps:
    1. Import CSV into pipeline (deduplicated)
    2. Research company websites (tech stack, hiring signals, pain signals)
    3. Score prospects (fit evaluation based on research intel)
    4. Enrich via Apollo/Hunter (find emails)
    5. Draft personalized emails (AI-generated, score >= threshold)
    6. Optionally push ready leads to Instantly campaign
    7. Send Telegram summary

    Args:
        csv_path: Path to Sales Navigator CSV export
        campaign: Campaign tag (default: sales-nav)
        source: Source tag (default: sales_navigator)
        score_default: Default fit score for imports
        score_threshold: Min score for email drafting (default: 8)
        push_campaign_id: Instantly campaign UUID (optional — skip push if None)

    Returns:
        dict: Full import pipeline summary
    """
    log.info("=== SALES NAV IMPORT START ===")
    results = {"timestamp": datetime.now().isoformat(), "mode": "import"}

    # Step 1: Import CSV
    log.info(f"Step 1: Importing {csv_path}...")
    from modules.csv_importer import import_sales_nav_csv
    import_result = import_sales_nav_csv(
        csv_path=csv_path,
        campaign=campaign,
        source=source,
        score_default=score_default,
    )
    results["import"] = import_result
    added = import_result.get("added", 0)
    log.info(f"  Imported: {added} new prospects, {import_result.get('skipped_duplicate', 0)} dupes skipped")

    if added == 0:
        log.info("No new prospects to process. Done.")
        results["status"] = "no_new_prospects"
        return results

    # Step 2: Research company websites (tech stack, hiring, pain signals, contacts)
    log.info("Step 2: Researching company websites...")
    research_result = _run_research(stage="discovered")
    researched_count = research_result.get("researched", 0)
    skipped_no_url = sum(
        1 for r in research_result.get("results", [])
        if r.get("status") == "skipped"
    )
    results["research"] = {
        "researched": researched_count,
        "skipped_no_url": skipped_no_url,
    }
    log.info(
        f"  Researched: {researched_count} companies "
        f"(skipped {skipped_no_url} with no company URL)"
    )

    # Step 3: Score prospects (fit evaluation based on research intel)
    log.info("Step 3: Scoring prospects...")
    from modules.scorer import batch_score
    score_result = batch_score(stage="researched")
    results["scoring"] = score_result
    log.info(f"  Scored: {score_result.get('scored', 0)} prospects")

    # Step 4: Enrich via Apollo/Hunter (find emails)
    log.info("Step 4: Enriching prospects (Apollo/Hunter)...")
    from modules.enrichment import batch_enrich
    enrich_result = batch_enrich(stage="researched", score_min=0)
    results["enrichment"] = {
        "enriched": enrich_result.get("enriched", 0),
        "emails_found": enrich_result.get("emails_found", 0),
        "credits_used": enrich_result.get("credits_used", 0),
        "provider": enrich_result.get("provider", "none"),
    }
    log.info(
        f"  Enriched: {enrich_result.get('enriched', 0)}, "
        f"Emails found: {enrich_result.get('emails_found', 0)}, "
        f"Credits: {enrich_result.get('credits_used', 0)}"
    )

    # Step 5: Draft personalized emails for high-scoring prospects with emails
    log.info(f"Step 5: Drafting emails (score >= {score_threshold})...")
    draft_result = _run_drafting(stage="researched", score_min=score_threshold)
    results["drafting"] = {
        "drafted": draft_result.get("drafted", 0),
        "ai_generated": draft_result.get("ai_generated", 0),
        "template_used": draft_result.get("template_used", 0),
    }
    log.info(f"  Drafted: {draft_result.get('drafted', 0)} emails")

    # Step 6: Push to Instantly (optional)
    if push_campaign_id:
        log.info(f"Step 6: Pushing to Instantly campaign {push_campaign_id}...")
        from modules.instantly import push_leads
        push_result = push_leads(campaign_id=push_campaign_id, stage="ready_to_send")
        results["push"] = {
            "pushed": push_result.get("pushed", 0),
            "skipped": push_result.get("skipped", 0),
            "errors": push_result.get("errors", 0),
        }
        log.info(f"  Pushed: {push_result.get('pushed', 0)}, Errors: {push_result.get('errors', 0)}")
    else:
        results["push"] = {"skipped": True, "reason": "No campaign ID provided. Use --push-to to push."}
        log.info("Step 6: Skipped push (no --push-to specified)")

    # Step 7: Telegram notification
    log.info("Step 7: Sending notification...")
    try:
        from modules.notifier import send_notification
        msg = (
            f"Sales Nav Import — {datetime.now().strftime('%Y-%m-%d')}\n"
            f"CSV: {import_result.get('file', 'unknown')}\n"
            f"Imported: {added} new | {import_result.get('skipped_duplicate', 0)} dupes\n"
            f"Researched: {results['research']['researched']} companies\n"
            f"Enriched: {results['enrichment']['emails_found']} emails found\n"
            f"Drafted: {results['drafting']['drafted']} emails\n"
        )
        if push_campaign_id:
            msg += f"Pushed: {results['push'].get('pushed', 0)} to Instantly"
        else:
            msg += "Push: skipped (manual)"
        notif = send_notification(msg)
        results["notification"] = notif
    except Exception as e:
        log.warning(f"Notification failed: {e}")
        results["notification"] = {"status": "error", "message": str(e)}

    log.info("=== SALES NAV IMPORT COMPLETE ===")
    return results


# ──────────────────────────────────────────────────────────────────────
# VAYNE IMPORT — Sales Nav URL → scrape → full pipeline
# ──────────────────────────────────────────────────────────────────────


def run_vayne_import(sales_nav_url, name=None, limit=None, campaign=None,
                     score_threshold=8, push_campaign_id=None, timeout=600):
    """Full pipeline from a Sales Navigator URL via Vayne API.

    Replaces the manual CSV export step. Same pipeline as run_import but
    the CSV is scraped automatically from LinkedIn via Vayne.

    Steps:
    1. Vayne: validate URL → create order → wait → download CSV → import
    2. Research company websites
    3. Score prospects
    4. Enrich via Apollo/Hunter (find emails)
    5. Draft personalized emails (score >= threshold)
    6. Optionally push to Instantly
    7. Telegram notification

    Args:
        sales_nav_url: LinkedIn Sales Navigator search URL
        name: Vayne order name
        limit: Max profiles to scrape
        campaign: Campaign tag
        score_threshold: Min score for drafting (default: 8)
        push_campaign_id: Instantly campaign UUID (optional)
        timeout: Max seconds to wait for Vayne scraping

    Returns:
        dict: Full pipeline summary
    """
    log.info("=== VAYNE IMPORT START ===")
    results = {"timestamp": datetime.now().isoformat(), "mode": "vayne_import"}

    if not campaign:
        campaign = f"vayne-{datetime.now().strftime('%Y-%m-%d')}"

    # Step 1: Vayne scrape + import
    log.info(f"Step 1: Vayne scrape → import ({sales_nav_url[:80]}...)")
    from modules.vayne import scrape_and_import
    vayne_result = scrape_and_import(
        sales_nav_url=sales_nav_url,
        name=name,
        limit=limit,
        campaign=campaign,
        timeout=timeout,
    )
    results["vayne"] = vayne_result

    if vayne_result.get("status") != "imported":
        log.error(f"  Vayne scrape failed: {vayne_result.get('message', 'unknown error')}")
        results["status"] = "vayne_failed"
        return results

    import_data = vayne_result.get("import", {})
    added = import_data.get("added", 0)
    log.info(
        f"  Imported: {added} new prospects, "
        f"{import_data.get('skipped_duplicate', 0)} dupes skipped"
    )

    if added == 0:
        log.info("No new prospects to process. Done.")
        results["status"] = "no_new_prospects"
        return results

    # Step 2: Research company websites
    log.info("Step 2: Researching company websites...")
    research_result = _run_research(stage="discovered")
    researched_count = research_result.get("researched", 0)
    results["research"] = {"researched": researched_count}
    log.info(f"  Researched: {researched_count} companies")

    # Step 3: Score prospects
    log.info("Step 3: Scoring prospects...")
    from modules.scorer import batch_score
    score_result = batch_score(stage="researched")
    results["scoring"] = score_result
    log.info(f"  Scored: {score_result.get('scored', 0)} prospects")

    # Step 4: Enrich via Apollo/Hunter
    log.info("Step 4: Enriching prospects (Apollo/Hunter)...")
    from modules.enrichment import batch_enrich
    enrich_result = batch_enrich(stage="researched", score_min=0)
    results["enrichment"] = {
        "enriched": enrich_result.get("enriched", 0),
        "emails_found": enrich_result.get("emails_found", 0),
        "credits_used": enrich_result.get("credits_used", 0),
        "provider": enrich_result.get("provider", "none"),
    }
    log.info(
        f"  Enriched: {enrich_result.get('enriched', 0)}, "
        f"Emails found: {enrich_result.get('emails_found', 0)}"
    )

    # Step 5: Draft personalized emails
    log.info(f"Step 5: Drafting emails (score >= {score_threshold})...")
    draft_result = _run_drafting(stage="researched", score_min=score_threshold)
    results["drafting"] = {
        "drafted": draft_result.get("drafted", 0),
    }
    log.info(f"  Drafted: {draft_result.get('drafted', 0)} emails")

    # Step 6: Push to Instantly (optional)
    if push_campaign_id:
        log.info(f"Step 6: Pushing to Instantly campaign {push_campaign_id}...")
        from modules.instantly import push_leads
        push_result = push_leads(campaign_id=push_campaign_id, stage="ready_to_send")
        results["push"] = {
            "pushed": push_result.get("pushed", 0),
            "skipped": push_result.get("skipped", 0),
            "errors": push_result.get("errors", 0),
        }
        log.info(f"  Pushed: {push_result.get('pushed', 0)}")
    else:
        results["push"] = {"skipped": True, "reason": "No --push-to specified"}
        log.info("Step 6: Skipped push (no --push-to)")

    # Step 7: Telegram notification
    log.info("Step 7: Sending notification...")
    try:
        from modules.notifier import send_notification
        url_check = vayne_result.get("url_check", {})
        msg = (
            f"*Vayne Import — {datetime.now().strftime('%Y-%m-%d')}*\n\n"
            f"URL: {url_check.get('total', '?')} leads found\n"
            f"Imported: {added} new | {import_data.get('skipped_duplicate', 0)} dupes\n"
            f"Researched: {results['research']['researched']} companies\n"
            f"Enriched: {results['enrichment']['emails_found']} emails found\n"
            f"Drafted: {results['drafting']['drafted']} emails\n"
        )
        if push_campaign_id:
            msg += f"Pushed: {results['push'].get('pushed', 0)} to Instantly"
        else:
            msg += "Push: skipped (manual)"
        send_notification(msg)
    except Exception as e:
        log.warning(f"Notification failed: {e}")

    log.info("=== VAYNE IMPORT COMPLETE ===")
    results["status"] = "complete"
    return results


# ──────────────────────────────────────────────────────────────────────
# DAILY FILL — Hunt leads + push to Instantly
# ──────────────────────────────────────────────────────────────────────

# Default Instantly campaign ID (Convertra Cold v1)
DEFAULT_INSTANTLY_CAMPAIGN = "8b466981-54d8-4487-ade3-b27ddab16a4e"


def run_fill(target=25, campaign_id=None, niches=None, max_rounds=50,
             score_threshold=5, include_jobs=True):
    """Daily lead fill: discover leads, draft emails, push to Instantly.

    Designed to run on cron at 7am AEST (before 9am sending window).
    Instantly handles warmup and send pacing — we just keep it topped up.

    The fill command is persistent — it uses up to 50 rounds of discovery
    with aggressive sub-niche expansion to hit the target. It won't stop
    at 0 just because the first few niches are exhausted.

    Steps:
    1. Check how many leads are already ready_to_send (skip hunt if enough)
    2. Run prospect_hunt to discover + research + score + enrich + email-find + draft
    3. Push all ready_to_send leads to the active Instantly campaign
    4. Send Telegram summary with full enrichment stats

    Args:
        target: Number of leads to prepare (default 25, middle of 20-30 range).
        campaign_id: Instantly campaign UUID. Defaults to Convertra Cold v1.
        niches: List of niche keywords. Defaults to all 6 built-in niches.
        max_rounds: Max discovery rounds (default 25 — persistent).
        score_threshold: Minimum fit_score for leads (default 5 = warm+hot).
        include_jobs: Whether to include job listing searches.

    Returns:
        dict: Full fill summary with hunt results, enrichment stats, and push results.
    """
    log.info("=== DAILY FILL START ===")
    cid = campaign_id or DEFAULT_INSTANTLY_CAMPAIGN
    campaign_tag = f"fill-{datetime.now().strftime('%Y-%m-%d')}"

    # Check enrichment capability (Apollo primary, Hunter fallback)
    apollo_configured = bool(os.environ.get("APOLLO_API_KEY", ""))
    hunter_configured = bool(os.environ.get("HUNTER_API_KEY", ""))
    enrichment_provider = "apollo" if apollo_configured else ("hunter" if hunter_configured else "none")
    log.info(f"  Enrichment: {enrichment_provider}" + (
        "" if enrichment_provider != "none" else " (NOT configured — enrichment will be skipped)"
    ))

    results = {
        "timestamp": datetime.now().isoformat(),
        "mode": "fill",
        "target": target,
        "campaign_id": cid,
        "enrichment_provider": enrichment_provider,
    }

    # Step 1: Check existing ready_to_send pipeline
    from modules.pipeline import list_prospects as _list
    existing = _list(stage="ready_to_send", score_min=score_threshold)
    existing_count = existing.get("total", 0)
    log.info(f"Step 1: {existing_count} leads already in ready_to_send (target: {target})")

    needed = max(0, target - existing_count)
    results["existing_ready"] = existing_count
    results["needed"] = needed

    # Step 2: Run prospect hunt if we need more leads
    hunt_result = None
    if needed > 0:
        log.info(f"Step 2: Hunting for {needed} more leads (max {max_rounds} rounds)...")
        hunt_result = run_prospect_hunt(
            target=needed,
            niches=niches,
            include_jobs=include_jobs,
            max_rounds=max_rounds,
            score_threshold=score_threshold,
            email_score_min=score_threshold,
            campaign_name=campaign_tag,
        )
        results["hunt"] = {
            "rounds": hunt_result.get("rounds_completed", 0),
            "discovered": hunt_result.get("totals", {}).get("total_discovered", 0),
            "niches_exhausted": hunt_result.get("totals", {}).get("niches_exhausted", 0),
            "duration": hunt_result.get("duration", ""),
            "target_met": hunt_result.get("target_met", False),
            "hot_ready": hunt_result.get("final_counts", {}).get("hot_ready", 0),
        }
    else:
        log.info(f"Step 2: Skipped — already have {existing_count} leads ready.")
        results["hunt"] = {"skipped": True, "reason": "enough leads in pipeline"}

    # Step 3: Push leads to Instantly (split 50/50 if experiment active)
    log.info("Step 3: Pushing leads to Instantly...")
    from modules.instantly import push_leads
    from modules.optimizer import load_experiments as _load_exp, save_experiments as _save_exp

    exp_data = _load_exp()
    current_exp = exp_data.get("current_experiment")

    if current_exp and current_exp.get("status") == "running":
        # Experiment active — split 50/50 between baseline and challenger
        log.info("  Experiment active: splitting leads 50/50")
        baseline_cid = current_exp["baseline"]["campaign_id"]
        challenger_cid = current_exp["challenger"]["campaign_id"]
        baseline_copy = current_exp["baseline"]["copy"]
        challenger_copy = current_exp["challenger"]["copy"]

        # Use same score_min as normal path to avoid selection bias
        ready_prospects = _list(stage="ready_to_send", score_min=score_threshold)
        prospect_list = ready_prospects.get("prospects", [])

        # Deduplication: skip prospects already pushed to this experiment
        already_pushed = set(current_exp.get("pushed_prospect_ids", []))
        prospect_list = [p for p in prospect_list if p.get("id") not in already_pushed]

        random.shuffle(prospect_list)  # Randomize to avoid ordering bias
        mid = len(prospect_list) // 2

        baseline_ids = [p["id"] for p in prospect_list[:mid]]
        challenger_ids = [p["id"] for p in prospect_list[mid:]]

        push_result_b = push_leads(
            baseline_cid, prospect_ids=baseline_ids, copy_override=baseline_copy,
        )
        push_result_c = push_leads(
            challenger_cid, prospect_ids=challenger_ids, copy_override=challenger_copy,
        )

        # Track only SUCCESSFULLY pushed prospect IDs for dedup
        # (failed/skipped leads should remain eligible for future fills)
        successful_b = [l["id"] for l in (push_result_b.get("leads") or [])]
        successful_c = [l["id"] for l in (push_result_c.get("leads") or [])]
        current_exp.setdefault("pushed_prospect_ids", []).extend(successful_b + successful_c)
        _save_exp(exp_data)

        total_pushed = push_result_b.get("pushed", 0) + push_result_c.get("pushed", 0)
        total_skipped = push_result_b.get("skipped", 0) + push_result_c.get("skipped", 0)
        total_errors = push_result_b.get("errors", 0) + push_result_c.get("errors", 0)

        results["push"] = {
            "pushed": total_pushed,
            "skipped": total_skipped,
            "errors": total_errors,
            "split": True,
            "baseline_pushed": push_result_b.get("pushed", 0),
            "challenger_pushed": push_result_c.get("pushed", 0),
        }
        log.info(
            f"  Baseline: {push_result_b.get('pushed', 0)}, "
            f"Challenger: {push_result_c.get('pushed', 0)}, "
            f"Skipped: {total_skipped}, Errors: {total_errors}"
        )
    else:
        # No experiment — push all to default campaign
        push_result = push_leads(campaign_id=cid, stage="ready_to_send", limit=target + 10)
        results["push"] = {
            "pushed": push_result.get("pushed", 0),
            "skipped": push_result.get("skipped", 0),
            "errors": push_result.get("errors", 0),
        }
        log.info(
            f"  Pushed: {push_result.get('pushed', 0)}, "
            f"Skipped: {push_result.get('skipped', 0)}, "
            f"Errors: {push_result.get('errors', 0)}"
        )

    # Step 4: Telegram notification with full stats
    log.info("Step 4: Sending Telegram notification...")
    from modules.notifier import send_notification

    hunted = results.get("hunt", {}).get("discovered", 0)
    pushed = results["push"]["pushed"]
    errors = results["push"]["errors"]

    message = (
        f"*Daily Fill -- {datetime.now().strftime('%Y-%m-%d')}*\n\n"
        f"Pipeline: {existing_count} existing ready\n"
        f"Needed: {needed}\n"
    )

    if hunt_result:
        hunt_info = results["hunt"]
        message += (
            f"\n*Hunt:*\n"
            f"- {hunted} discovered\n"
            f"- {hunt_info['rounds']} rounds in {hunt_info['duration']}\n"
            f"- {hunt_info.get('niches_exhausted', 0)} niches exhausted\n"
            f"- {hunt_info.get('hot_ready', 0)} ready to send after enrichment\n"
            f"- Target {'MET' if hunt_info.get('target_met') else 'NOT MET'}\n"
        )

    push_info = results["push"]
    if push_info.get("split"):
        message += (
            f"\n*Instantly Push (A/B Split):*\n"
            f"- {push_info.get('baseline_pushed', 0)} to baseline campaign\n"
            f"- {push_info.get('challenger_pushed', 0)} to challenger campaign\n"
        )
    else:
        message += (
            f"\n*Instantly Push:*\n"
            f"- {pushed} leads pushed to campaign\n"
        )
    if errors:
        message += f"- {errors} errors\n"

    # Final pipeline count
    final_ready = _list(stage="ready_to_send", score_min=score_threshold).get("total", 0)
    message += f"\nRemaining in pipeline: {final_ready} ready_to_send"
    results["final_ready"] = final_ready

    notify_result = send_notification(message)
    results["notification"] = notify_result

    status = "TARGET MET" if pushed >= target else f"pushed {pushed}/{target}"
    log.info(f"=== DAILY FILL COMPLETE ({status}) ===")

    # Step 5: Run optimizer — evaluate experiment if thresholds met, deploy next round
    # Only runs when an experiment exists and is active. No-ops otherwise.
    if current_exp and current_exp.get("status") == "running":
        log.info("Step 5: Running optimizer after fill...")
        try:
            opt_result = run_optimize()
            opt_status = opt_result.get("status", "unknown")
            results["optimize"] = opt_result
            log.info(f"  Optimizer result: {opt_status}")
        except Exception as e:
            log.error(f"  Optimizer error (non-fatal): {e}")
            results["optimize"] = {"status": "error", "error": str(e)}

    return results


# ──────────────────────────────────────────────────────────────────────
# SELF-OPTIMIZING EMAIL COPY — Auto-Research Pattern
# ──────────────────────────────────────────────────────────────────────


def run_optimize(force_eval=False, dry_run=False, reset=False, from_best=False):
    """Self-optimizing email copy — Karpathy auto-research pattern for cold email.

    Called automatically at the end of each daily fill (after leads are pushed).
    Can also be run manually via `orchestrator.py optimize`.

    Most runs are no-ops — thresholds not met yet (250 sends + 48h floor).
    When thresholds ARE met: evaluate → promote winner → generate new challenger → deploy.

    Flow:
    0. Warmup guard: exit early if warmup week < 3
    1. Load current experiment
    1b. Recovery guard: resume if status == "evaluating"
    2. If no experiment (or --reset): bootstrap
    3. Fetch latest stats from Instantly
    4. Run safety check
    5. Check evaluation thresholds
    6. If ready: evaluate → promote → learnings → new round
    7. Telegram notification on completion
    """
    from modules.optimizer import (
        load_experiments, save_experiments, get_experiment_status,
        start_first_experiment, check_thresholds, run_safety_check,
        evaluate_experiment, promote_winner, deploy_new_round,
        kill_challenger, append_learnings, refresh_variant_classifications,
    )
    from modules.instantly import get_campaign_summary
    from modules.notifier import send_notification

    log.info("=== OPTIMIZE CHECK ===")

    # Step 0: Warmup guard
    config = load_config()
    current_week = config.get("warmup", {}).get("current_week", 5)
    if current_week < 3 and not reset and not force_eval:
        log.info(f"Warmup week {current_week} — experiments disabled until week 3+")
        return {"status": "warmup_guard", "current_week": current_week}

    # Step 1: Load experiment state
    data = load_experiments()
    experiment = data.get("current_experiment")

    # Step 1b: Recovery guard
    if experiment and experiment.get("status") == "evaluating" and not dry_run:
        log.info("Recovering experiment stuck in 'evaluating' status...")
        eval_result = evaluate_experiment(experiment)
        winner = eval_result["winner"]
        append_learnings(experiment, winner)
        promote_result = promote_winner(experiment, data)
        new_exp = deploy_new_round(data)
        _notify_experiment_complete(send_notification, experiment, eval_result, data)
        log.info("=== OPTIMIZE RECOVERY COMPLETE ===")
        return {"status": "recovered", "winner": winner, "new_round": new_exp["round"]}

    # Step 2: Bootstrap if needed
    if not experiment or reset:
        if dry_run:
            status = get_experiment_status()
            baseline_info = "(from best_ever)" if from_best else "(from templates.json)"
            log.info(f"DRY RUN: Would start experiment {baseline_info}")
            return {"status": "dry_run", "would_start": True, "baseline_source": baseline_info, **status}

        log.info("Starting new experiment..." + (" (from best_ever)" if from_best else ""))
        experiment = start_first_experiment(from_best=from_best)
        _notify_experiment_started(send_notification, experiment)
        log.info("=== OPTIMIZE BOOTSTRAP COMPLETE ===")
        return {"status": "started", "experiment": experiment["id"], "round": experiment["round"]}

    # Step 3: Fetch latest stats + classify replies
    for variant_key in ("baseline", "challenger"):
        variant = experiment[variant_key]
        cid = variant["campaign_id"]
        summary = get_campaign_summary(cid)
        if summary:
            variant["sends"] = summary["sent"]
            variant["replies_total"] = summary["replied"]
    # Classify replies so safety check has real data
    refresh_variant_classifications(experiment)
    save_experiments(data)

    if dry_run:
        status = get_experiment_status()
        threshold = check_thresholds(experiment)
        log.info(f"DRY RUN: threshold={threshold}")
        return {"status": "dry_run", "threshold": threshold, **status}

    # Step 4: Safety check (every heartbeat)
    kill_reason = run_safety_check(experiment)
    if kill_reason:
        kill_result = kill_challenger(experiment, data, kill_reason)
        _notify_safety_kill(send_notification, experiment, kill_reason)
        log.info("=== OPTIMIZE SAFETY KILL ===")
        return {"status": "killed", **kill_result}

    # Step 5: Check thresholds (--force-eval bypasses)
    if force_eval:
        threshold = "forced"
        log.info("--force-eval: bypassing threshold check")
    else:
        threshold = check_thresholds(experiment)
        if threshold == "not_ready":
            elapsed = get_experiment_status().get("elapsed_hours", 0)
            log.info(
                f"Not ready — B:{experiment['baseline']['sends']} sends, "
                f"C:{experiment['challenger']['sends']} sends, {elapsed:.0f}h elapsed"
            )
            return {"status": "not_ready", "experiment": experiment["id"]}

    # Step 6: Evaluate → promote → learnings → new round
    log.info(f"Threshold '{threshold}' met — evaluating...")
    eval_result = evaluate_experiment(experiment)
    winner = eval_result["winner"]

    append_learnings(experiment, winner)
    promote_result = promote_winner(experiment, data)
    new_exp = deploy_new_round(data)

    # Step 7: Telegram notification
    _notify_experiment_complete(send_notification, experiment, eval_result, data)

    log.info(f"=== OPTIMIZE COMPLETE — {winner.upper()} wins, round {new_exp['round']} deployed ===")
    return {
        "status": "completed",
        "winner": winner,
        "margin": eval_result["margin"],
        "confidence": eval_result["confidence"],
        "new_round": new_exp["round"],
    }


def _notify_experiment_started(send_notification, experiment):
    """Send Telegram notification when a new experiment starts."""
    msg = (
        f"*Experiment Round {experiment['round']} Started*\n\n"
        f"Hypothesis: \"{experiment['challenger'].get('hypothesis', 'N/A')}\"\n"
        f"Baseline subject: {experiment['baseline']['copy'].get('subject', '')}\n"
        f"Challenger subject: {experiment['challenger']['copy'].get('subject', '')}\n\n"
        f"Evaluating after 250 sends/variant + 48h floor."
    )
    try:
        send_notification(msg)
    except Exception as e:
        log.warning(f"Notification failed: {e}")


def _notify_experiment_complete(send_notification, experiment, eval_result, data):
    """Send Telegram notification when experiment completes."""
    p_val = eval_result.get("confidence", 1.0)
    sig = "significant" if p_val < 0.05 else "not significant"
    metrics = data.get("aggregate_metrics", {})

    msg = (
        f"*Experiment Round {experiment['round']} Complete -- "
        f"{datetime.now().strftime('%Y-%m-%d')}*\n\n"
        f"Baseline: {experiment['baseline'].get('positive_rate', 0)}% positive "
        f"({experiment['baseline'].get('sends', 0)} sends)\n"
        f"Challenger: {experiment['challenger'].get('positive_rate', 0)}% positive "
        f"({experiment['challenger'].get('sends', 0)} sends)\n\n"
        f"Winner: *{eval_result['winner'].upper()}* ({eval_result['margin']:+.2f}%)\n"
        f"Confidence: p={p_val:.4f} ({sig})\n"
        f"Hypothesis: \"{experiment['challenger'].get('hypothesis', '')}\"\n\n"
        f"Cumulative: {metrics.get('total_experiments', 0)} experiments, "
        f"best rate: {metrics.get('best_positive_rate', 0)}%"
    )
    try:
        send_notification(msg)
    except Exception as e:
        log.warning(f"Notification failed: {e}")


def _notify_safety_kill(send_notification, experiment, reason):
    """Send Telegram notification when safety guard kills a challenger."""
    msg = (
        f"*SAFETY KILL -- Round {experiment['round']}*\n\n"
        f"Challenger paused: {reason['reason']}\n"
        f"{reason.get('negative_ratio', 0):.1%} negative / "
        f"{reason.get('unsubscribe_rate', 0):.1%} unsub\n"
        f"Baseline continues as sole campaign."
    )
    try:
        send_notification(msg)
    except Exception as e:
        log.warning(f"Notification failed: {e}")


# ──────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ──────────────────────────────────────────────────────────────────────

def main():
    """CLI entry point for orchestrator."""
    load_env()

    parser = argparse.ArgumentParser(
        prog="orchestrator",
        description="Convertra Leads Orchestrator — autonomous pipeline automation",
    )
    sub = parser.add_subparsers(dest="mode")

    sub.add_parser("daily", help="Run daily routine")
    sub.add_parser("weekly", help="Run weekly review")

    camp = sub.add_parser("campaign", help="Run full campaign pipeline")
    camp.add_argument("--niches", required=True, help="Comma-separated niches")
    camp.add_argument("--include-jobs", action="store_true", dest="include_jobs")
    camp.add_argument("--campaign", type=str, dest="campaign_name")

    prospect = sub.add_parser("prospect", help="Hunt for N hot leads across niches")
    prospect.add_argument("--target", type=int, default=20, help="Target hot leads (default: 20)")
    prospect.add_argument("--niches", type=str, help="Comma-separated niches (default: all)")
    prospect.add_argument("--include-jobs", action="store_true", default=True, dest="include_jobs")
    prospect.add_argument("--no-jobs", action="store_false", dest="include_jobs")
    prospect.add_argument("--max-rounds", type=int, default=10, dest="max_rounds", help="Max discovery rounds (default: 10)")
    prospect.add_argument("--score-threshold", type=int, default=8, dest="score_threshold", help="Hot lead score (default: 8)")
    prospect.add_argument("--campaign", type=str, dest="campaign_name")

    fill = sub.add_parser("fill", help="Daily fill: hunt leads + push to Instantly (multi-source)")
    fill.add_argument("--target", type=int, default=25, help="Leads to prepare (default: 25)")
    fill.add_argument("--campaign-id", type=str, dest="campaign_id", help="Instantly campaign UUID")
    fill.add_argument("--niches", type=str, help="Comma-separated niches (default: all)")
    fill.add_argument("--max-rounds", type=int, default=25, dest="max_rounds", help="Max discovery rounds (default: 25)")
    fill.add_argument("--score-threshold", type=int, default=5, dest="score_threshold", help="Min fit score (default: 5 = warm+)")
    fill.add_argument("--include-jobs", action="store_true", default=True, dest="fill_include_jobs")
    fill.add_argument("--no-jobs", action="store_false", dest="fill_include_jobs")
    fill.add_argument("--verified-only", action="store_true", dest="verified_only",
                      help="Only push leads with verified emails (Apollo or Hunter)")

    opt = sub.add_parser("optimize", help="Self-optimizing email copy A/B test loop")
    opt.add_argument("--force-eval", action="store_true", dest="force_eval",
                     help="Force evaluation regardless of thresholds")
    opt.add_argument("--dry-run", action="store_true", dest="dry_run",
                     help="Check status without taking action (no GPT calls, no campaigns)")
    opt.add_argument("--reset", action="store_true",
                     help="Start fresh: create round 1 experiment from templates")
    opt.add_argument("--from-best", action="store_true", dest="from_best",
                     help="With --reset: use best_ever copy as baseline instead of templates")

    imp = sub.add_parser("import", help="Import Sales Nav CSV → enrich → score → draft → push")
    imp.add_argument("--file", required=True, dest="csv_file", help="Path to Sales Navigator CSV")
    imp.add_argument("--campaign", type=str, default="sales-nav", dest="import_campaign")
    imp.add_argument("--score-threshold", type=int, default=8, dest="import_score_threshold",
                     help="Min fit score for email drafting (default: 8)")
    imp.add_argument("--push-to", type=str, dest="import_push_to",
                     help="Instantly campaign UUID to auto-push ready leads")

    args = parser.parse_args()

    if args.mode == "daily":
        result = run_daily()
    elif args.mode == "weekly":
        result = run_weekly()
    elif args.mode == "campaign":
        niches = [n.strip() for n in args.niches.split(",")]
        result = run_campaign(niches, include_jobs=args.include_jobs, campaign_name=args.campaign_name)
    elif args.mode == "prospect":
        niches = [n.strip() for n in args.niches.split(",")] if args.niches else None
        result = run_prospect_hunt(
            target=args.target,
            niches=niches,
            include_jobs=args.include_jobs,
            max_rounds=args.max_rounds,
            score_threshold=args.score_threshold,
            campaign_name=args.campaign_name,
        )
    elif args.mode == "fill":
        niches = [n.strip() for n in args.niches.split(",")] if args.niches else None
        result = run_fill(
            target=args.target,
            campaign_id=args.campaign_id,
            niches=niches,
            max_rounds=args.max_rounds,
            score_threshold=args.score_threshold,
            include_jobs=args.fill_include_jobs,
        )
    elif args.mode == "optimize":
        result = run_optimize(
            force_eval=args.force_eval,
            dry_run=args.dry_run,
            reset=args.reset,
            from_best=args.from_best,
        )
    elif args.mode == "import":
        result = run_import(
            csv_path=args.csv_file,
            campaign=args.import_campaign or "sales-nav",
            source="sales_navigator",
            score_threshold=args.import_score_threshold,
            push_campaign_id=args.import_push_to,
        )
    else:
        parser.print_help()
        sys.exit(1)

    # Print JSON result to stdout (matches CLI convention)
    print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    main()
