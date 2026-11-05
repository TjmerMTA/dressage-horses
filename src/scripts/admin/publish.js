// "Saved → publishing… → published": follows each commit the panel makes until the live
// site really serves it. Two sources, both truthful:
//   - /version.json on the live site says which commit it was built from;
//   - the Worker's /admin/deploy-status reports the GitHub Actions run (queued, building,
//     failed). If the token can't read Actions, the panel relies on /version.json alone.
import { ApiError, api } from "./api.js";
import { VERSION_URL } from "./config.js";
import { h } from "./ui.js";

const KEY = "dh-admin-publishing";
const POLL_MS = 6000;
const SLOW_MS = 10 * 60 * 1000;
const CDN_GRACE_MS = 2 * 60 * 1000;

/** @type {{sha:string,label:string,at:number,state:string,url?:string,doneAt?:number,successAt?:number}[]} */
let items = load();
let timer = null;
let dismissedSha = "";

function load() {
  try { return JSON.parse(sessionStorage.getItem(KEY) || "[]").filter((x) => /^[0-9a-f]{40}$/.test(x.sha)); } catch { return []; }
}
function save() {
  try { sessionStorage.setItem(KEY, JSON.stringify(items.slice(-20))); } catch { /* memory only */ }
}

const open = () => items.filter((x) => x.state !== "published" && x.state !== "failed");

/** Call after every successful commit. */
export function trackCommit(sha, label) {
  if (!/^[0-9a-f]{40}$/.test(sha || "")) return;
  items.push({ sha, label, at: Date.now(), state: "saved" });
  dismissedSha = "";
  save();
  render();
  schedule(1500);
}

export function startPublishWatcher() {
  render();
  if (open().length) schedule(500);
}

export function stopPublishWatcher() {
  clearTimeout(timer);
  timer = null;
}

function schedule(ms = POLL_MS) {
  clearTimeout(timer);
  timer = setTimeout(tick, ms);
}

async function liveCommit() {
  try {
    const sep = VERSION_URL.includes("?") ? "&" : "?";
    const r = await fetch(`${VERSION_URL}${sep}t=${Date.now()}`, { cache: "no-store", credentials: "omit" });
    if (!r.ok) return { available: false, commit: null };
    const j = await r.json();
    return { available: typeof j.commit === "string" && /^[0-9a-f]{40}$/.test(j.commit), commit: j.commit || null };
  } catch {
    return { available: false, commit: null };
  }
}

function markPublishedUpTo(index, now) {
  for (let i = 0; i <= index; i++) {
    if (items[i].state !== "failed") {
      items[i].state = "published";
      items[i].doneAt = items[i].doneAt || now;
    }
  }
}

async function tick() {
  const pending = open();
  if (!pending.length) return render();
  const now = Date.now();
  const newest = pending[pending.length - 1];

  const live = await liveCommit();
  if (live.commit) {
    const idx = items.findIndex((x) => x.sha === live.commit);
    if (idx !== -1 && items.indexOf(newest) <= idx) {
      markPublishedUpTo(idx, now);
      save();
      render();
      return;
    }
    if (idx !== -1) markPublishedUpTo(idx, now); // an older change is live; keep watching the newer one
  }

  let status = null;
  try {
    status = await api("/admin/deploy-status", { query: { sha: newest.sha } });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) { render(); return; } // logged out: stop quietly
  }

  if (status && status.available) {
    let run = status.run;
    // A queued run that a newer push replaced is "cancelled"; the newer run contains this change.
    if (run && run.conclusion === "cancelled" && status.latest && status.latest.createdAt >= run.createdAt) run = status.latest;
    if (!run) newest.state = now - newest.at > 5 * 60 * 1000 ? "slow" : "saved";
    else if (run.status !== "completed") newest.state = run.status === "in_progress" ? "building" : "queued";
    else if (run.conclusion === "success") {
      newest.successAt = newest.successAt || now;
      // The deploy finished. Say "published" once the live site shows it, or, if the site
      // has no version file to ask, straight away.
      if (!live.available || now - newest.successAt > CDN_GRACE_MS) markPublishedUpTo(items.indexOf(newest), now);
      else newest.state = "finishing";
    } else if (run.conclusion === "cancelled") {
      newest.state = now - newest.at > SLOW_MS ? "slow" : "queued";
    } else {
      newest.state = "failed";
      newest.url = run.url || "";
    }
    if (run && run.url) newest.url = run.url;
  } else if (now - newest.at > SLOW_MS) {
    newest.state = "slow";
  } else if (newest.state === "saved" && now - newest.at > 20_000) {
    newest.state = "building";
  }

  save();
  render();
  if (open().length) schedule();
}

const TEXT = {
  saved: "is saved. The site will rebuild — this usually takes about a minute.",
  queued: "is saved. Waiting for the site build to start…",
  building: "is saved. Building the new version of the site…",
  finishing: "is built. Putting the new version live…",
  slow: "is saved, but the site hasn't updated after 10 minutes. It isn't live yet.",
};

function render() {
  const bar = document.getElementById("publish-bar");
  if (!bar) return;
  const latest = items[items.length - 1];
  if (!latest || latest.sha === dismissedSha) {
    bar.hidden = true;
    bar.replaceChildren();
    return;
  }
  const others = open().length - (open().includes(latest) ? 1 : 0);
  const dismiss = h("button", { type: "button", class: "adm-link", onclick: () => { dismissedSha = latest.sha; render(); } }, "Hide");
  let content;
  if (latest.state === "published") {
    if (Date.now() - (latest.doneAt || 0) > 60_000) { bar.hidden = true; return; }
    content = [h("span", { class: "adm-dot ok", "aria-hidden": "true" }), h("span", {}, `Published — “${latest.label}” is saved and the site has been rebuilt. `),
      h("a", { href: "/", target: "_blank", rel: "noopener" }, "View site"), dismiss];
    bar.dataset.state = "ok";
  } else if (latest.state === "failed") {
    content = [h("span", { class: "adm-dot err", "aria-hidden": "true" }),
      h("span", {}, `The site build failed. “${latest.label}” is saved but NOT live yet. `),
      latest.url ? h("a", { href: latest.url, target: "_blank", rel: "noopener" }, "See what went wrong") : null, dismiss];
    bar.dataset.state = "err";
  } else {
    content = [h("span", { class: latest.state === "slow" ? "adm-dot warn" : "adm-spin", "aria-hidden": "true" }),
      h("span", {}, `Publishing… “${latest.label}” ${TEXT[latest.state] || TEXT.saved}`),
      others > 0 ? h("span", { class: "adm-muted" }, ` (${others} earlier change${others === 1 ? "" : "s"} too)`) : null,
      latest.url ? h("a", { href: latest.url, target: "_blank", rel: "noopener" }, " Build details") : null];
    bar.dataset.state = latest.state === "slow" ? "warn" : "busy";
  }
  bar.replaceChildren(h("div", { class: "wrap adm-publish-in" }, content));
  bar.hidden = false;
  if (latest.state === "published") setTimeout(render, 61_000);
}

/** True while some change is saved but not live yet (used to warn before logging out). */
export const hasUnpublished = () => open().length > 0;
