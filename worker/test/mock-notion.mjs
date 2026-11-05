// A tiny stand-in for the two Notion API calls the Worker makes. Only for test.sh.
// Never talks to Notion.
//
//   node test/mock-notion.mjs <port> <expected-token> <expected-database-id>
//
//   GET  /v1/databases/<id>   the schema: "status" (default), "select", "fbstatus", "fbselect",
//                             "nocomment", "nostage" or "nooption", see SCHEMAS below
//   POST /v1/pages            checked against that schema the way Notion does: an unknown
//                             property, a value of the wrong type, an option that does not
//                             exist, text over 2000 characters or an empty string → 400
//
// What a page creation answers depends on the lead's name (the card's title):
//   "Notion401 …"  → 401 unauthorized          "Notion429 …" → 429 rate_limited (Retry-After: 1)
//   "Notion500 …"  → 500 internal_server_error  "Flaky …"     → 500 the first time, then 200
//   "Slow …"       → 200 after 4 seconds        anything else → 200
// Test-only routes:
//   GET  /__calls           every request received: { at, method, path, auth, version, body }
//   POST /__mode?m=ok       from now on answer 200 to every page ("normal" switches the names back on)
//   POST /__schema?s=select switch the schema
import http from "node:http";
import crypto from "node:crypto";

const [port, token, dbId] = [Number(process.argv[2]), process.argv[3], process.argv[4]];
const calls = [];
const seen = new Map(); // title → number of page calls
let mode = "normal";

const opts = (...names) => ({ options: names.map((name) => ({ id: crypto.randomUUID(), name, color: "default" })) });
const SCHEMAS = {
  // Like his board: a title not called "Name", "Face" as a status, and columns of his that a
  // card must never touch (one of them another select).
  status: {
    "Клієнт": { type: "title", title: {} },
    "Budget": { type: "select", select: opts("€30 000 – 60 000") },
    "Face": { type: "status", status: { ...opts("Lead", "Selection", "Deal"), groups: [] } },
    "Comment on phase": { type: "rich_text", rich_text: {} },
    "Phone": { type: "phone_number", phone_number: {} },
    "Created": { type: "created_time", created_time: {} },
  },
  // The stage as a select, odd spacing and case in both names, a two-language title.
  select: {
    "Клієнт / Client": { type: "title", title: {} },
    "FA CE": { type: "select", select: opts("Deal", "lead") },
    "CommentOnPhase": { type: "rich_text", rich_text: {} },
  },
  // No "Face", but a status under another name, and a comment named differently.
  fbstatus: {
    "Клієнт": { type: "title", title: {} },
    "Notes": { type: "rich_text", rich_text: {} },
    "Фаза": { type: "status", status: { ...opts("Lead", "Deal"), groups: [] } },
    "Comments (phase)": { type: "rich_text", rich_text: {} },
  },
  // No status at all: the stage is a select called "Статус"; an earlier select must not be taken.
  fbselect: {
    "Клієнт": { type: "title", title: {} },
    "Region": { type: "select", select: opts("Europe", "Lead") },
    "Статус": { type: "select", select: opts("Lead", "Deal") },
    "comment on phase": { type: "rich_text", rich_text: {} },
  },
  // No comment property (and a text property that must not be taken for it).
  nocomment: {
    "Клієнт": { type: "title", title: {} },
    "Face": { type: "status", status: { ...opts("Lead", "Deal"), groups: [] } },
    "Notes": { type: "rich_text", rich_text: {} },
  },
  // No stage: no status, and the only select has an unrelated name.
  nostage: {
    "Клієнт": { type: "title", title: {} },
    "Budget": { type: "select", select: opts("Lead") },
    "Comment on phase": { type: "rich_text", rich_text: {} },
  },
  // "Face" exists, but without a "Lead" option.
  nooption: {
    "Клієнт": { type: "title", title: {} },
    "Face": { type: "status", status: { ...opts("Лід", "Підбір", "Угода"), groups: [] } },
    "Comment on phase": { type: "rich_text", rich_text: {} },
  },
};
let schemaName = "status";

