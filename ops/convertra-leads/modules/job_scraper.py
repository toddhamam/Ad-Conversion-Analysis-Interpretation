"""Job listing scraper — find companies hiring media buyers via DuckDuckGo."""

import re
from urllib.parse import urlparse

from modules.pipeline import load_pipeline, add_prospect


# Default search keywords targeting companies that need ad velocity
DEFAULT_JOB_KEYWORDS = [
    '"media buyer" hiring',
    '"paid social manager" hiring',
    '"performance marketing manager" hiring',
    '"creative strategist" hiring',
    '"growth marketing manager" hiring paid',
    '"paid media" manager hiring',
]

# Job board domains — we extract the company name from these listings
JOB_BOARD_DOMAINS = {
    "indeed.com", "au.indeed.com", "uk.indeed.com",
    "seek.com.au", "seek.co.nz",
    "linkedin.com", "glassdoor.com", "glassdoor.com.au",
    "ziprecruiter.com", "monster.com",
    "jora.com", "adzuna.com", "adzuna.com.au",
    "careers.google.com", "jobs.lever.co", "boards.greenhouse.io",
}

# Domains to always skip (not companies, not job boards)
SKIP_DOMAINS = {
    "facebook.com", "instagram.com", "twitter.com", "x.com",
    "youtube.com", "tiktok.com", "reddit.com", "pinterest.com",
    "amazon.com", "ebay.com", "walmart.com",
    "google.com", "bing.com", "yahoo.com",
    "wikipedia.org", "medium.com", "substack.com",
}

# Pattern to extract company name from job listing titles
# Common formats: "Media Buyer - Company Name", "Company Name | Media Buyer",
#                 "Media Buyer at Company Name", "Company Name is hiring"
TITLE_SEPARATORS = re.compile(r"\s+[-|]\s+|\s+at\s+|\s+@\s+", re.IGNORECASE)


