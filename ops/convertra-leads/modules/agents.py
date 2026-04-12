"""Managed Agents integration layer — wraps Anthropic API with fallback.

This module provides the bridge between the existing pipeline and Anthropic's
Managed Agents platform. Each public function:
1. Checks if agents are enabled (feature flag + API key + budget)
2. Runs an agent session with SSE streaming and custom tool round-trips
3. Returns structured data matching existing module output schemas
4. Returns None on any failure (caller falls back to deterministic module)

Feature flags:
    USE_MANAGED_AGENTS=true|false  — master switch
    AGENT_SHADOW_MODE=true|false   — run both, log comparison, use fallback
    AGENT_DAILY_BUDGET_USD=5.0     — auto-disable when daily spend exceeds cap
"""

import json
import logging
import os
import time
from datetime import date
from pathlib import Path

import httpx

from config import DATA_DIR

log = logging.getLogger("agents")

# ─── Configuration ────────────────────────────────────────────────���───

API_BASE = "https://api.anthropic.com"
BETA_HEADER = "managed-agents-2026-04-01"
SESSION_TIMEOUT_SECONDS = 120

# Feature flags (loaded from environment)
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
USE_MANAGED_AGENTS = os.environ.get("USE_MANAGED_AGENTS", "false").lower() == "true"
AGENT_SHADOW_MODE = os.environ.get("AGENT_SHADOW_MODE", "false").lower() == "true"
AGENT_DAILY_BUDGET_USD = float(os.environ.get("AGENT_DAILY_BUDGET_USD", "5.0"))

# Agent + Environment IDs (set after spike creates these resources)
RESEARCH_AGENT_ID = os.environ.get("RESEARCH_AGENT_ID", "")
DRAFTER_AGENT_ID = os.environ.get("DRAFTER_AGENT_ID", "")
CLASSIFIER_AGENT_ID = os.environ.get("CLASSIFIER_AGENT_ID", "")
ENVIRONMENT_ID = os.environ.get("AGENT_ENVIRONMENT_ID", "")

# Cost tracking file
COST_LEDGER_PATH = DATA_DIR / "agent_cost_ledger.json"

# Shadow log
SHADOW_LOG_PATH = DATA_DIR / "agent_shadow_log.json"

# Learnings (injected into drafter context)
LEARNINGS_PATH = DATA_DIR / "agent_learnings.json"

# Classification → pipeline stage mapping
CLASSIFICATION_MAP = {
    "POSITIVE": "replied_interested",
    "NEGATIVE": "replied_not_interested",
    "NEUTRAL": "replied_not_now",
    "DEFERRAL": "replied_not_now",
    "UNSUBSCRIBE": "opted_out",
}


# ─── Public API ───────────────────────────────────────────────────────


def agents_enabled() -> bool:
    """Check if managed agents are enabled and configured."""
    return (
        USE_MANAGED_AGENTS
        and bool(ANTHROPIC_API_KEY)
        and bool(ENVIRONMENT_ID)
        and _within_daily_budget()
    )


def is_shadow_mode() -> bool:
    """Check if shadow mode is active (run both, log comparison, use fallback)."""
    return AGENT_SHADOW_MODE and agents_enabled()


def research_prospect(prospect: dict) -> dict | None:
    """Deep-research a prospect via managed agent.

    Args:
        prospect: dict with at least {id, company_url, company, name, role}

    Returns:
        dict matching research.py output schema:
        {
            "company_intel": {...},
            "personalization_hooks": [{"hook": str, "source_url": str, "confidence": str}],
            "pain_signals": [str],
            "company_name": str,
            "contact_name": str,
            "contact_role": str,
        }
        Returns None if agent unavailable or fails (triggers fallback).
    """
    if not agents_enabled() or not RESEARCH_AGENT_ID:
        return None

    try:
        message = _build_research_message(prospect)
        result = _run_session(
            agent_id=RESEARCH_AGENT_ID,
            message=message,
            custom_tool_handler=_handle_research_tool,
        )
        if result and result.get("research_data"):
            _track_cost(result.get("cost_estimate", 0.10))
            research = result["research_data"]
            # Validate: hooks must have source_url (provenance requirement)
            research["personalization_hooks"] = [
                h for h in research.get("personalization_hooks", [])
                if h.get("source_url")
            ]
            return research
        return None
    except Exception as e:
        log.warning(f"Research agent failed for {prospect.get('id')}: {e}")
        return None


