// A copy of every lead as a new card in the client's own Notion database. KV stays the
// source of truth: a lead is stored first, the visitor gets {ok:true}, and only then (in
// ctx.waitUntil) is it sent to Notion. A Notion failure is recorded on the stored lead.
//
// A card sets three properties of his and nothing else:
//   - his title property                          ← the visitor's name
//   - the stage property ("Face")                 ← the stage value ("Lead"): the board column
//   - the comment property ("comment on phase")   ← every answer, as plain text
// Which key, which database and which names: see notion-settings.ts (the admin panel's
// "Notion" screen, stored in KV, with the wrangler.toml values as the fallback).
// His schema is read (and cached in KV for 5 minutes) only to find those and to learn whether
// the stage is a status or a select. The names are found forgivingly (see findStage /
// findComment), and the property chosen is logged by name and type. If the stage or the
// comment cannot be used, the card is still created, the answers go into the page's text,
// and the lead is marked "partial" so the admin shows it. An option is never invented.
//
// Not configured (no key or no database) or switched off means: no call, no log, no trace.
// Nothing about the lead and nothing about the token is ever logged.

import { Env, HttpError, json, readJson } from "./http";
import { Lead, findLeadKey, listLeads, parseDay, putLead } from "./leads";
import { NotionSettings, loadNotion, notionSettings } from "./notion-settings";

const NOTION_VERSION = "2022-06-28";
const ATTEMPTS = 3; // the first try and two retries
const BACKOFF_MS = [500, 1500];
const MAX_RETRY_AFTER_MS = 5_000;
const CALL_TIMEOUT_MS = 6_000;
/** No new attempt is started after this: waitUntil keeps a Worker alive for about 30 s. */
const DEADLINE_MS = 18_000;
const SCHEMA_TTL_SEC = 300;
const TEXT_CHUNK = 2000; // Notion's limit for one piece of rich text
/** A lead with no Notion mark yet, younger than this, may still be on its way there. */
export const IN_FLIGHT_MS = 60_000;
/** Leads sent per resend call: each can take several calls, and a free-plan Worker gets 50. */
export const RESEND_BATCH = 10;

export const DEFAULT_STAGE_PROP = "Face";
export const DEFAULT_STAGE_VALUE = "Lead";
export const DEFAULT_COMMENT_PROP = "comment on phase";
/** Select properties that may be the stage when no name matches and there is no status property. */
const STAGE_SELECT_NAMES = ["face", "phase", "фаза", "status", "статус"];

/**
 * The database id from what the client pasted: the bare id (with or without dashes) or the
 * whole address of the database page. The address also carries `?v=<view id>`, which has the
 * same shape, so only the path is looked at.
 */
export function databaseId(raw: string): string | null {
  let s = raw.trim();
  try {
    if (/^https?:\/\//i.test(s)) s = new URL(s).pathname;
  } catch {
    return null;
  }
  const runs = s.replace(/-/g, "").match(/[0-9a-f]{32}/gi);
  return runs ? runs[runs.length - 1]!.toLowerCase() : null;
}

/** Same rule as the admin panel (src/scripts/admin/leads.js → horseOf): /#quiz?horse=<slug> or ?horse=<slug>. */
export function horseOf(page: string | undefined): string {
  if (!page) return "";
  try {
    const u = new URL(page);
    const fromHash = u.hash.startsWith("#quiz?") ? new URLSearchParams(u.hash.slice(6)).get("horse") : null;
    const slug = fromHash || u.searchParams.get("horse") || "";
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) return "";
    return slug.split("-").filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  } catch {
    return "";
  }
}

/**
 * The answers as a person scans them: the quiz's questions in its order, the horse when the
 * lead came from one, then the contact, the page and the time. Plain text, one line each.
 */
export function leadLines(lead: Lead): string[] {
  const lines = [
    `Region: ${lead.region}`,
    `Budget: ${lead.budget}`,
    `Buying: ${lead.format}`,
  ];
  const horse = horseOf(lead.page);
  if (horse) lines.push(`Horse: ${horse}`);
  lines.push(`Contact: ${lead.contact}`);
  if (lead.consent === true) lines.push("Consent: yes");
  if (lead.page) lines.push(`Page: ${lead.page}`);
  lines.push(`Received: ${lead.createdAt.slice(0, 10)} ${lead.createdAt.slice(11, 16)} UTC`);
  return lines;
}

