"""Company website scraper — rule-based signal extraction."""

import json
import re
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from modules.pipeline import load_pipeline, update_prospect

USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
TIMEOUT = 10

# Pages to scrape per company
PAGES_TO_CHECK = ["", "/about", "/about-us", "/team", "/our-team", "/careers", "/jobs"]

# Tech stack detection patterns
TECH_PATTERNS = {
    "Shopify": ["cdn.shopify.com", "myshopify.com", "shopify.com"],
    "BigCommerce": ["bigcommerce.com"],
    "WooCommerce": ["woocommerce", "wp-content"],
    "Klaviyo": ["klaviyo"],
    "HubSpot": ["hubspot", "hs-scripts.com"],
    "WordPress": ["wp-content", "wp-includes", "wordpress"],
    "Wix": ["wix.com", "wixsite.com"],
    "Squarespace": ["squarespace.com", "sqsp.com"],
    "Webflow": ["webflow.io", "webflow.com"],
    "Magento": ["magento", "mage/"],
}

# Hiring role keywords
CREATIVE_ROLES = [
    "media buyer", "creative director", "creative strategist",
    "ad creative", "growth marketer", "performance marketer",
    "creative designer", "creative lead", "paid social",
    "paid media", "growth lead", "performance creative",
]

# Dead website indicators
DEAD_INDICATORS = [
    "domain for sale", "buy this domain", "this domain",
    "parked domain", "coming soon", "under construction",
    "godaddy", "namecheap parking", "domain expired",
]

# Role keywords for contact extraction (ordered by priority)
ROLE_KEYWORDS = [
    "co-founder", "founder", "ceo", "coo", "cmo", "cto", "cfo",
    "owner", "managing director", "head of marketing", "head of growth",
    "chief marketing", "chief executive", "vp marketing", "vp growth",
    "director", "president", "partner", "principal",
]

# Words that disqualify a text from being a person's name
NON_NAME_WORDS = {
    # Page/site words
    "the", "our", "about", "meet", "team", "staff", "company", "inc", "ltd",
    "llc", "and", "blog", "news", "page", "home", "best", "top", "how",
    "what", "why", "services", "products", "solutions", "contact", "welcome",
    "join", "read", "more", "view", "all", "new", "get", "free", "buy",
    # Common English words (prepositions, articles, verbs, adjectives)
    # Real names never contain these; phrases/headlines always do
    "a", "an", "in", "on", "at", "to", "of", "for", "from", "with", "by",
    "is", "are", "was", "were", "has", "have", "had", "do", "does", "did",
    "this", "that", "these", "those", "your", "his", "her", "its", "my",
    "it", "we", "you", "they", "us", "or", "but", "not", "no", "so",
    "if", "up", "out", "off", "into", "over", "just", "also", "very",
    "can", "will", "would", "should", "could", "may", "must", "need",
    "real", "big", "high", "low", "fast", "slow", "great", "good",
    "viral", "trending", "trends", "immediately", "jump", "boost",
    "hiring", "looking", "seeking", "wanted", "apply", "work",
    # Job title words (these are roles, not names)
    "manager", "director", "specialist", "coordinator", "executive",
    "analyst", "designer", "developer", "engineer", "officer", "president",
    "associate", "consultant", "strategist", "supervisor", "administrator",
    "intern", "assistant", "representative", "architect", "lead",
    "senior", "junior", "principal", "business", "development", "marketing",
    "sales", "operations", "creative", "digital", "content", "social",
    "media", "brand", "growth", "performance", "production", "account",
    # Ad/marketing jargon
    "advertising", "campaign", "conversion", "optimization", "acquisition",
    "retention", "engagement", "analytics", "automation",
    # Section headings / article phrases
    "final", "thoughts", "conclusion", "summary", "introduction", "overview",
    "key", "takeaways", "results", "findings", "review", "guide",
    "tips", "strategies", "benefits", "features", "pricing", "testimonials",
    "frequently", "asked", "questions", "related", "posts", "articles",
    "share", "subscribe", "newsletter", "categories", "archives",
    # Company/org suffixes
    "labs", "studio", "studios", "group", "agency", "partners", "consulting",
    "enterprises", "industries", "technologies", "tech", "ventures",
}


