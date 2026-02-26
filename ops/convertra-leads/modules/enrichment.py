"""Hunter.io Email Finder + People Enrichment API integration."""

import logging
import os
import time

import requests

from modules.pipeline import update_prospect

log = logging.getLogger("enrichment")

HUNTER_FINDER_URL = "https://api.hunter.io/v2/email-finder"
HUNTER_PEOPLE_URL = "https://api.hunter.io/v2/people/find"
HUNTER_COMPANY_URL = "https://api.hunter.io/v2/companies/find"
HUNTER_DOMAIN_URL = "https://api.hunter.io/v2/domain-search"
BATCH_DELAY = 0.5  # Seconds between calls (rate limit: 15/sec)
MAX_RETRIES = 3


def enrich_person(first_name, last_name, domain,
                  organization_name="", linkedin_url=""):
    """Find email + enrich person via Hunter.io.

    Step 1: Email Finder (name + domain → verified email)
    Step 2: People Enrichment (email → title, seniority, LinkedIn, location)

    Returns:
        dict with keys:
            status: "matched" | "no_match" | "error" | "no_api_key"
            person: dict with enrichment data or None
            email: str or None
            email_verified: bool
    """
    api_key = os.environ.get("HUNTER_API_KEY", "")
    if not api_key:
        return {"status": "no_api_key", "person": None,
                "email": None, "email_verified": False}

    # Step 1: Find email
    finder_result = _find_email(api_key, first_name, last_name, domain)
    if finder_result["status"] != "found":
        return {"status": finder_result["status"], "person": None,
                "email": None, "email_verified": False,
                "error": finder_result.get("error"),
                "detail": finder_result.get("detail")}

    email = finder_result["email"]
    confidence = finder_result.get("confidence", 0)
    verification = finder_result.get("verification", {})
    verified = verification.get("status") == "valid"

    # Build person dict from finder data
    person = {
        "email": email,
        "email_status": "verified" if verified else "unverified",
        "confidence": confidence,
        "first_name": first_name,
        "last_name": last_name,
        "domain": domain,
        # Finder sometimes returns these
        "title": finder_result.get("position", ""),
        "linkedin_url": finder_result.get("linkedin", ""),
        "twitter": finder_result.get("twitter", ""),
        "phone_number": finder_result.get("phone_number", ""),
    }

    # Step 2: People enrichment (if we got an email)
    if email:
        people_result = _enrich_person_by_email(api_key, email)
        if people_result:
            person.update({
                "title": people_result.get("title") or person.get("title", ""),
                "seniority": people_result.get("seniority", ""),
                "linkedin_url": people_result.get("linkedin", "") or person.get("linkedin_url", ""),
                "twitter": people_result.get("twitter", "") or person.get("twitter", ""),
                "city": people_result.get("city", ""),
                "state": people_result.get("state", ""),
                "country": people_result.get("country", ""),
            })
            # Employment data
            employment = people_result.get("employment") or {}
            if employment:
                person["organization"] = {
                    "name": employment.get("name", ""),
                    "industry": employment.get("industry", ""),
                }

    return {
        "status": "matched",
        "person": person,
        "email": email,
        "email_verified": verified,
    }


def _find_email(api_key, first_name, last_name, domain):
    """Call Hunter Email Finder API."""
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
                try:
                    err_body = resp.json()
                except Exception:
                    err_body = resp.text[:200]
                return {"status": "error", "error": f"HTTP {resp.status_code}",
                        "detail": err_body}

            data = resp.json().get("data", {})
            email = data.get("email", "")

            if not email:
                return {"status": "no_match"}

            return {
                "status": "found",
                "email": email,
                "confidence": data.get("score", 0),
                "verification": data.get("verification", {}),
                "position": data.get("position", ""),
                "linkedin": data.get("linkedin", ""),
                "twitter": data.get("twitter", ""),
                "phone_number": data.get("phone_number", ""),
            }

        except requests.RequestException as e:
            if attempt == MAX_RETRIES - 1:
                return {"status": "error", "error": str(e)}
            time.sleep(1)

    return {"status": "error", "error": "Max retries exceeded"}


