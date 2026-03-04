"""Enrichment router — Apollo (primary) with Hunter.io fallback.

Apollo is the primary enrichment source (10,000 credits/month free tier).
Hunter.io is kept as a fallback for edge cases where Apollo misses.

The public API (enrich_person, search_domain_contacts, batch_enrich,
map_to_prospect) is provider-agnostic — callers don't care which
service found the email.
"""

import logging
import os
import time

from modules.pipeline import update_prospect

log = logging.getLogger("enrichment")

BATCH_DELAY = 0.3  # Seconds between calls


def _get_provider():
    """Determine which enrichment provider to use.

    Priority: Apollo (if key set) > Hunter (if key set) > None
    """
    if os.environ.get("APOLLO_API_KEY", ""):
        return "apollo"
    if os.environ.get("HUNTER_API_KEY", ""):
        return "hunter"
    return None


# ── Public API (provider-agnostic) ──────────────────────────────────


def enrich_person(first_name=None, last_name=None, domain=None,
                  organization_name="", linkedin_url="", email=None):
    """Find email + enrich person via best available provider.

    Tries Apollo first, falls back to Hunter, then gives up.

    Returns:
        dict with keys:
            status: "matched" | "no_match" | "error" | "no_api_key"
            person: dict with enrichment data or None
            email: str or None
            email_verified: bool
    """
    provider = _get_provider()
    if not provider:
        return {"status": "no_api_key", "person": None,
                "email": None, "email_verified": False}

    if provider == "apollo":
        from modules.apollo_enrichment import enrich_person as apollo_enrich
        result = apollo_enrich(
            first_name=first_name,
            last_name=last_name,
            domain=domain,
            linkedin_url=linkedin_url or None,
            email=email,
            organization_name=organization_name or None,
        )
        # If Apollo matched, return it
        if result["status"] == "matched":
            return result

        # If Apollo missed and Hunter is available, try Hunter as fallback
        if os.environ.get("HUNTER_API_KEY", "") and first_name and last_name and domain:
            log.info(f"  Apollo missed {first_name} {last_name}@{domain}, trying Hunter...")
            return _hunter_enrich(first_name, last_name, domain)

        return result

    # Hunter-only path
    if first_name and last_name and domain:
        return _hunter_enrich(first_name, last_name, domain)

    return {"status": "error", "person": None,
            "email": None, "email_verified": False,
            "error": "Hunter requires first_name, last_name, and domain"}


def search_domain_contacts(domain):
    """Search for people at a domain via best available provider.

    Returns:
        dict with status, contacts, organization
    """
    provider = _get_provider()
    if not provider:
        return {"status": "no_api_key", "contacts": [], "organization": None}

    if provider == "apollo":
        from modules.apollo_enrichment import search_domain_contacts as apollo_search
        return apollo_search(domain)

    # Hunter fallback
    return _hunter_domain_search(domain)


def map_to_prospect(person_data, existing_prospect):
    """Map enrichment data onto a prospect update dict (provider-agnostic).

    Non-destructive: only overwrites empty fields, always adds enrichment data.
    """
    if not person_data:
        return {}

    # Detect source from email_status field patterns
    provider = _get_provider()
    if provider == "apollo":
        from modules.apollo_enrichment import map_apollo_to_prospect
        return map_apollo_to_prospect(person_data, existing_prospect)
    else:
        return _map_hunter_to_prospect(person_data, existing_prospect)


def batch_enrich(stage="researched", score_min=None, max_credits=None):
    """Enrich all matching prospects via best available provider.

    Routes to Apollo or Hunter batch enrichment based on configured keys.

    Args:
        stage: Pipeline stage to filter on.
        score_min: Minimum fit_score to process.
        max_credits: Maximum credits to use (None = unlimited).

    Returns:
        dict with enriched, emails_found, no_match, errors, skipped,
              credits_used, results
    """
    provider = _get_provider()
    if not provider:
        return {
            "enriched": 0, "emails_found": 0, "no_match": 0,
            "errors": 0, "skipped": 0, "credits_used": 0,
            "results": [], "provider": "none",
            "error": "No enrichment API key configured (APOLLO_API_KEY or HUNTER_API_KEY)",
        }

    if provider == "apollo":
        from modules.apollo_enrichment import batch_enrich as apollo_batch
        result = apollo_batch(stage=stage, score_min=score_min, max_credits=max_credits)
        result["provider"] = "apollo"
        return result
    else:
        result = _hunter_batch_enrich(stage=stage, score_min=score_min, max_credits=max_credits)
        result["provider"] = "hunter"
        return result


# ── Backward-compatible aliases ──────────────────────────────────────

