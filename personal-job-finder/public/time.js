export function datePrecision(job) {
  if (job.datePrecision) return job.datePrecision;
  return /^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.000)?(?:Z|[+]00:00)?)?$/.test(
    job.date_posted || "",
  )
    ? "day"
    : "time";
}
export function newestFirst(a, b) {
  // Unknown intraday times must not outrank known minute/hour timestamps.
  const coarse = (datePrecision(a) === "day") - (datePrecision(b) === "day");
  return (
    coarse ||
    Date.parse(b.date_posted) - Date.parse(a.date_posted) ||
    (b.score ?? -1) - (a.score ?? -1)
  );
}
export function postingLabel(job, now = Date.now()) {
  const posted = Date.parse(job.date_posted);
  if (!Number.isFinite(posted)) return "Posting time unavailable";
  if (datePrecision(job) === "day")
    return `Posted ${new Date(posted).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · exact time unavailable`;
  const minutes = Math.max(0, Math.floor((now - posted) / 60000));
  const age =
    minutes < 1
      ? "just now"
      : minutes < 60
        ? `${minutes} minute${minutes === 1 ? "" : "s"} ago`
        : `${Math.floor(minutes / 60)} hour${Math.floor(minutes / 60) === 1 ? "" : "s"} ago`;
  return `Posted ${age}${["minute", "hour"].includes(datePrecision(job)) ? " (approx.)" : ""}`;
}
