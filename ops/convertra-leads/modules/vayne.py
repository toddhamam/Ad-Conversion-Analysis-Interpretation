"""Vayne.io API integration — LinkedIn Sales Navigator scraping via API.

Eliminates the manual Sales Nav CSV export step. Vayne scrapes LinkedIn
profiles from Sales Navigator search URLs and returns structured CSVs.

Three capabilities:
  1. create_order() — submit a Sales Nav URL for automated scraping
  2. people_search() — find prospects by company + title + location
  3. check_health() — verify LinkedIn cookie is active

API docs: https://www.vayne.io/en/api-documentation
Rate limits: 3 req/5s burst, 20 req/min sustained. Up to 15K profiles/day.
"""

import csv
import io
import logging
import os
import time

import requests

log = logging.getLogger("vayne")

API_BASE = "https://www.vayne.io"
MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds


def _get_api_key():
    """Get Vayne API key from environment."""
    key = os.environ.get("VAYNE_API_KEY", "")
    if not key:
        raise RuntimeError("VAYNE_API_KEY not set. Add it to .env")
    return key


def _headers():
    return {
        "Authorization": f"Bearer {_get_api_key()}",
        "Content-Type": "application/json",
    }


def _api_get(path, params=None):
    """GET request to Vayne API with retry on rate limit."""
    for attempt in range(MAX_RETRIES):
        resp = requests.get(
            f"{API_BASE}/{path}", headers=_headers(), params=params, timeout=30
        )
        if resp.status_code == 429:
            retry_after = int(resp.headers.get("Retry-After", RETRY_DELAY))
            log.warning(f"Vayne rate limited, waiting {retry_after}s...")
            time.sleep(retry_after)
            continue
        if resp.status_code not in (200, 202):
            raise RuntimeError(f"Vayne API error ({resp.status_code}): {resp.text[:300]}")
        return resp.json(), resp.status_code
    raise RuntimeError("Vayne API: max retries exceeded (429)")


def _api_post(path, data=None):
    """POST request to Vayne API with retry on rate limit."""
    for attempt in range(MAX_RETRIES):
        resp = requests.post(
            f"{API_BASE}/{path}", headers=_headers(), json=data or {}, timeout=30
        )
        if resp.status_code == 429:
            retry_after = int(resp.headers.get("Retry-After", RETRY_DELAY))
            log.warning(f"Vayne rate limited, waiting {retry_after}s...")
            time.sleep(retry_after)
            continue
        if resp.status_code not in (200, 201, 202):
            raise RuntimeError(f"Vayne API error ({resp.status_code}): {resp.text[:300]}")
        return resp.json(), resp.status_code
    raise RuntimeError("Vayne API: max retries exceeded (429)")


# ─── Credits & Health ────────────────────────────────────────────────


def check_credits():
    """Get current credit balance and daily limits.

    Returns:
        dict with credit_available, daily_limit_leads, daily_limit_accounts,
              enrichment_credits
    """
    data, _ = _api_get("api/credits")
    return data


def check_health():
    """Check LinkedIn authentication status.

    Returns:
        dict with linkedin_authentication ("active"|"inactive"|"checking"),
              has_cookie (bool), credits (dict)
    """
    result = {}

    # LinkedIn cookie status
    try:
        data, _ = _api_get("api/linkedin_authentication")
        result["linkedin_authentication"] = data.get("linkedin_authentication", "unknown")
        result["has_cookie"] = data.get("has_cookie", False)
    except Exception as e:
        result["linkedin_authentication"] = "error"
        result["has_cookie"] = False
        result["error"] = str(e)

    # Credit balance
    try:
        result["credits"] = check_credits()
    except Exception as e:
        result["credits"] = {"error": str(e)}

    result["healthy"] = (
        result.get("linkedin_authentication") == "active"
        and result.get("has_cookie", False)
    )

    return result


