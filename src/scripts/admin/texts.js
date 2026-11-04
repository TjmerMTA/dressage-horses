// Texts: the JSON files in src/content/texts/ as friendly forms, and the Markdown pages in
// src/content/pages/ (privacy, imprint). The structure of each JSON file is the site's, so
// the form is built from the file itself; the panel never adds or renames keys.
import { ApiError, listDir, photoUrl, readFile, writeFile } from "./api.js";
import {
  HIDDEN_TEXT_KEYS, KEY_LABELS, PAGES_DIR, PHOTO_PREFIX, PHOTOS_DIR, TEXT_FILE_LABELS, TEXT_FILE_ORDER, TEXTS_DIR,
} from "./config.js";
import { buildFrontMatter, parseFrontMatter, valuesOf } from "./frontmatter.js";
import { refreshGoLiveCount } from "./golive.js";
import { trackCommit } from "./publish.js";
import { IMPRINT_FIELDS, displayName, isSet, socialHref, unsetValues, whatsappHref } from "../site-values.js";
import { confirmDialog, errorBox, field, h, nextId, spinner, toast } from "./ui.js";

let dirty = false;
export const isTextsDirty = () => dirty;
export async function confirmLeaveTexts() {
  if (!dirty) return true;
  const ok = await confirmDialog({
    title: "Leave without saving?", body: "Your changes to this text have not been saved and will be lost.",
    confirmLabel: "Leave without saving", cancelLabel: "Stay here", danger: true,
  });
  if (ok) dirty = false;
  return ok;
}

const humanize = (k) => {
  const s = String(k).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const labelFor = (key) => KEY_LABELS[key] || humanize(key);
const ITEM_NAMES = { steps: "Step", items: "Item", ticks: "Point", paragraphs: "Paragraph", figures: "Figure", channels: "Channel", links: "Link", nav: "Menu item", options: "Answer", includes: "Included" };
const itemName = (parentKey, i) => `${ITEM_NAMES[parentKey] || "Item"} ${i + 1}`;
const LONG_KEYS = new Set(["text", "lead", "intro", "description", "consent", "thanksText", "paragraphs"]);
const fileLabel = (name) => TEXT_FILE_LABELS[name] || humanize(name.replace(/\.(json|md)$/, ""));

/** "nav[].href"-style pattern for a path like ["nav", 2, "href"]. */
const pattern = (path) => path.reduce((acc, p) => (typeof p === "number" ? `${acc}[]` : acc ? `${acc}.${p}` : p), "");
const get = (obj, path) => path.reduce((o, k) => (o == null ? o : o[k]), obj);
const setAt = (obj, path, value) => {
  const last = path[path.length - 1];
  get(obj, path.slice(0, -1))[last] = value;
};
const clone = (x) => JSON.parse(JSON.stringify(x));
const blankLike = (x) => (Array.isArray(x) ? [] : x && typeof x === "object"
  ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, blankLike(v)])) : typeof x === "string" ? "" : x);

export async function renderTexts(root, route = "") {
  dirty = false;
  const [kind, name, focus = ""] = route.split("/");
  if (kind === "t" && /^[\w-]+\.json$/.test(name || "")) return renderJsonFile(root, name, decodeURIComponent(focus));
  if (kind === "p" && /^[\w-]+\.md$/.test(name || "")) return renderPage(root, name, decodeURIComponent(focus));

  root.replaceChildren(spinner("Loading the texts…"));
  let json;
  let md;
  try {
    [json, md] = await Promise.all([listDir(TEXTS_DIR), listDir(PAGES_DIR)]);
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 401)) root.replaceChildren(h("h2", {}, "Texts"), errorBox(e));
    return;
  }
  const files = [
    ...json.filter((e) => e.name.endsWith(".json")).map((e) => ({ name: e.name, href: `#/texts/t/${e.name}` })),
    ...md.filter((e) => e.name.endsWith(".md")).map((e) => ({ name: e.name, href: `#/texts/p/${e.name}` })),
  ].sort((a, b) => (TEXT_FILE_ORDER.indexOf(a.name) + 1 || 99) - (TEXT_FILE_ORDER.indexOf(b.name) + 1 || 99));
  const HINTS = {
    "site.json": "Company name, WhatsApp number, Instagram and TikTok, menu and footer.",
    "home.json": "Everything on the home page, including the quiz questions.",
    "services.json": "The Services page.",
    "about.json": "The About page: figures, story, why us.",
    "contact.json": "The Contact page.",
    "privacy.md": "The privacy policy page.",
    "imprint.md": "The imprint (company details) page.",
  };
  root.replaceChildren(
    h("h2", {}, "Texts"),
    h("p", { class: "adm-muted" }, "Choose what to edit. Each save updates the site in about a minute."),
    h("ul", { class: "adm-cards" }, files.map((f) => h("li", {},
      h("a", { class: "adm-card adm-card-link", href: f.href }, h("strong", {}, fileLabel(f.name)), h("span", { class: "adm-sub" }, HINTS[f.name] || f.name))))));
}

