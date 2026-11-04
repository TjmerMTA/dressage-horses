// Texts: the JSON files in src/content/texts/ as friendly forms, and the Markdown pages in
// src/content/pages/ (privacy, imprint). The structure of each JSON file is the site's, so
// the form is built from the file itself; the panel never adds or renames keys.
import { ApiError, listDir, photoUrl, readFile, writeFile } from "./api.js";
import {
  HIDDEN_TEXT_KEYS, KEY_LABELS, PAGES_DIR, PHOTO_PREFIX, PHOTOS_DIR, TEXT_FILE_LABELS, TEXT_FILE_ORDER, TEXTS_DIR,
} from "./config.js";
import { buildFrontMatter, parseFrontMatter, valuesOf } from "./frontmatter.js";
import { trackCommit } from "./publish.js";
import { confirmDialog, field, h, nextId, spinner, toast } from "./ui.js";

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
  const [kind, name] = route.split("/");
  if (kind === "t" && /^[\w-]+\.json$/.test(name || "")) return renderJsonFile(root, name);
  if (kind === "p" && /^[\w-]+\.md$/.test(name || "")) return renderPage(root, name);

  root.replaceChildren(spinner("Loading the texts…"));
  let json;
  let md;
  try {
    [json, md] = await Promise.all([listDir(TEXTS_DIR), listDir(PAGES_DIR)]);
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 401)) root.replaceChildren(h("h2", {}, "Texts"), h("p", { class: "adm-err" }, e.message));
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

async function renderJsonFile(root, name) {
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
    root.replaceChildren(h("p", { class: "adm-err" }, e instanceof SyntaxError ? "This file is not valid JSON, so the panel can't edit it." : e.message), h("a", { href: "#/texts" }, "Back to the texts"));
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

    // The WhatsApp link is edited as a phone number.
    if (key === "whatsapp" && /^https:\/\/wa\.me\//.test(value)) {
      const digits = value.replace(/^https:\/\/wa\.me\//, "");
      const f = field({ label: "WhatsApp number", input: h("input", { type: "tel", inputmode: "tel", autocomplete: "off", value: /^\d+$/.test(digits) ? `+${digits}` : "", placeholder: "+32 470 12 34 56" }),
        hint: /^\d+$/.test(digits) ? "With country code. Used by every WhatsApp button on the site." : "Not set yet. With country code. Used by every WhatsApp button on the site." });
      f.input.addEventListener("input", () => setAt(state, path, `https://wa.me/${f.input.value.replace(/\D/g, "")}`));
      checks.push(() => {
        const d = f.input.value.replace(/\D/g, "");
        if (!d && !/^\d+$/.test(digits)) { setAt(state, path, value); f.setError(""); return ""; } // still the placeholder: keep it
        const msg = d.length < 7 || d.length > 15 ? "Enter the number with its country code, for example +32 470 12 34 56." : "";
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
    const tokens = String(origValue || "").match(/\{[a-z]+\}/g) || [];
    const hint = tokens.length ? `Keep ${tokens.join(" and ")} in the text — it is filled in automatically.` : undefined;
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
  root.replaceChildren(h("p", { class: "adm-crumb" }, h("a", { href: "#/texts" }, "← All texts")), h("h2", {}, fileLabel(name)), form);
}

// ---- Markdown pages --------------------------------------------------------------------

async function renderPage(root, name) {
  const path = `${PAGES_DIR}/${name}`;
  root.replaceChildren(spinner("Opening…"));
  let file;
  try {
    file = await readFile(path);
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 401)) root.replaceChildren(h("p", { class: "adm-err" }, e.message), h("a", { href: "#/texts" }, "Back to the texts"));
    return;
  }
  let sha = file.sha;
  const doc = parseFrontMatter(file.content);
  const vals = valuesOf(doc);
  const LABELS = { title: "Page title", eyebrow: "Small heading above the title", description: "Short description (for Google)", updated: "Last updated" };
  const inputs = {};
  const fields = Object.entries(vals).filter(([, v]) => typeof v === "string" || typeof v === "number").map(([k, v]) => {
    const isDate = /^\d{4}-\d{2}-\d{2}$/.test(String(v));
    const f = field({ label: LABELS[k] || humanize(k), input: isDate ? h("input", { type: "date", value: String(v) }) : h("input", { type: "text", value: String(v), autocomplete: "off" }) });
    inputs[k] = { f, isDate, orig: v };
    return f.wrap;
  });
  const bump = h("input", { type: "checkbox", id: nextId(), checked: true });
  const body = field({ label: "Page text", input: h("textarea", { rows: 22, class: "adm-mono" }, doc.body.replace(/^\n+/, "")),
    hint: "Markdown: an empty line starts a new paragraph, “## ” starts a heading, [text](address) makes a link." });
  const summary = h("div", { class: "adm-summary", tabindex: "-1", role: "alert", hidden: true });
  const saveBtn = h("button", { type: "submit", class: "btn" }, "Save");
  const form = h("form", { class: "adm-form", novalidate: true }, summary,
    h("fieldset", { class: "adm-section" }, h("legend", {}, "About this page"), h("div", { class: "adm-grid" }, fields),
      "updated" in inputs ? h("div", { class: "adm-check" }, bump, h("label", { for: bump.id }, "Set “last updated” to today when saving")) : null),
    h("fieldset", { class: "adm-section" }, h("legend", {}, "Text"), body.wrap),
    h("div", { class: "adm-form-bar" }, saveBtn, h("a", { class: "btn btn-ghost", href: "#/texts" }, "Back")));
  form.addEventListener("input", () => { dirty = true; });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const bad = [];
    for (const [, { f, orig }] of Object.entries(inputs)) {
      const msg = String(orig).trim() && !f.input.value.trim() ? "This can’t be empty." : "";
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
    saveBtn.disabled = true;
    try {
      const content = buildFrontMatter(doc, updates, text);
      const res = await writeFile(path, content, sha, `Admin: edit ${fileLabel(name).toLowerCase()}`);
      sha = res.sha;
      dirty = false;
      trackCommit(res.commit, fileLabel(name));
      toast(`Saved “${fileLabel(name)}”.`);
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
  root.replaceChildren(h("p", { class: "adm-crumb" }, h("a", { href: "#/texts" }, "← All texts")), h("h2", {}, fileLabel(name)), form);
}
