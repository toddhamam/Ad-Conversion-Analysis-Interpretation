"""Google Business & agency directory discovery via DuckDuckGo.

Finds marketing agencies and established businesses through Google Maps
listings, Clutch, DesignRush, and other agency directories.
"""

import re
from urllib.parse import urlparse

from modules.pipeline import load_pipeline, add_prospect


# ── Search strategies ────────────────────────────────────────────────

# Location-based agency searches
AGENCY_LOCATIONS = {
    "us": [
        "new york", "los angeles", "chicago", "miami", "austin",
        "san francisco", "seattle", "denver", "atlanta", "boston",
        "dallas", "portland", "nashville", "san diego", "phoenix",
    ],
    "uk": [
        "london", "manchester", "birmingham", "leeds", "bristol",
        "edinburgh", "glasgow", "liverpool", "brighton", "cardiff",
    ],
    "au": [
        "sydney", "melbourne", "brisbane", "perth", "adelaide",
        "gold coast", "hobart", "canberra",
    ],
    "ca": [
        "toronto", "vancouver", "montreal", "calgary", "ottawa",
    ],
}

# Agency type search queries
AGENCY_QUERIES = {
    "performance_marketing": [
        '"performance marketing agency" {location} -jobs -article -blog',
        '"paid social agency" {location} -jobs -blog',
        '"media buying agency" {location} -jobs -article',
        '"Facebook ads agency" OR "Meta ads agency" {location} -jobs',
    ],
    "digital_marketing": [
        '"digital marketing agency" {location} -jobs -article -blog',
        '"growth marketing agency" {location} -jobs -blog',
        '"full service digital agency" {location} -jobs',
    ],
    "creative_agency": [
        '"creative agency" "paid media" OR "performance" {location} -jobs',
        '"ad creative agency" {location} -jobs -blog',
        '"creative production" agency {location} -jobs',
    ],
    "ecommerce_agency": [
        '"ecommerce agency" OR "Shopify agency" {location} -jobs -blog',
        '"DTC agency" OR "direct to consumer agency" {location} -jobs',
        '"ecommerce marketing agency" {location} -jobs',
    ],
}

# Directory-based searches (location-independent)
DIRECTORY_QUERIES = [
    'site:clutch.co "marketing agency" "Facebook ads" OR "Meta ads" OR "paid social"',
    'site:designrush.com "performance marketing agency"',
    'site:sortlist.com "digital marketing agency" "paid social"',
    'site:upcity.com "digital marketing agency" "paid media"',
    '"top performance marketing agencies" 2026 -article -blog',
    '"best Facebook ads agencies" OR "best Meta ads agencies" 2026',
]

# Domains to skip (directories, not agencies)
SKIP_DOMAINS = {
    "clutch.co", "designrush.com", "sortlist.com", "upcity.com",
    "goodfirms.co", "g2.com", "capterra.com", "trustpilot.com",
    "glassdoor.com", "indeed.com", "linkedin.com", "facebook.com",
    "instagram.com", "twitter.com", "youtube.com", "google.com",
    "yelp.com", "bbb.org", "crunchbase.com", "producthunt.com",
    "wikipedia.org", "medium.com", "forbes.com", "inc.com",
    "hubspot.com", "semrush.com", "ahrefs.com", "moz.com",
    "neilpatel.com", "searchenginejournal.com", "adweek.com",
    "marketingdive.com", "digiday.com",
}


