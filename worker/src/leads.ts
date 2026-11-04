// Public lead intake and the admin's lead listing / CSV export.
//
// Two kinds of lead arrive at POST /lead:
//   quiz     the four-question quiz: region, budget, format, name, contact (the default
//            when `kind` is left out, so the quiz and older clients work unchanged)
//   message  the contact page's form: name, contact, a free-text `message`, consent
// The message is untrusted text from the open internet. It is stored as plain text, the
// API returns it only inside JSON, and the CSV neutralises it like every other cell. Any
// page that shows it must insert it as text (textContent), never as HTML.

import { Env, HttpError, json, readJson, textResponse } from "./http";
import { rateLimit } from "./security";

export const LEAD_BODY_LIMIT = 4 * 1024;
const MAX_LEADS = 10_000;
const TRACKING_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"] as const;
const KNOWN_KEYS = new Set<string>([
  "kind", "name", "region", "budget", "format", "contact", "whatsapp", "consent", "message",
  "website", // honeypot: a hidden field real people leave empty
  "ts", // ms since epoch when the form was rendered
  "page", "sent_at", ...TRACKING_KEYS,
]);
const MIN_FILL_MS = 2_000;
const MAX_CLOCK_DRIFT_MS = 30 * 24 * 60 * 60 * 1000;
// Control characters, including the JS line/paragraph separators.
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
// The same, minus the line feed: a message may have several lines.
const CONTROL_EXCEPT_LF_RE = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u2028\u2029]/;
/**
 * Longest message, in UTF-16 code units (what a textarea's maxlength counts). Chosen so
 * that a message at the cap, written in any two-byte script (Cyrillic, Greek, Arabic,
 * Hebrew…), still fits the 4 KB body limit together with the longest name, contact and
 * page address the API accepts.
 */
export const MESSAGE_MAX = 1000;
const MESSAGE_MAX_LINES = 40;
export const LEAD_KINDS = ["quiz", "message"] as const;
export type LeadKind = (typeof LEAD_KINDS)[number];

export interface Lead {
  id: string;
  createdAt: string;
  /** Leads stored before messages existed have no kind: read them as "quiz". */
  kind?: LeadKind;
  name: string;
  /** region, budget and format: quiz leads only. */
  region?: string;
  budget?: string;
  format?: string;
  /** Message leads only: plain text, at most MESSAGE_MAX characters, "\n" between lines. */
  message?: string;
  contact: string;
  consent?: boolean;
  page?: string;
  tracking?: Record<string, string>;
  country?: string;
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

/**
 * The free-text message: NFC, CR LF / CR → LF, tabs → spaces, trailing spaces cut from
 * every line, runs of blank lines collapsed to one, trimmed. Any other control character
 * is refused rather than silently dropped.
 */
function messageText(body: Record<string, unknown>): string {
  const v = body["message"];
  if (v === undefined || v === null || v === "") throw new HttpError(400, "missing field: message");
  if (typeof v !== "string") throw new HttpError(400, "invalid field: message");
  const s = v
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \u00a0]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (s.length === 0) throw new HttpError(400, "missing field: message");
  if (s.length > MESSAGE_MAX || CONTROL_EXCEPT_LF_RE.test(s) || s.split("\n").length > MESSAGE_MAX_LINES) {
    throw new HttpError(400, "invalid field: message");
  }
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

  const rawKind = body["kind"];
  if (rawKind !== undefined && !(LEAD_KINDS as readonly unknown[]).includes(rawKind)) {
    throw new HttpError(400, "invalid field: kind");
  }
  const kind: LeadKind = rawKind === "message" ? "message" : "quiz";

