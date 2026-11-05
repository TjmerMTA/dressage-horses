// Public lead intake and the admin's lead listing / CSV export.

import { Env, HttpError, json, readJson, textResponse } from "./http";
import { notionConfigured, syncNewLead } from "./notion";
import { rateLimit } from "./security";

export const LEAD_BODY_LIMIT = 4 * 1024;
const MAX_LEADS = 10_000;
const TRACKING_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"] as const;
const KNOWN_KEYS = new Set<string>([
  "name", "region", "budget", "format", "contact", "whatsapp", "consent",
  "website", // honeypot: a hidden field real people leave empty
  "ts", // ms since epoch when the form was rendered
  "page", "sent_at", ...TRACKING_KEYS,
]);
const MIN_FILL_MS = 2_000;
const MAX_CLOCK_DRIFT_MS = 30 * 24 * 60 * 60 * 1000;
// Control characters, including the JS line/paragraph separators.
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

export interface Lead {
  id: string;
  createdAt: string;
  name: string;
  region: string;
  budget: string;
  format: string;
  contact: string;
  consent?: boolean;
  page?: string;
  tracking?: Record<string, string>;
  country?: string;
  /**
   * Set only once Notion is configured. "sent": the card is complete. "partial": the card exists,
   * but "phase" or "comment on phase" could not be used (see notionError). "failed": no card.
   */
  notion?: "sent" | "partial" | "failed";
  /** Why it failed or is partial, short ("401 unauthorized", 'no column "phase"'). Never Notion's message or lead data. */
  notionError?: string;
  notionAt?: string;
}

export const leadKey = (lead: Lead) => `lead:${lead.createdAt}:${lead.id}`;

/** Stores a lead. Small leads also ride in the key's metadata, so listing needs no extra reads. */
export async function putLead(env: Env, key: string, lead: Lead): Promise<void> {
  const value = JSON.stringify(lead);
  const metadata = new TextEncoder().encode(value).byteLength <= 1000 ? lead : undefined;
  await env.KV.put(key, value, metadata ? { metadata } : {});
}

function text(body: Record<string, unknown>, key: string, min: number, max: number, required: boolean): string | undefined {
  const v = body[key];
  if (v === undefined || v === null || v === "") {
    if (required) throw new HttpError(400, `missing field: ${key}`);
    return undefined;
  }
  if (typeof v !== "string") throw new HttpError(400, `invalid field: ${key}`);
  const s = v.normalize("NFC").trim();
  if (s.length < min || s.length > max || CONTROL_RE.test(s)) throw new HttpError(400, `invalid field: ${key}`);
  return s;
}

function validContact(s: string): boolean {
  if (/^\+?[0-9 ()./-]{7,30}$/.test(s)) {
    const digits = s.replace(/\D/g, "").length;
    return digits >= 7 && digits <= 15;
  }
  return s.length <= 200 && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/.test(s);
}

