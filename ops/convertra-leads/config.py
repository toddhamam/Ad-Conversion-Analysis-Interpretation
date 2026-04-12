"""Configuration loader for Convertra Leads CLI."""

import json
import os
from pathlib import Path

# Base directory — all paths relative to this
BASE_DIR = Path(__file__).parent.resolve()
DATA_DIR = BASE_DIR / "data"
PIPELINE_PATH = DATA_DIR / "pipeline.json"
CONFIG_PATH = DATA_DIR / "config.json"
TEMPLATES_PATH = DATA_DIR / "templates.json"
EXPERIMENTS_PATH = DATA_DIR / "experiments.json"
RESOURCES_PATH = DATA_DIR / "resources.md"
ENV_PATH = BASE_DIR / ".env"

# Managed Agents data files
AGENT_LEARNINGS_PATH = DATA_DIR / "agent_learnings.json"
AGENT_SHADOW_LOG_PATH = DATA_DIR / "agent_shadow_log.json"
AGENT_COST_LEDGER_PATH = DATA_DIR / "agent_cost_ledger.json"

# Meta Graph API
GRAPH_API_VERSION = "v24.0"
GRAPH_API_BASE = f"https://graph.facebook.com/{GRAPH_API_VERSION}"

# Gmail
GMAIL_SMTP_HOST = "smtp.gmail.com"
GMAIL_SMTP_PORT = 465
GMAIL_IMAP_HOST = "imap.gmail.com"
GMAIL_IMAP_PORT = 993

# Warmup schedule (week number -> max sends per day)
WARMUP_LIMITS = {
    1: 5,
    2: 10,
    3: 20,
    4: 20,
    5: 40,
}
MAX_DAILY_SENDS = 50


def load_env():
    """Load .env file into os.environ."""
    if not ENV_PATH.exists():
        return
    with open(ENV_PATH) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())


def get_meta_token():
    """Get Meta access token from environment."""
    return os.environ.get("META_ACCESS_TOKEN", "")


def get_gmail_address():
    """Get Gmail address from environment."""
    return os.environ.get("GMAIL_ADDRESS", "")


def get_gmail_password():
    """Get Gmail App Password from environment."""
    return os.environ.get("GMAIL_APP_PASSWORD", "")


def load_config():
    """Load runtime config from data/config.json."""
    if not CONFIG_PATH.exists():
        return _default_config()
    with open(CONFIG_PATH) as f:
        return json.load(f)


def save_config(config):
    """Save runtime config to data/config.json."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_PATH, "w") as f:
        json.dump(config, f, indent=2)


def get_anthropic_key():
    """Get Anthropic API key from environment."""
    return os.environ.get("ANTHROPIC_API_KEY", "")


def agents_configured():
    """Check if managed agents environment variables are set."""
    return bool(
        os.environ.get("ANTHROPIC_API_KEY")
        and os.environ.get("AGENT_ENVIRONMENT_ID")
        and os.environ.get("USE_MANAGED_AGENTS", "").lower() == "true"
    )


def _default_config():
    return {
        "warmup": {
            "start_date": "",
            "current_week": 1,
            "daily_limit": 5,
            "sent_today": 0,
            "last_sent_date": "",
        },
        "meta_api": {"default_country": "GB", "default_limit": 25},
        "email": {
            "send_delay_seconds": 45,
            "from_name": "Todd",
            "signature": "\nReply STOP to opt out.",
        },
        "sequence_timing": {
            "followup_1_days": 3,
        },
    }
