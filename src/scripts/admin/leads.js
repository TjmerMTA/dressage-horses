// Leads: newest first, date filter, search, CSV download, and an obvious "New" marker for
// leads that arrived since the last visit.
import { ApiError, api, downloadLeadsCsv } from "./api.js";
import { field, formatDate, h, relativeTime, spinner, toast } from "./ui.js";

const SEEN_KEY = "dh-admin-leads-seen"; // a timestamp only; no lead data is stored in the browser
const REFRESH_MS = 60_000;

let state = { leads: [], from: "", to: "", q: "", seenBefore: "", knownIds: new Set() };
let refreshTimer = null;

function readSeen() {
  try { return localStorage.getItem(SEEN_KEY) || ""; } catch { return ""; }
}
function writeSeen(iso) {
  try { localStorage.setItem(SEEN_KEY, iso); } catch { /* ignore */ }
}

export function setNavNewCount(n) {
  const badge = document.getElementById("nav-new");
  if (!badge) return;
  badge.hidden = n <= 0;
  badge.textContent = n > 0 ? `${n} new` : "";
}

/** Background check for the nav badge (runs after login, cheap: one request). */
export async function refreshNewCount() {
  try {
    const seen = readSeen();
    const r = await api("/admin/leads");
    setNavNewCount(seen ? r.leads.filter((l) => l.createdAt > seen).length : 0);
  } catch { /* the badge is a nicety */ }
}

export function stopLeads() {
  clearInterval(refreshTimer);
  refreshTimer = null;
}

export async function renderLeads(root) {
  stopLeads();
  state = { leads: [], from: "", to: "", q: "", seenBefore: readSeen(), knownIds: new Set() };

  const from = field({ label: "From", input: h("input", { type: "date" }) });
  const to = field({ label: "To", input: h("input", { type: "date" }) });
  const search = field({ label: "Search", input: h("input", { type: "search", placeholder: "Name, number, region…", autocomplete: "off" }) });
  const count = h("p", { class: "adm-count-line", "aria-live": "polite" });
  const list = h("div", { class: "adm-leads" });
  const csvBtn = h("button", { type: "button", class: "btn btn-ghost btn-sm" }, "Download as CSV");
  const refreshBtn = h("button", { type: "button", class: "btn btn-ghost btn-sm" }, "Refresh");
  const filterForm = h("form", { class: "adm-filters", role: "search" },
    from.wrap, to.wrap,
    h("div", { class: "adm-filter-actions" },
      h("button", { type: "submit", class: "btn btn-sm" }, "Show"),
      h("button", { type: "button", class: "adm-link", onclick: () => { from.input.value = ""; to.input.value = ""; load(); } }, "All dates")),
    search.wrap);

  root.replaceChildren(
    h("div", { class: "adm-head" }, h("h2", {}, "Leads"), h("div", { class: "adm-head-actions" }, refreshBtn, csvBtn)),
    h("p", { class: "adm-muted" }, "Everyone who completed the quiz on the site. Newest first. ", zoneNote()),
    filterForm, count, list);

  const draw = () => {
    const q = search.input.value.trim().toLowerCase();
    const shown = q
      ? state.leads.filter((l) => [l.name, l.contact, l.region, l.budget, l.format, l.country, horseName(horseOf(l))].join(" ").toLowerCase().includes(q))
      : state.leads;
    const total = state.leads.length;
    const newCount = state.leads.filter(isNew).length;
    count.textContent = q
      ? `${shown.length} of ${total} lead${total === 1 ? "" : "s"} match “${search.input.value.trim()}”.`
      : `${total} lead${total === 1 ? "" : "s"}${state.from || state.to ? " in the chosen dates" : ""}${newCount ? ` — ${newCount} new since your last visit` : ""}.`;
    if (!total) {
      list.replaceChildren(h("p", { class: "adm-empty" }, state.from || state.to
        ? "No leads in these dates."
        : "No leads yet. When someone completes the quiz on the site, they appear here."));
      return;
    }
    if (!shown.length) {
      list.replaceChildren(h("p", { class: "adm-empty" }, "Nothing matches the search."));
      return;
    }
    list.replaceChildren(table(shown));
  };

  const isNew = (l) => (state.seenBefore ? l.createdAt > state.seenBefore : Date.now() - Date.parse(l.createdAt) < 86400_000);

  const load = async (quiet = false) => {
    state.from = from.input.value;
    state.to = to.input.value;
    from.setError("");
    if (state.from && state.to && state.from > state.to) {
      from.setError("“From” must be on or before “To”.");
      return;
    }
    if (!quiet) list.replaceChildren(spinner("Loading leads…"));
    try {
      const r = await api("/admin/leads", { query: { from: state.from, to: state.to } });
      const fresh = quiet ? r.leads.filter((l) => !state.knownIds.has(l.id)) : [];
      state.leads = r.leads;
      state.knownIds = new Set(r.leads.map((l) => l.id));
      draw();
      if (fresh.length) toast(`${fresh.length} new lead${fresh.length === 1 ? "" : "s"} just arrived.`);
      const newest = r.leads[0] ? r.leads[0].createdAt : "";
      if (newest && newest > readSeen()) writeSeen(newest);
      setNavNewCount(0);
      if (r.truncated) toast("Only the newest 10,000 leads are shown. Use the dates to see older ones.", "err");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      if (!quiet) list.replaceChildren(h("p", { class: "adm-err" }, e.message));
    }
  };

  // Rows carry a "New" badge and a highlight; the badge stays for this visit.
  const table = (leads) => {
    const rows = leads.map((l) => {
      const fresh = isNew(l);
      return h("tr", { class: fresh ? "is-new" : "" },
        h("td", { "data-label": "Received" },
          fresh ? h("span", { class: "adm-badge new" }, "New") : null,
          h("time", { datetime: l.createdAt, title: formatDate(l.createdAt) }, relativeTime(l.createdAt)),
          h("span", { class: "adm-sub" }, formatDate(l.createdAt))),
        h("td", { "data-label": "Name" }, h("strong", {}, l.name), horseLine(l), l.country ? h("span", { class: "adm-sub" }, `From ${l.country}`) : null),
        h("td", { "data-label": "Region" }, l.region),
        h("td", { "data-label": "Budget" }, l.budget),
        h("td", { "data-label": "Buying" }, l.format),
        h("td", { "data-label": "Contact" }, contactCell(l)));
    });
    return h("table", { class: "adm-table" },
      h("caption", { class: "sr-only" }, "Leads, newest first"),
      h("thead", {}, h("tr", {}, ["Received", "Name", "Region", "Budget", "Buying", "Contact"].map((c) => h("th", { scope: "col" }, c)))),
      h("tbody", {}, rows));
  };

  filterForm.addEventListener("submit", (e) => { e.preventDefault(); load(); });
  search.input.addEventListener("input", draw);
  refreshBtn.addEventListener("click", () => load());
  csvBtn.addEventListener("click", async () => {
    csvBtn.disabled = true;
    try {
      await downloadLeadsCsv(from.input.value, to.input.value);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) toast(e.message, "err");
    } finally {
      csvBtn.disabled = false;
    }
  });

  await load();
  refreshTimer = setInterval(() => { if (document.visibilityState === "visible") load(true); }, REFRESH_MS);
}

