import { newestFirst, postingLabel } from "/time.js";
const $ = (selector) => document.querySelector(selector);
const escape = (text) =>
  String(text ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let state,
  loaded = false,
  previousRun = false,
  helperBusy = false;
async function api(path, data) {
  const response = await fetch(
    "/api/" + path,
    data === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
  );
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "Request failed");
  return result;
}
function notice(text) {
  $("#notice").textContent = text;
}
function setSuggestions(p) {
  $("#roles").value = p.roles.join(", ");
  $("#locations").value = p.locations.join(", ");
  $("#experience").value = p.experience ?? "";
  $("#minimum-lpa").value = p.minimumLpa ?? 14;
  $("#suggested").textContent =
    `Suggested: ${p.roles.join(" / ")} · ${p.locations.join(", ")} · ${p.experience === null ? "Experience unknown — no experience exclusion" : p.experience + " years"}. Edit below if needed.`;
}
function showHelper(source) {
  $("#helper-role").innerHTML = (state.profile?.roles || [])
    .map((role) => `<option>${escape(role)}</option>`)
    .join("");
  $("#helper-location").innerHTML = (state.profile?.locations || [])
    .map((loc) => `<option>${escape(loc)}</option>`)
    .join("");
  $("#helper-message").textContent =
    state.manual?.message ||
    "Open a portal in Chrome, complete sign-in or verification, then continue here.";
  $("#helper-sources").innerHTML = state.portals
    .filter(
      (p) => p.mode === "automatic + browser" && (!source || p.id === source),
    )
    .map((p) => `<button data-open="${p.id}">Open ${escape(p.name)} ↗</button>`)
    .join("");
  $("#continue").disabled =
    helperBusy || !["waiting", "done"].includes(state.manual?.status);
  if (source && state.manual?.source !== source) $("#continue").disabled = true;
  if (state.manual?.role && (!source || state.manual.source === source))
    $("#helper-role").value = state.manual.role;
  if (state.manual?.location && (!source || state.manual.source === source))
    $("#helper-location").value = state.manual.location;
  if (!$("#helper").open) $("#helper").showModal();
}
function render() {
  $("#find").disabled = state.run.running || helperBusy;
  if (state.run.running) notice(state.run.progress);
  else if (previousRun) {
    notice(
      state.run.error || "Search finished. Open any listing below to apply.",
    );
    if (
      state.sources.some((s) =>
        ["error", "warning", "empty"].includes(s.status),
      )
    )
      showHelper();
  }
  previousRun = state.run.running;
  $("#portal-section").hidden = !state.profile;
  $("#portals").innerHTML = state.portals
    .map(
      (p) =>
        `<a href="${escape(p.url)}" target="_blank" rel="noopener noreferrer">${escape(p.name)} ↗</a>`,
    )
    .join("");
  const roleView = $("#role-view").value;
  const roles = state.profile?.roles || [];
  $("#role-view").innerHTML =
    '<option value="">All selected roles</option>' +
    roles
      .map((role) => `<option value="${escape(role)}">${escape(role)}</option>`)
      .join("");
  $("#role-view").value = roles.includes(roleView) ? roleView : "";
  const sourceView = $("#source-view").value;
  const jobs = state.jobs.filter(
    (job) =>
      (!roleView ||
        (job.searchRoles?.length
          ? job.searchRoles.includes(roleView)
          : job.title
              .toLowerCase()
              .replace(/[ -]/g, "")
              .includes(roleView.toLowerCase().replace(/[ -]/g, "")))) &&
      (!sourceView || job.sources.some((s) => s.site === sourceView)),
  );
  $("#apply-filters").disabled =
    !state.profile || state.run.running || helperBusy;
  $("#google-api-status").textContent = state.googleApiConfigured
    ? "Google Jobs API is configured. Searches use that provider."
    : "Optional Google Jobs API: add your own SerpApi key to the local .env file (see README). This avoids relying on the direct page parser; provider quotas and charges may apply.";
  if ($("#sort").value === "recent") jobs.sort(newestFirst);
  else
    jobs.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || newestFirst(a, b));
  $("#count").textContent = jobs.length;
  $("#jobs").innerHTML = jobs.length
    ? jobs
        .map(
          (j) =>
            `<article class="job"><div class="job-top"><div><div class="company">${escape(j.company || "Company not listed")}</div><h3>${escape(j.title)}</h3><div class="meta">${escape(j.location || "Location unspecified")} · ${j.minExperience === null ? "Experience unspecified" : j.experience_range && /\d/.test(j.experience_range) ? escape(j.experience_range) + " · minimum " + j.minExperience + " yrs" : j.minExperience + "+ years"}<br>${escape(j.salaryInfo?.label || "Salary not mentioned")}${j.salaryInfo?.status === "unverified" ? " · check salary" : ""}<br>${escape(postingLabel(j))}</div></div><div class="score">${j.score === null ? "—" : j.score + "%"}<small>SKILL FIT</small></div></div><div class="chips">${j.matched.map((k) => `<span>✓ ${escape(k)}</span>`).join("")}${j.missing.map((k) => `<span class="missing">${escape(k)}</span>`).join("")}</div><details><summary>Match details · ${j.matched.length}/${j.keywords.length} skills</summary><p>Green skills appear in your resume. Other extracted skills are missing. Dates may be approximate; experience is inferred from text.</p><pre>${escape(j.description || "Open the original listing for its description.")}</pre></details><div class="job-bottom">${j.sources.map((s) => `<a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">Apply on ${escape(s.site)} ↗</a>`).join("")}</div></article>`,
        )
        .join("")
    : `<div class="empty">◎<strong>${state.run.running ? "Searching for fresh opportunities…" : !state.profile ? "Start with your resume." : "No fresh matches to show yet."}</strong><p>${state.profile ? "Check source activity, help a blocked portal, or use the direct search links above." : "Upload a resume or paste its text. No account or API key needed."}</p></div>`;
  $("#sources").innerHTML = state.sources.length
    ? state.sources
        .map(
          (s) =>
            `<div><strong>${escape(s.source)}</strong> · ${s.count} fetched · ${s.eligible ?? 0} eligible · ${escape(s.status)} <button data-help="${escape(s.source)}" ${state.run.running ? "disabled" : ""}>Open browser / help</button>${[...s.errors, ...s.warnings].length ? `<details><summary>Details</summary><pre>${escape([...s.errors, ...s.warnings].join("\n"))}</pre></details>` : ""}</div>`,
        )
        .join("")
    : "No completed searches yet.";
  const stats = state.stats;
  $("#stats").textContent = state.profile
    ? `Excluded: ${stats.expired} outside 24 hours, ${stats.undated} without dates, ${stats.experience} above your experience, ${stats.salary ?? 0} below your salary minimum; ${stats.duplicates} duplicates combined.`
    : "";
}
async function poll() {
  try {
    state = await api("state");
    if (!loaded) {
      loaded = true;
      if (state.profile) {
        $("#resume").value = state.profile.resume;
        setSuggestions(state.profile);
        $("#hourly").checked = state.profile.hourly;
        $("#file-name").textContent = "Your saved resume is ready";
      }
    }
    render();
  } catch (e) {
    notice(e.message);
  }
}
async function upload(file) {
  if (!file) return;
  if (file.size > 8000000) return notice("Please use a file under 8 MB.");
  $("#find").disabled = true;
  try {
    notice("Reading your resume locally…");
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = () => reject(Error("Could not read file"));
      reader.readAsDataURL(file);
    });
    const result = await api("resume", {
      extension: file.name.split(".").pop().toLowerCase(),
      data,
    });
    $("#resume").value = result.text;
    $("#file-name").textContent = file.name;
    setSuggestions(result.suggestions);
    notice("Resume ready. Click Find my jobs.");
  } catch (e) {
    notice(e.message);
  } finally {
    $("#find").disabled = false;
  }
}
$("#file").onchange = (e) => upload(e.target.files[0]);
$(".upload").ondragover = (e) => e.preventDefault();
$(".upload").ondrop = (e) => {
  e.preventDefault();
  upload(e.dataTransfer.files[0]);
};
$("#resume").addEventListener("change", async () => {
  if ($("#resume").value.length >= 30) {
    try {
      setSuggestions(await api("infer", { resume: $("#resume").value }));
    } catch (e) {
      notice(e.message);
    }
  }
});
$("#form").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const list = (id) =>
      $(id)
        .value.split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    const roles = list("#roles"),
      locations = list("#locations");
    await api("profile", {
      resume: $("#resume").value,
      ...(roles.length ? { roles } : {}),
      ...(locations.length ? { locations } : {}),
      experience:
        $("#experience").value === "" ? null : Number($("#experience").value),
      hourly: $("#hourly").checked,
      minimumLpa: Number($("#minimum-lpa").value),
    });
    await api("refresh", {});
    await poll();
  } catch (e) {
    notice(e.message);
    $("#preferences").open = true;
  }
};
$("#sort").onchange = () => state && render();
$("#role-view").onchange = () => state && render();
$("#source-view").onchange = () => state && render();
document.querySelectorAll("[data-preset]").forEach(
  (button) =>
    (button.onclick = () => {
      $("#roles").value = button.dataset.preset;
    }),
);
$("#all-roles").onclick = () => {
  $("#roles").value =
    "software engineer, backend developer, fullstack developer";
};
$("#apply-filters").onclick = async () => {
  try {
    await api("filters", {
      experience:
        $("#experience").value === "" ? null : Number($("#experience").value),
      minimumLpa: Number($("#minimum-lpa").value),
    });
    await poll();
    notice(
      "Salary and experience filters applied to the current results. Use Find my jobs after changing roles or location.",
    );
  } catch (e) {
    notice(e.message);
  }
};
$("#sources").onclick = (e) => {
  const button = e.target.closest("[data-help]");
  if (button) showHelper(button.dataset.help);
};
$("#helper-sources").onclick = async (e) => {
  const button = e.target.closest("[data-open]");
  if (!button || helperBusy) return;
  helperBusy = true;
  $("#helper-message").textContent = "Opening Chrome…";
  $("#continue").disabled = true;
  try {
    await api("browser/open", {
      source: button.dataset.open,
      role: $("#helper-role").value,
      location: $("#helper-location").value,
    });
    await poll();
    $("#helper-message").textContent = state.manual.message;
  } catch (e) {
    $("#helper-message").textContent = e.message;
  } finally {
    helperBusy = false;
    $("#continue").disabled = !["waiting", "done"].includes(
      state.manual?.status,
    );
  }
};
for (const selector of ["#helper-role", "#helper-location"])
  $(selector).onchange = () => {
    $("#continue").disabled = true;
    $("#helper-message").textContent =
      "Open the portal again to search this role and location before importing.";
  };
$("#continue").onclick = async () => {
  if (helperBusy) return;
  helperBusy = true;
  $("#continue").disabled = true;
  try {
    const result = await api("browser/continue", {});
    notice(result.message);
    $("#helper").close();
    await poll();
  } catch (e) {
    $("#helper-message").textContent = e.message;
  } finally {
    helperBusy = false;
    $("#continue").disabled = false;
  }
};
async function closeHelper() {
  if (helperBusy) return;
  try {
    await api("browser/cancel", {});
    $("#helper").close();
    await poll();
  } catch (e) {
    $("#helper-message").textContent = e.message;
  }
}
$("#close").onclick = closeHelper;
$("#cancel").onclick = closeHelper;
$("#helper").oncancel = (e) => {
  e.preventDefault();
  closeHelper();
};
await poll();
setInterval(poll, 4000);
