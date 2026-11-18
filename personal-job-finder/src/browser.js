import { chromium } from "playwright";
import path from "node:path";
import { isPortalUrl, postingDate } from "./portals.js";
import { extractPage } from "./page-extract.js";

export function naukriRows(data) {
  if (!Array.isArray(data.jobDetails)) return [];
  return data.jobDetails.map((job) => {
    const value = (type) =>
      job.placeholders?.find((p) => p.type === type)?.label || "";
    const created = Number(job.createdDate);
    const date =
      postingDate(job.footerPlaceholderLabel) ||
      (Number.isFinite(created) && created > 1e11
        ? new Date(created).toISOString()
        : postingDate(job.createdDate));
    return {
      title: job.title,
      company: job.companyName,
      location: value("location"),
      description: String(job.jobDescription || "").replace(/<[^>]*>/g, " "),
      skills: job.tagsAndSkills,
      datePrecision: /minute/i.test(job.footerPlaceholderLabel || "")
        ? "minute"
        : /hour/i.test(job.footerPlaceholderLabel || "")
          ? "hour"
          : "day",
      experience_range: job.experienceText || value("experience"),
      salary_text: value("salary"),
      date,
      job_url: job.jdURL
        ? new URL(job.jdURL, "https://www.naukri.com").href
        : null,
    };
  });
}

// A dedicated profile stores portal sessions locally. Requests remain in this browser.
export class ManualBrowser {
  constructor(root) {
    this.root = root;
    this.context = null;
    this.page = null;
    this.source = null;
    this.busy = false;
    this.captured = [];
    this.role = null;
    this.location = null;
  }
  async open(portal) {
    if (this.busy) throw Error("The browser is busy. Please wait.");
    this.busy = true;
    try {
      if (!isPortalUrl(portal.url, portal.id))
        throw Error("Unsupported portal URL");
      if (!this.context) {
        this.context = await chromium.launchPersistentContext(
          path.join(this.root, ".browser-profile"),
          {
            headless: false,
            channel: process.env.BROWSER_CHANNEL || "chrome",
            viewport: null,
          },
        );
        this.context.on("close", () => {
          this.context = null;
          this.page = null;
          this.source = null;
        });
      }
      this.page = await this.context.newPage();
      this.source = portal.id;
      this.role = portal.role;
      this.location = portal.location;
      this.captured = [];
      const capture = this.captured;
      this.page.on("response", async (response) => {
        if (
          portal.id !== "naukri" ||
          !isPortalUrl(response.url(), "naukri") ||
          !response.url().includes("/jobapi/") ||
          response.status() !== 200
        )
          return;
        try {
          capture.push(...naukriRows(await response.json()));
        } catch {}
      });
      await this.page
        .goto(portal.url, { waitUntil: "domcontentloaded", timeout: 45000 })
        .catch(() => {});
      await this.page.bringToFront();
    } finally {
      this.busy = false;
    }
  }
  async collect() {
    if (this.busy) throw Error("The browser is busy. Please wait.");
    if (!this.page || this.page.isClosed())
      throw Error("Open the portal browser first.");
    this.busy = true;
    try {
      // Read the most recently opened matching portal tab (job details may open a new tab).
      const pages =
        this.context
          ?.pages()
          .filter((p) => !p.isClosed() && isPortalUrl(p.url(), this.source)) ||
        [];
      const page = pages.at(-1) || this.page;
      if (!isPortalUrl(page.url(), this.source))
        throw Error(
          "Return to the selected portal’s job results or detail page.",
        );
      const result = await page.evaluate(extractPage, this.source);
      if (result.blocked)
        throw Error(
          result.accessDenied
            ? "This portal returned Access Denied, with no approval button. Try opening its home page and signing in normally in this same Chrome window. If it stays denied, we cannot import it until the portal allows access."
            : "The verification page is still showing. Complete the CAPTCHA in Chrome, then press Continue again.",
        );
      const rows = [...this.captured, ...result.rows]
        .filter((j) => j.title && /^https?:\/\//i.test(j.job_url || ""))
        .map((j) => ({
          ...j,
          site: this.source,
          date_posted: postingDate(j.date),
          datePrecision:
            j.datePrecision ||
            (/minute|just now/i.test(j.date || "")
              ? "minute"
              : /hour/i.test(j.date || "")
                ? "hour"
                : /^\d{4}-\d{2}-\d{2}T/.test(j.date || "")
                  ? "time"
                  : "day"),
          description: j.description || "",
          browserCollected: true,
          searchRoles: this.role ? [this.role] : [],
          searchLocations: this.location ? [this.location] : [],
        }));
      const unique = [...new Map(rows.map((j) => [j.job_url, j])).values()];
      const dated = unique.filter((j) => j.date_posted);
      if (!dated.length)
        throw Error(
          unique.length
            ? "Jobs were readable but had no posting dates. Open a job detail page and Continue; undated jobs cannot enter the latest-jobs feed."
            : "No readable jobs on this page. Open or scroll job results, then Continue. Google may need the optional Google Jobs API if its page layout cannot be read.",
        );
      return {
        rows: dated,
        undated: unique.length - dated.length,
        source: this.source,
      };
    } finally {
      this.busy = false;
    }
  }
}