def draft_email_agent(prospect: dict, learnings: dict | None = None) -> dict | None:
    """Draft a personalized email via managed agent.

    Args:
        prospect: Full prospect record from pipeline.json
        learnings: Optional learnings context from agent_learnings.json

    Returns:
        dict with {subject: str, body: str, method: "agent"} or None for fallback.
    """
    if not agents_enabled() or not DRAFTER_AGENT_ID:
        return None

    try:
        message = _build_drafter_message(prospect, learnings)
        result = _run_session(
            agent_id=DRAFTER_AGENT_ID,
            message=message,
            custom_tool_handler=_handle_drafter_tool,
        )
        if result and result.get("draft_data"):
            _track_cost(result.get("cost_estimate", 0.04))
            draft = result["draft_data"]
            if draft.get("subject") and draft.get("body"):
                return {
                    "subject": draft["subject"],
                    "body": draft["body"],
                    "method": "agent",
                }
        return None
    except Exception as e:
        log.warning(f"Drafter agent failed for {prospect.get('id')}: {e}")
        return None


def classify_reply_agent(reply_text: str, prospect_id: str | None = None) -> dict | None:
    """Classify a reply with full context understanding.

    Args:
        reply_text: The reply email body text
        prospect_id: Optional prospect ID for thread context

    Returns:
        dict with {
            "classification": str (POSITIVE/NEGATIVE/NEUTRAL/DEFERRAL/UNSUBSCRIBE),
            "stage": str (pipeline stage from CLASSIFICATION_MAP),
            "reasoning": str,
            "action": str,
            "followup_date": str | None,
            "new_prospect": dict | None,
        }
        Returns None if agent unavailable or fails (triggers fallback).
    """
    if not agents_enabled() or not CLASSIFIER_AGENT_ID:
        return None

    try:
        message = _build_classifier_message(reply_text, prospect_id)
        result = _run_session(
            agent_id=CLASSIFIER_AGENT_ID,
            message=message,
            custom_tool_handler=_handle_classifier_tool,
        )
        if result and result.get("classification_data"):
            _track_cost(result.get("cost_estimate", 0.01))
            data = result["classification_data"]
            classification = data.get("classification", "NEUTRAL")
            data["stage"] = CLASSIFICATION_MAP.get(classification, "replied_not_now")
            return data
        return None
    except Exception as e:
        log.warning(f"Classifier agent failed: {e}")
        return None


# ─── Shadow Mode Logging ──────────────────────────────────────────────


def log_shadow_comparison(prospect_id: str, agent_result: dict | None, deterministic_result: dict):
    """Log side-by-side comparison of agent vs. deterministic results.

    Called during shadow mode — never mutates pipeline.
    """
    entry = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "prospect_id": prospect_id,
        "agent_result": agent_result,
        "deterministic_result": deterministic_result,
        "agent_hooks": (
            [h.get("hook", "") for h in agent_result.get("personalization_hooks", [])]
            if agent_result else []
        ),
        "deterministic_hooks": deterministic_result.get("personalization_hooks", [])
        if isinstance(deterministic_result, dict) else [],
    }

    # Append to shadow log
    log_data = _load_json(SHADOW_LOG_PATH, default=[])
    log_data.append(entry)
    # Keep last 200 entries
    if len(log_data) > 200:
        log_data = log_data[-200:]
    _save_json(SHADOW_LOG_PATH, log_data)

    log.info(
        f"Shadow comparison logged for {prospect_id}: "
        f"agent={len(entry['agent_hooks'])} hooks, "
        f"deterministic={len(entry['deterministic_hooks'])} hooks"
    )


# ─── Session Event Loop ───────────────────────────────────────────────


