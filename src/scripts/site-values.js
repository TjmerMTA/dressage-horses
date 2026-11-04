// Which of the company's own facts are really set. One module, no dependencies, used by
// the public pages at build time (so nothing unset is ever rendered) and by the admin's
// "Before you go live" list (so the two can never disagree).
//
// Unset means: empty, or still a template marker such as YOUR_HANDLE / YOUR_NUMBER.

const MARKER = /YOUR_|REPLACE|TO BE CONFIRMED|TBC\b|example\.(com|org)|xxx/i;

/** True when a free-text value is filled in with something real. */
export function isSet(value) {
  return typeof value === "string" && value.trim() !== "" && !MARKER.test(value);
}

/** "https://wa.me/32470123456" → that link; anything without a real number → null. */
export function whatsappHref(link) {
  const m = /^https:\/\/(?:wa\.me|api\.whatsapp\.com\/send\?phone=)\/?\+?(\d{7,15})\/?$/.exec(String(link || "").trim());
  return m ? `https://wa.me/${m[1]}` : null;
}

const SOCIAL_HOSTS = { instagram: /(^|\.)instagram\.com$/, tiktok: /(^|\.)tiktok\.com$/ };

/** A profile link that points at a real profile on that network, or null. */
export function socialHref(kind, link) {
  const s = String(link || "").trim();
  if (!isSet(s)) return null;
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  const host = SOCIAL_HOSTS[kind];
  if (u.protocol !== "https:" || (host && !host.test(u.hostname))) return null;
  if (u.pathname.replace(/\/+/g, "/") === "/" || u.pathname === "") return null; // no handle
  return u.href;
}

/** The name to show for the business: the company name, else the site's own title. */
export function displayName(site) {
  return isSet(site && site.brand) ? site.brand.trim() : String((site && site.siteTitle) || "Dressage horses");
}

/** Imprint facts, in the order they are shown. Keys are front-matter keys of imprint.md. */
export const IMPRINT_FIELDS = [
  ["companyName", "Registered company name"],
  ["legalForm", "Legal form"],
  ["address", "Registered office"],
  ["enterpriseNumber", "Enterprise number (KBO/BCE)"],
  ["vatNumber", "VAT number"],
  ["email", "E-mail"],
];

/**
 * Everything a visitor would miss, for the admin's checklist.
 * @returns {{id:string, label:string, effect:string, file:string, field:string}[]}
 */
export function unsetValues({ site, imprint, privacy }) {
  const out = [];
  const add = (id, label, effect, file, field) => out.push({ id, label, effect, file, field });
  if (site) {
    if (!isSet(site.brand)) add("brand", "Company name", `The footer shows “${displayName(site)}” instead.`, "site.json", "brand");
    if (!whatsappHref(site.links && site.links.whatsapp)) {
      add("whatsapp", "WhatsApp number", "Every WhatsApp button is hidden; visitors use the quiz instead.", "site.json", "links.whatsapp");
    }
    if (!socialHref("instagram", site.links && site.links.instagram)) add("instagram", "Instagram link", "The Instagram icon and card are hidden.", "site.json", "links.instagram");
    if (!socialHref("tiktok", site.links && site.links.tiktok)) add("tiktok", "TikTok link", "The TikTok icon and card are hidden.", "site.json", "links.tiktok");
  }
  if (imprint) {
    for (const [key, label] of IMPRINT_FIELDS) {
      if (!isSet(imprint[key])) add(`imprint-${key}`, `Imprint: ${label}`, "The imprint says this detail will follow.", "imprint.md", key);
    }
  }
  if (privacy && privacy.reviewed !== true) {
    add("privacy", "Privacy policy reviewed by the company", "The text is a careful template; the company should read and approve it.", "privacy.md", "reviewed");
  }
  return out;
}
