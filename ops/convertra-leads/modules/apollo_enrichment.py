"""Apollo.io People Enrichment — email finding + contact enrichment in one call.

Replaces Hunter.io as the primary enrichment source. Apollo's People Match API
takes name + domain (or LinkedIn URL) and returns:
- Verified email address
- Title, seniority, department
- Phone number
- Company details (size, industry, revenue)
- Social profiles

Free tier: 10,000 credits/month (vs Hunter's 25/month).
"""

import logging
import os
import time

import requests

from modules.pipeline import update_prospect

log = logging.getLogger("apollo")

APOLLO_MATCH_URL = "https://api.apollo.io/api/v1/people/match"
APOLLO_SEARCH_URL = "https://api.apollo.io/api/v1/mixed_people/search"
APOLLO_ORG_URL = "https://api.apollo.io/api/v1/organizations/enrich"
BATCH_DELAY = 0.3  # Apollo rate limit: ~50/min on free tier
MAX_RETRIES = 3


def _get_api_key():
    """Get Apollo API key from environment."""
    return os.environ.get("APOLLO_API_KEY", "")


def _headers(api_key):
    return {
        "Content-Type": "application/json",
        "X-Api-Key": api_key,
    }


# ── People Match (primary) ──────────────────────────────────────────


def enrich_person(first_name=None, last_name=None, domain=None,
                  email=None, linkedin_url=None, organization_name=None):
    """Find email + enrich a person via Apollo People Match.

    Apollo matches on any combination of:
    - first_name + last_name + domain (best match rate)
    - linkedin_url alone (great for LinkedIn-sourced leads)
    - email alone (for reverse enrichment)

    Returns:
        dict with keys:
            status: "matched" | "no_match" | "error" | "no_api_key"
            person: dict with enrichment data or None
            email: str or None
            email_verified: bool
    """
    api_key = _get_api_key()
    if not api_key:
        return {"status": "no_api_key", "person": None,
                "email": None, "email_verified": False}

    # Build request payload — send everything we have
    payload = {}
    if first_name:
        payload["first_name"] = first_name
    if last_name:
        payload["last_name"] = last_name
    if domain:
        payload["domain"] = domain
    if email:
        payload["email"] = email
    if linkedin_url:
        payload["linkedin_url"] = linkedin_url
    if organization_name:
        payload["organization_name"] = organization_name

    if not payload:
        return {"status": "error", "person": None,
                "email": None, "email_verified": False,
                "error": "No identifying info provided"}

    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.post(
                APOLLO_MATCH_URL,
                headers=_headers(api_key),
                json=payload,
                timeout=15,
            )

            if resp.status_code == 429:
                wait = 2 ** attempt
                log.warning(f"Apollo rate limited, waiting {wait}s...")
                time.sleep(wait)
                continue

            if resp.status_code == 401:
                return {"status": "error", "person": None,
                        "email": None, "email_verified": False,
                        "error": "Invalid Apollo API key"}

            if resp.status_code != 200:
                return {"status": "error", "person": None,
                        "email": None, "email_verified": False,
                        "error": f"HTTP {resp.status_code}: {resp.text[:200]}"}

            data = resp.json()
            person = data.get("person")

            if not person:
                return {"status": "no_match", "person": None,
                        "email": None, "email_verified": False}

            # Extract email
            person_email = person.get("email", "")
            email_status = person.get("email_status", "")

            # Apollo email_status: "verified", "guessed", "unavailable", etc.
            verified = email_status in ("verified", "valid")

            # Build normalized person dict
            org = person.get("organization") or {}
            employment = person.get("employment_history") or []

            result_person = {
                "email": person_email,
                "email_status": email_status,
                "first_name": person.get("first_name", first_name or ""),
                "last_name": person.get("last_name", last_name or ""),
                "title": person.get("title", ""),
                "seniority": person.get("seniority", ""),
                "department": person.get("departments", [""])[0] if person.get("departments") else "",
                "linkedin_url": person.get("linkedin_url", ""),
                "phone_number": _extract_phone(person),
                "city": person.get("city", ""),
                "state": person.get("state", ""),
                "country": person.get("country", ""),
                "organization": {
                    "name": org.get("name", ""),
                    "domain": org.get("primary_domain", domain or ""),
                    "industry": org.get("industry", ""),
                    "estimated_num_employees": org.get("estimated_num_employees", 0),
                    "annual_revenue": org.get("annual_revenue_printed", ""),
                    "short_description": org.get("short_description", ""),
                },
            }

            return {
                "status": "matched",
                "person": result_person,
                "email": person_email,
                "email_verified": verified,
            }

        except requests.RequestException as e:
            if attempt == MAX_RETRIES - 1:
                return {"status": "error", "person": None,
                        "email": None, "email_verified": False,
                        "error": str(e)}
            time.sleep(1)

    return {"status": "error", "person": None,
            "email": None, "email_verified": False,
            "error": "Max retries exceeded"}


