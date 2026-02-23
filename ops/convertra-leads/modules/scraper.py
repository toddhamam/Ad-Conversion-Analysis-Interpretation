"""Meta Ad Library API client."""

import time

import requests

from config import GRAPH_API_BASE, get_meta_token


AD_LIBRARY_FIELDS = ",".join([
    "ad_creative_bodies",
    "ad_creative_link_titles",
    "ad_creative_link_descriptions",
    "ad_snapshot_url",
    "ad_delivery_start_time",
    "ad_delivery_stop_time",
    "page_name",
    "page_id",
    "publisher_platforms",
])


def search_ad_library(search_terms, country="GB", limit=25):
    """Search the Meta Ad Library for active ads."""
    token = get_meta_token()
    if not token:
        return {"results": [], "total": 0, "warning": "META_ACCESS_TOKEN not set in .env"}

    params = {
        "search_terms": search_terms,
        "ad_reached_countries": country,
        "ad_active_status": "ACTIVE",
        "ad_type": "ALL",
        "fields": AD_LIBRARY_FIELDS,
        "limit": min(limit, 50),  # API max per page
        "access_token": token,
    }

    all_ads = []
    pages_fetched = 0
    max_pages = 5

    url = f"{GRAPH_API_BASE}/ads_archive"

    while url and pages_fetched < max_pages and len(all_ads) < limit:
        data = _fetch_with_retry(url, params)
        if not data:
            break

        ads = data.get("data", [])
        for ad in ads:
            all_ads.append(parse_ad_result(ad))

        # Pagination
        paging = data.get("paging", {})
        next_url = paging.get("next")
        if next_url:
            url = next_url
            params = {}  # Next URL includes all params
        else:
            break

        pages_fetched += 1

    # Aggregate by page
    by_page = _aggregate_by_page(all_ads)

    return {
        "results": by_page[:limit],
        "total": len(by_page),
        "search_terms": search_terms,
        "country": country,
    }


def get_page_ads(page_id, country="GB", limit=50):
    """Fetch all ads for a specific page."""
    token = get_meta_token()
    if not token:
        return {"page_id": page_id, "active_ads": 0, "ads": [], "warning": "META_ACCESS_TOKEN not set"}

    params = {
        "search_page_ids": page_id,
        "ad_reached_countries": country,
        "ad_active_status": "ACTIVE",
        "ad_type": "ALL",
        "fields": AD_LIBRARY_FIELDS,
        "limit": min(limit, 50),
        "access_token": token,
    }

    url = f"{GRAPH_API_BASE}/ads_archive"
    all_ads = []
    pages_fetched = 0

    while url and pages_fetched < 5 and len(all_ads) < limit:
        data = _fetch_with_retry(url, params)
        if not data:
            break

        for ad in data.get("data", []):
            all_ads.append(parse_ad_result(ad))

        next_url = data.get("paging", {}).get("next")
        if next_url:
            url = next_url
            params = {}
        else:
            break

        pages_fetched += 1

    page_name = all_ads[0]["page_name"] if all_ads else ""

    return {
        "page_id": page_id,
        "page_name": page_name,
        "active_ads": len(all_ads),
        "ads": all_ads[:limit],
    }


def parse_ad_result(raw):
    """Extract structured data from a raw Ad Library result."""
    bodies = raw.get("ad_creative_bodies", [])
    titles = raw.get("ad_creative_link_titles", [])
    descriptions = raw.get("ad_creative_link_descriptions", [])

    return {
        "page_name": raw.get("page_name", ""),
        "page_id": raw.get("page_id", ""),
        "body": bodies[0] if bodies else "",
        "title": titles[0] if titles else "",
        "description": descriptions[0] if descriptions else "",
        "start_date": raw.get("ad_delivery_start_time", ""),
        "stop_date": raw.get("ad_delivery_stop_time"),
        "platforms": raw.get("publisher_platforms", []),
        "snapshot_url": raw.get("ad_snapshot_url", ""),
    }


def _fetch_with_retry(url, params, retries=2, backoff=2):
    """Fetch URL with retry on transient errors."""
    for attempt in range(retries + 1):
        try:
            resp = requests.get(url, params=params, timeout=15)

            if resp.status_code == 200:
                return resp.json()

            # Check for Meta error codes
            try:
                err = resp.json().get("error", {})
                code = err.get("code")
                if code == 1 and attempt < retries:
                    time.sleep(backoff * (attempt + 1))
                    continue
            except Exception:
                pass

            if resp.status_code >= 500 and attempt < retries:
                time.sleep(backoff * (attempt + 1))
                continue

            return None

        except requests.exceptions.Timeout:
            if attempt < retries:
                time.sleep(backoff * (attempt + 1))
                continue
            return None
        except Exception:
            return None

    return None


def _aggregate_by_page(ads):
    """Aggregate ads by page, counting total ads per advertiser."""
    pages = {}
    for ad in ads:
        pid = ad.get("page_id", "")
        if not pid:
            continue
        if pid not in pages:
            pages[pid] = {
                "page_name": ad["page_name"],
                "page_id": pid,
                "ad_count": 0,
                "platforms": set(),
                "sample_bodies": [],
                "earliest_start": ad.get("start_date", ""),
            }
        pages[pid]["ad_count"] += 1
        for p in ad.get("platforms", []):
            pages[pid]["platforms"].add(p)
        if len(pages[pid]["sample_bodies"]) < 3 and ad.get("body"):
            pages[pid]["sample_bodies"].append(ad["body"][:100])
        if ad.get("start_date") and ad["start_date"] < pages[pid]["earliest_start"]:
            pages[pid]["earliest_start"] = ad["start_date"]

    # Convert sets to lists for JSON
    result = []
    for page in pages.values():
        page["platforms"] = list(page["platforms"])
        result.append(page)

    # Sort by ad count descending
    result.sort(key=lambda p: p["ad_count"], reverse=True)
    return result