/** Returns the lead to store, or null when it is a bot that should get a silent `ok`. */
export function validateLead(body: Record<string, unknown>, now: number): Omit<Lead, "id" | "createdAt"> | null {
  for (const k of Object.keys(body)) {
    if (!KNOWN_KEYS.has(k)) throw new HttpError(400, "unknown field");
  }

  const honeypot = body["website"];
  if (honeypot !== undefined && typeof honeypot !== "string") throw new HttpError(400, "invalid field: website");

  const ts = body["ts"];
  if (typeof ts !== "number" || !Number.isFinite(ts) || !Number.isInteger(ts)) {
    throw new HttpError(400, "missing field: ts");
  }
  const age = now - ts;
  if (Math.abs(age) > MAX_CLOCK_DRIFT_MS) throw new HttpError(400, "invalid field: ts");

  if (typeof honeypot === "string" && honeypot.length > 0) return null;
  // Submitted faster than a person can fill the form. A client clock running ahead
  // gives a negative age; we let that through rather than drop a real lead.
  if (age >= 0 && age < MIN_FILL_MS) return null;

  const name = text(body, "name", 2, 100, true)!;
  const region = text(body, "region", 1, 100, true)!;
  const budget = text(body, "budget", 1, 100, true)!;
  const format = text(body, "format", 1, 100, true)!;
  const contact = text(body, "contact", 3, 200, false) ?? text(body, "whatsapp", 3, 200, false);
  if (contact === undefined) throw new HttpError(400, "missing field: contact");
  if (!validContact(contact)) throw new HttpError(400, "invalid field: contact");

  const consent = body["consent"];
  if (consent !== undefined && consent !== true) throw new HttpError(400, "invalid field: consent");

  text(body, "sent_at", 0, 40, false); // accepted for compatibility, not stored

  const page = text(body, "page", 1, 500, false);
  if (page !== undefined) {
    let u: URL;
    try {
      u = new URL(page);
    } catch {
      throw new HttpError(400, "invalid field: page");
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new HttpError(400, "invalid field: page");
  }

  const tracking: Record<string, string> = {};
  for (const k of TRACKING_KEYS) {
    const v = text(body, k, 1, 200, false);
    if (v !== undefined) tracking[k] = v;
  }

  return {
    name, region, budget, format, contact,
    ...(consent === true ? { consent: true } : {}),
    ...(page !== undefined ? { page } : {}),
    ...(Object.keys(tracking).length ? { tracking } : {}),
  };
}

export async function handleLead(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  await rateLimit(env, "lead", request, 5, 10 * 60);
  const body = await readJson(request, LEAD_BODY_LIMIT);
  const now = Date.now();
  const fields = validateLead(body, now);
  if (fields) {
    const createdAt = new Date(now).toISOString();
    const id = crypto.randomUUID();
    const country = (request as Request<unknown, IncomingRequestCfProperties>).cf?.country;
    const lead: Lead = {
      id, createdAt, ...fields,
      ...(typeof country === "string" && /^[A-Z]{2}$/.test(country) ? { country } : {}),
    };
    const key = leadKey(lead);
    await putLead(env, key, lead);
    // Stored first; Notion gets its copy after the visitor already has the answer.
    if (notionConfigured(env)) ctx.waitUntil(syncNewLead(env, key, lead));
  }
  return json({ ok: true });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDay(v: string | null, name: string): string | null {
  if (v === null || v === "") return null;
  if (!DATE_RE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) {
    throw new HttpError(400, `invalid ${name}: use YYYY-MM-DD`);
  }
  return v;
}

async function loadLeads(env: Env, url: URL): Promise<{ leads: Lead[]; truncated: boolean }> {
  const from = parseDay(url.searchParams.get("from"), "from");
  const to = parseDay(url.searchParams.get("to"), "to");
  if (from && to && from > to) throw new HttpError(400, "from is after to");
  const { items, truncated } = await collect(env, from ?? "", to ?? "");
  const leads = items.map((i) => i.lead);
  leads.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return { leads, truncated };
}

/** Leads (with their KV keys) between two UTC days, inclusive; "" means open-ended. */
export async function listLeads(env: Env, from: string, to: string): Promise<{ key: string; lead: Lead }[]> {
  return (await collect(env, from, to)).items;
}

async function collect(env: Env, from: string, to: string): Promise<{ items: { key: string; lead: Lead }[]; truncated: boolean }> {
  const lo = from ? `${from}T00:00:00.000Z` : "";
  const hi = to ? `${to}T23:59:59.999Z` : "";

  const found: { name: string; meta: Lead | null }[] = [];
  let cursor: string | undefined;
  let truncated = false;
  do {
    const page: KVNamespaceListResult<Lead, string> = await env.KV.list<Lead>({ prefix: "lead:", cursor, limit: 1000 });
    for (const k of page.keys) {
      const at = k.name.slice(5, 29); // ISO timestamp inside the key
      if (lo && at < lo) continue;
      if (hi && at > hi) continue;
      if (found.length >= MAX_LEADS) {
        truncated = true;
        break;
      }
      found.push({ name: k.name, meta: (k.metadata as Lead | undefined) ?? null });
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor && !truncated);

  const items: { key: string; lead: Lead }[] = [];
  const missing = found.filter((f) => !f.meta);
  for (const f of found) if (f.meta) items.push({ key: f.name, lead: f.meta });
  for (let i = 0; i < missing.length; i += 50) {
    const part = missing.slice(i, i + 50);
    const batch = await Promise.all(part.map((f) => env.KV.get<Lead>(f.name, "json")));
    batch.forEach((l, j) => { if (l) items.push({ key: part[j]!.name, lead: l }); });
  }
  return { items, truncated };
}

/** The KV key of the lead with this id (keys are lead:<createdAt>:<id>), or null. */
export async function findLeadKey(env: Env, id: string): Promise<string | null> {
  let cursor: string | undefined;
  do {
    const page = await env.KV.list({ prefix: "lead:", cursor, limit: 1000 });
    const hit = page.keys.find((k) => k.name.endsWith(`:${id}`));
    if (hit) return hit.name;
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return null;
}

export async function handleLeads(request: Request, env: Env): Promise<Response> {
  const { leads, truncated } = await loadLeads(env, new URL(request.url));
  // `notion` is present only once Notion is configured, so the panel can say nothing until then.
  return json({ ok: true, count: leads.length, truncated, leads, ...(notionConfigured(env) ? { notion: true } : {}) });
}

/** Quotes a CSV cell and neutralises spreadsheet formulas (CSV injection). */
function csvCell(v: string | undefined): string {
  let s = v ?? "";
  const phoneLike = /^[+-]?[0-9 ()./-]*$/.test(s);
  if (/^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !phoneLike)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function handleLeadsCsv(request: Request, env: Env): Promise<Response> {
  const { leads } = await loadLeads(env, new URL(request.url));
  const cols = ["created_at", "name", "contact", "region", "budget", "format", "consent", "country", "page",
    "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "id"];
  const rows = [cols.join(",")];
  for (const l of leads) {
    const t = l.tracking ?? {};
    rows.push([
      l.createdAt, l.name, l.contact, l.region, l.budget, l.format, l.consent ? "yes" : "", l.country, l.page,
      t["utm_source"], t["utm_medium"], t["utm_campaign"], t["utm_content"], t["utm_term"], l.id,
    ].map(csvCell).join(","));
  }
  const day = new Date().toISOString().slice(0, 10);
  // BOM so Excel opens UTF-8 (names, €) correctly.
  return textResponse("\uFEFF" + rows.join("\r\n") + "\r\n", "text/csv; charset=utf-8", {
    "Content-Disposition": `attachment; filename="leads-${day}.csv"`,
  });
}
