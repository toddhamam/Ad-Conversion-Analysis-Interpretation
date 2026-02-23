#!/usr/bin/env python3
"""Convertra Leads Orchestrator — cron-driven pipeline automation.

Replaces OpenClaw bot. Three modes:
  - daily: inbox -> followups -> send -> report -> notify
  - weekly: health check + red flag detection
  - campaign: discover -> research -> score -> email-find -> draft -> notify

Usage:
  python3 orchestrator.py daily
  python3 orchestrator.py weekly
  python3 orchestrator.py campaign --niches "supplements,skincare" [--include-jobs] [--campaign "feb-2026"]
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

        # Phase 4: Find emails
        log.info("Phase 4: Finding emails...")
        from modules.email_finder import batch_find_emails
        email_result = batch_find_emails(stage="researched", score_min=8)
        results["email_finding"] = {
            "found": email_result.get("found", 0),
            "not_found": email_result.get("not_found", 0),
        }
        log.info(
            f"  Found: {email_result.get('found', 0)}, "
            f"Not found: {email_result.get('not_found', 0)}"
        )

        # Phase 5: AI Draft emails (ONLY AI step)
        log.info("Phase 5: AI email drafting (GPT-5.2)...")
        from modules.drafter import batch_draft
        draft_result = batch_draft(stage="researched", score_min=8)
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

    # Process all follow-up types in order: followup_1, followup_2, breakup
    for followup_type in ["followup_1", "followup_2", "breakup"]:
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
    """Fill a follow-up template with prospect data.

    Args:
        template_key: "followup_1" | "followup_2" | "breakup"
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

    # Build context-aware placeholders
    company_intel = prospect.get("company_intel", {})
    ad_count = company_intel.get("active_ad_count", 0)

    subs = {
        "first_name": first_name,
        "company": company,
        "sender_first_name": sender_name,
        "different_angle": (
            f"I actually put together a quick case study on how brands like {company} "
            f"are solving creative fatigue — thought you might find it useful."
        ),
        "value_add_insight": (
            f"Saw an interesting trend: DTC brands scaling past $50K/mo in ad spend are "
            f"hitting a creative testing ceiling. The ones breaking through are automating "
            f"their test-and-iterate cycle."
        ),
        "connection_to_problem": (
            f"Given {company}'s growth trajectory, curious if this resonates."
        ),
    }

    # Customize based on what we know
    if ad_count and ad_count > 30:
        subs["different_angle"] = (
            f"I noticed {company} is running {ad_count}+ creatives — that's serious volume. "
            f"Curious what your creative refresh cadence looks like."
        )

    body = template.get("body", "")
    # For follow-ups, use RE: original subject
    original_subject = ""
    for interaction in prospect.get("interactions", []):
        if interaction.get("sequence_step") == 1 and interaction.get("subject"):
            original_subject = interaction["subject"]
            break

    subject = f"RE: {original_subject}" if original_subject else f"RE: {company}'s ad creative"

    # Fill placeholders
    for key, value in subs.items():
        body = body.replace(f"{{{key}}}", value)

    # Append signature if not present
    signature = config.get("email", {}).get("signature", "")
    if signature and "STOP" not in body:
        body += signature

    # If template was empty, use a minimal fallback
    if not body:
        if template_key == "followup_1":
            body = (
                f"Hey {first_name},\n\n"
                f"Just floating this back up — I know how buried inboxes get.\n\n"
                f"{subs['different_angle']}\n\n"
                f"Worth a quick chat?\n\n"
                f"{sender_name}"
            )
        elif template_key == "followup_2":
            body = (
                f"Hey {first_name},\n\n"
                f"{subs['value_add_insight']}\n\n"
                f"{subs['connection_to_problem']}\n\n"
                f"Happy to walk you through how we're approaching this if it's relevant.\n\n"
                f"{sender_name}"
            )
        elif template_key == "breakup":
            body = (
                f"Hey {first_name},\n\n"
                f"I'll take the hint and stop clogging your inbox.\n\n"
                f"If creative testing velocity ever becomes a priority, feel free to reach "
                f"back out — I'm not going anywhere.\n\n"
                f"Cheers,\n{sender_name}"
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
    active_stages = ["email_1_sent", "followup_1_sent", "followup_2_sent"]

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

    args = parser.parse_args()

    if args.mode == "daily":
        result = run_daily()
    elif args.mode == "weekly":
        result = run_weekly()
    elif args.mode == "campaign":
        niches = [n.strip() for n in args.niches.split(",")]
        result = run_campaign(niches, include_jobs=args.include_jobs, campaign_name=args.campaign_name)
    else:
        parser.print_help()
        sys.exit(1)

    # Print JSON result to stdout (matches CLI convention)
    print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    main()