def search_agencies(location=None, country="us", agency_type="performance_marketing", limit=30):
    """Search for marketing agencies by location and type.

    Args:
        location: city name (e.g., "new york"). If None, uses first 5 cities for country.
        country: country code (us, uk, au, ca). Defaults to us.
        agency_type: key from AGENCY_QUERIES.
        limit: max results.

    Returns:
        dict with results, total, location, agency_type.
    """
    queries_template = AGENCY_QUERIES.get(agency_type)
    if not queries_template:
        return {"results": [], "total": 0, "error": f"Unknown agency_type: {agency_type}",
                "available_types": list(AGENCY_QUERIES.keys())}

    # Determine locations to search
    if location:
        locations = [location]
    else:
        locations = AGENCY_LOCATIONS.get(country.lower(), AGENCY_LOCATIONS["us"])[:5]

    all_results = []
    seen_domains = set()
    existing_domains = _get_pipeline_domains()

    for loc in locations:
        for query_tmpl in queries_template:
            query = query_tmpl.replace("{location}", f'"{loc}"')
            hits = _ddg_search(query, max_results=limit // (len(locations) * len(queries_template)) + 3)

            for hit in hits:
                url = hit.get("href", "")
                domain = _extract_domain(url)
                if not domain or domain in seen_domains or domain in existing_domains:
                    continue
                if domain in SKIP_DOMAINS or _is_skip_domain(domain):
                    continue
                if _is_noise_url(url):
                    continue

                seen_domains.add(domain)
                all_results.append({
                    "company": _clean_title(hit.get("title", "")),
                    "url": url,
                    "domain": domain,
                    "location": loc,
                    "description": hit.get("body", "")[:200],
                    "agency_type": agency_type,
                    "source_query": query,
                })

            if len(all_results) >= limit:
                break
        if len(all_results) >= limit:
            break

    return {
        "results": all_results[:limit],
        "total": len(all_results[:limit]),
        "location": location,
        "country": country,
        "agency_type": agency_type,
    }


def search_directories(limit=30):
    """Search agency directories for performance marketing agencies.

    Uses Clutch, DesignRush, and similar curated directories.

    Args:
        limit: max results.

    Returns:
        dict with results, total.
    """
    all_results = []
    seen_domains = set()
    existing_domains = _get_pipeline_domains()

    for query in DIRECTORY_QUERIES:
        hits = _ddg_search(query, max_results=limit // len(DIRECTORY_QUERIES) + 3)

        for hit in hits:
            url = hit.get("href", "")
            title = hit.get("title", "")
            body = hit.get("body", "")

            # For directory results, try to extract the actual agency domains
            # from the listing text
            agency_domains = _extract_agency_domains_from_text(body)

            if agency_domains:
                for agency_domain in agency_domains:
                    if agency_domain in seen_domains or agency_domain in existing_domains:
                        continue
                    if agency_domain in SKIP_DOMAINS or _is_skip_domain(agency_domain):
                        continue

                    seen_domains.add(agency_domain)
                    all_results.append({
                        "company": _domain_to_name(agency_domain),
                        "url": f"https://{agency_domain}",
                        "domain": agency_domain,
                        "description": body[:200],
                        "source": "directory",
                        "directory_url": url,
                    })
            else:
                # Direct agency result (not a directory page)
                domain = _extract_domain(url)
                if not domain or domain in seen_domains or domain in existing_domains:
                    continue
                if domain in SKIP_DOMAINS or _is_skip_domain(domain):
                    continue
                if _is_noise_url(url):
                    continue

                seen_domains.add(domain)
                all_results.append({
                    "company": _clean_title(title),
                    "url": url,
                    "domain": domain,
                    "description": body[:200],
                    "source": "directory_search",
                })

        if len(all_results) >= limit:
            break

    return {
        "results": all_results[:limit],
        "total": len(all_results[:limit]),
    }


def batch_add_agencies(results, campaign=None):
    """Add discovered agencies to the pipeline.

    Args:
        results: list of dicts from search_agencies() or search_directories()
        campaign: optional campaign name

    Returns:
        dict with added count, skipped count, results
    """
    existing_domains = _get_pipeline_domains()
    added = 0
    skipped = 0
    add_results = []

    for agency in results:
        domain = agency.get("domain", "")
        if domain in existing_domains:
            skipped += 1
            continue

        prospect_data = {
            "company": agency.get("company", ""),
            "company_url": agency.get("url") or (f"https://{domain}" if domain else ""),
            "source": "agency_directory" if agency.get("source") == "directory" else "agency_search",
            "stage": "discovered",
            "company_type": "agency",
            "campaign": campaign or "",
            "tags": ["agency", agency.get("agency_type", "")],
            "company_intel": {
                "location": agency.get("location", ""),
                "agency_type": agency.get("agency_type", ""),
            },
            "pain_signals": [
                "Marketing agency — needs creative velocity for client accounts",
            ],
            "notes": f"Agency: {agency.get('description', '')[:150]}",
        }

        result = add_prospect(prospect_data)
        existing_domains.add(domain)
        added += 1
        add_results.append({
            "company": agency.get("company"),
            "domain": domain,
            "location": agency.get("location", ""),
            "id": result.get("id"),
        })

    return {"added": added, "skipped_duplicate": skipped, "results": add_results}


# ── Helpers ──────────────────────────────────────────────────────────


def _extract_domain(url):
    """Extract domain from URL, stripping www."""
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        if domain.startswith("www."):
            domain = domain[4:]
        return domain
    except Exception:
        return ""


def _is_skip_domain(domain):
    """Check if domain should be skipped."""
    skip_tlds = [".gov", ".edu", ".mil"]
    if any(domain.endswith(tld) for tld in skip_tlds):
        return True
    return False


def _is_noise_url(url):
    """Check if URL is likely noise (blog, article, etc.)."""
    try:
        parsed = urlparse(url)
        path = parsed.path.lower()
        noise_patterns = [
            "/blog", "/article", "/news", "/post/",
            "/category/", "/tag/", "/best-", "/top-",
            "/how-to-", "/guide", "/review",
        ]
        return any(p in path for p in noise_patterns)
    except Exception:
        return False


def _clean_title(title):
    """Clean DDG title into a company name."""
    if not title:
        return ""
    # Strip common suffixes
    title = re.sub(r'\s*[-|]\s+.*$', '', title)
    title = re.sub(r'\s*\(?\d{4}\)?\s*$', '', title)
    return title.strip()[:80]


def _domain_to_name(domain):
    """Convert a domain to a readable name."""
    name = domain.split(".")[0]
    # Un-camelCase and capitalize
    name = re.sub(r'([a-z])([A-Z])', r'\1 \2', name)
    return name.title()


def _extract_agency_domains_from_text(text):
    """Try to extract agency website domains from directory listing text."""
    if not text:
        return []

    url_pattern = re.compile(r'(?:https?://)?(?:www\.)?([a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,})')
    domains = []

    for match in url_pattern.findall(text):
        domain = match.lower()
        if domain in SKIP_DOMAINS:
            continue
        if _is_skip_domain(domain):
            continue
        # Filter out common false positives
        if any(fp in domain for fp in ["example.com", "test.", "localhost"]):
            continue
        domains.append(domain)

    return domains[:5]  # Max 5 per listing


def _ddg_search(query, max_results=10):
    """Run a DuckDuckGo search."""
    try:
        from ddgs import DDGS
        with DDGS() as ddgs:
            return list(ddgs.text(query, max_results=max_results))
    except ImportError:
        return []
    except Exception:
        return []


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
