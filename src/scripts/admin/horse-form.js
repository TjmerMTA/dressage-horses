// Add / edit / duplicate one horse. Writes src/content/horses/<slug>.md through the Worker.
import { ApiError, listDir, photoUrl, readFile, uploadPhoto, writeFile } from "./api.js";
import {
  BREEDS, COLOURS, COUNTRY, HORSE_DEFAULTS, HORSE_KEYS, HORSES_DIR, LEVEL, MIN_YEAR, REPO_URL, SEX, XRAYS,
} from "./config.js";
import { buildFrontMatter, parseFrontMatter, valuesOf } from "./frontmatter.js";
import { preparePhoto, refToRepoPath } from "./photos.js";
import { trackCommit } from "./publish.js";
import { confirmDialog, errorBox, field, h, nextId, spinner, toast } from "./ui.js";
import { repoPathToRef } from "./photos.js";

const THIS_YEAR = new Date().getFullYear();
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_PHOTOS = 20;

let dirty = false;
export const isHorseFormDirty = () => dirty;
export const markHorseFormClean = () => { dirty = false; };

export function slugify(name) {
  return String(name).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
}

const select = (options, value, placeholder) =>
  h("select", {}, h("option", { value: "" }, placeholder),
    options.map(([v, label]) => h("option", { value: v, selected: v === value }, label)));

const datalist = (id, values) => h("datalist", { id }, values.map((v) => h("option", { value: v })));

/**
 * @param {HTMLElement} root
 * @param {{mode:"new"|"edit"|"duplicate", slug?:string}} opts
 */
