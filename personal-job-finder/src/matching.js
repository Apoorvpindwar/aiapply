import { minimumExperience } from "./experience.js";
export { minimumExperience } from "./experience.js";
import { newestFirst, datePrecision } from "../public/time.js";
import { salaryInfo, passesSalary } from "./salary.js";
import { createHash } from "node:crypto";
const skills = {
  javascript: ["javascript", "js"],
  typescript: ["typescript", "ts"],
  python: ["python"],
  java: ["java"],
  "c++": ["c++"],
  "c#": ["c#"],
  golang: ["golang", "go"],
  ruby: ["ruby"],
  php: ["php"],
  rust: ["rust"],
  kotlin: ["kotlin"],
  swift: ["swift"],
  react: ["react", "reactjs", "react.js"],
  angular: ["angular"],
  vue: ["vue", "vuejs"],
  nextjs: ["nextjs", "next.js"],
  nodejs: ["nodejs", "node.js", "node js"],
  express: ["express", "expressjs"],
  django: ["django"],
  flask: ["flask"],
  fastapi: ["fastapi"],
  spring: ["spring", "spring boot"],
  dotnet: [".net", "dotnet"],
  html: ["html", "html5"],
  css: ["css", "css3"],
  tailwind: ["tailwind", "tailwindcss"],
  sql: ["sql"],
  postgresql: ["postgresql", "postgres"],
  mysql: ["mysql"],
  mongodb: ["mongodb", "mongo"],
  redis: ["redis"],
  elasticsearch: ["elasticsearch"],
  aws: ["aws", "amazon web services"],
  azure: ["azure"],
  gcp: ["gcp", "google cloud"],
  docker: ["docker"],
  kubernetes: ["kubernetes", "k8s"],
  terraform: ["terraform"],
  linux: ["linux"],
  git: ["git"],
  "ci/cd": ["ci/cd", "continuous integration"],
  rest: ["rest", "restful"],
  graphql: ["graphql"],
  microservices: ["microservices"],
  kafka: ["kafka"],
  rabbitmq: ["rabbitmq"],
  testing: ["unit testing", "automated testing"],
  jest: ["jest"],
  playwright: ["playwright"],
  selenium: ["selenium"],
  pandas: ["pandas"],
  numpy: ["numpy"],
  pytorch: ["pytorch"],
  tensorflow: ["tensorflow"],
  "machine learning": ["machine learning"],
  "deep learning": ["deep learning"],
  nlp: ["nlp", "natural language processing"],
  llm: ["llm", "llms", "large language models"],
  spark: ["spark", "pyspark"],
  airflow: ["airflow"],
  dbt: ["dbt"],
  snowflake: ["snowflake"],
  tableau: ["tableau"],
  "power bi": ["power bi"],
  excel: ["excel"],
  agile: ["agile"],
  scrum: ["scrum"],
  figma: ["figma"],
  "system design": ["system design"],
  "data structures": ["data structures"],
  algorithms: ["algorithms"],
};
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function keywords(text = "") {
  return Object.entries(skills)
    .filter(([, aliases]) =>
      aliases.some((a) =>
        new RegExp(`(^|[^a-z0-9])${esc(a)}(?=$|[^a-z0-9])`, "i").test(text),
      ),
    )
    .map(([k]) => k);
}
function norm(s = "") {
  return String(s)
    .toLowerCase()
    .replace(/bangalore/g, "bengaluru")
    .replace(/gurgaon/g, "gurugram")
    .replace(/\bsr\.?\b/g, "senior")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
export function rankJobs(rows, profile, now = Date.now()) {
  const resume = new Set(keywords(profile.resume));
  const seen = new Map();
  const keyFor = (row) =>
    [norm(row.company), norm(row.title), norm(row.location)].join("|");
  // A duplicate without salary must not hide a known below-minimum salary.
  const knownSalaries = new Map();
  const knownExperience = new Map();
  for (const row of rows) {
    const posted = Date.parse(row.date_posted);
    if (
      !Number.isFinite(posted) ||
      now - posted >= 24 * 3600000 ||
      posted > now
    )
      continue;
    const years = minimumExperience(row);
    if (years !== null)
      knownExperience.set(
        keyFor(row),
        Math.max(years, knownExperience.get(keyFor(row)) ?? 0),
      );
    const info = salaryInfo(row),
      key = keyFor(row),
      old = knownSalaries.get(key);
    if (info.status === "known" && (!old || info.lpa < old.lpa))
      knownSalaries.set(key, info);
  }
  const stats = {
    expired: 0,
    undated: 0,
    experience: 0,
    salary: 0,
    duplicates: 0,
  };
  for (const row of rows) {
    const posted = Date.parse(row.date_posted);
    if (!Number.isFinite(posted)) {
      stats.undated++;
      continue;
    }
    if (now - posted >= 24 * 3600000 || posted > now) {
      stats.expired++;
      continue;
    }
    const minExperience =
      knownExperience.get(keyFor(row)) ?? minimumExperience(row);
    if (
      minExperience !== null &&
      profile.experience !== null &&
      minExperience > profile.experience
    ) {
      stats.experience++;
      continue;
    }
    const key = keyFor(row);
    const salary = knownSalaries.get(key) || salaryInfo(row);
    if (!passesSalary(salary, profile.minimumLpa ?? 14)) {
      stats.salary++;
      continue;
    }
    const url = String(row.job_url || "");
    if (!/^https?:\/\//i.test(url)) continue;
    const extracted = keywords(
      `${row.title || ""} ${row.description || ""} ${row.skills || ""}`,
    );
    const matched = extracted.filter((k) => resume.has(k));
    const job = {
      ...row,
      id: createHash("sha256").update(key).digest("hex").slice(0, 16),
      minExperience,
      salaryInfo: salary,
      searchRoles: row.searchRoles || [],
      keywords: extracted,
      matched,
      missing: extracted.filter((k) => !resume.has(k)),
      score: extracted.length
        ? Math.round((matched.length / extracted.length) * 100)
        : null,
      sources: [{ site: row.site, url }],
      datePrecision: datePrecision(row),
    };
    if (seen.has(key)) {
      stats.duplicates++;
      const old = seen.get(key);
      const links = [...old.sources, ...job.sources].filter(
        (v, i, a) => a.findIndex((x) => x.url === v.url) === i,
      );
      const searchRoles = [
        ...new Set([...old.searchRoles, ...job.searchRoles]),
      ];
      old.searchRoles = searchRoles;
      const oldest =
        Date.parse(old.date_posted) <= Date.parse(job.date_posted) ? old : job;
      if (job.keywords.length > old.keywords.length)
        seen.set(key, {
          ...job,
          sources: links,
          searchRoles,
          date_posted: oldest.date_posted,
          datePrecision: oldest.datePrecision,
        });
      else {
        old.sources = links;
        old.date_posted = oldest.date_posted;
        old.datePrecision = oldest.datePrecision;
      }
    } else seen.set(key, job);
  }
  return {
    jobs: [...seen.values()].sort(newestFirst),
    stats,
  };
}
export function validateProfile(p) {
  if (!p || typeof p !== "object") throw Error("Invalid profile");
  const list = (v, name) => {
    if (
      !Array.isArray(v) ||
      v.length < 1 ||
      v.length > 3 ||
      v.some((x) => typeof x !== "string" || !x.trim() || x.length > 100)
    )
      throw Error(`Choose 1–3 ${name}`);
    return [...new Set(v.map((x) => x.trim()))];
  };
  if (
    typeof p.resume !== "string" ||
    p.resume.trim().length < 30 ||
    p.resume.length > 150000
  )
    throw Error("Add resume text (30–150,000 characters)");
  if (
    p.experience !== null &&
    (typeof p.experience !== "number" ||
      !Number.isFinite(p.experience) ||
      p.experience < 0 ||
      p.experience > 60)
  )
    throw Error("Experience must be 0–60 years");
  if (
    !Array.isArray(p.sources) ||
    !p.sources.length ||
    p.sources.some(
      (x) => !["linkedin", "naukri", "google", "indeed"].includes(x),
    )
  )
    throw Error("Select supported sources");
  const minimumLpa = p.minimumLpa ?? 14;
  if (
    typeof minimumLpa !== "number" ||
    !Number.isFinite(minimumLpa) ||
    minimumLpa < 0 ||
    minimumLpa > 1000
  )
    throw Error("Minimum salary must be 0–1000 LPA");
  return {
    minimumLpa,
    roles: list(p.roles, "roles"),
    locations: list(p.locations, "locations"),
    resume: p.resume,
    experience: p.experience,
    sources: [...new Set(p.sources)],
    hourly: p.hourly === true,
  };
}
