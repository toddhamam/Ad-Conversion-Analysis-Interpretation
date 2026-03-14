"""Self-optimizing email copy engine — Karpathy auto-research pattern for cold email.

Runs a continuous A/B test loop:
  1. Baseline (current best) vs Challenger (AI-generated variant)
  2. Both get equal leads via 50/50 split in fill mode
  3. After 250 sends + 48h floor, evaluate positive reply rate
  4. Promote winner, append learnings, generate new challenger
  5. Repeat — compounding learnings in resources.md

Adapted from Karpathy's auto research: same loop (hypothesis → experiment →
measure → keep/discard → compound), but event-based triggers instead of
5-minute time loops.
"""

import fcntl
import json
import logging
import math
import os
import re
from datetime import datetime, timedelta

import requests

from config import (
    EXPERIMENTS_PATH,
    RESOURCES_PATH,
    TEMPLATES_PATH,
    load_config,
)


log = logging.getLogger("optimizer")

OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"
OPTIMIZER_MODEL = "gpt-5.4"

# Experiment thresholds
MIN_SENDS_PER_VARIANT = 250
FLOOR_HOURS = 48
CEILING_HOURS = 96
CEILING_HOURS_WARMUP = 336  # 2 weeks during warmup weeks 3-4

# Safety guards
MAX_NEGATIVE_RATIO = 0.40  # Kill challenger if >40% of replies are negative
MAX_UNSUBSCRIBE_RATE = 0.02  # Kill challenger if >2% of sends are unsubscribes

# Winner determination
MIN_WIN_MARGIN = 0.005  # 0.5% — baseline wins ties

# Learnings summary regeneration interval
SUMMARY_REGEN_INTERVAL = 5  # Regenerate "What Works"/"What Doesn't" every N rounds


# ──────────────────────────────────────────────────────────────────────
# FILE I/O (fcntl.flock pattern from pipeline.py)
# ──────────────────────────────────────────────────────────────────────


def load_experiments() -> dict:
    """Load experiments.json with shared file lock."""
    EXPERIMENTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not EXPERIMENTS_PATH.exists():
        default = {
            "current_experiment": None,
            "round_number": 0,
            "history": [],
            "best_ever": None,
            "aggregate_metrics": {
                "total_experiments": 0,
                "total_sends": 0,
                "total_positive_replies": 0,
                "best_positive_rate": 0,
                "best_copy_summary": "",
            },
        }
        save_experiments(default)
        return default

    with open(EXPERIMENTS_PATH) as f:
        fcntl.flock(f, fcntl.LOCK_SH)
        try:
            data = json.load(f)
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)
    return data


def save_experiments(data: dict) -> None:
    """Save experiments.json with exclusive file lock."""
    EXPERIMENTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(EXPERIMENTS_PATH, "w") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        try:
            json.dump(data, f, indent=2)
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)


# ──────────────────────────────────────────────────────────────────────
# EXPERIMENT STATUS
# ──────────────────────────────────────────────────────────────────────


def get_experiment_status() -> dict:
    """Return current experiment state for monitoring."""
    data = load_experiments()
    exp = data.get("current_experiment")
    if not exp:
        return {
            "status": "no_experiment",
            "round": data.get("round_number", 0),
            "total_experiments": data["aggregate_metrics"]["total_experiments"],
            "best_rate": data["aggregate_metrics"]["best_positive_rate"],
        }

    elapsed_h = _hours_since(exp["started_at"])
    return {
        "status": exp["status"],
        "round": exp["round"],
        "elapsed_hours": round(elapsed_h, 1),
        "baseline_sends": exp["baseline"].get("sends", 0),
        "challenger_sends": exp["challenger"].get("sends", 0),
        "hypothesis": exp["challenger"].get("hypothesis", ""),
        "total_experiments": data["aggregate_metrics"]["total_experiments"],
        "best_rate": data["aggregate_metrics"]["best_positive_rate"],
    }


# ──────────────────────────────────────────────────────────────────────
# BOOTSTRAP — START FIRST EXPERIMENT
# ──────────────────────────────────────────────────────────────────────


