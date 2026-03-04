"""LinkedIn lead discovery via DuckDuckGo x-ray search.

Finds decision makers (agency owners, CMOs, media buyers) and their companies
by searching LinkedIn profiles and company pages through DuckDuckGo.

No LinkedIn API required — uses Google-style x-ray search queries.
"""

import re
from urllib.parse import urlparse

from modules.pipeline import load_pipeline, add_prospect


# ── Persona definitions ──────────────────────────────────────────────

PERSONAS = {
    "agency_owners": {
        "label": "Agency Owners & Founders",
        "description": "Founders/CEOs of digital marketing and media buying agencies",
        "people_queries": [
            'site:linkedin.com/in/ "founder" "digital marketing agency" -jobs -articles',
            'site:linkedin.com/in/ "CEO" "performance marketing agency" -jobs -articles',
            'site:linkedin.com/in/ "owner" "media buying agency" -jobs -articles',
            'site:linkedin.com/in/ "founder" "paid media agency" -jobs -articles',
            'site:linkedin.com/in/ "managing director" "advertising agency" digital -jobs',
            'site:linkedin.com/in/ "co-founder" "growth agency" OR "creative agency" -jobs',
        ],
        "company_queries": [
            'site:linkedin.com/company/ "digital marketing agency" -jobs',
            'site:linkedin.com/company/ "performance marketing" agency -jobs',
            'site:linkedin.com/company/ "media buying" agency -jobs',
            'site:linkedin.com/company/ "paid social" agency -jobs',
            'site:linkedin.com/company/ "growth marketing agency" -jobs',
        ],
        "company_type": "agency",
        "tags": ["agency", "linkedin"],
    },
    "enterprise_marketing": {
        "label": "Enterprise Marketing Leaders",
        "description": "CMOs, VPs, and Heads of Growth at DTC/ecommerce brands",
        "people_queries": [
            'site:linkedin.com/in/ "CMO" OR "Chief Marketing Officer" ecommerce OR DTC -jobs',
            'site:linkedin.com/in/ "VP Marketing" OR "VP of Marketing" ecommerce -jobs',
            'site:linkedin.com/in/ "Head of Growth" ecommerce OR DTC OR "direct to consumer" -jobs',
            'site:linkedin.com/in/ "Director of Marketing" DTC OR Shopify -jobs',
            'site:linkedin.com/in/ "Head of Paid" OR "Head of Performance" -jobs -articles',
            'site:linkedin.com/in/ "VP Growth" DTC OR ecommerce OR Shopify -jobs',
        ],
        "company_queries": [
            'site:linkedin.com/company/ DTC brand ecommerce -jobs -articles',
            'site:linkedin.com/company/ "direct to consumer" brand -jobs',
        ],
        "company_type": "dtc_brand",
        "tags": ["enterprise", "linkedin"],
    },
    "media_buyers": {
        "label": "Senior Media Buyers",
        "description": "Senior media buyers and paid social managers at scaling brands",
        "people_queries": [
            'site:linkedin.com/in/ "Senior Media Buyer" -jobs -articles',
            'site:linkedin.com/in/ "Paid Social Manager" OR "Paid Social Lead" -jobs',
            'site:linkedin.com/in/ "Performance Marketing Manager" ecommerce OR DTC -jobs',
            'site:linkedin.com/in/ "Growth Marketing Manager" Meta OR Facebook ads -jobs',
            'site:linkedin.com/in/ "Creative Strategist" Meta OR Facebook OR ads -jobs',
        ],
        "company_queries": [],
        "company_type": "dtc_brand",
        "tags": ["media_buyer", "linkedin"],
    },
    "saas_founders": {
        "label": "SaaS Founders Running Ads",
        "description": "B2B SaaS founders/CEOs actively running Meta or Google ads",
        "people_queries": [
            'site:linkedin.com/in/ "founder" "SaaS" "Meta ads" OR "Facebook ads" -jobs',
            'site:linkedin.com/in/ "CEO" "SaaS" growth marketing -jobs -articles',
            'site:linkedin.com/in/ "co-founder" B2B SaaS "paid acquisition" -jobs',
            'site:linkedin.com/in/ "founder" SaaS "growth" OR "marketing" -jobs -articles',
        ],
        "company_queries": [
            'site:linkedin.com/company/ SaaS "growth marketing" OR "paid ads" -jobs',
        ],
        "company_type": "saas",
        "tags": ["saas", "linkedin"],
    },
}

