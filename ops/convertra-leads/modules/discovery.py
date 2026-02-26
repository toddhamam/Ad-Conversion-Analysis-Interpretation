"""Autonomous prospect discovery via DuckDuckGo search."""

import re
from urllib.parse import urlparse

from modules.pipeline import load_pipeline

# Niche -> search queries designed to find actual brand/company homepages (not articles)
# Strategy: use e-commerce signals, Shopify stores, and negative modifiers to skip listicles
NICHE_KEYWORDS = {
    "supplements": [
        'supplement "shop now" OR "subscribe & save" OR "add to cart" -blog -article -guide',
        'supplement brand site:myshopify.com',
        '"supplement" "free shipping" DTC -"top 10" -"best" -review',
    ],
    "skincare": [
        'skincare "shop now" OR "subscribe & save" OR "add to cart" -blog -article -guide',
        'skincare brand site:myshopify.com',
        '"skincare" "free shipping" DTC -"top 10" -"best" -review',
    ],
    "fitness": [
        '"fitness program" OR "online coaching" "sign up" OR "join now" -blog -article',
        '"fitness" "coaching" site:myshopify.com OR site:kajabi.com',
        '"fitness brand" "free trial" OR "get started" -"top 10" -"best" -review',
    ],
    "courses": [
        '"online course" "enroll now" OR "join" OR "get access" -blog -article -udemy -coursera',
        '"coaching program" "apply now" OR "book a call" -blog -review',
        '"digital course" site:kajabi.com OR site:teachable.com OR site:thinkific.com',
    ],
    "ecommerce": [
        'DTC brand "shop now" OR "free shipping" site:myshopify.com -blog -article',
        '"ecommerce brand" "add to cart" -"top 10" -"best" -review -guide',
        '"DTC" "Shopify" "Klaviyo" brand -blog -article',
    ],
    "saas": [
        '"SaaS" "start free trial" OR "book a demo" -blog -article -review -"top 10"',
        '"SaaS" "growth marketing" company -blog -guide -article',
        '"B2B SaaS" "pricing" "free trial" -review -comparison',
    ],
}

# Sub-niche expansions — specific product categories that yield fresh DDG results
# when the parent niche is exhausted. Each generates proper e-commerce queries.
SUB_NICHES = {
    "supplements": [
        "collagen supplement", "nootropics", "pre workout", "protein powder",
        "CBD gummies", "vitamin D supplement", "greens powder", "ashwagandha",
        "creatine supplement", "omega 3 fish oil", "probiotics", "magnesium supplement",
        "turmeric supplement", "mushroom supplement", "electrolyte powder",
        "sleep supplement", "testosterone booster", "fat burner supplement",
        "amino acids supplement", "elderberry supplement",
    ],
    "skincare": [
        "retinol serum", "vitamin C serum", "hyaluronic acid", "anti aging cream",
        "sunscreen SPF", "acne treatment", "face moisturizer", "eye cream",
        "facial cleanser", "exfoliating serum", "niacinamide serum", "peptide cream",
        "natural skincare", "Korean skincare", "men skincare", "organic face oil",
        "dark spot corrector", "lip balm brand", "body lotion brand",
    ],
    "fitness": [
        "personal training online", "yoga program online", "HIIT workout program",
        "strength training app", "home workout program", "fitness coaching women",
        "bodybuilding program", "marathon training plan", "pilates online",
        "CrossFit programming", "calisthenics program", "nutrition coaching",
        "weight loss coaching", "postpartum fitness", "senior fitness program",
    ],
    "courses": [
        "copywriting course", "real estate course", "trading course",
        "photography course", "marketing course online", "coding bootcamp",
        "leadership coaching", "business coaching", "life coaching program",
        "sales training program", "public speaking course", "mindset coaching",
        "productivity course", "AI course online", "design course online",
    ],
    "ecommerce": [
        "pet supplies DTC", "baby products brand", "home decor brand",
        "jewelry brand online", "candle brand", "coffee brand DTC",
        "clothing brand shopify", "activewear brand", "sneaker brand",
        "sunglasses brand DTC", "luggage brand DTC", "kitchen gadgets brand",
        "stationery brand", "phone accessories brand", "hair care brand",
        "beard grooming brand", "organic food brand", "tea brand DTC",
        "wine subscription", "snack brand DTC",
    ],
    "saas": [
        "CRM software startup", "project management SaaS", "email marketing platform",
        "analytics dashboard SaaS", "HR software startup", "accounting software SaaS",
        "customer support software", "scheduling software", "invoicing software",
        "social media management tool", "SEO tool startup", "AI writing tool",
        "video editing SaaS", "form builder software", "survey tool SaaS",
    ],
}