def scrape_company(url):
    """Scrape a company website and extract signals."""
    if not url.startswith("http"):
        url = "https://" + url

    signals = {
        "tech_stack": [],
        "team_size": "",
        "funding": "",
        "hiring_signals": [],
        "content_marketing": False,
        "dead_website": False,
    }
    all_text = ""
    all_html = ""
    homepage_soup = None
    errors = []

    for page_path in PAGES_TO_CHECK:
        page_url = urljoin(url.rstrip("/") + "/", page_path.lstrip("/"))
        try:
            resp = requests.get(page_url, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT, allow_redirects=True)
            if resp.status_code != 200:
                continue

            html = resp.text
            all_html += html
            soup = BeautifulSoup(html, "html.parser")
            text = soup.get_text(separator=" ", strip=True)
            all_text += " " + text

            # Capture homepage soup for company name extraction
            if page_path == "":
                homepage_soup = soup

            # Check first page for dead website
            if page_path == "":
                if _is_dead_website(resp, soup, text):
                    signals["dead_website"] = True
                    return {"url": url, "signals": signals, "errors": errors}

        except requests.exceptions.Timeout:
            errors.append(f"Timeout: {page_url}")
        except requests.exceptions.ConnectionError:
            errors.append(f"Connection error: {page_url}")
            if page_path == "":
                signals["dead_website"] = True
                return {"url": url, "signals": signals, "errors": errors}
        except Exception as e:
            errors.append(f"Error on {page_url}: {str(e)[:80]}")

    # Extract signals from aggregated data
    signals["tech_stack"] = _extract_tech_stack(all_html)
    signals["team_size"] = _extract_team_signals(all_text)
    signals["funding"] = _extract_funding_signals(all_text)
    signals["hiring_signals"] = _extract_hiring_signals(all_text)
    signals["content_marketing"] = _extract_content_signals(all_html, all_text)

    # Extract contacts from team/about pages
    signals["contacts"] = _extract_contacts(all_html, all_text)

    # Extract real company name from website content
    signals["company_name"] = _extract_company_name(homepage_soup, url)

    result = {"url": url, "signals": signals}
    if errors:
        result["errors"] = errors
    return result


def batch_research(stage="discovered"):
    """Research all prospects in the given stage that lack company_intel."""
    data = load_pipeline()
    results = []
    researched = 0

    for prospect in data["prospects"]:
        if prospect.get("stage") != stage:
            continue
        # Skip if already has company_intel
        if prospect.get("company_intel", {}).get("tech_stack"):
            continue

        url = prospect.get("company_url", "")
        if not url:
            results.append({"id": prospect["id"], "status": "skipped", "message": "No company_url"})
            continue

        research = scrape_company(url)
        signals = research.get("signals", {})

        # Update prospect with research data
        intel = prospect.get("company_intel", {})
        intel["tech_stack"] = signals.get("tech_stack", [])
        intel["estimated_employees"] = signals.get("team_size", "")
        intel["funding"] = signals.get("funding", "")
        intel["hiring_signals"] = signals.get("hiring_signals", [])
        intel["content_marketing"] = signals.get("content_marketing", False)
        intel["dead_website"] = signals.get("dead_website", False)

        # Store extracted contacts
        contacts = signals.get("contacts", [])
        intel["contacts"] = contacts

        # Build prospect updates
        updates = {
            "company_intel": intel,
            "stage": "researched",
        }

        # Set primary contact name and role from best contact found
        if contacts:
            # Prioritize founder/CEO/CMO roles
            role_priority = {
                "co-founder": 0, "founder": 1, "ceo": 2,
                "chief executive": 3, "cmo": 4, "chief marketing": 5,
                "owner": 6, "managing director": 7, "president": 8,
                "director": 9, "head of marketing": 10, "head of growth": 11,
                "vp marketing": 12, "vp growth": 13, "partner": 14,
            }
            sorted_contacts = sorted(
                contacts,
                key=lambda c: role_priority.get(c.get("role", "").lower(), 99)
            )
            # Only use names that have a role — "Jake Cooper, CEO" is real;
            # "Measuring Scoop" with no role is probably not a person
            contacts_with_roles = [c for c in sorted_contacts if c.get("role")]
            best = contacts_with_roles[0] if contacts_with_roles else None
            if best and not prospect.get("name"):
                updates["name"] = best["name"]
            if best and best.get("role") and not prospect.get("role"):
                updates["role"] = best["role"]

        # Clean up company name from website content
        company_name = signals.get("company_name", "")
        if company_name and _is_valid_company_name(company_name):
            updates["company"] = company_name

        update_prospect(prospect["id"], updates)

        results.append({"id": prospect["id"], "url": url, "signals": signals})
        researched += 1

    return {"researched": researched, "results": results}


