import test from "node:test";
import assert from "node:assert/strict";
import { naukriRows } from "../src/browser.js";
import { salaryInfo } from "../src/salary.js";
test("Naukri browser response preserves posting date, salary and experience", () => {
  const rows = naukriRows({
    jobDetails: [
      {
        title: "Backend developer",
        companyName: "Example",
        jdURL: "/job-listings/backend-123",
        footerPlaceholderLabel: "1 day ago",
        experienceText: "3-5 years",
        tagsAndSkills: "Java, SQL",
        placeholders: [
          { type: "location", label: "India" },
          { type: "salary", label: "14-20 Lacs PA" },
        ],
      },
    ],
  });
  assert.equal(rows.length, 1);
  assert.equal(
    rows[0].job_url,
    "https://www.naukri.com/job-listings/backend-123",
  );
  assert.equal(rows[0].experience_range, "3-5 years");
  assert.equal(salaryInfo(rows[0]).lpa, 14);
  assert.ok(rows[0].date);
});
