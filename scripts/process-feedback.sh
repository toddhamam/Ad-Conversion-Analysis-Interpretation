#!/bin/bash
# process-feedback.sh — Fetch pending user feedback and generate implementation plans via Claude Code
#
# Usage:
#   FEEDBACK_API_URL=https://www.convertraiq.com FEEDBACK_SCRIPT_SECRET=xxx ./scripts/process-feedback.sh
#
# Prerequisites:
#   - jq (brew install jq)
#   - claude CLI (Claude Code) installed and authenticated
#
# Can be scheduled via cron or macOS launchd:
#   crontab: 0 */2 * * * FEEDBACK_API_URL=https://www.convertraiq.com FEEDBACK_SCRIPT_SECRET=xxx /path/to/scripts/process-feedback.sh
#
# launchd plist example at the bottom of this file.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PLANS_DIR="$PROJECT_DIR/feedback/plans"
LOG_PREFIX="[process-feedback]"

# Configuration (set via env vars)
API_URL="${FEEDBACK_API_URL:?$LOG_PREFIX FEEDBACK_API_URL is required (e.g. https://www.convertraiq.com)}"
SECRET="${FEEDBACK_SCRIPT_SECRET:?$LOG_PREFIX FEEDBACK_SCRIPT_SECRET is required}"

# Ensure plans directory exists
mkdir -p "$PLANS_DIR"

echo "$LOG_PREFIX $(date '+%Y-%m-%d %H:%M:%S') — Fetching pending feedback..."

# Fetch all pending feedback items
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $SECRET" \
  "$API_URL/api/feedback/pending")

HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
  echo "$LOG_PREFIX Error fetching feedback: HTTP $HTTP_CODE"
  echo "$BODY"
  exit 1
fi

# Count items
COUNT=$(echo "$BODY" | jq 'length')

if [ "$COUNT" = "0" ] || [ "$COUNT" = "null" ]; then
  echo "$LOG_PREFIX No pending feedback to process."
  exit 0
fi

echo "$LOG_PREFIX Found $COUNT pending feedback item(s)."

# Process each feedback item
echo "$BODY" | jq -c '.[]' | while IFS= read -r item; do
  ID=$(echo "$item" | jq -r '.id')
  TYPE=$(echo "$item" | jq -r '.type')
  TITLE=$(echo "$item" | jq -r '.title')
  DESCRIPTION=$(echo "$item" | jq -r '.description')
  PAGE_URL=$(echo "$item" | jq -r '.page_url // "N/A"')
  CREATED_AT=$(echo "$item" | jq -r '.created_at')
  PLAN_FILE="$PLANS_DIR/$ID.md"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "$LOG_PREFIX Processing: $TITLE"
  echo "$LOG_PREFIX Type: $TYPE | ID: $ID"
  echo "$LOG_PREFIX Submitted: $CREATED_AT"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Mark as 'planning' (in-progress)
  PLANNING_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
    -H "Authorization: Bearer $SECRET" \
    -H "Content-Type: application/json" \
    -d "{\"id\": \"$ID\", \"status\": \"planning\"}" \
    "$API_URL/api/feedback/script-update" 2>&1) || true
  if [ "$PLANNING_RESPONSE" != "200" ]; then
    echo "$LOG_PREFIX Warning: Failed to mark feedback as 'planning' (HTTP $PLANNING_RESPONSE)"
  fi

  # Build the Claude Code prompt
  PROMPT="You are a senior software architect analyzing user feedback for the Convertra SaaS platform.

## Feedback Details
- **Type**: $TYPE
- **Title**: $TITLE
- **Description**: $DESCRIPTION
- **Page URL**: $PAGE_URL
- **Submitted**: $CREATED_AT

## Your Task
1. Read the CLAUDE.md file at the project root to understand the codebase architecture, stack, constraints, and conventions.
2. Explore the relevant source files mentioned in CLAUDE.md to understand the current implementation of the area this feedback relates to.
3. Write a detailed implementation plan as a markdown file.

Write the plan to this exact path: $PLAN_FILE

## Plan File Structure
Use this exact structure:

# Implementation Plan: [Title]

## Original Feedback
- **Type**: [feature_request or bug_report]
- **Title**: [title]
- **Description**: [description]
- **Submitted from**: [page URL]
- **Date**: [created_at]

## Complexity Estimate
[Low / Medium / High] — [Brief justification in 1-2 sentences]

## Summary
[2-3 sentence summary of what needs to be done and why]

