"""Gmail SMTP sender with warmup enforcement."""

import re
import smtplib
import time
from datetime import datetime
from email.mime.text import MIMEText

from config import (
    GMAIL_SMTP_HOST,
    GMAIL_SMTP_PORT,
    WARMUP_LIMITS,
    MAX_DAILY_SENDS,
    get_gmail_address,
    get_gmail_password,
    load_config,
    save_config,
)
from modules.pipeline import list_prospects, update_stage


def send_email(to, subject, body):
    """Send a single plain-text email via SMTP_SSL."""
    try:
        if not can_send_today():
            status = get_daily_status()
            return {"status": "error", "message": f"Daily send limit reached ({status['sent_today']}/{status['limit']})"}

        gmail_address = get_gmail_address()
        gmail_password = get_gmail_password()

        if not gmail_address or not gmail_password:
            return {"status": "error", "message": "Gmail credentials not configured. Set GMAIL_ADDRESS and GMAIL_APP_PASSWORD in .env"}

        config = load_config()
        from_name = config.get("email", {}).get("from_name", "")
        signature = config.get("email", {}).get("signature", "")

        full_body = body
        if signature and "STOP" not in body:
            full_body = body + signature
        # Strip unreplaced {variable} placeholders to prevent template fields showing in emails
        full_body = re.sub(r'(?<!\{)\{([a-zA-Z_][a-zA-Z0-9_]*)\}(?!\})', '', full_body)
        full_body = re.sub(r'\n{3,}', '\n\n', full_body).strip()

        msg = MIMEText(full_body, "plain", "utf-8")
        msg["From"] = f"{from_name} <{gmail_address}>" if from_name else gmail_address
        msg["To"] = to
        msg["Subject"] = subject

        with smtplib.SMTP_SSL(GMAIL_SMTP_HOST, GMAIL_SMTP_PORT) as server:
            server.login(gmail_address, gmail_password)
            server.send_message(msg)

        increment_send_count()

        return {"status": "sent", "to": to, "subject": subject, "timestamp": datetime.now().isoformat() + "Z"}

    except smtplib.SMTPAuthenticationError:
        return {"status": "error", "message": "Gmail authentication failed. Check GMAIL_APP_PASSWORD"}
    except smtplib.SMTPRecipientsRefused:
        return {"status": "error", "message": f"Recipient refused: {to}"}
    except smtplib.SMTPException as e:
        return {"status": "error", "message": f"SMTP error: {e}"}
    except Exception as e:
        return {"status": "error", "message": f"Send failed: {e}"}


def send_batch(stage="ready_to_send", limit=20, delay=45):
    """Send to all prospects in the given pipeline stage."""
    try:
        result = list_prospects(stage=stage, limit=limit)
        prospects = result.get("prospects", [])

        if not prospects:
            return {"sent": 0, "failed": 0, "skipped": 0, "results": [], "message": f"No prospects in stage '{stage}'"}

        sent = 0
        failed = 0
        skipped = 0
        results = []

        for i, prospect in enumerate(prospects):
            if not can_send_today():
                remaining = len(prospects) - i
                results.append({"id": prospect.get("id"), "status": "skipped", "message": f"Daily limit reached. {remaining} skipped."})
                skipped += remaining
                break

            email = prospect.get("email", "")
            prospect_id = prospect.get("id", "")

            if not email:
                results.append({"id": prospect_id, "status": "skipped", "message": "No email address"})
                skipped += 1
                continue

            subject = _build_subject(prospect)
            body = _build_body(prospect)
            send_result = send_email(email, subject, body)

            if send_result["status"] == "sent":
                sent += 1
                update_stage(prospect_id, "email_1_sent", interaction={
                    "type": "email_sent", "subject": subject, "sequence_step": 1,
                    "notes": f"Initial email sent to {email}",
                })
            elif "limit reached" in send_result.get("message", ""):
                skipped += 1
            else:
                failed += 1

            results.append({"id": prospect_id, "email": email, **send_result})

            if i < len(prospects) - 1 and send_result["status"] == "sent":
                time.sleep(delay)

        return {"sent": sent, "failed": failed, "skipped": skipped, "results": results}

    except Exception as e:
        return {"sent": 0, "failed": 0, "skipped": 0, "results": [], "error": str(e)}


