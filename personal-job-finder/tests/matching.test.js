import test from "node:test";
import assert from "node:assert/strict";
import {
  keywords,
  minimumExperience,
  rankJobs,
  validateProfile,
} from "../src/matching.js";
const now = Date.parse("2026-09-17T12:00:00Z");
const profile = {
  resume: "JavaScript React Node.js PostgreSQL developer",
  experience: 2,
};
const job = {
  title: "Frontend Developer",
  company: "Acme",
  location: "Bangalore",
  site: "linkedin",
  description: "React, JavaScript and AWS. 2+ years of experience required.",
  date_posted: "2026-09-17",
  job_url: "https://example.com/job",
};
test("skill boundaries and aliases prevent Java matching JavaScript", () => {
  assert.deepEqual(keywords("JavaScript React.js Node.js C++ C#"), [
    "javascript",
    "c++",
    "c#",
    "react",
    "nodejs",
  ]);
  assert.deepEqual(keywords("ongoing teamwork"), []);
});
test("transparent fit, date cutoff, unknown dates and minimum experience", () => {
  const out = rankJobs(
    [
      job,
      { ...job, date_posted: "2026-09-14T11:59:59Z" },
      { ...job, date_posted: null },
      { ...job, company:"Other company", description: "Minimum 4 years of experience required." },
    ],
    profile,
    now,
  );
  assert.equal(out.jobs.length, 1);
  assert.equal(out.jobs[0].score, 67);
  assert.deepEqual(out.jobs[0].missing, ["aws"]);
  assert.deepEqual(out.stats, {
    expired: 1,
    undated: 1,
    experience: 1,
    salary: 0,
    duplicates: 0,
  });
});
test("cross-source dedupe preserves original links and city aliases", () => {
  const out = rankJobs(
    [
      job,
      {
        ...job,
        site: "naukri",
        location: "Bengaluru",
        job_url: "https://example.com/other",
      },
    ],
    profile,
    now,
  );
  assert.equal(out.jobs.length, 1);
  assert.equal(out.jobs[0].sources.length, 2);
  assert.equal(out.stats.duplicates, 1);
});
test("unscored listings and experience uncertainty remain visible", () => {
  assert.equal(
    minimumExperience({ description: "3 years of experience preferred." }),
    null,
  );
  assert.equal(minimumExperience({ experience_range: "3-5 Yrs" }), 3);
  const out = rankJobs(
    [{ ...job, description: "Join our team", title: "Developer" }],
    profile,
    now,
  );
  assert.equal(out.jobs[0].score, null);
  assert.equal(out.jobs[0].minExperience, null);
});
test("reject invalid profiles and unsafe listing URLs", () => {
  assert.throws(() =>
    validateProfile({
      ...profile,
      roles: ["a", "b", "c", "d"],
      locations: ["India"],
      sources: ["linkedin"],
    }),
  );
  assert.throws(() => validateProfile({ ...profile, experience: NaN }));
  assert.equal(
    rankJobs([{ ...job, job_url: "javascript:alert(1)" }], profile, now).jobs
      .length,
    0,
  );
});
