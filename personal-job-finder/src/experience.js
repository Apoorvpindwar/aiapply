// Require numerical evidence; job seniority labels are not years of experience.
export function minimumExperience(job) {
  const values = [];
  const explicit = String(job.experience_range ?? "")
    .replace(/[–—]/g, "-")
    .trim();
  const range = explicit.match(
    /^(?:experience\s*:?\s*)?(\d+(?:\.\d+)?)\s*(?:(?:-|to)\s*\d+(?:\.\d+)?|\+)?\s*(years?|yrs?|months?|mos?)?\b/i,
  );
  if (range)
    values.push(
      Number(range[1]) / (/month|mos/i.test(range[2] || "") ? 12 : 1),
    );
  const text = String(job.description || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[–—]/g, "-");
  const clauses = text.split(/\n|;|,|[.!](?:\s|$)/);
  for (const clause of clauses) {
    if (
      /preferred|desired|nice.to.have|bonus|optional/i.test(clause) &&
      !/required|minimum|must|at least/i.test(clause)
    )
      continue;
    const patterns = [
      /(?:experience|exp)\s*[:=]?\s*(?:of\s+|minimum\s+|at least\s+)?(\d+(?:\.\d+)?)\s*(?:(?:-|to)\s*\d+(?:\.\d+)?|\+)?\s*(years?|yrs?|months?)/gi,
      /(\d+(?:\.\d+)?)\s*(?:(?:-|to)\s*\d+(?:\.\d+)?|\+)?\s*(years?|yrs?|months?)\s*(?:of\s+)?(?:(?:relevant|professional|hands.on|work|working|software|development|overall|total|industry)\s+)*(?:experience|exp\b|in\b|working\b|developing\b|building\b)/gi,
      /(?:minimum|at least|requires?|must have)\s*(?:of\s+)?(\d+(?:\.\d+)?)\s*(?:(?:-|to)\s*\d+(?:\.\d+)?|\+)?\s*(years?|yrs?|months?)/gi,
    ];
    for (const pattern of patterns)
      for (const match of clause.matchAll(pattern))
        values.push(Number(match[1]) / (/month/i.test(match[2]) ? 12 : 1));
  }
  return values.length ? Math.max(...values) : null;
}