DEFAULT_NICHES = list(NICHE_KEYWORDS.keys())

# Domains to always skip (exact match)
SKIP_DOMAINS = {
    # Social media
    "facebook.com", "instagram.com", "twitter.com", "x.com", "linkedin.com",
    "youtube.com", "tiktok.com", "reddit.com", "pinterest.com", "threads.net",
    # Marketplaces
    "amazon.com", "ebay.com", "walmart.com", "target.com", "etsy.com", "alibaba.com",
    # Search engines
    "google.com", "bing.com", "yahoo.com", "duckduckgo.com",
    # Content platforms
    "wikipedia.org", "medium.com", "substack.com", "wordpress.com", "blogger.com",
    "tumblr.com", "quora.com", "stackexchange.com", "stackoverflow.com",
    # Job boards
    "indeed.com", "glassdoor.com", "ziprecruiter.com", "monster.com",
    "seek.com.au", "jora.com", "adzuna.com", "careerbuilder.com", "angel.co",
    "onlinejobs.ph", "trabajo.org", "jooble.org", "simplyhired.com",
    "wellfound.com", "remoteok.com", "weworkremotely.com",
    # Freelancer platforms (base domains — variants handled by _is_skip_domain)
    "upwork.com", "fiverr.com", "toptal.com", "freelancer.com", "guru.com",
    # Course marketplaces / piracy sites (not the course creators themselves)
    "udemy.com", "skillshare.com", "coursera.org", "edx.org",
    "teachable.com", "thinkific.com", "kajabi.com", "podia.com",
    "xcourse.co", "pikacourses.com", "creativecourse.net", "ibusinesscourse.org",
    "gcertificationcourse.com",
    # Aggregator / review / tool sites
    "crunchbase.com", "g2.com", "capterra.com", "trustpilot.com",
    "producthunt.com", "similarweb.com", "semrush.com", "ahrefs.com",
    "sproutsocial.com", "starterstory.com", "later.com", "hootsuite.com",
    "buffer.com", "mailchimp.com", "amraandelma.com",
    # News / media
    "techcrunch.com", "forbes.com", "entrepreneur.com", "inc.com",
    "businessinsider.com", "hubspot.com", "neilpatel.com",
    "mediaweek.com.au", "adweek.com", "marketingdive.com", "digiday.com",
    # Content / listicle / review sites
    "ecommercefastlane.com", "magentobrain.com", "digitalagencynetwork.com",
    "mysubscriptionaddiction.com", "ochatbot.com", "netalico.com",
    "sleeknote.com", "privy.com", "oberlo.com", "pagefly.io",
    "shogun.io", "gorgias.com", "yotpo.com", "loox.io",
    "ecommerceceo.com", "ecommerceplatforms.io", "websiteplanet.com",
    "wpbeginner.com", "elegantthemes.com", "themeisle.com",
    # Job boards (additional)
    "weekday.works", "lever.co", "greenhouse.io", "workable.com",
    "breezy.hr", "bamboohr.com", "ashbyhq.com", "dover.com",
    "otta.com", "himalayas.app", "builtin.com",
    # Community platforms
    "skool.com",
    # Design / portfolio
    "behance.net", "dribbble.com",
    # Government
    "gov.au", "gov.uk", "gov.com",
}

# Base domains that have many country-code variants (freelancer.ph, freelancer.co.za, etc.)
_SKIP_BASE_DOMAINS = {
    "freelancer", "indeed", "glassdoor", "seek", "jobs",
}

# URL path patterns that indicate noise (blog posts, articles, job listings)
_NOISE_PATH_RE = re.compile(
    r"/blogs?/|/article/|/news/|/post/|/category/|/tag/"
    r"|/\d{4}/\d{2}/"         # Date-based blog URLs
    r"|/jobs?/"                # Job listings
    r"|/courses?/"             # Course listing pages
    r"|/reviews?/"             # Review pages
    r"|/best-"                 # "Best X" listicle articles
    r"|/top-\d+"              # "Top 10" articles
    r"|/how-to-"              # How-to articles
    r"|/what-is-"             # Informational articles
    r"|/guide[s]?[/-]"        # Guide articles (guide/ or guides/ or guide-)
    r"|/podcast/"
    r"|/webinar"
    r"|/projects/"             # Freelancer project pages
    r"|/editorial-"            # Editorial content
    r"|-vs-.*-guide"           # Comparison guides (shopify-vs-shopify-plus-guide)
    r"|-complete-guide"        # Complete guide articles
    r"|-strategy-"             # Strategy articles
    r"|-for-shopify"           # "X for Shopify" tool/blog articles
    r"|-for-ecommerce",        # "X for ecommerce" tool/blog articles
    re.IGNORECASE
)