/** Rich text of any length, in pieces Notion accepts. */
function richText(s: string): { type: "text"; text: { content: string } }[] {
  const out: { type: "text"; text: { content: string } }[] = [];
  for (let i = 0; i < s.length; i += TEXT_CHUNK) out.push({ type: "text", text: { content: s.slice(i, i + TEXT_CHUNK) } });
  return out.slice(0, 100);
}

// ---- his schema: only what it takes to find the three properties --------------------------

export interface Prop {
  name: string;
  type: string;
  /** Option names of a select or status property. */
  options?: string[];
}

export function parseSchema(body: unknown): Prop[] | null {
  const props = (body as { properties?: unknown } | null)?.properties;
  if (!props || typeof props !== "object") return null;
  const out: Prop[] = [];
  for (const [key, raw] of Object.entries(props as Record<string, unknown>)) {
    const v = raw as { name?: unknown; type?: unknown } & Record<string, unknown>;
    if (typeof v?.type !== "string") continue;
    const p: Prop = { name: typeof v.name === "string" ? v.name : key, type: v.type };
    if (v.type === "select" || v.type === "status") {
      const opts = (v[v.type] as { options?: unknown } | undefined)?.options;
      if (Array.isArray(opts)) {
        p.options = opts.map((o) => (o as { name?: unknown })?.name).filter((n): n is string => typeof n === "string").slice(0, 200);
      }
    }
    out.push(p);
  }
  return out.some((p) => p.type === "title") ? out : null;
}

const norm = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
/** For matching names: case and spaces do not count ("Comment on phase" = "commentonphase"). */
export const key = (s: string) => s.normalize("NFC").replace(/\s+/g, "").toLowerCase();

interface Chosen {
  prop?: Prop;
  /** How it was found: "configured name", "first status property", … (for the log). */
  how?: string;
}

/**
 * The stage property: the configured name (any case, spaces ignored) if it is a status or a
 * select; else the first status property; else the first select called face, phase, фаза,
 * status or статус.
 */
export function findStage(schema: Prop[], name: string): Chosen {
  const byName = schema.find((p) => key(p.name) === key(name) && (p.type === "status" || p.type === "select"));
  if (byName) return { prop: byName, how: "configured name" };
  const status = schema.find((p) => p.type === "status");
  if (status) return { prop: status, how: "first status property" };
  const select = schema.find((p) => p.type === "select" && STAGE_SELECT_NAMES.includes(norm(p.name)));
  if (select) return { prop: select, how: "select with a stage-like name" };
  return {};
}

/** The comment property: the configured name if it is text; else a text property whose name contains "comment". */
export function findComment(schema: Prop[], name: string): Chosen {
  const byName = schema.find((p) => key(p.name) === key(name) && p.type === "rich_text");
  if (byName) return { prop: byName, how: "configured name" };
  const like = schema.find((p) => p.type === "rich_text" && norm(p.name).includes("comment"));
  if (like) return { prop: like, how: "text property named like comment" };
  return {};
}

const shortList = (xs: string[]) => {
  const shown = xs.slice(0, 8).map((x) => (x.length > 30 ? `${x.slice(0, 29)}…` : x));
  return `${shown.join(", ")}${xs.length > shown.length ? ", …" : ""}` || "none";
};

export interface Card {
  body: Record<string, unknown>;
  /**
   * Why the stage or the comment could not be used; empty when the card is complete. Each
   * reason starts with "stage:" or "comment:", so the admin can tell which one it was.
   */
  problems: string[];
  /** Which of his properties were chosen, by name and type only: safe to log. */
  chosen: string;
}

export interface Names {
  stageProp: string;
  stageValue: string;
  commentProp: string;
}

export interface Plan {
  title: Prop;
  stage: Chosen;
  /** His exact spelling of the stage option, when the stage property has it. */
  option?: string;
  comment: Chosen;
  problems: string[];
  chosen: string;
}