def _run_session(agent_id: str, message: str, custom_tool_handler) -> dict | None:
    """Run a managed agent session with SSE streaming.

    Handles:
    - Session creation and cleanup
    - SSE event streaming with timeout
    - Custom tool round-trips (agent.custom_tool_use → user.custom_tool_result)
    - Terminal states (terminated, rescheduling)

    Args:
        agent_id: The agent definition ID
        message: User message to send
        custom_tool_handler: Function(tool_name, tool_input) → (result_dict, captured_data)

    Returns:
        dict with captured data from custom tool calls, or None on failure.
    """
    session = _api_post("/v1/sessions", {
        "agent": {"type": "agent", "id": agent_id},
        "environment_id": ENVIRONMENT_ID,
    })
    session_id = session["id"]
    log.debug(f"Session created: {session_id}")

    captured_data = {}

    try:
        # Send message
        _api_post(f"/v1/sessions/{session_id}/events", {
            "type": "user.message",
            "content": [{"type": "text", "text": message}],
        })

        # Stream events
        deadline = time.time() + SESSION_TIMEOUT_SECONDS

        with httpx.stream(
            "GET",
            f"{API_BASE}/v1/sessions/{session_id}/stream",
            headers=_headers(),
            timeout=httpx.Timeout(SESSION_TIMEOUT_SECONDS + 10, connect=10),
        ) as stream:
            for line in stream.iter_lines():
                if time.time() > deadline:
                    log.warning(f"Session {session_id} timeout after {SESSION_TIMEOUT_SECONDS}s")
                    return None

                event = _parse_sse(line)
                if not event:
                    continue

                event_type = event.get("type", "")

                if event_type == "agent.turn_complete":
                    log.debug(f"Session {session_id} turn complete")
                    break

                elif event_type == "agent.custom_tool_use":
                    tool_name = event.get("name", "")
                    tool_input = event.get("input", {})
                    tool_use_id = event.get("tool_use_id", "")

                    # Execute custom tool and capture data
                    tool_result, data = custom_tool_handler(tool_name, tool_input)
                    if data:
                        captured_data.update(data)

                    # Send result back to agent
                    _api_post(f"/v1/sessions/{session_id}/events", {
                        "type": "user.custom_tool_result",
                        "tool_use_id": tool_use_id,
                        "content": [{"type": "text", "text": json.dumps(tool_result)}],
                    })

                elif event_type == "session.status":
                    status = event.get("status", "")
                    if status == "terminated":
                        error = event.get("error", "unknown")
                        log.error(f"Session {session_id} terminated: {error}")
                        return None
                    elif status == "rescheduling":
                        log.warning(f"Session {session_id} rescheduling (auto-retry)")
                        # Continue — Anthropic retries automatically

        return captured_data if captured_data else None

    except httpx.TimeoutException:
        log.warning(f"Session {session_id} HTTP timeout")
        return None
    except Exception as e:
        log.error(f"Session {session_id} error: {e}")
        return None
    finally:
        # Always archive session (prevents resource leaks)
        try:
            _api_post(f"/v1/sessions/{session_id}/archive", {})
        except Exception:
            pass


# ─── Custom Tool Handlers ─────────────────────────────────────────────


def _handle_research_tool(tool_name: str, tool_input: dict):
    """Handle research agent custom tools.

    Returns:
        tuple: (result_for_agent: dict, captured_data: dict | None)
    """
    if tool_name == "save_research":
        return (
            {"status": "saved", "message": "Research data captured."},
            {"research_data": tool_input},
        )
    return ({"error": f"Unknown tool: {tool_name}"}, None)


def _handle_drafter_tool(tool_name: str, tool_input: dict):
    """Handle drafter agent custom tools."""
    if tool_name == "get_prospect_context":
        # Serve prospect data to the agent
        from modules.pipeline import get_prospect
        prospect_id = tool_input.get("prospect_id", "")
        prospect = get_prospect(prospect_id)
        if prospect:
            # PII minimization: only send what drafter needs
            safe_data = {
                "name": prospect.get("name", ""),
                "company": prospect.get("company", ""),
                "role": prospect.get("role", ""),
                "company_url": prospect.get("company_url", ""),
                "company_intel": prospect.get("company_intel", {}),
                "personalization_hooks": prospect.get("personalization_hooks", []),
                "pain_signals": prospect.get("pain_signals", []),
                "prospect_buckets": prospect.get("prospect_buckets", []),
                "estimated_ad_spend": prospect.get("estimated_ad_spend", ""),
            }
            return (safe_data, None)
        return ({"error": "Prospect not found"}, None)

    elif tool_name == "save_draft":
        return (
            {"status": "saved", "message": "Draft captured."},
            {"draft_data": tool_input},
        )
    return ({"error": f"Unknown tool: {tool_name}"}, None)


def _handle_classifier_tool(tool_name: str, tool_input: dict):
    """Handle classifier agent custom tools."""
    if tool_name == "get_thread_context":
        from modules.pipeline import get_prospect
        prospect_id = tool_input.get("prospect_id", "")
        prospect = get_prospect(prospect_id)
        if prospect:
            # Only send interaction history and draft (no PII like email address)
            context = {
                "company": prospect.get("company", ""),
                "interactions": prospect.get("interactions", []),
                "draft_email": prospect.get("draft_email", {}),
            }
            return (context, None)
        return ({"error": "Prospect not found"}, None)

    elif tool_name == "save_classification":
        return (
            {"status": "saved", "message": "Classification captured."},
            {"classification_data": tool_input},
        )
    return ({"error": f"Unknown tool: {tool_name}"}, None)


# ─── Message Builders ─────────────────────────────────────────────────


