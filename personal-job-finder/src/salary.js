// Compare only explicit INR yearly/monthly pay. Never invent currency conversions
// or working-hour assumptions. A range uses its lower advertised bound.
const amount = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
export function salaryInfo(job) {
  const min = amount(job.min_amount),
    max = amount(job.max_amount);
  const currency = String(job.currency || "").toUpperCase();
  const interval = String(job.interval || "").toLowerCase();
  if (min !== null || max !== null) {
    const multiplier = /^(year|yearly|annual|annually)$/.test(interval)
      ? 1
      : /^(month|monthly)$/.test(interval)
        ? 12
        : null;
    const value = min ?? max;
    if (currency === "INR" && multiplier) {
      const lower = min === null ? null : (min * multiplier) / 100000;
      const upper = max === null ? null : (max * multiplier) / 100000;
      return result(
        lower,
        upper,
        `${currency} ${min ?? ""}${max !== null && max !== min ? "–" + max : ""} ${interval}`,
      );
    }
    return {
      lpa: null,
      minLpa: null,
      maxLpa: null,
      status: "unverified",
      label: `${currency || "Currency unknown"} ${value.toLocaleString("en-IN")} ${interval || "(period unknown)"}`,
    };
  }
  const text = [job.salary_text, job.salary, job.description]
    .filter(Boolean)
    .join(" ")
    .replace(/[–—]/g, "-");
  // Indian conventions have an implicit INR unit: 14 LPA, 14-20 lakhs per annum.
  let m = text.match(
    /(?:(up\s+to|from|minimum)\s+)?(?:₹|INR|Rs\.?\s*)?\s*(\d+(?:\.\d+)?)\s*(?:-\s*(?:₹|INR|Rs\.?)?\s*(\d+(?:\.\d+)?))?\s*(LPA|lakhs?|lacs?|crores?)\b(?:\s*(per\s+(?:annum|year|month)|p\.?a\.?|a\s+year|monthly|annually))?/i,
  );
  if (m && (m[4].toLowerCase() === "lpa" || m[5])) {
    const factor = /^crore/i.test(m[4]) ? 100 : 1;
    const monthly = /month/i.test(m[5] || "") ? 12 : 1;
    const a = Number(m[2]) * factor * monthly,
      b = m[3] ? Number(m[3]) * factor * monthly : null;
    return /up\s+to/i.test(m[1] || "")
      ? result(null, b ?? a, m[0])
      : result(a, b, m[0]);
  }
  m = text.match(
    /(?:(up\s+to|from|minimum)\s+)?(?:₹|INR\s*|Rs\.?\s*)([\d,]+(?:\.\d+)?)\s*(k)?\s*(?:-\s*(?:₹|INR\s*|Rs\.?\s*)?([\d,]+(?:\.\d+)?)\s*(k)?)?\s*(?:\/|per\s+|a\s+)?(year|annum|annually|month|monthly)\b/i,
  );
  if (m) {
    const factor = /month/i.test(m[6]) ? 12 / 100000 : 1 / 100000;
    const a = amount(m[2]) * (m[3] ? 1000 : 1) * factor;
    const b = m[4] ? amount(m[4]) * (m[5] ? 1000 : 1) * factor : null;
    return /up\s+to/i.test(m[1] || "")
      ? result(null, b ?? a, m[0])
      : result(a, b, m[0]);
  }
  const explicit = String(job.salary_text || job.salary || "").trim();
  const hasMoney =
    /(?:₹|INR|USD|EUR|GBP|\$|Rs\.)\s*[\d,]+|\d\s*(?:LPA|lakhs?|lacs?|crores?)\b/i.test(
      text,
    );
  const unspecified =
    !hasMoney &&
    (!explicit ||
      /not (?:disclosed|mentioned|specified)|competitive|negotiable/i.test(
        explicit,
      ));
  return {
    lpa: null,
    minLpa: null,
    maxLpa: null,
    status: unspecified ? "missing" : "unverified",
    label: unspecified
      ? "Salary not mentioned"
      : explicit || "Salary mentioned — amount or currency needs checking",
  };
}
function result(minLpa, maxLpa, raw) {
  const n = (v) => Number(v.toFixed(2));
  minLpa = minLpa === null ? null : n(minLpa);
  maxLpa = maxLpa === null ? null : n(maxLpa);
  if (minLpa !== null && maxLpa !== null && maxLpa < minLpa)
    [minLpa, maxLpa] = [maxLpa, minLpa];
  return {
    lpa: minLpa ?? maxLpa,
    minLpa,
    maxLpa,
    status: "known",
    raw,
    label: `₹${minLpa === null ? "up to " + maxLpa : minLpa + (maxLpa !== null && maxLpa !== minLpa ? "–" + maxLpa : "")} LPA`,
  };
}
export function passesSalary(info, minimumLpa) {
  return !minimumLpa || info.status !== "known" || info.lpa >= minimumLpa;
}
