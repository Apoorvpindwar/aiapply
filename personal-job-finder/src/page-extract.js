// Runs inside the visible portal page. It only reads rendered data; no bypass,
// credential transfer, or hidden requests are performed.
export function extractPage(source) {
  const text = document.body.innerText;
  const blocked =
    /verify you are human|unusual traffic|complete the captcha|security verification|confirm you are human|captcha required|access denied|you don't have permission to access/i.test(
      text,
    );
  const rows = [];
  const plain = (html) => {
    const box = document.createElement("div");
    box.innerHTML = html || "";
    return box.textContent;
  };
  const add = (value) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(add);
      return;
    }
    if ([value["@type"]].flat().includes("JobPosting")) {
      const loc = Array.isArray(value.jobLocation)
        ? value.jobLocation[0]
        : value.jobLocation;
      const salary = value.baseSalary,
        compensation = salary?.value;
      rows.push({
        title: value.title,
        company: value.hiringOrganization?.name || "",
        location: loc?.address?.addressLocality || "",
        description: plain(value.description),
        date: value.datePosted,
        job_url: value.url || location.href,
        currency: salary?.currency,
        min_amount:
          typeof compensation === "number"
            ? compensation
            : (compensation?.minValue ?? compensation?.value),
        max_amount: compensation?.maxValue,
        interval: compensation?.unitText,
      });
    }
    if (value["@graph"]) add(value["@graph"]);
    if (value.mainEntity) add(value.mainEntity);
    if (Array.isArray(value.itemListElement))
      value.itemListElement.forEach((item) => add(item.item || item));
  };
  document
    .querySelectorAll('script[type="application/ld+json"]')
    .forEach((el) => {
      try {
        add(JSON.parse(el.textContent));
      } catch {}
    });
  const adapters = {
    linkedin: {
      card: ".base-card, .job-search-card, .jobs-search-results__list-item",
      link: 'a.base-card__full-link, a.job-card-list__title--link, a[href*="/jobs/view/"]',
      title: ".base-search-card__title, .job-card-list__title",
      company: ".base-search-card__subtitle, .artdeco-entity-lockup__subtitle",
      place: ".job-search-card__location, .job-card-container__metadata-item",
    },
    naukri: {
      card: ".srp-jobtuple-wrapper, .jobTuple",
      link: 'a.title, a[href*="job-listings"]',
      title: "a.title",
      company: ".comp-name",
      place: ".locWdth, .loc",
      salary: ".sal-wrap, .sal",
      experience: ".exp-wrap, .exp",
    },
    indeed: {
      card: ".job_seen_beacon",
      link: "a.jcs-JobTitle",
      title: ".jobTitle",
      company: '[data-testid="company-name"]',
      place: '[data-testid="text-location"]',
      salary:
        '.salary-snippet-container, [data-testid="attribute_snippet_testid"]',
    },
  };
  const adapter = adapters[source];
  if (adapter)
    for (const card of document.querySelectorAll(adapter.card)) {
      const link = card.querySelector(adapter.link);
      if (!link) continue;
      rows.push({
        title: (
          card.querySelector(adapter.title)?.textContent || link.textContent
        ).trim(),
        company: card.querySelector(adapter.company)?.textContent?.trim() || "",
        location: card.querySelector(adapter.place)?.textContent?.trim() || "",
        description: card.innerText,
        date:
          (/\b(?:minute|hour|day|week|just now|today|yesterday)/i.test(
            card.querySelector("time")?.textContent || "",
          )
            ? card.querySelector("time").textContent
            : card.querySelector("time")?.getAttribute("datetime")) ||
          card.innerText,
        job_url: link.href,
        salary_text: adapter.salary
          ? card.querySelector(adapter.salary)?.textContent
          : "",
        experience_range: adapter.experience
          ? card.querySelector(adapter.experience)?.textContent
          : "",
      });
    }
  if (source === "google") {
    // Google changes layouts regularly. Require an actual job/apply link and a
    // heading, rather than treating every ordinary search result as a job.
    const cards = document.querySelectorAll(
      '[data-encoded-docid], [data-job-id], .gws-plugins-horizon-jobs__li-ed, [role="dialog"]',
    );
    for (const card of cards) {
      const heading = card.querySelector('h2, h3, [role="heading"]');
      const links = [...card.querySelectorAll("a[href]")];
      const link =
        links.find(
          (a) => /apply/i.test(a.innerText) && /^https:\/\//.test(a.href),
        ) ||
        links.find((a) =>
          /htidocid=|\/jobs\/view\/|\/job-listings|\/viewjob\?/.test(a.href),
        );
      if (!heading || !link) continue;
      const lines = card.innerText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      rows.push({
        title: heading.innerText,
        company:
          card.querySelector(".vNEEBe, .nJlQNd, [data-company]")?.textContent ||
          "",
        location:
          card.querySelector(".Qk80Jf, [data-location]")?.textContent || "",
        description: card.innerText,
        date: lines.find((s) =>
          /\b(?:\d+\s+(?:minute|hour|day|week)s?\s+ago|today|yesterday)\b/i.test(
            s,
          ),
        ),
        job_url: link.href,
      });
    }
  }
  return {
    blocked,
    rows,
    accessDenied: /access denied|you don't have permission to access/i.test(
      text,
    ),
  };
}