# ── Contact extraction ──────────────────────────────────────────────


def _extract_contacts(all_html, all_text):
    """Extract contact names from about/team page HTML.

    Strategy (in priority order):
    1. Structured HTML: headings near role keywords
    2. JSON-LD structured data (founder, author, employee)
    3. Meta author tags
    4. Text pattern: "Name, Role" or "Name - Role"

    Returns:
        list of dict: [{"name": "Jane Smith", "role": "CEO", "source": "..."}, ...]
    """
    contacts = []
    seen_names = set()
    soup = BeautifulSoup(all_html, "html.parser")

    # Strategy 1: Team page structure (headings with name, nearby role keywords)
    for heading in soup.find_all(["h2", "h3", "h4", "strong"]):
        heading_text = heading.get_text(strip=True)
        if not heading_text or len(heading_text) > 60 or len(heading_text) < 4:
            continue
        # Check if nearby text contains a role keyword
        parent = heading.parent
        if parent:
            nearby_text = parent.get_text(separator=" ", strip=True).lower()
            for role_kw in ROLE_KEYWORDS:
                if role_kw in nearby_text:
                    if _looks_like_name(heading_text):
                        role = _extract_role_near(nearby_text, heading_text.lower())
                        name_key = heading_text.lower().strip()
                        if name_key not in seen_names:
                            seen_names.add(name_key)
                            contacts.append({
                                "name": _clean_name(heading_text),
                                "role": role,
                                "source": "html_heading",
                            })
                    break

    # Strategy 2: JSON-LD structured data
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            ld_data = json.loads(script.string or "")
            _extract_from_jsonld(ld_data, contacts, seen_names)
        except (json.JSONDecodeError, TypeError):
            pass

    # Strategy 3: Meta author tags
    author_meta = soup.find("meta", attrs={"name": "author"})
    if author_meta and author_meta.get("content"):
        author_name = author_meta["content"].strip()
        if _looks_like_name(author_name) and author_name.lower() not in seen_names:
            seen_names.add(author_name.lower())
            contacts.append({"name": _clean_name(author_name), "role": "", "source": "meta_author"})

    # Strategy 4: Text pattern matching — "Name, Role" or "Name - Role"
    for role_kw in ROLE_KEYWORDS:
        idx = 0
        text_lower = all_text.lower()
        while True:
            idx = text_lower.find(role_kw, idx)
            if idx == -1:
                break
            # Get context: 100 chars before the role keyword
            ctx_start = max(0, idx - 100)
            ctx = all_text[ctx_start:idx + len(role_kw) + 20]
            name_match = re.search(
                r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s*[-–,]\s*' + re.escape(role_kw),
                ctx, re.IGNORECASE
            )
            if name_match:
                candidate = name_match.group(1).strip()
                if _looks_like_name(candidate) and candidate.lower() not in seen_names:
                    seen_names.add(candidate.lower())
                    contacts.append({
                        "name": _clean_name(candidate),
                        "role": role_kw.title(),
                        "source": "text_pattern",
                    })
            idx += len(role_kw)

    return contacts[:5]  # Cap at 5 contacts per company


def _looks_like_name(text):
    """Check if text looks like a person's name (not a company or page title)."""
    words = text.split()
    if len(words) < 2 or len(words) > 4:
        return False
    if text.isupper():
        return False
    if any(w.lower() in NON_NAME_WORDS for w in words):
        return False
    # First word should start with uppercase
    if not words[0][0].isupper():
        return False
    # All words should be mostly alphabetic
    if not all(re.match(r"^[A-Za-z'\-\.]+$", w) for w in words):
        return False
    return True