def start_first_experiment(from_best: bool = False, dry_run: bool = False) -> dict:
    """Bootstrap: Create round 1 using templates.json or best_ever as baseline.

    Args:
        from_best: Use best_ever copy as baseline instead of templates.
        dry_run: If True, return what would happen without GPT calls or campaigns.

    Returns:
        Experiment record (or dry-run summary).
    """
    data = load_experiments()

    # Determine baseline copy
    if from_best and data.get("best_ever"):
        baseline_copy = data["best_ever"]["copy"]
        log.info("Using best_ever copy as baseline")
    else:
        baseline_copy = _load_baseline_from_templates()
        log.info("Using templates.json as baseline")

    round_num = data.get("round_number", 0) + 1

    if dry_run:
        return {
            "status": "dry_run",
            "round": round_num,
            "baseline_copy": baseline_copy,
            "message": "Would generate challenger via GPT and create 2 Instantly campaigns",
        }

    # Generate challenger via GPT
    resources_md = _load_resources()
    challenger = _generate_challenger(baseline_copy, resources_md, data.get("history", []))

    # Create two Instantly campaigns
    from modules.instantly import create_campaign, activate_campaign

    baseline_campaign = create_campaign(
        f"Opt-R{round_num}-Baseline",
        sending_account=_get_sending_account(),
    )
    challenger_campaign = create_campaign(
        f"Opt-R{round_num}-Challenger",
        sending_account=_get_sending_account(),
    )

    baseline_cid = baseline_campaign.get("campaign_id", "")
    challenger_cid = challenger_campaign.get("campaign_id", "")

    # Activate both campaigns
    if baseline_cid:
        activate_campaign(baseline_cid)
    if challenger_cid:
        activate_campaign(challenger_cid)

    experiment = {
        "id": f"exp_{round_num:03d}",
        "round": round_num,
        "status": "running",
        "started_at": datetime.now().isoformat(),
        "baseline": {
            "campaign_id": baseline_cid,
            "copy": baseline_copy,
            "sends": 0,
            "replies_total": 0,
            "replies_positive": 0,
            "replies_neutral": 0,
            "replies_negative": 0,
            "replies_unsubscribe": 0,
            "positive_rate": 0.0,
            "negative_ratio": 0.0,
            "unsubscribe_rate": 0.0,
        },
        "challenger": {
            "campaign_id": challenger_cid,
            "copy": challenger["copy"],
            "hypothesis": challenger["hypothesis"],
            "sends": 0,
            "replies_total": 0,
            "replies_positive": 0,
            "replies_neutral": 0,
            "replies_negative": 0,
            "replies_unsubscribe": 0,
            "positive_rate": 0.0,
            "negative_ratio": 0.0,
            "unsubscribe_rate": 0.0,
        },
        "pushed_prospect_ids": [],
        "winner": None,
        "confidence": None,
        "learnings": "",
    }

    data["current_experiment"] = experiment
    data["round_number"] = round_num
    save_experiments(data)

    log.info(f"Experiment {experiment['id']} started")
    log.info(f"  Baseline campaign: {baseline_cid}")
    log.info(f"  Challenger campaign: {challenger_cid}")
    log.info(f"  Hypothesis: {challenger['hypothesis']}")

    return experiment


# ──────────────────────────────────────────────────────────────────────
# THRESHOLD CHECKS
# ──────────────────────────────────────────────────────────────────────


def check_thresholds(experiment: dict) -> str:
    """Check if experiment is ready for evaluation.

    Returns:
        "not_ready" — hasn't hit 250 sends per variant OR 48h floor
        "ready" — 250+ sends AND 48h+ elapsed
        "ceiling" — ceiling elapsed (force-evaluate regardless of send count)
        "killed" — safety guard triggered
    """
    # Safety check first (runs every heartbeat)
    kill = run_safety_check(experiment)
    if kill:
        return "killed"

    elapsed_h = _hours_since(experiment["started_at"])
    baseline_sends = experiment["baseline"].get("sends", 0)
    challenger_sends = experiment["challenger"].get("sends", 0)

    # Determine ceiling based on warmup week
    config = load_config()
    current_week = config.get("warmup", {}).get("current_week", 5)
    ceiling = CEILING_HOURS_WARMUP if current_week <= 4 else CEILING_HOURS

    # Ceiling: force evaluation after max time
    if elapsed_h >= ceiling:
        log.info(f"Ceiling hit ({elapsed_h:.0f}h >= {ceiling}h) — forcing evaluation")
        return "ceiling"

    # Ready: both variants have enough sends AND floor time elapsed
    if (baseline_sends >= MIN_SENDS_PER_VARIANT
            and challenger_sends >= MIN_SENDS_PER_VARIANT
            and elapsed_h >= FLOOR_HOURS):
        return "ready"

    return "not_ready"