const send = (res, status, obj, extra = {}) => {
  res.writeHead(status, { "Content-Type": "application/json", ...extra });
  res.end(JSON.stringify(obj));
};
const err = (res, status, code, extra) => send(res, status, { object: "error", status, code, message: `mock ${code}` }, extra);
const WRITABLE = new Set(["title", "rich_text", "select", "multi_select", "status", "phone_number", "email", "url", "checkbox", "date"]);

/** The reason Notion would refuse these properties, or "". */
function refuse(props) {
  const schema = SCHEMAS[schemaName];
  let titles = 0;
  for (const [name, v] of Object.entries(props)) {
    const col = schema[name];
    if (!col) return `${name} is not a property that exists`;
    if (!WRITABLE.has(col.type)) return `${name} cannot be written`;
    const keys = Object.keys(v || {});
    if (keys.length !== 1 || keys[0] !== col.type) return `${name} is expected to be ${col.type}`;
    if (col.type === "title") titles++;
    if (JSON.stringify(v).includes('""')) return `${name}: empty string`;
    // (Real Notion would add an unknown select option; the Worker must never rely on that.)
    if (col.type === "select" && !col.select.options.some((o) => o.name === v.select.name)) return `${name}: no such select option`;
    if (col.type === "status" && !col.status.options.some((o) => o.name === v.status.name)) return `${name}: no such status option`;
    const texts = v.title || v.rich_text;
    if (texts && (texts.length > 100 || texts.some((t) => t.text.content.length > 2000))) return `${name}: text over the limit`;
  }
  return titles === 1 ? "" : "exactly one title is required";
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/__calls") return send(res, 200, calls);
  if (url.pathname === "/__mode" && req.method === "POST") {
    mode = url.searchParams.get("m") || "normal";
    return send(res, 200, { mode });
  }
  if (url.pathname === "/__schema" && req.method === "POST") {
    schemaName = SCHEMAS[url.searchParams.get("s")] ? url.searchParams.get("s") : "status";
    return send(res, 200, { schema: schemaName });
  }

  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    let body = null;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { /* checked below */ }
    calls.push({ at: Date.now(), method: req.method, path: url.pathname, auth: req.headers.authorization || "", version: req.headers["notion-version"] || "", body });

    if (req.headers.authorization !== `Bearer ${token}`) return err(res, 401, "unauthorized");
    if (req.headers["notion-version"] !== "2022-06-28") return err(res, 400, "missing_version");

    if (req.method === "GET" && url.pathname.startsWith("/v1/databases/")) {
      if (url.pathname.slice(14) !== dbId) return err(res, 404, "object_not_found");
      const properties = Object.fromEntries(Object.entries(SCHEMAS[schemaName]).map(([name, v]) => [name, { id: crypto.randomUUID().slice(0, 4), name, ...v }]));
      return send(res, 200, { object: "database", id: dbId, title: [{ plain_text: "Підбір для клієнтів / Clients Selection" }], properties });
    }
    if (req.method !== "POST" || url.pathname !== "/v1/pages") return err(res, 404, "invalid_request_url");
    if (!body || body.parent?.database_id !== dbId) return err(res, 404, "object_not_found");
    const why = refuse(body.properties || {});
    if (why) return send(res, 400, { object: "error", status: 400, code: "validation_error", message: why });
    if (JSON.stringify(body.children || []).includes('""')) return err(res, 400, "validation_error");

    const titleProp = Object.values(body.properties).find((v) => v.title);
    const title = titleProp?.title?.[0]?.text?.content || "";
    const n = (seen.get(title) || 0) + 1;
    seen.set(title, n);
    const ok = () => send(res, 200, { object: "page", id: crypto.randomUUID() });

    if (mode === "ok") return ok();
    if (title.startsWith("Notion401")) return err(res, 401, "unauthorized");
    if (title.startsWith("Notion429")) return err(res, 429, "rate_limited", { "Retry-After": "1" });
    if (title.startsWith("Notion500")) return err(res, 500, "internal_server_error");
    if (title.startsWith("Flaky") && n === 1) return err(res, 500, "internal_server_error");
    if (title.startsWith("Slow")) return setTimeout(ok, 4000);
    ok();
  });
}).listen(port, "127.0.0.1");