def _clean_name(name):
    """Clean and normalize a person's name."""
    prefixes = ["mr.", "mrs.", "ms.", "dr.", "prof."]
    name_lower = name.lower()
    for prefix in prefixes:
        if name_lower.startswith(prefix):
            name = name[len(prefix):].strip()
    name = name.rstrip(".,;:-")
    return name.strip()


def _extract_role_near(nearby_text, name_lower):
    """Extract the most specific role keyword near a name."""
    priority_roles = [
        "co-founder", "founder", "ceo", "cmo", "coo", "cto", "cfo",
        "managing director", "head of marketing", "head of growth",
        "chief marketing", "chief executive", "vp marketing", "vp growth",
        "director", "president", "owner", "partner",
    ]
    for role in priority_roles:
        if role in nearby_text and role not in name_lower:
            return role.title()
    return ""


def _extract_from_jsonld(data, contacts, seen_names):
    """Extract names from JSON-LD structured data."""
    if isinstance(data, list):
        for item in data:
            _extract_from_jsonld(item, contacts, seen_names)
        return
    if not isinstance(data, dict):
        return

    for key in ["founder", "author", "employee", "member"]:
        val = data.get(key)
        if isinstance(val, dict) and val.get("name"):
            name = val["name"]
            if _looks_like_name(name) and name.lower() not in seen_names:
                seen_names.add(name.lower())
                contacts.append({
                    "name": _clean_name(name),
                    "role": val.get("jobTitle", key.title()),
                    "source": "jsonld",
                })
        elif isinstance(val, list):
            for item in val:
                if isinstance(item, dict) and item.get("name"):
                    name = item["name"]
                    if _looks_like_name(name) and name.lower() not in seen_names:
                        seen_names.add(name.lower())
                        contacts.append({
                            "name": _clean_name(name),
                            "role": item.get("jobTitle", key.title()),
                            "source": "jsonld",
                        })


# ── Company name extraction ─────────────────────────────────────────


def _extract_company_name(homepage_soup, url):
    """Derive the real company name from website content.

    Priority:
    1. og:site_name meta tag
    2. JSON-LD Organization/LocalBusiness name
    3. <title> tag cleaned of common suffixes
    4. Domain name capitalized as fallback
    """
    if not homepage_soup:
        return ""

    # 1. og:site_name (highest confidence)
    og_sitename = homepage_soup.find("meta", property="og:site_name")
    if og_sitename and og_sitename.get("content"):
        name = og_sitename["content"].strip()
        if 2 <= len(name) <= 80:
            return name

    # 2. JSON-LD Organization/LocalBusiness
    for script in homepage_soup.find_all("script", type="application/ld+json"):
        try:
            ld = json.loads(script.string or "")
            org_types = ("Organization", "LocalBusiness", "Corporation", "Brand")
            if isinstance(ld, dict) and ld.get("@type") in org_types:
                if ld.get("name"):
                    return ld["name"].strip()
            elif isinstance(ld, list):
                for item in ld:
                    if isinstance(item, dict) and item.get("@type") in org_types:
                        if item.get("name"):
                            return item["name"].strip()
        except (json.JSONDecodeError, TypeError):
            pass

    # 3. <title> tag — strip common suffixes
    title_tag = homepage_soup.find("title")
    if title_tag:
        title = title_tag.get_text(strip=True)
        cleaned = title.split(" - ")[0].split(" | ")[0].split(" :: ")[0].split(" – ")[0].strip()
        suffixes = ["Official Site", "Official Website", "Home", "Homepage",
                     "Welcome to", "Welcome"]
        for suffix in suffixes:
            if cleaned.lower().endswith(suffix.lower()):
                cleaned = cleaned[:-len(suffix)].rstrip(" -|")
            if cleaned.lower().startswith(suffix.lower()):
                cleaned = cleaned[len(suffix):].lstrip(" -|")
        cleaned = cleaned.strip()
        if 2 <= len(cleaned) <= 60:
            return cleaned

    # 4. Domain name fallback
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower().replace("www.", "")
        name_part = domain.split(".")[0]
        return name_part.capitalize()
    except Exception:
        return ""


