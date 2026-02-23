"""Email pattern generation + DNS MX verification + web search."""

import re

from modules.pipeline import load_pipeline, update_prospect

# Generic email addresses to reject
GENERIC_PREFIXES = {"noreply", "info", "hello", "support", "admin", "sales", "contact", "team", "help", "no-reply"}


def find_email(full_name, domain):
    """Find email for a person at a domain.

    Generates candidates, verifies domain MX, optionally searches web.
    """
    parts = full_name.strip().split()
    if len(parts) < 2:
        first_name = parts[0].lower() if parts else ""
        last_name = ""
    else:
        first_name = parts[0].lower()
        last_name = parts[-1].lower()

    candidates = _generate_candidates(first_name, last_name, domain)
    mx_valid, mx_records = _verify_mx(domain)

    if not mx_valid:
        return {
            "candidates": candidates,
            "best_match": None,
            "mx_valid": False,
            "mx_records": [],
            "method": "mx_failed",
            "message": f"Domain {domain} has no MX records — may not accept email",
        }

    # Try web search for actual email
    web_results = _search_email_web(full_name, domain)
    if web_results:
        return {
            "candidates": candidates,
            "best_match": web_results[0],
            "mx_valid": True,
            "mx_records": mx_records,
            "method": "web_search",
            "web_results": web_results,
        }

    # Fall back to best pattern guess
    best = candidates[0] if candidates else f"{first_name}@{domain}"
    return {
        "candidates": candidates,
        "best_match": best,
        "mx_valid": True,
        "mx_records": mx_records,
        "method": "pattern_guess",
    }


def verify_email(address):
    """Verify a specific email address (domain MX check)."""
    if not address or "@" not in address:
        return {"email": address, "mx_valid": False, "mx_records": [], "error": "Invalid email format"}

    domain = address.split("@")[1]
    mx_valid, mx_records = _verify_mx(domain)

    prefix = address.split("@")[0].lower()
    is_generic = prefix in GENERIC_PREFIXES

    return {
        "email": address,
        "mx_valid": mx_valid,
        "mx_records": mx_records,
        "is_generic": is_generic,
        "warning": "This is a generic/team address, not a personal email" if is_generic else None,
    }


def batch_find_emails(stage="researched", score_min=None):
    """Find emails for pipeline prospects without verified email."""
    data = load_pipeline()
    processed = 0
    found = 0
    not_found = 0
    results = []

    for prospect in data["prospects"]:
        if prospect.get("stage") != stage:
            continue
        if score_min is not None and prospect.get("fit_score", 0) < score_min:
            continue
        # Skip if already has a verified email
        if prospect.get("email") and prospect.get("email_verified"):
            continue

        name = prospect.get("name", "")
        url = prospect.get("company_url", "")
        domain = _domain_from_url(url)

        if not name or not domain:
            results.append({"id": prospect["id"], "status": "skipped", "message": "Missing name or company_url"})
            continue

        processed += 1
        result = find_email(name, domain)

        if result.get("best_match") and result.get("mx_valid"):
            update_prospect(prospect["id"], {
                "email": result["best_match"],
                "email_source": result["method"],
                "email_verified": result["method"] == "web_search",
            })
            found += 1
            results.append({"id": prospect["id"], "email": result["best_match"], "method": result["method"]})
        else:
            not_found += 1
            results.append({"id": prospect["id"], "status": "not_found", "reason": result.get("message", "No valid email found")})

    return {"processed": processed, "found": found, "not_found": not_found, "results": results}


def search_email_web(name, company):
    """Search DuckDuckGo for email patterns. Public function for CLI."""
    emails = _search_email_web(name, company)
    return {"name": name, "company": company, "emails_found": emails}


def _generate_candidates(first_name, last_name, domain):
    """Generate common email patterns in priority order."""
    if not first_name:
        return []

    candidates = [f"{first_name}@{domain}"]

    if last_name:
        candidates.extend([
            f"{first_name}.{last_name}@{domain}",
            f"{first_name[0]}{last_name}@{domain}",
            f"{first_name[0]}.{last_name}@{domain}",
            f"{first_name}{last_name}@{domain}",
            f"{last_name}@{domain}",
        ])

    # Filter out generic patterns
    return [c for c in candidates if c.split("@")[0].lower() not in GENERIC_PREFIXES]


def _verify_mx(domain):
    """Verify domain has MX records using dnspython."""
    try:
        import dns.resolver
        answers = dns.resolver.resolve(domain, "MX")
        records = [str(r.exchange).rstrip(".") for r in answers]
        return True, records
    except ImportError:
        # Fallback: try socket
        try:
            import socket
            socket.getaddrinfo(f"mail.{domain}", 25)
            return True, [f"mail.{domain} (socket fallback)"]
        except Exception:
            return False, []
    except Exception:
        return False, []


def _search_email_web(name, domain_or_company):
    """Search DuckDuckGo for email addresses."""
    try:
        from ddgs import DDGS
    except ImportError:
        return []

    queries = [
        f'"{name}" "{domain_or_company}" email',
        f'"{name}" "@{domain_or_company}"',
    ]

    found_emails = set()
    email_pattern = re.compile(r'[\w.+-]+@[\w-]+\.[\w.-]+')

    try:
        with DDGS() as ddgs:
            for query in queries:
                results = list(ddgs.text(query, max_results=5))
                for r in results:
                    text = f"{r.get('title', '')} {r.get('body', '')}"
                    emails = email_pattern.findall(text)
                    for em in emails:
                        prefix = em.split("@")[0].lower()
                        if prefix not in GENERIC_PREFIXES and not em.endswith((".png", ".jpg", ".gif")):
                            found_emails.add(em.lower())
    except Exception:
        pass

    return list(found_emails)


def _domain_from_url(url):
    """Extract domain from a URL."""
    if not url:
        return ""
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url if url.startswith("http") else f"https://{url}")
        domain = parsed.netloc.lower()
        if domain.startswith("www."):
            domain = domain[4:]
        return domain
    except Exception:
        return ""


def _is_generic_email(email_addr):
    """Check if email is a generic/team address."""
    prefix = email_addr.split("@")[0].lower()
    return prefix in GENERIC_PREFIXES
