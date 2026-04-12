---
name: email-warmup
description: Gmail account warmup strategy to build sender reputation before cold outreach. Prevents emails from landing in spam.
user-invocable: true
metadata: {"openclaw":{"emoji":"🔥","requires":{"env":["GMAIL_ADDRESS","GMAIL_APP_PASSWORD"]}}}
---

# Email Warmup — Build Sender Reputation

Monitor warmup progress and enforce daily send limits using the Convertra Leads CLI. The CLI tracks warmup week and enforces limits automatically.

## Commands

### Check Warmup Status

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py mail daily-status
```

Returns: `sent_today`, `limit`, `remaining`, `warmup_week`, `start_date`.

### View Campaign Metrics

```bash
exec python3 /home/ubuntu/convertra-leads/cli.py report daily
```

Returns send counts, bounce rate, reply rate — key deliverability indicators.

## Warmup Schedule

The CLI enforces these limits automatically. You cannot exceed them.

| Week | Daily Limit | Activities |
|------|-------------|------------|
| 1 (Days 1-7) | 5/day | Send to known contacts, get replies, subscribe to newsletters |
| 2 (Days 8-14) | 10/day | Mix of warm emails + a few new conversations |
| 3 (Days 15-21) | 20/day | Start light outreach to people you've met |
| 4 (Days 22-28) | 20/day | 10 warm + 10 cold outreach emails |
| 5+ | 40/day | Steady state — mix of warm and cold |

Maximum: 50 emails/day regardless of warmup stage.

## Technical Setup Checklist

Before starting warmup, ensure:

1. **SPF Record**: For custom domains, add DNS TXT: `v=spf1 include:_spf.google.com ~all`
2. **DKIM**: Enable in Google Workspace Admin Console (automatic for @gmail.com)
3. **DMARC**: For custom domains, add DNS: `_dmarc.yourdomain.com TXT "v=DMARC1; p=none"`
4. **2-Step Verification**: Required for App Password generation
5. **IMAP Enabled**: Gmail Settings > Forwarding and POP/IMAP > Enable IMAP
6. **Profile Picture**: Upload a real photo to the Google account
7. **Email Signature**: Set up in Gmail — name, title, company, one link

## Deliverability Monitoring

Check these regularly:

```bash
# Daily send status + warmup week
exec python3 /home/ubuntu/convertra-leads/cli.py mail daily-status

# Campaign metrics including bounce and reply rates
exec python3 /home/ubuntu/convertra-leads/cli.py report daily
```

**Red flags — stop immediately if:**
- Bounce rate exceeds 5%
- Reply rate drops below 1% after 50+ sends
- Gmail shows account suspension warning
- Multiple spam complaints

**Recovery if flagged:**
1. Stop ALL cold outreach
2. Send only to known contacts for 2 weeks
3. Ensure all recipients engage (open + reply)
4. Gradually reintroduce cold outreach

## When to Use AI

Never. Warmup monitoring is purely mechanical — check limits and metrics via the CLI.
