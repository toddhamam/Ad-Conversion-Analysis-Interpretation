#!/usr/bin/env python3
"""Convertra Leads CLI — Lead gen pipeline and autonomous orchestrator.

All commands output JSON to stdout. Errors output JSON to stderr.
Exit code 0 on success, 1 on error.
"""

import argparse
import json
import sys
import os

# Ensure the project root is on the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import load_env


def output(data):
    """Print JSON result to stdout."""
    print(json.dumps(data, indent=2, default=str))


def error(message, code=1):
    """Print JSON error to stderr and exit."""
    print(json.dumps({"error": message}), file=sys.stderr)
    sys.exit(code)


# ─── Pipeline commands ───────────────────────────────────────────────

def cmd_pipeline_list(args):
    from modules.pipeline import list_prospects
    result = list_prospects(
        stage=args.stage,
        campaign=args.campaign,
        tag=args.tag,
        limit=args.limit,
        score_min=args.score_min,
    )
    output(result)


def cmd_pipeline_get(args):
    from modules.pipeline import get_prospect
    prospect = get_prospect(args.id)
    if prospect:
        output({"prospect": prospect})
    else:
        error(f"Prospect {args.id} not found")


def cmd_pipeline_add(args):
    from modules.pipeline import add_prospect
    try:
        prospect_data = json.loads(args.json)
    except json.JSONDecodeError as e:
        error(f"Invalid JSON: {e}")
    result = add_prospect(prospect_data)
    output(result)


def cmd_pipeline_update(args):
    from modules.pipeline import update_stage, update_prospect
    interaction = None
    if args.interaction:
        try:
            interaction = json.loads(args.interaction)
        except json.JSONDecodeError as e:
            error(f"Invalid interaction JSON: {e}")

    if args.stage:
        result = update_stage(args.id, args.stage, interaction)
    elif args.data:
        try:
            updates = json.loads(args.data)
        except json.JSONDecodeError as e:
            error(f"Invalid data JSON: {e}")
        result = update_prospect(args.id, updates)
    else:
        error("Must specify --stage or --data")
        return
    output(result)


def cmd_pipeline_due(args):
    from modules.pipeline import get_due_actions
    result = get_due_actions(date=args.date)
    output(result)


def cmd_pipeline_search(args):
    from modules.pipeline import search_prospects
    result = search_prospects(args.query)
    output(result)


def cmd_pipeline_backup(args):
    from modules.pipeline import backup_pipeline
    result = backup_pipeline()
    output(result)


def cmd_pipeline_delete(args):
    from modules.pipeline import delete_prospect
    result = delete_prospect(args.id)
    output(result)


# ─── Score commands ──────────────────────────────────────────────────

def cmd_score_prospect(args):
    from modules.scorer import score_and_update
    result = score_and_update(args.id)
    if result.get("status") == "not_found":
        error(f"Prospect {args.id} not found")
    else:
        output(result)


def cmd_score_batch(args):
    from modules.scorer import batch_score
    result = batch_score(stage=args.stage, score_min=args.score_min)
    output(result)


# ─── Mail commands ───────────────────────────────────────────────────

def cmd_mail_send(args):
    from modules.mailer import send_email
    result = send_email(args.to, args.subject, args.body)
    output(result)


def cmd_mail_batch(args):
    from modules.mailer import send_batch
    result = send_batch(
        stage=args.stage,
        limit=args.limit,
        delay=args.delay,
    )
    output(result)


def cmd_mail_status(args):
    from modules.mailer import get_daily_status
    result = get_daily_status()
    output(result)


# ─── Inbox commands ──────────────────────────────────────────────────

def cmd_inbox_check(args):
    from modules.inbox import check_inbox
    result = check_inbox(days=args.days, unread_only=args.unread_only)
    output(result)


def cmd_inbox_replies(args):
    from modules.inbox import check_replies_for_pipeline
    result = check_replies_for_pipeline()
    output(result)


def cmd_inbox_search(args):
    from modules.inbox import search_from
    result = search_from(args.sender)
    output(result)