// ---- JSON files ------------------------------------------------------------------------

async function renderJsonFile(root, name, focus = "") {
  const renderer = renderJsonFile;
  const path = `${TEXTS_DIR}/${name}`;
  root.replaceChildren(spinner("Opening…"));
  let file;
  let original;
  let library = [];
  try {
    [file, library] = await Promise.all([readFile(path), listDir(PHOTOS_DIR)]);
    original = JSON.parse(file.content);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return;
    root.replaceChildren((e instanceof SyntaxError ? h("p", { class: "adm-err" }, "This file is not valid JSON, so the panel can’t edit it.") : errorBox(e)), h("a", { href: "#/texts" }, "Back to the texts"));
    return;
  }
  library = library.filter((e) => /\.(jpe?g|png|webp)$/i.test(e.name)).map((e) => e.name).sort();
  let sha = file.sha;
  const indent = /^\{\n(\t|\s+)"/.exec(file.content)?.[1] || "  ";
  const state = clone(original);
  /** @type {(() => string)[]} validators: return "" or an error and mark the field */
  let checks = [];
  const formBody = h("div");

  const draw = () => {
    checks = [];
    formBody.replaceChildren(node(state, [], name));
  };

  const node = (value, path, key) => {
    if (path.length && HIDDEN_TEXT_KEYS.has(`${name}:${pattern(path)}`)) return null;
    if (Array.isArray(value)) return arrayNode(value, path, key);
    if (value && typeof value === "object") {
      const kids = Object.entries(value).map(([k, v]) => node(v, [...path, k], k)).filter(Boolean);
      if (!path.length) return h("div", { class: "adm-json" }, kids);
      return h("fieldset", { class: "adm-section" }, h("legend", {}, typeof key === "number" ? key : labelFor(key)), kids);
    }
    return leaf(value, path, key);
  };

  const arrayNode = (arr, path, key) => {
    const objects = arr.length > 0 && arr.every((x) => x && typeof x === "object" && !Array.isArray(x));
    // A list whose items carry technical keys (links, menu targets) or a fixed count keeps its length.
    const fixed = objects && (Object.keys(arr[0]).some((k) => HIDDEN_TEXT_KEYS.has(`${name}:${pattern([...path, 0, k])}`)) || pattern(path) === "quiz.steps");
    const minLen = key === "options" ? 2 : 1;
    const items = arr.map((item, i) => {
      const tools = fixed ? null : h("div", { class: "adm-item-tools" },
        h("button", { type: "button", class: "adm-icon", "aria-label": `Move ${itemName(key, i)} up`, disabled: i === 0, onclick: () => { arr.splice(i - 1, 0, arr.splice(i, 1)[0]); dirty = true; draw(); } }, "↑"),
        h("button", { type: "button", class: "adm-icon", "aria-label": `Move ${itemName(key, i)} down`, disabled: i === arr.length - 1, onclick: () => { arr.splice(i + 1, 0, arr.splice(i, 1)[0]); dirty = true; draw(); } }, "↓"),
        h("button", { type: "button", class: "adm-link adm-danger-text", disabled: arr.length <= minLen, onclick: () => { arr.splice(i, 1); dirty = true; draw(); } }, `Remove ${itemName(key, i).toLowerCase()}`));
      if (objects) {
        const kids = Object.entries(item).map(([k, v]) => node(v, [...path, i, k], k)).filter(Boolean);
        return h("fieldset", { class: "adm-item" }, h("legend", {}, itemName(key, i)), kids, tools);
      }
      return h("div", { class: "adm-item adm-item-inline" }, leaf(item, [...path, i], key, itemName(key, i)), tools);
    });
    const add = fixed ? null : h("button", { type: "button", class: "btn btn-ghost btn-sm", onclick: () => {
      arr.push(arr.length ? blankLike(arr[arr.length - 1]) : "");
      dirty = true;
      draw();
    } }, `Add ${ (ITEM_NAMES[key] || "item").toLowerCase() }`);
    return h("fieldset", { class: "adm-section" }, h("legend", {}, labelFor(key)), items, add);
  };

  const leaf = (value, path, key, label) => {
    const origValue = get(original, path);
    const lbl = label || labelFor(key);
    if (typeof value === "boolean") {
      const cb = h("input", { type: "checkbox", id: nextId(), checked: value, onchange: (e) => setAt(state, path, e.target.checked) });
      return h("div", { class: "adm-check" }, cb, h("label", { for: cb.id }, lbl));
    }
    if (typeof value === "number") {
      const f = field({ label: lbl, input: h("input", { type: "number", value: String(value) }) });
      f.input.addEventListener("input", () => setAt(state, path, Number(f.input.value)));
      checks.push(() => (Number.isFinite(Number(f.input.value)) && f.input.value !== "" ? (f.setError(""), "") : (f.setError("Enter a number."), "Enter a number.")) && f.input);
      return f.wrap;
    }
    if (typeof value !== "string") return h("p", { class: "adm-hint" }, `${lbl}: set by the developer.`);

    // Photo references (Astro image() fields)
    if (value.startsWith("../../assets/")) {
      if (!value.startsWith(PHOTO_PREFIX)) return h("p", { class: "adm-hint" }, `${lbl}: set by the developer.`);
      const current = value.slice(PHOTO_PREFIX.length);
      const sel = h("select", {}, library.map((n) => h("option", { value: n, selected: n === current }, n)));
      const img = h("img", { class: "adm-thumb big", alt: `Preview of the selected photo`, width: 240, height: 160 });
      const show = () => photoUrl(`${PHOTOS_DIR}/${sel.value}`).then((u) => { img.src = u; }).catch(() => {});
      sel.addEventListener("change", () => { setAt(state, path, PHOTO_PREFIX + sel.value); show(); });
      show();
      const f = field({ label: lbl, input: sel, hint: "Any photo from the photo library (horse photos uploaded in “Horses” appear here too)." });
      f.wrap.append(img);
      return f.wrap;
    }

    // The WhatsApp link is edited as a phone number; empty = not set (buttons are hidden).
    if (name === "site.json" && pattern(path) === "links.whatsapp") {
      const href = whatsappHref(value);
      const digits = href ? href.replace("https://wa.me/", "") : "";
      const f = field({ label: "WhatsApp number", input: h("input", { type: "tel", inputmode: "tel", autocomplete: "off", value: digits ? `+${digits}` : "", placeholder: "+32 470 12 34 56", dataset: { path: pattern(path) } }),
        hint: digits ? "With country code. Used by every WhatsApp button on the site." : "Not set yet — every WhatsApp button is hidden and visitors are sent to the quiz. With country code." });
      f.input.addEventListener("input", () => {
        const d = f.input.value.replace(/\D/g, "");
        setAt(state, path, d ? `https://wa.me/${d}` : "");
      });
      checks.push(() => {
        const d = f.input.value.replace(/\D/g, "");
        const msg = d && (d.length < 7 || d.length > 15) ? "Enter the number with its country code, for example +32 470 12 34 56 — or leave it empty." : "";
        f.setError(msg);
        return msg && f.input;
      });
      return f.wrap;
    }

    // Instagram / TikTok: a full profile address, or empty (the icon is then not shown).
    if (name === "site.json" && (pattern(path) === "links.instagram" || pattern(path) === "links.tiktok")) {
      const kind = key;
      const net = kind === "instagram" ? "Instagram" : "TikTok";
      const shown = socialHref(kind, value) ? value : "";
      const f = field({ label: `${net} profile`, input: h("input", { type: "url", value: shown, autocomplete: "off", placeholder: kind === "instagram" ? "https://www.instagram.com/yourname" : "https://www.tiktok.com/@yourname", dataset: { path: pattern(path) } }),
        hint: shown ? `The ${net} icon links here.` : `Not set yet — the ${net} icon and card are hidden on the site.` });
      f.input.addEventListener("input", () => setAt(state, path, f.input.value.trim()));
      if (!shown && value) setAt(state, path, ""); // drop an old template value on save
      checks.push(() => {
        const v = f.input.value.trim();
        const msg = v && !socialHref(kind, v) ? `Paste the full address of the ${net} profile, for example ${kind === "instagram" ? "https://www.instagram.com/yourname" : "https://www.tiktok.com/@yourname"} — or leave it empty.` : "";
        f.setError(msg);
        return msg && f.input;
      });
      return f.wrap;
    }

    const isUrl = /^https?:\/\//.test(origValue || "") || ["instagram", "tiktok"].includes(key);
    const long = LONG_KEYS.has(key) || value.length > 90 || value.includes("\n");
    const input = long
      ? h("textarea", { rows: Math.min(10, Math.max(3, Math.ceil(value.length / 70))) }, value)
      : h("input", { type: isUrl ? "url" : "text", value, autocomplete: "off" });
    input.dataset.path = pattern(path);
    const tokens = String(origValue || "").match(/\{[a-z]+\}/g) || [];
    const hint = tokens.length ? `Keep ${tokens.join(" and ")} in the text — it is filled in automatically.`
      : name === "site.json" && pattern(path) === "brand" ? (isSet(value) ? "Shown in the footer of every page." : `Not set yet — the footer shows “${displayName(state)}” instead.`)
      : name === "site.json" && pattern(path) === "siteTitle" ? "Shown wherever the company name is still empty." : undefined;
    const f = field({ label: lbl, input, hint });
    input.addEventListener("input", () => setAt(state, path, input.value));
    checks.push(() => {
      const val = input.value.trim();
      let msg = "";
      if (typeof origValue === "string" && origValue.trim() && !val) msg = "This text can’t be empty.";
      else if (val.length > 5000) msg = "This text is too long (over 5,000 characters).";
      else if (tokens.some((t) => !val.includes(t))) msg = `Please keep ${tokens.filter((t) => !val.includes(t)).join(" and ")} in this text.`;
      else if (isUrl && val && !/^https:\/\/[^\s]+\.[^\s]+/.test(val)) msg = "Enter a full web address starting with https://.";
      f.setError(msg);
      return msg && input;
    });
    return f.wrap;
  };

  const summary = h("div", { class: "adm-summary", tabindex: "-1", role: "alert", hidden: true });
  const saveBtn = h("button", { type: "submit", class: "btn" }, "Save");
  const form = h("form", { class: "adm-form", novalidate: true }, summary, formBody,
    h("div", { class: "adm-form-bar" }, saveBtn, h("a", { class: "btn btn-ghost", href: "#/texts" }, "Back")));
  form.addEventListener("input", () => { dirty = true; });
  form.addEventListener("change", () => { dirty = true; });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const bad = checks.map((c) => c()).filter(Boolean);
    if (bad.length) {
      summary.replaceChildren(h("h3", {}, `Please fix ${bad.length} field${bad.length === 1 ? "" : "s"}.`),
        h("p", {}, h("a", { href: `#${bad[0].id}`, onclick: (ev) => { ev.preventDefault(); bad[0].focus(); } }, "Go to the first one")));
      summary.hidden = false;
      summary.focus();
      return;
    }
    summary.hidden = true;
    saveBtn.disabled = true;
    try {
      const text = JSON.stringify(state, null, indent) + (file.content.endsWith("\n") ? "\n" : "");
      const res = await writeFile(path, text, sha, `Admin: edit ${fileLabel(name).toLowerCase()}`);
      sha = res.sha;
      dirty = false;
      trackCommit(res.commit, fileLabel(name));
      toast(`Saved “${fileLabel(name)}”.`);
      refreshGoLiveCount();
      return renderer(root, name); // fresh sha and an up-to-date "still unset" note
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        summary.replaceChildren(h("p", {}, err.message));
        summary.hidden = false;
        summary.focus();
      }
    } finally {
      saveBtn.disabled = false;
    }
  });
  draw();
  root.replaceChildren(h("p", { class: "adm-crumb" }, h("a", { href: "#/texts" }, "← All texts")), h("h2", {}, fileLabel(name)),
    unsetBanner(name, name === "site.json" ? unsetValues({ site: state }) : []), form);
  focusField(root, focus);
}

