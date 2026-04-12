#!/usr/bin/env python3
"""Phase 0 Spike — Prove Managed Agents API event loop works.

Standalone script that:
1. Creates an environment (Python + requests + bs4, unrestricted networking)
2. Creates a research agent with web_search + web_fetch tools
3. Starts a session, sends a prospect URL, streams events
4. Handles the SSE event loop with custom tool round-trips
5. Prints result and cost metrics

Usage:
    export ANTHROPIC_API_KEY=sk-ant-...
    python3 spike_agent.py https://example-dtc-brand.com

Prerequisites:
    pip install httpx
"""

import json
import os
import sys
import time

import httpx

# ─── Configuration ────────────────────────────────────────────────────

API_BASE = "https://api.anthropic.com"
BETA_HEADER = "managed-agents-2026-04-01"
SESSION_TIMEOUT_SECONDS = 120

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
if not ANTHROPIC_API_KEY:
    print("ERROR: ANTHROPIC_API_KEY not set. Export it before running.")
    sys.exit(1)


# ─── API Helpers ──────────────────────────────────────────────────────

def _headers():
    return {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": BETA_HEADER,
        "content-type": "application/json",
    }


def _api_post(path, data=None):
    """POST to Anthropic API and return parsed JSON."""
    url = f"{API_BASE}{path}"
    resp = httpx.post(url, headers=_headers(), json=data or {}, timeout=30)
    if resp.status_code not in (200, 201):
        print(f"API ERROR {resp.status_code}: {resp.text[:500]}")
        raise RuntimeError(f"API {resp.status_code}: {resp.text[:200]}")
    return resp.json()


def _api_get(path, params=None):
    """GET from Anthropic API and return parsed JSON."""
    url = f"{API_BASE}{path}"
    resp = httpx.get(url, headers=_headers(), params=params, timeout=30)
    if resp.status_code != 200:
        raise RuntimeError(f"API {resp.status_code}: {resp.text[:200]}")
    return resp.json()


# ─── Resource Setup ───────────────────────────────────────────────────

def create_environment():
    """Create a reusable environment with Python packages."""
    print("[spike] Creating environment...")
    env = _api_post("/v1/environments", {
        "name": "convertra-research-env-spike",
        "pip": ["requests", "beautifulsoup4"],
        "networking": "unrestricted",
    })
    env_id = env["id"]
    print(f"[spike] Environment created: {env_id}")
    return env_id


def create_research_agent():
    """Create a research agent with web tools + custom save_research tool."""
    print("[spike] Creating research agent...")
    agent = _api_post("/v1/agents", {
        "name": "convertra-researcher-spike",
        "model": "claude-sonnet-4-6",
        "system": (
            "You are a B2B prospect researcher for Convertra, an AI ad creative platform.\n\n"
            "Given a company URL, produce deep research to enable highly personalized cold email outreach.\n\n"
            "RESEARCH PROTOCOL:\n"
            "1. Visit the company website — extract tech stack, team size, funding, hiring signals\n"
            "2. Search for the founder/CEO on LinkedIn and recent press\n"
            "3. Look for recent funding announcements or product launches\n"
            "4. Check if they're running Meta/Facebook ads\n"
            "5. Identify specific pain points related to ad creative production\n\n"
            "When your research is complete, call the save_research tool with your findings.\n\n"
            "QUALITY RULES:\n"
            "- Every personalization hook must cite a verifiable source URL\n"
            "- Hooks must be specific enough to use in a cold email opening line\n"
            "- Never fabricate information — if unsure, mark confidence as 'low'\n"
            "- Prefer recent information (last 6 months) over old data"
        ),
        "tools": [
            {
                "type": "agent_toolset_20260401",
                "allowed_tools": ["web_search", "web_fetch"],
                "web_search": {"max_uses": 5},
                "web_fetch": {"max_uses": 10, "max_content_tokens": 20000},
            },
            {
                "type": "custom",
                "name": "save_research",
                "description": (
                    "Save researched company intel and personalization hooks. "
                    "Call this exactly once when all research is complete."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "prospect_id": {"type": "string", "description": "The prospect ID provided in the message"},
                        "company_intel": {
                            "type": "object",
                            "description": "Structured company data",
                            "properties": {
                                "tech_stack": {"type": "array", "items": {"type": "string"}},
                                "estimated_employees": {"type": "string"},
                                "funding": {"type": "string"},
                                "hiring_signals": {"type": "array", "items": {"type": "string"}},
                                "has_meta_pixel": {"type": "boolean"},
                                "has_google_ads": {"type": "boolean"},
                                "is_ecommerce_store": {"type": "boolean"},
                                "content_marketing": {"type": "boolean"},
                                "dead_website": {"type": "boolean"},
                            },
                        },
                        "personalization_hooks": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "hook": {"type": "string"},
                                    "source_url": {"type": "string"},
                                    "retrieved_at": {"type": "string"},
                                    "confidence": {"enum": ["high", "medium", "low"]},
                                },
                                "required": ["hook", "source_url", "confidence"],
                            },
                        },
                        "pain_signals": {"type": "array", "items": {"type": "string"}},
                        "company_name": {"type": "string"},
                        "contact_name": {"type": "string"},
                        "contact_role": {"type": "string"},
                    },
                    "required": ["prospect_id", "company_intel", "personalization_hooks"],
                },
            },
        ],
    })
    agent_id = agent["id"]
    print(f"[spike] Agent created: {agent_id}")
    return agent_id