## Affected Files
List each file that needs changes with a brief description:
- \`path/to/file.ts\` — [What changes are needed]

## Implementation Steps

### Step 1: [Title]
[Detailed description including code snippets where helpful]

### Step 2: [Title]
[Continue for each step]

## Testing Checklist
- [ ] [Specific test case 1]
- [ ] [Specific test case 2]

## Risks & Considerations
- [Any risks, edge cases, or things to watch out for]
- [Dependencies on other features or external services]

---
*Plan generated automatically by ConversionIQ™ feedback pipeline*"

  # Invoke Claude Code CLI in print mode
  echo "$LOG_PREFIX Generating plan with Claude Code..."
  if claude -p "$PROMPT" --cwd "$PROJECT_DIR" 2>&1; then
    # Verify plan file was created
    if [ -f "$PLAN_FILE" ]; then
      echo "$LOG_PREFIX Plan generated: $PLAN_FILE"

      # Update status to 'planned' and record the plan file path
      UPDATE_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
        -H "Authorization: Bearer $SECRET" \
        -H "Content-Type: application/json" \
        -d "{\"id\": \"$ID\", \"status\": \"planned\", \"plan_file_path\": \"feedback/plans/$ID.md\"}" \
        "$API_URL/api/feedback/script-update" 2>&1) || true
      if [ "$UPDATE_RESPONSE" = "200" ]; then
        echo "$LOG_PREFIX Status updated to 'planned'."
      else
        echo "$LOG_PREFIX Warning: Failed to update status to 'planned' (HTTP $UPDATE_RESPONSE)"
      fi
    else
      echo "$LOG_PREFIX Warning: Claude Code did not create the plan file at $PLAN_FILE"
      # Revert status back to pending so it gets picked up next run
      REVERT_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
        -H "Authorization: Bearer $SECRET" \
        -H "Content-Type: application/json" \
        -d "{\"id\": \"$ID\", \"status\": \"pending\"}" \
        "$API_URL/api/feedback/script-update" 2>&1) || true
      if [ "$REVERT_RESPONSE" != "200" ]; then
        echo "$LOG_PREFIX Warning: Failed to revert status to 'pending' (HTTP $REVERT_RESPONSE)"
      fi
    fi
  else
    echo "$LOG_PREFIX Error: Claude Code failed for feedback $ID"
    # Revert status back to pending
    REVERT_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
      -H "Authorization: Bearer $SECRET" \
      -H "Content-Type: application/json" \
      -d "{\"id\": \"$ID\", \"status\": \"pending\"}" \
      "$API_URL/api/feedback/script-update" 2>&1) || true
    if [ "$REVERT_RESPONSE" != "200" ]; then
      echo "$LOG_PREFIX Warning: Failed to revert status to 'pending' (HTTP $REVERT_RESPONSE)"
    fi
  fi
done

echo ""
echo "$LOG_PREFIX $(date '+%Y-%m-%d %H:%M:%S') — Done processing feedback."

# ─────────────────────────────────────────────────────────────────────────────
# macOS launchd plist reference (save to ~/Library/LaunchAgents/com.convertra.process-feedback.plist):
#
# <?xml version="1.0" encoding="UTF-8"?>
# <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
#   "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
# <plist version="1.0">
# <dict>
#   <key>Label</key>
#   <string>com.convertra.process-feedback</string>
#   <key>ProgramArguments</key>
#   <array>
#     <string>/Users/toddhamam/conductor/workspaces/Ad-Conversion-Analysis-Interpretation/cairo-v7/scripts/process-feedback.sh</string>
#   </array>
#   <key>EnvironmentVariables</key>
#   <dict>
#     <key>FEEDBACK_API_URL</key>
#     <string>https://www.convertraiq.com</string>
#     <key>FEEDBACK_SCRIPT_SECRET</key>
#     <string>your-secret-here</string>
#     <key>PATH</key>
#     <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
#   </dict>
#   <key>StartInterval</key>
#   <integer>7200</integer>
#   <key>StandardOutPath</key>
#   <string>/tmp/process-feedback.log</string>
#   <key>StandardErrorPath</key>
#   <string>/tmp/process-feedback.err</string>
# </dict>
# </plist>
#
# Load:   launchctl load ~/Library/LaunchAgents/com.convertra.process-feedback.plist
# Unload: launchctl unload ~/Library/LaunchAgents/com.convertra.process-feedback.plist
# ─────────────────────────────────────────────────────────────────────────────