def _enrich_person_by_email(api_key, email):
    """Call Hunter People Enrichment API. Returns enrichment dict or None."""
    params = {"api_key": api_key, "email": email}

    try:
        resp = requests.get(HUNTER_PEOPLE_URL, params=params, timeout=15)
        if resp.status_code != 200:
            return None

        data = resp.json().get("data", {})
        if not data:
            return None

        # Flatten nested structure
        result = {}
        employment = data.get("employment") or {}
        result["employment"] = employment
        result["title"] = employment.get("title", "")
        result["seniority"] = employment.get("seniority", "")

        # Location
        geo = data.get("geo") or {}
        result["city"] = geo.get("city", "")
        result["state"] = geo.get("state", "")
        result["country"] = geo.get("country", "")

        # Social
        result["linkedin"] = data.get("linkedin", "")
        result["twitter"] = data.get("twitter", "")

        return result

    except requests.RequestException:
        return None


# ── Hunter Domain Search ────────────────────────────────────────────


def search_domain_contacts(domain):
    """Search Hunter.io for people at a domain.

    Uses the Domain Search endpoint to find employees at a company
    when we don't have a contact name. Returns contacts sorted by
    seniority (executives first).

    Returns:
        dict with keys:
            status: "found" | "no_results" | "error" | "no_api_key"
            contacts: list of {first_name, last_name, role, seniority, email, confidence}
            organization: {"name": str} or None
    """
    api_key = os.environ.get("HUNTER_API_KEY", "")
    if not api_key:
        return {"status": "no_api_key", "contacts": [], "organization": None}

    params = {
        "api_key": api_key,
        "domain": domain,
        "limit": 10,
        "type": "personal",  # Skip generic addresses like info@
    }

    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(HUNTER_DOMAIN_URL, params=params, timeout=15)

            if resp.status_code == 429:
                time.sleep(2 ** attempt)
                continue

            if resp.status_code != 200:
                return {"status": "error", "contacts": [], "organization": None,
                        "error": f"HTTP {resp.status_code}"}

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
                    "department": entry.get("department", ""),
                })

            # Sort: prefer senior people
            seniority_rank = {"executive": 0, "senior": 1, "management": 2, "junior": 3}
            contacts.sort(key=lambda c: seniority_rank.get((c.get("seniority") or "").lower(), 99))

            return {
                "status": "found",
                "contacts": contacts,
                "organization": {"name": org_name} if org_name else None,
            }

        except requests.RequestException as e:
            if attempt == MAX_RETRIES - 1:
                return {"status": "error", "contacts": [], "organization": None, "error": str(e)}
            time.sleep(1)

    return {"status": "error", "contacts": [], "organization": None}


# ── Prospect mapping ────────────────────────────────────────────────


def map_hunter_to_prospect(person_data, existing_prospect):
    """Map Hunter person data onto a prospect update dict.

    Non-destructive: only overwrites empty fields, always adds enrichment data.
    Email is always overwritten since Hunter is authoritative.
    """
    if not person_data:
        return {}

    updates = {}

    # Email — always overwrite
    email = person_data.get("email", "")
    if email:
        updates["email"] = email
        updates["email_source"] = "hunter"
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

    # Enrichment data into company_intel (additive)
    intel = dict(existing_prospect.get("company_intel", {}))

    seniority = person_data.get("seniority", "")
    if seniority:
        intel["seniority"] = seniority

    # Location
    city = person_data.get("city", "")
    state = person_data.get("state", "")
    country = person_data.get("country", "")
    location_parts = [p for p in [city, state, country] if p]
    if location_parts:
        intel["location"] = ", ".join(location_parts)

    if org.get("industry"):
        intel["industry"] = org["industry"]

    # Twitter handle
    twitter = person_data.get("twitter", "")
    if twitter:
        intel["twitter"] = twitter

    # Confidence score
    confidence = person_data.get("confidence", 0)
    if confidence:
        intel["email_confidence"] = confidence

    updates["company_intel"] = intel

    return updates


# Keep backward-compatible alias
map_apollo_to_prospect = map_hunter_to_prospect


