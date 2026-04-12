"""Unit tests for modules/agents.py — Managed Agents integration layer.

Tests use fake SSE events and mock HTTP responses. No real API calls needed.
Run with: python -m pytest tests/test_agents.py -v
"""

import json
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))


# ─── Fixtures ─────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def clean_env(monkeypatch, tmp_path):
    """Set up clean environment for each test."""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test-key")
    monkeypatch.setenv("USE_MANAGED_AGENTS", "true")
    monkeypatch.setenv("AGENT_ENVIRONMENT_ID", "env_test_123")
    monkeypatch.setenv("RESEARCH_AGENT_ID", "agent_research_123")
    monkeypatch.setenv("DRAFTER_AGENT_ID", "agent_drafter_123")
    monkeypatch.setenv("CLASSIFIER_AGENT_ID", "agent_classifier_123")
    monkeypatch.setenv("AGENT_SHADOW_MODE", "false")
    monkeypatch.setenv("AGENT_DAILY_BUDGET_USD", "5.0")

    # Use temp directory for data files
    monkeypatch.setattr("modules.agents.COST_LEDGER_PATH", tmp_path / "cost_ledger.json")
    monkeypatch.setattr("modules.agents.SHADOW_LOG_PATH", tmp_path / "shadow_log.json")
    monkeypatch.setattr("modules.agents.LEARNINGS_PATH", tmp_path / "learnings.json")


@pytest.fixture
def sample_prospect():
    return {
        "id": "p_test_001",
        "name": "Jane Smith",
        "company": "Acme DTC",
        "company_url": "https://acmedtc.com",
        "role": "CEO",
        "email": "jane@acmedtc.com",
        "stage": "discovered",
        "company_intel": {},
        "personalization_hooks": [],
        "pain_signals": [],
        "prospect_buckets": ["convertra_saas"],
    }


@pytest.fixture
def sample_research_tool_output():
    return {
        "prospect_id": "p_test_001",
        "company_intel": {
            "tech_stack": ["Shopify", "Klaviyo"],
            "estimated_employees": "20-50",
            "funding": "Series A - $5M",
            "hiring_signals": ["Senior Media Buyer"],
            "has_meta_pixel": True,
            "has_google_ads": False,
            "is_ecommerce_store": True,
            "content_marketing": True,
            "dead_website": False,
        },
        "personalization_hooks": [
            {
                "hook": "Just raised Series A and hiring a Senior Media Buyer",
                "source_url": "https://acmedtc.com/careers",
                "retrieved_at": "2026-04-12T07:00:00Z",
                "confidence": "high",
            },
            {
                "hook": "Running 30+ Meta ad creatives",
                "source_url": "https://facebook.com/ads/library",
                "retrieved_at": "2026-04-12T07:00:00Z",
                "confidence": "medium",
            },
        ],
        "pain_signals": [
            "Scaling paid team — likely hitting creative production bottleneck",
            "High creative volume — likely experiencing creative fatigue",
        ],
        "company_name": "Acme DTC",
        "contact_name": "Jane Smith",
        "contact_role": "CEO",
    }


# ─── Test: Custom Tool Roundtrip ──────────────────────────────────────


class TestCustomToolRoundtrip:
    def test_research_tool_captures_data(self):
        """Agent emits save_research tool → handler executes → data captured."""
        from modules.agents import _handle_research_tool

        tool_input = {
            "prospect_id": "p_001",
            "company_intel": {"tech_stack": ["Shopify"]},
            "personalization_hooks": [
                {"hook": "test hook", "source_url": "https://example.com", "confidence": "high"}
            ],
            "pain_signals": ["test pain"],
        }

        result, captured = _handle_research_tool("save_research", tool_input)

        assert result["status"] == "saved"
        assert captured is not None
        assert captured["research_data"]["prospect_id"] == "p_001"
        assert captured["research_data"]["company_intel"]["tech_stack"] == ["Shopify"]

    def test_unknown_tool_returns_error(self):
        """Unknown tool names return error without capturing data."""
        from modules.agents import _handle_research_tool

        result, captured = _handle_research_tool("unknown_tool", {})

        assert "error" in result
        assert captured is None

    def test_drafter_tool_captures_draft(self):
        """save_draft tool captures subject and body."""
        from modules.agents import _handle_drafter_tool

        tool_input = {
            "prospect_id": "p_001",
            "subject": "Ad fatigue?",
            "body": "Hi Jane,\n\nJust noticed your 30+ ads...",
        }

        result, captured = _handle_drafter_tool("save_draft", tool_input)

        assert result["status"] == "saved"
        assert captured["draft_data"]["subject"] == "Ad fatigue?"

    def test_classifier_tool_captures_classification(self):
        """save_classification tool captures classification and action."""
        from modules.agents import _handle_classifier_tool

        tool_input = {
            "prospect_id": "p_001",
            "classification": "POSITIVE",
            "reasoning": "Expressed interest in demo",
            "action": "send_video",
        }

        result, captured = _handle_classifier_tool("save_classification", tool_input)

        assert result["status"] == "saved"
        assert captured["classification_data"]["classification"] == "POSITIVE"


