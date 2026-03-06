"""Sales Navigator CSV Importer — parse, dedupe, and load into pipeline.

Sales Navigator CSV exports contain these columns (may vary by export type):
  - First Name, Last Name
  - Company, Company Name for Leads
  - Title
  - LinkedIn URL, Person Linkedin Url
  - Company Linkedin Url
  - Geography, Location
  - Industry
  - Company Size, Company Headcount
  - Email (if available — usually empty in Sales Nav exports)

The importer:
  1. Reads the CSV and maps columns to prospect schema
  2. Deduplicates against existing pipeline (by LinkedIn URL or name+company)
  3. Adds prospects at 'discovered' stage (no email yet)
  4. Returns a summary for enrichment/scoring/drafting
"""

import csv
import logging
import re
from pathlib import Path

from modules.pipeline import load_pipeline, add_prospect, search_prospects

log = logging.getLogger("csv_importer")

# Sales Navigator CSV column name variations (lowercase for matching)
COLUMN_MAP = {
    # First name
    "first name": "first_name",
    "first_name": "first_name",
    "firstname": "first_name",
    # Last name
    "last name": "last_name",
    "last_name": "last_name",
    "lastname": "last_name",
    # Company
    "company": "company",
    "company name": "company",
    "company name for leads": "company",
    "account name": "company",
    # Title / role
    "title": "role",
    "job title": "role",
    "role": "role",
    "position": "role",
    # LinkedIn URL
    "linkedin url": "linkedin_url",
    "person linkedin url": "linkedin_url",
    "linkedin": "linkedin_url",
    "profile url": "linkedin_url",
    "linkedin profile": "linkedin_url",
    # Company URL
    "company linkedin url": "company_linkedin_url",
    "website": "company_url",
    "company website": "company_url",
    "company url": "company_url",
    # Email
    "email": "email",
    "email address": "email",
    # Geography
    "geography": "geography",
    "location": "geography",
    "city": "geography",
    # Industry
    "industry": "industry",
    # Company size
    "company size": "company_size",
    "company headcount": "company_size",
    "employees": "company_size",
    "# employees": "company_size",
    "number of employees": "company_size",
}

# Company type inference from industry keywords
INDUSTRY_TYPE_MAP = {
    "agency": "agency",
    "advertising": "agency",
    "marketing": "agency",
    "media": "agency",
    "e-commerce": "ecommerce",
    "ecommerce": "ecommerce",
    "retail": "ecommerce",
    "consumer goods": "ecommerce",
    "cosmetics": "ecommerce",
    "health": "ecommerce",
    "wellness": "ecommerce",
    "food": "ecommerce",
    "fashion": "ecommerce",
    "apparel": "ecommerce",
    "beauty": "ecommerce",
    "supplements": "ecommerce",
    "software": "saas",
    "saas": "saas",
    "technology": "saas",
    "internet": "saas",
    "information technology": "saas",
}


def import_sales_nav_csv(csv_path, campaign="sales-nav", source="sales_navigator",
                         buckets=None, score_default=5):
    """Import a Sales Navigator CSV export into the pipeline.

    Args:
        csv_path: Path to the CSV file
        campaign: Campaign tag for imported prospects
        source: Source tag (default: sales_navigator)
        buckets: Prospect bucket tags (default: based on role inference)
        score_default: Default fit score for imports (default: 5)

    Returns:
        dict with import summary
    """
    csv_path = Path(csv_path)
    if not csv_path.exists():
        return {"status": "error", "message": f"File not found: {csv_path}"}

    # Read CSV
    rows = _read_csv(csv_path)
    if not rows:
        return {"status": "error", "message": "No data rows found in CSV"}

    log.info(f"Read {len(rows)} rows from {csv_path.name}")

    # Load existing pipeline for dedup
    existing = load_pipeline()
    existing_linkedin = set()
    existing_name_company = set()
    for p in existing["prospects"]:
        li = p.get("linkedin_url", "").strip().lower()
        if li:
            existing_linkedin.add(_normalize_linkedin(li))
        name_co = f"{p.get('name', '').lower()}|{p.get('company', '').lower()}"
        existing_name_company.add(name_co)

    added = 0
    skipped_dupe = 0
    skipped_invalid = 0
    errors = []

    for i, row in enumerate(rows):
        try:
            prospect = _map_row_to_prospect(row, campaign, source, buckets, score_default)
            if not prospect:
                skipped_invalid += 1
                continue

            # Dedup check: LinkedIn URL
            li = _normalize_linkedin(prospect.get("linkedin_url", ""))
            if li and li in existing_linkedin:
                skipped_dupe += 1
                continue

            # Dedup check: name + company
            name_co = f"{prospect['name'].lower()}|{prospect['company'].lower()}"
            if name_co in existing_name_company:
                skipped_dupe += 1
                continue

            # Add to pipeline
            result = add_prospect(prospect)
            added += 1

            # Track for dedup within this batch
            if li:
                existing_linkedin.add(li)
            existing_name_company.add(name_co)

        except Exception as e:
            errors.append({"row": i + 1, "error": str(e)})

    summary = {
        "status": "imported",
        "file": csv_path.name,
        "total_rows": len(rows),
        "added": added,
        "skipped_duplicate": skipped_dupe,
        "skipped_invalid": skipped_invalid,
        "errors": len(errors),
        "error_details": errors[:10],  # Cap error output
        "campaign": campaign,
        "source": source,
        "next_steps": [
            f"python3 cli.py enrich batch --stage discovered",
            f"python3 cli.py score batch --stage discovered",
            f"python3 cli.py draft batch --stage researched --score-min 8",
        ],
    }

    log.info(
        f"Import complete: {added} added, {skipped_dupe} dupes, "
        f"{skipped_invalid} invalid, {len(errors)} errors"
    )
    return summary


