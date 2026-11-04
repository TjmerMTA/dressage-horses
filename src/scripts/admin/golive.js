// "Before you go live": every company fact that is still unset, what visitors see
// instead, and a link straight to the field that fills it. Reads the same files the
// site is built from and uses the same rules (src/scripts/site-values.js).
import { ApiError, readFile } from "./api.js";
import { PAGES_DIR, TEXTS_DIR } from "./config.js";
import { parseFrontMatter, valuesOf } from "./frontmatter.js";
import { unsetValues } from "../site-values.js";
import { errorBox, h, spinner } from "./ui.js";

async function load() {
  const [site, imprint, privacy] = await Promise.all([
    readFile(`${TEXTS_DIR}/site.json`).then((f) => JSON.parse(f.content)),
    readFile(`${PAGES_DIR}/imprint.md`).then((f) => valuesOf(parseFrontMatter(f.content))),
    readFile(`${PAGES_DIR}/privacy.md`).then((f) => valuesOf(parseFrontMatter(f.content))),
  ]);
  return unsetValues({ site, imprint, privacy });
}

const hrefFor = (x) => `#/texts/${x.file.endsWith(".md") ? "p" : "t"}/${x.file}/${encodeURIComponent(x.field)}`;

export function setGoLiveCount(n) {
  const badge = document.getElementById("nav-golive");
  if (!badge) return;
  badge.hidden = !(n > 0);
  badge.textContent = n > 0 ? String(n) : "";
}

export async function refreshGoLiveCount() {
  try { setGoLiveCount((await load()).length); } catch { /* the badge is a nicety */ }
}

export async function renderGoLive(root) {
  root.replaceChildren(spinner("Checking what is still unset…"));
  let items;
  try {
    items = await load();
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 401)) root.replaceChildren(h("h2", {}, "Before you go live"), errorBox(e));
    return;
  }
  setGoLiveCount(items.length);
  const groups = [
    ["Company and contacts", items.filter((x) => x.file === "site.json")],
    ["Imprint", items.filter((x) => x.file === "imprint.md")],
    ["Privacy policy", items.filter((x) => x.file === "privacy.md")],
  ].filter(([, list]) => list.length);
  root.replaceChildren(
    h("h2", {}, "Before you go live"),
    h("p", { class: "adm-muted" }, "These are the company’s own details the site does not have yet. Visitors never see a gap or a placeholder: until a value is filled in, the site hides that button or says the detail will follow. Fill in only real, official data."),
    ...(items.length === 0
      ? [h("p", { class: "adm-note adm-done" }, "Everything is filled in. The site has all the company details it needs.")]
      : [
        h("p", { class: "adm-count-line" }, `${items.length} value${items.length === 1 ? "" : "s"} still unset.`),
        ...groups.map(([title, list]) => h("section", { class: "adm-section adm-golive", "aria-label": title },
          h("h3", {}, title),
          h("ul", {}, list.map((x) => h("li", {},
            h("div", {}, h("strong", {}, x.label.replace(/^Imprint: /, "")), h("span", { class: "adm-sub" }, x.effect)),
            h("a", { class: "btn btn-ghost btn-sm", href: hrefFor(x) }, x.file === "privacy.md" ? "Review" : "Fill in")))))),
      ]));
}