def get_daily_status():
    """Return current day send status and warmup info."""
    try:
        config = load_config()
        _reset_if_new_day(config)
        warmup = config.get("warmup", {})

        warmup_week = _calculate_warmup_week(warmup)
        daily_limit = min(WARMUP_LIMITS.get(warmup_week, MAX_DAILY_SENDS), MAX_DAILY_SENDS)
        sent_today = warmup.get("sent_today", 0)

        return {
            "sent_today": sent_today,
            "limit": daily_limit,
            "remaining": max(0, daily_limit - sent_today),
            "warmup_week": warmup_week,
            "start_date": warmup.get("start_date", ""),
        }
    except Exception as e:
        return {"sent_today": 0, "limit": 0, "remaining": 0, "warmup_week": 1, "error": str(e)}


def can_send_today():
    """Check if we can still send today based on warmup limits."""
    try:
        config = load_config()
        _reset_if_new_day(config)
        warmup = config.get("warmup", {})
        warmup_week = _calculate_warmup_week(warmup)
        daily_limit = min(WARMUP_LIMITS.get(warmup_week, MAX_DAILY_SENDS), MAX_DAILY_SENDS)
        return warmup.get("sent_today", 0) < daily_limit
    except Exception:
        return False


def increment_send_count():
    """Increment sent_today in config.json."""
    config = load_config()
    _reset_if_new_day(config)
    warmup = config.get("warmup", {})
    warmup["sent_today"] = warmup.get("sent_today", 0) + 1
    warmup["last_sent_date"] = datetime.now().strftime("%Y-%m-%d")
    warmup["current_week"] = _calculate_warmup_week(warmup)
    config["warmup"] = warmup
    save_config(config)


def _calculate_warmup_week(warmup):
    start_str = warmup.get("start_date", "")
    if not start_str:
        return 1
    try:
        start = datetime.strptime(start_str, "%Y-%m-%d")
        days = (datetime.now() - start).days
        week = max(1, (days // 7) + 1)
        return min(week, max(WARMUP_LIMITS.keys()) + 1)
    except (ValueError, TypeError):
        return 1


def _reset_if_new_day(config):
    warmup = config.get("warmup", {})
    today = datetime.now().strftime("%Y-%m-%d")
    if warmup.get("last_sent_date", "") != today:
        warmup["sent_today"] = 0
        if not warmup.get("start_date"):
            warmup["start_date"] = today
        config["warmup"] = warmup
        save_config(config)


def _build_subject(prospect):
    draft = prospect.get("draft_email", {})
    if isinstance(draft, dict) and draft.get("subject"):
        return draft["subject"]
    return f"quick question about {prospect.get('company', 'your company')}'s ad creative"


def _build_body(prospect):
    draft = prospect.get("draft_email", {})
    if isinstance(draft, dict) and draft.get("body"):
        return draft["body"]

    first_name = prospect.get("name", "").split()[0] if prospect.get("name") else "there"
    company = prospect.get("company", "your company")
    sender = load_config().get("email", {}).get("from_name", "")

    return (
        f"Hey {first_name},\n\n"
        f"Saw {company} is scaling paid social. Smart move.\n\n"
        f"One thing we're seeing with brands at your stage: the creative testing bottleneck "
        f"becomes the ceiling on scale. Teams that automate the test-and-iterate cycle are "
        f"shipping 10x more creatives without adding headcount.\n\n"
        f"Would it make sense to show you how we're doing this? 15 min, no pitch — "
        f"just the framework.\n\n"
        f"Either way, appreciate what you're building.\n\n"
        f"{sender}"
    )
