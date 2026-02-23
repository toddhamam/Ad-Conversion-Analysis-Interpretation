"""Autonomous prospect discovery via DuckDuckGo search."""

from urllib.parse import urlparse

from modules.pipeline import load_pipeline

# Niche -> search queries that combine ICP signals with niche keywords
NICHE_KEYWORDS = {
    "supplements": [
        '"supplement brand" "media buyer" OR "ad creative"',
        '"supplement" "DTC" scaling paid social',
        '"supplement brand" hiring creative',
    ],
    "skincare": [
        '"skincare brand" "media buyer" OR "ad creative"',
        '"skincare" "DTC" scaling ads',
        '"beauty brand" hiring creative',
    ],
    "fitness": [
        '"fitness" "online coaching" paid ads',
        '"fitness program" "media buyer"',
        '"personal training" "Facebook ads"',
    ],
    "courses": [
        '"online course" "ad creative" OR "media buyer"',
        '"coaching program" "scaling" ads',
        '"digital course" "Facebook ads" OR "Meta ads"',
    ],
    "ecommerce": [
        '"ecommerce" "media buyer" hiring',
        '"DTC brand" "creative testing"',
        '"ecommerce" scaling "paid social"',
    ],
    "saas": [
        '"SaaS" "growth marketing" "paid social"',
        '"SaaS" "media buyer" OR "creative strategist"',
        '"B2B SaaS" "demand gen" ads',
    ],
}

DEFAULT_NICHES = list(NICHE_KEYWORDS.keys())

# Domains to always skip
SKIP_DOMAINS = {
    "facebook.com", "instagram.com", "twitter.com", "x.com", "linkedin.com",
    "youtube.com", "tiktok.com", "reddit.com", "pinterest.com",
    "amazon.com", "ebay.com", "walmart.com", "target.com",
    "google.com", "bing.com", "yahoo.com",
    "wikipedia.org", "medium.com", "substack.com",
    "indeed.com", "glassdoor.com", "ziprecruiter.com",
}


def search_prospects_by_niche(niche, limit=30):
    """Search DuckDuckGo for companies in a niche matching ICP."""
    niche_lower = niche.lower()
    queries = NICHE_KEYWORDS.get(niche_lower)

    if not queries:
        # Custom niche — generate generic ICP queries
        queries = [
            f'"{niche}" "media buyer" OR "ad creative"',
            f'"{niche}" "DTC" OR "ecommerce" scaling ads',
            f'"{niche}" brand hiring creative OR growth',
        ]

    all_results = []
    seen_domains = set()

    # Load existing pipeline for dedup
    existing_domains = _get_pipeline_domains()

    for query in queries:
        hits = _ddg_search(query, max_results=limit // len(queries) + 5)
        for hit in hits:
            domain = _extract_domain(hit.get("href", ""))
            if not domain or domain in seen_domains or domain in existing_domains or domain in SKIP_DOMAINS:
                continue
            seen_domains.add(domain)
            all_results.append({
                "company": hit.get("title", "").split(" - ")[0].split(" | ")[0].strip(),
                "url": hit.get("href", ""),
                "domain": domain,
                "description": hit.get("body", "")[:200],
                "source_query": query,
            })

        if len(all_results) >= limit:
            break

    return {"results": all_results[:limit], "total": len(all_results[:limit]), "niche": niche}


def search_prospects_by_keywords(keywords_list, limit=30):
    """Search using custom keywords."""
    all_results = []
    seen_domains = set()
    existing_domains = _get_pipeline_domains()

    for keyword in keywords_list:
        hits = _ddg_search(keyword, max_results=limit // len(keywords_list) + 5)
        for hit in hits:
            domain = _extract_domain(hit.get("href", ""))
            if not domain or domain in seen_domains or domain in existing_domains or domain in SKIP_DOMAINS:
                continue
            seen_domains.add(domain)
            all_results.append({
                "company": hit.get("title", "").split(" - ")[0].split(" | ")[0].strip(),
                "url": hit.get("href", ""),
                "domain": domain,
                "description": hit.get("body", "")[:200],
                "source_query": keyword,
            })

        if len(all_results) >= limit:
            break

    return {"results": all_results[:limit], "total": len(all_results[:limit]), "keywords": keywords_list}


def batch_discover(niches=None, limit_per_niche=20):
    """Sweep multiple niches for prospects."""
    if niches is None:
        niches = DEFAULT_NICHES

    results_by_niche = {}
    total_found = 0

    for niche in niches:
        result = search_prospects_by_niche(niche, limit=limit_per_niche)
        results_by_niche[niche] = result["results"]
        total_found += result["total"]

    return {
        "niches_searched": len(niches),
        "total_found": total_found,
        "results_by_niche": results_by_niche,
    }


def search_linkedin(query, limit=20):
    """Search for LinkedIn profiles matching query."""
    search_query = f'{query} site:linkedin.com/in/'
    hits = _ddg_search(search_query, max_results=limit)

    results = []
    for hit in hits:
        url = hit.get("href", "")
        if "linkedin.com/in/" not in url:
            continue
        results.append({
            "name": hit.get("title", "").split(" - ")[0].split(" | ")[0].strip(),
            "linkedin_url": url,
            "description": hit.get("body", "")[:200],
        })

    return {"results": results[:limit], "total": len(results[:limit])}


def _ddg_search(query, max_results=10):
    """Run a DuckDuckGo search. Returns list of result dicts."""
    try:
        from ddgs import DDGS
        with DDGS() as ddgs:
            return list(ddgs.text(query, max_results=max_results))
    except ImportError:
        return [{"title": "ERROR", "href": "", "body": "ddgs package not installed. Run: pip3 install ddgs"}]
    except Exception as e:
        return [{"title": "ERROR", "href": "", "body": f"Search failed: {e}"}]


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


def _get_pipeline_domains():
    """Get set of domains already in pipeline."""
    try:
        data = load_pipeline()
        domains = set()
        for p in data["prospects"]:
            url = p.get("company_url", "")
            if url:
                domains.add(_extract_domain(url))
        return domains
    except Exception:
        return set()
