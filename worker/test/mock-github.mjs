// A tiny in-memory stand-in for the parts of the GitHub API the Worker uses.
// Only for test.sh and for driving the admin panel locally. Never talks to GitHub.
//
//   node test/mock-github.mjs <port> <expected-token> [--seed <dir>]
//
// --seed <dir>     load every file under <dir> (paths relative to it) instead of the built-in fixtures
// MOCK_RUN_SECONDS how long a simulated Actions run takes (default 2); a commit message
//                  containing "[fail]" makes its run fail
//
// Besides /repos/…/contents/… and /repos/…/actions/runs it serves two test-only routes:
//   GET /__raw?path=…       the stored bytes of a file
//   GET /site/version.json  what the "live site" is built from (commit of the newest finished run)
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import nodePath from "node:path";

const port = Number(process.argv[2]);
const token = process.argv[3];
const seedAt = process.argv.indexOf("--seed");
const RUN_MS = Number(process.env.MOCK_RUN_SECONDS || 2) * 1000;
const REPO = "/repos/TjmerMTA/dressage-horses";
const files = new Map();
const runs = []; // newest last
const blobSha = (b) => crypto.createHash("sha1").update(`blob ${b.length}\0`).update(b).digest("hex");

if (seedAt !== -1) {
  const root = process.argv[seedAt + 1];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = nodePath.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name !== ".DS_Store") files.set(nodePath.relative(root, full).split(nodePath.sep).join("/"), fs.readFileSync(full));
    }
  };
  walk(root);
} else {
  files.set("src/content/texts/home.json", Buffer.from('{"title":"Dressage horses from Belgium"}\n'));
  files.set("src/content/horses/duke.md", Buffer.from("---\nname: Duke\n---\nA lovely horse.\n"));
  files.set("src/assets/horses/duke-1.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]));
  files.set("public/CNAME", Buffer.from("dev.siteboosty.com\n"));
}

const send = (res, status, obj, extra = {}) => {
  res.writeHead(status, { "Content-Type": "application/json", ...extra });
  res.end(JSON.stringify(obj));
};
const fileJson = (path, b) => ({
  type: "file", name: path.split("/").pop(), path, sha: blobSha(b), size: b.length,
  // like GitHub: no inline content for files over 1 MB
  ...(b.length > 1024 * 1024 ? { encoding: "none", content: "" } : { encoding: "base64", content: b.toString("base64").replace(/(.{60})/g, "$1\n") }),
});
const newCommit = (message) => {
  const sha = crypto.randomBytes(20).toString("hex");
  runs.push({ id: runs.length + 1, head_sha: sha, created: Date.now(), fail: /\[fail\]/.test(message) });
  return sha;
};
const runJson = (r) => {
  const age = Date.now() - r.created;
  const status = age < RUN_MS * 0.25 ? "queued" : age < RUN_MS ? "in_progress" : "completed";
  return {
    id: r.id, name: "Deploy to GitHub Pages", head_branch: "main", head_sha: r.head_sha, status,
    conclusion: status === "completed" ? (r.fail ? "failure" : "success") : null,
    created_at: new Date(r.created).toISOString(),
    html_url: `https://github.com/TjmerMTA/dressage-horses/actions/runs/${r.id}`,
  };
};
const readJsonBody = (req, cb) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    try { cb(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { cb(null); }
  });
};

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");

  if (url.pathname === "/__raw") {
    const b = files.get(url.searchParams.get("path"));
    if (!b) return send(res, 404, { message: "Not Found" });
    res.writeHead(200, { "Content-Type": "application/octet-stream" });
    return res.end(b);
  }
  if (url.pathname === "/site/version.json") {
    const live = runs.map(runJson).filter((r) => r.conclusion === "success").pop();
    return send(res, 200, { commit: live ? live.head_sha : null, builtAt: live ? live.created_at : null },
      { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
  }

  if (req.headers.authorization !== `Bearer ${token}`) return send(res, 401, { message: "Bad credentials" });
  if (!req.headers["user-agent"]) return send(res, 403, { message: "User-Agent required" });

  if (url.pathname === `${REPO}/actions/runs` && req.method === "GET") {
    let list = runs.slice().reverse().map(runJson);
    const sha = url.searchParams.get("head_sha");
    if (sha) list = list.filter((r) => r.head_sha === sha);
    list = list.slice(0, Number(url.searchParams.get("per_page") || 30));
    return send(res, 200, { total_count: list.length, workflow_runs: list });
  }

  const PREFIX = `${REPO}/contents/`;
  if (!url.pathname.startsWith(PREFIX)) return send(res, 404, { message: "Not Found" });
  const path = url.pathname.slice(PREFIX.length).split("/").map(decodeURIComponent).join("/");

  if (req.method === "GET") {
    if (url.searchParams.get("ref") !== "main") return send(res, 404, { message: "No commit found for the ref" });
    if (files.has(path)) {
      if (/vnd\.github\.raw/.test(req.headers.accept || "")) {
        res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": files.get(path).length });
        return res.end(files.get(path));
      }
      return send(res, 200, fileJson(path, files.get(path)));
    }
    const kids = new Map();
    for (const [p, b] of files) {
      if (!p.startsWith(path + "/")) continue;
      const rest = p.slice(path.length + 1);
      const name = rest.split("/")[0];
      const isDir = rest.includes("/");
      kids.set(name, { type: isDir ? "dir" : "file", name, path: `${path}/${name}`, sha: isDir ? "0".repeat(40) : blobSha(b), size: isDir ? 0 : b.length });
    }
    if (kids.size === 0) return send(res, 404, { message: "Not Found" });
    return send(res, 200, [...kids.values()]);
  }

  if (req.method === "PUT") {
    return readJsonBody(req, (body) => {
      if (!body) return send(res, 400, { message: "Problems parsing JSON" });
      if (body.branch !== "main" || typeof body.message !== "string" || typeof body.content !== "string") {
        return send(res, 422, { message: "Invalid request" });
      }
      const cur = files.get(path);
      if (cur && !body.sha) return send(res, 422, { message: "\"sha\" wasn't supplied." });
      if (cur && body.sha !== blobSha(cur)) return send(res, 409, { message: "does not match" });
      if (!cur && body.sha) return send(res, 422, { message: "sha for missing file" });
      const b = Buffer.from(body.content, "base64");
      files.set(path, b);
      return send(res, cur ? 200 : 201, {
        content: { name: path.split("/").pop(), path, sha: blobSha(b) },
        commit: { sha: newCommit(body.message), message: body.message },
      });
    });
  }

  if (req.method === "DELETE") {
    return readJsonBody(req, (body) => {
      if (!body || body.branch !== "main" || typeof body.message !== "string") return send(res, 422, { message: "Invalid request" });
      const cur = files.get(path);
      if (!cur) return send(res, 404, { message: "Not Found" });
      if (body.sha !== blobSha(cur)) return send(res, 409, { message: "does not match" });
      files.delete(path);
      return send(res, 200, { content: null, commit: { sha: newCommit(body.message), message: body.message } });
    });
  }
  send(res, 405, { message: "Method not allowed" });
}).listen(port, "127.0.0.1");