# These aliases keep existing code working (orchestrator, email_finder, etc.)
map_hunter_to_prospect = map_to_prospect
map_apollo_to_prospect = map_to_prospect


# ── Hunter.io implementation (fallback) ─────────────────────────────

HUNTER_FINDER_URL = "https://api.hunter.io/v2/email-finder"
HUNTER_PEOPLE_URL = "https://api.hunter.io/v2/people/find"
HUNTER_DOMAIN_URL = "https://api.hunter.io/v2/domain-search"
MAX_RETRIES = 3


def _hunter_enrich(first_name, last_name, domain):
    """Hunter.io Email Finder + People Enrichment (fallback path)."""
    import requests

    api_key = os.environ.get("HUNTER_API_KEY", "")
    if not api_key:
        return {"status": "no_api_key", "person": None,
                "email": None, "email_verified": False}

    # Step 1: Find email
    params = {
        "api_key": api_key,
        "domain": domain,
        "first_name": first_name,
        "last_name": last_name,
    }

    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(HUNTER_FINDER_URL, params=params, timeout=15)
            if resp.status_code == 429:
                time.sleep(2 ** attempt)
                continue
            if resp.status_code != 200:
                return {"status": "error", "person": None,
                        "email": None, "email_verified": False,
                        "error": f"HTTP {resp.status_code}"}

            data = resp.json().get("data", {})
            email = data.get("email", "")
            if not email:
                return {"status": "no_match", "person": None,
                        "email": None, "email_verified": False}

            verification = data.get("verification", {})
            verified = verification.get("status") == "valid"

            person = {
                "email": email,
                "email_status": "verified" if verified else "unverified",
                "confidence": data.get("score", 0),
                "first_name": first_name,
                "last_name": last_name,
                "domain": domain,
                "title": data.get("position", ""),
                "linkedin_url": data.get("linkedin", ""),
            }

            # Step 2: People enrichment
            try:
                people_resp = requests.get(
                    HUNTER_PEOPLE_URL,
                    params={"api_key": api_key, "email": email},
                    timeout=15,
                )
                if people_resp.status_code == 200:
                    pdata = people_resp.json().get("data", {})
                    if pdata:
                        employment = pdata.get("employment") or {}
                        geo = pdata.get("geo") or {}
                        person.update({
                            "title": employment.get("title") or person.get("title", ""),
                            "seniority": employment.get("seniority", ""),
                            "linkedin_url": pdata.get("linkedin", "") or person.get("linkedin_url", ""),
                            "city": geo.get("city", ""),
                            "state": geo.get("state", ""),
                            "country": geo.get("country", ""),
                            "organization": {
                                "name": employment.get("name", ""),
                                "industry": employment.get("industry", ""),
                            },
                        })
            except Exception:
                pass

            return {
                "status": "matched",
                "person": person,
                "email": email,
                "email_verified": verified,
            }

        except Exception as e:
            if attempt == MAX_RETRIES - 1:
                return {"status": "error", "person": None,
                        "email": None, "email_verified": False,
                        "error": str(e)}
            time.sleep(1)

    return {"status": "error", "person": None,
            "email": None, "email_verified": False,
            "error": "Max retries exceeded"}


def _hunter_domain_search(domain):
    """Hunter.io Domain Search (fallback for domain-only leads)."""
    import requests

    api_key = os.environ.get("HUNTER_API_KEY", "")
    if not api_key:
        return {"status": "no_api_key", "contacts": [], "organization": None}

    params = {
        "api_key": api_key,
        "domain": domain,
        "limit": 10,
        "type": "personal",
    }

    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(HUNTER_DOMAIN_URL, params=params, timeout=15)
            if resp.status_code == 429:
                time.sleep(2 ** attempt)
                continue
            if resp.status_code != 200:
                return {"status": "error", "contacts": [], "organization": None}

            data = resp.json().get("data", {})
            org_name = data.get("organization", "")
            emails = data.get("emails", [])

            if not emails:
                return {"status": "no_results", "contacts": [],
                        "organization": {"name": org_name} if org_name else None}

            contacts = []
            for entry in emails:
                first = entry.get("first_name", "")
                last = entry.get("last_name", "")
                if not first or not last:
                    continue
                contacts.append({
                    "first_name": first,
                    "last_name": last,
                    "role": entry.get("position", ""),
                    "seniority": entry.get("seniority", ""),
                    "email": entry.get("value", ""),
                    "confidence": entry.get("confidence", 0),
                })

            seniority_rank = {"executive": 0, "senior": 1, "management": 2, "junior": 3}
            contacts.sort(key=lambda c: seniority_rank.get((c.get("seniority") or "").lower(), 99))

            return {
                "status": "found",
                "contacts": contacts,
                "organization": {"name": org_name} if org_name else None,
            }

        except Exception as e:
            if attempt == MAX_RETRIES - 1:
                return {"status": "error", "contacts": [], "organization": None}
            time.sleep(1)

    return {"status": "error", "contacts": [], "organization": None}