def run_safety_check(experiment: dict) -> dict | None:
    """Check safety guards on the challenger.

    Runs every heartbeat, not just at evaluation time.

    Kill conditions:
    - negative_ratio > 40% (of all replies are negative)
    - unsubscribe_rate > 2% (of sends)

    Returns None if safe, or dict with kill reason if triggered.
    """
    challenger = experiment.get("challenger", {})
    sends = challenger.get("sends", 0)
    if sends < 20:
        # Too few sends to judge — don't kill on noise
        return None

    replies_total = challenger.get("replies_total", 0)
    replies_negative = challenger.get("replies_negative", 0)
    replies_unsub = challenger.get("replies_unsubscribe", 0)

    negative_ratio = replies_negative / replies_total if replies_total > 0 else 0
    unsub_rate = replies_unsub / sends if sends > 0 else 0

    if negative_ratio > MAX_NEGATIVE_RATIO and replies_total >= 5:
        return {
            "reason": f"Negative ratio {negative_ratio:.1%} exceeds {MAX_NEGATIVE_RATIO:.0%} threshold",
            "negative_ratio": negative_ratio,
            "unsubscribe_rate": unsub_rate,
        }

    if unsub_rate > MAX_UNSUBSCRIBE_RATE:
        return {
            "reason": f"Unsubscribe rate {unsub_rate:.1%} exceeds {MAX_UNSUBSCRIBE_RATE:.0%} threshold",
            "negative_ratio": negative_ratio,
            "unsubscribe_rate": unsub_rate,
        }

    return None


# ──────────────────────────────────────────────────────────────────────
# EVALUATION
# ──────────────────────────────────────────────────────────────────────


def refresh_variant_classifications(experiment: dict) -> None:
    """Fetch and classify replies for both variants during heartbeat.

    Updates replies_positive/negative/neutral/unsubscribe counts so that
    run_safety_check() has real data to work with (not just zeros).
    """
    from modules.instantly import get_campaign_replies
    from modules.classifier import batch_classify

    for variant_key in ("baseline", "challenger"):
        variant = experiment[variant_key]
        cid = variant["campaign_id"]

        replies = get_campaign_replies(cid)
        if not replies:
            continue

        classified = batch_classify([{"text": r["reply_text"]} for r in replies])
        counts = {"POSITIVE": 0, "NEUTRAL": 0, "NEGATIVE": 0, "UNSUBSCRIBE": 0}
        for c in classified:
            cat = c.get("classification", "NEUTRAL")
            counts[cat] = counts.get(cat, 0) + 1

        variant["replies_positive"] = counts["POSITIVE"]
        variant["replies_neutral"] = counts["NEUTRAL"]
        variant["replies_negative"] = counts["NEGATIVE"]
        variant["replies_unsubscribe"] = counts["UNSUBSCRIBE"]
        log.info(
            f"  {variant_key} classifications: "
            f"+{counts['POSITIVE']} ~{counts['NEUTRAL']} "
            f"-{counts['NEGATIVE']} unsub:{counts['UNSUBSCRIBE']}"
        )


