import { chromium } from "playwright";
import assert from "node:assert/strict";
import { ManualBrowser } from "../src/browser.js";
const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  const page = await browser.newPage({
    viewport: { width: 1360, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:3211");
  await page.locator("#file").setInputFiles({
    name: "test-resume.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "Bengaluru\nFrontend Developer with React, JavaScript and Node.js experience.",
    ),
  });
  await page
    .getByText("Resume ready. Click Find my jobs.", { exact: true })
    .waitFor();
  assert.match(await page.locator("#roles").inputValue(), /frontend developer/);
  assert.equal(await page.locator("#experience").inputValue(), "");
  await page.locator("#all-roles").click();
  assert.equal(
    await page.locator("#roles").inputValue(),
    "software engineer, backend developer, fullstack developer",
  );
  await page.locator('[data-preset="backend developer"]').click();
  assert.equal(await page.locator("#roles").inputValue(), "backend developer");
  assert.equal(await page.locator("#minimum-lpa").inputValue(), "14");
  await page.screenshot({
    path: "/tmp/personal-job-finder-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: "/tmp/personal-job-finder-mobile.png",
    fullPage: true,
  });
  const rejection = await page.request.post(
    "http://localhost:3211/api/browser/open",
    {
      headers: { Origin: "https://untrusted.example" },
      data: { source: "linkedin" },
    },
  );
  assert.equal(rejection.status(), 403);
  const fixture = {
    profile: null,
    run: { running: false },
    manual: { status: "idle" },
    sources: [
      {
        source: "linkedin",
        count: 0,
        status: "warning",
        errors: [],
        warnings: ["Test challenge"],
      },
    ],
    portals: [
      {
        id: "linkedin",
        name: "LinkedIn",
        mode: "automatic + browser",
        url: "https://www.linkedin.com/jobs/",
      },
    ],
    jobs: [],
    stats: {},
    saved: [],
  };
  await page.route("**/api/state", (route) => route.fulfill({ json: fixture }));
  await page.route("**/api/browser/open", (route) => {
    fixture.manual = {
      status: "waiting",
      source: "linkedin",
      message: "Complete verification in Chrome.",
    };
    return route.fulfill({ json: fixture.manual });
  });
  await page.route("**/api/browser/continue", (route) =>
    route.fulfill({
      status: 422,
      json: { error: "The verification page is still showing." },
    }),
  );
  await page.reload();

  await page.getByRole("button", { name: "Open browser / help" }).click();
  await page
    .getByRole("button", { name: "Open LinkedIn ↗", exact: true })
    .click();
  await page
    .getByText("Complete verification in Chrome.", { exact: true })
    .waitFor();
  await page.locator("#continue").click();
  await page
    .getByText("The verification page is still showing.", { exact: true })
    .waitFor();
  assert.equal(await page.locator("#helper").evaluate((el) => el.open), true);
  const portal = await browser.newPage();
  await portal.route("https://www.linkedin.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<p>Verify you are human</p>",
    }),
  );
  await portal.goto("https://www.linkedin.com/jobs/search/");
  const helper = new ManualBrowser("/tmp/unused-fixture-profile");
  helper.page = portal;
  helper.source = "linkedin";
  await assert.rejects(() => helper.collect(), /verification page/);
  const job = {
    "@type": "JobPosting",
    title: "Frontend Developer",
    hiringOrganization: { name: "Fixture Co" },
    description: "React and TypeScript",
    datePosted: new Date().toISOString(),
    url: "https://www.linkedin.com/jobs/view/123",
  };
  await portal.setContent(
    `<script type="application/ld+json">${JSON.stringify(job)}</script><p>Readable job page</p>`,
  );
  const imported = await helper.collect();
  assert.equal(imported.rows.length, 1);
  assert.equal(imported.rows[0].title, "Frontend Developer");
  await portal.setContent("<p>No posting dates or listings here</p>");
  await assert.rejects(() => helper.collect(), /No readable jobs/);
  await portal.setContent("<h1>Access Denied</h1>");
  await assert.rejects(() => helper.collect(), /Access Denied/);
  const google = await browser.newPage();
  await google.route("https://www.google.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<div data-encoded-docid="fixture"><h3>Backend developer</h3><div class="vNEEBe">Example</div><span>2 hours ago</span><p>Salary 14 LPA. Java and SQL.</p><a href="https://example.com/apply">Apply on Example</a></div>',
    }),
  );
  await google.goto("https://www.google.com/search?q=jobs");
  helper.page = google;
  helper.source = "google";
  const googleRows = await helper.collect();
  assert.equal(googleRows.rows[0].title, "Backend developer");
  // Test search-group filtering without changing the user's real profile.
  fixture.profile = {
    resume: "Test React resume with enough text to load.",
    roles: ["software engineer", "backend developer", "fullstack developer"],
    locations: ["India"],
    experience: null,
    minimumLpa: 14,
  };
  const card = {
    title: "Developer",
    company: "Example",
    location: "India",
    minExperience: null,
    date_posted: new Date().toISOString(),
    matched: ["react"],
    missing: [],
    keywords: ["react"],
    score: 100,
    description: "React",
    sources: [{ site: "linkedin", url: "https://example.com/job" }],
    salaryInfo: { label: "₹14 LPA", status: "known" },
  };
  fixture.jobs = [
    { ...card, id: "1", searchRoles: ["software engineer"] },
    { ...card, id: "2", searchRoles: ["backend developer"] },
    { ...card, id: "3", searchRoles: ["fullstack developer"] },
  ];
  await page.reload();
  await page.locator(".job").first().waitFor();
  assert.equal(await page.locator(".job").count(), 3);
  await page.locator("#role-view").selectOption("backend developer");
  assert.equal(await page.locator(".job").count(), 1);
  await page.locator("#role-view").selectOption("");
  assert.equal(await page.locator(".job").count(), 3);
  await page.locator("#source-view").selectOption("google");
  assert.equal(await page.locator(".job").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "Passed: upload/inference, responsive layout, origin guard, helper dialog, blocked-page detection and same-page continuation. No live CAPTCHA was solved.",
  );
} finally {
  await browser.close();
}
