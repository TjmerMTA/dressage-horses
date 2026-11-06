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

/**
 * The Meta (Facebook) Pixel id: digits only (spaces from a paste are dropped), or null.
 * Only the shape we can be sure of is checked — digits, a sane length — and Meta judges
 * the rest. null means: no pixel, no cookie banner, nothing from Meta on the site.
 */
export function metaPixelId(value) {
  const s = String(value == null ? "" : value).replace(/\s+/g, "");
  return /^\d{6,20}$/.test(s) ? s : null;
}

/** "https://www.instagram.com/koni__horses/" → "@koni__horses" (the link text on /thanks/). */
export function socialHandle(href) {
  try {
    const first = new URL(href).pathname.split("/").filter(Boolean)[0] || "";
    return first ? `@${first.replace(/^@/, "")}` : href;
  } catch {
    return String(href || "");
  }
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

/**
 * A quiz answer's emoji (home.json → quiz.steps[].options[].icon): empty, or exactly one
 * emoji — one grapheme, so a flag or a skin-tone emoji counts as one. Never two in a row,
 * never words. Used by the build (src/content.config.ts) and by the admin's text editor.
 */
export function isOneEmojiOrNone(s) {
  if (typeof s !== "string") return false;
  if (s === "") return true;
  const parts = [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(s)];
  return parts.length === 1 && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(s);
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
      add("whatsapp", "WhatsApp number", "Meanwhile the footer shows no WhatsApp icon and the quiz’s “sending failed” message does not point to WhatsApp; visitors can only send the quiz.", "site.json", "links.whatsapp");
    }
    if (!socialHref("instagram", site.links && site.links.instagram)) add("instagram", "Instagram link", "Meanwhile the footer shows no Instagram icon, and the thank-you page has no “Follow us on Instagram” line.", "site.json", "links.instagram");
    if (!socialHref("tiktok", site.links && site.links.tiktok)) add("tiktok", "TikTok link", "Meanwhile the footer shows no TikTok icon.", "site.json", "links.tiktok");
    if (!metaPixelId(site.tracking && site.tracking.metaPixelId)) add("metaPixel", "Meta Pixel ID", "Meanwhile nothing from Meta loads, there is no cookie banner, and Meta receives no PageView or Lead events from the site.", "site.json", "tracking.metaPixelId");
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