def evaluate_experiment(experiment: dict) -> dict:
    """Run full evaluation when thresholds are met.

    1. Fetch final stats from Instantly
    2. Classify replies via classifier.py
    3. Calculate positive_rate for both variants
    4. Run proportional z-test for confidence
    5. Determine winner
    6. Return evaluation result
    """
    from modules.instantly import get_campaign_summary

    # Update stats from Instantly
    for variant_key in ("baseline", "challenger"):
        variant = experiment[variant_key]
        cid = variant["campaign_id"]

        summary = get_campaign_summary(cid)
        if summary:
            variant["sends"] = summary["sent"]
            variant["replies_total"] = summary["replied"]

    # Classify replies (final pass — may already have heartbeat data)
    refresh_variant_classifications(experiment)

    for variant_key in ("baseline", "challenger"):
        variant = experiment[variant_key]
        # If classification produced no data but we have replies, keep existing
        # heartbeat-populated counts. Don't assume all positive.
        has_classification = (
            variant["replies_positive"] + variant["replies_negative"]
            + variant["replies_neutral"] + variant["replies_unsubscribe"]
        ) > 0
        if not has_classification and variant["replies_total"] > 0:
            log.warning(
                f"No reply classification data for {variant_key} "
                f"({variant['replies_total']} replies) — using unclassified reply count only"
            )

        # Calculate rates
        sends = variant["sends"]
        variant["positive_rate"] = (
            round(variant["replies_positive"] / sends * 100, 3) if sends > 0 else 0
        )
        total_replies = variant["replies_total"]
        variant["negative_ratio"] = (
            round(variant["replies_negative"] / total_replies, 3) if total_replies > 0 else 0
        )
        variant["unsubscribe_rate"] = (
            round(variant["replies_unsubscribe"] / sends, 4) if sends > 0 else 0
        )

    # Statistical confidence (proportional z-test)
    confidence = _calculate_confidence(
        experiment["baseline"]["replies_positive"],
        experiment["baseline"]["sends"],
        experiment["challenger"]["replies_positive"],
        experiment["challenger"]["sends"],
    )
    experiment["confidence"] = round(confidence, 4)

    # Determine winner
    b_rate = experiment["baseline"]["positive_rate"]
    c_rate = experiment["challenger"]["positive_rate"]
    margin = c_rate - b_rate

    if margin > MIN_WIN_MARGIN * 100:
        winner = "challenger"
    else:
        winner = "baseline"  # Baseline wins ties and small margins

    experiment["winner"] = winner
    experiment["status"] = "evaluating"

    significant = confidence < 0.05

    log.info(f"Evaluation complete:")
    log.info(f"  Baseline: {b_rate}% positive ({experiment['baseline']['sends']} sends)")
    log.info(f"  Challenger: {c_rate}% positive ({experiment['challenger']['sends']} sends)")
    log.info(f"  Winner: {winner} (margin: {margin:+.2f}%, p={confidence:.4f}, {'significant' if significant else 'not significant'})")

    return {
        "winner": winner,
        "margin": round(margin, 3),
        "confidence": confidence,
        "significant": significant,
        "baseline_rate": b_rate,
        "challenger_rate": c_rate,
    }


def _calculate_confidence(pos_a: int, n_a: int, pos_b: int, n_b: int) -> float:
    """Proportional z-test. Returns p-value (0-1).

    <0.05 = statistically significant. Uses scipy-free math (normal approx).
    """
    if n_a == 0 or n_b == 0:
        return 1.0

    p_a = pos_a / n_a
    p_b = pos_b / n_b
    p_pool = (pos_a + pos_b) / (n_a + n_b)

    if p_pool == 0 or p_pool == 1:
        return 1.0

    se = math.sqrt(p_pool * (1 - p_pool) * (1 / n_a + 1 / n_b))
    if se == 0:
        return 1.0

    z = abs(p_a - p_b) / se

    # Two-tailed p-value approximation (no scipy needed)
    # Using Abramowitz & Stegun approximation for normal CDF
    p_value = 2 * (1 - _normal_cdf(z))
    return max(0, min(1, p_value))


def _normal_cdf(x: float) -> float:
    """Approximation of the standard normal CDF (Abramowitz & Stegun)."""
    if x < 0:
        return 1 - _normal_cdf(-x)
    t = 1 / (1 + 0.2316419 * x)
    d = 0.3989422804014327  # 1/sqrt(2*pi)
    p = d * math.exp(-x * x / 2)
    poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937
            + t * (-1.821255978 + t * 1.330274429))))
    return 1 - p * poly


# ──────────────────────────────────────────────────────────────────────
# PROMOTE & DEPLOY
# ──────────────────────────────────────────────────────────────────────


