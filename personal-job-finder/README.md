# My Job Finder

Your personal local job finder: resume → recent matching jobs → original application links.

This is the only project folder in the workspace. All app code and dependencies live here. The old apps were removed; previous application history was preserved privately in `data/archive/previous-applications.jsonl`.

## Run from Cursor

Open this folder in Cursor and run:

```sh
npm start
```

Visit **http://localhost:3211**. Dependencies are already installed on this computer.

Fresh setup: Node.js 22+, Python 3.10+ (3.12 recommended), and Google Chrome:

```sh
npm install
npm run setup
npm start
```

`npm run dev` restarts the server after code changes. `PORT` changes 3211; `JOB_PYTHON` selects a different Python executable. Windows: create `.venv` with `python -m venv .venv`, install `requirements.txt` with `.venv\Scripts\python`, and set `JOB_PYTHON` to that executable.

## Search and filters

1. Upload your PDF/DOCX/TXT resume, or paste text under the resume details. Review extracted text; scanned PDFs need OCR first.
2. Use a single role preset, **All three**, or enter 1–3 comma-separated roles. Presets are **software engineer**, **backend developer**, and **fullstack developer**.
3. Set **Location** to `India` or enter up to three cities, and enter your years of experience. These are visible fields. Location is sent to the portals; their location matching may be imperfect. Unknown experience stays unknown and does not exclude jobs based on experience.
4. Minimum salary defaults to **14 LPA**. Click **Find my jobs** to search all selected role/location combinations. Up to 25 results are requested per source and combination.
5. Use **Show search group** for all selected roles or one role's results. Use **Show portal** for one portal or all sources. Search groups refer to the query that returned a job, not a promise of exact title matching. Older cached jobs without query tags use a title fallback until the next search.
6. **Apply pay & experience to current results** updates those filters immediately without another crawl. Changing roles/location needs a new search.
7. Click a job's **Apply on…** link and apply on the original website yourself.

The feed keeps source-reported postings from the last 24 hours, excludes jobs whose recognized minimum experience exceeds yours, ranks recognized job skills against your resume, and combines duplicate company/title/location listings. Skill fit is a sorting aid, not a prediction of interviews. Descriptions, dates, and experience extraction may be incomplete or approximate. Undated jobs are excluded.

### Salary rule

- **Salary not mentioned:** keep the listing.
- **₹14 LPA or more:** keep it.
- **Below ₹14 LPA:** exclude it.
- **A range uses its lower bound:** ₹12–18 LPA is excluded; ₹14–18 LPA is kept.
- **Only an upper bound:** “up to ₹12 LPA” is excluded; “up to ₹18 LPA” stays but does not guarantee an offer above ₹14 LPA.
- Explicit INR monthly salaries are multiplied by 12. Standard LPA/lakh/crore yearly amounts are supported.
- Foreign currencies, hourly rates, or unclear amounts remain marked **check salary**; no exchange rate or annual-hours assumption is invented. Verify these manually. The parser cannot understand every free-text salary format.
- Set the minimum to `0` to disable the salary cutoff. A known low salary cannot be hidden by a duplicate copy that omits salary.

## Why Naukri and Google may be missing

The saved search logs showed Naukri returning **HTTP 406 / recaptcha required**, and Google returning **initial cursor not found**. A public-browser check on 17 September 2026 showed **Access Denied** on Naukri and an **unusual traffic** verification page on Google. These are source blocks/parser failures, not proof that there are no matching jobs.

Every source has a visible coverage card with fetched and eligible counts plus diagnostics. A source can also return jobs that are all excluded because they are too old, undated, over your experience, or below your pay minimum.

### Manual route

1. Under **Portal coverage & manual help**, click **Open browser / help** for Naukri or Google.
2. Choose a saved role and location, then **Open [portal]**.
3. In the separate Chrome window, sign in or complete verification yourself.
4. Return here and press **I’m done — Continue**. The app reads that same browser session and adds eligible jobs to the same feed.
5. Scroll or paginate in the portal, then reopen the helper and Continue again for more loaded results. Choose another role/location and open that search to gather those results too.

The app reads structured JobPosting data and known result-card layouts. For Naukri, it also reads job-search responses that the visible page itself receives, preserving salary, skills and dates. Google has best-effort rendered-card support. It does not send hidden requests, copy cookies to the background scraper, solve CAPTCHAs, or bypass access blocks.

**Access Denied is different from CAPTCHA:** sometimes there is no button for you to approve. Try visiting the portal home page and signing in normally in that same Chrome window. If access remains denied, this app cannot import it until the portal allows access. A solved CAPTCHA also does not guarantee that an unfamiliar page layout is parseable. Direct search links remain available.

The helper reads the latest opened tab for the selected portal. Return to the portal tab if you navigate to an employer site. Browser-imported jobs are retained across automatic refreshes for the same search and still expire after 24 hours. Profile changes clear the old feed.