def update_cookie(linkedin_cookie):
    """Update the LinkedIn session cookie (LI_AT token).

    Args:
        linkedin_cookie: The li_at cookie value (alphanumeric + hyphens + underscores)

    Returns:
        dict with status message
    """
    from modules.pipeline import load_pipeline  # noqa: F401 — validate import

    resp = requests.patch(
        f"{API_BASE}/api/linkedin_authentication",
        headers=_headers(),
        json={"linkedin_cookie": linkedin_cookie},
        timeout=30,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Failed to update cookie: {resp.text[:300]}")
    return resp.json()


# ─── URL Validation ──────────────────────────────────────────────────


def validate_url(sales_nav_url):
    """Validate a Sales Navigator URL and get lead count (no credits consumed).

    Args:
        sales_nav_url: LinkedIn Sales Navigator search URL

    Returns:
        dict with total (int) and type ("leads" | "accounts")
    """
    data, _ = _api_post("api/url_checks", {"url": sales_nav_url})
    return data


# ─── Orders ──────────────────────────────────────────────────────────


def create_order(sales_nav_url, name=None, limit=None, webhook_url=None):
    """Create a scraping order from a Sales Navigator search URL.

    This is the main automation entry point — replaces manual CSV export.
    The order runs asynchronously; poll with get_order() or use a webhook.

    Args:
        sales_nav_url: LinkedIn Sales Navigator search URL
        name: Order name (auto-generated if None)
        limit: Max profiles to scrape (None = all)
        webhook_url: Optional webhook URL for completion notification
            (sends POST with event="order.completed", file_url=<csv>)

    Returns:
        dict with order details (id, url, name, total, scraping_status)
    """
    payload = {"url": sales_nav_url}
    if name:
        payload["name"] = name
    if limit is not None:
        payload["limit"] = limit
    # Don't use Vayne's enrichment — we use Apollo/Hunter
    payload["email_enrichment"] = False
    payload["export_format"] = "advanced"
    if webhook_url:
        payload["secondary_webhook"] = webhook_url

    data, _ = _api_post("api/orders", payload)
    order = data.get("order", data)

    log.info(
        f"Vayne order created: #{order.get('id')} — "
        f"{order.get('total', '?')} leads, status: {order.get('scraping_status')}"
    )
    return {
        "status": "created",
        "order_id": order.get("id"),
        "name": order.get("name", name),
        "total": order.get("total", 0),
        "limit": order.get("limit"),
        "scraping_status": order.get("scraping_status"),
    }


def list_orders():
    """List all non-expired orders (max 100, sorted by creation date).

    Returns:
        dict with count and orders list
    """
    data, _ = _api_get("api/orders")
    orders = data.get("orders", [])
    return {
        "count": len(orders),
        "orders": [
            {
                "id": o.get("id"),
                "name": o.get("name", ""),
                "type": o.get("order_type", ""),
                "status": o.get("scraping_status", ""),
                "limit": o.get("limit"),
                "scraped": o.get("scraped", 0),
                "created_at": o.get("created_at", ""),
            }
            for o in orders
        ],
    }


def get_order(order_id):
    """Get order details and status.

    Returns:
        dict with order details. Status 202 means still processing.
    """
    data, status_code = _api_get(f"api/orders/{order_id}")
    order = data.get("order", data)
    return {
        "order_id": order_id,
        "status": order.get("scraping_status", "unknown"),
        "processing": status_code == 202,
        "scraped": order.get("scraped", 0),
        "limit": order.get("limit"),
        "name": order.get("name", ""),
    }


def export_order(order_id):
    """Trigger export generation for a completed order.

    Returns:
        dict with export status and file_url when ready
    """
    data, status_code = _api_post(
        f"api/orders/{order_id}/export",
        {"export_format": "advanced"},
    )
    return {
        "order_id": order_id,
        "ready": status_code == 200,
        "processing": status_code == 202,
        "file_url": data.get("file_url"),
        "data": data,
    }


def wait_for_order(order_id, timeout=600, poll_interval=15):
    """Poll an order until it finishes or times out.

    Args:
        order_id: Vayne order ID
        timeout: Max seconds to wait (default: 10 minutes)
        poll_interval: Seconds between polls (default: 15)

    Returns:
        dict with final order status
    """
    start = time.time()
    while time.time() - start < timeout:
        status = get_order(order_id)
        scraping_status = status.get("status", "")

        if scraping_status == "finished":
            log.info(f"Vayne order #{order_id} finished ({status.get('scraped', 0)} scraped)")
            return status
        if scraping_status == "failed":
            log.error(f"Vayne order #{order_id} failed")
            return status

        elapsed = int(time.time() - start)
        log.info(
            f"  Order #{order_id}: {scraping_status} "
            f"({status.get('scraped', 0)} scraped, {elapsed}s elapsed)"
        )
        time.sleep(poll_interval)

    return {"order_id": order_id, "status": "timeout", "message": f"Timed out after {timeout}s"}


def download_order_csv(order_id):
    """Download the CSV export for a completed order.

    Returns the CSV content as a string, or triggers export and waits.
    """
    # Trigger export
    export = export_order(order_id)

    if export.get("processing"):
        # Wait for export to be ready (usually fast)
        log.info(f"  Export processing for order #{order_id}, waiting...")
        time.sleep(5)
        export = export_order(order_id)

    file_url = export.get("file_url")
    if not file_url:
        raise RuntimeError(
            f"No file_url in export response for order #{order_id}. "
            f"Order may still be processing."
        )

    # Download the CSV file
    resp = requests.get(file_url, timeout=60)
    if resp.status_code != 200:
        raise RuntimeError(f"Failed to download CSV: HTTP {resp.status_code}")

    return resp.text


# ─── People Search ───────────────────────────────────────────────────


def people_search(companies, job_titles, locations=None):
    """Search LinkedIn profiles by company + job title + location.

    Costs 100 scraping credits per request. Returns up to 25 profiles.
    Use for targeted account-based lookups, not bulk discovery.

    Args:
        companies: list of LinkedIn company URLs or IDs (comma-joined)
        job_titles: list of job titles (comma-joined)
        locations: optional list of locations (comma-joined)

    Returns:
        dict with total_results and profiles list
    """
    if isinstance(companies, list):
        companies = ",".join(companies)
    if isinstance(job_titles, list):
        job_titles = ",".join(job_titles)
    if isinstance(locations, list):
        locations = ",".join(locations)

    payload = {
        "companies": companies,
        "jobtitles": job_titles,
    }
    if locations:
        payload["locations"] = locations

    data, _ = _api_post("api/people_searches", payload)

    profiles = data.get("profiles", [])
    return {
        "total_results": data.get("total_results", len(profiles)),
        "profiles": [
            {
                "first_name": p.get("first_name", ""),
                "last_name": p.get("last_name", ""),
                "linkedin_url": p.get("linkedin_url", ""),
                "title": p.get("title", ""),
                "company_name": p.get("company_name", ""),
                "company_linkedin_url": p.get("company_linkedin_url", ""),
                "company_id": p.get("company_id", ""),
                "location": p.get("location", ""),
                "summary": p.get("summary", ""),
                "open_profile": p.get("open_profile", False),
                "premium": p.get("premium", False),
                "tenure": p.get("tenure_at_company"),
                "started_on": p.get("started_on"),
            }
            for p in profiles
        ],
    }


# ─── Pipeline integration ───────────────────────────────────────────


def import_order_to_pipeline(order_id, campaign=None, source="vayne"):
    """Download a completed Vayne order and import it into the pipeline.

    This is the end-to-end automation: Vayne scrape → CSV → pipeline import.
    Uses the existing csv_importer to deduplicate and map columns.

    Args:
        order_id: Vayne order ID
        campaign: Campaign tag (default: vayne-{order_id})
        source: Source tag (default: vayne)

    Returns:
        dict with import summary
    """
    from pathlib import Path
    from config import BASE_DIR

    if not campaign:
        campaign = f"vayne-{order_id}"

    # Step 1: Wait for order to finish (if still running)
    status = get_order(order_id)
    if status.get("status") != "finished":
        log.info(f"Order #{order_id} still {status.get('status')}, waiting...")
        status = wait_for_order(order_id)
        if status.get("status") != "finished":
            return {
                "status": "error",
                "message": f"Order #{order_id} did not finish: {status.get('status')}",
            }

    # Step 2: Download CSV
    log.info(f"Downloading Vayne order #{order_id}...")
    csv_content = download_order_csv(order_id)

    # Step 3: Save to imports directory
    imports_dir = BASE_DIR / "imports"
    imports_dir.mkdir(exist_ok=True)
    csv_path = imports_dir / f"vayne-{order_id}.csv"
    csv_path.write_text(csv_content, encoding="utf-8")
    log.info(f"  Saved to {csv_path}")

    # Step 4: Import via existing csv_importer
    from modules.csv_importer import import_sales_nav_csv
    result = import_sales_nav_csv(
        csv_path=csv_path,
        campaign=campaign,
        source=source,
    )
    result["vayne_order_id"] = order_id
    return result


def scrape_and_import(sales_nav_url, name=None, limit=None, campaign=None,
                      source="vayne", timeout=600):
    """Full automation: create order → wait → download → import to pipeline.

    This is the one-call replacement for the manual Sales Nav CSV export.

    Args:
        sales_nav_url: LinkedIn Sales Navigator search URL
        name: Order name
        limit: Max profiles to scrape
        campaign: Campaign tag
        source: Source tag
        timeout: Max seconds to wait for scraping

    Returns:
        dict with order details and import summary
    """
    # Step 1: Validate URL (free, no credits)
    log.info("Validating Sales Navigator URL...")
    url_check = validate_url(sales_nav_url)
    total = url_check.get("total", 0)
    url_type = url_check.get("type", "unknown")
    log.info(f"  URL valid: {total} {url_type} found")

    if total == 0:
        return {
            "status": "error",
            "message": "Sales Navigator URL returned 0 results",
            "url_check": url_check,
        }

    # Step 2: Create order
    log.info(f"Creating Vayne order ({limit or total} profiles)...")
    order = create_order(sales_nav_url, name=name, limit=limit)
    order_id = order.get("order_id")
    if not order_id:
        return {"status": "error", "message": "Failed to create order", "order": order}

    # Step 3: Wait for completion
    log.info(f"Waiting for order #{order_id} to complete...")
    final_status = wait_for_order(order_id, timeout=timeout)
    if final_status.get("status") != "finished":
        return {
            "status": "error",
            "message": f"Order did not finish: {final_status.get('status')}",
            "order": order,
            "final_status": final_status,
        }

    # Step 4: Import to pipeline
    log.info("Importing to pipeline...")
    import_result = import_order_to_pipeline(
        order_id=order_id, campaign=campaign, source=source
    )

    return {
        "status": "imported",
        "order": order,
        "url_check": url_check,
        "import": import_result,
    }


def people_search_to_pipeline(companies, job_titles, locations=None,
                               campaign=None, source="vayne_search"):
    """Search for people and add results directly to the pipeline.

    Costs 100 credits. Returns up to 25 profiles per call.
    Best for account-based lookups on hot-scored companies.

    Args:
        companies: LinkedIn company URLs or IDs
        job_titles: Job titles to search for
        locations: Optional locations filter
        campaign: Campaign tag
        source: Source tag

    Returns:
        dict with search results and pipeline additions
    """
    from modules.pipeline import add_prospect, load_pipeline

    if not campaign:
        campaign = f"vayne-search-{int(time.time())}"

    # Run search
    result = people_search(companies, job_titles, locations)
    profiles = result.get("profiles", [])

    if not profiles:
        return {
            "status": "no_results",
            "total_results": 0,
            "added": 0,
        }

    # Load pipeline for dedup
    existing = load_pipeline()
    existing_linkedin = set()
    for p in existing["prospects"]:
        li = p.get("linkedin_url", "").strip().lower().rstrip("/").split("?")[0]
        if li:
            existing_linkedin.add(li)

    added = 0
    skipped = 0
    for profile in profiles:
        linkedin_url = profile.get("linkedin_url", "")
        normalized = linkedin_url.strip().lower().rstrip("/").split("?")[0]

        if normalized in existing_linkedin:
            skipped += 1
            continue

        first = profile.get("first_name", "")
        last = profile.get("last_name", "")
        if not first or not last:
            skipped += 1
            continue

        prospect = {
            "name": f"{first} {last}",
            "company": profile.get("company_name", ""),
            "role": profile.get("title", ""),
            "linkedin_url": linkedin_url,
            "company_url": "",  # Not provided by people search
            "stage": "discovered",
            "source": source,
            "campaign": campaign,
            "fit_score": 5,
            "prospect_buckets": _infer_buckets_from_title(profile.get("title", "")),
            "personalization_hooks": [],
            "pain_signals": [],
            "tags": [source],
            "notes": (
                f"Vayne people search. "
                f"Location: {profile.get('location', 'N/A')}. "
                f"Tenure: {_format_tenure(profile.get('tenure'))}."
            ),
        }

        add_prospect(prospect)
        added += 1
        existing_linkedin.add(normalized)

    return {
        "status": "imported",
        "total_results": result.get("total_results", 0),
        "profiles_returned": len(profiles),
        "added": added,
        "skipped_duplicate": skipped,
        "campaign": campaign,
    }


# ─── Helpers ─────────────────────────────────────────────────────────


def _infer_buckets_from_title(title):
    """Infer prospect buckets from job title."""
    title_lower = title.lower()
    buckets = []
    if any(kw in title_lower for kw in ("founder", "ceo", "owner", "co-founder")):
        buckets.append("decision_maker")
    elif any(kw in title_lower for kw in ("cmo", "vp marketing", "head of marketing")):
        buckets.append("marketing_leader")
    elif any(kw in title_lower for kw in ("media buyer", "growth", "performance", "paid")):
        buckets.append("media_buyer")
    return buckets or ["convertra_saas"]


def _format_tenure(tenure):
    """Format tenure dict into readable string."""
    if not tenure:
        return "N/A"
    years = tenure.get("numYears", 0)
    months = tenure.get("numMonths", 0)
    parts = []
    if years:
        parts.append(f"{years}y")
    if months:
        parts.append(f"{months}m")
    return " ".join(parts) if parts else "N/A"
