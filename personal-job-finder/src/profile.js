import { keywords, validateProfile } from "./matching.js";

// Suggestions are deterministic and inspectable. Never guess years from graduation dates.
export function inferProfile(resume) {
  const skills = new Set(keywords(resume));
  const explicit = [
    ...resume.matchAll(
      /\b(?:full[ -]?stack|front[ -]?end|back[ -]?end|software|data|machine learning|devops|cloud|qa|automation|mobile|android|ios)\s+(?:software\s+)?(?:engineer|developer|scientist|analyst)\b/gi,
    ),
  ].map((m) => m[0].toLowerCase());
  const roles = [...new Set(explicit)].slice(0, 2);
  if (!roles.length) {
    if (skills.has("react") || skills.has("angular") || skills.has("vue"))
      roles.push("frontend developer");
    if (skills.has("django") || skills.has("spring") || skills.has("nodejs"))
      roles.push("backend developer");
    if (!roles.length && (skills.has("pytorch") || skills.has("tensorflow")))
      roles.push("machine learning engineer");
    if (!roles.length) roles.push("software engineer");
  }
  const cities = [
    "Bengaluru",
    "Bangalore",
    "Hyderabad",
    "Pune",
    "Chennai",
    "Mumbai",
    "Delhi",
    "Noida",
    "Gurugram",
    "Gurgaon",
    "Kolkata",
  ];
  const location =
    cities.find((city) =>
      new RegExp(`\\b${city}\\b`, "i").test(resume.slice(0, 1800)),
    ) || "India";
  const years = resume.match(
    /\b(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:professional\s+|work\s+|relevant\s+)?experience\b/i,
  );
  return {
    roles,
    locations: [location],
    experience: years ? Math.min(60, Number(years[1])) : null,
    skills: [...skills],
  };
}

export function makeProfile(input) {
  if (
    typeof input.resume !== "string" ||
    input.resume.trim().length < 30 ||
    input.resume.length > 150000
  )
    throw Error("Please upload or paste your resume (at least 30 characters).");
  const inferred = inferProfile(input.resume);
  return validateProfile({
    ...inferred,
    resume: input.resume,
    roles: input.roles ?? inferred.roles,
    locations: input.locations ?? inferred.locations,
    experience:
      input.experience === undefined ? inferred.experience : input.experience,
    sources: ["linkedin", "naukri", "google", "indeed"],
    hourly: input.hourly === true,
    minimumLpa: input.minimumLpa ?? 14,
  });
}