# ─── Session Event Loop ───────────────────────────────────────────────

def _parse_sse_line(line):
    """Parse a single SSE line into event type and data."""
    if not line or not line.startswith("data: "):
        return None
    try:
        return json.loads(line[6:])
    except (json.JSONDecodeError, ValueError):
        return None


def _handle_save_research(tool_input):
    """Handle the save_research custom tool call — just capture the data."""
    print(f"\n[spike] === RESEARCH RESULTS ===")
    print(f"  Company: {tool_input.get('company_name', 'unknown')}")
    print(f"  Contact: {tool_input.get('contact_name', 'unknown')} ({tool_input.get('contact_role', '')})")

    intel = tool_input.get("company_intel", {})
    print(f"  Tech Stack: {intel.get('tech_stack', [])}")
    print(f"  Employees: {intel.get('estimated_employees', 'unknown')}")
    print(f"  Funding: {intel.get('funding', 'none')}")
    print(f"  Hiring: {intel.get('hiring_signals', [])}")
    print(f"  Meta Pixel: {intel.get('has_meta_pixel', False)}")
    print(f"  Ecommerce: {intel.get('is_ecommerce_store', False)}")

    hooks = tool_input.get("personalization_hooks", [])
    print(f"\n  Personalization Hooks ({len(hooks)}):")
    for h in hooks:
        conf = h.get("confidence", "?")
        print(f"    [{conf}] {h.get('hook', '')}")
        print(f"         Source: {h.get('source_url', 'none')}")

    pains = tool_input.get("pain_signals", [])
    print(f"\n  Pain Signals ({len(pains)}):")
    for p in pains:
        print(f"    - {p}")

    return {"status": "saved", "message": "Research data captured successfully."}


