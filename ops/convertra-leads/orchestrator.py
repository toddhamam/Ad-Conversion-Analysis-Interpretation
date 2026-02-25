#!/usr/bin/env python3
"""Convertra Leads Orchestrator — cron-driven pipeline automation.

Replaces OpenClaw bot. Four modes:
  - daily: inbox -> followups -> send -> report -> notify
  - weekly: health check + red flag detection
  - campaign: discover -> research -> score -> email-find -> draft -> notify
  - prospect: loop discovery until N hot leads, then batch email-find + draft

Usage:
  python3 orchestrator.py daily
  python3 orchestrator.py weekly
  python3 orchestrator.py campaign --niches "supplements,skincare" [--include-jobs] [--campaign "feb-2026"]
  python3 orchestrator.py prospect --target 20 [--niches "supplements,skincare"] [--max-rounds 10]
"""

import argparse
import json
import logging
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
        from modules.research import batch_research
        research_result = batch_research(stage="discovered")
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
        log.info("Phase 4: Hunter enrichment + email finding...")

        # Step 4a: Hunter.io enrichment (also finds emails)
        hunter_stats = {"enriched": 0, "emails_found": 0, "credits_used": 0}
        api_key = os.environ.get("HUNTER_API_KEY", "")
        if api_key:
            try:
                from modules.enrichment import batch_enrich
                hunter_stats = batch_enrich(stage="researched", score_min=5, max_credits=25)
                log.info(
                    f"  Hunter: {hunter_stats.get('enriched', 0)} enriched, "
                    f"{hunter_stats.get('emails_found', 0)} emails found, "
                    f"{hunter_stats.get('credits_used', 0)} credits used"
                )
            except Exception as e:
                log.error(f"  Hunter enrichment failed: {e}")
        else:
            log.info("  Hunter not configured — skipping enrichment.")

        # Step 4b: Pattern-guess fallback for prospects Hunter missed
        from modules.email_finder import batch_find_emails
        email_result = batch_find_emails(stage="researched", score_min=5)
        results["enrichment"] = {
            "enriched": hunter_stats.get("enriched", 0),
            "emails_found": hunter_stats.get("emails_found", 0),
            "credits_used": hunter_stats.get("credits_used", 0),
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
        log.info("Phase 5: AI email drafting (GPT-5.2)...")
        from modules.drafter import batch_draft
        draft_result = batch_draft(stage="researched", score_min=5)
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
                classification = _classify_reply(body)
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


def _run_discovery(niches, include_jobs, campaign_name):
    """Phase 1: Multi-source discovery.

    Returns:
        dict with keys: ddg_found, adlib_found, jobs_found, total_added
    """
    from modules.discovery import batch_discover
    from modules.scraper import search_ad_library
    from modules.pipeline import add_prospect

    stats = {"ddg_found": 0, "adlib_found": 0, "jobs_found": 0, "total_added": 0}

    # DuckDuckGo discovery
    try:
        ddg_result = batch_discover(niches=niches, limit_per_niche=20)
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
                # Try to avoid duplicates by checking existing pipeline
                add_prospect(prospect_data)
                stats["adlib_found"] += 1
                stats["total_added"] += 1
        except Exception as e:
            log.error(f"  Ad Library scrape failed for '{niche}': {e}")

    # Job listing discovery (optional)
    if include_jobs:
        try:
            from modules.job_scraper import search_job_listings, batch_add_job_prospects
            job_result = search_job_listings(limit=30)
            added = batch_add_job_prospects(job_result.get("results", []), campaign=campaign_name)
            stats["jobs_found"] = added.get("added", 0)
            stats["total_added"] += stats["jobs_found"]
        except Exception as e:
            log.error(f"  Job listing discovery failed: {e}")

    return stats


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

    # ── Discovery loop ──
    for round_num in range(1, max_rounds + 1):
        # Check if target already met
        hot_scored = _count_hot_scored(score_threshold)
        if hot_scored >= target:
            log.info(f"  Target met! {hot_scored}/{target} hot leads scored.")
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
            niches=[source] if source_type != "jobs" else [],
            include_jobs=(source_type == "jobs"),
            campaign_name=campaign_name,
        )
        discovered = discovery["total_added"]
        log.info(f"  Discovered: {discovered} new prospects")

        if discovered == 0:
            exhausted_niches.add(source)
            log.info(f"  Niche '{source}' exhausted (0 new) — will skip in future rounds.")
        else:
            # Phase 2: Research
            log.info(f"  Researching...")
            from modules.research import batch_research
            research_result = batch_research(stage="discovered")
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

        if source_type == "jobs":
            jobs_used = True

        # Track round stats
        hot_scored = _count_hot_scored(score_threshold)
        round_info = {
            "round": round_num,
            "source": source,
            "source_type": source_type,
            "discovered": discovered,
            "hot_scored_total": hot_scored,
            "target": target,
        }
        round_results.append(round_info)

        # Telegram progress update
        from modules.notifier import send_notification
        progress_msg = (
            f"*Prospect Hunt -- Round {round_num}/{max_rounds}*\n"
            f"Source: {source} ({source_type})\n"
            f"Discovered: {discovered} new\n"
            f"Hot scored: {hot_scored}/{target} target\n"
            f"Remaining: {max(0, target - hot_scored)} more needed"
        )
        send_notification(progress_msg)

    # ── Final batch: enrichment + email finding + drafting for all warm+ leads ──
    log.info("=== FINAL BATCH: Enrichment + Email finding + AI drafting ===")

    # Step 1: Hunter.io enrichment
    hunter_stats = {"enriched": 0, "emails_found": 0, "credits_used": 0}
    api_key = os.environ.get("HUNTER_API_KEY", "")
    if api_key:
        try:
            from modules.enrichment import batch_enrich
            hunter_stats = batch_enrich(stage="researched", score_min=email_score_min, max_credits=25)
            log.info(
                f"  Hunter: {hunter_stats.get('enriched', 0)} enriched, "
                f"{hunter_stats.get('emails_found', 0)} emails, "
                f"{hunter_stats.get('credits_used', 0)} credits"
            )
        except Exception as e:
            log.error(f"  Hunter enrichment failed: {e}")
    else:
        log.info("  Hunter not configured — skipping enrichment.")

    # Step 2: Fallback email finding
    from modules.email_finder import batch_find_emails
    from modules.drafter import batch_draft

    log.info("  Finding remaining emails (score >= {})...".format(email_score_min))
    email_result = batch_find_emails(stage="researched", score_min=email_score_min)
    log.info(
        f"  Emails found: {email_result.get('found', 0)}, "
        f"Not found: {email_result.get('not_found', 0)}"
    )

    log.info("  Drafting emails (GPT-5.2)...")
    draft_result = batch_draft(stage="researched", score_min=email_score_min)
    log.info(
        f"  Drafted: {draft_result.get('drafted', 0)} "
        f"(AI: {draft_result.get('drafted', 0) - draft_result.get('fallback', 0)}, "
        f"template: {draft_result.get('fallback', 0)})"
    )

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
        "enrichment": {
            "enriched": hunter_stats.get("enriched", 0),
            "emails_found": hunter_stats.get("emails_found", 0),
            "credits_used": hunter_stats.get("credits_used", 0),
        },
        "email_finding": {
            "found": email_result.get("found", 0),
            "not_found": email_result.get("not_found", 0),
        },
        "drafting": {
            "drafted": draft_result.get("drafted", 0),
            "fallback": draft_result.get("fallback", 0),
            "errors": draft_result.get("errors", 0),
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
    """Count all prospects with fit_score >= threshold (any stage after scoring)."""
    from modules.pipeline import list_prospects
    result = list_prospects(score_min=threshold)
    return result.get("total", 0)


def _count_hot_ready(threshold):
    """Count prospects with fit_score >= threshold AND stage == ready_to_send."""
    from modules.pipeline import list_prospects
    result = list_prospects(stage="ready_to_send", score_min=threshold)
    return result.get("total", 0)


def _pick_next_source(niche_queue, exhausted, round_num, include_jobs, jobs_used):
    """Pick the next discovery source, rotating through niches.

    Returns:
        tuple: (source_name, source_type) or (None, None) if all exhausted.
    """
    # Every 3rd round, use job listings if available
    if include_jobs and not jobs_used and round_num % 3 == 0:
        return ("job_listings", "jobs")

    # Try niches from queue
    tried = 0
    while niche_queue and tried < len(niche_queue):
        niche = niche_queue.popleft()
        if niche not in exhausted:
            niche_queue.append(niche)  # Re-add to end for rotation
            return (niche, "niche")
        tried += 1

    # All niches exhausted, try jobs as fallback
    if include_jobs and not jobs_used:
        return ("job_listings", "jobs")

    return (None, None)


def _expand_keywords(all_niches, exhausted):
    """Generate expanded keyword variants when standard niches are exhausted.

    Returns:
        list of str: new pseudo-niche keywords to try.
    """
    modifiers = ["2026", "startup", "agency", "new brand", "emerging", "fast growing"]
    expanded = []
    for niche in all_niches:
        for mod in modifiers:
            key = f"{niche} {mod}"
            if key not in exhausted:
                expanded.append(key)
                if len(expanded) >= 6:
                    return expanded
    return expanded


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
    else:
        parser.print_help()
        sys.exit(1)

    # Print JSON result to stdout (matches CLI convention)
    print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    main()