def _read_csv(csv_path):
    """Read CSV file with auto-detected encoding and delimiter."""
    # Try UTF-8 first, fall back to latin-1
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            with open(csv_path, "r", encoding=encoding) as f:
                # Sniff delimiter
                sample = f.read(4096)
                f.seek(0)
                sniffer = csv.Sniffer()
                try:
                    dialect = sniffer.sniff(sample)
                except csv.Error:
                    dialect = csv.excel  # Default to comma

                reader = csv.DictReader(f, dialect=dialect)
                rows = list(reader)
                if rows:
                    return rows
        except (UnicodeDecodeError, UnicodeError):
            continue
    return []


def _map_row_to_prospect(row, campaign, source, buckets, score_default):
    """Map a CSV row dict to a prospect dict.

    Returns None if the row is invalid (no name or company).
    """
    # Normalize column names to our schema
    mapped = {}
    for col, value in row.items():
        if col is None or value is None:
            continue
        key = COLUMN_MAP.get(col.strip().lower())
        if key:
            mapped[key] = value.strip()

    # Build full name
    first = mapped.get("first_name", "").strip()
    last = mapped.get("last_name", "").strip()
    name = f"{first} {last}".strip()

    # Require at minimum: name and company
    company = mapped.get("company", "").strip()
    if not name or not company:
        return None

    # Skip if name looks like garbage (< 2 chars or all digits)
    if len(name) < 2 or name.replace(" ", "").isdigit():
        return None

    # Infer company type from industry
    industry = mapped.get("industry", "").lower()
    company_type = ""
    for keyword, ctype in INDUSTRY_TYPE_MAP.items():
        if keyword in industry:
            company_type = ctype
            break

    # Infer prospect bucket from role
    role = mapped.get("role", "")
    inferred_buckets = buckets or _infer_buckets(role, company_type)

    # Build LinkedIn URL (ensure full URL)
    linkedin_url = mapped.get("linkedin_url", "")
    if linkedin_url and not linkedin_url.startswith("http"):
        linkedin_url = f"https://www.linkedin.com{linkedin_url}" if linkedin_url.startswith("/") else f"https://www.linkedin.com/in/{linkedin_url}"

    # Determine initial stage
    email = mapped.get("email", "").strip()
    stage = "researched" if email else "discovered"

    return {
        "name": name,
        "email": email,
        "company": company,
        "role": role,
        "company_url": mapped.get("company_url", ""),
        "linkedin_url": linkedin_url,
        "company_type": company_type,
        "fit_score": score_default,
        "campaign": campaign,
        "stage": stage,
        "source": source,
        "prospect_buckets": inferred_buckets,
        "estimated_ad_spend": "unknown",
        "personalization_hooks": _build_hooks(mapped),
        "pain_signals": [],
        "tags": [source],
        "notes": f"Imported from Sales Navigator. Industry: {mapped.get('industry', 'N/A')}. "
                 f"Location: {mapped.get('geography', 'N/A')}. "
                 f"Company size: {mapped.get('company_size', 'N/A')}.",
    }


def _infer_buckets(role, company_type):
    """Infer prospect bucket from role and company type."""
    role_lower = role.lower()
    buckets = []

    if company_type == "agency":
        buckets.append("enterprise_partner")
    elif company_type in ("ecommerce", "saas"):
        buckets.append("convertra_saas")

    if any(kw in role_lower for kw in ("founder", "ceo", "owner", "co-founder")):
        buckets.append("decision_maker")
    elif any(kw in role_lower for kw in ("cmo", "vp marketing", "head of marketing", "marketing director")):
        buckets.append("marketing_leader")
    elif any(kw in role_lower for kw in ("media buyer", "growth", "performance", "paid")):
        buckets.append("media_buyer")

    return buckets or ["convertra_saas"]


def _build_hooks(mapped):
    """Build personalization hooks from available CSV data."""
    hooks = []
    industry = mapped.get("industry", "")
    if industry:
        hooks.append(f"Industry: {industry}")
    size = mapped.get("company_size", "")
    if size:
        hooks.append(f"Company size: {size}")
    geo = mapped.get("geography", "")
    if geo:
        hooks.append(f"Based in {geo}")
    return hooks


def _normalize_linkedin(url):
    """Normalize LinkedIn URL for dedup comparison."""
    if not url:
        return ""
    url = url.lower().strip().rstrip("/")
    # Strip query params
    url = url.split("?")[0]
    # Remove trailing /detail/recent-activity etc.
    match = re.search(r"linkedin\.com/in/([^/]+)", url)
    if match:
        return match.group(1)
    return url