# ─── Follow-up commands ─────────────────────────────────────────────

def cmd_followup_due(args):
    from modules.followup import get_due_followups
    result = get_due_followups(date=args.date)
    output(result)


def cmd_followup_schedule(args):
    from modules.followup import schedule_followup
    result = schedule_followup(args.id, args.step, date=args.date)
    output(result)


def cmd_followup_pause(args):
    from modules.followup import pause_sequence
    result = pause_sequence(args.id)
    output(result)


def cmd_followup_resume(args):
    from modules.followup import resume_sequence
    result = resume_sequence(args.id)
    output(result)


# ─── Discover commands ───────────────────────────────────────────────

def cmd_discover_search(args):
    from modules.discovery import search_prospects_by_niche, search_prospects_by_keywords
    if args.niche:
        result = search_prospects_by_niche(args.niche, limit=args.limit)
    elif args.keywords:
        keywords = [k.strip() for k in args.keywords.split(",")]
        result = search_prospects_by_keywords(keywords, limit=args.limit)
    else:
        error("Must specify --niche or --keywords")
        return
    output(result)


def cmd_discover_batch(args):
    from modules.discovery import batch_discover
    niches = None
    if args.niches:
        niches = [n.strip() for n in args.niches.split(",")]
    result = batch_discover(niches=niches, limit_per_niche=args.limit_per_niche)
    output(result)


def cmd_discover_linkedin(args):
    from modules.discovery import search_linkedin
    result = search_linkedin(args.query, limit=args.limit)
    output(result)


# ─── Scrape commands ─────────────────────────────────────────────────

def cmd_scrape_search(args):
    from modules.scraper import search_ad_library
    result = search_ad_library(
        search_terms=args.keyword or args.niche,
        country=args.country,
        limit=args.limit,
    )
    output(result)


def cmd_scrape_page(args):
    from modules.scraper import get_page_ads
    result = get_page_ads(args.page_id, country=args.country)
    output(result)


# ─── Research commands ───────────────────────────────────────────────

def cmd_research_company(args):
    from modules.research import scrape_company
    result = scrape_company(args.url)
    output(result)


def cmd_research_batch(args):
    from modules.research import batch_research
    result = batch_research(stage=args.stage)
    output(result)


# ─── Email finder commands ───────────────────────────────────────────

def cmd_email_find(args):
    from modules.email_finder import find_email
    result = find_email(args.name, args.domain)
    output(result)


def cmd_email_verify(args):
    from modules.email_finder import verify_email
    result = verify_email(args.address)
    output(result)


def cmd_email_batch(args):
    from modules.email_finder import batch_find_emails
    result = batch_find_emails(stage=args.stage, score_min=args.score_min)
    output(result)


def cmd_email_search(args):
    from modules.email_finder import search_email_web
    result = search_email_web(args.name, args.company)
    output(result)


# ─── Report commands ─────────────────────────────────────────────────

def cmd_report_campaign(args):
    from modules.reporter import campaign_report
    result = campaign_report(campaign=args.campaign)
    output(result)


def cmd_report_daily(args):
    from modules.reporter import daily_report
    result = daily_report()
    output(result)


def cmd_report_summary(args):
    from modules.reporter import pipeline_summary
    result = pipeline_summary()
    output(result)


# ─── Orchestrate commands ────────────────────────────────────────────

def cmd_orchestrate_daily(args):
    from orchestrator import run_daily
    result = run_daily()
    output(result)


def cmd_orchestrate_weekly(args):
    from orchestrator import run_weekly
    result = run_weekly()
    output(result)


def cmd_orchestrate_campaign(args):
    from orchestrator import run_campaign
    niches = [n.strip() for n in args.niches.split(",")]
    result = run_campaign(niches, include_jobs=args.include_jobs, campaign_name=args.campaign_name)
    output(result)


def cmd_orchestrate_prospect(args):
    from orchestrator import run_prospect_hunt
    niches = [n.strip() for n in args.niches.split(",")] if args.niches else None
    result = run_prospect_hunt(
        target=args.target,
        niches=niches,
        include_jobs=args.include_jobs,
        max_rounds=args.max_rounds,
        campaign_name=args.campaign_name,
    )
    output(result)


