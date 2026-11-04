// Sends the quiz answers to the Worker's POST /lead. No dependencies, one export.
//
//   import { sendLead } from "../scripts/lead-form.js";
//
//   const result = await sendLead({
//     region, budget, format,          // the three quiz answers (strings)
//     name,                            // "Your name"
//     whatsapp,                        // or `contact`: phone with country code, or an e-mail
//     consent: true,                   // the consent checkbox
//     website: honeypotInput.value,    // a hidden <input name="website"> real people never fill
//   });
//   if (result.ok) showThanks();
//   else showError(result.message);    // a sentence you can show to the visitor as is
//
// It never throws. `result` is { ok: true } or
//   { ok: false, reason, message, field? }
//   reason: "invalid" (field says which one) | "rate-limited" | "network" | "server" | "not-configured"
//
// The timestamp the Worker uses to spot bots (`ts`) is the moment this module was loaded,
// i.e. when the page with the quiz opened. Pass `ts` yourself if the quiz opens later.
// page URL and utm_* / fbclid / gclid are taken from the current address automatically.
import { API_BASE, API_CONFIGURED } from "./api-base.js";

const LOADED_AT = Date.now();
const TRACKING = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"];
const FIELD_MESSAGES = {
  name: "Please enter your name.",
  contact: "Please enter a valid WhatsApp number with country code, for example +971 50 123 4567.",
  region: "Please choose where you are from.",
  budget: "Please choose your budget.",
  format: "Please choose how you want to buy.",
  consent: "Please confirm that we may contact you.",
};
const GENERIC = "Something went wrong. Please try again, or write to us on WhatsApp.";

const str = (v) => (typeof v === "string" ? v.trim() : "");

/**
 * @param {{region?:string,budget?:string,format?:string,name?:string,contact?:string,whatsapp?:string,
 *          consent?:boolean,website?:string,ts?:number}} answers
 * @param {{endpoint?:string, timeoutMs?:number}} [options]
 * @returns {Promise<{ok:true}|{ok:false,reason:string,message:string,field?:string}>}
 */
export async function sendLead(answers, options = {}) {
  const a = answers || {};
  const endpoint = options.endpoint || `${API_BASE}/lead`;
  if (!options.endpoint && !API_CONFIGURED) {
    console.warn("lead-form: the API address is not set (src/scripts/api-base.js)");
    return { ok: false, reason: "not-configured", message: GENERIC };
  }

  const payload = {
    name: str(a.name),
    region: str(a.region),
    budget: str(a.budget),
    format: str(a.format),
    contact: str(a.contact) || str(a.whatsapp),
    website: typeof a.website === "string" ? a.website : "",
    ts: Number.isInteger(a.ts) ? a.ts : LOADED_AT,
  };
  if (a.consent === true) payload.consent = true;
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

  const ctrl = typeof AbortController === "function" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), options.timeoutMs || 15000) : null;
  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
      credentials: "omit",
      signal: ctrl ? ctrl.signal : undefined,
    });
  } catch {
    return { ok: false, reason: "network", message: "We couldn't reach our server. Please check your connection and try again." };
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (res.ok) return { ok: true };
  if (res.status === 429) {
    return { ok: false, reason: "rate-limited", message: "You have sent several requests in a short time. Please wait a few minutes, or write to us on WhatsApp." };
  }
  if (res.status === 400) {
    let error = "";
    try {
      error = String((await res.json()).error || "");
    } catch {
      /* keep the generic message */
    }
    const m = /^(?:missing|invalid) field: (\w+)$/.exec(error);
    const field = m ? (m[1] === "whatsapp" ? "contact" : m[1]) : undefined;
    return { ok: false, reason: "invalid", field, message: (field && FIELD_MESSAGES[field]) || GENERIC };
  }
  return { ok: false, reason: "server", message: GENERIC };
}
