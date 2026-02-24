"""Apollo.io People Enrichment API integration."""

import logging
import os
import time

import requests

from modules.pipeline import update_prospect

log = logging.getLogger("enrichment")

APOLLO_MATCH_URL = "https://api.apollo.io/api/v1/people/match"
APOLLO_BULK_MATCH_URL = "https://api.apollo.io/api/v1/people/bulk_match"
APOLLO_BATCH_SIZE = 10  # Max per bulk request
RATE_LIMIT_DELAY = 2    # Seconds between retries
MAX_RETRIES = 3


def enrich_person(first_name, last_name, domain,
                  organization_name="", linkedin_url=""):
    """Enrich a single person via Apollo People Match endpoint.

    Args:
        first_name: str
        last_name: str
        domain: str — company domain (e.g. "acme.com")
        organization_name: str — optional company name
        linkedin_url: str — optional LinkedIn profile URL

    Returns:
        dict with keys:
            status: "matched" | "no_match" | "error" | "no_api_key"
            person: dict (Apollo person object) or None
            email: str or None
            email_verified: bool
    """
    api_key = os.environ.get("APOLLO_API_KEY", "")
    if not api_key:
        return {"status": "no_api_key", "person": None,
                "email": None, "email_verified": False}

    payload = {
        "api_key": api_key,
        "first_name": first_name,
        "last_name": last_name,
        "domain": domain,
        "reveal_personal_emails": True,
    }
    if organization_name:
        payload["organization_name"] = organization_name
    if linkedin_url:
        payload["linkedin_url"] = linkedin_url

    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.post(APOLLO_MATCH_URL, json=payload, timeout=15)

            if resp.status_code == 429:
                wait = RATE_LIMIT_DELAY * (2 ** attempt)
                log.warning(f"Apollo rate limit hit, waiting {wait}s...")
                time.sleep(wait)
                continue

            if resp.status_code != 200:
                return {"status": "error", "person": None,
                        "email": None, "email_verified": False,
                        "error": f"HTTP {resp.status_code}"}

            data = resp.json()
            person = data.get("person")

            if not person:
                return {"status": "no_match", "person": None,
                        "email": None, "email_verified": False}

            email = person.get("email", "")
            email_status = person.get("email_status", "")

            return {
                "status": "matched",
                "person": person,
                "email": email or None,
                "email_verified": email_status == "verified",
            }

        except requests.RequestException as e:
            if attempt == MAX_RETRIES - 1:
                return {"status": "error", "person": None,
                        "email": None, "email_verified": False,
                        "error": str(e)}
            time.sleep(RATE_LIMIT_DELAY)

    return {"status": "error", "person": None,
            "email": None, "email_verified": False,
            "error": "Max retries exceeded"}


def enrich_bulk(people):
    """Enrich up to 10 people via Apollo Bulk Match endpoint.

    Args:
        people: list of dicts, each with keys:
            first_name, last_name, domain,
            organization_name (opt), linkedin_url (opt)

    Returns:
        list of dicts (same structure as enrich_person return).
    """
    api_key = os.environ.get("APOLLO_API_KEY", "")
    if not api_key:
        return [{"status": "no_api_key", "person": None,
                 "email": None, "email_verified": False}
                for _ in people]

    details = []
    for p in people[:APOLLO_BATCH_SIZE]:
        entry = {
            "first_name": p.get("first_name", ""),
            "last_name": p.get("last_name", ""),
            "domain": p.get("domain", ""),
            "reveal_personal_emails": True,
        }
        if p.get("organization_name"):
            entry["organization_name"] = p["organization_name"]
        if p.get("linkedin_url"):
            entry["linkedin_url"] = p["linkedin_url"]
        details.append(entry)

    payload = {"api_key": api_key, "details": details}

    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.post(APOLLO_BULK_MATCH_URL, json=payload, timeout=30)

            if resp.status_code == 429:
                wait = RATE_LIMIT_DELAY * (2 ** attempt)
                log.warning(f"Apollo bulk rate limit hit, waiting {wait}s...")
                time.sleep(wait)
                continue

            if resp.status_code != 200:
                return [{"status": "error", "person": None,
                         "email": None, "email_verified": False,
                         "error": f"HTTP {resp.status_code}"}
                        for _ in people]

            data = resp.json()
            matches = data.get("matches", [])

            results = []
            for match in matches:
                person = match if match else None
                if person:
                    email = person.get("email", "")
                    email_status = person.get("email_status", "")
                    results.append({
                        "status": "matched",
                        "person": person,
                        "email": email or None,
                        "email_verified": email_status == "verified",
                    })
                else:
                    results.append({
                        "status": "no_match", "person": None,
                        "email": None, "email_verified": False,
                    })

            # Pad if fewer results than input
            while len(results) < len(people):
                results.append({
                    "status": "no_match", "person": None,
                    "email": None, "email_verified": False,
                })

            return results

        except requests.RequestException as e:
            if attempt == MAX_RETRIES - 1:
                return [{"status": "error", "person": None,
                         "email": None, "email_verified": False,
                         "error": str(e)} for _ in people]
            time.sleep(RATE_LIMIT_DELAY)

    return [{"status": "error", "person": None,
             "email": None, "email_verified": False,
             "error": "Max retries exceeded"} for _ in people]


