"""Telegram Bot API notifications — direct HTTP, no SDK."""

import os

import requests


TELEGRAM_API_BASE = "https://api.telegram.org"
MAX_MESSAGE_LENGTH = 4096


def send_notification(message, parse_mode="Markdown"):
    """Send a message to the configured Telegram chat.

    Args:
        message: Text to send (truncated at 4096 chars if needed).
        parse_mode: "Markdown" or "HTML". Default "Markdown".

    Returns:
        dict with keys: status ("sent" | "skipped" | "error"), message_id (if sent).
    """
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "")

    if not token or not chat_id:
        return {"status": "skipped", "message": "Telegram not configured"}

    try:
        # Split long messages
        chunks = _split_message(message)
        message_ids = []

        for chunk in chunks:
            url = f"{TELEGRAM_API_BASE}/bot{token}/sendMessage"
            payload = {
                "chat_id": chat_id,
                "text": chunk,
                "parse_mode": parse_mode,
            }
            resp = requests.post(url, json=payload, timeout=15)
            data = resp.json()

            if not data.get("ok"):
                # If markdown parsing fails, retry without parse_mode
                if "parse" in data.get("description", "").lower():
                    payload.pop("parse_mode")
                    resp = requests.post(url, json=payload, timeout=15)
                    data = resp.json()

                if not data.get("ok"):
                    return {"status": "error", "message": data.get("description", "Unknown error")}

            message_ids.append(data["result"]["message_id"])

        return {"status": "sent", "message_ids": message_ids}

    except requests.RequestException as e:
        return {"status": "error", "message": f"Request failed: {e}"}
    except Exception as e:
        return {"status": "error", "message": f"Notification failed: {e}"}


def format_daily_summary(report_data, inbox_data, followup_data, send_data):
    """Format daily ops results as a Telegram-friendly markdown message.

    Args:
        report_data: dict from reporter.daily_report()
        inbox_data: dict from _process_inbox()
        followup_data: dict with keys: sent, failed, skipped
        send_data: dict from mailer.send_batch() or None

    Returns:
        str: Formatted markdown string for Telegram.
    """
    from datetime import datetime
    date_str = datetime.now().strftime("%Y-%m-%d")

    lines = [f"*Convertra Daily Ops* -- {date_str}", ""]

    # Inbox section
    replies = inbox_data.get("replies_processed", 0)
    interested = inbox_data.get("interested", 0)
    not_interested = inbox_data.get("not_interested", 0)
    not_now = inbox_data.get("not_now", 0)
    bounces = inbox_data.get("bounces_processed", 0)
    optouts = inbox_data.get("optouts_processed", 0)

    lines.append("*Inbox*")
    if replies > 0:
        parts = []
        if interested > 0:
            parts.append(f"{interested} interested")
        if not_now > 0:
            parts.append(f"{not_now} not now")
        if not_interested > 0:
            parts.append(f"{not_interested} not interested")
        lines.append(f"- {replies} replies ({', '.join(parts)})")
    else:
        lines.append("- 0 replies")
    lines.append(f"- {bounces} bounces, {optouts} opt-outs")
    lines.append("")

    # Follow-ups section
    fu_sent = followup_data.get("sent", 0) if followup_data else 0
    fu_failed = followup_data.get("failed", 0) if followup_data else 0
    lines.append("*Follow-ups*")
    lines.append(f"- {fu_sent} sent, {fu_failed} failed")
    lines.append("")

    # Outreach section
    sent = send_data.get("sent", 0) if send_data else 0
    failed = send_data.get("failed", 0) if send_data else 0
    lines.append("*Outreach*")
    lines.append(f"- {sent} initial emails sent, {failed} failed")

    # Warmup info from report
    sent_today = report_data.get("sent_today", 0)
    daily_limit = report_data.get("daily_limit", 0)
    warmup_week = report_data.get("warmup_week", 0)
    if daily_limit > 0:
        lines.append(f"- Warmup: {sent_today}/{daily_limit} used (week {warmup_week})")
    lines.append("")

    # Pipeline summary
    total = report_data.get("total_prospects", 0)
    due = report_data.get("due_followups", 0)
    lines.append("*Pipeline*")
    lines.append(f"- {total} total prospects, {due} due follow-ups")

    return "\n".join(lines)


def format_campaign_summary(discovery_count, research_count, scored_count, emails_found, drafted_count, enrichment=None):
    """Format campaign pipeline results as Telegram markdown.

    Args:
        enrichment: optional dict with keys: enriched, emails_found, credits_used

    Returns:
        str: Formatted markdown string.
    """
    from datetime import datetime
    date_str = datetime.now().strftime("%Y-%m-%d")

    lines = [
        f"*Convertra Campaign Complete* -- {date_str}",
        "",
        "*Pipeline Results*",
        f"- Discovered: {discovery_count} prospects",
        f"- Researched: {research_count}",
        f"- Scored: {scored_count}",
    ]

    if enrichment:
        hunter_enriched = enrichment.get("enriched", 0)
        hunter_emails = enrichment.get("emails_found", 0)
        credits = enrichment.get("credits_used", 0)
        lines.append(f"- Hunter enriched: {hunter_enriched} ({hunter_emails} emails, {credits} credits)")

    lines.extend([
        f"- Emails found: {emails_found}",
        f"- Emails drafted: {drafted_count}",
        "",
        f"Ready for outreach: {drafted_count} prospects in ready\\_to\\_send",
    ])

    return "\n".join(lines)