def promote_winner(experiment: dict, data: dict) -> dict:
    """Promote winning copy as new baseline.

    1. Archive experiment to history
    2. Update best_ever if this winner beats the record
    3. Update aggregate metrics
    4. Pause both campaigns
    5. Delete loser's campaign
    """
    from modules.instantly import pause_campaign, delete_campaign

    winner = experiment["winner"]
    winner_variant = experiment[winner]
    loser_key = "challenger" if winner == "baseline" else "baseline"
    loser_variant = experiment[loser_key]

    # Archive
    experiment["status"] = "completed"
    experiment["completed_at"] = datetime.now().isoformat()
    data["history"].append(experiment)

    # Update best_ever
    winner_rate = winner_variant["positive_rate"]
    current_best = data.get("best_ever")
    if not current_best or winner_rate > current_best.get("positive_rate", 0):
        data["best_ever"] = {
            "copy": winner_variant["copy"],
            "positive_rate": winner_rate,
            "round": experiment["round"],
            "date": datetime.now().isoformat(),
        }
        log.info(f"New best_ever: {winner_rate}% positive (round {experiment['round']})")

    # Update aggregate metrics
    metrics = data["aggregate_metrics"]
    metrics["total_experiments"] += 1
    metrics["total_sends"] += experiment["baseline"]["sends"] + experiment["challenger"]["sends"]
    metrics["total_positive_replies"] += (
        experiment["baseline"]["replies_positive"] + experiment["challenger"]["replies_positive"]
    )
    if winner_rate > metrics["best_positive_rate"]:
        metrics["best_positive_rate"] = winner_rate
        subj = winner_variant["copy"].get("subject", "")
        metrics["best_copy_summary"] = f"R{experiment['round']}: {subj}"

    # Clear current experiment
    data["current_experiment"] = None

    # Pause both campaigns
    try:
        pause_campaign(experiment["baseline"]["campaign_id"])
    except Exception as e:
        log.warning(f"Failed to pause baseline campaign: {e}")

    try:
        pause_campaign(experiment["challenger"]["campaign_id"])
    except Exception as e:
        log.warning(f"Failed to pause challenger campaign: {e}")

    # Delete loser's campaign (winner stays for audit until next round)
    try:
        delete_campaign(loser_variant["campaign_id"])
        log.info(f"Deleted loser campaign: {loser_variant['campaign_id']}")
    except Exception as e:
        log.warning(f"Failed to delete loser campaign: {e}")

    save_experiments(data)
    log.info(f"Winner promoted: {winner} ({winner_rate}% positive)")

    return {
        "winner": winner,
        "winner_rate": winner_rate,
        "winner_copy": winner_variant["copy"],
    }


def deploy_new_round(data: dict) -> dict:
    """Start the next experiment round.

    1. Load resources.md (compounding learnings)
    2. Get baseline from last winner
    3. Generate new challenger via GPT
    4. Create and activate two new Instantly campaigns
    """
    # Baseline is the last winner's copy
    last_exp = data["history"][-1] if data["history"] else None
    if last_exp:
        winner_key = last_exp["winner"]
        baseline_copy = last_exp[winner_key]["copy"]
    else:
        baseline_copy = _load_baseline_from_templates()

    round_num = data.get("round_number", 0) + 1
    resources_md = _load_resources()
    challenger = _generate_challenger(baseline_copy, resources_md, data.get("history", []))

    from modules.instantly import create_campaign, activate_campaign

    baseline_campaign = create_campaign(
        f"Opt-R{round_num}-Baseline",
        sending_account=_get_sending_account(),
    )
    challenger_campaign = create_campaign(
        f"Opt-R{round_num}-Challenger",
        sending_account=_get_sending_account(),
    )

    baseline_cid = baseline_campaign.get("campaign_id", "")
    challenger_cid = challenger_campaign.get("campaign_id", "")

    if baseline_cid:
        activate_campaign(baseline_cid)
    if challenger_cid:
        activate_campaign(challenger_cid)

    experiment = {
        "id": f"exp_{round_num:03d}",
        "round": round_num,
        "status": "running",
        "started_at": datetime.now().isoformat(),
        "baseline": {
            "campaign_id": baseline_cid,
            "copy": baseline_copy,
            "sends": 0,
            "replies_total": 0,
            "replies_positive": 0,
            "replies_neutral": 0,
            "replies_negative": 0,
            "replies_unsubscribe": 0,
            "positive_rate": 0.0,
            "negative_ratio": 0.0,
            "unsubscribe_rate": 0.0,
        },
        "challenger": {
            "campaign_id": challenger_cid,
            "copy": challenger["copy"],
            "hypothesis": challenger["hypothesis"],
            "sends": 0,
            "replies_total": 0,
            "replies_positive": 0,
            "replies_neutral": 0,
            "replies_negative": 0,
            "replies_unsubscribe": 0,
            "positive_rate": 0.0,
            "negative_ratio": 0.0,
            "unsubscribe_rate": 0.0,
        },
        "pushed_prospect_ids": [],
        "winner": None,
        "confidence": None,
        "learnings": "",
    }

    data["current_experiment"] = experiment
    data["round_number"] = round_num
    save_experiments(data)

    log.info(f"New round {round_num} deployed")
    log.info(f"  Hypothesis: {challenger['hypothesis']}")

    return experiment


