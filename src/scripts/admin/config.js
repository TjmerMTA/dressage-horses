// What the panel knows about the site's content. Paths and the horse schema must match
// src/content.config.ts.

export const REPO_URL = "https://github.com/TjmerMTA/dressage-horses";
export const HORSES_DIR = "src/content/horses";
export const PHOTOS_DIR = "src/assets/horses";
/** How a horse file refers to its photos (relative to src/content/horses/). */
export const PHOTO_PREFIX = "../../assets/horses/";
export const TEXTS_DIR = "src/content/texts";
export const PAGES_DIR = "src/content/pages";
export const VERSION_URL = (import.meta.env && import.meta.env.PUBLIC_SITE_VERSION_URL) || "/version.json";

export const SEX = [["mare", "Mare"], ["gelding", "Gelding"], ["stallion", "Stallion"]];
export const COUNTRY = [["BE", "Belgium"], ["DE", "Germany"], ["NL", "The Netherlands"]];
export const LEVEL = [
  ["young horse", "Young horse"], ["L", "L"], ["M", "M"], ["S", "S"],
  ["Prix St-Georges", "Prix St-Georges"], ["Grand Prix", "Grand Prix"],
];
export const XRAYS = [["clean", "Clean"], ["minor findings", "Minor findings"], ["not done", "Not done"]];
export const COLOURS = ["bay", "dark bay", "chestnut", "grey", "black", "liver chestnut", "palomino"];
export const BREEDS = ["KWPN", "Hanoverian", "Oldenburg", "Westphalian", "Trakehner", "Holsteiner", "BWP", "Zangersheide", "PRE", "Lusitano"];

/** Front-matter keys of a horse, in the order they are written. */
export const HORSE_KEYS = [
  "name", "slug", "price", "priceOnRequest", "currency", "year", "height", "sex", "colour", "breed",
  "country", "level", "sire", "dam", "damsire", "xrays", "video", "photos", "sold", "featured", "published",
];

/** Friendly names for text files; unknown files get a name made from the file name. */
export const TEXT_FILE_LABELS = {
  "site.json": "Company, contacts & menus",
  "home.json": "Home page",
  "services.json": "Services page",
  "about.json": "About page",
  "contact.json": "Contact page",
  "privacy.md": "Privacy policy",
  "imprint.md": "Imprint",
};
export const TEXT_FILE_ORDER = ["site.json", "home.json", "services.json", "about.json", "contact.json", "privacy.md", "imprint.md"];

/** Keys in the text files that are technical and not shown (dotted paths, [] = any index). */
export const HIDDEN_TEXT_KEYS = new Set([
  "site.json:endpoint", "site.json:logo", "site.json:nav[].href", "site.json:footer.links[].href",
  "home.json:quiz.steps[].key", "contact.json:channels[].link",
]);

/** Friendly labels for keys (by key name, anywhere). */
export const KEY_LABELS = {
  hero: "Top of the page",
  how: "How it works",
  options: "Answers",
  errors: "Error messages",
  recap: "Summary labels on the thank-you screen",
  header: "Page heading",
  includes: "What is included",
  figures: "Figures",
  story: "Our story",
  why: "Why us",
  channels: "Ways to contact",
  brand: "Company name",
  meta: "Search engines (title and description)",
  eyebrow: "Small heading above the title",
  lead: "Introduction",
  ctaNote: "Note next to the button",
  cta: "Button text",
  ticks: "Bullet points",
  photoAlt: "Photo description (for blind visitors and Google)",
  photoPosition: "Photo focus point (advanced, e.g. “50% 40%”)",
  photo: "Photo",
  logoAlt: "Logo description",
  skipLink: "“Skip to content” link text",
  menuLabel: "Menu button text",
  stickyCta: "Floating button text (phones)",
  whatsapp: "WhatsApp",
  instagram: "Instagram link",
  tiktok: "TikTok link",
  links: "Social links",
  nav: "Top menu",
  footer: "Footer",
  stepLabel: "Progress text (“{step}” and “{total}” are filled in)",
  thanksNamed: "Thank-you heading (“{name}” is filled in)",
};