### Optional Google Jobs API route

An optional [SerpApi Google Jobs API](https://serpapi.com/google-jobs-api) connection is implemented for Google. This is a third-party provider, not a Google-issued API. It avoids relying on the direct JobSpy page parser. You need your own provider account/key; quotas and charges may apply. No account was created or purchased for you.

1. Copy `.env.example` to `.env` in this folder.
2. Enter your own key locally after `SERPAPI_API_KEY=`. Do not paste it into chats or commit `.env`.
3. Restart `npm start` and run a search. The coverage section reports when the Google API is configured.

When a key is configured, Google searches use that provider instead of JobSpy, up to 3 API calls and 25 listings per role/location. All three roles in one location can consume up to 9 API calls per refresh. The hourly option is off by default. Only role/location search terms are sent; your resume is not sent to this provider. The adapter has offline tests but has not been live-tested with your API account. It does not unlock Naukri or promise exhaustive coverage.

## Portal coverage

| Source               | Support                                                                    |
| -------------------- | -------------------------------------------------------------------------- |
| LinkedIn, Indeed     | Automatic JobSpy search; visible browser fallback                          |
| Naukri               | Automatic attempt; manual session and page-response import when accessible |
| Google Jobs          | Automatic attempt; manual rendered-page import; optional SerpApi adapter   |
| foundit, Internshala | Search shortcuts, not automatically imported                               |
| Wellfound, Instahyre | Links to their own search pages                                            |

Direct shortcuts use the first saved role/location; automatic search covers every saved combination. No scraper can guarantee every listing from every portal. Source failures are shown explicitly; no sample jobs are inserted.

## Code structure

```text
personal-job-finder/
├── README.md
├── package.json / package-lock.json
├── requirements.txt / requirements.lock.txt
├── .env.example                 Optional provider configuration template
├── .gitignore
├── public/
│   ├── index.html               Resume, filters, cards and manual-help dialog
│   ├── style.css                Responsive styling
│   └── app.js                   Form, search groups, source views and actions
├── src/
│   ├── server.js                Local API, persistence and hourly scheduler
│   ├── profile.js               Resume suggestions and search settings
│   ├── matching.js              Freshness, experience, fit and deduplication
│   ├── salary.js                Salary parsing and minimum-pay rules
│   ├── portals.js               Search links and posting-date normalization
│   ├── browser.js               Visible Chrome and Naukri response import
│   ├── page-extract.js          Rendered-page/structured-data extraction
│   ├── worker.py                JobSpy searches and resume extraction
│   └── google_api.py            Optional third-party Google Jobs provider
├── tests/                       Matching, salary, providers and browser checks
├── data/                        Local resume, cache and archived history
├── .browser-profile/            Local portal sessions, created when needed
├── .venv/                       Python dependencies
└── node_modules/                JavaScript dependencies
```

The optional `.env`, local data, browser profile and dependencies are gitignored. Enter passwords only on the portal, never in this app. The server listens only on loopback and rejects cross-origin writes. Hourly searches require the server running and computer awake, and pause during manual help. Stop the app before deleting `data/` or `.browser-profile/` to erase saved information.

## Tests

```sh
npm test
.venv/bin/python tests/google_api_test.py
# With the app running and Chrome installed:
node tests/browser.mjs
```

Browser/provider fixtures verify role selection, views, salary rules, blocked-page handling and imports without solving a real CAPTCHA or using a paid API account.

## Freshness fixes

Every server start immediately searches using your saved profile, even when hourly refresh is off. Automatic results from the last run are cleared while that search runs; new source results appear as each source finishes. Hourly refresh remains optional. Configured provider calls on startup can consume provider quota.

All sources and manual imports are filtered to **less than 24 hours old**. Exactly 24 hours, 78 hours, future dates and unknown dates are excluded. LinkedIn now uses a dedicated newest-first public search (`sortBy=DD`, `f_TPR=r86400`) that preserves both recent and normal posting-time labels. Minute/hour values are approximate source-reported times; calendar-only dates are labeled **exact time unavailable**. “Newest first” is the default, puts known intraday times before coarse dates, and breaks equal-time ties by resume fit. A refresh discovers new postings; changing sort only reorders loaded results. This cannot guarantee that a board returns every posting published one minute ago.

Experience checks now recognize single values, numeric ranges, months, “Experience: 5 years,” and “5 years in Java.” They use the strongest explicit requirement found, including across duplicates. A 2–7-year range accepts someone with 3 years; 4–7 does not. Preferred/optional experience is not treated as mandatory. Unknown requirements remain labeled rather than guessed from seniority.

Additional source files: `src/linkedin.py` preserves LinkedIn time precision, `src/experience.js` parses numerical experience, and `public/time.js` handles honest age labels and sorting.
 