def kill_challenger(experiment: dict, data: dict, reason: dict) -> dict:
    """Emergency kill: pause challenger, promote baseline, log reason."""
    from modules.instantly import pause_campaign, delete_campaign

    log.warning(f"SAFETY KILL: {reason['reason']}")

    # Pause challenger
    try:
        pause_campaign(experiment["challenger"]["campaign_id"])
    except Exception as e:
        log.warning(f"Failed to pause challenger: {e}")

    # Delete challenger campaign
    try:
        delete_campaign(experiment["challenger"]["campaign_id"])
    except Exception as e:
        log.warning(f"Failed to delete killed challenger: {e}")

    experiment["status"] = "killed"
    experiment["winner"] = "baseline"
    experiment["learnings"] = f"KILLED: {reason['reason']}"
    experiment["completed_at"] = datetime.now().isoformat()

    data["history"].append(experiment)
    data["current_experiment"] = None
    data["aggregate_metrics"]["total_experiments"] += 1
    save_experiments(data)

    # Append kill to learnings
    append_learnings(experiment, "baseline")

    return {
        "status": "killed",
        "reason": reason["reason"],
        "negative_ratio": reason.get("negative_ratio", 0),
        "unsubscribe_rate": reason.get("unsubscribe_rate", 0),
    }


# ──────────────────────────────────────────────────────────────────────
# LEARNINGS (APPEND-ONLY)
# ──────────────────────────────────────────────────────────────────────


def append_learnings(experiment: dict, winner: str) -> None:
    """Append experiment results to resources.md.

    Always appends to 'Raw Experiment Log' (append-only).
    Every SUMMARY_REGEN_INTERVAL rounds, regenerates the summary sections.
    """
    resources = _load_resources()

    # Build log entry
    baseline = experiment["baseline"]
    challenger = experiment["challenger"]
    b_rate = baseline.get("positive_rate", 0)
    c_rate = challenger.get("positive_rate", 0)
    margin = c_rate - b_rate
    confidence = experiment.get("confidence")
    p_str = f"p={confidence:.4f}" if confidence is not None else "p=N/A"

    entry = (
        f"\n### Round {experiment['round']} — {datetime.now().strftime('%Y-%m-%d')}\n"
        f"- **Hypothesis**: {challenger.get('hypothesis', 'N/A')}\n"
        f"- **Baseline**: {b_rate}% positive ({baseline.get('sends', 0)} sends)\n"
        f"- **Challenger**: {c_rate}% positive ({challenger.get('sends', 0)} sends)\n"
        f"- **Winner**: {winner.upper()} (margin: {margin:+.2f}%, {p_str})\n"
        f"- **Status**: {experiment.get('status', 'completed')}\n"
    )

    # Generate AI insight for this round
    insight = _generate_insight(experiment, winner)
    if insight:
        entry += f"- **Insight**: {insight}\n"

    # Append to raw log
    if "## Raw Experiment Log" in resources:
        resources = resources.replace(
            "## Raw Experiment Log",
            f"## Raw Experiment Log\n{entry}",
        )
    else:
        resources += f"\n## Raw Experiment Log\n{entry}"

    # Every N rounds, regenerate summary sections
    round_num = experiment.get("round", 0)
    if round_num > 0 and round_num % SUMMARY_REGEN_INTERVAL == 0:
        resources = _regenerate_summaries(resources)

    _save_resources(resources)
    log.info(f"Learnings appended for round {experiment['round']}")


# ──────────────────────────────────────────────────────────────────────
# CHALLENGER GENERATION
# ──────────────────────────────────────────────────────────────────────