# ─── Test: Classifier Stage Mapping ───────────────────────────────────


class TestClassifierStageMapping:
    def test_positive_maps_to_replied_interested(self):
        from modules.agents import CLASSIFICATION_MAP
        assert CLASSIFICATION_MAP["POSITIVE"] == "replied_interested"

    def test_negative_maps_to_replied_not_interested(self):
        from modules.agents import CLASSIFICATION_MAP
        assert CLASSIFICATION_MAP["NEGATIVE"] == "replied_not_interested"

    def test_neutral_maps_to_replied_not_now(self):
        from modules.agents import CLASSIFICATION_MAP
        assert CLASSIFICATION_MAP["NEUTRAL"] == "replied_not_now"

    def test_deferral_maps_to_replied_not_now(self):
        from modules.agents import CLASSIFICATION_MAP
        assert CLASSIFICATION_MAP["DEFERRAL"] == "replied_not_now"

    def test_unsubscribe_maps_to_opted_out(self):
        from modules.agents import CLASSIFICATION_MAP
        assert CLASSIFICATION_MAP["UNSUBSCRIBE"] == "opted_out"


# ─── Test: Fallback Behavior ──────────────────────────────────────────


class TestFallbackBehavior:
    def test_returns_none_when_disabled(self, monkeypatch, sample_prospect):
        """When USE_MANAGED_AGENTS=false, agent functions return None."""
        monkeypatch.setenv("USE_MANAGED_AGENTS", "false")
        # Force module to re-read env
        import importlib
        import modules.agents
        importlib.reload(modules.agents)

        result = modules.agents.research_prospect(sample_prospect)
        assert result is None

    def test_returns_none_when_no_api_key(self, monkeypatch, sample_prospect):
        """When ANTHROPIC_API_KEY is empty, agent functions return None."""
        monkeypatch.setenv("ANTHROPIC_API_KEY", "")
        import importlib
        import modules.agents
        importlib.reload(modules.agents)

        result = modules.agents.research_prospect(sample_prospect)
        assert result is None

    def test_returns_none_when_no_environment(self, monkeypatch, sample_prospect):
        """When AGENT_ENVIRONMENT_ID is empty, agent functions return None."""
        monkeypatch.setenv("AGENT_ENVIRONMENT_ID", "")
        import importlib
        import modules.agents
        importlib.reload(modules.agents)

        result = modules.agents.research_prospect(sample_prospect)
        assert result is None


# ─── Test: Budget Cap Enforcement ─────────────────────────────────────


class TestBudgetCap:
    def test_within_budget_returns_true(self, tmp_path):
        """Fresh day with no spend is within budget."""
        from modules.agents import _within_daily_budget
        assert _within_daily_budget() is True

    def test_exceeds_budget_returns_false(self, tmp_path, monkeypatch):
        """After exceeding daily budget, agents_enabled() returns False."""
        from modules.agents import _track_cost, _within_daily_budget, COST_LEDGER_PATH

        # Spend more than budget
        _track_cost(6.0)  # Exceeds $5.0 cap

        assert _within_daily_budget() is False

    def test_budget_check_in_agents_enabled(self, tmp_path, monkeypatch):
        """agents_enabled() returns False when budget exceeded."""
        import importlib
        import modules.agents
        # Reload to pick up env vars
        importlib.reload(modules.agents)

        # Spend over budget
        modules.agents._track_cost(6.0)

        assert modules.agents.agents_enabled() is False


