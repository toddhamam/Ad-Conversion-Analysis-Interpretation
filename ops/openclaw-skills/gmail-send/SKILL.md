---
name: gmail-send
description: Send emails via Gmail SMTP. Supports plain text, HTML, attachments, and personalized merge fields for outreach campaigns.
user-invocable: true
metadata: {"openclaw":{"emoji":"📤","requires":{"bins":["python3"],"env":["GMAIL_ADDRESS","GMAIL_APP_PASSWORD"]},"primaryEnv":"GMAIL_APP_PASSWORD"}}
---

# Gmail Send — SMTP Email Sending

You can send emails from the configured Gmail account using Python's built-in `smtplib` via the `exec` tool.

## Prerequisites

Two environment variables must be configured in your OpenClaw agent settings:

- `GMAIL_ADDRESS` — the full Gmail address (e.g. `convertra.ops@gmail.com`)
- `GMAIL_APP_PASSWORD` — a Google App Password (NOT the account password)

To generate an App Password:
1. Go to https://myaccount.google.com/apppasswords
2. The Google account must have 2-Step Verification enabled
3. Create an App Password for "Mail" on "Other (Custom name)" — name it "OpenClaw"
4. Copy the 16-character password (no spaces) into `GMAIL_APP_PASSWORD`

## Sending a Plain Text Email

Use the `exec` tool to run:

```bash
python3 -c "
import smtplib, os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

sender = os.environ['GMAIL_ADDRESS']
password = os.environ['GMAIL_APP_PASSWORD']

msg = MIMEMultipart('alternative')
msg['From'] = f'Your Name <{sender}>'
msg['To'] = 'recipient@example.com'
msg['Subject'] = 'Subject line here'

# Plain text fallback
text_part = MIMEText('Plain text body here', 'plain')
msg.attach(text_part)

with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
    server.login(sender, password)
    server.sendmail(sender, ['recipient@example.com'], msg.as_string())
    print('Email sent successfully')
"
```

## Sending an HTML Email

For professional-looking outreach, use HTML with a plain text fallback:

```bash
python3 -c "
import smtplib, os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

sender = os.environ['GMAIL_ADDRESS']
password = os.environ['GMAIL_APP_PASSWORD']

msg = MIMEMultipart('alternative')
msg['From'] = f'Your Name <{sender}>'
msg['To'] = 'recipient@example.com'
msg['Subject'] = 'Subject here'
msg['Reply-To'] = sender

text_part = MIMEText('Plain text fallback', 'plain')
html_part = MIMEText('<html><body><p>HTML body here</p></body></html>', 'html')
msg.attach(text_part)
msg.attach(html_part)

with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
    server.login(sender, password)
    server.sendmail(sender, ['recipient@example.com'], msg.as_string())
    print('Email sent successfully')
"
```

## Sending Personalized Bulk Emails

When sending to multiple recipients from a prospect list, send each email individually (NOT as BCC) so personalization works and it looks like a 1-to-1 email:

```bash
python3 << 'PYEOF'
import smtplib, os, json, time
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

sender = os.environ['GMAIL_ADDRESS']
password = os.environ['GMAIL_APP_PASSWORD']

# Load prospects from pipeline file
with open('pipeline.json', 'r') as f:
    prospects = json.load(f)

# Filter to those ready for outreach
to_send = [p for p in prospects if p.get('stage') == 'ready_to_send']

with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
    server.login(sender, password)
    for p in to_send:
        msg = MIMEMultipart('alternative')
        msg['From'] = f'Your Name <{sender}>'
        msg['To'] = p['email']
        msg['Subject'] = p.get('subject', 'Quick question')
        msg['Reply-To'] = sender

        body = p.get('email_body', 'Default body')
        msg.attach(MIMEText(body, 'plain'))

        server.sendmail(sender, [p['email']], msg.as_string())
        print(f"Sent to {p['email']}")

        # Delay between sends to avoid spam flags
        time.sleep(45)

print(f"Batch complete: {len(to_send)} emails sent")
PYEOF
```

## Important Rules

1. **Never send more than 20 emails per day** from a new Gmail account (warmup period)
2. **Always use a 30-60 second delay** between individual sends
3. **Never send to more than 50 recipients per day** even after warmup
4. **Always include an unsubscribe line** in outreach emails: "Reply STOP to opt out"
5. **Always personalize** the first line — generic blasts get flagged as spam
6. **Always use the recipient's actual name** in the greeting, never "Dear Sir/Madam"
7. **Log every send** to the pipeline file so follow-ups can be tracked
8. **Check the pipeline file first** before sending to avoid double-sending to the same person

## Error Handling

If sending fails with "Authentication error":
- Verify GMAIL_APP_PASSWORD is set and is a 16-character App Password (not account password)
- Verify 2-Step Verification is enabled on the Google account
- Verify the App Password hasn't been revoked

If sending fails with "Daily limit exceeded":
- Gmail has a 500 emails/day limit for regular accounts
- Stop sending and resume the next day
- Consider staggering sends across multiple days
