// Sends the contact page's message form to the Worker's POST /lead as a lead of kind
// "message". Same endpoint, conventions and safeguards as the quiz (src/scripts/lead-form.js):
// the `ts` timestamp and `website` honeypot that let the Worker drop bots, the page address
// and utm_* / fbclid / gclid. Kept apart from lead-form.js, which sends quiz answers only.
//
//   import { sendMessage, MESSAGE_MAX, normaliseMessage } from "../scripts/send-message.js";
//   const result = await sendMessage({ name, contact, message, consent: true, website, ts });
//   result: { ok: true } | { ok: false, reason, field? }
//   reason: "invalid" (field says which one) | "too-long" | "rate-limited" | "network" | "server" | "not-configured"
//
// It never throws, and it shows nothing: the form turns `reason` into its own words.
import { API_BASE, API_CONFIGURED } from "./api-base.js";

/** The Worker's cap (worker/src/leads.ts MESSAGE_MAX); a textarea's maxlength counts the same units. */
export const MESSAGE_MAX = 1000;
export const MESSAGE_MAX_LINES = 40;
const TRACKING = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"];

/** The same clean-up the Worker applies, so the form can count what will really be stored. */
export function normaliseMessage(text) {
  return String(text || "")
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[  ]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Phone with 7–15 digits, or an e-mail address: the Worker's own rule. */
export function validContact(s) {
  if (/^\+?[0-9 ()./-]{7,30}$/.test(s)) {
    const digits = s.replace(/\D/g, "").length;
    return digits >= 7 && digits <= 15;
  }
  return s.length <= 200 && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/.test(s);
}

/**
 * @param {{name:string, contact:string, message:string, consent:boolean, website?:string, ts:number}} m
 * @returns {Promise<{ok:true}|{ok:false,reason:string,field?:string}>}
 */
export async function sendMessage(m) {
  if (!API_CONFIGURED) return { ok: false, reason: "not-configured" };
  const payload = {
    kind: "message",
    name: String(m.name || "").trim(),
    contact: String(m.contact || "").trim(),
    message: normaliseMessage(m.message),
    website: typeof m.website === "string" ? m.website : "",
    ts: m.ts,
  };
  if (m.consent === true) payload.consent = true;
  try {
    const href = location.href.length <= 500 ? location.href : location.origin + location.pathname;
    payload.page = href.slice(0, 500);
    const q = new URLSearchParams(location.search);
    for (const k of TRACKING) {
      const v = (q.get(k) || "").trim();
      if (v) payload[k] = v.slice(0, 200);
    }
  } catch {
    /* not in a browser: no page, no tracking */
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let res;
  try {
    res = await fetch(`${API_BASE}/lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
      credentials: "omit",
      signal: ctrl.signal,
    });
  } catch {
    return { ok: false, reason: "network" };
  } finally {
    clearTimeout(timer);
  }

  if (res.ok) return { ok: true };
  if (res.status === 429) return { ok: false, reason: "rate-limited" };
  if (res.status === 413) return { ok: false, reason: "too-long" };
  if (res.status === 400) {
    let error = "";
    try {
      error = String((await res.json()).error || "");
    } catch {
      /* no detail */
    }
    const f = /^(?:missing|invalid) field: (\w+)$/.exec(error);
    if (f) return { ok: false, reason: "invalid", field: f[1] === "whatsapp" ? "contact" : f[1] };
  }
  return { ok: false, reason: "server" };
}
