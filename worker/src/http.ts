// Small HTTP helpers: JSON responses, errors, CORS and size-capped body reading.

export interface Env {
  KV: KVNamespace;
  ALLOWED_ORIGINS: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
  /** Only for local tests (points at a mock). Unset in production → api.github.com. */
  GITHUB_API_BASE?: string;
  ADMIN_PASSWORD_HASH?: string;
  GITHUB_TOKEN?: string;
  /** Plain var: the Notion database id (or its page address). Empty → Notion is off. */
  NOTION_DB?: string;
  /** Secret: the Notion internal integration token. Empty → Notion is off. */
  NOTION_TOKEN?: string;
  /** Plain vars: the property his board is grouped by ("phase"), the option a new card gets ("Лід"),
   *  and the text property that receives every answer ("comment on phase"). Empty → those defaults. */
  NOTION_PHASE_PROP?: string;
  NOTION_PHASE_VALUE?: string;
  NOTION_COMMENT_PROP?: string;
  /** Only for local tests (points at a mock). Unset in production → api.notion.com. */
  NOTION_API_BASE?: string;
}

/** An error whose message is safe to show to the caller. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly publicMessage: string,
    public readonly headers: Record<string, string> = {},
  ) {
    super(publicMessage);
  }
}

const SECURITY_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
};

export function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS, ...extra },
  });
}

export function errorResponse(status: number, message: string, extra: Record<string, string> = {}): Response {
  return json({ error: message }, status, extra);
}

export function textResponse(body: string, contentType: string, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": contentType, ...SECURITY_HEADERS, ...extra },
  });
}

export function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function isAllowedOrigin(origin: string, env: Env): boolean {
  return allowedOrigins(env).includes(origin);
}

/** Adds CORS headers for an allowed origin (or nothing for non-browser callers). */
export function withCors(resp: Response, origin: string | null): Response {
  const out = new Response(resp.body, resp);
  out.headers.set("Vary", "Origin");
  if (origin) {
    out.headers.set("Access-Control-Allow-Origin", origin);
    out.headers.set("Access-Control-Expose-Headers", "Retry-After, Content-Disposition");
  }
  return out;
}

export function preflight(origin: string): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...SECURITY_HEADERS,
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    },
  });
}

/** Reads the request body, aborting as soon as it exceeds `limit` bytes. */
export async function readBody(request: Request | Response, limit: number): Promise<Uint8Array> {
  const declared = request.headers.get("Content-Length");
  if (declared !== null) {
    const n = Number(declared);
    if (!Number.isFinite(n) || n < 0) throw new HttpError(400, "bad content-length");
    if (n > limit) throw new HttpError(413, "body too large");
  }
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      throw new HttpError(413, "body too large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

export function mediaType(request: Request): string {
  return (request.headers.get("Content-Type") || "").split(";")[0]!.trim().toLowerCase();
}

/** Reads a JSON object body of at most `limit` bytes. */
export async function readJson(request: Request, limit: number): Promise<Record<string, unknown>> {
  if (mediaType(request) !== "application/json") throw new HttpError(415, "content-type must be application/json");
  const bytes = await readBody(request, limit);
  return parseJsonObject(bytes);
}

export function parseJsonObject(bytes: Uint8Array): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
  } catch {
    throw new HttpError(400, "invalid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new HttpError(400, "body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}
