// Notion settings, set from the admin panel's "Notion" screen and stored in KV under one key,
// `notion:config`. The wrangler.toml values (NOTION_TOKEN secret, NOTION_DB, NOTION_STAGE_PROP,
// NOTION_STAGE_VALUE, NOTION_COMMENT_PROP) are the fallback for every field the panel has not
// saved, so nothing changes until somebody saves something.
//
// The Notion key is a secret. It is stored in KV, which only this Worker can read, and it
// leaves the Worker only in the Authorization header of a request to Notion. It is never
// logged and never sent to the browser: the panel only learns "set or not" and its last four
// characters. Removing it is its own request ({"removeToken":true}), never an empty field.
//
//   GET  /admin/notion/config   the settings, the key masked
//   PUT  /admin/notion/config   save some or all of them
//   POST /admin/notion/check    read his database with the given (or stored) key: its title,
//                               every property, and which ones a card would use

import { Env, HttpError, json, readJson } from "./http";
import {
  CallResult, DEFAULT_COMMENT_PROP, DEFAULT_STAGE_PROP, DEFAULT_STAGE_VALUE, Names, Prop,
  SCHEMA_CACHE_TTL_SEC, call, databaseId, parseSchema, planCard, schemaKey,
} from "./notion";
import { rateLimit } from "./security";

export const CONFIG_KEY = "notion:config";
const CONFIG_BODY_LIMIT = 4 * 1024;
/**
 * What a Notion key may look like. Deliberately loose: one long word of printable characters,
 * no spaces. Notion's own shape is "ntn_…" now and "secret_…" before late 2024, but that is
 * Notion's business to change, and a key we refuse can never be tried — the person is left with
 * a working key and a panel that will not take it. Notion itself says yes or no.
 */
const TOKEN_RE = /^[\x21-\x7e]{20,200}$/;
const NAME_MAX = 100;
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
/** A check makes a call to Notion: generous for a person, a wall for a script. */
const CHECK_LIMIT = 30;
const CHECK_WINDOW_SEC = 10 * 60;

/** What the panel has saved. A field that is absent falls back to wrangler.toml. */
interface Stored {
  /** "" = removed on purpose: Notion is off, and the wrangler.toml secret is not used either. */
  token?: string;
  /** The 32-character id; "" = cleared on purpose. */
  db?: string;
  stageProp?: string;
  stageValue?: string;
  commentProp?: string;
  /** false = switched off from the panel, key and database kept. */
  enabled?: boolean;
  updatedAt?: string;
}

/** What delivering a card needs. Only ever built while Notion is on. */
export interface NotionSettings extends Names {
  token: string;
  /** null when the database setting is there but is not a database id (wrangler.toml only). */
  dbId: string | null;
}

type Source = "panel" | "server" | null;