/** Which of his properties a card would use with these names, and what is missing. */
export function planCard(schema: Prop[], names: Names): Plan {
  const title = schema.find((p) => p.type === "title")!;
  const problems: string[] = [];
  const chosen: string[] = [`title "${title.name}"`];

  const stage = findStage(schema, names.stageProp);
  let option: string | undefined;
  if (!stage.prop) {
    problems.push(`stage: no status or select property "${names.stageProp}"`);
    chosen.push("stage none");
  } else {
    const st = stage.prop;
    chosen.push(`stage "${st.name}" (${st.type}, ${stage.how})`);
    // An option that does not exist is never created: it would add a column to his board.
    option = (st.options || []).find((o) => key(o) === key(names.stageValue));
    if (!option) problems.push(`stage: "${st.name}" has no option "${names.stageValue}"; it has: ${shortList(st.options || [])}`);
  }

  const comment = findComment(schema, names.commentProp);
  if (!comment.prop) {
    problems.push(`comment: no text property "${names.commentProp}"`);
    chosen.push("comment none");
  } else {
    chosen.push(`comment "${comment.prop.name}" (${comment.prop.type}, ${comment.how})`);
  }
  return { title, stage, ...(option !== undefined ? { option } : {}), comment, problems, chosen: chosen.join("; ") };
}

/** The page to create for this lead in a database with this schema. */
export function buildCard(names: Names, lead: Lead, schema: Prop[], dbId: string): Card {
  const plan = planCard(schema, names);
  const properties: Record<string, unknown> = { [plan.title.name]: { title: richText(lead.name) } };
  const st = plan.stage.prop;
  if (st && plan.option) properties[st.name] = st.type === "status" ? { status: { name: plan.option } } : { select: { name: plan.option } };
  const lines = leadLines(lead);
  if (plan.comment.prop) properties[plan.comment.prop.name] = { rich_text: richText(lines.join("\n")) };

  const body: Record<string, unknown> = { parent: { database_id: dbId }, properties };
  // Whatever could not go where it belongs is written into the page, so nothing is lost.
  if (plan.problems.length) {
    body["children"] = lines.map((l) => ({ object: "block", type: "paragraph", paragraph: { rich_text: richText(l) } }));
  }
  return { body, problems: plan.problems, chosen: plan.chosen };
}

// ---- talking to Notion -----------------------------------------------------------------------

export interface SendResult {
  ok: boolean;
  /** The card exists but the stage or the comment could not be used. */
  partial?: string;
  /** Short and safe to store: "401 unauthorized", "db 404 object_not_found", "timeout". Never Notion's message text. */
  reason?: string;
  /** True when every following lead would fail the same way (bad token, no access, rate limit, outage). */
  global?: boolean;
}