def search_job_listings(keywords=None, limit=30):
    """Search DuckDuckGo for job listings mentioning media buyer roles.

    Args:
        keywords: list of str search terms. Defaults to DEFAULT_JOB_KEYWORDS.
        limit: max results to return.

    Returns:
        dict with keys:
            results: list of dict with company, url, domain, job_title, source, description
            total: int
            keywords_used: list of str
    """
    if keywords is None:
        keywords = DEFAULT_JOB_KEYWORDS

    all_results = []
    seen_domains = set()
    existing_domains = _get_pipeline_domains()

    for keyword in keywords:
        # Search job boards specifically
        for site in ["indeed.com", "seek.com.au", "linkedin.com/jobs"]:
            query = f"{keyword} site:{site}"
            hits = _ddg_search(query, max_results=max(15, limit // (len(keywords) * 2) + 3))
            _process_hits(hits, all_results, seen_domains, existing_domains, keyword)

        # Also search the open web for career pages
        hits = _ddg_search(f"{keyword} careers", max_results=max(15, limit // len(keywords) + 3))
        _process_hits(hits, all_results, seen_domains, existing_domains, keyword)

        if len(all_results) >= limit:
            break

    return {
        "results": all_results[:limit],
        "total": len(all_results[:limit]),
        "keywords_used": keywords,
    }


def batch_add_job_prospects(results, campaign=None):
    """Add discovered job listing prospects to the pipeline.

    Deduplicates against existing pipeline by company domain.

    Args:
        results: list of dicts from search_job_listings()
        campaign: optional campaign name tag

    Returns:
        dict with keys: added (int), skipped_duplicate (int), results (list)
    """
    existing_domains = _get_pipeline_domains()

    added = 0
    skipped = 0
    add_results = []

    for result in results:
        domain = result.get("domain", "")

        if domain in existing_domains:
            skipped += 1
            continue

        prospect_data = {
            "company": result.get("company", "Unknown"),
            "company_url": f"https://{domain}" if domain else "",
            "source": "job_listing",
            "stage": "discovered",
            "pain_signals": ["actively hiring media buyers"],
            "company_intel": {
                "hiring_signals": [result.get("job_title", "media buyer")],
            },
            "campaign": campaign or "",
            "tags": ["job_listing"],
            "notes": f"Found via job listing: {result.get('description', '')[:150]}",
        }

        add_result = add_prospect(prospect_data)
        existing_domains.add(domain)
        added += 1
        add_results.append({"company": result.get("company"), "domain": domain, "id": add_result.get("id")})

    return {"added": added, "skipped_duplicate": skipped, "results": add_results}


def _process_hits(hits, all_results, seen_domains, existing_domains, keyword):
    """Process DuckDuckGo search hits into structured results."""
    for hit in hits:
        url = hit.get("href", "")
        title = hit.get("title", "")
        body = hit.get("body", "")

        domain = _extract_company_domain(url)
        if not domain or domain in seen_domains or domain in existing_domains or domain in SKIP_DOMAINS:
            continue

        company = _extract_company_from_job(title, url, body)
        if not company or len(company) < 2:
            continue

        job_title = _extract_job_title(title)

        seen_domains.add(domain)
        all_results.append({
            "company": company,
            "url": url,
            "domain": domain,
            "job_title": job_title,
            "source": "job_listing",
            "description": body[:200] if body else "",
            "source_query": keyword,
        })


def _extract_company_from_job(title, url, body):
    """Extract the hiring company name from a job listing result.

    Heuristic order:
    1. If URL is a company career page (not a job board), use the domain
    2. Parse title separators (" - ", " | ", " at ")
    3. Fall back to domain name

    Returns:
        str: best-guess company name, or empty string
    """
    parsed = urlparse(url)
    host = parsed.netloc.lower().replace("www.", "")

    # If it's a company career page (not a job board), the domain IS the company
    is_job_board = any(jb in host for jb in JOB_BOARD_DOMAINS)

    if not is_job_board and host:
        # It's a direct career page — use the domain as company name
        return _domain_to_company_name(host)

    # Parse the title for company name
    parts = TITLE_SEPARATORS.split(title)
    if len(parts) >= 2:
        # Job boards typically put: "Job Title - Company Name" or "Company Name | Job Title"
        # Try the last part first (more likely to be company on Indeed-style)
        candidate = parts[-1].strip()

        # If it's a job board name, try the second-to-last
        if _is_job_board_name(candidate):
            if len(parts) >= 3:
                candidate = parts[-2].strip()
            else:
                candidate = ""

        if candidate and not _is_generic_role(candidate):
            return candidate

        # Try first part
        candidate = parts[0].strip()
        if candidate and not _is_generic_role(candidate):
            return candidate

    # Fall back: check body for "at <Company>" pattern
    at_match = re.search(r'\bat\s+([A-Z][A-Za-z0-9\s&.]+?)(?:\s*[-|,.]|\s+is\s|\s+in\s)', body or "")
    if at_match:
        return at_match.group(1).strip()

    return ""


def _extract_job_title(title):
    """Extract the job title portion from a listing title."""
    parts = TITLE_SEPARATORS.split(title)
    if parts:
        candidate = parts[0].strip()
        # If it looks like a role, return it
        role_keywords = ["buyer", "manager", "strategist", "director", "marketing", "growth", "paid"]
        if any(kw in candidate.lower() for kw in role_keywords):
            return candidate
    return title.split(" - ")[0].strip() if " - " in title else title[:80]


def _extract_company_domain(url):
    """Extract the company domain from the URL.

    For job board URLs, returns empty (we get company from title).
    For direct career pages, returns the domain.
    """
    try:
        parsed = urlparse(url)
        host = parsed.netloc.lower().replace("www.", "")

        # For job boards, we can't derive the company from the URL
        if any(jb in host for jb in JOB_BOARD_DOMAINS):
            # Try to extract company domain from URL path (some job boards embed it)
            path = parsed.path.lower()
            # Indeed format: /cmp/company-name or /company/company-name
            cmp_match = re.search(r'/(?:cmp|company)/([^/]+)', path)
            if cmp_match:
                return cmp_match.group(1).replace("-", "")
            return ""

        return host
    except Exception:
        return ""


def _domain_to_company_name(domain):
    """Convert a domain to a readable company name."""
    # Strip TLD
    name = domain.split(".")[0]
    # Capitalize
    return name.capitalize()


def _is_job_board_name(text):
    """Check if text is just a job board name."""
    board_names = {
        "indeed", "seek", "linkedin", "glassdoor", "ziprecruiter",
        "monster", "jora", "adzuna", "lever", "greenhouse",
    }
    return text.lower().strip() in board_names


def _is_generic_role(text):
    """Check if text is a job role rather than a company name."""
    role_indicators = [
        "media buyer", "performance marketing", "paid social",
        "growth marketing", "creative strategist", "paid media",
        "marketing manager", "apply now", "full time", "part time",
    ]
    lower = text.lower()
    return any(ind in lower for ind in role_indicators)


def _get_pipeline_domains():
    """Get set of company domains already in pipeline."""
    try:
        data = load_pipeline()
        domains = set()
        for p in data.get("prospects", []):
            url = p.get("company_url", "")
            if url:
                try:
                    parsed = urlparse(url)
                    domain = parsed.netloc.lower().replace("www.", "")
                    if domain:
                        domains.add(domain)
                except Exception:
                    pass
        return domains
    except Exception:
        return set()


_used_queries = set()


def _ddg_search(query, max_results=10):
    """Run a DuckDuckGo search. Skips duplicate queries within a session."""
    if query in _used_queries:
        return []
    _used_queries.add(query)
    try:
        from ddgs import DDGS
        with DDGS() as ddgs:
            return list(ddgs.text(query, max_results=max_results))
    except ImportError:
        return []
    except Exception:
        return []