def _generate_challenger(baseline_copy: dict, resources_md: str, history: list) -> dict:
    """Use GPT to generate a challenger copy variant.

    Returns: {"copy": {subject, body, followup_1_body}, "hypothesis": str}
    """
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not set — cannot generate challenger")

    # Build history summary (last 5)
    history_summary = ""
    for exp in history[-5:]:
        w = exp.get("winner", "?")
        hyp = exp.get("challenger", {}).get("hypothesis", "?")
        b_rate = exp.get("baseline", {}).get("positive_rate", 0)
        c_rate = exp.get("challenger", {}).get("positive_rate", 0)
        history_summary += f"- R{exp.get('round', '?')}: {w} won. Hypothesis: {hyp}. B={b_rate}% vs C={c_rate}%\n"

    if not history_summary:
        history_summary = "(No previous experiments — this is the first round)"

    system_prompt = """You are an expert cold email copywriter optimizing for positive reply rate.

Your task is to generate a challenger email variant that tests a specific hypothesis against the current baseline.

RULES:
- No em dashes, use commas or periods instead
- Plain text only, no HTML or markdown formatting
- Under 80 words for body copy
- Casual, conversational tone
- Must include {first_name}, {company}, {personalization_hook} placeholders
- End with {sender_first_name}
- Follow-up must be different from the initial email (not a copy)
- Change exactly ONE variable from the baseline

Respond ONLY with valid JSON in this exact format:
{
  "hypothesis": "Changing X to Y because Z",
  "subject": "...",
  "body": "...",
  "followup_1_body": "..."
}"""

    user_prompt = f"""CURRENT BASELINE (the copy to beat):
Subject: {baseline_copy.get('subject', '')}
Body: {baseline_copy.get('body', '')}
Follow-up: {baseline_copy.get('followup_1_body', '')}

COMPOUNDING LEARNINGS (from all past experiments):
{resources_md}

RECENT EXPERIMENT HISTORY:
{history_summary}

Generate a challenger that tests ONE specific hypothesis to beat this baseline."""

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": OPTIMIZER_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "max_completion_tokens": 1024,
        "temperature": 0.8,
    }

    resp = requests.post(OPENAI_API_URL, headers=headers, json=payload, timeout=60)
    if resp.status_code != 200:
        raise RuntimeError(f"OpenAI error generating challenger: {resp.status_code}, {resp.text[:300]}")

    content = resp.json()["choices"][0]["message"]["content"].strip()

    # Strip markdown code fences
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*", "", content)
        content = re.sub(r"\s*```$", "", content)

    parsed = json.loads(content)

    return {
        "copy": {
            "subject": parsed["subject"],
            "body": parsed["body"],
            "followup_1_body": parsed["followup_1_body"],
        },
        "hypothesis": parsed["hypothesis"],
    }


def _generate_insight(experiment: dict, winner: str) -> str:
    """Generate a one-line insight about why the winner won."""
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        return ""

    baseline = experiment["baseline"]
    challenger = experiment["challenger"]

    prompt = f"""In ONE sentence, explain the key difference that made the {winner} win this A/B test:

Baseline subject: {baseline['copy'].get('subject', '')}
Challenger subject: {challenger['copy'].get('subject', '')}
Challenger hypothesis: {challenger.get('hypothesis', '')}
Baseline positive rate: {baseline.get('positive_rate', 0)}%
Challenger positive rate: {challenger.get('positive_rate', 0)}%

One-sentence insight:"""

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "gpt-4.1-mini",
        "messages": [{"role": "user", "content": prompt}],
        "max_completion_tokens": 128,
        "temperature": 0.3,
    }

    try:
        resp = requests.post(OPENAI_API_URL, headers=headers, json=payload, timeout=30)
        if resp.status_code == 200:
            return resp.json()["choices"][0]["message"]["content"].strip()
    except Exception:
        pass
    return ""


