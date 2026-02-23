"""Gmail IMAP reader — inbox monitoring, bounce/opt-out detection."""

import email
import imaplib
from datetime import datetime, timedelta
from email.header import decode_header

from config import GMAIL_IMAP_HOST, GMAIL_IMAP_PORT, get_gmail_address, get_gmail_password
from modules.pipeline import load_pipeline


def check_inbox(days=3, unread_only=True):
    """Fetch recent messages from inbox."""
    try:
        conn = _connect()
        if not conn:
            return {"messages": [], "total": 0, "error": "Could not connect to Gmail IMAP"}

        conn.select("INBOX")
        since_date = (datetime.now() - timedelta(days=days)).strftime("%d-%b-%Y")

        criteria = f'(SINCE {since_date})'
        if unread_only:
            criteria = f'(UNSEEN SINCE {since_date})'

        _, msg_ids = conn.search(None, criteria)
        messages = []

        for mid in msg_ids[0].split()[:100]:  # Cap at 100
            _, data = conn.fetch(mid, "(RFC822)")
            msg = email.message_from_bytes(data[0][1])
            messages.append(_parse_message(msg))

        conn.logout()
        return {"messages": messages, "total": len(messages)}

    except Exception as e:
        return {"messages": [], "total": 0, "error": str(e)}


def check_replies_for_pipeline():
    """Cross-reference inbox against pipeline prospect emails."""
    try:
        pipeline = load_pipeline()
        prospect_emails = {}
        for p in pipeline["prospects"]:
            em = p.get("email", "").lower()
            if em:
                prospect_emails[em] = p

        if not prospect_emails:
            return {"replies": [], "bounces": [], "opt_outs": [], "message": "No prospect emails in pipeline"}

        conn = _connect()
        if not conn:
            return {"replies": [], "bounces": [], "opt_outs": [], "error": "Could not connect"}

        conn.select("INBOX")
        since_date = (datetime.now() - timedelta(days=14)).strftime("%d-%b-%Y")

        replies = []
        bounces = []
        opt_outs = []

        # Check for replies from prospects
        for em in prospect_emails:
            _, msg_ids = conn.search(None, f'(FROM "{em}" SINCE {since_date})')
            for mid in msg_ids[0].split():
                _, data = conn.fetch(mid, "(RFC822)")
                msg = email.message_from_bytes(data[0][1])
                parsed = _parse_message(msg)
                parsed["prospect_id"] = prospect_emails[em].get("id")
                parsed["prospect_name"] = prospect_emails[em].get("name")

                body = parsed.get("body_preview", "").lower()
                if _is_opt_out(body):
                    opt_outs.append(parsed)
                else:
                    replies.append(parsed)

        # Check for bounces
        bounce_terms = ["mailer-daemon", "postmaster", "delivery", "returned", "undeliverable"]
        for term in bounce_terms:
            _, msg_ids = conn.search(None, f'(FROM "{term}" SINCE {since_date})')
            for mid in msg_ids[0].split():
                _, data = conn.fetch(mid, "(RFC822)")
                msg = email.message_from_bytes(data[0][1])
                parsed = _parse_message(msg)

                # Try to match bounce to a prospect
                body = parsed.get("body_preview", "")
                for em, prospect in prospect_emails.items():
                    if em in body.lower():
                        parsed["prospect_id"] = prospect.get("id")
                        parsed["prospect_email"] = em
                        break

                bounces.append(parsed)

        conn.logout()
        return {"replies": replies, "bounces": bounces, "opt_outs": opt_outs}

    except Exception as e:
        return {"replies": [], "bounces": [], "opt_outs": [], "error": str(e)}


def search_from(sender_email):
    """Search for all messages from a specific sender."""
    try:
        conn = _connect()
        if not conn:
            return {"messages": [], "total": 0, "error": "Could not connect"}

        conn.select("INBOX")
        _, msg_ids = conn.search(None, f'(FROM "{sender_email}")')
        messages = []

        for mid in msg_ids[0].split()[:50]:
            _, data = conn.fetch(mid, "(RFC822)")
            msg = email.message_from_bytes(data[0][1])
            messages.append(_parse_message(msg))

        conn.logout()
        return {"messages": messages, "total": len(messages)}

    except Exception as e:
        return {"messages": [], "total": 0, "error": str(e)}


def _connect():
    """Connect to Gmail IMAP."""
    addr = get_gmail_address()
    pwd = get_gmail_password()
    if not addr or not pwd:
        return None
    try:
        conn = imaplib.IMAP4_SSL(GMAIL_IMAP_HOST, GMAIL_IMAP_PORT)
        conn.login(addr, pwd)
        return conn
    except Exception:
        return None


def _parse_message(msg):
    """Parse an email message into a dict."""
    subject = _decode_header(msg.get("Subject", ""))
    from_addr = _decode_header(msg.get("From", ""))
    date_str = msg.get("Date", "")
    message_id = msg.get("Message-ID", "")

    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                try:
                    body = part.get_payload(decode=True).decode("utf-8", errors="replace")
                except Exception:
                    body = str(part.get_payload())
                break
    else:
        try:
            body = msg.get_payload(decode=True).decode("utf-8", errors="replace")
        except Exception:
            body = str(msg.get_payload())

    return {
        "from": from_addr,
        "subject": subject,
        "date": date_str,
        "body_preview": body[:200] if body else "",
        "message_id": message_id,
    }


def _decode_header(value):
    """Decode an email header value."""
    if not value:
        return ""
    decoded_parts = decode_header(value)
    result = ""
    for part, charset in decoded_parts:
        if isinstance(part, bytes):
            result += part.decode(charset or "utf-8", errors="replace")
        else:
            result += part
    return result


def _is_opt_out(text):
    """Check if text contains opt-out language."""
    opt_out_phrases = ["stop", "unsubscribe", "remove me", "opt out", "opt-out", "don't contact", "do not contact"]
    text_lower = text.lower()
    return any(phrase in text_lower for phrase in opt_out_phrases)
