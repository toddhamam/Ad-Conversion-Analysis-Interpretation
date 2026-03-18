#!/usr/bin/env bash
# =============================================================================
# Meta Developer Policy Static Check
# =============================================================================
#
# Runs on PR diffs to catch Meta API policy violations before they merge.
# Exit code 0 = pass, 1 = violations found.
#
# Usage:
#   ./scripts/check-meta-policy.sh              # Check staged/uncommitted changes
#   ./scripts/check-meta-policy.sh --diff HEAD~1 # Check specific diff range
#   ./scripts/check-meta-policy.sh --all         # Check all source files (CI full scan)
#
# Categories:
#   [TOKEN]    - Access token exposure risk
#   [RATE]     - Rate limit / bot detection risk
#   [PROXY]    - Backend proxy bypass risk
#   [PERF]     - Performance issue that can crash the UI
#   [GUARD]    - Policy guard bypass risk
#   [SECURITY] - General security risk
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BOLD='\033[1m'
NC='\033[0m'

VIOLATIONS=0
WARNINGS=0

# Determine which files to check
if [[ "${1:-}" == "--all" ]]; then
  # Full scan — all source files
  FILES=$(find src api -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' \) 2>/dev/null | sort)
elif [[ "${1:-}" == "--diff" ]]; then
  # Diff against a specific ref
  REF="${2:-main}"
  FILES=$(git diff --name-only --diff-filter=ACMR "$REF" -- 'src/**' 'api/**' 2>/dev/null | sort)
else
  # Default: staged + unstaged changes
  FILES=$(git diff --name-only --diff-filter=ACMR HEAD -- 'src/**' 'api/**' 2>/dev/null || \
          git diff --name-only --diff-filter=ACMR -- 'src/**' 'api/**' 2>/dev/null || true)
fi

if [[ -z "$FILES" ]]; then
  echo -e "${GREEN}No changed files to check.${NC}"
  exit 0
fi

echo -e "${BOLD}Meta Developer Policy Check${NC}"
echo "Checking $(echo "$FILES" | wc -l | tr -d ' ') files..."
echo ""

# Helper: report a violation
violation() {
  local category="$1"
  local file="$2"
  local line="$3"
  local message="$4"
  echo -e "  ${RED}FAIL${NC} ${BOLD}[$category]${NC} $file:$line"
  echo -e "       $message"
  echo ""
  VIOLATIONS=$((VIOLATIONS + 1))
}

# Helper: report a warning
warn() {
  local category="$1"
  local file="$2"
  local line="$3"
  local message="$4"
  echo -e "  ${YELLOW}WARN${NC} ${BOLD}[$category]${NC} $file:$line"
  echo -e "       $message"
  echo ""
  WARNINGS=$((WARNINGS + 1))
}

# =============================================================================
# CHECK 1: Direct fetch to Meta Graph API from frontend (bypass proxy)
# =============================================================================
# Frontend code must NEVER call graph.facebook.com directly.
# All calls must go through /api/meta/proxy via metaProxy().
echo -e "${BOLD}[1/8] Checking for direct Meta Graph API calls in frontend...${NC}"
while IFS= read -r file; do
  [[ "$file" == api/* ]] && continue  # Backend is allowed to call Meta directly
  [[ "$file" == *metaApi* ]] && continue  # metaApi.ts is the service layer (defines base URL constant)
  [[ "$file" == *metaDevPolicyGuard* ]] && continue  # Guard itself is allowed
  [[ "$file" == *meta-api-guard* ]] && continue  # Backend guard
  if [[ -f "$file" ]]; then
    while IFS=: read -r linenum content; do
      # Skip comments
      [[ "$content" =~ ^[[:space:]]*//.* ]] && continue
      [[ "$content" =~ ^[[:space:]]*\*.* ]] && continue
      violation "PROXY" "$file" "$linenum" \
        "Direct fetch to graph.facebook.com — must use metaProxy() via /api/meta/proxy"
    done < <(grep -n 'graph\.facebook\.com' "$file" 2>/dev/null || true)
  fi
done <<< "$FILES"

# =============================================================================
# CHECK 2: Meta access tokens in frontend code
# =============================================================================
# Tokens must never appear in browser-reachable code except as env var references
# for dev fallback.
echo -e "${BOLD}[2/8] Checking for Meta token exposure in frontend...${NC}"
while IFS= read -r file; do
  [[ "$file" == api/* ]] && continue  # Backend handles tokens
  [[ "$file" == *metaApi* ]] && continue  # metaApi.ts has VITE_ fallbacks (allowed)
  [[ "$file" == *.css ]] && continue
  if [[ -f "$file" ]]; then
    # Check for hardcoded token patterns (EAA... is Meta's token prefix)
    while IFS=: read -r linenum content; do
      [[ "$content" =~ ^[[:space:]]*//.* ]] && continue
      violation "TOKEN" "$file" "$linenum" \
        "Hardcoded Meta access token detected — tokens must never be in frontend code"
    done < <(grep -n 'EAA[A-Za-z0-9]\{20,\}' "$file" 2>/dev/null || true)

    # Check for access_token in query params (sending token to browser-visible URLs)
    while IFS=: read -r linenum content; do
      [[ "$content" =~ ^[[:space:]]*//.* ]] && continue
      [[ "$content" =~ ^[[:space:]]*\*.* ]] && continue
      # Allow references in comments/docs and VITE_ env var usage
      [[ "$content" =~ VITE_META_ACCESS_TOKEN ]] && continue
      [[ "$content" =~ access_token_encrypted ]] && continue
      [[ "$content" =~ \'access_token\' ]] && continue  # String literal key reference
      [[ "$content" =~ \"access_token\" ]] && continue  # String literal key reference
      violation "TOKEN" "$file" "$linenum" \
        "access_token in query/URL params — tokens must route through backend proxy"
    done < <(grep -n 'access_token=' "$file" 2>/dev/null || true)
  fi
done <<< "$FILES"

# =============================================================================
# CHECK 3: Unbounded Promise.all for Meta API calls
# =============================================================================
# Promise.all with Meta API calls fires all requests simultaneously, triggering
# Meta's bot detection. Must use batchProcess() instead.
echo -e "${BOLD}[3/8] Checking for unbounded Promise.all with Meta API calls...${NC}"
while IFS= read -r file; do
  [[ "$file" == *.css ]] && continue
  [[ "$file" == *metaDevPolicyGuard* ]] && continue
  if [[ -f "$file" ]]; then
    # Check if file uses Meta API functions AND has Promise.all
    if grep -q 'metaProxy\|metaFetch\|guardedFetch\|fetchAd\|fetchCampaign' "$file" 2>/dev/null; then
      while IFS=: read -r linenum content; do
        [[ "$content" =~ ^[[:space:]]*//.* ]] && continue
        # Promise.all with .map is the risky pattern
        warn "RATE" "$file" "$linenum" \
          "Promise.all in a file that uses Meta API — verify this doesn't batch Meta calls. Use batchProcess() for Meta API arrays."
      done < <(grep -n 'Promise\.all.*\.map\|Promise\.all.*fetch\|Promise\.allSettled.*meta' "$file" 2>/dev/null || true)
    fi
  fi
done <<< "$FILES"

# =============================================================================
# CHECK 4: Missing AbortController timeout on external API fetch calls
# =============================================================================
# fetch() without AbortController can hang for 5+ minutes (browser default).
# External API calls must have explicit timeouts.
echo -e "${BOLD}[4/8] Checking for fetch calls without AbortController timeout...${NC}"
while IFS= read -r file; do
  [[ "$file" == api/* ]] && continue  # Backend has different timeout patterns
  [[ "$file" == *.css ]] && continue
  [[ "$file" == *metaDevPolicyGuard* ]] && continue
  if [[ -f "$file" ]]; then
    # Files making external API calls should have AbortController
    if grep -q 'generativelanguage\.googleapis\.com\|api\.openai\.com' "$file" 2>/dev/null; then
      if ! grep -q 'AbortController\|signal' "$file" 2>/dev/null; then
        warn "PERF" "$file" "0" \
          "File makes external API calls but has no AbortController — risk of indefinite hangs"
      fi
    fi
  fi
done <<< "$FILES"

# =============================================================================
# CHECK 5: CSS transition: all (causes browser crashes with base64 images)
# =============================================================================
echo -e "${BOLD}[5/8] Checking for CSS 'transition: all' (causes UI crashes)...${NC}"
while IFS= read -r file; do
  if [[ -f "$file" ]]; then
    while IFS=: read -r linenum content; do
      [[ "$content" =~ ^[[:space:]]*/\*.* ]] && continue
      violation "PERF" "$file" "$linenum" \
        "transition: all causes browser crashes when base64 images render. List specific properties instead."
    done < <(grep -n 'transition:[[:space:]]*all' "$file" 2>/dev/null || true)
  fi
done <<< "$FILES"

# =============================================================================
# CHECK 6: New api/*.ts files (Vercel 12 function limit)
# =============================================================================
echo -e "${BOLD}[6/8] Checking Vercel serverless function count (max 12)...${NC}"
SERVERLESS_COUNT=$(find api -maxdepth 1 -name '*.ts' -not -path 'api/_lib/*' 2>/dev/null | wc -l | tr -d ' ')
SERVERLESS_COUNT=$((SERVERLESS_COUNT + $(find api/billing api/funnel api/admin api/auth -name '*.ts' 2>/dev/null | wc -l | tr -d ' ')))
if [[ $SERVERLESS_COUNT -gt 12 ]]; then
  violation "SECURITY" "api/" "0" \
    "Serverless function count is $SERVERLESS_COUNT (max 12). Consolidate into existing catch-all handlers."
elif [[ $SERVERLESS_COUNT -eq 12 ]]; then
  echo -e "  ${GREEN}OK${NC} Function count: $SERVERLESS_COUNT/12 (at limit — no new api/*.ts files allowed)"
  echo ""
fi

# =============================================================================
# CHECK 7: catch (error: any) — must use catch (error: unknown)
# =============================================================================
echo -e "${BOLD}[7/8] Checking for catch (error: any)...${NC}"
while IFS= read -r file; do
  [[ "$file" == *.css ]] && continue
  if [[ -f "$file" ]]; then
    while IFS=: read -r linenum content; do
      violation "SECURITY" "$file" "$linenum" \
        "catch (error: any) — must use catch (error: unknown) and narrow the type"
    done < <(grep -n 'catch[[:space:]]*(.*:[[:space:]]*any)' "$file" 2>/dev/null || true)
  fi
done <<< "$FILES"

# =============================================================================
# CHECK 8: Meta API calls bypassing the guard
# =============================================================================
# Any file importing from metaApi.ts that also makes direct fetch() calls
# to /api/meta endpoints should be flagged.
echo -e "${BOLD}[8/8] Checking for Meta API guard bypass patterns...${NC}"
while IFS= read -r file; do
  [[ "$file" == api/* ]] && continue
  [[ "$file" == *.css ]] && continue
  [[ "$file" == *metaApi* ]] && continue  # metaApi.ts itself is the service layer
  [[ "$file" == *metaDevPolicyGuard* ]] && continue
  if [[ -f "$file" ]]; then
    # Check for direct fetch to /api/meta (should use metaApi service)
    while IFS=: read -r linenum content; do
      [[ "$content" =~ ^[[:space:]]*//.* ]] && continue
      [[ "$content" =~ import ]] && continue
      warn "GUARD" "$file" "$linenum" \
        "Direct fetch to /api/meta endpoint — use metaApi.ts service functions instead to ensure guard enforcement"
    done < <(grep -n "fetch.*['\"/]api/meta" "$file" 2>/dev/null || true)
  fi
done <<< "$FILES"

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo "─────────────────────────────────────────"
if [[ $VIOLATIONS -gt 0 ]]; then
  echo -e "${RED}${BOLD}FAILED${NC}: $VIOLATIONS violation(s), $WARNINGS warning(s)"
  echo ""
  echo "Fix all violations before merging. Warnings should be reviewed manually."
  echo "See: .context/meta-developer-policy-reference.md for full policy details."
  exit 1
elif [[ $WARNINGS -gt 0 ]]; then
  echo -e "${YELLOW}${BOLD}PASSED with warnings${NC}: $WARNINGS warning(s)"
  echo ""
  echo "Review warnings manually to ensure Meta policy compliance."
  exit 0
else
  echo -e "${GREEN}${BOLD}PASSED${NC}: No Meta policy violations detected."
  exit 0
fi