export async function renderHorseForm(root, { mode, slug }) {
  dirty = false;
  root.replaceChildren(spinner(mode === "new" ? "Preparing the form…" : "Opening the horse…"));

  let doc = { fields: [], body: "", hadFrontMatter: false };
  let sha;
  let v = { currency: "EUR", published: true, sold: false, featured: false, priceOnRequest: false, photos: [] };
  let existingSlugs = [];
  try {
    const [entries, file] = await Promise.all([
      listDir(HORSES_DIR),
      mode === "new" ? null : readFile(`${HORSES_DIR}/${slug}.md`),
    ]);
    existingSlugs = entries.filter((e) => e.name.endsWith(".md")).map((e) => e.name.slice(0, -3));
    if (file) {
      doc = parseFrontMatter(file.content);
      v = { ...v, ...valuesOf(doc) };
      if (mode === "edit") sha = file.sha;
    }
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return;
    root.replaceChildren(errorBox(e), h("a", { href: "#/horses" }, "Back to the horses"));
    return;
  }

  const unsupported = doc.fields.filter((f) => f.key && !f.supported && HORSE_KEYS.includes(f.key)).map((f) => f.key);
  const extras = doc.fields.filter((f) => f.key && !HORSE_KEYS.includes(f.key)).map((f) => f.key);

  if (mode === "duplicate") {
    // A copy is a new, real horse: not a sample, not published yet, listed today.
    doc = { fields: doc.fields.filter((f) => f.key && !HORSE_KEYS.includes(f.key) && f.key !== "sample"), body: doc.body, hadFrontMatter: true };
    v = { ...v, name: `${v.name || "Horse"} (copy)`, published: false, sold: false, featured: false, listed: undefined };
  }
  const hasKey = (k) => doc.fields.some((f) => f.key === k);
  const today = new Date().toISOString().slice(0, 10);
  const fileSlug = mode === "edit" ? slug : "";
  const description = doc.body.replace(/^\n+/, "").replace(/\s+$/, "");

  // ---- fields --------------------------------------------------------------------
  const F = {};
  const mk = (key, label, input, hint) => (F[key] = field({ label, input, hint }));
  mk("name", "Name", h("input", { type: "text", value: v.name || "", autocomplete: "off", maxlength: 80 }));
  let slugTouched = mode === "edit";
  mk("slug", "Web address", h("input", { type: "text", value: mode === "edit" ? slug : (slugify(v.name || "")), autocomplete: "off", spellcheck: "false", maxlength: 60, readonly: mode === "edit" }),
    mode === "edit" ? "The address can't change after a horse is created." : "Lower-case letters, numbers and hyphens. Used as the horse’s file name.");
  const onRequest = h("input", { type: "checkbox", checked: v.priceOnRequest === true });
  mk("price", "Price in euros", h("input", { type: "text", inputmode: "numeric", value: Number.isFinite(v.price) ? String(v.price) : "", autocomplete: "off", disabled: v.priceOnRequest === true }),
    "Whole euros, for example 85000 or 85 000.");
  mk("year", "Year of birth", h("input", { type: "number", min: MIN_YEAR, max: THIS_YEAR, step: 1, value: Number.isFinite(v.year) ? String(v.year) : "" }));
  mk("height", "Height (cm)", h("input", { type: "number", min: 120, max: 200, step: 1, value: Number.isFinite(v.height) ? String(v.height) : "" }), "At the withers, for example 168.");
  mk("sex", "Sex", select(SEX, v.sex, "Choose…"));
  const colourList = nextId("colours");
  const breedList = nextId("breeds");
  mk("colour", "Colour", h("input", { type: "text", list: colourList, value: v.colour || "", autocomplete: "off", maxlength: 40 }));
  mk("breed", "Breed / studbook", h("input", { type: "text", list: breedList, value: v.breed || "", autocomplete: "off", maxlength: 40 }));
  mk("country", "Country", select(COUNTRY, v.country, "Choose…"));
  mk("level", "Level", select(LEVEL, v.level, "Choose…"));
  mk("xrays", "X-rays", select(XRAYS, v.xrays, "Choose…"));
  mk("sire", "Sire (father)", h("input", { type: "text", value: v.sire || "", autocomplete: "off", maxlength: 80 }));
  mk("dam", "Dam (mother)", h("input", { type: "text", value: v.dam || "", autocomplete: "off", maxlength: 80 }));
  mk("damsire", "Damsire (mother’s father)", h("input", { type: "text", value: v.damsire || "", autocomplete: "off", maxlength: 80 }));
  mk("listed", "On sale since", h("input", { type: "date", value: /^\d{4}-\d{2}-\d{2}$/.test(String(v.listed || "")) ? String(v.listed) : (mode === "edit" ? "" : today), max: today }),
    "Used to sort the catalogue by newest.");
  mk("video", "Video link (optional)", h("input", { type: "url", value: v.video || "", autocomplete: "off", placeholder: "https://www.youtube.com/watch?v=…" }), "A YouTube or Vimeo address.");
  mk("description", "Description", h("textarea", { rows: 9, maxlength: 10000 }, description),
    "Shown on the horse’s page. Empty line = new paragraph. **bold** for bold.");
  const published = h("input", { type: "checkbox", id: nextId(), checked: v.published !== false });
  const featured = h("input", { type: "checkbox", id: nextId(), checked: v.featured === true });
  const sold = h("input", { type: "checkbox", id: nextId(), checked: v.sold === true });
  const check = (input, label, hint) => h("div", { class: "adm-check" }, input, h("label", { for: input.id }, label), hint ? h("span", { class: "adm-hint" }, hint) : null);

  onRequest.id = nextId();
  onRequest.addEventListener("change", () => {
    F.price.input.disabled = onRequest.checked;
    if (onRequest.checked) F.price.setError("");
  });
  F.name.input.addEventListener("input", () => {
    if (!slugTouched) F.slug.input.value = slugify(F.name.input.value);
  });
  F.slug.input.addEventListener("input", () => { slugTouched = true; });

  // ---- photos ------------------------------------------------------------------------
  /** @type {{id:string, kind:"existing"|"new", ref?:string, blob?:Blob, url?:string, label:string}[]} */
  // Alt texts travel with their photo. A file without them gets the wording the site would
  // generate (src/lib/horses.ts), so the person sees it and can make it better.
  const givenAlt = Array.isArray(v.photoAlt) ? v.photoAlt : [];
  const sexWord = (SEX.find(([k]) => k === v.sex) || [, ""])[1].toLowerCase();
  const fallbackAlt = (i, n) => {
    if (!v.name) return "";
    const age = Number.isFinite(v.year) ? `${THIS_YEAR - v.year}-year-old ` : "";
    const base = `${v.name}, ${age}${v.colour ? `${v.colour} ` : ""}${sexWord}`.trim();
    return n > 1 ? `${base} — photo ${i + 1} of ${n}` : base;
  };
  const refs = Array.isArray(v.photos) ? v.photos : [];
  let photos = refs.map((ref, i) => ({
    id: nextId("p"), kind: "existing", ref: String(ref), label: String(ref).split("/").pop(),
    alt: typeof givenAlt[i] === "string" && givenAlt[i].trim() ? givenAlt[i] : fallbackAlt(i, refs.length),
  }));
  const photoErr = h("p", { class: "adm-err", id: nextId("photos-err") });
  const photoList = h("ol", { class: "adm-photos", "aria-label": "Photos, in order. The first is the cover." });
  const fileInput = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", multiple: true, class: "sr-only", id: nextId("file") });
  const drop = h("div", { class: "adm-drop" },
    h("p", {}, "Drag photos here, or "),
    h("label", { for: fileInput.id, class: "btn btn-ghost btn-sm" }, "Choose photos"),
    fileInput,
    h("p", { class: "adm-hint" }, "JPEG, PNG or WebP. Big photos are shrunk to 2400 px before upload. The first photo is the cover. Say in a few words what each photo shows."));
  const live = h("p", { class: "sr-only", "aria-live": "polite" });

  const move = (i, to) => {
    if (to < 0 || to >= photos.length) return;
    const [p] = photos.splice(i, 1);
    photos.splice(to, 0, p);
    dirty = true;
    drawPhotos();
    live.textContent = `${p.label} moved to position ${to + 1} of ${photos.length}.`;
    // Keep focus on the moved photo: same direction if still possible, else any of its buttons.
    const own = `[data-pid="${p.id}"]`;
    const btn = photoList.querySelector(`${own} [data-act="${to < i ? "up" : "down"}"]:not(:disabled)`)
      || photoList.querySelector(`${own} button:not(:disabled)`);
    if (btn) btn.focus();
  };
  let dragIndex = -1;
  const altField = (p, i) => {
    const input = h("input", { type: "text", value: p.alt || "", maxlength: 200, autocomplete: "off", placeholder: "e.g. Grey mare in extended trot on a sand arena",
      dataset: { alt: p.id }, oninput: (e) => { p.alt = e.target.value; e.target.removeAttribute("aria-invalid"); } });
    return h("div", { class: "adm-field adm-photo-alt" },
      h("label", { for: (input.id = nextId("alt")) }, `What is in photo ${i + 1}?`), input);
  };
  const drawPhotos = () => {
    photoList.replaceChildren(...photos.map((p, i) => {
      const img = h("img", { alt: `Photo ${i + 1}${i === 0 ? " (cover)" : ""}`, width: 160, height: 120, loading: "lazy" });
      if (p.kind === "new") img.src = p.url;
      else photoUrl(refToRepoPath(p.ref)).then((u) => { img.src = u; }).catch(() => { img.alt = `Photo ${i + 1} could not be loaded`; img.classList.add("broken"); });
      const li = h("li", { class: "adm-photo", draggable: "true", dataset: { pid: p.id } },
        h("div", { class: "adm-photo-img" }, img,
          i === 0 ? h("span", { class: "adm-badge cover" }, "Cover") : null,
          p.kind === "new" ? h("span", { class: "adm-badge new" }, "Not uploaded yet") : null),
        altField(p, i),
        h("div", { class: "adm-photo-tools" },
          h("button", { type: "button", class: "adm-icon", "data-act": "up", "aria-label": `Move photo ${i + 1} earlier`, disabled: i === 0, onclick: () => move(i, i - 1) }, "←"),
          h("button", { type: "button", class: "adm-icon", "data-act": "down", "aria-label": `Move photo ${i + 1} later`, disabled: i === photos.length - 1, onclick: () => move(i, i + 1) }, "→"),
          i > 0 ? h("button", { type: "button", class: "adm-link", onclick: () => move(i, 0) }, "Make cover") : null,
          h("button", { type: "button", class: "adm-link adm-danger-text", "aria-label": `Remove photo ${i + 1}`, onclick: () => {
            const [gone] = photos.splice(i, 1);
            if (gone.kind === "new" && gone.url) URL.revokeObjectURL(gone.url);
            dirty = true;
            drawPhotos();
            live.textContent = `Photo removed. ${photos.length} left.`;
            (photoList.querySelector("button") || fileInput).focus();
          } }, "Remove")));
      li.addEventListener("dragstart", (e) => { dragIndex = i; li.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", p.id); });
      li.addEventListener("dragend", () => li.classList.remove("dragging"));
      li.addEventListener("dragover", (e) => { if (dragIndex !== -1) { e.preventDefault(); li.classList.add("over"); } });
      li.addEventListener("dragleave", () => li.classList.remove("over"));
      li.addEventListener("drop", (e) => {
        if (dragIndex === -1) return;
        e.preventDefault();
        e.stopPropagation();
        const from = dragIndex;
        dragIndex = -1;
        move(from, i);
      });
      return li;
    }));
    photoList.hidden = photos.length === 0;
  };

  const addFiles = async (files) => {
    photoErr.textContent = "";
    const list = [...files];
    if (!list.length) return;
    if (photos.length + list.length > MAX_PHOTOS) {
      photoErr.textContent = `A horse can have at most ${MAX_PHOTOS} photos.`;
      return;
    }
    const problems = [];
    live.textContent = `Preparing ${list.length} photo${list.length === 1 ? "" : "s"}…`;
    for (const f of list) {
      const r = await preparePhoto(f);
      if (!r.ok) { problems.push(r.message); continue; }
      photos.push({ id: nextId("p"), kind: "new", blob: r.blob, url: URL.createObjectURL(r.blob), label: f.name || "photo", alt: "" });
      dirty = true;
    }
    drawPhotos();
    photoErr.textContent = problems.join(" ");
    live.textContent = `${list.length - problems.length} photo${list.length - problems.length === 1 ? "" : "s"} added, not uploaded yet.`;
  };
  fileInput.addEventListener("change", () => { addFiles(fileInput.files); fileInput.value = ""; });
  drop.addEventListener("dragover", (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) { e.preventDefault(); drop.classList.add("over"); } });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => {
    drop.classList.remove("over");
    if (!e.dataTransfer || !e.dataTransfer.files.length) return;
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  });
  drawPhotos();

  // ---- layout ------------------------------------------------------------------------
  const summary = h("div", { class: "adm-summary", tabindex: "-1", role: "alert", hidden: true });
  const saveBtn = h("button", { type: "submit", class: "btn" }, mode === "edit" ? "Save changes" : "Create horse");
  const progress = h("p", { class: "adm-muted", "aria-live": "polite" });
  const title = mode === "edit" ? `Edit ${v.name || slug}` : mode === "duplicate" ? `Duplicate ${String(v.name).replace(/ \(copy\)$/, "")}` : "Add a horse";
  const section = (legend, ...kids) => h("fieldset", { class: "adm-section" }, h("legend", {}, legend), ...kids);
  const grid = (...kids) => h("div", { class: "adm-grid" }, ...kids);

  const form = h("form", { class: "adm-form", novalidate: true },
    summary,
    unsupported.length ? h("p", { class: "adm-warn" }, `This file has ${unsupported.join(", ")} written in a way the panel can't edit safely, so saving is switched off. Change it on GitHub: `,
      h("a", { href: `${REPO_URL}/blob/main/${HORSES_DIR}/${slug}.md`, target: "_blank", rel: "noopener" }, "open the file")) : null,
    section("Basics", grid(F.name.wrap, F.slug.wrap, F.listed.wrap),
      check(published, "Published", "Published, rather than a draft."),
      check(featured, "Featured", "Marked as a featured horse."),
      check(sold, "Sold", "Stays in the catalogue, marked as sold.")),
    section("Price", check(onRequest, "Price on request", "No price is shown; visitors are asked to enquire."), F.price.wrap),
    section("The horse", grid(F.year.wrap, F.height.wrap, F.sex.wrap, F.colour.wrap, F.breed.wrap, F.country.wrap, F.level.wrap, F.xrays.wrap)),
    section("Pedigree", grid(F.sire.wrap, F.dam.wrap, F.damsire.wrap)),
    section("Photos", drop, photoList, photoErr, live),
    section("Video and description", F.video.wrap, F.description.wrap),
    extras.length ? h("p", { class: "adm-hint" }, `Also in this file and kept as it is: ${extras.join(", ")}.`) : null,
    datalist(colourList, COLOURS), datalist(breedList, BREEDS),
    h("div", { class: "adm-form-bar" }, saveBtn, h("a", { href: "#/horses", class: "btn btn-ghost" }, "Cancel"), progress));
  if (unsupported.length) saveBtn.disabled = true;

  // Picking a file is not a change by itself; addFiles() marks the form dirty once a photo is added.
  const touch = (e) => { if (!(e.target instanceof HTMLInputElement && e.target.type === "file")) dirty = true; };
  form.addEventListener("input", touch);
  form.addEventListener("change", touch);

  root.replaceChildren(
    h("p", { class: "adm-crumb" }, h("a", { href: "#/horses" }, "← All horses")),
    h("h2", {}, title), form);

  // ---- validation --------------------------------------------------------------------
  const intIn = (s) => {
    const t = String(s).replace(/[\s.,’']/g, "");
    return /^\d+$/.test(t) ? Number(t) : NaN;
  };
  const validate = () => {
    const errs = [];
    const set = (key, msg) => { F[key].setError(msg); if (msg) errs.push([F[key].input, msg]); };
    const name = F.name.input.value.trim();
    set("name", name.length < 2 ? "Please enter the horse’s name." : "");
    const s = F.slug.input.value.trim();
    if (mode !== "edit") {
      set("slug", !SLUG_RE.test(s) || s.length < 2 ? "Use lower-case letters, numbers and single hyphens, for example “bella-donna”."
        : existingSlugs.includes(s) ? "Another horse already uses this address. Choose a different one." : "");
    }
    const price = intIn(F.price.input.value);
    set("price", onRequest.checked ? "" : !Number.isFinite(price) ? "Enter the price as a whole number of euros, or tick “Price on request”."
      : price < 1000 || price > 20_000_000 ? "That price looks wrong. Enter it in euros, for example 85000." : "");
    const year = intIn(F.year.input.value);
    set("year", !Number.isFinite(year) || year < MIN_YEAR || year > THIS_YEAR ? `Enter the year of birth, between ${MIN_YEAR} and ${THIS_YEAR}.` : "");
    const height = intIn(F.height.input.value);
    set("height", !Number.isFinite(height) || height < 120 || height > 200 ? "Enter the height in centimetres, between 120 and 200." : "");
    for (const [key, label] of [["sex", "the sex"], ["country", "the country"], ["level", "the level"], ["xrays", "the X-ray result"]]) {
      set(key, F[key].input.value ? "" : `Please choose ${label}.`);
    }
    for (const [key, label] of [["colour", "the colour"], ["breed", "the breed or studbook"], ["sire", "the sire"], ["dam", "the dam"], ["damsire", "the damsire"]]) {
      set(key, F[key].input.value.trim() ? "" : `Please enter ${label}${["sire", "dam", "damsire"].includes(key) ? " (write “unknown” if you don’t know)" : ""}.`);
    }
    const video = F.video.input.value.trim();
    let videoErr = "";
    if (video) {
      try {
        const u = new URL(video);
        if (u.protocol !== "https:") videoErr = "The video link must start with https://.";
      } catch { videoErr = "This doesn’t look like a web address. Copy it from the browser’s address bar."; }
    }
    set("video", videoErr);
    if (photos.length === 0) {
      photoErr.textContent = "Add at least one photo. The first one is the cover.";
      errs.push([fileInput, photoErr.textContent]);
    }
    photos.forEach((p, i) => {
      const input = photoList.querySelector(`[data-alt="${p.id}"]`);
      if (!String(p.alt || "").trim() && input) {
        input.setAttribute("aria-invalid", "true");
        errs.push([input, `Describe photo ${i + 1} in a few words — blind visitors and Google rely on it.`]);
      }
    });
    const listed = F.listed.input.value;
    set("listed", listed && (!/^\d{4}-\d{2}-\d{2}$/.test(listed) || listed > today) ? "Choose a date that isn’t in the future." : "");
    return { errs, name, slug: mode === "edit" ? fileSlug : s, price, year, height, video };
  };

  const showSummary = (errs) => {
    if (!errs.length) { summary.hidden = true; return; }
    summary.replaceChildren(h("h3", {}, `Please fix ${errs.length} thing${errs.length === 1 ? "" : "s"}:`),
      h("ul", {}, errs.map(([input, msg]) => h("li", {}, h("a", { href: `#${input.id}`, onclick: (e) => { e.preventDefault(); (input === fileInput ? drop.querySelector("label") : input).focus(); } }, msg)))));
    summary.hidden = false;
    summary.focus();
  };

  // ---- save --------------------------------------------------------------------------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (saveBtn.disabled) return;
    const r = validate();
    showSummary(r.errs);
    if (r.errs.length) return;

    saveBtn.disabled = true;
    try {
      // 1. Photos first (each is its own commit), so the horse file never points at a missing photo.
      const fresh = photos.filter((p) => p.kind === "new");
      for (let i = 0; i < fresh.length; i++) {
        progress.textContent = `Uploading photo ${i + 1} of ${fresh.length}…`;
        const up = await uploadPhoto(r.slug, fresh[i].blob, `${r.slug}.jpg`);
        URL.revokeObjectURL(fresh[i].url);
        Object.assign(fresh[i], { kind: "existing", ref: repoPathToRef(up.path), blob: undefined, url: undefined });
      }
      drawPhotos();

      // 2. The horse file.
      progress.textContent = "Saving the horse…";
      // A key at its schema default is written only if the file already has it (keeps files like Boris's).
      const opt = (k, val) => (hasKey(k) || val !== HORSE_DEFAULTS[k] ? val : undefined);
      const updates = {
        name: r.name,
        slug: r.slug,
        price: onRequest.checked ? undefined : r.price,
        priceOnRequest: opt("priceOnRequest", onRequest.checked),
        currency: opt("currency", typeof v.currency === "string" && /^[A-Z]{3}$/.test(v.currency) ? v.currency : "EUR"),
        year: r.year,
        height: r.height,
        sex: F.sex.input.value,
        colour: F.colour.input.value.trim(),
        breed: F.breed.input.value.trim(),
        country: F.country.input.value,
        level: F.level.input.value,
        sire: F.sire.input.value.trim(),
        dam: F.dam.input.value.trim(),
        damsire: F.damsire.input.value.trim(),
        xrays: F.xrays.input.value,
        video: r.video || undefined,
        photos: photos.map((p) => p.ref),
        photoAlt: photos.map((p) => String(p.alt).trim()),
        listed: F.listed.input.value || (mode === "edit" ? undefined : today),
        sold: opt("sold", sold.checked),
        featured: opt("featured", featured.checked),
        published: opt("published", published.checked),
      };
      const text = buildFrontMatter(doc, updates, F.description.input.value.trim(), HORSE_KEYS);
      const path = `${HORSES_DIR}/${r.slug}.md`;
      const verb = mode === "edit" ? "Update" : "Add";
      const res = await writeFile(path, text, sha, `Admin: ${verb.toLowerCase()} horse “${r.name}”`);
      sha = res.sha;
      dirty = false;
      trackCommit(res.commit, r.name);
      toast(mode === "edit" ? `Saved “${r.name}”.` : `“${r.name}” was created.`);
      location.hash = "#/horses";
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { progress.textContent = "Log in again, then press Save once more — nothing you typed is lost."; return; }
      if (err instanceof ApiError && err.status === 409 && mode !== "edit") {
        F.slug.setError("Another horse already uses this address. Choose a different one.");
        showSummary([[F.slug.input, "Another horse already uses this address."]]);
      } else {
        progress.textContent = "";
        showSummary([[saveBtn, err.message]]);
      }
    } finally {
      saveBtn.disabled = unsupported.length > 0;
      if (progress.textContent.startsWith("Uploading") || progress.textContent.startsWith("Saving")) progress.textContent = "";
    }
  });

  F.name.input.focus();
}

/** Asks before leaving a form with unsaved changes. */
export async function confirmLeaveForm() {
  if (!dirty) return true;
  const ok = await confirmDialog({
    title: "Leave without saving?",
    body: "Your changes to this horse have not been saved and will be lost.",
    confirmLabel: "Leave without saving",
    cancelLabel: "Stay here",
    danger: true,
  });
  if (ok) dirty = false;
  return ok;
}