def _regenerate_summaries(resources: str) -> str:
    """Regenerate 'What Works' and 'What Doesn't Work' from raw log entries."""
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        return resources

    # Extract raw experiment log
    raw_log = ""
    if "## Raw Experiment Log" in resources:
        raw_log = resources.split("## Raw Experiment Log")[1]

    if not raw_log.strip() or raw_log.strip() == "(Appended automatically by optimizer)":
        return resources

    prompt = f"""Based on these cold email A/B test experiment results, generate two sections:

1. "What Works" — bullet points of proven techniques/patterns
2. "What Doesn't Work" — bullet points of things that failed

Raw experiment data:
{raw_log}

Respond ONLY in this format:
## What Works
- bullet 1
- bullet 2

## What Doesn't Work
- bullet 1
- bullet 2"""

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "gpt-4.1-mini",
        "messages": [{"role": "user", "content": prompt}],
        "max_completion_tokens": 512,
        "temperature": 0.3,
    }

    try:
        resp = requests.post(OPENAI_API_URL, headers=headers, json=payload, timeout=30)
        if resp.status_code != 200:
            return resources

        new_sections = resp.json()["choices"][0]["message"]["content"].strip()

        # Replace old sections
        for section in ("## What Works", "## What Doesn't Work"):
            if section in new_sections and section in resources:
                # Find section boundaries in resources
                start = resources.index(section)
                # Find next section
                remaining = resources[start + len(section):]
                next_section = remaining.find("\n## ")
                if next_section == -1:
                    end = len(resources)
                else:
                    end = start + len(section) + next_section

                # Find same section boundaries in new content
                new_start = new_sections.index(section)
                new_remaining = new_sections[new_start + len(section):]
                new_next = new_remaining.find("\n## ")
                if new_next == -1:
                    new_end = len(new_sections)
                else:
                    new_end = new_start + len(section) + new_next

                resources = resources[:start] + new_sections[new_start:new_end] + resources[end:]

        log.info("Regenerated summary sections in resources.md")
    except Exception as e:
        log.warning(f"Failed to regenerate summaries: {e}")

    return resources


# ──────────────────────────────────────────────────────────────────────
# HELPERS
# ──────────────────────────────────────────────────────────────────────


def _load_baseline_from_templates() -> dict:
    """Load baseline copy from templates.json (saas_founder + tier_1 subjects)."""
    templates = {}
    if TEMPLATES_PATH.exists():
        try:
            with open(TEMPLATES_PATH) as f:
                templates = json.load(f)
        except (json.JSONDecodeError, IOError):
            pass

    # Pick first active subject line
    subject = "Ad fatigue?"
    tiers = templates.get("subject_lines", {})
    for tier_data in tiers.values():
        if tier_data.get("active"):
            variants = tier_data.get("variants", [])
            if variants:
                # Pick one without placeholders for the template
                for v in variants:
                    if "{" not in v:
                        subject = v
                        break
                else:
                    subject = variants[0]
                break

    body = templates.get("saas_founder", {}).get("body", "")
    if not body:
        body = (
            "Hi {first_name},\n\n"
            "Just {personalization_hook}. At that volume, the biggest challenge "
            "is usually keeping enough fresh ad creatives flowing into Meta testing.\n\n"
            "I recorded a quick video showing how we help businesses like {company} "
            "transform their ad creative process from days into minutes. No designers. "
            "No briefs. No agencies.\n\n"
            "Want me to send it over?\n\n"
            "{sender_first_name}"
        )

    followup = templates.get("followup_1", {}).get("body", "")
    if not followup:
        followup = (
            "Hi {first_name},\n\n"
            "Our users are launching high-converting Meta ad creatives in under 3 minutes. "
            "No designers. No briefs. No agencies.\n\n"
            "I've still got that video ready for you. Just reply here and I'll fire it over.\n\n"
            "{sender_first_name}"
        )

    return {"subject": subject, "body": body, "followup_1_body": followup}


def _load_resources() -> str:
    """Load resources.md content."""
    if RESOURCES_PATH.exists():
        try:
            return RESOURCES_PATH.read_text()
        except IOError:
            pass
    return ""


def _save_resources(content: str) -> None:
    """Save resources.md."""
    RESOURCES_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESOURCES_PATH.write_text(content)


def _get_sending_account() -> str | None:
    """Get the configured sending account email."""
    return os.environ.get("INSTANTLY_SENDING_ACCOUNT")


def _hours_since(iso_timestamp: str) -> float:
    """Calculate hours elapsed since an ISO timestamp."""
    try:
        started = datetime.fromisoformat(iso_timestamp)
        return (datetime.now() - started).total_seconds() / 3600
    except (ValueError, TypeError):
        return 0


def _today() -> str:
    return datetime.now().strftime("%Y-%m-%d")