DEFAULT_PERSONA = "agency_owners"


# ── People search ────────────────────────────────────────────────────


def search_linkedin_people(persona=None, limit=30):
    """Search LinkedIn profiles via DDG x-ray for a given persona.

    Args:
        persona: key from PERSONAS dict. Defaults to agency_owners.
        limit: max results.

    Returns:
        dict with results (list of person dicts), total, persona.
    """
    persona = persona or DEFAULT_PERSONA
    config = PERSONAS.get(persona)
    if not config:
        return {"results": [], "total": 0, "error": f"Unknown persona: {persona}",
                "available_personas": list(PERSONAS.keys())}

    queries = config["people_queries"]
    all_results = []
    seen_urls = set()
    existing_domains = _get_pipeline_domains()

    for query in queries:
        hits = _ddg_search(query, max_results=limit // len(queries) + 5)
        for hit in hits:
            url = hit.get("href", "")
            if "linkedin.com/in/" not in url:
                continue
            if url in seen_urls:
                continue
            seen_urls.add(url)

            parsed = _parse_linkedin_person(hit)
            if not parsed or not parsed.get("name"):
                continue

            # Check if their company domain is already in pipeline
            if parsed.get("company_domain") and parsed["company_domain"] in existing_domains:
                continue

            parsed["source_persona"] = persona
            all_results.append(parsed)

        if len(all_results) >= limit:
            break

    return {
        "results": all_results[:limit],
        "total": len(all_results[:limit]),
        "persona": persona,
        "persona_label": config["label"],
    }


# ── Company search ───────────────────────────────────────────────────


def search_linkedin_companies(persona=None, limit=30):
    """Search LinkedIn company pages via DDG x-ray for a given persona.

    Args:
        persona: key from PERSONAS dict. Defaults to agency_owners.
        limit: max results.

    Returns:
        dict with results (list of company dicts), total, persona.
    """
    persona = persona or DEFAULT_PERSONA
    config = PERSONAS.get(persona)
    if not config:
        return {"results": [], "total": 0, "error": f"Unknown persona: {persona}",
                "available_personas": list(PERSONAS.keys())}

    queries = config.get("company_queries", [])
    if not queries:
        return {"results": [], "total": 0, "message": f"No company queries for persona: {persona}"}

    all_results = []
    seen_urls = set()
    existing_domains = _get_pipeline_domains()

    for query in queries:
        hits = _ddg_search(query, max_results=limit // len(queries) + 5)
        for hit in hits:
            url = hit.get("href", "")
            if "linkedin.com/company/" not in url:
                continue
            if url in seen_urls:
                continue
            seen_urls.add(url)

            parsed = _parse_linkedin_company(hit)
            if not parsed or not parsed.get("company"):
                continue

            if parsed.get("company_domain") and parsed["company_domain"] in existing_domains:
                continue

            parsed["source_persona"] = persona
            all_results.append(parsed)

        if len(all_results) >= limit:
            break

    return {
        "results": all_results[:limit],
        "total": len(all_results[:limit]),
        "persona": persona,
        "persona_label": config["label"],
    }


# ── Batch add to pipeline ───────────────────────────────────────────


def batch_add_linkedin_people(results, campaign=None, persona=None):
    """Add LinkedIn people discoveries to the pipeline.

    Each person becomes a prospect with their name, LinkedIn URL,
    company, and role pre-populated.

    Args:
        results: list of dicts from search_linkedin_people()
        campaign: optional campaign name
        persona: persona key for tagging

    Returns:
        dict with added count, skipped count, results
    """
    config = PERSONAS.get(persona or DEFAULT_PERSONA, PERSONAS[DEFAULT_PERSONA])
    existing_domains = _get_pipeline_domains()

    added = 0
    skipped = 0
    add_results = []

    for person in results:
        company_domain = person.get("company_domain", "")
        if company_domain and company_domain in existing_domains:
            skipped += 1
            continue

        prospect_data = {
            "name": person.get("name", ""),
            "company": person.get("company", ""),
            "role": person.get("role", ""),
            "company_url": f"https://{company_domain}" if company_domain else "",
            "linkedin_url": person.get("linkedin_url", ""),
            "source": "linkedin_xray",
            "stage": "discovered",
            "company_type": config.get("company_type", ""),
            "campaign": campaign or "",
            "tags": config.get("tags", ["linkedin"]),
            "personalization_hooks": [],
            "pain_signals": [],
            "company_intel": {
                "linkedin_description": person.get("description", "")[:200],
            },
            "notes": f"LinkedIn x-ray: {person.get('description', '')[:150]}",
        }

        result = add_prospect(prospect_data)
        if company_domain:
            existing_domains.add(company_domain)
        added += 1
        add_results.append({
            "name": person.get("name"),
            "company": person.get("company"),
            "id": result.get("id"),
        })

    return {"added": added, "skipped_duplicate": skipped, "results": add_results}


def batch_add_linkedin_companies(results, campaign=None, persona=None):
    """Add LinkedIn company discoveries to the pipeline.

    Each company becomes a prospect (no contact name yet — enrichment
    will find the right person via Hunter Domain Search).

    Args:
        results: list of dicts from search_linkedin_companies()
        campaign: optional campaign name
        persona: persona key for tagging

    Returns:
        dict with added count, skipped count, results
    """
    config = PERSONAS.get(persona or DEFAULT_PERSONA, PERSONAS[DEFAULT_PERSONA])
    existing_domains = _get_pipeline_domains()

    added = 0
    skipped = 0
    add_results = []

    for company in results:
        company_domain = company.get("company_domain", "")
        if company_domain and company_domain in existing_domains:
            skipped += 1
            continue

        prospect_data = {
            "company": company.get("company", ""),
            "company_url": f"https://{company_domain}" if company_domain else "",
            "linkedin_url": company.get("linkedin_url", ""),
            "source": "linkedin_company_xray",
            "stage": "discovered",
            "company_type": config.get("company_type", ""),
            "campaign": campaign or "",
            "tags": config.get("tags", ["linkedin"]),
            "company_intel": {
                "linkedin_description": company.get("description", "")[:200],
                "linkedin_tagline": company.get("tagline", ""),
            },
            "notes": f"LinkedIn company: {company.get('description', '')[:150]}",
        }

        result = add_prospect(prospect_data)
        if company_domain:
            existing_domains.add(company_domain)
        added += 1
        add_results.append({
            "company": company.get("company"),
            "domain": company_domain,
            "id": result.get("id"),
        })

    return {"added": added, "skipped_duplicate": skipped, "results": add_results}


# ── Parsing helpers ──────────────────────────────────────────────────


def _parse_linkedin_person(hit):
    """Parse a DDG result for a LinkedIn profile into structured data.

    DDG titles for LinkedIn profiles typically look like:
    - "Jane Smith - CEO - Agency Name | LinkedIn"
    - "Jane Smith | LinkedIn"
    - "Jane Smith - Founder & CEO - Acme Agency"

    DDG body text contains the profile summary.
    """
    title = hit.get("title", "")
    url = hit.get("href", "")
    body = hit.get("body", "")

    # Clean LinkedIn suffix
    title = re.sub(r'\s*\|\s*LinkedIn\s*$', '', title, flags=re.IGNORECASE)
    title = re.sub(r'\s*-\s*LinkedIn\s*$', '', title, flags=re.IGNORECASE)

    # Split on " - " to extract name, role, company
    parts = [p.strip() for p in title.split(" - ") if p.strip()]

    name = parts[0] if parts else ""
    role = parts[1] if len(parts) >= 3 else (parts[1] if len(parts) == 2 else "")
    company = parts[2] if len(parts) >= 3 else ""

    # If role looks like a company name (no role keywords), swap
    role_keywords = [
        "founder", "ceo", "cmo", "cto", "owner", "director", "manager",
        "head of", "vp", "vice president", "chief", "senior", "lead",
        "strategist", "buyer", "specialist", "coordinator", "partner",
        "managing", "principal", "co-founder",
    ]
    if role and not any(kw in role.lower() for kw in role_keywords):
        # role is probably the company
        if not company:
            company = role
            role = ""

    # Try to extract company domain from body text
    company_domain = _extract_domain_from_text(body)
    if not company_domain and company:
        # Try searching for company domain
        company_domain = _guess_domain_from_company(company)

    # Clean up name (remove credentials like MBA, PhD)
    name = re.sub(r',?\s*(?:MBA|PhD|CPA|PMP|SHRM|CFA|CFP|CCIM|LCSW)\s*$', '', name, flags=re.IGNORECASE)
    name = name.strip()

    if not name or len(name) < 3:
        return None

    return {
        "name": name,
        "role": role,
        "company": company,
        "linkedin_url": _clean_linkedin_url(url),
        "company_domain": company_domain,
        "description": body[:300] if body else "",
    }


def _parse_linkedin_company(hit):
    """Parse a DDG result for a LinkedIn company page."""
    title = hit.get("title", "")
    url = hit.get("href", "")
    body = hit.get("body", "")

    # Clean LinkedIn suffix
    title = re.sub(r'\s*\|\s*LinkedIn\s*$', '', title, flags=re.IGNORECASE)
    title = re.sub(r'\s*-\s*LinkedIn\s*$', '', title, flags=re.IGNORECASE)

    # Company name is usually the first part
    parts = [p.strip() for p in title.split(" - ") if p.strip()]
    company = parts[0] if parts else ""
    tagline = parts[1] if len(parts) >= 2 else ""

    # Try to extract domain from body
    company_domain = _extract_domain_from_text(body)
    if not company_domain and company:
        company_domain = _guess_domain_from_company(company)

    if not company or len(company) < 2:
        return None

    return {
        "company": company,
        "tagline": tagline,
        "linkedin_url": _clean_linkedin_url(url),
        "company_domain": company_domain,
        "description": body[:300] if body else "",
    }


def _clean_linkedin_url(url):
    """Clean a LinkedIn URL to canonical form."""
    # Remove query params and trailing slashes
    parsed = urlparse(url)
    path = parsed.path.rstrip("/")
    return f"https://www.linkedin.com{path}"


def _extract_domain_from_text(text):
    """Try to extract a company domain from text content."""
    if not text:
        return ""

    # Look for URLs in the text
    url_pattern = re.compile(r'https?://(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})')
    matches = url_pattern.findall(text)

    for domain in matches:
        # Skip social media and common non-company domains
        if any(skip in domain for skip in [
            "linkedin.com", "facebook.com", "twitter.com", "instagram.com",
            "youtube.com", "google.com", "github.com", "medium.com",
        ]):
            continue
        return domain.lower()

    return ""


def _guess_domain_from_company(company):
    """Guess a company's domain from its name.

    Very basic — just for dedup. Real domain comes from research step.
    """
    if not company:
        return ""

    # Clean common suffixes
    name = company.lower()
    for suffix in [" inc", " inc.", " llc", " ltd", " pty", " co", " co.",
                   " group", " digital", " agency", " media", " marketing",
                   " consulting", " solutions"]:
        name = name.replace(suffix, "")

    # Remove special chars and spaces
    name = re.sub(r'[^a-z0-9]', '', name)
    if not name or len(name) < 2:
        return ""

    return f"{name}.com"


# ── Shared helpers ───────────────────────────────────────────────────


def _ddg_search(query, max_results=10):
    """Run a DuckDuckGo search."""
    try:
        from ddgs import DDGS
        with DDGS() as ddgs:
            return list(ddgs.text(query, max_results=max_results))
    except ImportError:
        return [{"title": "ERROR", "href": "", "body": "ddgs package not installed"}]
    except Exception as e:
        return [{"title": "ERROR", "href": "", "body": f"Search failed: {e}"}]


def _get_pipeline_domains():
    """Get set of domains already in pipeline."""
    try:
        data = load_pipeline()
        domains = set()
        for p in data["prospects"]:
            url = p.get("company_url", "")
            if url:
                try:
                    parsed = urlparse(url)
                    domain = parsed.netloc.lower()
                    if domain.startswith("www."):
                        domain = domain[4:]
                    if domain:
                        domains.add(domain)
                except Exception:
                    pass
        return domains
    except Exception:
        return set()
