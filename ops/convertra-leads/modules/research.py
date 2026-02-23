"""Company website scraper — rule-based signal extraction."""

import re
from urllib.parse import urljoin

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

        update_prospect(prospect["id"], {
            "company_intel": intel,
            "stage": "researched",
        })

        results.append({"id": prospect["id"], "url": url, "signals": signals})
        researched += 1

    return {"researched": researched, "results": results}


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
