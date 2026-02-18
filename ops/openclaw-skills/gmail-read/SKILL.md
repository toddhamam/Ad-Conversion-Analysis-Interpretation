---
name: gmail-read
description: Read, search, and manage Gmail inbox via IMAP. Check for replies, monitor bounce-backs, and track email engagement.
user-invocable: true
metadata: {"openclaw":{"emoji":"📥","requires":{"bins":["python3"],"env":["GMAIL_ADDRESS","GMAIL_APP_PASSWORD"]},"primaryEnv":"GMAIL_APP_PASSWORD"}}
---

# Gmail Read — IMAP Inbox Management

You can read and manage the Gmail inbox using Python's built-in `imaplib` via the `exec` tool.

## Prerequisites

Same credentials as gmail-send:
- `GMAIL_ADDRESS` — the full Gmail address
- `GMAIL_APP_PASSWORD` — Google App Password

IMAP must be enabled on the Gmail account:
1. Go to Gmail Settings > Forwarding and POP/IMAP
2. Enable IMAP Access
3. Save changes

## Check for Recent Replies

Use this to monitor for responses to outreach emails:

```bash
python3 << 'PYEOF'
import imaplib, email, os, json
from email.header import decode_header
from datetime import datetime, timedelta

address = os.environ['GMAIL_ADDRESS']
password = os.environ['GMAIL_APP_PASSWORD']

mail = imaplib.IMAP4_SSL('imap.gmail.com')
mail.login(address, password)
mail.select('INBOX')

# Search for emails from the last 3 days
since_date = (datetime.now() - timedelta(days=3)).strftime('%d-%b-%Y')
status, messages = mail.search(None, f'(SINCE {since_date} UNSEEN)')

results = []
if status == 'OK':
    for msg_id in messages[0].split():
        status, msg_data = mail.fetch(msg_id, '(RFC822)')
        if status != 'OK':
            continue
        msg = email.message_from_bytes(msg_data[0][1])

        subject = decode_header(msg['Subject'])[0][0]
        if isinstance(subject, bytes):
            subject = subject.decode()

        from_addr = msg['From']
        date = msg['Date']

        body = ''
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == 'text/plain':
                    body = part.get_payload(decode=True).decode(errors='replace')
                    break
        else:
            body = msg.get_payload(decode=True).decode(errors='replace')

        results.append({
            'from': from_addr,
            'subject': subject,
            'date': date,
            'preview': body[:300]
        })

print(json.dumps(results, indent=2))
mail.logout()
PYEOF
```

## Search for Emails from Specific Senders

Cross-reference with your pipeline to find replies from prospects:

```bash
python3 << 'PYEOF'
import imaplib, email, os, json
from email.header import decode_header

address = os.environ['GMAIL_ADDRESS']
password = os.environ['GMAIL_APP_PASSWORD']

# The email address to search for
target_sender = "prospect@example.com"

mail = imaplib.IMAP4_SSL('imap.gmail.com')
mail.login(address, password)
mail.select('INBOX')

status, messages = mail.search(None, f'(FROM "{target_sender}")')

results = []
if status == 'OK':
    for msg_id in messages[0].split():
        status, msg_data = mail.fetch(msg_id, '(RFC822)')
        if status != 'OK':
            continue
        msg = email.message_from_bytes(msg_data[0][1])

        subject = decode_header(msg['Subject'])[0][0]
        if isinstance(subject, bytes):
            subject = subject.decode()

        body = ''
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == 'text/plain':
                    body = part.get_payload(decode=True).decode(errors='replace')
                    break
        else:
            body = msg.get_payload(decode=True).decode(errors='replace')

        results.append({
            'from': msg['From'],
            'subject': subject,
            'date': msg['Date'],
            'body': body[:500]
        })

print(json.dumps(results, indent=2))
mail.logout()
PYEOF
```

## Check for Bounce-backs and Delivery Failures

Monitor for failed deliveries to clean your prospect list:

```bash
python3 << 'PYEOF'
import imaplib, email, os, json
from email.header import decode_header

address = os.environ['GMAIL_ADDRESS']
password = os.environ['GMAIL_APP_PASSWORD']

mail = imaplib.IMAP4_SSL('imap.gmail.com')
mail.login(address, password)
mail.select('INBOX')

# Search for bounce-back indicators
bounce_queries = [
    '(FROM "mailer-daemon")',
    '(FROM "postmaster")',
    '(SUBJECT "Delivery Status Notification")',
    '(SUBJECT "Undeliverable")',
    '(SUBJECT "Mail delivery failed")',
]

bounced = []
for query in bounce_queries:
    status, messages = mail.search(None, query)
    if status == 'OK':
        for msg_id in messages[0].split():
            status, msg_data = mail.fetch(msg_id, '(RFC822)')
            if status != 'OK':
                continue
            msg = email.message_from_bytes(msg_data[0][1])

            body = ''
            if msg.is_multipart():
                for part in msg.walk():
                    if part.get_content_type() == 'text/plain':
                        body = part.get_payload(decode=True).decode(errors='replace')
                        break
            else:
                body = msg.get_payload(decode=True).decode(errors='replace')

            bounced.append({
                'subject': str(decode_header(msg['Subject'])[0][0]),
                'date': msg['Date'],
                'preview': body[:200]
            })

print(json.dumps(bounced, indent=2))
mail.logout()
PYEOF
```

## Check Sent Folder for Send History

Verify what's already been sent to avoid duplicates:

```bash
python3 << 'PYEOF'
import imaplib, email, os, json
from email.header import decode_header
from datetime import datetime, timedelta

address = os.environ['GMAIL_ADDRESS']
password = os.environ['GMAIL_APP_PASSWORD']

mail = imaplib.IMAP4_SSL('imap.gmail.com')
mail.login(address, password)
mail.select('"[Gmail]/Sent Mail"')

since_date = (datetime.now() - timedelta(days=7)).strftime('%d-%b-%Y')
status, messages = mail.search(None, f'(SINCE {since_date})')

sent = []
if status == 'OK':
    for msg_id in messages[0].split():
        status, msg_data = mail.fetch(msg_id, '(RFC822)')
        if status != 'OK':
            continue
        msg = email.message_from_bytes(msg_data[0][1])

        subject = decode_header(msg['Subject'])[0][0]
        if isinstance(subject, bytes):
            subject = subject.decode()

        sent.append({
            'to': msg['To'],
            'subject': subject,
            'date': msg['Date']
        })

print(json.dumps(sent, indent=2))
mail.logout()
PYEOF
```

## Daily Inbox Check Routine

Run this every morning to get a full status update:

1. Check for unread replies (potential leads responding)
2. Check for bounce-backs (clean your list)
3. Check for unsubscribe requests (honor them immediately)
4. Cross-reference with pipeline.json to update prospect stages

## Important Rules

1. **Always check for replies before sending follow-ups** — never follow up on someone who already replied
2. **Honor unsubscribe requests immediately** — mark them as "opted_out" in the pipeline
3. **Log bounced emails** and mark those prospects as "invalid_email" in the pipeline
4. **Check sent folder** before new sends to prevent accidental double-sends
5. **Rate limit IMAP connections** — don't poll more than once every 15 minutes