# ─── Enrich commands ─────────────────────────────────────────────────

def cmd_enrich_person(args):
    from modules.enrichment import enrich_person
    parts = args.name.strip().split()
    first = parts[0] if parts else ""
    last = parts[-1] if len(parts) > 1 else ""
    result = enrich_person(
        first, last, args.domain,
        organization_name=args.company or "",
        linkedin_url=args.linkedin or "",
    )
    output(result)


def cmd_enrich_prospect(args):
    from modules.enrichment import enrich_person, map_hunter_to_prospect
    from modules.pipeline import get_prospect, update_prospect
    from modules.email_finder import _domain_from_url

    prospect = get_prospect(args.id)
    if not prospect:
        error(f"Prospect {args.id} not found")

    parts = prospect.get("name", "").strip().split()
    if len(parts) < 2:
        error(f"Prospect {args.id} needs first + last name")

    domain = _domain_from_url(prospect.get("company_url", ""))
    if not domain:
        error(f"Prospect {args.id} has no company_url")

    result = enrich_person(
        parts[0], parts[-1], domain,
        organization_name=prospect.get("company", ""),
        linkedin_url=prospect.get("linkedin_url", ""),
    )

    if result["status"] == "matched" and result.get("person"):
        updates = map_hunter_to_prospect(result["person"], prospect)
        if updates:
            update_prospect(args.id, updates)
            result["updates_applied"] = list(updates.keys())

    output(result)


def cmd_enrich_batch(args):
    from modules.enrichment import batch_enrich
    result = batch_enrich(stage=args.stage, score_min=args.score_min)
    output(result)


# ─── Draft commands ──────────────────────────────────────────────────

def cmd_draft_email(args):
    from modules.drafter import draft_email
    from modules.pipeline import get_prospect
    prospect = get_prospect(args.id)
    if not prospect:
        error(f"Prospect {args.id} not found")
    result = draft_email(prospect)
    output(result)


def cmd_draft_batch(args):
    from modules.drafter import batch_draft
    result = batch_draft(stage=args.stage, score_min=args.score_min)
    output(result)


# ─── Discover jobs command ───────────────────────────────────────────

def cmd_discover_jobs(args):
    from modules.job_scraper import search_job_listings, batch_add_job_prospects
    keywords = None
    if args.keywords:
        keywords = [k.strip() for k in args.keywords.split(",")]
    results = search_job_listings(keywords=keywords, limit=args.limit)
    added = batch_add_job_prospects(results.get("results", []))
    output({**results, "pipeline_additions": added})


# ─── Notify commands ─────────────────────────────────────────────────

def cmd_notify_send(args):
    from modules.notifier import send_notification
    result = send_notification(args.message)
    output(result)


# ─── Instantly commands ─────────────────────────────────────────────

def cmd_instantly_status(args):
    from modules.instantly import status
    result = status()
    output(result)


def cmd_instantly_accounts(args):
    from modules.instantly import list_accounts
    result = list_accounts()
    output(result)


def cmd_instantly_campaigns(args):
    from modules.instantly import list_campaigns
    result = list_campaigns()
    output(result)


def cmd_instantly_create_campaign(args):
    from modules.instantly import create_campaign
    result = create_campaign(name=args.name, sending_account=args.account)
    output(result)


def cmd_instantly_push_leads(args):
    from modules.instantly import push_leads
    result = push_leads(campaign_id=args.campaign_id, stage=args.stage, limit=args.limit)
    output(result)


def cmd_instantly_activate(args):
    from modules.instantly import activate_campaign
    result = activate_campaign(args.campaign_id)
    output(result)


def cmd_instantly_pause(args):
    from modules.instantly import pause_campaign
    result = pause_campaign(args.campaign_id)
    output(result)


def cmd_instantly_analytics(args):
    from modules.instantly import campaign_analytics
    result = campaign_analytics(args.campaign_id)
    output(result)