# ─── Test: Shadow Mode No Pipeline Mutation ───────────────────────────


class TestShadowMode:
    def test_shadow_log_written(self, tmp_path):
        """Shadow mode logs comparison without mutating pipeline."""
        from modules.agents import log_shadow_comparison, SHADOW_LOG_PATH

        agent_result = {
            "company_intel": {"tech_stack": ["Shopify"]},
            "personalization_hooks": [
                {"hook": "agent hook", "source_url": "https://x.com", "confidence": "high"}
            ],
        }
        det_result = {
            "tech_stack": ["Shopify", "Klaviyo"],
            "personalization_hooks": ["det hook"],
        }

        log_shadow_comparison("p_001", agent_result, det_result)

        # Verify log was written
        assert SHADOW_LOG_PATH.exists()
        log_data = json.loads(SHADOW_LOG_PATH.read_text())
        assert len(log_data) == 1
        assert log_data[0]["prospect_id"] == "p_001"
        assert log_data[0]["agent_hooks"] == ["agent hook"]

    def test_shadow_log_caps_at_200(self, tmp_path):
        """Shadow log doesn't grow unbounded."""
        from modules.agents import log_shadow_comparison, SHADOW_LOG_PATH

        for i in range(210):
            log_shadow_comparison(f"p_{i:03d}", None, {})

        log_data = json.loads(SHADOW_LOG_PATH.read_text())
        assert len(log_data) == 200


# ─── Test: Session Timeout ────────────────────────────────────────────


class TestSessionTimeout:
    @patch("modules.agents._api_post")
    @patch("modules.agents.httpx.stream")
    def test_timeout_returns_none(self, mock_stream, mock_api_post):
        """Sessions exceeding timeout return None (triggers fallback)."""
        from modules.agents import _run_session

        mock_api_post.return_value = {"id": "session_test_123"}

        # Simulate a stream that never completes
        mock_context = MagicMock()
        mock_context.__enter__ = MagicMock(return_value=mock_context)
        mock_context.__exit__ = MagicMock(return_value=False)
        mock_context.iter_lines = MagicMock(return_value=iter([]))
        mock_stream.return_value = mock_context

        result = _run_session(
            agent_id="agent_123",
            message="test message",
            custom_tool_handler=lambda name, inp: ({"status": "ok"}, None),
        )

        assert result is None


# ─── Test: Research Schema Validation ─────────────────────────────────


class TestSchemaValidation:
    def test_hooks_without_source_url_filtered(self, sample_prospect, monkeypatch):
        """Hooks missing source_url are filtered out before pipeline write."""
        from modules.agents import research_prospect

        fake_research = {
            "research_data": {
                "company_intel": {"tech_stack": ["Shopify"]},
                "personalization_hooks": [
                    {"hook": "good hook", "source_url": "https://example.com", "confidence": "high"},
                    {"hook": "bad hook no source", "confidence": "low"},  # Missing source_url
                ],
                "pain_signals": [],
            },
            "cost_estimate": 0.05,
        }

        with patch("modules.agents._run_session", return_value=fake_research):
            result = research_prospect(sample_prospect)

        assert result is not None
        assert len(result["personalization_hooks"]) == 1
        assert result["personalization_hooks"][0]["hook"] == "good hook"

    def test_empty_research_returns_none(self, sample_prospect, monkeypatch):
        """If agent returns no research_data, function returns None."""
        with patch("modules.agents._run_session", return_value={}):
            from modules.agents import research_prospect
            result = research_prospect(sample_prospect)

        assert result is None


# ─── Test: Hook Provenance ────────────────────────────────────────────


class TestHookProvenance:
    def test_all_hooks_have_source_url(self, sample_research_tool_output):
        """Every hook in research output must have a source_url."""
        hooks = sample_research_tool_output["personalization_hooks"]
        for hook in hooks:
            assert "source_url" in hook
            assert hook["source_url"].startswith("http")

    def test_all_hooks_have_confidence(self, sample_research_tool_output):
        """Every hook must have a confidence level."""
        hooks = sample_research_tool_output["personalization_hooks"]
        for hook in hooks:
            assert hook["confidence"] in ("high", "medium", "low")
