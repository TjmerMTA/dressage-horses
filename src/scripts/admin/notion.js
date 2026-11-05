// Notion, on the Leads screen: a quiet mark on each lead and one button for the leads that
// have not reached Notion. None of it is shown while the Worker has no Notion settings: the
// leads list then carries no `notion` flag.
import { api } from "./api.js";
import { h } from "./ui.js";

const IN_FLIGHT_MS = 60_000; // the Worker's own window for "may still be on its way"

/** A card exists ("partial": it does, but not in the right column or without the comment). */
export const reachedNotion = (l) => l.notion === "sent" || l.notion === "partial";

/** "401 unauthorized" (what the Worker stored) → a sentence for the owner. */
function reason(code) {
  const c = String(code || "");
  if (/^401/.test(c)) return "Notion refused the key. The developer needs to check NOTION_TOKEN.";
  if (/^(db )?404/.test(c)) return "Notion can’t see the database. In Notion, open it → ••• → Connections → add the integration.";
  if (/^403/.test(c)) return "The integration isn’t allowed to add cards to this database.";
  if (/^429/.test(c)) return "Notion was busy. Try again in a minute.";
  if (/^400/.test(c)) return "Notion refused this lead’s data.";
  if (/NOTION_DB/.test(c)) return "The database id in the Worker’s settings is wrong.";
  return "Notion didn’t answer. Try again in a minute.";
}

export function notionMark(l) {
  if (l.notion === "sent") return h("span", { class: "adm-sub" }, "In Notion");
  if (l.notion === "partial") {
    return h("span", { class: "adm-sub", title: `Notion: ${l.notionError || "a property was not found"}. The card is there, with every answer in its page text${/(^|; )phase:/.test(l.notionError || "") ? ", but not in the right column: move it by hand" : ""}. Fix the property's name in Notion or in the Worker's settings, and the next leads are complete.` }, "In Notion, incomplete");
  }
  if (!l.notion && Date.now() - Date.parse(l.createdAt) < IN_FLIGHT_MS) return h("span", { class: "adm-sub" }, "Sending to Notion…");
  const why = l.notion === "failed" ? reason(l.notionError) : "This lead arrived before Notion was connected.";
  return h("span", { class: "adm-sub", title: why }, "Not in Notion yet");
}

/** Sends every lead in the range that has not reached Notion, ten per request. */
export async function sendMissing(from, to) {
  const range = { ...(from ? { from } : {}), ...(to ? { to } : {}) };
  let sent = 0;
  let partial = 0;
  let failed = 0;
  let stopped = "";
  for (let i = 0; i < 100; i++) {
    const r = await api("/admin/notion/resend", { method: "POST", json: range });
    sent += r.sent;
    partial += r.partial || 0;
    failed += r.failed;
    if (r.stopped) {
      stopped = r.stopped;
      break;
    }
    if (!r.remaining || r.sent === 0) break; // done, or only leads Notion keeps refusing are left
  }
  if (stopped) return { message: `${sent ? `${sent} sent. ` : ""}Stopped: ${reason(stopped)}`, ok: false };
  if (!sent && !failed) return { message: "Nothing to send: the other leads are still on their way to Notion.", ok: true };
  return {
    message: `${sent} lead${sent === 1 ? "" : "s"} sent to Notion.${partial ? ` ${partial} of them incomplete (hover “In Notion, incomplete”).` : ""}${failed ? ` ${failed} refused by Notion (hover “Not in Notion yet” to see why).` : ""}`,
    ok: !failed && !partial,
  };
}