def format_weekly_summary(pipeline_summary, campaign_report, red_flags):
    """Format weekly review as Telegram markdown.

    Args:
        pipeline_summary: dict from reporter.pipeline_summary()
        campaign_report: dict from reporter.campaign_report()
        red_flags: list of str warning messages

    Returns:
        str: Formatted markdown string.
    """
    from datetime import datetime
    date_str = datetime.now().strftime("%Y-%m-%d")

    lines = [f"*Convertra Weekly Review* -- {date_str}", ""]

    # Pipeline health
    total = pipeline_summary.get("total_prospects", 0)
    by_stage = pipeline_summary.get("by_stage", {})
    by_tier = pipeline_summary.get("by_tier", {})

    lines.append("*Pipeline Health*")
    lines.append(f"- Total: {total} prospects")
    lines.append(f"- Hot: {by_tier.get('hot', 0)} | Warm: {by_tier.get('warm', 0)} | Cool: {by_tier.get('cool', 0)}")

    ready = by_stage.get("ready_to_send", 0)
    in_sequence = sum(by_stage.get(s, 0) for s in ["email_1_sent", "followup_1_sent"])
    lines.append(f"- Ready to send: {ready}")
    lines.append(f"- In active sequence: {in_sequence}")
    lines.append("")

    # Campaign performance
    rates = campaign_report.get("rates", {})
    lines.append("*Campaign Performance*")
    lines.append(f"- Reply rate: {rates.get('reply_rate', 0)}%")
    lines.append(f"- Bounce rate: {rates.get('bounce_rate', 0)}%")
    lines.append(f"- Positive reply rate: {rates.get('positive_reply_rate', 0)}%")
    lines.append("")

    # Red flags
    if red_flags:
        lines.append("*Red Flags*")
        for flag in red_flags:
            lines.append(f"- {flag}")
    else:
        lines.append("*Status: All clear*")

    return "\n".join(lines)


def format_prospect_hunt_summary(hunt_results):
    """Format prospect hunt results as Telegram markdown.

    Args:
        hunt_results: dict from run_prospect_hunt()

    Returns:
        str: Formatted markdown string for Telegram.
    """
    from datetime import datetime
    date_str = datetime.now().strftime("%Y-%m-%d")

    target = hunt_results.get("target", 20)
    rounds = hunt_results.get("rounds_completed", 0)
    max_rounds = hunt_results.get("max_rounds", 10)
    duration = hunt_results.get("duration", "")
    totals = hunt_results.get("totals", {})
    email_finding = hunt_results.get("email_finding", {})
    drafting = hunt_results.get("drafting", {})
    final = hunt_results.get("final_counts", {})
    target_met = hunt_results.get("target_met", False)

    status_icon = "completed" if target_met else "stopped"

    enrichment = hunt_results.get("enrichment", {})

    lines = [
        f"*Prospect Hunt {status_icon}* -- {date_str}",
        f"Rounds: {rounds}/{max_rounds} | Duration: {duration}",
        "",
        "*Discovery*",
        f"- {totals.get('total_discovered', 0)} prospects found",
        f"- {totals.get('niches_exhausted', 0)} niches exhausted",
        "",
        "*Scoring*",
        f"- Hot (8+): {totals.get('hot_scored', 0)}",
        f"- Warm (5-7): {max(0, totals.get('warm_scored', 0) - totals.get('hot_scored', 0))}",
        "",
    ]

    if enrichment.get("enriched", 0) > 0:
        lines.extend([
            "*Hunter Enrichment*",
            f"- Enriched: {enrichment.get('enriched', 0)}",
            f"- Emails found: {enrichment.get('emails_found', 0)}",
            f"- Credits used: {enrichment.get('credits_used', 0)}",
            "",
        ])

    lines.extend([
        "*Outreach Ready*",
        f"- Emails found: {email_finding.get('found', 0)}",
        f"- Drafts written: {drafting.get('drafted', 0)}",
        f"- Ready to send: {final.get('total_ready', 0)}",
        f"  - Hot: {final.get('hot_ready', 0)}",
        f"  - Warm: {final.get('warm_ready', 0)}",
        "",
        f"Target: {target} hot | Actual: {final.get('hot_ready', 0)} hot",
    ])

    if target_met:
        lines.append("*Target met!*")
    else:
        lines.append(f"_{max(0, target - final.get('hot_ready', 0))} short of target_")

    return "\n".join(lines)


def _split_message(message):
    """Split a message into chunks within Telegram's character limit.

    Splits on newlines when possible to avoid breaking mid-sentence.

    Returns:
        list of str: message chunks
    """
    if len(message) <= MAX_MESSAGE_LENGTH:
        return [message]

    chunks = []
    remaining = message

    while remaining:
        if len(remaining) <= MAX_MESSAGE_LENGTH:
            chunks.append(remaining)
            break

        # Find a good split point (prefer newline)
        split_at = remaining.rfind("\n", 0, MAX_MESSAGE_LENGTH)
        if split_at == -1 or split_at < MAX_MESSAGE_LENGTH // 2:
            # No good newline found — split at limit
            split_at = MAX_MESSAGE_LENGTH

        chunks.append(remaining[:split_at])
        remaining = remaining[split_at:].lstrip("\n")

    return chunks
