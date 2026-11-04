// Repository access through the GitHub Contents API, with a strict path allow-list.

import { Env, HttpError } from "./http";

const ALLOWED_PREFIX = /^(src\/content\/|src\/assets\/horses\/|public\/)/;
// A path segment: no leading dot (blocks ".", "..", hidden files), conservative charset.
const SEGMENT_RE = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$/;
const DENIED = new Set(["public/cname"]); // the custom-domain file must never change from the admin
const TEXT_EXT_RE = /\.(md|mdx|json|txt|ya?ml|csv)$/i;
export const IMAGE_DIR = "src/assets/horses";

/** Validates a repository path. Directories (for listing) may end with one slash. */
export function validatePath(raw: unknown, opts: { allowDir: boolean }): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 200) throw new HttpError(400, "invalid path");
  let p = raw;
  if (opts.allowDir && p.endsWith("/")) p = p.slice(0, -1);
  const segments = p.split("/");
  if (!segments.every((s) => SEGMENT_RE.test(s))) throw new HttpError(400, "invalid path");
  if (!ALLOWED_PREFIX.test(p + (opts.allowDir ? "/" : ""))) throw new HttpError(403, "path not allowed");
  if (DENIED.has(p.toLowerCase())) throw new HttpError(403, "path not allowed");
  return p;
}

/** Paths the admin may overwrite with text through PUT /admin/content. */
export function validateWritablePath(raw: unknown): string {
  const p = validatePath(raw, { allowDir: false });
  if (p.startsWith(`${IMAGE_DIR}/`)) throw new HttpError(403, "use /admin/upload for images");
  if (!TEXT_EXT_RE.test(p)) throw new HttpError(403, "file type not allowed");
  return p;
}

function config(env: Env): { base: string; repo: string; branch: string; token: string } {
  const token = env.GITHUB_TOKEN || "";
  const repo = env.GITHUB_REPO || "";
  const branch = env.GITHUB_BRANCH || "";
  if (!token || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !/^[A-Za-z0-9._/-]+$/.test(branch)) {
    throw new HttpError(500, "server not configured");
  }
  const base = (env.GITHUB_API_BASE || "https://api.github.com").replace(/\/+$/, "");
  return { base, repo, branch, token };
}

async function gh(env: Env, method: "GET" | "PUT", path: string, body?: unknown): Promise<Response> {
  const c = config(env);
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const url = `${c.base}/repos/${c.repo}/contents/${encoded}${method === "GET" ? `?ref=${encodeURIComponent(c.branch)}` : ""}`;
  try {
    return await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${c.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "dressage-horses-api",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new HttpError(502, "repository unavailable");
  }
}

function upstreamError(status: number): HttpError {
  if (status === 404) return new HttpError(404, "not found");
  if (status === 409 || status === 422) return new HttpError(409, "conflict: the file changed or already exists, reload and retry");
  if (status === 401 || status === 403) return new HttpError(502, "repository access denied");
  if (status === 429) return new HttpError(503, "repository rate limit, try again later");
  return new HttpError(502, "repository error");
}

export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000 * 3; // a multiple of 3, so chunk encodings concatenate cleanly
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    let bin = "";
    for (let j = 0; j < slice.length; j += 0x8000) {
      bin += String.fromCharCode(...slice.subarray(j, j + 0x8000));
    }
    parts.push(btoa(bin));
  }
  return parts.join("");
}

export function base64ToBytes(b64: string): Uint8Array | null {
  const clean = b64.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 !== 0) return null;
  let bin: string;
  try {
    bin = atob(clean);
  } catch {
    return null;
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

interface GhItem {
  type: string;
  name: string;
  path: string;
  sha: string;
  size: number;
  content?: string;
  encoding?: string;
}

export type ContentResult =
  | { type: "file"; path: string; sha: string; size: number; encoding: "utf-8" | "base64"; content: string }
  | { type: "dir"; path: string; entries: { name: string; path: string; type: string; sha: string; size: number }[] };

export async function getContent(env: Env, path: string): Promise<ContentResult> {
  const r = await gh(env, "GET", path);
  if (!r.ok) throw upstreamError(r.status);
  const data = (await r.json()) as GhItem | GhItem[];
  if (Array.isArray(data)) {
    return {
      type: "dir",
      path,
      entries: data.map((e) => ({ name: e.name, path: e.path, type: e.type, sha: e.sha, size: e.size })),
    };
  }
  if (data.type !== "file") throw new HttpError(415, "not a regular file");
  if (data.encoding !== "base64" || typeof data.content !== "string") {
    throw new HttpError(413, "file too large to open here");
  }
  const bytes = base64ToBytes(data.content);
  if (!bytes) throw new HttpError(502, "repository error");
  try {
    const content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
    return { type: "file", path: data.path, sha: data.sha, size: data.size, encoding: "utf-8", content };
  } catch {
    return { type: "file", path: data.path, sha: data.sha, size: data.size, encoding: "base64", content: bytesToBase64(bytes) };
  }
}

/** Lists a directory; a missing directory is an empty list. */
export async function listDir(env: Env, path: string): Promise<string[]> {
  const r = await gh(env, "GET", path);
  if (r.status === 404) return [];
  if (!r.ok) throw upstreamError(r.status);
  const data = (await r.json()) as GhItem | GhItem[];
  return Array.isArray(data) ? data.map((e) => e.name) : [];
}

export async function putContent(
  env: Env,
  path: string,
  base64: string,
  message: string,
  sha?: string,
): Promise<{ path: string; sha: string; commit: string }> {
  const c = config(env);
  const r = await gh(env, "PUT", path, { message, content: base64, branch: c.branch, ...(sha ? { sha } : {}) });
  if (r.status !== 200 && r.status !== 201) {
    if (r.status === 404 && sha) throw new HttpError(409, "conflict: the file changed or already exists, reload and retry");
    if (r.status === 404) throw new HttpError(502, "repository error");
    throw upstreamError(r.status);
  }
  const data = (await r.json()) as { content?: { path?: string; sha?: string }; commit?: { sha?: string } };
  return { path: data.content?.path ?? path, sha: data.content?.sha ?? "", commit: data.commit?.sha ?? "" };
}

/** A safe one-line commit message. */
export function commitMessage(raw: unknown, fallback: string): string {
  if (raw === undefined || raw === null || raw === "") return fallback;
  if (typeof raw !== "string") throw new HttpError(400, "invalid field: message");
  const s = raw.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").trim();
  if (s.length === 0) return fallback;
  if (s.length > 200) throw new HttpError(400, "invalid field: message");
  return s;
}