def _is_valid_company_name(name):
    """Reject company names that look like DDG page titles or garbage."""
    if not name or len(name) < 2:
        return False
    # Too many words = probably a page title or article headline
    if len(name.split()) > 5:
        return False
    # Contains emoji or non-ASCII special chars
    if any(ord(c) > 127 for c in name) and not all(c.isalnum() or c.isspace() or c in "-&'.," for c in name):
        return False
    # Starts with #, number ranking, or list pattern
    if re.match(r'^[#\d]', name):
        return False
    # Contains URL fragments
    if any(x in name for x in ["›", "http", ".com", ".org", ".net", "www."]):
        return False
    # Contains review/rating patterns
    if re.search(r'reviews?\s*\(?\d', name, re.IGNORECASE):
        return False
    # Looks like a DDG title (common patterns)
    ddg_phrases = ["best ", "top ", "list of", "discover ", "how to", "#1 rated",
                   "guide to", "tips for", "ways to"]
    name_lower = name.lower()
    if any(name_lower.startswith(p) for p in ddg_phrases):
        return False
    return True


# ── Existing signal extraction ──────────────────────────────────────


def _extract_tech_stack(html):
    """Detect tech platforms from HTML source."""
    html_lower = html.lower()
    detected = []
    for tech, patterns in TECH_PATTERNS.items():
        if any(p in html_lower for p in patterns):
            detected.append(tech)
    return detected


def _extract_team_signals(text):
    """Estimate team size from page text."""
    text_lower = text.lower()

    # Look for explicit employee counts
    patterns = [
        r"(\d+)\+?\s*(?:employees|team members|people|staff)",
        r"team of\s*(\d+)",
        r"(\d+)\+?\s*(?:person|member)\s*team",
    ]
    for pattern in patterns:
        match = re.search(pattern, text_lower)
        if match:
            count = int(match.group(1))
            if count < 5:
                return "1-5"
            elif count < 20:
                return "5-20"
            elif count < 50:
                return "20-50"
            elif count < 100:
                return "50-100"
            elif count < 500:
                return "100-500"
            else:
                return "500+"

    return ""


def _extract_funding_signals(text):
    """Extract funding information from text."""
    text_lower = text.lower()

    patterns = [
        r"(?:raised|secured|closed)\s*\$[\d.]+\s*[mbk](?:illion)?",
        r"series\s*[a-e]\s*(?:funding|round)?",
        r"\$[\d.]+\s*[mb](?:illion)?\s*(?:in\s*)?(?:funding|raised|round)",
        r"(?:backed|funded|invested)\s*by\s*[\w\s,]+",
        r"seed\s*(?:round|funding|stage)",
    ]

    for pattern in patterns:
        match = re.search(pattern, text_lower)
        if match:
            # Get surrounding context
            start = max(0, match.start() - 20)
            end = min(len(text), match.end() + 30)
            return text[start:end].strip()

    return ""


def _extract_hiring_signals(text):
    """Find creative/media hiring signals."""
    text_lower = text.lower()
    found_roles = []
    for role in CREATIVE_ROLES:
        if role in text_lower:
            found_roles.append(role)
    return list(set(found_roles))


def _extract_content_signals(html, text):
    """Check for blog, newsletter, content marketing presence."""
    html_lower = html.lower()

    indicators = [
        "/blog" in html_lower,
        "newsletter" in html_lower,
        "subscribe" in html_lower and "email" in html_lower,
        'type="application/rss+xml"' in html_lower,
        "/podcast" in html_lower,
    ]
    return any(indicators)


def _is_dead_website(response, soup, text):
    """Check if the website appears dead or parked."""
    text_lower = text.lower()

    # Check dead indicators
    if any(indicator in text_lower for indicator in DEAD_INDICATORS):
        return True

    # Very short page (likely parking)
    if len(text.strip()) < 50:
        return True

    # Check title for parking indicators
    title = soup.find("title")
    if title:
        title_text = title.get_text().lower()
        if any(ind in title_text for ind in DEAD_INDICATORS):
            return True

    return False
