"""Optional Google Jobs provider. Used only when SERPAPI_API_KEY is configured."""
import os
import re
from datetime import datetime, timedelta, timezone
import requests

EMPTY = re.compile(r"hasn'?t returned any results|no results", re.I)


def relative_date(value):
    now = datetime.now(timezone.utc)
    if not value:
        return None
    text = str(value).lower()
    if text in ("today", "just posted", "just now", "yesterday"):
        return (now.replace(hour=0,minute=0,second=0,microsecond=0) - timedelta(days=1 if text == "yesterday" else 0)).isoformat() if text in ("today","yesterday") else now.isoformat()
    match = re.search(
        r"(\d+)\s+(minute|hour|day|week)s?\s+ago", str(value), re.I
    )
    if not match:
        return None
    return (
        now
        - timedelta(
            seconds=int(match[1])
            * {
                "minute": 60,
                "hour": 3600,
                "day": 86400,
                "week": 604800,
            }[match[2].lower()]
        )
    ).isoformat()


def posted_text(job):
    extensions = job.get("detected_extensions") or {}
    if extensions.get("posted_at"):
        return extensions.get("posted_at")
    for item in job.get("extensions") or []:
        if relative_date(item):
            return item
    return None


def normalize_job(job):
    options = job.get("apply_options") or []
    url = next(
        (
            o.get("link")
            for o in options
            if str(o.get("link", "")).startswith("https://")
        ),
        None,
    )
    url = url or job.get("share_link")
    extensions = job.get("detected_extensions") or {}
    return {
        "site": "google",
        "title": job.get("title"),
        "company": job.get("company_name"),
        "location": job.get("location"),
        "description": job.get("description"),
        "job_url": url,
        "date_posted": relative_date(posted_text(job)),
        "posted_text": posted_text(job),
        "datePrecision": "minute" if re.search(r"minute|just", posted_text(job) or "", re.I) else "hour" if re.search(r"hour", posted_text(job) or "", re.I) else "day",
        "salary_text": extensions.get("salary"),
        "provider": "serpapi",
    }


def search_google(role, location):
    key = os.environ["SERPAPI_API_KEY"].strip().strip('"').strip("'")
    params = {
        "engine": "google_jobs",
        "q": f"{role} jobs in {location} posted in the last 24 hours",
        "location": location,
        "gl": "in",
        "hl": "en",
        "api_key": key,
    }
    rows = []
    # A maximum of 3 API calls per role/location; each may consume provider credits.
    for _ in range(3):
        try:
            response = requests.get(
                "https://serpapi.com/search.json", params=params, timeout=30
            )
        except requests.RequestException as e:
            # Never include the request URL: it contains the API key.
            if rows:
                break
            raise ValueError(
                f"Google Jobs API network request failed ({type(e).__name__})."
            ) from None
        try:
            data = response.json()
        except ValueError:
            data = {}
        if not response.ok:
            if rows:
                break
            raise ValueError(
                f"Google Jobs API returned HTTP {response.status_code}. Check your provider account/quota."
            )
        if data.get("error"):
            # Page 2+ often returns this even when page 1 had jobs. Keep what we have.
            if rows or EMPTY.search(str(data["error"])):
                break
            raise ValueError(
                "Google Jobs API reported an error. Check your API key, query, and remaining quota."
            )
        rows.extend(normalize_job(job) for job in data.get("jobs_results", []))
        token = data.get("serpapi_pagination", {}).get("next_page_token")
        if not token or len(rows) >= 25:
            break
        params["next_page_token"] = token
    return {"jobs": rows[:25]}
