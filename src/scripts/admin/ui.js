// DOM helpers. Everything a stranger or the repository wrote is put in with
// textContent / attributes — never innerHTML.

/**
 * h("button", { class: "btn", type: "button", onclick: fn }, "Save")
 * Props: class, text, dataset, on<event>, boolean attributes (true/false), anything else → attribute.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "value" && "value" in el) el.value = v;
    else if (k === "checked" || k === "disabled" || k === "hidden" || k === "required" || k === "multiple" || k === "selected") el[k] = Boolean(v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

let uid = 0;
export const nextId = (prefix = "f") => `${prefix}-${++uid}`;

const toastEl = () => document.getElementById("toast");
let toastTimer;
/** A short message that also reaches screen readers. kind: "ok" | "err" */
export function toast(message, kind = "ok") {
  const t = toastEl();
  if (!t) return;
  t.textContent = message;
  t.dataset.kind = kind;
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), kind === "err" ? 9000 : 4500);
}

/**
 * A modal question. Resolves true only when the person confirms.
 * requireText: the person must type this (case-insensitive) before the button works.
 */
export function confirmDialog({ title, body, confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false, requireText = "" }) {
  return new Promise((resolve) => {
    const id = nextId("dlg");
    const input = requireText
      ? h("input", { id: `${id}-in`, type: "text", autocomplete: "off", spellcheck: "false" })
      : null;
    const ok = h("button", { type: "submit", class: danger ? "btn btn-sm adm-danger" : "btn btn-sm", disabled: Boolean(requireText) }, confirmLabel);
    const cancel = h("button", { type: "button", class: "btn btn-ghost btn-sm", autofocus: true }, cancelLabel);
    const form = h("form", { method: "dialog", class: "adm-dialog-in" },
      h("h2", { id: `${id}-h` }, title),
      ...(Array.isArray(body) ? body : [body]).filter(Boolean).map((p) => h("p", {}, p)),
      input && h("div", { class: "adm-field" },
        h("label", { for: input.id }, `Type “${requireText}” to confirm`), input),
      h("div", { class: "adm-actions" }, cancel, ok));
    const dlg = h("dialog", { class: "adm-dialog", "aria-labelledby": `${id}-h` }, form);
    let answer = false;
    if (input) input.addEventListener("input", () => {
      ok.disabled = input.value.trim().toLowerCase() !== requireText.trim().toLowerCase();
    });
    cancel.addEventListener("click", () => dlg.close());
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (ok.disabled) return;
      answer = true;
      dlg.close();
    });
    dlg.addEventListener("close", () => {
      dlg.remove();
      resolve(answer);
    });
    document.body.append(dlg);
    dlg.showModal();
    (input || cancel).focus();
  });
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
export function formatDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : dateFmt.format(d);
}

export function relativeTime(iso) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(s)) return "";
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)} days ago`;
  return formatDate(iso);
}

const euro = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
export const formatPrice = (n) => euro.format(n);

/** Labelled form field. Returns { wrap, input, error, setError }. */
export function field({ label, input, hint, id }) {
  const fid = id || input.id || nextId();
  input.id = fid;
  const err = h("p", { class: "adm-err", id: `${fid}-err` });
  const hintEl = hint ? h("p", { class: "adm-hint", id: `${fid}-hint` }, hint) : null;
  input.setAttribute("aria-describedby", [hintEl && hintEl.id, err.id].filter(Boolean).join(" "));
  const wrap = h("div", { class: "adm-field" }, h("label", { for: fid }, label), input, hintEl, err);
  const setError = (msg) => {
    err.textContent = msg || "";
    if (msg) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  };
  // An old complaint disappears as soon as the person changes the field.
  const clearOnEdit = () => { if (err.textContent) setError(""); };
  input.addEventListener("input", clearOnEdit);
  input.addEventListener("change", clearOnEdit);
  return { wrap, input, error: err, setError };
}

export function spinner(text) {
  return h("p", { class: "adm-loading", role: "status" }, h("span", { class: "adm-spin", "aria-hidden": "true" }), text);
}

/** The error for a screen that could not load: a plain warning box for a setup problem. */
export function errorBox(err) {
  const msg = (err && err.message) || "Something went wrong.";
  if (/missing its GitHub key/.test(msg)) {
    return h("div", { class: "adm-warn", role: "alert" }, h("strong", {}, "Repository not connected. "), msg);
  }
  return h("p", { class: "adm-err", role: "alert" }, msg);
}