def _build_research_message(prospect: dict) -> str:
    """Build the user message for the research agent.

    PII minimization: only company name, URL, first name, and role.
    """
    return (
        f"Research this company for cold outreach:\n\n"
        f"Prospect ID: {prospect.get('id', 'unknown')}\n"
        f"Company: {prospect.get('company', 'Unknown')}\n"
        f"URL: {prospect.get('company_url', '')}\n"
        f"Contact Name: {prospect.get('name', '').split()[0] if prospect.get('name') else 'unknown'}\n"
        f"Role: {prospect.get('role', '')}\n\n"
        f"Find: tech stack, team size, funding, hiring signals, "
        f"Meta/Facebook ad activity, and specific personalization hooks "
        f"I can use in a cold email opening line.\n\n"
        f"Call save_research when done."
    )


def _build_drafter_message(prospect: dict, learnings: dict | None = None) -> str:
    """Build the user message for the drafter agent."""
    learnings_context = ""
    if learnings:
        positive = learnings.get("positive_patterns", [])
        negative = learnings.get("negative_patterns", [])
        if positive:
            learnings_context += "\n\nWHAT WORKS (from past campaigns):\n"
            for p in positive[:5]:
                learnings_context += f"- {p.get('hook_type', '')}: {p.get('reply_rate', 0):.0%} reply rate (n={p.get('sample_size', 0)})\n"
        if negative:
            learnings_context += "\nWHAT DOESN'T WORK:\n"
            for n in negative[:3]:
                learnings_context += f"- {n.get('hook_type', '')}: {n.get('reply_rate', 0):.0%} reply rate (avoid)\n"

    return (
        f"Draft a cold email for this prospect:\n\n"
        f"Prospect ID: {prospect.get('id', 'unknown')}\n"
        f"First, call get_prospect_context to retrieve their full data.\n"
        f"Then draft the email and call save_draft.\n"
        f"{learnings_context}"
    )


def _build_classifier_message(reply_text: str, prospect_id: str | None = None) -> str:
    """Build the user message for the classifier agent."""
    context_instruction = ""
    if prospect_id:
        context_instruction = f"\nCall get_thread_context with prospect_id '{prospect_id}' for full thread context.\n"

    return (
        f"Classify this cold email reply:\n\n"
        f'"""\n{reply_text}\n"""\n'
        f"{context_instruction}\n"
        f"Determine: POSITIVE, NEGATIVE, NEUTRAL, DEFERRAL, or UNSUBSCRIBE.\n"
        f"Then call save_classification with your analysis."
    )


# ─── HTTP Helpers ─────────────────────────────────────────────────────


def _headers():
    return {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": BETA_HEADER,
        "content-type": "application/json",
    }


def _api_post(path: str, data: dict | None = None) -> dict:
    """POST to Anthropic API."""
    url = f"{API_BASE}{path}"
    resp = httpx.post(url, headers=_headers(), json=data or {}, timeout=30)
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Anthropic API {resp.status_code}: {resp.text[:300]}")
    return resp.json()


def _parse_sse(line: str) -> dict | None:
    """Parse a single SSE data line."""
    if not line or not line.startswith("data: "):
        return None
    try:
        return json.loads(line[6:])
    except (json.JSONDecodeError, ValueError):
        return None


# ─── Budget Tracking ──────────────────────────────────────────────────


def _within_daily_budget() -> bool:
    """Check if today's spend is within the daily budget cap."""
    ledger = _load_json(COST_LEDGER_PATH, default={})
    today = date.today().isoformat()
    today_spend = ledger.get(today, 0.0)
    return today_spend < AGENT_DAILY_BUDGET_USD


def _track_cost(amount: float):
    """Record a cost entry for today."""
    ledger = _load_json(COST_LEDGER_PATH, default={})
    today = date.today().isoformat()
    ledger[today] = ledger.get(today, 0.0) + amount

    # Prune entries older than 30 days
    keys = sorted(ledger.keys())
    if len(keys) > 30:
        for old_key in keys[:-30]:
            del ledger[old_key]

    _save_json(COST_LEDGER_PATH, ledger)

    # Log warning if approaching cap
    if ledger[today] > AGENT_DAILY_BUDGET_USD * 0.8:
        log.warning(
            f"Agent budget warning: ${ledger[today]:.2f} / ${AGENT_DAILY_BUDGET_USD:.2f} "
            f"({ledger[today] / AGENT_DAILY_BUDGET_USD * 100:.0f}%)"
        )


# ─── JSON Helpers ─────────────────────────────────────────────────────


def _load_json(path: Path, default=None):
    """Load a JSON file, returning default if not found or invalid."""
    if not path.exists():
        return default if default is not None else {}
    try:
        with open(path) as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return default if default is not None else {}


def _save_json(path: Path, data):
    """Save data to a JSON file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
