// Dressage horses API — Cloudflare Worker entry point and router.

import { handleGetContent, handlePutContent, handleUpload } from "./content";
import { Env, HttpError, errorResponse, isAllowedOrigin, json, preflight, readJson, withCors } from "./http";
import { handleLead, handleLeads, handleLeadsCsv } from "./leads";
import { SESSION_TTL_SEC, checkPassword, createSession, deleteSession, rateLimit, requireSession } from "./security";

type Handler = (request: Request, env: Env) => Promise<Response>;

/** Wraps a handler so it only runs with a valid admin session. */
const admin = (h: Handler): Handler => async (request, env) => {
  await requireSession(request, env);
  return h(request, env);
};

async function login(request: Request, env: Env): Promise<Response> {
  await rateLimit(env, "login", request, 5, 15 * 60);
  const body = await readJson(request, 1024);
  const password = body["password"];
  if (typeof password !== "string" || password.length === 0 || password.length > 256) {
    throw new HttpError(400, "invalid field: password");
  }
  if (!(await checkPassword(env, password))) throw new HttpError(401, "wrong password");
  return json({ ok: true, token: await createSession(env), expiresIn: SESSION_TTL_SEC });
}

async function logout(request: Request, env: Env): Promise<Response> {
  await deleteSession(env, await requireSession(request, env));
  return json({ ok: true });
}

const ROUTES: Record<string, Partial<Record<string, Handler>>> = {
  "/health": { GET: async () => json({ ok: true }) },
  "/lead": { POST: handleLead },
  "/admin/login": { POST: login },
  "/admin/logout": { POST: logout },
  "/admin/leads": { GET: admin(handleLeads) },
  "/admin/leads.csv": { GET: admin(handleLeadsCsv) },
  "/admin/content": { GET: admin(handleGetContent), PUT: admin(handlePutContent) },
  "/admin/upload": { POST: admin(handleUpload) },
};

async function route(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  const methods = ROUTES[pathname];
  if (!methods) return errorResponse(404, "not found");
  const handler = methods[request.method];
  if (!handler) return errorResponse(405, "method not allowed", { Allow: Object.keys(methods).join(", ") });
  return handler(request, env);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    // Browsers always send Origin cross-site; anything not on the list is refused outright.
    // Callers without Origin (curl, servers) are not browsers and get no CORS headers.
    if (origin !== null && !isAllowedOrigin(origin, env)) {
      return withCors(errorResponse(403, "origin not allowed"), null);
    }
    if (request.method === "OPTIONS") {
      return origin ? preflight(origin) : errorResponse(400, "bad preflight");
    }
    let resp: Response;
    try {
      resp = await route(request, env);
    } catch (e) {
      if (e instanceof HttpError) {
        resp = errorResponse(e.status, e.publicMessage, e.headers);
      } else {
        // Log only the error class and route: never bodies, headers, tokens or messages.
        console.error("unhandled", new URL(request.url).pathname, e instanceof Error ? e.name : typeof e);
        resp = errorResponse(500, "internal error");
      }
    }
    return withCors(resp, origin);
  },
} satisfies ExportedHandler<Env>;