def _map_hunter_to_prospect(person_data, existing_prospect):
    """Map Hunter person data onto a prospect update dict."""
    if not person_data:
        return {}

    updates = {}

    email = person_data.get("email", "")
    if email:
        updates["email"] = email
        updates["email_source"] = "hunter"
        updates["email_verified"] = person_data.get("email_status") == "verified"

    title = person_data.get("title", "")
    if title and not existing_prospect.get("role"):
        updates["role"] = title

    linkedin = person_data.get("linkedin_url", "")
    if linkedin and not existing_prospect.get("linkedin_url"):
        updates["linkedin_url"] = linkedin

    org = person_data.get("organization") or {}
    org_name = org.get("name", "")
    if org_name and not existing_prospect.get("company"):
        updates["company"] = org_name

    intel = dict(existing_prospect.get("company_intel", {}))
    seniority = person_data.get("seniority", "")
    if seniority:
        intel["seniority"] = seniority

    city = person_data.get("city", "")
    state = person_data.get("state", "")
    country = person_data.get("country", "")
    location_parts = [p for p in [city, state, country] if p]
    if location_parts:
        intel["location"] = ", ".join(location_parts)

    if org.get("industry"):
        intel["industry"] = org["industry"]

    confidence = person_data.get("confidence", 0)
    if confidence:
        intel["email_confidence"] = confidence

    updates["company_intel"] = intel
    return updates


def _hunter_batch_enrich(stage="researched", score_min=None, max_credits=None):
    """Hunter.io batch enrichment (fallback path)."""
    import requests
    from modules.pipeline import list_prospects
    from modules.email_finder import _domain_from_url

    result_obj = list_prospects(stage=stage, score_min=score_min)
    prospects = result_obj.get("prospects", [])

    stats = {
        "enriched": 0, "emails_found": 0, "no_match": 0,
        "errors": 0, "skipped": 0, "credits_used": 0,
        "results": [],
    }

    for i, prospect in enumerate(prospects):
        if max_credits is not None and stats["credits_used"] >= max_credits:
            break

        if (prospect.get("email") and
                prospect.get("email_source") == "hunter" and
                prospect.get("email_verified")):
            stats["skipped"] += 1
            continue

        attempts = prospect.get("enrichment_attempts", 0)
        if attempts >= 2:
            stats["skipped"] += 1
            continue

        domain = _domain_from_url(prospect.get("company_url", ""))
        if not domain:
            stats["skipped"] += 1
            continue

        name = prospect.get("name", "")
        parts = name.strip().split()

        if len(parts) < 2:
            time.sleep(BATCH_DELAY)
            domain_result = _hunter_domain_search(domain)
            stats["credits_used"] += 1

            if domain_result["status"] == "found" and domain_result["contacts"]:
                best = domain_result["contacts"][0]
                parts = [best["first_name"], best["last_name"]]
                update_prospect(prospect["id"], {
                    "name": f"{best['first_name']} {best['last_name']}",
                })
                if best.get("email") and best.get("confidence", 0) >= 80:
                    update_prospect(prospect["id"], {
                        "email": best["email"],
                        "email_source": "hunter_domain",
                        "email_verified": best.get("confidence", 0) >= 90,
                    })
                    stats["enriched"] += 1
                    stats["emails_found"] += 1
                    continue
            else:
                update_prospect(prospect["id"], {"enrichment_attempts": attempts + 1})
                stats["skipped"] += 1
                continue

        if i > 0 and stats["credits_used"] > 0:
            time.sleep(BATCH_DELAY)

        result = _hunter_enrich(parts[0], parts[-1], domain)
        stats["credits_used"] += 1
        pid = prospect["id"]

        if result["status"] == "matched":
            updates = _map_hunter_to_prospect(result["person"], prospect)
            if updates:
                update_prospect(pid, updates)
                stats["enriched"] += 1
                if result.get("email"):
                    stats["emails_found"] += 1
                stats["results"].append({
                    "id": pid, "status": "enriched",
                    "email": result.get("email"),
                })
            else:
                update_prospect(pid, {"enrichment_attempts": attempts + 1})
                stats["no_match"] += 1
        elif result["status"] == "no_match":
            update_prospect(pid, {"enrichment_attempts": attempts + 1})
            stats["no_match"] += 1
        else:
            stats["errors"] += 1

    return stats