  const name = text(body, "name", 2, 100, true)!;
  let answers: { region: string; budget: string; format: string } | undefined;
  let message: string | undefined;
  if (kind === "quiz") {
    if (body["message"] !== undefined) throw new HttpError(400, "invalid field: message");
    answers = {
      region: text(body, "region", 1, 100, true)!,
      budget: text(body, "budget", 1, 100, true)!,
      format: text(body, "format", 1, 100, true)!,
    };
  } else {
    // A message carries no quiz answers: one shape per kind, nothing mixed.
    for (const k of ["region", "budget", "format"]) {
      if (body[k] !== undefined) throw new HttpError(400, `invalid field: ${k}`);
    }
    message = messageText(body);
  }
  const contact = text(body, "contact", 3, 200, false) ?? text(body, "whatsapp", 3, 200, false);
  if (contact === undefined) throw new HttpError(400, "missing field: contact");
  if (!validContact(contact)) throw new HttpError(400, "invalid field: contact");

  const consent = body["consent"];
  if (consent !== undefined && consent !== true) throw new HttpError(400, "invalid field: consent");
  // The quiz has always sent consent; older quiz clients that did not are still accepted.
  // The message form is new, so for it the box must have been ticked.
  if (kind === "message" && consent !== true) throw new HttpError(400, "missing field: consent");

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
    kind, name, ...answers, ...(message !== undefined ? { message } : {}), contact,
    ...(consent === true ? { consent: true } : {}),
    ...(page !== undefined ? { page } : {}),
    ...(Object.keys(tracking).length ? { tracking } : {}),
  };
}

export async function handleLead(request: Request, env: Env): Promise<Response> {
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
    const value = JSON.stringify(lead);
    // Small leads also ride in the key's metadata, so listing needs no extra reads.
    const metadata = new TextEncoder().encode(value).byteLength <= 1000 ? lead : undefined;
    await env.KV.put(`lead:${createdAt}:${id}`, value, metadata ? { metadata } : {});
  }
  return json({ ok: true });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDay(v: string | null, name: string): string | null {
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

  const leads: Lead[] = [];
  const missing = found.filter((f) => !f.meta);
  for (const f of found) if (f.meta) leads.push(f.meta);
  for (let i = 0; i < missing.length; i += 50) {
    const batch = await Promise.all(missing.slice(i, i + 50).map((f) => env.KV.get<Lead>(f.name, "json")));
    for (const l of batch) if (l) leads.push(l);
  }
  leads.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return { leads, truncated };
}

export async function handleLeads(request: Request, env: Env): Promise<Response> {
  const { leads, truncated } = await loadLeads(env, new URL(request.url));
  return json({ ok: true, count: leads.length, truncated, leads });
}

/**
 * Quotes a CSV cell and neutralises spreadsheet formulas (CSV injection). A value that
 * looks like a phone number may keep its leading "+"; free text (`freeText`) never may.
 */
function csvCell(v: string | undefined, freeText = false): string {
  let s = v ?? "";
  const phoneLike = !freeText && /^[+-]?[0-9 ()./-]*$/.test(s);
  if (/^[=@\t\r\n]/.test(s) || (/^[+-]/.test(s) && !phoneLike)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function handleLeadsCsv(request: Request, env: Env): Promise<Response> {
  const { leads } = await loadLeads(env, new URL(request.url));
  const cols = ["created_at", "name", "contact", "kind", "region", "budget", "format", "message", "consent", "country", "page",
    "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "id"];
  const rows = [cols.join(",")];
  for (const l of leads) {
    const t = l.tracking ?? {};
    rows.push([
      l.createdAt, l.name, l.contact, l.kind ?? "quiz", l.region, l.budget, l.format, l.message,
      l.consent ? "yes" : "", l.country, l.page,
      t["utm_source"], t["utm_medium"], t["utm_campaign"], t["utm_content"], t["utm_term"], l.id,
    ].map((v, i) => csvCell(v, cols[i] === "message")).join(","));
  }
  const day = new Date().toISOString().slice(0, 10);
  // BOM so Excel opens UTF-8 (names, €) correctly.
  return textResponse("\uFEFF" + rows.join("\r\n") + "\r\n", "text/csv; charset=utf-8", {
    "Content-Disposition": `attachment; filename="leads-${day}.csv"`,
  });
}