interface Effective extends NotionSettings {
  enabled: boolean;
  /** Key and database are both there. */
  configured: boolean;
  tokenFrom: Source;
  dbFrom: Source;
  updatedAt?: string;
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

async function readStored(env: Env): Promise<Stored> {
  let raw: unknown = null;
  try {
    raw = await env.KV.get(CONFIG_KEY, "json");
  } catch {
    raw = null; // unreadable: as if nothing was saved
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const out: Stored = {};
  for (const k of ["token", "db", "stageProp", "stageValue", "commentProp", "updatedAt"] as const) {
    const v = str(r[k]);
    if (v !== undefined) out[k] = v;
  }
  if (typeof r["enabled"] === "boolean") out.enabled = r["enabled"];
  return out;
}

function resolve(env: Env, st: Stored): Effective {
  const envToken = (env.NOTION_TOKEN || "").trim();
  const envDb = (env.NOTION_DB || "").trim();
  const token = st.token !== undefined ? st.token : envToken;
  const dbRaw = st.db !== undefined ? st.db : envDb;
  const pick = (saved: string | undefined, fromEnv: string | undefined, fallback: string) =>
    (saved || "").trim() || (fromEnv || "").trim() || fallback;
  return {
    token,
    dbId: dbRaw ? databaseId(dbRaw) : null,
    stageProp: pick(st.stageProp, env.NOTION_STAGE_PROP, DEFAULT_STAGE_PROP),
    stageValue: pick(st.stageValue, env.NOTION_STAGE_VALUE, DEFAULT_STAGE_VALUE),
    commentProp: pick(st.commentProp, env.NOTION_COMMENT_PROP, DEFAULT_COMMENT_PROP),
    enabled: st.enabled !== false,
    configured: Boolean(token && dbRaw),
    tokenFrom: st.token !== undefined ? (st.token ? "panel" : null) : envToken ? "server" : null,
    dbFrom: st.db !== undefined ? (st.db ? "panel" : null) : envDb ? "server" : null,
    ...(st.updatedAt ? { updatedAt: st.updatedAt } : {}),
  };
}

export async function loadNotion(env: Env): Promise<Effective> {
  return resolve(env, await readStored(env));
}

/** The settings to deliver with, or null while Notion is not set up or is switched off. */
export async function notionSettings(env: Env): Promise<NotionSettings | null> {
  const e = await loadNotion(env);
  if (!e.configured || !e.enabled) return null;
  return { token: e.token, dbId: e.dbId, stageProp: e.stageProp, stageValue: e.stageValue, commentProp: e.commentProp };
}

/** What the panel may see. Never the key itself. */
function view(e: Effective) {
  return {
    ok: true,
    /** Cards are being made: switched on, with a key and a database. */
    active: e.enabled && e.configured,
    enabled: e.enabled,
    token: {
      set: Boolean(e.token),
      // Only the tail of a key long enough that four characters give nothing away.
      last4: e.token.length >= 20 ? e.token.slice(-4) : null,
      from: e.tokenFrom,
    },
    db: e.dbId || "",
    dbFrom: e.dbFrom,
    dbValid: e.dbFrom === null || e.dbId !== null,
    stageProp: e.stageProp,
    stageValue: e.stageValue,
    commentProp: e.commentProp,
    defaults: { stageProp: DEFAULT_STAGE_PROP, stageValue: DEFAULT_STAGE_VALUE, commentProp: DEFAULT_COMMENT_PROP },
    ...(e.updatedAt ? { updatedAt: e.updatedAt } : {}),
  };
}

// ---- input checks ----------------------------------------------------------------------------

/**
 * A pasted key, as a person pastes it: with the invisible characters a copy can drag along
 * (zero-width spaces, a byte-order mark) and the quotes or angle brackets a mail client wraps
 * it in. Nothing inside the key itself is touched.
 */
export function cleanToken(raw: string): string {
  return raw
    .replace(/[\u200b-\u200f\u2060\ufeff]/g, "")
    .trim()
    .replace(/^["'<`]+|["'>`]+$/g, "")
    .trim();
}

function tokenField(v: unknown): string {
  if (typeof v !== "string") throw new HttpError(400, "invalid field: token");
  const t = cleanToken(v);
  if (!t) throw new HttpError(400, "empty token: to remove the key, send removeToken");
  if (!TOKEN_RE.test(t)) throw new HttpError(400, "invalid token: a Notion key is one word with no spaces — use the Copy button next to it in Notion");
  return t;
}

/** "" (clear it), or the 32-character id from a pasted id or database link. */
function dbField(v: unknown): string {
  if (typeof v !== "string" || v.length > 2000) throw new HttpError(400, "invalid field: db");
  if (!v.trim()) return "";
  const id = databaseId(v);
  if (!id) throw new HttpError(400, "invalid database: paste the database's link or its 32-character id");
  return id;
}

/** "" (back to the default), or a property or option name as he wrote it in Notion. */
function nameField(v: unknown, name: string): string {
  if (typeof v !== "string") throw new HttpError(400, `invalid field: ${name}`);
  const s = v.normalize("NFC").trim();
  if (s.length > NAME_MAX || CONTROL_RE.test(s)) throw new HttpError(400, `invalid field: ${name}`);
  return s;
}

function onlyKeys(body: Record<string, unknown>, allowed: string[]) {
  for (const k of Object.keys(body)) if (!allowed.includes(k)) throw new HttpError(400, "unknown field");
}

// ---- GET / PUT /admin/notion/config ----------------------------------------------------------

export async function handleNotionConfigGet(_request: Request, env: Env): Promise<Response> {
  return json(view(await loadNotion(env)));
}

const NAME_KEYS = ["stageProp", "stageValue", "commentProp"] as const;

/**
 * PUT /admin/notion/config  {token?, removeToken?, db?, stageProp?, stageValue?, commentProp?, enabled?}
 * Only the fields sent change. A name sent as "" goes back to the default.
 */
export async function handleNotionConfigPut(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request, CONFIG_BODY_LIMIT);
  onlyKeys(body, ["token", "removeToken", "db", ...NAME_KEYS, "enabled"]);
  const next: Stored = await readStored(env);

  if (body["removeToken"] !== undefined) {
    if (body["removeToken"] !== true) throw new HttpError(400, "invalid field: removeToken");
    if (body["token"] !== undefined) throw new HttpError(400, "give a token or removeToken, not both");
    next.token = "";
  } else if (body["token"] !== undefined) {
    next.token = tokenField(body["token"]);
  }
  if (body["db"] !== undefined) next.db = dbField(body["db"]);
  for (const k of NAME_KEYS) {
    if (body[k] === undefined) continue;
    const v = nameField(body[k], k);
    if (v) next[k] = v;
    else delete next[k];
  }
  if (body["enabled"] !== undefined) {
    if (typeof body["enabled"] !== "boolean") throw new HttpError(400, "invalid field: enabled");
    next.enabled = body["enabled"];
  }
  next.updatedAt = new Date().toISOString();
  await env.KV.put(CONFIG_KEY, JSON.stringify(next));
  return json(view(resolve(env, next)));
}

// ---- POST /admin/notion/check ----------------------------------------------------------------

type Cause = "token" | "access" | "not_database" | "down";

/** What went wrong, in words for the owner. Never Notion's own message text. */
function explain(r: CallResult | "timeout" | "network"): { cause: Cause; status: number; message: string } {
  if (r === "timeout" || r === "network") {
    return { cause: "down", status: 0, message: "Notion did not answer. Notion may be down or slow right now; your settings may be fine. Try again in a few minutes." };
  }
  if (r.status === 401) {
    return { cause: "token", status: 401, message: "Notion does not accept this key. Copy the Internal Integration Secret again from notion.so/profile/integrations and paste it here." };
  }
  if (r.status === 404) {
    return { cause: "access", status: 404, message: "The key works, but Notion will not show this database to it. In Notion, open the database as a full page, click ••• (top right) → Connections → Connect to → choose your integration (e.g. “Website leads”) → Confirm. Then check again. If you did that already, check that the link is the database’s and not another page’s." };
  }
  if (r.status === 403) {
    return { cause: "access", status: 403, message: "The integration is not allowed to read this database. At notion.so/my-integrations → your integration → Capabilities, tick “Read content” and “Insert content”, save, and check again." };
  }
  if (r.status === 400 || r.status === 200) {
    return { cause: "not_database", status: r.status, message: "This link or id is not a database. It may be an ordinary page, or a view inside another page. Open the database itself as a full page (its name → ↗ Open as full page), then ••• → Copy link, and paste that." };
  }
  if (r.status === 429) {
    return { cause: "down", status: 429, message: "Notion is busy and asked us to slow down. Try again in a minute." };
  }
  return { cause: "down", status: r.status, message: `Notion had a problem on its side (${r.status}${r.code ? ` ${r.code}` : ""}). Your settings may be fine. Try again in a few minutes.` };
}

function databaseTitle(body: unknown): string {
  const t = (body as { title?: unknown } | null)?.title;
  if (!Array.isArray(t)) return "";
  return t.map((x) => {
    const p = (x as { plain_text?: unknown; text?: { content?: unknown } } | null);
    return typeof p?.plain_text === "string" ? p.plain_text : typeof p?.text?.content === "string" ? p.text.content : "";
  }).join("").slice(0, 300);
}

/**
 * POST /admin/notion/check  {token?, db?, stageProp?, stageValue?, commentProp?}
 * Anything not given comes from the saved settings. Answers 200 either way:
 *   {ok:true, database:{id,title}, properties:[{name,type,options?}], use:{stageProp,stageValue,commentProp}, problems:[…], active}
 *   {ok:false, cause:"token"|"access"|"not_database"|"down", status, message, active}
 */
export async function handleNotionCheck(request: Request, env: Env): Promise<Response> {
  await rateLimit(env, "notion-check", request, CHECK_LIMIT, CHECK_WINDOW_SEC);
  const body = await readJson(request, CONFIG_BODY_LIMIT);
  onlyKeys(body, ["token", "db", ...NAME_KEYS]);
  const saved = await loadNotion(env);

  const token = body["token"] !== undefined && body["token"] !== "" ? tokenField(body["token"]) : saved.token;
  if (!token) throw new HttpError(400, "no token: paste the Notion key first");
  let dbId: string | null;
  if (body["db"] !== undefined && body["db"] !== "") dbId = dbField(body["db"]);
  else dbId = saved.dbId;
  if (!dbId) throw new HttpError(400, "no database: paste the database's link first");
  const names: Names = { stageProp: saved.stageProp, stageValue: saved.stageValue, commentProp: saved.commentProp };
  for (const k of NAME_KEYS) {
    if (body[k] === undefined) continue;
    const v = nameField(body[k], k);
    if (v) names[k] = v;
  }

  let r: CallResult;
  try {
    r = await call(env, token, "GET", `/v1/databases/${dbId}`);
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return json({ ok: false, ...explain(timeout ? "timeout" : "network"), active: saved.enabled && saved.configured });
  }
  const isDb = r.ok && (r.body as { object?: unknown } | null)?.object === "database";
  const schema: Prop[] | null = isDb ? parseSchema(r.body) : null;
  if (!r.ok || !schema) return json({ ok: false, ...explain(r), active: saved.enabled && saved.configured });

  // Checking the database the Worker delivers to also refreshes its copy of his properties.
  if (token === saved.token && dbId === saved.dbId) {
    await env.KV.put(schemaKey(dbId), JSON.stringify(schema), { expirationTtl: SCHEMA_CACHE_TTL_SEC }).catch(() => {});
  }
  const plan = planCard(schema, names);
  return json({
    ok: true,
    database: { id: dbId, title: databaseTitle(r.body) },
    properties: schema,
    // The names a card would use right now: his exact spelling, "" where nothing fits.
    use: {
      stageProp: plan.stage.prop?.name || "",
      stageValue: plan.option || "",
      commentProp: plan.comment.prop?.name || "",
    },
    problems: plan.problems,
    active: saved.enabled && saved.configured,
  });
}
