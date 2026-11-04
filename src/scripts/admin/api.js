// The only way the panel talks to the Worker. The session token lives in
// sessionStorage, travels only in the Authorization header and is never logged.
import { API_BASE } from "../api-base.js";

const TOKEN_KEY = "dh-admin-session";
let onUnauthorized = () => {};

export const session = {
  get() {
    try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set(token) {
    try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* private mode: lives only in memory */ memoryToken = token; }
  },
  clear() {
    memoryToken = null;
    try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* nothing stored */ }
  },
};
let memoryToken = null;
const currentToken = () => session.get() || memoryToken;

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export class ApiError extends Error {
  constructor(status, message, serverMessage = "") {
    super(message);
    this.status = status;
    this.serverMessage = serverMessage;
  }
}

/** Turns a status and the Worker's short error into a sentence for a non-programmer. */
export const NO_GITHUB_KEY = "The panel cannot reach the repository — the server is missing its GitHub key. Horses, texts and photos can’t be loaded or saved until the developer sets it. Leads are not affected.";
const REPO_PATHS = /^\/admin\/(content|raw|upload|deploy-status)/;

function humanMessage(status, server, retryAfter, path = "") {
  const s = server.toLowerCase();
  // Newer Worker: "repository not configured" (503). Older one: "server not configured" (500).
  if (s.includes("repository not configured") || (s.includes("server not configured") && REPO_PATHS.test(path))) return NO_GITHUB_KEY;
  if (s.includes("server not configured")) return "The server is missing one of its settings (the admin password). Ask the developer to set it.";
  if (status === 0) return "Can't reach the server. Check the internet connection and try again.";
  if (status === 401) return "Your session has ended. Please log in again.";
  if (status === 429) {
    const min = Math.max(1, Math.ceil(Number(retryAfter || 600) / 60));
    return `Too many attempts. Please wait about ${min} minute${min === 1 ? "" : "s"} and try again.`;
  }
  if (status === 409) return "This was changed somewhere else in the meantime (another tab or device). Reload it and make your change again.";
  if (status === 413) return s.includes("8 mb") ? "This photo is larger than 8 MB." : "This is too large to save.";
  if (status === 415) return s.includes("jpeg") ? "Only JPEG, PNG or WebP photos can be uploaded." : "This type of file can't be used here.";
  if (status === 404) return "Not found. It may have been deleted in the meantime.";
  if (status === 403) return "This can't be changed from the panel.";
  if (status === 400) return `The server refused this (${server || "invalid data"}).`;
  if (status === 503) return "GitHub is busy right now. Nothing was saved. Try again in a minute.";
  if (status === 502) return "GitHub didn't answer properly. Nothing was saved. Try again in a minute.";
  return "The server had a problem. Nothing was saved. Try again in a minute.";
}

/**
 * api("/admin/leads", { query: { from } }) → parsed JSON
 * options: method, query, json (body), body (FormData…), raw (return the Response), auth (default true)
 */
export async function api(path, { method = "GET", query, json, body, raw = false, auth = true } = {}) {
  const headers = new Headers();
  if (auth) {
    const token = currentToken();
    if (!token) {
      onUnauthorized();
      throw new ApiError(401, humanMessage(401, ""));
    }
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(json);
  }
  const qs = query ? `?${new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ""))}` : "";
  let res;
  try {
    res = await fetch(`${API_BASE}${path}${qs === "?" ? "" : qs}`, {
      method, headers, body, cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer",
    });
  } catch {
    throw new ApiError(0, humanMessage(0, ""));
  }
  if (res.status === 401 && auth) {
    session.clear();
    onUnauthorized();
    throw new ApiError(401, humanMessage(401, ""));
  }
  if (!res.ok) {
    let server = "";
    try { server = String((await res.json()).error || ""); } catch { /* not JSON */ }
    throw new ApiError(res.status, humanMessage(res.status, server, res.headers.get("Retry-After"), path), server);
  }
  return raw ? res : res.json();
}

export async function login(password) {
  let res;
  try {
    res = await fetch(`${API_BASE}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
      cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer",
    });
  } catch {
    throw new ApiError(0, humanMessage(0, ""));
  }
  if (res.status === 401) throw new ApiError(401, "That password is not right.");
  if (!res.ok) {
    let server = "";
    try { server = String((await res.clone().json()).error || ""); } catch { /* not JSON */ }
    throw new ApiError(res.status, humanMessage(res.status, server, res.headers.get("Retry-After"), "/admin/login"), server);
  }
  const data = await res.json();
  session.set(data.token);
}

export async function logout() {
  try { await api("/admin/logout", { method: "POST" }); } catch { /* the session is dropped locally anyway */ }
  session.clear();
}

export const isLoggedIn = () => Boolean(currentToken());

// ---- repository helpers -------------------------------------------------------------

export const readFile = (path) => api("/admin/content", { query: { path } });
export const writeFile = (path, content, sha, message) =>
  api("/admin/content", { method: "PUT", json: { path, content, ...(sha ? { sha } : {}), message } });
export const deleteFile = (path, sha, message) => api("/admin/content", { method: "DELETE", json: { path, sha, message } });

/** Lists a folder; a folder that doesn't exist yet is empty. */
export async function listDir(path) {
  try {
    const r = await api("/admin/content", { query: { path } });
    return r.type === "dir" ? r.entries : [];
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return [];
    throw e;
  }
}

const imageCache = new Map(); // repo path → Promise<object URL>
/** An object URL for a photo in the repository (fetched with the session, cached for this visit). */
export function photoUrl(repoPath) {
  if (!imageCache.has(repoPath)) {
    const p = api("/admin/raw", { query: { path: repoPath }, raw: true })
      .then((r) => r.blob())
      .then((b) => URL.createObjectURL(b));
    p.catch(() => imageCache.delete(repoPath));
    imageCache.set(repoPath, p);
  }
  return imageCache.get(repoPath);
}

export function forgetCachedPhotos() {
  for (const p of imageCache.values()) p.then((u) => URL.revokeObjectURL(u)).catch(() => {});
  imageCache.clear();
}

export async function uploadPhoto(slug, blob, filename) {
  const form = new FormData();
  form.append("slug", slug);
  form.append("file", blob, filename);
  return api("/admin/upload", { method: "POST", body: form });
}

export async function downloadLeadsCsv(from, to) {
  const res = await api("/admin/leads.csv", { query: { from, to }, raw: true });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