# ── Organization Search (for domain-only leads) ─────────────────────


def search_domain_contacts(domain, limit=5):
    """Search Apollo for people at a domain.

    Used when we have a company URL but no contact name. Apollo's search
    finds decision-makers sorted by seniority.

    Returns:
        dict with keys:
            status: "found" | "no_results" | "error" | "no_api_key"
            contacts: list of contact dicts
            organization: dict or None
    """
    api_key = _get_api_key()
    if not api_key:
        return {"status": "no_api_key", "contacts": [], "organization": None}

    # First, enrich the organization
    org_data = None
    try:
        org_resp = requests.post(
            APOLLO_ORG_URL,
            headers=_headers(api_key),
            json={"domain": domain},
            timeout=15,
        )
        if org_resp.status_code == 200:
            org_body = org_resp.json()
            org_data = org_body.get("organization")
    except requests.RequestException:
        pass

    # Then search for people at the domain
    payload = {
        "q_organization_domains": domain,
        "page": 1,
        "per_page": limit,
        "person_seniorities": ["owner", "founder", "c_suite", "partner",
                                "vp", "head", "director"],
    }

    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.post(
                APOLLO_SEARCH_URL,
                headers=_headers(api_key),
                json=payload,
                timeout=15,
            )

            if resp.status_code == 429:
                time.sleep(2 ** attempt)
                continue

            if resp.status_code != 200:
                return {"status": "error", "contacts": [],
                        "organization": None,
                        "error": f"HTTP {resp.status_code}"}

            data = resp.json()
            people = data.get("people", [])

            if not people:
                return {"status": "no_results", "contacts": [],
                        "organization": _format_org(org_data)}

            contacts = []
            for p in people:
                first = p.get("first_name", "")
                last = p.get("last_name", "")
                if not first or not last:
                    continue
                contacts.append({
                    "first_name": first,
                    "last_name": last,
                    "role": p.get("title", ""),
                    "seniority": p.get("seniority", ""),
                    "email": p.get("email", ""),
                    "email_status": p.get("email_status", ""),
                    "confidence": 90 if p.get("email_status") == "verified" else 50,
                    "department": (p.get("departments") or [""])[0],
                    "linkedin_url": p.get("linkedin_url", ""),
                    "phone": _extract_phone(p),
                })

            return {
                "status": "found",
                "contacts": contacts,
                "organization": _format_org(org_data),
            }

        except requests.RequestException as e:
            if attempt == MAX_RETRIES - 1:
                return {"status": "error", "contacts": [],
                        "organization": None, "error": str(e)}
            time.sleep(1)

    return {"status": "error", "contacts": [], "organization": None}


# ── Prospect mapping ────────────────────────────────────────────────