/** "Still unset here: …" with a link that jumps to each field. */
function unsetBanner(file, items) {
  const mine = items.filter((x) => x.file === file);
  if (!mine.length) return null;
  return h("div", { class: "adm-warn adm-unset" },
    h("strong", {}, `Still unset on this page (${mine.length}): `),
    mine.map((x, i) => [i ? ", " : "", h("a", { href: `#/texts/${file.endsWith(".md") ? "p" : "t"}/${file}/${encodeURIComponent(x.field)}` }, x.label.replace(/^Imprint: /, ""))]),
    h("span", { class: "adm-sub" }, "Nothing unset is ever shown to visitors; see “Before you go live” for what each one does."));
}

/** Scrolls to and focuses the field for a dotted path (from the checklist). */
function focusField(root, path) {
  if (!path) return;
  const el = root.querySelector(`[data-path="${CSS.escape(path)}"]`);
  if (!el) return;
  el.scrollIntoView({ block: "center" });
  el.focus({ preventScroll: true });
}

// ---- Markdown pages --------------------------------------------------------------------

async function renderPage(root, name, focus = "") {
  const renderer = renderPage;
  const path = `${PAGES_DIR}/${name}`;
  root.replaceChildren(spinner("Opening…"));
  let file;
  try {
    file = await readFile(path);
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 401)) root.replaceChildren(errorBox(e), h("a", { href: "#/texts" }, "Back to the texts"));
    return;
  }
  let sha = file.sha;
  const doc = parseFrontMatter(file.content);
  const vals = valuesOf(doc);
  const LABELS = { title: "Page title", eyebrow: "Small heading above the title", description: "Short description (for Google)", updated: "Last updated" };
  const inputs = {};
  const isImprint = name === "imprint.md";
  const factKeys = new Set(isImprint ? IMPRINT_FIELDS.map(([k]) => k) : []);
  const textField = (k, v, label, hint) => {
    const isDate = /^\d{4}-\d{2}-\d{2}$/.test(String(v));
    const input = isDate ? h("input", { type: "date", value: String(v) })
      : h("input", { type: k === "email" ? "email" : "text", value: String(v ?? ""), autocomplete: "off" });
    input.dataset.path = k;
    const f = field({ label, input, hint });
    inputs[k] = { f, isDate, orig: v ?? "", optional: factKeys.has(k) };
    return f.wrap;
  };
  const fields = Object.entries(vals)
    .filter(([k, v]) => !factKeys.has(k) && (typeof v === "string" || typeof v === "number"))
    .map(([k, v]) => textField(k, v, LABELS[k] || humanize(k)));
  // Imprint: the company's legal facts. Empty ones are named on the page as "to follow".
  const facts = isImprint ? IMPRINT_FIELDS.map(([k, label]) => textField(k, typeof vals[k] === "string" ? vals[k] : "", label,
    isSet(vals[k]) ? undefined : "Not set yet — the imprint says this detail will follow. Fill it in only with the company’s real, official data.")) : [];
  // Privacy: a plain "the company has approved this text" switch.
  const reviewed = name === "privacy.md" ? h("input", { type: "checkbox", id: nextId(), checked: vals.reviewed === true, dataset: { path: "reviewed" } }) : null;
  const bump = h("input", { type: "checkbox", id: nextId(), checked: true });
  const body = field({ label: "Page text", input: h("textarea", { rows: 22, class: "adm-mono" }, doc.body.replace(/^\n+/, "")),
    hint: "Markdown: an empty line starts a new paragraph, “## ” starts a heading, [text](address) makes a link." });
  const summary = h("div", { class: "adm-summary", tabindex: "-1", role: "alert", hidden: true });
  const saveBtn = h("button", { type: "submit", class: "btn" }, "Save");
  const form = h("form", { class: "adm-form", novalidate: true }, summary,
    h("fieldset", { class: "adm-section" }, h("legend", {}, "About this page"), h("div", { class: "adm-grid" }, fields),
      "updated" in inputs ? h("div", { class: "adm-check" }, bump, h("label", { for: bump.id }, "Set “last updated” to today when saving")) : null),
    facts.length ? h("fieldset", { class: "adm-section" }, h("legend", {}, "Company details"), h("div", { class: "adm-grid" }, facts)) : null,
    reviewed ? h("fieldset", { class: "adm-section" }, h("legend", {}, "Approval"),
      h("div", { class: "adm-check" }, reviewed, h("label", { for: reviewed.id }, "The company has read this policy and approves it"),
        h("span", { class: "adm-hint" }, "Tick this only after someone at the company (ideally with legal advice) has checked the text. It is not shown to visitors."))) : null,
    h("fieldset", { class: "adm-section" }, h("legend", {}, "Text"), body.wrap),
    h("div", { class: "adm-form-bar" }, saveBtn, h("a", { class: "btn btn-ghost", href: "#/texts" }, "Back")));
  form.addEventListener("input", () => { dirty = true; });
  form.addEventListener("change", () => { dirty = true; });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const bad = [];
    for (const [k, { f, orig, optional }] of Object.entries(inputs)) {
      const val = f.input.value.trim();
      const msg = !optional && String(orig).trim() && !val ? "This can’t be empty."
        : k === "email" && val && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val) ? "This doesn’t look like an e-mail address."
        : optional && val && !isSet(val) ? "This still looks like a placeholder. Enter the real value, or leave it empty." : "";
      f.setError(msg);
      if (msg) bad.push(f.input);
    }
    const text = body.input.value.trim();
    body.setError(text.length < 20 ? "The page text is missing." : "");
    if (text.length < 20) bad.push(body.input);
    if (bad.length) { bad[0].focus(); return; }
    const updates = {};
    for (const [k, { f, isDate, orig }] of Object.entries(inputs)) {
      updates[k] = typeof orig === "number" ? Number(f.input.value) : f.input.value.trim();
      if (isDate && k === "updated" && bump.checked) updates[k] = new Date().toISOString().slice(0, 10);
    }
    if (reviewed) updates.reviewed = reviewed.checked;
    saveBtn.disabled = true;
    try {
      const content = buildFrontMatter(doc, updates, text);
      const res = await writeFile(path, content, sha, `Admin: edit ${fileLabel(name).toLowerCase()}`);
      sha = res.sha;
      dirty = false;
      trackCommit(res.commit, fileLabel(name));
      toast(`Saved “${fileLabel(name)}”.`);
      refreshGoLiveCount();
      return renderer(root, name); // fresh sha and an up-to-date "still unset" note
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        summary.replaceChildren(h("p", {}, err.message));
        summary.hidden = false;
        summary.focus();
      }
    } finally {
      saveBtn.disabled = false;
    }
  });
  const pending = unsetValues(name === "imprint.md" ? { imprint: vals } : name === "privacy.md" ? { privacy: vals } : {});
  root.replaceChildren(h("p", { class: "adm-crumb" }, h("a", { href: "#/texts" }, "← All texts")), h("h2", {}, fileLabel(name)),
    unsetBanner(name, pending), form);
  focusField(root, focus);
}