def _is_skip_domain(domain):
    """Check if a domain should be skipped.

    Handles:
    - Exact matches (facebook.com)
    - Subdomain variants (m.facebook.com)
    - Country-code variants (freelancer.ph, freelancer.co.za, br.freelancer.com)
    """
    if domain in SKIP_DOMAINS:
        return True

    # Check if it's a subdomain of a skip domain (e.g., m.facebook.com, careers.singlegrain.com)
    for skip in SKIP_DOMAINS:
        if domain.endswith("." + skip):
            return True

    # Check base domain for country-code variants
    # e.g., freelancer.ph, freelancer.co.za, freelancer.com.au
    parts = domain.split(".")
    if parts:
        base = parts[0]
        if base in _SKIP_BASE_DOMAINS:
            return True

    return False


def _is_noise_url(url):
    """Check if a URL is likely noise (blog post, article, job listing)."""
    try:
        parsed = urlparse(url)
        path = parsed.path.lower()

        # Check path patterns
        if _NOISE_PATH_RE.search(path):
            return True

        # Deep paths (4+ segments) are usually articles, not company homepages
        segments = [s for s in path.split("/") if s]
        if len(segments) >= 4:
            return True

        # Long hyphenated slugs (6+ hyphens) are almost always article titles
        if segments:
            last_segment = segments[-1]
            if last_segment.count("-") >= 6:
                return True

        # Path is a single long slug with many words — likely an article
        if len(segments) == 1 and len(segments[0]) > 60:
            return True

        return False
    except Exception:
        return False


def search_prospects_by_niche(niche, limit=30):
    """Search DuckDuckGo for companies in a niche matching ICP."""
    niche_lower = niche.lower()
    queries = NICHE_KEYWORDS.get(niche_lower)

    if not queries:
        # Custom niche — generate e-commerce focused queries (not weak ICP fallback)
        queries = [
            f'"{niche}" "shop now" OR "add to cart" OR "subscribe & save" -blog -article -guide -review',
            f'"{niche}" brand site:myshopify.com -blog -article',
            f'"{niche}" "free shipping" OR "money back guarantee" -"top 10" -"best" -review -guide',
        ]

    all_results = []
    seen_domains = set()

    # Load existing pipeline for dedup
    existing_domains = _get_pipeline_domains()

    for query in queries:
        hits = _ddg_search(query, max_results=limit // len(queries) + 5)
        for hit in hits:
            domain = _extract_domain(hit.get("href", ""))
            if not domain or domain in seen_domains or domain in existing_domains:
                continue
            if _is_skip_domain(domain):
                continue
            if _is_noise_url(hit.get("href", "")):
                continue
            seen_domains.add(domain)
            all_results.append({
                "company": _clean_ddg_title(hit.get("title", "")),
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
            if not domain or domain in seen_domains or domain in existing_domains:
                continue
            if _is_skip_domain(domain):
                continue
            if _is_noise_url(hit.get("href", "")):
                continue
            seen_domains.add(domain)
            all_results.append({
                "company": _clean_ddg_title(hit.get("title", "")),
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


def _clean_ddg_title(title):
    """Clean a DDG search result title into a usable company name.

    Strips breadcrumb markers (›), domain prefixes, article-style suffixes,
    and common noise patterns from DDG titles.
    """
    if not title:
        return ""
    # Strip breadcrumb-style prefixes: "domain.com › path › Page Title"
    if "›" in title:
        parts = title.split("›")
        title = parts[-1].strip()
    # Split on common separators and take first part
    title = title.split(" - ")[0].split(" | ")[0].split(" :: ")[0].strip()
    # Strip trailing year patterns like "2025", "2026", "(2026)"
    title = re.sub(r'\s*\(?\d{4}\)?\s*$', '', title)
    # Strip "The Complete Guide to..." type prefixes
    noise_prefixes = [
        "the complete guide to ", "a guide to ", "guide to ",
        "how to ", "what is ", "why ", "top ",
    ]
    title_lower = title.lower()
    for prefix in noise_prefixes:
        if title_lower.startswith(prefix):
            return ""  # This is an article, not a company name
    # If title is too long (>60 chars) it's likely an article headline
    if len(title) > 60:
        return ""
    return title.strip()


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
