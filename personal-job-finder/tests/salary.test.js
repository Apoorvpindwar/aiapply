import test from "node:test";
import assert from "node:assert/strict";
import { salaryInfo, passesSalary } from "../src/salary.js";
import { rankJobs, validateProfile } from "../src/matching.js";

test("salary cutoff includes unstated and exact 14 LPA, excludes below 14", () => {
  for (const [description, pass] of [
    ["Salary not disclosed", true],
    ["CTC 14 LPA", true],
    ["Salary 13.9 LPA", false],
    ["Salary 12-18 LPA", false],
    ["14–20 lakhs per annum", true],
    ["Up to 12 LPA", false],
  ])
    assert.equal(
      passesSalary(salaryInfo({ description }), 14),
      pass,
      description,
    );
});
test("monthly INR salaries annualize; ranges use lower advertised bound", () => {
  assert.equal(
    salaryInfo({
      currency: "INR",
      interval: "monthly",
      min_amount: 100000,
      max_amount: 150000,
    }).lpa,
    12,
  );
  assert.equal(salaryInfo({ description: "INR 1,25,000 per month" }).lpa, 15);
  assert.equal(
    salaryInfo({ description: "₹1,00,000 - ₹1,50,000 per month" }).lpa,
    12,
  );
  assert.equal(salaryInfo({ description: "0.2 crore per annum" }).lpa, 20);
  assert.equal(salaryInfo({ description: "14 Lacs P.A." }).lpa, 14);
});
test("foreign, hourly, ambiguous pay and non-pay numbers are not guessed", () => {
  assert.equal(
    salaryInfo({ currency: "USD", interval: "yearly", min_amount: 50000 })
      .status,
    "unverified",
  );
  assert.equal(
    salaryInfo({ currency: "INR", interval: "hourly", min_amount: 500 }).status,
    "unverified",
  );
  assert.equal(
    salaryInfo({ description: "5 years of experience with React 18" }).status,
    "missing",
  );
  assert.equal(
    salaryInfo({ description: "Salary ₹1400000" }).status,
    "unverified",
  );
});
test("matching applies salary and preserves merged search groups", () => {
  const common = {
    title: "Software engineer",
    company: "ACME",
    location: "India",
    date_posted: new Date().toISOString(),
    description: "JavaScript",
    job_url: "https://example.com/1",
    site: "linkedin",
  };
  const p = {
    resume: "JavaScript developer",
    experience: null,
    minimumLpa: 14,
  };
  const out = rankJobs(
    [
      { ...common, searchRoles: ["software engineer"] },
      {
        ...common,
        site: "indeed",
        job_url: "https://example.com/2",
        searchRoles: ["backend developer"],
      },
      { ...common, company: "Low pay", salary_text: "10 LPA" },
    ],
    p,
  );
  assert.equal(out.jobs.length, 1);
  assert.equal(out.stats.salary, 1);
  assert.deepEqual(out.jobs[0].searchRoles, [
    "software engineer",
    "backend developer",
  ]);
});
test("profile rejects invalid salary filter", () => {
  const p = {
    resume: "A software engineer with React and JavaScript experience.",
    roles: ["software engineer"],
    locations: ["India"],
    experience: null,
    sources: ["google"],
  };
  assert.equal(validateProfile(p).minimumLpa, 14);
  assert.throws(() => validateProfile({ ...p, minimumLpa: -1 }));
  assert.throws(() => validateProfile({ ...p, minimumLpa: "14" }));
});
test("a duplicate without salary cannot hide an advertised low salary", () => {
  const common = {
    title: "Developer",
    company: "Acme",
    location: "India",
    description: "React",
    date_posted: new Date().toISOString(),
    job_url: "https://example.com/job",
  };
  const out = rankJobs(
    [
      common,
      { ...common, job_url: "https://example.com/copy", salary_text: "10 LPA" },
    ],
    { resume: "React developer", experience: null, minimumLpa: 14 },
  );
  assert.equal(out.jobs.length, 0);
  assert.equal(out.stats.salary, 2);
});
