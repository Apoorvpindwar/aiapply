import test from "node:test";
import assert from "node:assert/strict";
import { inferProfile, makeProfile } from "../src/profile.js";
import { postingDate, isPortalUrl, portalLinks } from "../src/portals.js";
import { rankJobs } from "../src/matching.js";

test("resume alone produces roles and location without inventing experience", () => {
  const resume =
    "Bengaluru\nFrontend Developer\nJavaScript React Node.js projects and internships";
  const p = makeProfile({ resume });
  assert.equal(p.roles[0], "frontend developer");
  assert.deepEqual(p.locations, ["Bengaluru"]);
  assert.equal(p.experience, null);
  const ranked = rankJobs(
    [
      {
        title: "Frontend Developer",
        company: "A",
        description: "3 years of experience with React",
        date_posted: new Date().toISOString(),
        job_url: "https://example.com/job",
      },
    ],
    p,
  );
  assert.equal(ranked.jobs.length, 1);
});
test("explicit experience and overrides take precedence", () => {
  const resume =
    "Software engineer with 2 years of experience in Java, Spring and AWS. Pune";
  assert.equal(inferProfile(resume).experience, 2);
  const p = makeProfile({
    resume,
    experience: 4,
    roles: ["backend developer"],
    locations: ["India"],
  });
  assert.equal(p.experience, 4);
  assert.equal(p.roles[0], "backend developer");
});
test("relative dates, unknown dates and strict portal domains", () => {
  const now = Date.parse("2026-09-17T12:00:00Z");
  assert.equal(
    postingDate("Posted 2 days ago", now),
    "2026-09-15T12:00:00.000Z",
  );
  assert.equal(postingDate("Hiring urgently", now), null);
  assert.equal(isPortalUrl("https://www.naukri.com/jobs", "naukri"), true);
  assert.equal(
    isPortalUrl("https://naukri.com.evil.example/jobs", "naukri"),
    false,
  );
  assert.equal(isPortalUrl("http://www.naukri.com/jobs", "naukri"), false);
  assert.equal(
    portalLinks({ roles: ["C++ developer"], locations: ["India"] }).length,
    8,
  );
});
