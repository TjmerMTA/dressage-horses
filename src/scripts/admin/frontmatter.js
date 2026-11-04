// Reads and writes Markdown front matter — the small YAML subset the site's content uses:
// scalars (strings, numbers, booleans, dates) and lists of scalars. Anything else (nested
// maps, block scalars, comments) is kept byte for byte, so the panel never mangles a file
// it does not fully understand.

const KEY_RE = /^([A-Za-z_][\w-]*):(?:[ \t]+(.*?))?[ \t]*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @returns {{ fields: {key:string, value:any, supported:boolean, raw:string[], comments:string[]}[],
 *            body: string, hadFrontMatter: boolean }}
 */
export function parseFrontMatter(text) {
  const src = String(text).replace(/\r\n?/g, "\n");
  if (!src.startsWith("---\n")) return { fields: [], body: src, hadFrontMatter: false };
  const end = src.indexOf("\n---", 3);
  if (end === -1) return { fields: [], body: src, hadFrontMatter: false };
  const afterFence = src.indexOf("\n", end + 4);
  const head = src.slice(4, end + 1).split("\n");
  if (head[head.length - 1] === "") head.pop();
  const body = afterFence === -1 ? "" : src.slice(afterFence + 1);

  const fields = [];
  let comments = [];
  for (let i = 0; i < head.length; i++) {
    const line = head[i];
    const m = KEY_RE.exec(line);
    if (!m) {
      comments.push(line); // comment, blank, or something we keep as is
      continue;
    }
    const raw = [line];
    while (i + 1 < head.length && /^([ \t]+|-(\s|$))/.test(head[i + 1])) raw.push(head[++i]);
    const value = m[2] ?? "";
    const parsed = parseValue(value, raw.slice(1));
    fields.push({ key: m[1], value: parsed.value, supported: parsed.ok, raw, comments });
    comments = [];
  }
  if (comments.length) fields.push({ key: "", value: null, supported: false, raw: comments, comments: [] });
  return { fields, body, hadFrontMatter: true };
}

function parseValue(value, block) {
  const v = value.trim();
  if (v === "" && block.length) {
    const items = [];
    for (const l of block) {
      const m = /^\s*-\s+(.*)$/.exec(l);
      if (!m) return { ok: false, value: null };
      const s = parseScalar(m[1]);
      if (!s.ok) return { ok: false, value: null };
      items.push(s.value);
    }
    return { ok: true, value: items };
  }
  if (block.length) return { ok: false, value: null }; // continuation lines we do not model
  if (v.startsWith("[") && v.endsWith("]")) return parseInlineList(v.slice(1, -1));
  return parseScalar(v);
}

function parseScalar(raw) {
  let v = raw.trim();
  if (v.startsWith('"')) {
    if (!/"$/.test(v) || v.length < 2) return { ok: false, value: null };
    try { return { ok: true, value: JSON.parse(v) }; } catch { return { ok: false, value: null }; }
  }
  if (v.startsWith("'")) {
    if (!/'$/.test(v) || v.length < 2) return { ok: false, value: null };
    return { ok: true, value: v.slice(1, -1).replace(/''/g, "'") };
  }
  if (/^[|>{&*!%@`]/.test(v)) return { ok: false, value: null };
  v = v.replace(/\s+#.*$/, "");
  if (v === "" || v === "~" || v === "null") return { ok: true, value: null };
  if (/^(true|True|TRUE)$/.test(v)) return { ok: true, value: true };
  if (/^(false|False|FALSE)$/.test(v)) return { ok: true, value: false };
  if (/^-?\d+(\.\d+)?$/.test(v)) return { ok: true, value: Number(v) };
  if (/: |^- /.test(v)) return { ok: false, value: null };
  return { ok: true, value: v };
}

function parseInlineList(inner) {
  const items = [];
  let cur = "";
  let quote = "";
  for (const ch of inner) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === ",") {
      items.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (quote) return { ok: false, value: null };
  if (cur.trim() !== "" || items.length) items.push(cur);
  const out = [];
  for (const it of items) {
    const s = parseScalar(it);
    if (!s.ok) return { ok: false, value: null };
    out.push(s.value);
  }
  return { ok: true, value: out };
}

/** A YAML scalar that reads back as the same value. */
function scalar(v) {
  if (typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) return String(v);
  const s = String(v);
  if (DATE_RE.test(s)) return s;
  return JSON.stringify(s).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function emit(key, value) {
  if (Array.isArray(value)) {
    if (!value.length) return [`${key}: []`];
    return [`${key}:`, ...value.map((x) => `  - ${scalar(x)}`)];
  }
  return [`${key}: ${scalar(value)}`];
}

/**
 * Rebuilds the file. `updates` maps key → new value; `undefined` or `null` removes the key.
 * Keys not in `updates` are written back exactly as they were. New keys follow `order`.
 */
export function buildFrontMatter(doc, updates, body, order = []) {
  const lines = [];
  const done = new Set();
  for (const f of doc.fields) {
    if (f.key && Object.prototype.hasOwnProperty.call(updates, f.key)) {
      done.add(f.key);
      const v = updates[f.key];
      if (v === undefined || v === null) continue;
      // Unchanged values keep their original spelling (quotes, spacing), so diffs stay small.
      if (f.supported && JSON.stringify(f.value) === JSON.stringify(v)) lines.push(...f.comments, ...f.raw);
      else lines.push(...f.comments, ...emit(f.key, v));
    } else {
      lines.push(...f.comments, ...f.raw);
    }
  }
  const rest = Object.keys(updates).filter((k) => !done.has(k));
  rest.sort((a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999));
  for (const k of rest) {
    const v = updates[k];
    if (v !== undefined && v !== null) lines.push(...emit(k, v));
  }
  const text = String(body ?? "").replace(/\r\n?/g, "\n").replace(/^\n+/, "");
  const gap = /^\n/.test(doc.body || "") ? "\n" : ""; // keep a blank line after the fence if there was one
  return `---\n${lines.join("\n")}\n---\n${text ? gap + (text.endsWith("\n") ? text : `${text}\n`) : ""}`;
}

/** key → value for the keys the parser fully understood. */
export function valuesOf(doc) {
  const out = {};
  for (const f of doc.fields) if (f.key && f.supported) out[f.key] = f.value;
  return out;
}