/**
 * The horse a lead is about. A lead sent from a horse page ("Ask about <horse>") carries
 * the horse only in the page address it was sent from: /#quiz?horse=<slug>, or
 * ?horse=<slug>#quiz. The CSV's `page` column holds the same address.
 */
export function horseOf(lead) {
  try {
    const u = new URL(String(lead.page || ""));
    const fromHash = u.hash.startsWith("#quiz?") ? new URLSearchParams(u.hash.slice(6)).get("horse") : null;
    const slug = fromHash || u.searchParams.get("horse") || "";
    return /^[a-z0-9][a-z0-9-]{0,79}$/.test(slug) ? slug : "";
  } catch {
    return "";
  }
}

/**
 * "donatello-b" → "Donatello B". Only leads sent before the site became one page
 * (2026-11-05) can carry a horse; the horse pages are gone, so this is text, not a link.
 */
const horseName = (slug) => slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

function horseLine(l) {
  const slug = horseOf(l);
  if (!slug) return null;
  return h("span", { class: "adm-sub adm-horse" }, "About ", h("strong", {}, horseName(slug)));
}

/** The list shows the time on this computer's clock; the CSV is in UTC. Say both. */
function zoneNote() {
  let zone = "";
  try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { /* old browser */ }
  return `Times are in your computer’s time zone${zone ? ` (${zone.replace(/_/g, " ")})` : ""}; the CSV file uses UTC.`;
}

function contactCell(l) {
  const c = String(l.contact || "");
  const digits = c.replace(/\D/g, "");
  if (/^[+0-9 ()./-]+$/.test(c) && digits.length >= 7) {
    return [h("span", {}, c), h("a", { class: "adm-sub", href: `https://wa.me/${digits}`, target: "_blank", rel: "noopener noreferrer" }, "Open in WhatsApp")];
  }
  if (/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(c)) {
    return h("a", { href: `mailto:${encodeURIComponent(c).replace(/%40/g, "@")}` }, c);
  }
  return c;
}
