// Photos before upload: check what the file really is, turn it upright, shrink it to at
// most 2400 px and re-encode it as JPEG. Re-encoding also drops EXIF (including GPS).
import { PHOTO_PREFIX, PHOTOS_DIR, HORSES_DIR } from "./config.js";

const MAX_SIDE = 2400;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_INPUT_BYTES = 60 * 1024 * 1024;

export async function sniff(file) {
  const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "webp";
  if (String.fromCharCode(...b.slice(4, 8)) === "ftyp") return "heic";
  return null;
}

async function decode(file) {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { /* fall back to <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * @returns {Promise<{ok:true, blob:Blob, width:number, height:number} | {ok:false, message:string}>}
 */
export async function preparePhoto(file) {
  const name = file.name || "photo";
  if (file.size > MAX_INPUT_BYTES) return { ok: false, message: `“${name}” is larger than 60 MB. Please use a smaller copy.` };
  const kind = await sniff(file);
  if (kind === "heic") {
    return { ok: false, message: `“${name}” is an iPhone HEIC photo. On the iPhone, share it as JPEG ("Most Compatible"), or export it as JPEG first.` };
  }
  if (!kind) return { ok: false, message: `“${name}” is not a JPEG, PNG or WebP photo.` };
  let bmp;
  try {
    bmp = await decode(file);
  } catch {
    return { ok: false, message: `“${name}” could not be opened. It may be damaged.` };
  }
  const w0 = bmp.width;
  const h0 = bmp.height;
  if (w0 < 400 || h0 < 400) return { ok: false, message: `“${name}” is too small (${w0}×${h0}). Use a photo at least 800 px wide.` };
  const scale = Math.min(1, MAX_SIDE / Math.max(w0, h0));
  const w = Math.round(w0 * scale);
  const h = Math.round(h0 * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; // transparent PNG areas become white, not black
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, w, h);
  if (typeof bmp.close === "function") bmp.close();
  for (const q of [0.86, 0.78, 0.7]) {
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", q));
    if (blob && blob.size <= MAX_BYTES) return { ok: true, blob, width: w, height: h };
  }
  return { ok: false, message: `“${name}” is still larger than 8 MB after shrinking.` };
}

/** "../../assets/horses/x.jpg" (as written in a horse file) → "src/assets/horses/x.jpg". */
export function refToRepoPath(ref) {
  const s = String(ref || "");
  const at = s.indexOf("assets/horses/");
  if (at !== -1 && !s.startsWith(".")) return `${PHOTOS_DIR}/${s.slice(at + "assets/horses/".length)}`;
  const parts = HORSES_DIR.split("/");
  for (const seg of s.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== "." && seg !== "") parts.push(seg);
  }
  return parts.join("/");
}

/** "src/assets/horses/x.jpg" → the reference a horse file uses. */
export const repoPathToRef = (path) => PHOTO_PREFIX + String(path).split("/").pop();
