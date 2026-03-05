"""Shopify store discovery via DuckDuckGo + public store metadata.

Finds DTC brands running Shopify stores by niche, then verifies them
via Shopify's public /products.json endpoint to confirm they're real
active stores with products.
"""

import re
from urllib.parse import urlparse

import requests

from modules.pipeline import load_pipeline, add_prospect


# ── Niche search queries ─────────────────────────────────────────────

# Targeted queries that find actual Shopify stores (not blog posts about them)
NICHE_QUERIES = {
    "supplements": [
        '"supplements" site:myshopify.com -blog -article',
        '"protein" OR "collagen" OR "vitamins" site:myshopify.com',
        '"supplement" "shop now" site:myshopify.com',
        '"greens powder" OR "nootropics" OR "pre workout" site:myshopify.com',
    ],
    "skincare": [
        '"skincare" site:myshopify.com -blog -article',
        '"serum" OR "moisturizer" OR "cleanser" site:myshopify.com',
        '"skincare" "shop now" site:myshopify.com',
        '"retinol" OR "vitamin C" OR "hyaluronic" site:myshopify.com',
    ],
    "fitness": [
        '"fitness" OR "workout" site:myshopify.com -blog',
        '"activewear" OR "gym" OR "training" site:myshopify.com',
        '"resistance bands" OR "yoga mat" OR "fitness equipment" site:myshopify.com',
    ],
    "fashion": [
        '"clothing" OR "apparel" site:myshopify.com -blog -article',
        '"streetwear" OR "athleisure" OR "sustainable fashion" site:myshopify.com',
        '"jewelry" OR "accessories" site:myshopify.com -blog',
    ],
    "pets": [
        '"dog" OR "cat" OR "pet" "treats" OR "food" site:myshopify.com',
        '"pet supplies" site:myshopify.com -blog',
    ],
    "home": [
        '"home decor" OR "candles" OR "fragrance" site:myshopify.com -blog',
        '"kitchen" OR "bedding" OR "furniture" site:myshopify.com -blog',
    ],
    "food_beverage": [
        '"coffee" OR "tea" OR "snacks" site:myshopify.com -blog',
        '"organic" OR "keto" OR "vegan" food site:myshopify.com',
    ],
    "beauty": [
        '"makeup" OR "cosmetics" OR "beauty" site:myshopify.com -blog',
        '"hair care" OR "nail" OR "lashes" site:myshopify.com',
    ],
}


