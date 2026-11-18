import test from "node:test";
import assert from "node:assert/strict";
import { rankJobs, minimumExperience } from "../src/matching.js";
import { newestFirst, postingLabel } from "../public/time.js";
import { portalLinks } from "../src/portals.js";
const now = Date.parse("2026-09-17T12:00:00Z");
const job = {
  title: "Engineer",
  company: "Company",
  location: "India",
  description: "React",
  job_url: "https://example.com/job",
};
const profile = { resume: "React engineer", experience: 3 };
test("24-hour limit excludes boundary, old 78-hour cache and future postings", () => {
  const rows = [1 / 60, 5 / 60, 23.99, 24, 78, -1].map((hours, i) => ({
    ...job,
    company: String(i),
    date_posted: new Date(now - hours * 3600000).toISOString(),
  }));
  const result = rankJobs(rows, profile, now);
  assert.equal(result.jobs.length, 3);
  assert.equal(result.stats.expired, 3);
  assert.equal(result.jobs[0].company, "0");
  assert.equal(result.jobs[1].company, "1");
});
test("newest sort is independent of keyword fit and labels retain minute precision", () => {
  const a = {
    date_posted: new Date(now - 60000).toISOString(),
    datePrecision: "minute",
    score: 10,
  };
  const b = {
    date_posted: new Date(now - 300000).toISOString(),
    datePrecision: "minute",
    score: 100,
  };
  assert.deepEqual([b, a].sort(newestFirst), [a, b]);
  assert.match(postingLabel(a, now), /1 minute ago/);
  assert.match(postingLabel(b, now), /5 minutes ago/);
  assert.match(
    postingLabel({ ...a, datePrecision: "day" }, now),
    /exact time unavailable/,
  );
});
test("Naukri experience variants and explicit requirements are enforced", () => {
  for (const [row, expected] of [
    [{ experience_range: "5 Years" }, 5],
    [{ experience_range: "4–7 Yrs" }, 4],
    [{ experience_range: "2 to 7 years" }, 2],
    [{ experience_range: "18 months" }, 1.5],
    [{ description: "Experience: 5 years" }, 5],
    [{ description: "5+ years in Java" }, 5],
    [{ description: "At least 4 years required" }, 4],
    [
      {
        description:
          "3 years experience required, 5 years experience preferred",
      },
      3,
    ],
    [
      {
        experience_range: "0-1 Yrs",
        description: "Minimum 5 years of experience",
      },
      5,
    ],
  ])
    assert.equal(minimumExperience(row), expected, JSON.stringify(row));
  const rows = [
    {
      ...job,
      experience_range: "5 Years",
      date_posted: new Date(now - 60000).toISOString(),
    },
    {
      ...job,
      company: "B",
      experience_range: "2-7 Yrs",
      date_posted: new Date(now - 60000).toISOString(),
    },
  ];
  const result = rankJobs(rows, profile, now);
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].company, "B");
});
test("manual search links request only the past day", () => {
  const links = portalLinks({ roles: ["engineer"], locations: ["India"] });
  assert.match(links[0].url, /r86400/);
  assert.match(links[1].url, /jobAge=1/);
  assert.match(links[3].url, /fromage=1/);
});
