// The catalogue table: cover, name, price, published / sold, and the actions.
import { ApiError, deleteFile, listDir, photoUrl, readFile, writeFile } from "./api.js";
import { HORSES_DIR, REPO_URL } from "./config.js";
import { buildFrontMatter, parseFrontMatter, valuesOf } from "./frontmatter.js";
import { refToRepoPath } from "./photos.js";
import { trackCommit } from "./publish.js";
import { confirmDialog, errorBox, formatPrice, h, spinner, toast } from "./ui.js";

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

async function loadHorses() {
  const entries = (await listDir(HORSES_DIR)).filter((e) => e.type === "file" && e.name.endsWith(".md"));
  return mapLimit(entries, 4, async (e) => {
    const slug = e.name.slice(0, -3);
    try {
      const f = await readFile(e.path);
      const doc = parseFrontMatter(f.content);
      return { slug, path: e.path, sha: f.sha, doc, v: valuesOf(doc), error: "" };
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) throw err;
      return { slug, path: e.path, sha: "", doc: null, v: {}, error: err.message };
    }
  });
}

const rank = (x) => (x.error ? 3 : x.v.sold ? 2 : x.v.published === false ? 1 : 0);

export async function renderHorses(root) {
  root.replaceChildren(spinner("Loading the horses…"));
  let horses;
  try {
    horses = await loadHorses();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return;
    root.replaceChildren(h("h2", {}, "Horses"), errorBox(e));
    return;
  }
  horses.sort((a, b) => rank(a) - rank(b) || String(a.v.name || a.slug).localeCompare(String(b.v.name || b.slug)));

  const summary = h("p", { class: "adm-count-line", "aria-live": "polite" });
  const body = h("tbody");
  const draw = () => {
    const pub = horses.filter((x) => !x.error && x.v.published !== false).length;
    const soldN = horses.filter((x) => x.v.sold).length;
    summary.textContent = horses.length
      ? `${horses.length} horse${horses.length === 1 ? "" : "s"} — ${pub} published, ${horses.length - pub} hidden, ${soldN} sold.`
      : "";
    body.replaceChildren(...horses.map((x) => row(x)));
    table.hidden = horses.length === 0;
    empty.hidden = horses.length > 0;
  };

  const save = async (x, updates, message, doneText) => {
    const text = buildFrontMatter(x.doc, updates, x.doc.body, []);
    try {
      const res = await writeFile(x.path, text, x.sha, message);
      x.sha = res.sha;
      x.doc = parseFrontMatter(text);
      x.v = valuesOf(x.doc);
      trackCommit(res.commit, x.v.name || x.slug);
      toast(doneText);
      draw();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      toast(e.message, "err");
      if (e instanceof ApiError && e.status === 409) renderHorses(root);
    }
  };

  const row = (x) => {
    const name = String(x.v.name || x.slug);
    if (x.error || !x.doc) {
      return h("tr", { class: "is-broken" },
        h("td", { "data-label": "Photo" }, h("span", { class: "adm-thumb empty", "aria-hidden": "true" })),
        h("td", { "data-label": "Name", colspan: 4 }, h("strong", {}, x.slug), h("span", { class: "adm-sub adm-err" }, `Could not be read: ${x.error}`),
          h("a", { class: "adm-sub", href: `${REPO_URL}/blob/main/${x.path}`, target: "_blank", rel: "noopener" }, "Open on GitHub")));
    }
    const cover = Array.isArray(x.v.photos) && x.v.photos[0];
    const thumb = h("img", { class: "adm-thumb", alt: cover ? `Cover photo of ${name}` : "", width: 96, height: 72, loading: "lazy" });
    if (cover) photoUrl(refToRepoPath(cover)).then((u) => { thumb.src = u; }).catch(() => thumb.classList.add("broken"));
    const isPub = x.v.published !== false;
    const isSold = x.v.sold === true;
    const price = x.v.priceOnRequest ? "On request" : Number.isFinite(x.v.price) ? formatPrice(x.v.price) : "—";
    return h("tr", { class: isPub ? "" : "is-hidden" },
      h("td", { "data-label": "Photo" }, cover ? thumb : h("span", { class: "adm-thumb empty" }, "No photo")),
      h("td", { "data-label": "Name" }, h("strong", {}, name),
        x.v.featured ? h("span", { class: "adm-badge" }, "Featured") : null,
        x.v.sample ? h("span", { class: "adm-badge sample" }, "Sample") : null,
        h("span", { class: "adm-sub" }, [x.v.year, x.v.level, x.v.country].filter(Boolean).join(" · "))),
      h("td", { "data-label": "Price" }, price),
      h("td", { "data-label": "Status" },
        h("span", { class: `adm-badge ${isPub ? "ok" : "off"}` }, isPub ? "Published" : "Hidden"),
        isSold ? h("span", { class: "adm-badge sold" }, "Sold") : null),
      h("td", { "data-label": "Actions", class: "adm-row-actions" },
        h("a", { class: "btn btn-sm", href: `#/horses/edit/${encodeURIComponent(x.slug)}` }, "Edit"),
        h("a", { class: "btn btn-ghost btn-sm", href: `#/horses/duplicate/${encodeURIComponent(x.slug)}` }, "Duplicate"),
        h("button", { type: "button", class: "btn btn-ghost btn-sm", onclick: async () => {
          const ok = await confirmDialog(isSold
            ? { title: `Mark “${name}” as available again?`, body: "The “Sold” ribbon disappears from the site.", confirmLabel: "Mark as available" }
            : { title: `Mark “${name}” as sold?`, body: "It stays on the site with a “Sold” ribbon, at the end of the list.", confirmLabel: "Mark as sold" });
          if (ok) save(x, { sold: !isSold }, `Admin: mark “${name}” as ${isSold ? "available" : "sold"}`, isSold ? `“${name}” is available again.` : `“${name}” is marked as sold.`);
        } }, isSold ? "Mark available" : "Mark sold"),
        h("button", { type: "button", class: "btn btn-ghost btn-sm", onclick: async () => {
          if (isPub) {
            const ok = await confirmDialog({ title: `Hide “${name}” from the website?`, body: "Its page and its card disappear from the site. You can publish it again at any time.", confirmLabel: "Hide it", danger: true });
            if (!ok) return;
          } else if (!(Array.isArray(x.v.photos) && x.v.photos.length)) {
            toast("Add at least one photo before publishing (Edit → Photos).", "err");
            return;
          }
          save(x, { published: !isPub }, `Admin: ${isPub ? "unpublish" : "publish"} “${name}”`, isPub ? `“${name}” is hidden.` : `“${name}” is published.`);
        } }, isPub ? "Unpublish" : "Publish"),
        h("button", { type: "button", class: "btn btn-ghost btn-sm adm-danger-text", onclick: async () => {
          const first = await confirmDialog({
            title: `Delete “${name}”?`,
            body: ["The horse and its page disappear from the website for good.", "If you only want to take it off the site for now, use “Unpublish” instead."],
            confirmLabel: "Delete…", danger: true,
          });
          if (!first) return;
          const second = await confirmDialog({
            title: "Are you completely sure?",
            body: "This can’t be undone from the panel. Its photos stay in the photo library.",
            confirmLabel: "Delete for good", danger: true, requireText: name,
          });
          if (!second) return;
          try {
            const res = await deleteFile(x.path, x.sha, `Admin: delete horse “${name}”`);
            trackCommit(res.commit, `${name} (deleted)`);
            horses = horses.filter((y) => y !== x);
            toast(`“${name}” was deleted.`);
            draw();
          } catch (e) {
            if (!(e instanceof ApiError && e.status === 401)) toast(e.message, "err");
          }
        } }, "Delete")));
  };

  const table = h("table", { class: "adm-table adm-horses" },
    h("caption", { class: "sr-only" }, "All horses in the catalogue"),
    h("thead", {}, h("tr", {}, ["Photo", "Name", "Price", "Status", "Actions"].map((c) => h("th", { scope: "col" }, c)))),
    body);
  const empty = h("p", { class: "adm-empty" }, "No horses yet. Press “Add a horse” to create the first one.");
  root.replaceChildren(
    h("div", { class: "adm-head" }, h("h2", {}, "Horses"), h("div", { class: "adm-head-actions" }, h("a", { class: "btn btn-sm", href: "#/horses/new" }, "Add a horse"))),
    summary, table, empty);
  draw();
}
