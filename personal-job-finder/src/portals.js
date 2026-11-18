export function portalLinks(profile) {
  const role = profile.roles[0],
    location = profile.locations[0];
  const q = encodeURIComponent(`${role} ${location}`);
  const slug = role.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return [
    {
      id: "linkedin",
      name: "LinkedIn",
      url: `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(role)}&location=${encodeURIComponent(location)}&f_TPR=r86400&sortBy=DD`,
      mode: "automatic + browser",
    },
    {
      id: "naukri",
      name: "Naukri",
      url: `https://www.naukri.com/${slug}-jobs?k=${encodeURIComponent(role)}&l=${encodeURIComponent(location)}&jobAge=1`,
      mode: "automatic + browser",
    },
    {
      id: "google",
      name: "Google Jobs",
      url: `https://www.google.com/search?q=${q}+jobs+posted+in+the+last+24+hours&udm=8`,
      mode: "automatic + browser",
    },
    {
      id: "indeed",
      name: "Indeed",
      url: `https://in.indeed.com/jobs?q=${encodeURIComponent(role)}&l=${encodeURIComponent(location)}&fromage=1&sort=date`,
      mode: "automatic + browser",
    },
    {
      id: "foundit",
      name: "foundit",
      url: `https://www.foundit.in/srp/results?query=${q}`,
      mode: "search link",
    },
    {
      id: "internshala",
      name: "Internshala",
      url: `https://internshala.com/jobs/keywords-${slug}/`,
      mode: "search link",
    },
    {
      id: "wellfound",
      name: "Wellfound",
      url: "https://wellfound.com/jobs",
      mode: "browse manually",
    },
    {
      id: "instahyre",
      name: "Instahyre",
      url: "https://www.instahyre.com/search-jobs/",
      mode: "browse manually",
    },
  ];
}

export function isPortalUrl(url, source) {
  try {
    const { hostname, protocol } = new URL(url);
    const hosts = {
      linkedin: "linkedin.com",
      naukri: "naukri.com",
      google: "google.com",
      indeed: "indeed.com",
    };
    const host = hosts[source];
    return (
      protocol === "https:" &&
      !!host &&
      (hostname === host || hostname.endsWith("." + host))
    );
  } catch {
    return false;
  }
}

export function postingDate(text, now = Date.now()) {
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(text))
    return Number.isFinite(Date.parse(text))
      ? new Date(text).toISOString()
      : null;
  if (/\b(just posted|just now)\b/i.test(text))
    return new Date(now).toISOString();
  if (/\b(today|yesterday)\b/i.test(text)) {
    const day = new Date(now);
    day.setUTCHours(0, 0, 0, 0);
    return new Date(
      day.getTime() - (/yesterday/i.test(text) ? 86400000 : 0),
    ).toISOString();
  }
  const match = text.match(/\b(\d+)\s*(minutes?|hours?|days?|weeks?)\s+ago\b/i);
  if (!match) return null;
  const unit = { minute: 60000, hour: 3600000, day: 86400000, week: 604800000 }[
    match[2].toLowerCase().replace(/s$/, "")
  ];
  return new Date(now - Number(match[1]) * unit).toISOString();
}
