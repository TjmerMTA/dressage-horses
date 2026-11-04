// Admin content read/write and image upload.

import { Env, HttpError, json, mediaType, parseJsonObject, readBody, readJson } from "./http";
import {
  IMAGE_DIR, base64ToBytes, bytesToBase64, commitMessage, deleteContent, getContent, getDeployStatus, getRaw,
  listDir, putContent, validatePath, validateWritablePath,
} from "./github";

const PUT_BODY_LIMIT = 1024 * 1024;
const MAX_TEXT_BYTES = 512 * 1024;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const SHA_RE = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function handleGetContent(request: Request, env: Env): Promise<Response> {
  const path = validatePath(new URL(request.url).searchParams.get("path"), { allowDir: true });
  return json({ ok: true, ...(await getContent(env, path)) });
}

export async function handlePutContent(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request, PUT_BODY_LIMIT);
  const path = validateWritablePath(body["path"]);
  const content = body["content"];
  if (typeof content !== "string") throw new HttpError(400, "invalid field: content");
  const bytes = new TextEncoder().encode(content);
  if (bytes.byteLength > MAX_TEXT_BYTES) throw new HttpError(413, "content too large");
  if (path.toLowerCase().endsWith(".json")) {
    try {
      JSON.parse(content);
    } catch {
      throw new HttpError(400, "content is not valid JSON");
    }
  }
  const sha = body["sha"];
  if (sha !== undefined && sha !== null && (typeof sha !== "string" || !SHA_RE.test(sha))) {
    throw new HttpError(400, "invalid field: sha");
  }
  const message = commitMessage(body["message"], `admin: update ${path}`);
  const result = await putContent(env, path, bytesToBase64(bytes), message, typeof sha === "string" ? sha : undefined);
  return json({ ok: true, ...result });
}

/** Detects the image type from magic bytes; the declared content type is ignored. */
export function sniffImage(b: Uint8Array): "jpg" | "png" | "webp" | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return "png";
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // RIFF
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 // WEBP
  ) return "webp";
  return null;
}

async function readUpload(request: Request): Promise<{ slug: unknown; bytes: Uint8Array }> {
  const type = mediaType(request);
  if (type === "multipart/form-data") {
    const raw = await readBody(request, MAX_IMAGE_BYTES + 64 * 1024);
    let form: FormData;
    try {
      form = await new Response(raw, { headers: { "Content-Type": request.headers.get("Content-Type")! } }).formData();
    } catch {
      throw new HttpError(400, "invalid multipart body");
    }
    const file = form.get("file");
    if (file === null || typeof file === "string") throw new HttpError(400, "missing field: file");
    return { slug: form.get("slug"), bytes: new Uint8Array(await file.arrayBuffer()) };
  }
  if (type === "application/json") {
    const raw = await readBody(request, Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 64 * 1024);
    const body = parseJsonObject(raw);
    let data = body["data"];
    if (typeof data !== "string") throw new HttpError(400, "missing field: data");
    const comma = data.startsWith("data:") ? data.indexOf(",") : -1;
    if (comma !== -1) data = data.slice(comma + 1); // tolerate a data: URL prefix
    const bytes = base64ToBytes(data as string);
    if (!bytes) throw new HttpError(400, "invalid field: data");
    return { slug: body["slug"], bytes };
  }
  throw new HttpError(415, "use multipart/form-data or application/json");
}

export async function handleUpload(request: Request, env: Env): Promise<Response> {
  const { slug, bytes } = await readUpload(request);
  if (typeof slug !== "string" || slug.length > 60 || !SLUG_RE.test(slug)) throw new HttpError(400, "invalid field: slug");
  if (bytes.byteLength === 0) throw new HttpError(400, "empty file");
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new HttpError(413, "image larger than 8 MB");
  const ext = sniffImage(bytes);
  if (!ext) throw new HttpError(415, "only JPEG, PNG or WebP images are accepted");

  const nameRe = new RegExp(`^${slug}-(\\d{1,6})\\.(?:jpe?g|png|webp)$`, "i");
  let n = 0;
  for (const name of await listDir(env, IMAGE_DIR)) {
    const m = nameRe.exec(name);
    if (m) n = Math.max(n, parseInt(m[1]!, 10));
  }
  const b64 = bytesToBase64(bytes);
  // Two uploads racing for the same number: GitHub refuses the second, so try the next one.
  for (let attempt = 0; attempt < 3; attempt++) {
    const path = `${IMAGE_DIR}/${slug}-${n + 1 + attempt}.${ext}`;
    try {
      const result = await putContent(env, path, b64, `admin: upload ${path}`);
      return json({ ok: true, path: result.path, sha: result.sha });
    } catch (e) {
      if (!(e instanceof HttpError && e.status === 409)) throw e;
    }
  }
  throw new HttpError(409, "could not pick a free file name, retry");
}

export async function handleDeleteContent(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request, 4 * 1024);
  const path = validateWritablePath(body["path"]);
  const sha = body["sha"];
  if (typeof sha !== "string" || !SHA_RE.test(sha)) throw new HttpError(400, "invalid field: sha");
  const message = commitMessage(body["message"], `admin: delete ${path}`);
  return json({ ok: true, path, ...(await deleteContent(env, path, sha, message)) });
}

const RAW_LIMIT = 12 * 1024 * 1024;
const MIME = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;

/** Image bytes from the photo folder, so the admin can show photos before the site is rebuilt. */
export async function handleRaw(request: Request, env: Env): Promise<Response> {
  const path = validatePath(new URL(request.url).searchParams.get("path"), { allowDir: false });
  if (!path.startsWith(`${IMAGE_DIR}/`) || !/\.(jpe?g|png|webp)$/i.test(path)) throw new HttpError(403, "path not allowed");
  const bytes = await getRaw(env, path, RAW_LIMIT);
  const kind = sniffImage(bytes);
  if (!kind) throw new HttpError(415, "not an image");
  return new Response(bytes, {
    headers: {
      "Content-Type": MIME[kind],
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}

export async function handleDeployStatus(request: Request, env: Env): Promise<Response> {
  const sha = new URL(request.url).searchParams.get("sha") || "";
  if (!SHA_RE.test(sha)) throw new HttpError(400, "invalid sha");
  return json({ ok: true, ...(await getDeployStatus(env, sha)) });
}