# ── Batch enrichment ────────────────────────────────────────────────


def batch_enrich(stage="researched", score_min=None, max_credits=None):
    """Enrich all matching prospects via Hunter.io.

    Calls Email Finder + People Enrichment per prospect.
    Uses Domain Search as fallback when prospect has no name.

    Args:
        stage: Pipeline stage to filter on.
        score_min: Minimum fit_score to process.
        max_credits: Maximum Hunter credits to use (None = unlimited).

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

    for i, prospect in enumerate(prospects):
        # Respect credit budget
        if max_credits is not None and stats["credits_used"] >= max_credits:
            log.info(f"  Hunter credit budget exhausted ({max_credits} credits used)")
            break

        # Skip if already enriched
        if (prospect.get("email") and
                prospect.get("email_source") == "hunter" and
                prospect.get("email_verified")):
            stats["skipped"] += 1
            continue

        # Skip if enrichment was already attempted and failed
        if prospect.get("enrichment_status") in ("no_match", "no_useful_data"):
            stats["skipped"] += 1
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

        name = prospect.get("name", "")
        parts = name.strip().split()

        # If no name, try Hunter Domain Search to find contacts
        if len(parts) < 2:
            time.sleep(BATCH_DELAY)
            domain_result = search_domain_contacts(domain)

            if domain_result["status"] == "found" and domain_result["contacts"]:
                best = domain_result["contacts"][0]
                parts = [best["first_name"], best["last_name"]]

                # Update prospect with discovered name and role
                name_updates = {
                    "name": f"{best['first_name']} {best['last_name']}",
                }
                if best.get("role") and not prospect.get("role"):
                    name_updates["role"] = best["role"]
                if domain_result.get("organization", {}) and not prospect.get("company"):
                    org_name = domain_result["organization"].get("name", "")
                    if org_name:
                        name_updates["company"] = org_name

                # If Domain Search returned a high-confidence email, use it directly
                if best.get("email") and best.get("confidence", 0) >= 80:
                    name_updates["email"] = best["email"]
                    name_updates["email_source"] = "hunter_domain"
                    name_updates["email_verified"] = best.get("confidence", 0) >= 90
                    update_prospect(prospect["id"], name_updates)
                    stats["enriched"] += 1
                    stats["emails_found"] += 1
                    stats["results"].append({
                        "id": prospect["id"],
                        "status": "enriched_via_domain",
                        "email": best["email"],
                        "confidence": best["confidence"],
                        "name": name_updates["name"],
                    })
                    continue  # Skip Email Finder — already have an email

                # Otherwise, save name and fall through to Email Finder
                update_prospect(prospect["id"], name_updates)
            else:
                # Mark as dead end so we don't retry
                update_prospect(prospect["id"], {"enrichment_status": "no_match"})
                stats["skipped"] += 1
                stats["results"].append({
                    "id": prospect["id"],
                    "status": "skipped",
                    "message": "No name, domain search returned no contacts",
                })
                continue

        # Rate limit between calls
        if i > 0 and stats["credits_used"] > 0:
            time.sleep(BATCH_DELAY)

        result = enrich_person(
            parts[0], parts[-1], domain,
            organization_name=prospect.get("company", ""),
            linkedin_url=prospect.get("linkedin_url", ""),
        )
        stats["credits_used"] += 1
        pid = prospect["id"]

        if result["status"] == "matched":
            updates = map_hunter_to_prospect(result["person"], prospect)
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
                # Hunter matched but no useful data — mark so we don't retry
                update_prospect(pid, {"enrichment_status": "no_useful_data"})
                stats["no_match"] += 1
                stats["results"].append({
                    "id": pid, "status": "no_useful_data",
                })

        elif result["status"] == "no_match":
            # Mark prospect so we don't waste credits retrying
            update_prospect(pid, {"enrichment_status": "no_match"})
            stats["no_match"] += 1
            stats["results"].append({"id": pid, "status": "no_match"})

        else:
            stats["errors"] += 1
            stats["results"].append({
                "id": pid, "status": "error",
                "error": result.get("error", "Unknown"),
            })

    return stats