def run_session(agent_id, env_id, prospect_url):
    """Run a full agent session with SSE streaming and custom tool handling.

    Returns:
        dict with research_data and timing metrics.
    """
    print(f"\n[spike] Starting session for: {prospect_url}")
    start_time = time.time()

    # 1. Create session
    session = _api_post("/v1/sessions", {
        "agent": {"type": "agent", "id": agent_id},
        "environment_id": env_id,
    })
    session_id = session["id"]
    print(f"[spike] Session created: {session_id}")

    research_data = None

    try:
        # 2. Send research request
        _api_post(f"/v1/sessions/{session_id}/events", {
            "type": "user.message",
            "content": [{
                "type": "text",
                "text": (
                    f"Research this company for cold outreach:\n\n"
                    f"URL: {prospect_url}\n"
                    f"Prospect ID: spike_test_001\n\n"
                    f"Find the founder/CEO, tech stack, team size, funding, "
                    f"hiring signals, and whether they run Meta ads. "
                    f"Produce specific personalization hooks I can use in a cold email. "
                    f"Call save_research when done."
                ),
            }],
        })
        print("[spike] Message sent. Streaming events...")

        # 3. Stream events
        deadline = time.time() + SESSION_TIMEOUT_SECONDS
        turn_complete = False

        with httpx.stream(
            "GET",
            f"{API_BASE}/v1/sessions/{session_id}/stream",
            headers=_headers(),
            timeout=httpx.Timeout(SESSION_TIMEOUT_SECONDS, connect=10),
        ) as stream:
            for line in stream.iter_lines():
                if time.time() > deadline:
                    print("[spike] ERROR: Session timeout exceeded!")
                    break

                event = _parse_sse_line(line)
                if not event:
                    continue

                event_type = event.get("type", "")

                # Progress indicators
                if event_type == "agent.text_delta":
                    # Agent is thinking/writing — show dots for progress
                    print(".", end="", flush=True)

                elif event_type == "agent.tool_use":
                    tool_name = event.get("name", "")
                    print(f"\n[spike] Agent using built-in tool: {tool_name}")

                elif event_type == "agent.custom_tool_use":
                    # Custom tool round-trip
                    tool_name = event.get("name", "")
                    tool_input = event.get("input", {})
                    tool_use_id = event.get("tool_use_id", "")
                    print(f"\n[spike] Custom tool called: {tool_name}")

                    if tool_name == "save_research":
                        research_data = tool_input
                        tool_result = _handle_save_research(tool_input)
                    else:
                        tool_result = {"error": f"Unknown tool: {tool_name}"}

                    # Send result back to agent
                    _api_post(f"/v1/sessions/{session_id}/events", {
                        "type": "user.custom_tool_result",
                        "tool_use_id": tool_use_id,
                        "content": [{"type": "text", "text": json.dumps(tool_result)}],
                    })

                elif event_type == "agent.turn_complete":
                    print(f"\n[spike] Agent turn complete.")
                    turn_complete = True
                    break

                elif event_type == "session.status":
                    status = event.get("status", "")
                    if status == "terminated":
                        error = event.get("error", "unknown")
                        print(f"\n[spike] ERROR: Session terminated: {error}")
                        break
                    elif status == "rescheduling":
                        print(f"\n[spike] Session rescheduling (transient error, auto-retry)...")

        elapsed = time.time() - start_time
        print(f"\n[spike] Session completed in {elapsed:.1f}s")
        print(f"[spike] Turn complete: {turn_complete}")
        print(f"[spike] Research data captured: {research_data is not None}")

        return {
            "research_data": research_data,
            "session_id": session_id,
            "elapsed_seconds": elapsed,
            "turn_complete": turn_complete,
        }

    finally:
        # 4. Always archive session
        try:
            _api_post(f"/v1/sessions/{session_id}/archive", {})
            print(f"[spike] Session archived: {session_id}")
        except Exception as e:
            print(f"[spike] Warning: Failed to archive session: {e}")


# ─── Main ─────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 spike_agent.py <company_url>")
        print("Example: python3 spike_agent.py https://gymshark.com")
        sys.exit(1)

    prospect_url = sys.argv[1]

    print("=" * 60)
    print("  CONVERTRA OUTREACH — Managed Agents API Spike")
    print("=" * 60)
    print(f"\nTarget: {prospect_url}")
    print(f"Timeout: {SESSION_TIMEOUT_SECONDS}s")
    print(f"API Key: configured")

    # Check if we already have resources (env/agent IDs) from a previous run
    env_id = os.environ.get("AGENT_ENVIRONMENT_ID", "")
    agent_id = os.environ.get("RESEARCH_AGENT_ID", "")

    if not env_id:
        env_id = create_environment()
        print(f"\n  Save for reuse: export AGENT_ENVIRONMENT_ID={env_id}")

    if not agent_id:
        agent_id = create_research_agent()
        print(f"  Save for reuse: export RESEARCH_AGENT_ID={agent_id}")

    # Run the session
    result = run_session(agent_id, env_id, prospect_url)

    # Summary
    print("\n" + "=" * 60)
    print("  SPIKE RESULTS")
    print("=" * 60)
    print(f"  Elapsed: {result['elapsed_seconds']:.1f}s")
    print(f"  Turn complete: {result['turn_complete']}")
    print(f"  Research captured: {result['research_data'] is not None}")

    if result["research_data"]:
        hooks = result["research_data"].get("personalization_hooks", [])
        print(f"  Hooks found: {len(hooks)}")
        high_conf = [h for h in hooks if h.get("confidence") == "high"]
        print(f"  High-confidence hooks: {len(high_conf)}")

    print(f"\n  Environment ID: {env_id}")
    print(f"  Agent ID: {agent_id}")
    print(f"  Session ID: {result['session_id']}")

    # Write full result to file for inspection
    output_path = "data/spike_result.json"
    os.makedirs("data", exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(result, f, indent=2, default=str)
    print(f"\n  Full result saved: {output_path}")


if __name__ == "__main__":
    main()
