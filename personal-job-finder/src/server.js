import http from "node:http";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rankJobs } from "./matching.js";
import { makeProfile, inferProfile } from "./profile.js";
import { portalLinks } from "./portals.js";
import { ManualBrowser } from "./browser.js";
const src = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(src);
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const browser = new ManualBrowser(root);
let manual = { status: "idle", source: null, message: "" };
const dir = path.join(root, "data");
await mkdir(dir, { recursive: true, mode: 0o700 });
const python = process.env.JOB_PYTHON || path.join(root, ".venv/bin/python");
const port = Number(process.env.PORT || 3211);
async function read(name, fallback) {
  try {
    return JSON.parse(await readFile(path.join(dir, name), "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return fallback;
    throw e;
  }
}
async function save(name, value) {
  const f = path.join(dir, name);
  await writeFile(f + ".tmp", JSON.stringify(value), { mode: 0o600 });
  await rename(f + ".tmp", f);
}
let profile = await read("profile.json", null),
  cache = await read("jobs.json", { rows: [], sources: [], updatedAt: null });
let run = { running: false, progress: "", startedAt: null, error: null };
function worker(input, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, [path.join(src, "worker.py")], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "",
      errors = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(Error("Source timed out; retry later."));
    }, timeout);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(
        Error(
          e.code === "ENOENT"
            ? "Python environment missing. Run the setup commands in README."
            : e.message,
        ),
      );
    });
    child.stdout.on("data", (b) => {
      output += b;
      if (output.length > 15000000) child.kill("SIGKILL");
    });
    child.stderr.on("data", (b) => {
      errors = (errors + b).slice(-6000);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        const result = JSON.parse(output);
        if (result.error) reject(Error(result.error));
        else if (code) reject(Error("Source process failed"));
        else resolve({ ...result, warnings: errors });
      } catch {
        reject(Error("Source returned no usable response."));
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(input));
  });
}
async function refresh() {
  if (run.running || !profile) return;
  const snapshot = structuredClone(profile);
  run = {
    running: true,
    startedAt: new Date().toISOString(),
    progress: "Starting searches…",
    error: null,
  };
  cache = {
    ...cache,
    rows: cache.rows.filter((j) => j.browserCollected),
    sources: [],
  };
  const rows = [],
    sources = [];
  try {
    for (const source of snapshot.sources) {
      let count = 0;
      const errors = [],
        warnings = [];
      for (const role of snapshot.roles)
        for (const location of snapshot.locations) {
          run.progress = `Searching ${source}: ${role} · ${location}`;
          try {
            const result = await worker({ source, role, location });
            rows.push(
              ...result.jobs.map((job) => ({
                ...job,
                searchRoles: [role],
                searchLocations: [location],
              })),
            );
            count += result.jobs.length;
            const diagnostic = result.warnings
              .split("\n")
              .filter((line) => /\b(?:ERROR|WARNING)\b/.test(line))
              .join("\n");
            if (diagnostic) warnings.push(diagnostic);
          } catch (e) {
            errors.push(`${role} / ${location}: ${e.message}`);
          }
        }
      sources.push({
        source,
        count,
        status: errors.length
          ? "error"
          : warnings.length
            ? "warning"
            : count
              ? "ok"
              : "empty",
        errors,
        warnings,
        checkedAt: new Date().toISOString(),
      });
      cache = {
        rows: [...rows, ...cache.rows.filter((j) => j.browserCollected)],
        sources: [...sources],
        updatedAt: cache.updatedAt,
      };
    }
    cache = {
      rows: [...rows, ...cache.rows.filter((j) => j.browserCollected)],
      sources,
      updatedAt: new Date().toISOString(),
    };
    await save("jobs.json", cache);
  } catch (e) {
    run.error = e.message;
  } finally {
    run.running = false;
    run.progress = "";
  }
}
setInterval(() => {
  if (
    profile?.hourly &&
    !["opening", "waiting"].includes(manual.status) &&
    !run.running &&
    (!cache.updatedAt || Date.now() - Date.parse(cache.updatedAt) >= 3600000)
  )
    void refresh();
}, 30000).unref();
const send = (res, status, value) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
};
async function body(req) {
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 12000000) throw Error("Request too large");
  }
  return JSON.parse(data);
}
const assets = {
  "/": ["index.html", "text/html"],
  "/app.js": ["app.js", "text/javascript"],
  "/time.js": ["time.js", "text/javascript"],
  "/style.css": ["style.css", "text/css"],
};
const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  );
  if (![`localhost:${port}`, `127.0.0.1:${port}`].includes(req.headers.host))
    return send(res, 403, { error: "Local access only" });
  if (
    req.headers.origin &&
    !["http://localhost:" + port, "http://127.0.0.1:" + port].includes(
      req.headers.origin,
    )
  )
    return send(res, 403, { error: "Origin denied" });
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  try {
    if (req.method === "GET" && url.pathname === "/api/state")
      return send(res, 200, {
        profile,
        run,
        updatedAt: cache.updatedAt,
        sources: ["linkedin", "naukri", "google", "indeed"].map((source) => {
          const info = cache.sources.find((s) => s.source === source) || {
            source,
            count: 0,
            status: "not searched",
            errors: [],
            warnings: [],
          };
          const filtered = profile
            ? rankJobs(
                cache.rows.filter((j) => j.site === source),
                profile,
              )
            : { jobs: [], stats: {} };
          return {
            ...info,
            eligible: filtered.jobs.length,
            filtered: filtered.stats,
          };
        }),
        googleApiConfigured: !!process.env.SERPAPI_API_KEY,
        manual,
        portals: profile ? portalLinks(profile) : [],
        ...(profile ? rankJobs(cache.rows, profile) : { jobs: [], stats: {} }),
      });
    if (req.method === "POST") {
      if (!req.headers["content-type"]?.startsWith("application/json"))
        return send(res, 415, { error: "JSON required" });
      const data = await body(req);
      if (url.pathname === "/api/filters") {
        if (!profile) throw Error("Save your resume first");
        if (run.running || ["opening", "waiting"].includes(manual.status))
          throw Error("Finish the current search or helper step first.");
        profile = makeProfile({
          ...profile,
          experience: data.experience,
          minimumLpa: data.minimumLpa,
        });
        await save("profile.json", profile);
        return send(res, 200, { ok: true });
      }
      if (url.pathname === "/api/profile") {
        if (run.running || ["opening", "waiting"].includes(manual.status))
          return send(res, 409, {
            error:
              "Finish the current search or close the browser helper before changing your resume.",
          });
        profile = makeProfile(data);
        await save("profile.json", profile);
        cache = { rows: [], sources: [], updatedAt: null };
        await save("jobs.json", cache);
        return send(res, 200, { ok: true });
      }
      if (url.pathname === "/api/refresh") {
        if (!profile) throw Error("Save your resume first");
        if (["opening", "waiting"].includes(manual.status))
          throw Error("Finish or cancel the manual browser step first.");
        if (run.running) return send(res, 202, { ok: true });
        if (cache.updatedAt && Date.now() - Date.parse(cache.updatedAt) < 60000)
          return send(res, 429, {
            error: "Wait one minute before refreshing again.",
          });
        void refresh();
        return send(res, 202, { ok: true });
      }
      if (url.pathname === "/api/resume") {
        if (
          !["pdf", "docx", "txt"].includes(data.extension) ||
          typeof data.data !== "string"
        )
          throw Error("Upload PDF, DOCX or TXT");
        const result = await worker({ ...data, action: "resume" }, 30000);
        return send(res, 200, {
          ...result,
          suggestions: inferProfile(result.text),
        });
      }
      if (url.pathname === "/api/browser/cancel") {
        manual = { status: "idle", source: null, message: "" };
        return send(res, 200, { ok: true });
      }
      if (url.pathname === "/api/infer") {
        if (typeof data.resume !== "string" || data.resume.length > 150000)
          throw Error("Invalid resume");
        return send(res, 200, inferProfile(data.resume));
      }
      if (url.pathname === "/api/browser/open") {
        if (!profile) throw Error("Save your resume first");
        if (run.running)
          throw Error(
            "Wait for the automatic search to finish before opening the helper.",
          );
        if (browser.busy) throw Error("The helper is busy. Please wait.");
        const role = data.role || profile.roles[0],
          location = data.location || profile.locations[0];
        if (
          !profile.roles.includes(role) ||
          !profile.locations.includes(location)
        )
          throw Error("Choose a saved role and location");
        const portal = portalLinks({
          ...profile,
          roles: [role],
          locations: [location],
        }).find(
          (p) => p.id === data.source && p.mode === "automatic + browser",
        );
        if (!portal) throw Error("Unsupported source");
        manual = {
          status: "opening",
          source: portal.id,
          message: "Opening a separate Chrome window…",
        };
        try {
          await browser.open({ ...portal, role, location });
          manual = {
            status: "waiting",
            source: portal.id,
            role,
            location,
            message:
              "Complete sign-in or CAPTCHA in Chrome. Then press Continue here to read that same page.",
          };
        } catch (e) {
          manual = { status: "error", source: portal.id, message: e.message };
          throw e;
        }
        return send(res, 200, manual);
      }
      if (url.pathname === "/api/browser/continue") {
        if (run.running)
          throw Error("Wait for the automatic search to finish.");
        try {
          const result = await browser.collect();
          const map = new Map(cache.rows.map((j) => [j.job_url, j]));
          for (const job of result.rows) {
            const key = job.job_url;
            const old = map.get(key);
            map.set(key, {
              ...job,
              searchRoles: [
                ...new Set([
                  ...(old?.searchRoles || []),
                  ...(job.searchRoles || []),
                ]),
              ],
            });
          }
          cache.rows = [...map.values()];
          cache.sources = cache.sources.filter(
            (s) => s.source !== result.source,
          );
          cache.sources.push({
            source: result.source,
            count: cache.rows.filter((j) => j.site === result.source).length,
            status: "browser",
            errors: [],
            warnings: result.undated
              ? [
                  `${result.undated} listings omitted because their posting date was missing.`,
                ]
              : [],
            checkedAt: new Date().toISOString(),
          });
          await save("jobs.json", cache);
          manual = {
            status: "done",
            source: result.source,
            role: browser.role,
            location: browser.location,
            message: `Read ${result.rows.length} dated listings. The feed still applies freshness, experience and salary filters. Scroll the portal for more listings and import again, or choose another role.`,
          };
        } catch (e) {
          manual = { ...manual, status: "waiting", message: e.message };
          return send(res, 422, { error: e.message });
        }
        return send(res, 200, manual);
      }
    }
    if (req.method === "GET" && assets[url.pathname]) {
      const [file, type] = assets[url.pathname];
      res.writeHead(200, { "Content-Type": type });
      return res.end(await readFile(path.join(root, "public", file)));
    }
    send(res, 404, { error: "Not found" });
  } catch (e) {
    send(res, 400, { error: e.message });
  }
});
server.listen(port, "127.0.0.1", () => {
  console.log(`Personal Job Finder is ready at http://localhost:${port}`);
  if (profile) void refresh();
});