export interface CallResult {
  ok: boolean;
  status: number;
  code: string;
  body?: unknown;
  retryAfterMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const base = (env: Env) => (env.NOTION_API_BASE || "https://api.notion.com").replace(/\/+$/, "");

/** One request to Notion. Throws only on a network error or a timeout. */
export async function call(env: Env, token: string, method: "GET" | "POST", path: string, body?: unknown): Promise<CallResult> {
  const resp = await fetch(`${base(env)}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "User-Agent": "dressage-horses-api",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
  let parsed: unknown;
  try {
    parsed = await resp.json();
  } catch {
    parsed = undefined;
  }
  const c = (parsed as { code?: unknown } | undefined)?.code;
  const ra = Number(resp.headers.get("Retry-After"));
  return {
    ok: resp.ok, status: resp.status, body: parsed,
    code: !resp.ok && typeof c === "string" && /^[a-z_]{1,40}$/.test(c) ? c : "",
    ...(Number.isFinite(ra) && ra > 0 ? { retryAfterMs: Math.min(ra * 1000, MAX_RETRY_AFTER_MS) } : {}),
  };
}

export const schemaKey = (dbId: string) => `notion:schema:${dbId}`;
export const SCHEMA_CACHE_TTL_SEC = SCHEMA_TTL_SEC;

/** His properties: from the KV cache, or fresh from Notion (and then cached for 5 minutes). */
async function loadSchema(env: Env, s: NotionSettings, dbId: string, fresh: boolean): Promise<{ schema?: Prop[]; cached: boolean; failure?: CallResult }> {
  if (!fresh) {
    const hit = await env.KV.get<Prop[]>(schemaKey(dbId), "json").catch(() => null);
    if (Array.isArray(hit) && hit.length) return { schema: hit, cached: true };
  }
  const r = await call(env, s.token, "GET", `/v1/databases/${dbId}`);
  if (!r.ok) return { cached: false, failure: r };
  const schema = parseSchema(r.body);
  if (!schema) return { cached: false, failure: { ok: false, status: 502, code: "no_schema" } };
  await env.KV.put(schemaKey(dbId), JSON.stringify(schema), { expirationTtl: SCHEMA_TTL_SEC }).catch(() => {});
  return { schema, cached: false };
}

function failure(r: CallResult, prefix: string): SendResult & { transient: boolean } {
  const transient = r.status === 429 || r.status === 409 || r.status >= 500;
  // 401 bad token, 403 no permission, 404 database not shared with the integration: the
  // same for every lead. A 400 on a page is about this one lead's data.
  const global = transient || r.status === 401 || r.status === 403 || r.status === 404 || prefix !== "";
  return { ok: false, reason: `${prefix}${r.status}${r.code ? ` ${r.code}` : ""}`, global, transient };
}

/** One lead → one new card, with two retries on errors that can pass (429, 409, 5xx, network). */
export async function sendToNotion(env: Env, ns: NotionSettings, lead: Lead): Promise<SendResult> {
  const dbId = ns.dbId;
  if (!dbId) return { ok: false, reason: "the database id is not valid", global: true };
  const started = Date.now();
  let schema: Prop[] | undefined;
  let cached = false;
  let refreshed = false;
  let last: SendResult = { ok: false, reason: "not sent", global: true };

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    let wait = BACKOFF_MS[attempt] ?? 0;
    try {
      if (!schema) {
        const s = await loadSchema(env, ns, dbId, refreshed);
        if (!s.schema) {
          const f = failure(s.failure!, "db ");
          last = f;
          if (!f.transient) return last;
          if (s.failure!.retryAfterMs) wait = Math.max(wait, s.failure!.retryAfterMs);
        } else {
          schema = s.schema;
          cached = s.cached;
        }
      }
      if (schema) {
        const card = buildCard(ns, lead, schema, dbId);
        // He may have just renamed or added a column: before a partial card, read his schema once more.
        if (card.problems.length && cached && !refreshed) {
          refreshed = true;
          schema = undefined;
          attempt--;
          continue;
        }
        const r = await call(env, ns.token, "POST", "/v1/pages", card.body);
        if (r.ok) {
          // His property names and types only, so the first real lead shows what was picked.
          console.log("notion", "card:", card.chosen);
          return card.problems.length ? { ok: true, partial: card.problems.join("; ") } : { ok: true };
        }
        // A column we cached may have been renamed or deleted since: read the schema again, once.
        if (r.status === 400 && cached && !refreshed) {
          refreshed = true;
          schema = undefined;
          attempt--;
          continue;
        }
        const f = failure(r, "");
        last = f;
        if (!f.transient) return last;
        if (r.retryAfterMs) wait = Math.max(wait, r.retryAfterMs);
      }
    } catch (e) {
      const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      last = { ok: false, reason: timeout ? "timeout" : "network error", global: true };
    }
    if (attempt < ATTEMPTS - 1) {
      if (Date.now() - started + wait > DEADLINE_MS) break;
      await sleep(wait);
    }
  }
  return last;
}

/** Sends one stored lead and writes the outcome onto it. */
async function syncAndMark(env: Env, ns: NotionSettings, key: string, lead: Lead): Promise<SendResult> {
  const r = await sendToNotion(env, ns, lead);
  const plain: Lead = { ...lead };
  delete plain.notion;
  delete plain.notionError;
  delete plain.notionAt;
  const at = new Date().toISOString();
  const marked: Lead = r.ok && !r.partial
    ? { ...plain, notion: "sent", notionAt: at }
    : r.ok
      ? { ...plain, notion: "partial", notionError: r.partial!.slice(0, 400), notionAt: at }
      : { ...plain, notion: "failed", notionError: (r.reason || "failed").slice(0, 60), notionAt: at };
  await putLead(env, key, marked);
  // A status and Notion's error code, or the names of his columns: never anything about the lead.
  if (!r.ok) console.warn("notion", "failed:", r.reason);
  else if (r.partial) console.warn("notion", "partial:", r.partial);
  return r;
}

/**
 * For ctx.waitUntil right after a lead is stored. Reads the settings here, after the visitor
 * has the answer, and does nothing at all (no call, no log) while Notion is off. Never throws.
 */
export async function syncNewLead(env: Env, key: string, lead: Lead): Promise<void> {
  try {
    const ns = await notionSettings(env);
    if (!ns) return;
    await syncAndMark(env, ns, key, lead);
  } catch (e) {
    console.error("notion", "sync", e instanceof Error ? e.name : typeof e);
  }
}

// ---- POST /admin/notion/resend ---------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** A card exists for these: sending again would make a second one. */
const inNotion = (l: Lead) => l.notion === "sent" || l.notion === "partial";

function dayField(v: unknown, name: string): string {
  if (v === undefined || v === null || v === "") return "";
  if (typeof v !== "string") throw new HttpError(400, `invalid ${name}: use YYYY-MM-DD`);
  return parseDay(v, name) ?? "";
}

/**
 * POST /admin/notion/resend  {"id":"<lead id>"}  or  {"from":"YYYY-MM-DD","to":"YYYY-MM-DD"}
 * (both dates optional; {} means every lead). At most RESEND_BATCH per call; `remaining` says
 * how many unsent leads are left for the next call. Leads that already have a card ("sent" or
 * "partial") are skipped; so is a lead that arrived in the last minute and may still be on its
 * way. Stops early on an error that every lead would hit (bad token, rate limit, outage).
 */
export async function handleNotionResend(request: Request, env: Env): Promise<Response> {
  const ns = await notionSettings(env);
  if (!ns) throw new HttpError(503, (await loadNotion(env)).configured ? "notion is switched off" : "notion not configured");
  const body = await readJson(request, 1024);
  for (const k of Object.keys(body)) if (!["id", "from", "to"].includes(k)) throw new HttpError(400, "unknown field");

  let targets: { key: string; lead: Lead }[];
  let explicit = false;
  if (body["id"] !== undefined) {
    if (body["from"] !== undefined || body["to"] !== undefined) throw new HttpError(400, "give an id or dates, not both");
    const id = body["id"];
    if (typeof id !== "string" || !UUID_RE.test(id)) throw new HttpError(400, "invalid field: id");
    const key = await findLeadKey(env, id);
    const lead = key ? await env.KV.get<Lead>(key, "json") : null;
    if (!key || !lead) throw new HttpError(404, "lead not found");
    targets = [{ key, lead }];
    explicit = true;
  } else {
    const from = dayField(body["from"], "from");
    const to = dayField(body["to"], "to");
    if (from && to && from > to) throw new HttpError(400, "from is after to");
    targets = await listLeads(env, from, to);
  }

  const now = Date.now();
  let alreadySent = 0;
  let pending = 0;
  const todo: { key: string; lead: Lead }[] = [];
  for (const t of targets) {
    if (inNotion(t.lead)) alreadySent++;
    else if (!explicit && !t.lead.notion && now - Date.parse(t.lead.createdAt) < IN_FLIGHT_MS) pending++;
    else todo.push(t);
  }
  // Never-tried leads first (oldest first), then the ones Notion refused before, least recently
  // tried first: a lead Notion keeps refusing moves to the back instead of blocking the rest.
  const order = (l: Lead) => `${l.notion === "failed" ? 1 : 0}${l.notion === "failed" ? l.notionAt || "" : l.createdAt}`;
  todo.sort((a, b) => (order(a.lead) < order(b.lead) ? -1 : order(a.lead) > order(b.lead) ? 1 : 0));

  let sent = 0;
  let partial = 0;
  let failed = 0;
  let attempted = 0;
  let stopped: string | undefined;
  for (const t of todo.slice(0, RESEND_BATCH)) {
    attempted++;
    // The listing can lag behind a write; read the lead itself before sending it again.
    const fresh = explicit ? t.lead : ((await env.KV.get<Lead>(t.key, "json")) ?? t.lead);
    if (inNotion(fresh)) {
      alreadySent++;
      continue;
    }
    const r = await syncAndMark(env, ns, t.key, fresh);
    if (r.ok) {
      sent++;
      if (r.partial) partial++;
    } else {
      failed++;
      if (r.global) {
        stopped = r.reason;
        break;
      }
    }
  }
  return json({
    ok: true, matched: targets.length, sent, partial, failed, alreadySent, pending,
    remaining: todo.length - attempted,
    ...(stopped ? { stopped } : {}),
  });
}