def map_apollo_to_prospect(person_data, existing_prospect):
    """Map Apollo person response fields onto a prospect update dict.

    Non-destructive: only overwrites empty fields, always adds enrichment data.
    Email is always overwritten since Apollo is authoritative.

    Args:
        person_data: dict — Apollo person object
        existing_prospect: dict — current prospect record

    Returns:
        dict: fields to pass to update_prospect()
    """
    if not person_data:
        return {}

    updates = {}

    # Email — always overwrite (Apollo is authoritative)
    email = person_data.get("email", "")
    if email:
        updates["email"] = email
        updates["email_source"] = "apollo"
        updates["email_verified"] = (
            person_data.get("email_status") == "verified"
        )

    # Role — only if currently empty
    title = person_data.get("title", "")
    if title and not existing_prospect.get("role"):
        updates["role"] = title

    # LinkedIn URL — only if currently empty
    linkedin = person_data.get("linkedin_url", "")
    if linkedin and not existing_prospect.get("linkedin_url"):
        updates["linkedin_url"] = linkedin

    # Company name — only if currently empty
    org = person_data.get("organization") or {}
    org_name = org.get("name", "")
    if org_name and not existing_prospect.get("company"):
        updates["company"] = org_name

    # Enrichment data into company_intel (additive — preserves existing fields)
    intel = dict(existing_prospect.get("company_intel", {}))

    headline = person_data.get("headline", "")
    if headline:
        intel["apollo_headline"] = headline

    seniority = person_data.get("seniority", "")
    if seniority:
        intel["seniority"] = seniority

    departments = person_data.get("departments", [])
    if departments:
        intel["departments"] = departments

    # Location
    city = person_data.get("city", "")
    state = person_data.get("state", "")
    country = person_data.get("country", "")
    location_parts = [p for p in [city, state, country] if p]
    if location_parts:
        intel["location"] = ", ".join(location_parts)

    # Employment history (last 3 roles)
    history = person_data.get("employment_history", [])
    if history:
        intel["employment_history"] = [
            {
                "title": h.get("title", ""),
                "organization_name": h.get("organization_name", ""),
                "current": h.get("current", False),
            }
            for h in history[:3]
        ]

    # Organization-level enrichment
    if org.get("estimated_num_employees") and not intel.get("estimated_employees"):
        intel["estimated_employees"] = str(org["estimated_num_employees"])

    if org.get("industry"):
        intel["industry"] = org["industry"]

    if org.get("annual_revenue"):
        intel["revenue"] = str(org["annual_revenue"])

    updates["company_intel"] = intel

    return updates


def batch_enrich(stage="researched", score_min=None):
    """Enrich all matching prospects via Apollo bulk endpoint.

    Batches in groups of 10 for the bulk API.

    Args:
        stage: Pipeline stage to filter on.
        score_min: Minimum fit_score to include.

    Returns:
        dict with keys:
            enriched, emails_found, no_match, errors, skipped,
            credits_used, results
    """
    from modules.pipeline import list_prospects
    from modules.email_finder import _domain_from_url

    result_obj = list_prospects(stage=stage, score_min=score_min)
    prospects = result_obj.get("prospects", [])

    stats = {
        "enriched": 0, "emails_found": 0, "no_match": 0,
        "errors": 0, "skipped": 0, "credits_used": 0,
        "results": [],
    }

    # Build batch groups of 10
    batch = []
    batch_prospects = []

    for prospect in prospects:
        # Skip if already enriched via Apollo
        if (prospect.get("email") and
                prospect.get("email_source") == "apollo" and
                prospect.get("email_verified")):
            stats["skipped"] += 1
            continue

        name = prospect.get("name", "")
        parts = name.strip().split()
        if len(parts) < 2:
            stats["skipped"] += 1
            stats["results"].append({
                "id": prospect["id"],
                "status": "skipped",
                "message": "Need first + last name",
            })
            continue

        domain = _domain_from_url(prospect.get("company_url", ""))
        if not domain:
            stats["skipped"] += 1
            stats["results"].append({
                "id": prospect["id"],
                "status": "skipped",
                "message": "No company_url / domain",
            })
            continue

        batch.append({
            "first_name": parts[0],
            "last_name": parts[-1],
            "domain": domain,
            "organization_name": prospect.get("company", ""),
            "linkedin_url": prospect.get("linkedin_url", ""),
        })
        batch_prospects.append(prospect)

        # Process when batch is full
        if len(batch) >= APOLLO_BATCH_SIZE:
            _process_batch(batch, batch_prospects, stats)
            batch = []
            batch_prospects = []

    # Process remaining
    if batch:
        _process_batch(batch, batch_prospects, stats)

    return stats


def _process_batch(batch, prospects, stats):
    """Process a single batch of up to 10 people through Apollo bulk API.

    Mutates stats dict in place.
    """
    results = enrich_bulk(batch)
    stats["credits_used"] += len(batch)

    for prospect, result in zip(prospects, results):
        pid = prospect["id"]

        if result["status"] == "matched":
            updates = map_apollo_to_prospect(result["person"], prospect)
            if updates:
                update_prospect(pid, updates)
                stats["enriched"] += 1
                if result.get("email"):
                    stats["emails_found"] += 1
                stats["results"].append({
                    "id": pid,
                    "status": "enriched",
                    "email": result.get("email"),
                    "email_verified": result.get("email_verified"),
                    "role": result["person"].get("title", ""),
                })
            else:
                stats["no_match"] += 1
                stats["results"].append({
                    "id": pid, "status": "no_useful_data",
                })

        elif result["status"] == "no_match":
            stats["no_match"] += 1
            stats["results"].append({"id": pid, "status": "no_match"})

        else:
            stats["errors"] += 1
            stats["results"].append({
                "id": pid, "status": "error",
                "error": result.get("error", "Unknown"),
            })
