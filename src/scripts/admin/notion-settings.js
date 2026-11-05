// The "Notion" screen: the key, the database, which column a new card lands in, and an off
// switch. The Worker keeps the settings (GET/PUT /admin/notion/config) and reads his database
// for us (POST /admin/notion/check). The key never comes back from the Worker: this screen
// only ever learns whether one is saved and its last four characters.
import { ApiError, api } from "./api.js";
import { confirmDialog, errorBox, field, h, spinner, toast } from "./ui.js";

const TOKEN_RE = /^(?:ntn|secret)_[A-Za-z0-9]{20,120}$/;

/** Same rule as the Worker (worker/src/notion.ts → databaseId): the id from an id or a link. */
export function databaseIdOf(raw) {
  let s = String(raw || "").trim();
  try {
    if (/^https?:\/\//i.test(s)) s = new URL(s).pathname;
  } catch {
    return null;
  }
  const runs = s.replace(/-/g, "").match(/[0-9a-f]{32}/gi);
  return runs ? runs[runs.length - 1].toLowerCase() : null;
}

/** For matching names the way the Worker does: case and spaces do not count. */
const key = (s) => String(s || "").normalize("NFC").replace(/\s+/g, "").toLowerCase();

const CAUSE_TITLE = {
  token: "The key is wrong.",
  access: "Notion can’t see this database.",
  not_database: "That is not a database.",
  down: "Notion isn’t answering.",
};

/** The Worker's short reasons ("stage: …", "comment: …") as sentences. */
function problemText(p) {
  let m = /^stage: no status or select property "(.*)"$/.exec(p);
  if (m) return `There is no Status or Select property called “${m[1]}”, so cards would arrive without a column (the answers are still written into each card).`;
  m = /^stage: "(.*)" has no option "(.*)"; it has: (.*)$/.exec(p);
  if (m) return `“${m[1]}” has no column “${m[2]}” (it has: ${m[3]}), so cards would arrive without a column.`;
  m = /^comment: no text property "(.*)"$/.exec(p);
  if (m) return `There is no Text property called “${m[1]}”, so the answers would go into each card’s page text instead.`;
  return p;
}

const TYPE_LABEL = { title: "title", rich_text: "text", status: "status", select: "select", multi_select: "multi-select", number: "number", date: "date", phone_number: "phone", email: "e-mail", url: "link", checkbox: "checkbox", people: "person", files: "files", created_time: "created time", last_edited_time: "edited time", formula: "formula", relation: "relation", rollup: "rollup" };
const typeLabel = (t) => TYPE_LABEL[t] || t.replace(/_/g, " ");

let dirty = false;
export const isNotionDirty = () => dirty;
export function confirmLeaveNotion() {
  return confirmDialog({
    title: "Leave without saving?",
    body: "The Notion settings you changed are not saved yet.",
    confirmLabel: "Leave without saving", danger: true,
  });
}

export async function renderNotionSettings(root) {
  dirty = false;
  root.replaceChildren(h("h2", {}, "Notion"), spinner("Loading the Notion settings…"));
  let cfg;
  try {
    cfg = await api("/admin/notion/config");
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 401)) root.replaceChildren(h("h2", {}, "Notion"), errorBox(e));
    return;
  }

  /** The last successful check of the database that is on screen, or null. */
  let schema = null;

  // ---- fields ----
  const tokenInput = h("input", {
    type: "password", autocomplete: "off", spellcheck: "false", autocapitalize: "off",
    "data-1p-ignore": "true", "data-lpignore": "true", class: "adm-mono",
  });
  const token = field({ label: "Notion key (Internal Integration Secret)", input: tokenInput, hint: " " });
  const tokenHint = token.wrap.querySelector(".adm-hint");
  const showBtn = h("button", { type: "button", class: "adm-link", "aria-pressed": "false" }, "Show");
  const removeBtn = h("button", { type: "button", class: "adm-link adm-danger-text" }, "Remove the saved key");
  token.wrap.insertBefore(h("div", { class: "adm-item-tools" }, showBtn, removeBtn), token.error);

  const db = field({
    label: "Database link or id",
    input: h("input", { type: "text", autocomplete: "off", spellcheck: "false", placeholder: "https://www.notion.so/…" }),
    hint: " ",
  });
  const dbHint = db.wrap.querySelector(".adm-hint");

  const checkBtn = h("button", { type: "button", class: "btn btn-sm" }, "Check connection");
  const checkOut = h("div", { class: "adm-notion-check", "aria-live": "polite" });

  const names = h("div", { class: "adm-grid" });
  const namesNote = h("p", { class: "adm-hint" });

  const enabled = h("input", { type: "checkbox", id: "notion-enabled" });
  const enabledBox = h("div", { class: "adm-check" }, enabled,
    h("label", { for: enabled.id }, "Send new requests to Notion"),
    h("span", { class: "adm-hint" }, "Untick to stop sending without removing the key. Requests are always kept here under Leads either way."));

  const status = h("div", { role: "status" });
  const saveBtn = h("button", { type: "submit", class: "btn" }, "Save");
  const progress = h("span", { class: "adm-muted", "aria-live": "polite" });

  // The three names: free text until a check has read his database, then drop-downs of it.
  let stageProp, stageValue, commentProp;
  const textName = (label, value, hint) => field({ label, input: h("input", { type: "text", value, autocomplete: "off", spellcheck: "false" }), hint });

  const option = (value, label, selected) => h("option", { value, selected }, label);
  function fillStageValues(select, prop, wanted) {
    const opts = (prop && prop.options) || [];
    const match = opts.find((o) => key(o) === key(wanted));
    select.replaceChildren(
      option("", opts.length ? "Choose a column…" : "This property has no options yet", !match),
      ...opts.map((o) => option(o, o, o === match)));
    select.disabled = !opts.length;
  }

  function drawNames(values) {
    if (!schema) {
      stageProp = textName("Property the board is grouped by", values.stageProp, "A Status (or Select) property. Usually “Face”.");
      stageValue = textName("Column for new requests", values.stageValue, "One of that property’s options, exactly as in Notion. Usually “Lead”.");
      commentProp = textName("Text property for the answers", values.commentProp, "A Text property. Usually “comment on phase”.");
      namesNote.textContent = "Press “Check connection” to choose these from your database instead of typing them.";
    } else {
      const stages = schema.properties.filter((p) => p.type === "status" || p.type === "select");
      const texts = schema.properties.filter((p) => p.type === "rich_text");
      const wantStage = stages.find((p) => key(p.name) === key(values.stageProp)) || stages.find((p) => p.name === schema.use.stageProp);
      const wantComment = texts.find((p) => key(p.name) === key(values.commentProp)) || texts.find((p) => p.name === schema.use.commentProp);
      const sp = h("select", {},
        option("", stages.length ? "Choose a property…" : "Your database has no Status or Select property", !wantStage),
        ...stages.map((p) => option(p.name, `${p.name} (${typeLabel(p.type)})`, p === wantStage)));
      const sv = h("select", {});
      fillStageValues(sv, wantStage, values.stageValue || (wantStage && wantStage.name === schema.use.stageProp ? schema.use.stageValue : ""));
      sp.addEventListener("change", () => {
        fillStageValues(sv, stages.find((p) => p.name === sp.value), "");
        if (!sv.value) sv.focus();
      });
      const cp = h("select", {},
        option("", texts.length ? "Choose a property…" : "Your database has no Text property", !wantComment),
        ...texts.map((p) => option(p.name, p.name, p === wantComment)));
      stageProp = field({ label: "Property the board is grouped by", input: sp, hint: "Your Status and Select properties." });
      stageValue = field({ label: "Column for new requests", input: sv, hint: "The options of that property, as they are in Notion." });
      commentProp = field({ label: "Text property for the answers", input: cp, hint: "Your Text properties." });
      namesNote.textContent = `These lists come from “${schema.database.title || "your database"}”. If you add or rename something in Notion, press “Check connection” again.`;
    }
    names.replaceChildren(stageProp.wrap, stageValue.wrap, commentProp.wrap);
    for (const f of [stageProp, stageValue, commentProp]) {
      f.input.addEventListener("input", markDirty);
      f.input.addEventListener("change", markDirty);
    }
  }
  const currentNames = () => ({ stageProp: stageProp.input.value.trim(), stageValue: stageValue.input.value.trim(), commentProp: commentProp.input.value.trim() });

  // ---- what is on screen ----
  function drawStatus() {
    const where = schema
      ? ` New requests go to “${schema.database.title || "your database"}”, column “${cfg.stageValue}”.`
      : "";
    if (cfg.active) {
      status.className = "adm-note adm-done";
      status.replaceChildren(h("strong", {}, "Notion delivery is on."), where);
    } else if (cfg.token.set && cfg.db && !cfg.enabled) {
      status.className = "adm-warn";
      status.replaceChildren(h("strong", {}, "Notion delivery is off. "),
        "New requests are kept here under Leads, but no card is made in Notion. The key and the database are kept: tick “Send new requests to Notion” and save to switch it back on.");
    } else {
      status.className = "adm-note";
      status.replaceChildren(h("strong", {}, "Notion is not set up yet. "),
        "Paste the key and the database link below, press “Check connection”, then Save.");
    }
  }

  function drawTokenHint() {
    removeBtn.hidden = !cfg.token.set;
    if (cfg.token.set) {
      tokenHint.textContent = `A key is saved${cfg.token.last4 ? ` — it ends in …${cfg.token.last4}` : ""}. Leave this empty to keep it, or paste a new key to replace it.`;
      tokenInput.placeholder = cfg.token.last4 ? `Saved — ends in …${cfg.token.last4}` : "Saved";
    } else {
      tokenHint.textContent = "Starts with ntn_. In Notion: notion.so/my-integrations → your integration → Configuration → Internal Integration Secret → Show → Copy.";
      tokenInput.placeholder = "ntn_…";
    }
  }

  function drawDbHint() {
    const raw = db.input.value.trim();
    if (!raw) dbHint.textContent = "In Notion, open the database as a full page → ••• (top right) → Copy link, and paste the link here.";
    else {
      const id = databaseIdOf(raw);
      dbHint.textContent = id ? `Database id: ${id}` : "This doesn’t contain a database id. Copy the link of the database itself (••• → Copy link).";
    }
  }

  function showCheck(r) {
    if (r.ok) {
      const lines = [
        h("p", {}, h("strong", {}, `Connected to “${r.database.title || "your database"}”.`),
          ` A new card gets the visitor’s name as its title${r.use.stageValue ? `, goes into the column “${r.use.stageValue}” of “${r.use.stageProp}”` : ""}${r.use.commentProp ? `, and gets every answer as text in “${r.use.commentProp}”` : ""}.`),
      ];
      const problems = (r.problems || []).map(problemText);
      const props = h("details", {}, h("summary", {}, `What Notion told us: ${r.properties.length} propert${r.properties.length === 1 ? "y" : "ies"}`),
        h("ul", { class: "adm-notion-props" }, r.properties.map((p) => h("li", {},
          h("strong", {}, p.name), ` — ${typeLabel(p.type)}`,
          p.options && p.options.length ? h("span", { class: "adm-sub" }, `Options: ${p.options.join(", ")}`) : null))));
      checkOut.replaceChildren(
        h("div", { class: problems.length ? "adm-warn" : "adm-note adm-done" }, lines,
          problems.length ? h("ul", {}, problems.map((p) => h("li", {}, p))) : null),
        props);
    } else {
      checkOut.replaceChildren(h("div", { class: "adm-warn", role: "alert" },
        h("strong", {}, CAUSE_TITLE[r.cause] || "It didn’t work. "), " ", r.message));
    }
  }

  // ---- actions ----
  function markDirty() {
    dirty = true;
    progress.textContent = "Not saved yet.";
  }

  /** Validates what is typed; returns the body pieces or null (and marks the fields). */
  function typed() {
    const t = tokenInput.value.trim();
    const d = db.input.value.trim();
    let ok = true;
    if (t && !TOKEN_RE.test(t)) {
      token.setError("This doesn’t look like a Notion key. It starts with ntn_ and has no spaces. Copy it again with the Copy button in Notion.");
      ok = false;
    }
    if (d && !databaseIdOf(d)) {
      db.setError("This doesn’t contain a database id. In Notion: open the database as a full page → ••• → Copy link.");
      ok = false;
    }
    return ok ? { token: t, db: d } : null;
  }

  async function runCheck(body) {
    checkBtn.disabled = true;
    checkOut.replaceChildren(spinner("Asking Notion…"));
    try {
      const r = await api("/admin/notion/check", { method: "POST", json: body });
      showCheck(r);
      return r;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return null;
      const s = (e && e.serverMessage) || "";
      if (/^no token/.test(s)) checkOut.replaceChildren(h("p", { class: "adm-err", role: "alert" }, "Paste the Notion key first."));
      else if (/^no database/.test(s)) checkOut.replaceChildren(h("p", { class: "adm-err", role: "alert" }, "Paste the database link first."));
      else if (e instanceof ApiError && e.status === 429) checkOut.replaceChildren(h("p", { class: "adm-err", role: "alert" }, "That was a lot of checks in a short time. Wait a few minutes and try again."));
      else checkOut.replaceChildren(errorBox(e));
      return null;
    } finally {
      checkBtn.disabled = false;
    }
  }

  checkBtn.addEventListener("click", async () => {
    token.setError("");
    db.setError("");
    const t = typed();
    if (!t) return;
    const keep = currentNames();
    const r = await runCheck({ ...(t.token ? { token: t.token } : {}), ...(t.db ? { db: t.db } : {}), ...keep });
    if (r && r.ok) {
      schema = r;
      drawNames(keep);
      drawStatus();
    }
  });

  showBtn.addEventListener("click", () => {
    const show = tokenInput.type === "password";
    tokenInput.type = show ? "text" : "password";
    showBtn.textContent = show ? "Hide" : "Show";
    showBtn.setAttribute("aria-pressed", String(show));
  });

  removeBtn.addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Remove the Notion key?",
      body: ["Notion delivery stops at once. New requests are still kept here under Leads.",
        "To switch Notion on again later, you will need to paste a key again. To pause delivery and keep the key, untick “Send new requests to Notion” instead."],
      confirmLabel: "Remove the key", danger: true,
    });
    if (!ok) return;
    try {
      cfg = await api("/admin/notion/config", { method: "PUT", json: { removeToken: true } });
      tokenInput.value = "";
      drawTokenHint();
      drawStatus();
      checkOut.replaceChildren();
      toast("The Notion key is removed. Notion delivery is off.");
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) toast(e.message, "err");
    }
  });

  db.input.addEventListener("input", () => {
    drawDbHint();
    // Another database: the lists no longer describe it.
    if (schema && databaseIdOf(db.input.value) !== schema.database.id) {
      const keep = currentNames();
      schema = null;
      drawNames(keep);
      checkOut.replaceChildren();
    }
  });
  for (const el of [tokenInput, db.input, enabled]) {
    el.addEventListener("input", markDirty);
    el.addEventListener("change", markDirty);
  }

  const form = h("form", { class: "adm-form", novalidate: true },
    status,
    h("fieldset", { class: "adm-section" }, h("legend", {}, "1. Connection"),
      token.wrap, db.wrap,
      h("div", { class: "adm-item-tools" }, checkBtn), checkOut),
    h("fieldset", { class: "adm-section" }, h("legend", {}, "2. Where the card goes"),
      h("p", { class: "adm-muted" }, "Every new request becomes a card in that database, in the column you pick here, with all the answers as text in the text property you pick. The visitor’s name is the card’s title."),
      names, namesNote),
    h("fieldset", { class: "adm-section" }, h("legend", {}, "3. Delivery"), enabledBox),
    h("div", { class: "adm-form-bar" }, saveBtn, progress));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    token.setError("");
    db.setError("");
    const t = typed();
    if (!t) return;
    if (schema && stageProp.input.value && !stageValue.input.value) {
      stageValue.setError("Choose the column new requests should land in.");
      stageValue.input.focus();
      return;
    }
    const body = {
      ...(t.token ? { token: t.token } : {}),
      db: t.db,
      ...currentNames(),
      enabled: enabled.checked,
    };
    if (!t.db && cfg.db) {
      const ok = await confirmDialog({
        title: "Save without a database?",
        body: "The database field is empty, so Notion delivery stops until a database link is pasted again.",
        confirmLabel: "Save", danger: true,
      });
      if (!ok) return;
    }
    saveBtn.disabled = true;
    progress.textContent = "Saving…";
    try {
      cfg = await api("/admin/notion/config", { method: "PUT", json: body });
      dirty = false;
      tokenInput.value = "";
      tokenInput.type = "password";
      showBtn.textContent = "Show";
      db.input.value = cfg.db;
      drawTokenHint();
      drawDbHint();
      drawStatus();
      progress.textContent = "Saved. Checking the connection…";
      // Never leave the screen not knowing whether it works: check what was just saved.
      const r = cfg.token.set && cfg.db ? await runCheck({}) : null;
      if (r && r.ok) {
        schema = r;
        drawNames(currentNames());
        drawStatus();
      }
      progress.textContent = !cfg.token.set || !cfg.db ? "Saved. Notion stays off until both the key and the database are set."
        : r && r.ok && !r.problems.length ? (cfg.active ? "Saved. Notion works." : "Saved. Notion works, but delivery is switched off.")
          : r && r.ok ? "Saved. Notion answers, but see the warning above." : "Saved, but the check failed: see above.";
      toast("Notion settings saved.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { progress.textContent = "Not saved yet."; return; }
      const s = err.serverMessage || "";
      if (/token/.test(s)) token.setError("This doesn’t look like a Notion key. It starts with ntn_ and has no spaces.");
      else if (/database|field: db/.test(s)) db.setError("This doesn’t contain a database id. In Notion: open the database as a full page → ••• → Copy link.");
      else toast(err.message, "err");
      progress.textContent = "Not saved.";
    } finally {
      saveBtn.disabled = false;
    }
  });

  db.input.value = cfg.db;
  enabled.checked = cfg.enabled;
  drawTokenHint();
  drawDbHint();
  drawNames(cfg);
  drawStatus();
  root.replaceChildren(
    h("h2", {}, "Notion"),
    h("p", { class: "adm-muted" }, "Every request someone sends through the quiz can also become a card in your own Notion database. Set it up here once; it keeps working until you change it."),
    form);

  // Already set up: read his database right away, so the lists show what is really there.
  if (cfg.token.set && cfg.db) {
    const r = await runCheck({});
    if (r && r.ok) {
      schema = r;
      drawNames(cfg);
      drawStatus();
    }
  }
}