def search_shopify_stores(niche=None, keywords=None, limit=30, verify=True):
    """Discover Shopify stores by niche or custom keywords.

    Args:
        niche: key from NICHE_QUERIES (e.g., "supplements", "skincare").
        keywords: custom search keywords (used if niche not provided).
        limit: max stores to return.
        verify: if True, verify each store via /products.json.

    Returns:
        dict with results (list of store dicts), total, niche/keywords.
    """
    if niche:
        queries = NICHE_QUERIES.get(niche.lower())
        if not queries:
            # Custom niche — generate Shopify-specific queries
            queries = [
                f'"{niche}" site:myshopify.com -blog -article',
                f'"{niche}" "shop now" site:myshopify.com',
            ]
    elif keywords:
        queries = [f'"{kw}" site:myshopify.com -blog' for kw in keywords]
    else:
        return {"results": [], "total": 0, "error": "Must provide niche or keywords"}

    all_results = []
    seen_domains = set()
    existing_domains = _get_pipeline_domains()

    for query in queries:
        hits = _ddg_search(query, max_results=max(30, limit // len(queries) + 5))
        for hit in hits:
            url = hit.get("href", "")
            domain = _extract_shopify_domain(url)
            if not domain or domain in seen_domains or domain in existing_domains:
                continue

            seen_domains.add(domain)

            store_info = {
                "shopify_domain": domain,
                "url": url,
                "title": _clean_title(hit.get("title", "")),
                "description": hit.get("body", "")[:200],
                "source_query": query,
                "verified": False,
                "product_count": 0,
                "primary_domain": "",
            }

            # Verify store is real and get metadata
            if verify:
                metadata = verify_shopify_store(domain)
                if metadata.get("is_shopify"):
                    store_info["verified"] = True
                    store_info["product_count"] = metadata.get("product_count", 0)
                    store_info["primary_domain"] = metadata.get("primary_domain", "")
                    store_info["store_name"] = metadata.get("store_name", store_info["title"])
                else:
                    # Not a real Shopify store or inaccessible
                    continue
            else:
                store_info["store_name"] = store_info["title"]

            all_results.append(store_info)

        if len(all_results) >= limit:
            break

    return {
        "results": all_results[:limit],
        "total": len(all_results[:limit]),
        "niche": niche,
        "keywords": keywords,
    }


def verify_shopify_store(domain):
    """Verify a domain is a Shopify store and extract metadata.

    Checks the public /products.json endpoint which Shopify exposes
    by default on all stores.

    Args:
        domain: myshopify.com domain or custom domain.

    Returns:
        dict with is_shopify, product_count, store_name, primary_domain.
    """
    urls_to_try = []

    if "myshopify.com" in domain:
        urls_to_try.append(f"https://{domain}/products.json?limit=1")
    else:
        urls_to_try.append(f"https://{domain}/products.json?limit=1")
        urls_to_try.append(f"https://www.{domain}/products.json?limit=1")

    for url in urls_to_try:
        try:
            resp = requests.get(url, timeout=10, allow_redirects=True)

            # Check if we got redirected to the real domain
            primary_domain = ""
            if resp.url != url:
                parsed = urlparse(resp.url)
                primary_domain = parsed.netloc.lower()
                if primary_domain.startswith("www."):
                    primary_domain = primary_domain[4:]

            if resp.status_code == 200:
                try:
                    data = resp.json()
                    products = data.get("products", [])
                    store_name = ""
                    if products:
                        # Extract vendor as store name hint
                        store_name = products[0].get("vendor", "")

                    return {
                        "is_shopify": True,
                        "product_count": len(products),
                        "store_name": store_name,
                        "primary_domain": primary_domain or domain,
                    }
                except (ValueError, KeyError):
                    pass

            # Check for Shopify headers even if /products.json is disabled
            shopify_headers = ["x-shopid", "x-sorting-hat-podid", "x-shopify-stage"]
            if any(h in resp.headers for h in shopify_headers):
                return {
                    "is_shopify": True,
                    "product_count": 0,
                    "store_name": "",
                    "primary_domain": primary_domain or domain,
                }

        except requests.RequestException:
            continue

    return {"is_shopify": False}


def batch_add_shopify_stores(results, campaign=None):
    """Add discovered Shopify stores to the pipeline.

    Args:
        results: list of dicts from search_shopify_stores()
        campaign: optional campaign name

    Returns:
        dict with added count, skipped count, results
    """
    existing_domains = _get_pipeline_domains()
    added = 0
    skipped = 0
    add_results = []

    for store in results:
        # Use primary domain if available, otherwise shopify domain
        domain = store.get("primary_domain") or store.get("shopify_domain", "")
        if domain in existing_domains:
            skipped += 1
            continue

        company_name = store.get("store_name") or store.get("title") or domain
        company_url = f"https://{domain}" if domain else ""

        prospect_data = {
            "company": company_name,
            "company_url": company_url,
            "source": "shopify_discovery",
            "stage": "discovered",
            "company_type": "dtc_brand",
            "campaign": campaign or "",
            "tags": ["shopify", "dtc"],
            "company_intel": {
                "tech_stack": ["Shopify"],
                "is_ecommerce_store": True,
                "shopify_domain": store.get("shopify_domain", ""),
                "product_count": store.get("product_count", 0),
            },
            "pain_signals": [
                "Shopify store running ads — creative velocity is now the #1 lever",
            ],
            "notes": f"Shopify store: {store.get('description', '')[:150]}",
        }

        result = add_prospect(prospect_data)
        existing_domains.add(domain)
        added += 1
        add_results.append({
            "company": company_name,
            "domain": domain,
            "products": store.get("product_count", 0),
            "id": result.get("id"),
        })

    return {"added": added, "skipped_duplicate": skipped, "results": add_results}


# ── Helpers ──────────────────────────────────────────────────────────


def _extract_shopify_domain(url):
    """Extract the Shopify domain from a URL."""
    try:
        parsed = urlparse(url)
        host = parsed.netloc.lower()
        if host.startswith("www."):
            host = host[4:]
        return host
    except Exception:
        return ""


def _clean_title(title):
    """Clean a DDG search result title."""
    if not title:
        return ""
    # Remove common suffixes
    title = re.sub(r'\s*[-|]\s*.*$', '', title)
    # Remove "Shop" prefix
    title = re.sub(r'^Shop\s+', '', title, flags=re.IGNORECASE)
    return title.strip()[:80]


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
            # Also check shopify_domain in intel
            shopify_domain = (p.get("company_intel") or {}).get("shopify_domain", "")
            if shopify_domain:
                domains.add(shopify_domain)
        return domains
    except Exception:
        return set()
