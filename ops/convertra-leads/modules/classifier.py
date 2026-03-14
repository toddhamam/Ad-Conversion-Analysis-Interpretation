"""AI reply classifier — categorizes cold email replies for optimization scoring."""

import json
import logging
import os
import re

import requests


log = logging.getLogger("classifier")

OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"
CLASSIFIER_MODEL = "gpt-4.1-mini"

# Classification categories (priority order — highest wins)
POSITIVE = "POSITIVE"
NEUTRAL = "NEUTRAL"
NEGATIVE = "NEGATIVE"
UNSUBSCRIBE = "UNSUBSCRIBE"

SYSTEM_PROMPT = """You are classifying a cold email reply. Answer each question YES or NO:

1. Does the person express interest in learning more, seeing a demo, or receiving information? (buying signals, questions about the product)
2. Does the person explicitly ask to be removed, unsubscribed, or stop receiving emails?
3. Does the person express annoyance, disinterest, or rejection?

Respond in this exact format (nothing else):
INTERESTED: YES/NO
UNSUBSCRIBE: YES/NO
NEGATIVE: YES/NO"""

# Keyword fallback patterns (checked in priority order)
_UNSUB_KEYWORDS = [
    "unsubscribe", "remove me", "stop emailing", "opt out", "take me off",
    "don't email", "do not email", "don't contact", "remove from list",
    "stop contacting", "no more emails",
]
_NEGATIVE_KEYWORDS = [
    "not interested", "no thanks", "no thank you", "wrong person",
    "don't need", "do not need", "not relevant", "waste of time",
    "spam", "junk", "reported",
]
_NEUTRAL_KEYWORDS = [
    "out of office", "auto-reply", "automatic reply", "will be back",
    "forwarded", "i'll pass this", "not the right person",
    "on vacation", "on leave", "away from",
]
_POSITIVE_KEYWORDS = [
    "interested", "tell me more", "send it", "let's chat", "sounds good",
    "send the video", "love to see", "want to see", "set up a call",
    "schedule a call", "book a time", "yes please", "sure",
    "would love", "happy to chat",
]


def classify_reply(reply_text: str) -> str:
    """Classify a single reply into POSITIVE/NEUTRAL/NEGATIVE/UNSUBSCRIBE.

    Priority order (highest wins):
    1. UNSUBSCRIBE — always respect opt-outs, even if interested
    2. NEGATIVE
    3. POSITIVE
    4. NEUTRAL (default)

    Falls back to keyword matching if API unavailable.
    """
    if not reply_text or not reply_text.strip():
        return NEUTRAL

    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        log.warning("OPENAI_API_KEY not set, using keyword fallback")
        return _keyword_fallback(reply_text)

    try:
        result = _call_classifier(api_key, reply_text)
        if result:
            return result
    except Exception as e:
        log.warning(f"Classifier API failed: {e}, using keyword fallback")

    return _keyword_fallback(reply_text)


def batch_classify(replies: list[dict]) -> list[dict]:
    """Classify multiple replies. Each dict must have a 'text' key.

    Returns list with added 'classification' key.
    Sequential calls to respect rate limits.
    """
    results = []
    for reply in replies:
        text = reply.get("text", "")
        classification = classify_reply(text)
        results.append({**reply, "classification": classification})
    return results


def _call_classifier(api_key: str, reply_text: str) -> str | None:
    """Call OpenAI to classify the reply using binary eval pattern."""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": CLASSIFIER_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f'Reply text: "{reply_text}"'},
        ],
        "max_completion_tokens": 64,
        "temperature": 0,
    }

    resp = requests.post(OPENAI_API_URL, headers=headers, json=payload, timeout=30)
    if resp.status_code != 200:
        log.warning(f"Classifier OpenAI error: {resp.status_code}, {resp.text[:200]}")
        return None

    content = resp.json()["choices"][0]["message"]["content"].strip().upper()

    # Parse binary flags
    interested = "INTERESTED: YES" in content
    unsub = "UNSUBSCRIBE: YES" in content
    negative = "NEGATIVE: YES" in content

    # Priority order: UNSUBSCRIBE > NEGATIVE > POSITIVE > NEUTRAL
    if unsub:
        return UNSUBSCRIBE
    if negative:
        return NEGATIVE
    if interested:
        return POSITIVE
    return NEUTRAL


def _keyword_fallback(reply_text: str) -> str:
    """Deterministic fallback classifier using keyword matching.

    Checks patterns in priority order (UNSUBSCRIBE > NEGATIVE > NEUTRAL > POSITIVE).
    Returns NEUTRAL if no match.
    """
    text_lower = reply_text.lower()

    for kw in _UNSUB_KEYWORDS:
        if kw in text_lower:
            return UNSUBSCRIBE

    for kw in _NEGATIVE_KEYWORDS:
        if kw in text_lower:
            return NEGATIVE

    for kw in _NEUTRAL_KEYWORDS:
        if kw in text_lower:
            return NEUTRAL

    for kw in _POSITIVE_KEYWORDS:
        if kw in text_lower:
            return POSITIVE

    return NEUTRAL