def map_apollo_to_prospect(person_data, existing_prospect):
    """Map Apollo person data onto a prospect update dict.

    Non-destructive: only overwrites empty fields, always adds enrichment data.
    Email is always overwritten since Apollo is authoritative for email.
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
            person_data.get("email_status") in ("verified", "valid")
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

    department = person_data.get("department", "")
    if department:
        intel["department"] = department

    # Location
    city = person_data.get("city", "")
    state = person_data.get("state", "")
    country = person_data.get("country", "")
    location_parts = [p for p in [city, state, country] if p]
    if location_parts:
        intel["location"] = ", ".join(location_parts)

    if org.get("industry"):
        intel["industry"] = org["industry"]
    if org.get("estimated_num_employees"):
        intel["employee_count"] = org["estimated_num_employees"]
    if org.get("annual_revenue"):
        intel["annual_revenue"] = org["annual_revenue"]
    if org.get("short_description"):
        intel["description"] = org["short_description"][:200]

    # Phone number
    phone = person_data.get("phone_number", "")
    if phone:
        intel["phone"] = phone

    updates["company_intel"] = intel

    return updates


# ── Batch enrichment ────────────────────────────────────────────────


def batch_enrich(stage="researched", score_min=None, max_credits=None):
    """Enrich all matching prospects via Apollo.

    Single API call per prospect returns email + full profile.
    Uses People Match for named leads, Domain Search for anonymous ones.

    Args:
        stage: Pipeline stage to filter on.
        score_min: Minimum fit_score to process.
        max_credits: Maximum Apollo credits to use (None = unlimited).

    Returns:
        dict with enriched, emails_found, no_match, errors, skipped,
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
            log.info(f"  Apollo credit budget exhausted ({max_credits} credits used)")
            break

        # Skip if already enriched via Apollo
        if (prospect.get("email") and
                prospect.get("email_source") == "apollo" and
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
        linkedin_url = prospect.get("linkedin_url", "")

        # If no name but we have LinkedIn URL, Apollo can match on that
        if len(parts) < 2 and not linkedin_url:
            # Try domain search to find contacts
            time.sleep(BATCH_DELAY)
            domain_result = search_domain_contacts(domain)
            stats["credits_used"] += 1

            if domain_result["status"] == "found" and domain_result["contacts"]:
                best = domain_result["contacts"][0]
                parts = [best["first_name"], best["last_name"]]

                name_updates = {
                    "name": f"{best['first_name']} {best['last_name']}",
                }
                if best.get("role") and not prospect.get("role"):
                    name_updates["role"] = best["role"]
                if domain_result.get("organization", {}) and not prospect.get("company"):
                    org_name = domain_result["organization"].get("name", "")
                    if org_name:
                        name_updates["company"] = org_name

                # If domain search returned a verified email, use it directly
                if best.get("email") and best.get("email_status") in ("verified", "valid"):
                    name_updates["email"] = best["email"]
                    name_updates["email_source"] = "apollo_search"
                    name_updates["email_verified"] = True
                    if best.get("linkedin_url"):
                        name_updates["linkedin_url"] = best["linkedin_url"]
                    if best.get("phone"):
                        intel = dict(prospect.get("company_intel", {}))
                        intel["phone"] = best["phone"]
                        name_updates["company_intel"] = intel
                    update_prospect(prospect["id"], name_updates)
                    stats["enriched"] += 1
                    stats["emails_found"] += 1
                    stats["results"].append({
                        "id": prospect["id"],
                        "status": "enriched_via_search",
                        "email": best["email"],
                        "name": name_updates["name"],
                    })
                    continue

                # Save discovered name, fall through to People Match
                update_prospect(prospect["id"], name_updates)
            else:
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

        # People Match — uses name+domain or LinkedIn URL
        result = enrich_person(
            first_name=parts[0] if parts else None,
            last_name=parts[-1] if len(parts) >= 2 else None,
            domain=domain,
            linkedin_url=linkedin_url or None,
            organization_name=prospect.get("company", "") or None,
        )
        stats["credits_used"] += 1
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
                update_prospect(pid, {"enrichment_status": "no_useful_data"})
                stats["no_match"] += 1
                stats["results"].append({
                    "id": pid, "status": "no_useful_data",
                })

        elif result["status"] == "no_match":
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


# ── Helpers ──────────────────────────────────────────────────────────


def _extract_phone(person):
    """Extract best phone number from Apollo person data."""
    phones = person.get("phone_numbers") or []
    if phones:
        # Prefer mobile, then direct, then anything
        for phone_type in ["mobile", "direct", "work"]:
            for p in phones:
                if p.get("type") == phone_type:
                    return p.get("sanitized_number", p.get("raw_number", ""))
        return phones[0].get("sanitized_number", phones[0].get("raw_number", ""))
    return ""


def _format_org(org_data):
    """Format Apollo org data into a simple dict."""
    if not org_data:
        return None
    return {
        "name": org_data.get("name", ""),
        "domain": org_data.get("primary_domain", ""),
        "industry": org_data.get("industry", ""),
        "employee_count": org_data.get("estimated_num_employees", 0),
    }