# ─── Argument parser ─────────────────────────────────────────────────

def build_parser():
    parser = argparse.ArgumentParser(
        prog="convertra-leads",
        description="Convertra Leads CLI — Lead gen pipeline for OpenClaw bot",
    )
    subparsers = parser.add_subparsers(dest="command", help="Top-level command")

    # ── pipeline ──
    pipeline_parser = subparsers.add_parser("pipeline", help="Pipeline CRM operations")
    pipeline_sub = pipeline_parser.add_subparsers(dest="action")

    p_list = pipeline_sub.add_parser("list", help="List prospects")
    p_list.add_argument("--stage", type=str)
    p_list.add_argument("--campaign", type=str)
    p_list.add_argument("--tag", type=str)
    p_list.add_argument("--limit", type=int)
    p_list.add_argument("--score-min", type=int, dest="score_min")
    p_list.set_defaults(func=cmd_pipeline_list)

    p_get = pipeline_sub.add_parser("get", help="Get a prospect by ID")
    p_get.add_argument("--id", required=True)
    p_get.set_defaults(func=cmd_pipeline_get)

    p_add = pipeline_sub.add_parser("add", help="Add a prospect")
    p_add.add_argument("--json", required=True, help="Prospect data as JSON string")
    p_add.set_defaults(func=cmd_pipeline_add)

    p_update = pipeline_sub.add_parser("update", help="Update a prospect")
    p_update.add_argument("--id", required=True)
    p_update.add_argument("--stage", type=str)
    p_update.add_argument("--data", type=str, help="JSON updates to merge")
    p_update.add_argument("--interaction", type=str, help="Interaction JSON to log")
    p_update.set_defaults(func=cmd_pipeline_update)

    p_due = pipeline_sub.add_parser("due", help="Get due actions")
    p_due.add_argument("--date", type=str)
    p_due.set_defaults(func=cmd_pipeline_due)

    p_search = pipeline_sub.add_parser("search", help="Search prospects")
    p_search.add_argument("--query", required=True)
    p_search.set_defaults(func=cmd_pipeline_search)

    p_backup = pipeline_sub.add_parser("backup", help="Backup pipeline")
    p_backup.set_defaults(func=cmd_pipeline_backup)

    p_delete = pipeline_sub.add_parser("delete", help="Delete a prospect")
    p_delete.add_argument("--id", required=True)
    p_delete.set_defaults(func=cmd_pipeline_delete)

    # ── score ──
    score_parser = subparsers.add_parser("score", help="Lead scoring")
    score_sub = score_parser.add_subparsers(dest="action")

    s_prospect = score_sub.add_parser("prospect", help="Score a single prospect")
    s_prospect.add_argument("--id", required=True)
    s_prospect.set_defaults(func=cmd_score_prospect)

    s_batch = score_sub.add_parser("batch", help="Score all prospects matching filter")
    s_batch.add_argument("--stage", type=str)
    s_batch.add_argument("--score-min", type=int, dest="score_min")
    s_batch.set_defaults(func=cmd_score_batch)

    # ── mail ──
    mail_parser = subparsers.add_parser("mail", help="Email operations")
    mail_sub = mail_parser.add_subparsers(dest="action")

    m_send = mail_sub.add_parser("send", help="Send a single email")
    m_send.add_argument("--to", required=True)
    m_send.add_argument("--subject", required=True)
    m_send.add_argument("--body", required=True)
    m_send.set_defaults(func=cmd_mail_send)

    m_batch = mail_sub.add_parser("batch", help="Send batch emails")
    m_batch.add_argument("--stage", type=str, default="ready_to_send")
    m_batch.add_argument("--limit", type=int, default=20)
    m_batch.add_argument("--delay", type=int, default=45)
    m_batch.set_defaults(func=cmd_mail_batch)

    m_status = mail_sub.add_parser("daily-status", help="Get daily send status")
    m_status.set_defaults(func=cmd_mail_status)

    # ── inbox ──
    inbox_parser = subparsers.add_parser("inbox", help="Inbox operations")
    inbox_sub = inbox_parser.add_subparsers(dest="action")

    i_check = inbox_sub.add_parser("check", help="Check recent inbox")
    i_check.add_argument("--days", type=int, default=3)
    i_check.add_argument("--unread-only", action="store_true", dest="unread_only")
    i_check.set_defaults(func=cmd_inbox_check)

    i_replies = inbox_sub.add_parser("replies", help="Check for pipeline replies")
    i_replies.set_defaults(func=cmd_inbox_replies)

    i_search = inbox_sub.add_parser("search", help="Search inbox by sender")
    i_search.add_argument("--from", required=True, dest="sender")
    i_search.set_defaults(func=cmd_inbox_search)

    # ── followup ──
    followup_parser = subparsers.add_parser("followup", help="Follow-up sequences")
    followup_sub = followup_parser.add_subparsers(dest="action")

    f_due = followup_sub.add_parser("due", help="Get due follow-ups")
    f_due.add_argument("--date", type=str)
    f_due.set_defaults(func=cmd_followup_due)

    f_schedule = followup_sub.add_parser("schedule", help="Schedule a follow-up")
    f_schedule.add_argument("--id", required=True)
    f_schedule.add_argument("--step", required=True)
    f_schedule.add_argument("--date", type=str)
    f_schedule.set_defaults(func=cmd_followup_schedule)

    f_pause = followup_sub.add_parser("pause", help="Pause a sequence")
    f_pause.add_argument("--id", required=True)
    f_pause.set_defaults(func=cmd_followup_pause)

    f_resume = followup_sub.add_parser("resume", help="Resume a sequence")
    f_resume.add_argument("--id", required=True)
    f_resume.set_defaults(func=cmd_followup_resume)

    # ── discover ──
    discover_parser = subparsers.add_parser("discover", help="Prospect discovery")
    discover_sub = discover_parser.add_subparsers(dest="action")

    d_search = discover_sub.add_parser("search", help="Search for prospects")
    d_search.add_argument("--niche", type=str)
    d_search.add_argument("--keywords", type=str)
    d_search.add_argument("--limit", type=int, default=30)
    d_search.set_defaults(func=cmd_discover_search)

    d_batch = discover_sub.add_parser("batch", help="Batch discovery across niches")
    d_batch.add_argument("--niches", type=str, help="Comma-separated niches")
    d_batch.add_argument("--limit-per-niche", type=int, default=20, dest="limit_per_niche")
    d_batch.set_defaults(func=cmd_discover_batch)

    d_linkedin = discover_sub.add_parser("linkedin", help="Search LinkedIn profiles")
    d_linkedin.add_argument("--query", required=True)
    d_linkedin.add_argument("--limit", type=int, default=20)
    d_linkedin.set_defaults(func=cmd_discover_linkedin)

    d_jobs = discover_sub.add_parser("jobs", help="Search job listings for media buyer hires")
    d_jobs.add_argument("--keywords", type=str, help="Comma-separated keywords")
    d_jobs.add_argument("--limit", type=int, default=30)
    d_jobs.set_defaults(func=cmd_discover_jobs)

    # ── scrape ──
    scrape_parser = subparsers.add_parser("scrape", help="Ad Library scraping")
    scrape_sub = scrape_parser.add_subparsers(dest="action")

    sc_search = scrape_sub.add_parser("search", help="Search Ad Library")
    sc_search.add_argument("--niche", type=str)
    sc_search.add_argument("--keyword", type=str)
    sc_search.add_argument("--limit", type=int, default=25)
    sc_search.add_argument("--country", type=str, default="GB")
    sc_search.set_defaults(func=cmd_scrape_search)

    sc_page = scrape_sub.add_parser("page", help="Get ads for a page")
    sc_page.add_argument("--page-id", required=True, dest="page_id")
    sc_page.add_argument("--country", type=str, default="GB")
    sc_page.set_defaults(func=cmd_scrape_page)

    # ── research ──
    research_parser = subparsers.add_parser("research", help="Company research")
    research_sub = research_parser.add_subparsers(dest="action")

    r_company = research_sub.add_parser("company", help="Research a company")
    r_company.add_argument("--url", required=True)
    r_company.set_defaults(func=cmd_research_company)

    r_batch = research_sub.add_parser("batch", help="Batch research")
    r_batch.add_argument("--stage", type=str, default="discovered")
    r_batch.set_defaults(func=cmd_research_batch)

    # ── email ──
    email_parser = subparsers.add_parser("email", help="Email discovery")
    email_sub = email_parser.add_subparsers(dest="action")

    e_find = email_sub.add_parser("find", help="Find email for a person")
    e_find.add_argument("--name", required=True)
    e_find.add_argument("--domain", required=True)
    e_find.set_defaults(func=cmd_email_find)

    e_verify = email_sub.add_parser("verify", help="Verify an email address")
    e_verify.add_argument("--address", required=True)
    e_verify.set_defaults(func=cmd_email_verify)

    e_batch = email_sub.add_parser("batch", help="Batch find emails")
    e_batch.add_argument("--stage", type=str, default="researched")
    e_batch.add_argument("--score-min", type=int, dest="score_min")
    e_batch.set_defaults(func=cmd_email_batch)

    e_search = email_sub.add_parser("search", help="Search web for email")
    e_search.add_argument("--name", required=True)
    e_search.add_argument("--company", required=True)
    e_search.set_defaults(func=cmd_email_search)

    # ── enrich ──
    enrich_parser = subparsers.add_parser("enrich", help="Hunter.io enrichment")
    enrich_sub = enrich_parser.add_subparsers(dest="action")

    en_person = enrich_sub.add_parser("person", help="Enrich a single person")
    en_person.add_argument("--name", required=True, help="Full name")
    en_person.add_argument("--domain", required=True, help="Company domain")
    en_person.add_argument("--company", type=str, default="", help="Company name")
    en_person.add_argument("--linkedin", type=str, default="", help="LinkedIn URL")
    en_person.set_defaults(func=cmd_enrich_person)

    en_prospect = enrich_sub.add_parser("prospect", help="Enrich a pipeline prospect")
    en_prospect.add_argument("--id", required=True)
    en_prospect.set_defaults(func=cmd_enrich_prospect)

    en_batch = enrich_sub.add_parser("batch", help="Batch enrich prospects")
    en_batch.add_argument("--stage", type=str, default="researched")
    en_batch.add_argument("--score-min", type=int, dest="score_min")
    en_batch.set_defaults(func=cmd_enrich_batch)

    # ── report ──
    report_parser = subparsers.add_parser("report", help="Campaign reports")
    report_sub = report_parser.add_subparsers(dest="action")

    rp_campaign = report_sub.add_parser("campaign", help="Campaign report")
    rp_campaign.add_argument("--campaign", type=str)
    rp_campaign.set_defaults(func=cmd_report_campaign)

    rp_daily = report_sub.add_parser("daily", help="Daily report")
    rp_daily.set_defaults(func=cmd_report_daily)

    rp_summary = report_sub.add_parser("pipeline-summary", help="Pipeline summary")
    rp_summary.set_defaults(func=cmd_report_summary)

    # ── orchestrate ──
    orch_parser = subparsers.add_parser("orchestrate", help="Run orchestrator routines")
    orch_sub = orch_parser.add_subparsers(dest="action")

    o_daily = orch_sub.add_parser("daily", help="Run daily routine")
    o_daily.set_defaults(func=cmd_orchestrate_daily)

    o_weekly = orch_sub.add_parser("weekly", help="Run weekly review")
    o_weekly.set_defaults(func=cmd_orchestrate_weekly)

    o_campaign = orch_sub.add_parser("campaign", help="Run full campaign pipeline")
    o_campaign.add_argument("--niches", required=True, help="Comma-separated niches")
    o_campaign.add_argument("--include-jobs", action="store_true", dest="include_jobs")
    o_campaign.add_argument("--campaign", type=str, dest="campaign_name")
    o_campaign.set_defaults(func=cmd_orchestrate_campaign)

    o_prospect = orch_sub.add_parser("prospect", help="Hunt for N hot leads across niches")
    o_prospect.add_argument("--target", type=int, default=20, help="Target hot leads (default: 20)")
    o_prospect.add_argument("--niches", type=str, help="Comma-separated niches (default: all)")
    o_prospect.add_argument("--include-jobs", action="store_true", default=True, dest="include_jobs")
    o_prospect.add_argument("--no-jobs", action="store_false", dest="include_jobs")
    o_prospect.add_argument("--max-rounds", type=int, default=10, dest="max_rounds", help="Max rounds (default: 10)")
    o_prospect.add_argument("--campaign", type=str, dest="campaign_name")
    o_prospect.set_defaults(func=cmd_orchestrate_prospect)

    # ── draft ──
    draft_parser = subparsers.add_parser("draft", help="AI email drafting")
    draft_sub = draft_parser.add_subparsers(dest="action")

    dr_email = draft_sub.add_parser("email", help="Draft email for a single prospect")
    dr_email.add_argument("--id", required=True)
    dr_email.set_defaults(func=cmd_draft_email)

    dr_batch = draft_sub.add_parser("batch", help="Batch draft emails")
    dr_batch.add_argument("--stage", type=str, default="researched")
    dr_batch.add_argument("--score-min", type=int, default=8, dest="score_min")
    dr_batch.set_defaults(func=cmd_draft_batch)

    # ── instantly ──
    instantly_parser = subparsers.add_parser("instantly", help="Instantly.ai email sending")
    instantly_sub = instantly_parser.add_subparsers(dest="action")

    i_status = instantly_sub.add_parser("status", help="Instantly workspace overview")
    i_status.set_defaults(func=cmd_instantly_status)

    i_accounts = instantly_sub.add_parser("accounts", help="List sending accounts")
    i_accounts.set_defaults(func=cmd_instantly_accounts)

    i_campaigns = instantly_sub.add_parser("campaigns", help="List campaigns")
    i_campaigns.set_defaults(func=cmd_instantly_campaigns)

    i_create = instantly_sub.add_parser("create-campaign", help="Create campaign with sequences")
    i_create.add_argument("--name", required=True, help="Campaign name")
    i_create.add_argument("--account", type=str, help="Sending account email")
    i_create.set_defaults(func=cmd_instantly_create_campaign)

    i_push = instantly_sub.add_parser("push-leads", help="Push pipeline leads to campaign")
    i_push.add_argument("--campaign-id", required=True, dest="campaign_id")
    i_push.add_argument("--stage", type=str, default="ready_to_send")
    i_push.add_argument("--limit", type=int, default=100)
    i_push.set_defaults(func=cmd_instantly_push_leads)

    i_activate = instantly_sub.add_parser("activate", help="Activate a campaign")
    i_activate.add_argument("--campaign-id", required=True, dest="campaign_id")
    i_activate.set_defaults(func=cmd_instantly_activate)

    i_pause = instantly_sub.add_parser("pause", help="Pause a campaign")
    i_pause.add_argument("--campaign-id", required=True, dest="campaign_id")
    i_pause.set_defaults(func=cmd_instantly_pause)

    i_analytics = instantly_sub.add_parser("analytics", help="Campaign analytics")
    i_analytics.add_argument("--campaign-id", required=True, dest="campaign_id")
    i_analytics.set_defaults(func=cmd_instantly_analytics)

    # ── notify ──
    notify_parser = subparsers.add_parser("notify", help="Telegram notifications")
    notify_sub = notify_parser.add_subparsers(dest="action")

    n_send = notify_sub.add_parser("send", help="Send a Telegram message")
    n_send.add_argument("--message", required=True)
    n_send.set_defaults(func=cmd_notify_send)

    return parser


def main():
    load_env()
    parser = build_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    if not hasattr(args, "func"):
        # Subcommand not specified
        parser.parse_args([args.command, "--help"])
        sys.exit(1)

    try:
        args.func(args)
    except Exception as e:
        error(str(e))


if __name__ == "__main__":
    main()
