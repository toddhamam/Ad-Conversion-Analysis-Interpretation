---
name: email-warmup
description: Gmail account warmup strategy to build sender reputation before cold outreach. Prevents emails from landing in spam.
user-invocable: true
metadata: {"openclaw":{"emoji":"🔥","requires":{"env":["GMAIL_ADDRESS","GMAIL_APP_PASSWORD"]}}}
---

# Email Warmup — Build Sender Reputation

New Gmail accounts (or accounts that haven't sent much email) need to be warmed up before cold outreach. Sending too many emails too fast from a cold account triggers spam filters and can get the account suspended.

## Why Warmup Matters

Gmail uses sender reputation scoring. A new account has zero reputation. If you start blasting 50 cold emails from day one, Gmail will:
- Flag your emails as spam for recipients
- Throttle your sending ability
- Potentially suspend the account

Warmup builds reputation gradually so when you start cold outreach, emails land in the primary inbox.

## Warmup Schedule

### Week 1: Foundation (Days 1-7)

**Daily actions:**
- Send 3-5 emails to known contacts (friends, team members, other accounts you own)
- These should be REAL conversations — not just "test" emails
- Ask recipients to reply to your emails (replies boost reputation)
- Ask recipients to mark your emails as "Not Spam" if they land in spam
- Subscribe to 2-3 newsletters/mailing lists (incoming email builds reputation too)

**What to send:**
- Genuine emails to colleagues about work topics
- Replies to newsletters
- Emails between your own accounts (Gmail to Gmail, Gmail to Outlook)
- Calendar invites to real events

### Week 2: Ramp Up (Days 8-14)

**Daily actions:**
- Send 8-10 emails
- Mix of:
  - 3-4 emails to known contacts
  - 3-4 replies to threads
  - 2-3 new conversations
- Continue engaging with incoming email (reply to everything)
- Start sending a few emails to non-Gmail addresses (Outlook, Yahoo) to build cross-platform reputation

### Week 3: Pre-Outreach (Days 15-21)

**Daily actions:**
- Send 15-20 emails
- Mix of:
  - 5 emails to known contacts
  - 5-10 light outreach (reaching out to people you've met, former colleagues)
  - 5 replies to threads
- Monitor deliverability — ask a few recipients if emails are landing in primary inbox
- Check for any bounce-backs or delivery warnings

### Week 4: Begin Outreach (Days 22-28)

**Daily actions:**
- 20 total emails:
  - 10 warm/genuine emails
  - 10 cold outreach emails
- Monitor closely:
  - Are cold emails getting replies? (good sign)
  - Any bounce-backs? (check email validity)
  - Any spam complaints? (revise copy immediately)

### Week 5+: Steady State

**Daily maximums:**
- 40-50 total emails (mix of warm and cold)
- Never more than 30 cold emails in a single day
- Always maintain some warm/genuine email activity

## Technical Setup Checklist

Before starting warmup, ensure these are configured:

### 1. SPF Record
The Gmail account should have SPF configured. For `@gmail.com` addresses, Google handles this automatically. For custom domains, add to DNS:
```
TXT record: v=spf1 include:_spf.google.com ~all
```

### 2. DKIM
For `@gmail.com` addresses, DKIM is automatic. For Google Workspace custom domains, enable in Admin Console > Apps > Google Workspace > Gmail > Authenticate Email.

### 3. DMARC (custom domains only)
Add DNS record:
```
_dmarc.yourdomain.com TXT "v=DMARC1; p=none; rua=mailto:admin@yourdomain.com"
```

### 4. Email Signature
Set up a professional signature in Gmail:
- Full name
- Title
- Company name
- One link (website or LinkedIn — not both)
- Keep it simple, no images

### 5. Profile Picture
Upload a real photo to the Google account — emails from accounts with profile pictures get better engagement.

### 6. Enable 2-Step Verification
Required for App Password generation.

## Deliverability Monitoring

During warmup, regularly check:

**Check 1: Send a test email to a fresh Gmail account**
- Did it land in Primary, Promotions, or Spam?
- Primary = good, Promotions = okay, Spam = stop and troubleshoot

**Check 2: Send a test to Outlook/Hotmail**
- These providers are stricter — if it lands in inbox, your reputation is building well

**Check 3: Monitor bounce rate**
- Above 3% = pause and clean your list
- Above 5% = serious issue, stop all outreach

**Check 4: Monitor reply rate**
- Below 1% after 50+ sends = your emails may be landing in spam
- Revise subject lines and opening lines

## Red Flags — Stop Immediately If:

- Gmail shows a "Your account has been temporarily suspended" warning
- Bounce rate exceeds 5%
- Multiple recipients report your email as spam
- You receive a Google warning about unusual activity
- Reply rate drops below 1% suddenly (emails likely going to spam)

## Recovery If Flagged

If the account gets flagged:
1. Stop ALL cold outreach immediately
2. Go back to Week 1 warmup activities only
3. Send only to known contacts for 2 weeks
4. Ensure all recipients are engaging (opening + replying)
5. Gradually reintroduce cold outreach after reputation recovers
