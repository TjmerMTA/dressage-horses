// A tiny in-memory stand-in for the GitHub Contents API, used only by test.sh.
// Usage: node test/mock-github.mjs <port> <expected-token>
import http from "node:http";
import crypto from "node:crypto";

const [port, token] = [Number(process.argv[2]), process.argv[3]];
const PREFIX = "/repos/TjmerMTA/dressage-horses/contents/";
const files = new Map();
const blobSha = (b) => crypto.createHash("sha1").update(`blob ${b.length}\0`).update(b).digest("hex");

files.set("src/content/texts/home.json", Buffer.from('{"title":"Dressage horses from Belgium"}\n'));
files.set("src/content/horses/duke.md", Buffer.from("---\nname: Duke\n---\nA lovely horse.\n"));
files.set("src/assets/horses/duke-1.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]));
files.set("public/CNAME", Buffer.from("dev.siteboosty.com\n"));

const send = (res, status, obj) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
};
const fileJson = (path, b) => ({
  type: "file", name: path.split("/").pop(), path, sha: blobSha(b), size: b.length, encoding: "base64",
  content: b.toString("base64").replace(/(.{60})/g, "$1\n"),
});

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/__raw") { // test hook: raw bytes of a stored file
    const b = files.get(url.searchParams.get("path"));
    if (!b) return send(res, 404, { message: "Not Found" });
    res.writeHead(200, { "Content-Type": "application/octet-stream" });
    return res.end(b);
  }
  if (req.headers.authorization !== `Bearer ${token}`) return send(res, 401, { message: "Bad credentials" });
  if (!req.headers["user-agent"]) return send(res, 403, { message: "User-Agent required" });
  if (!url.pathname.startsWith(PREFIX)) return send(res, 404, { message: "Not Found" });
  const path = url.pathname.slice(PREFIX.length).split("/").map(decodeURIComponent).join("/");

  if (req.method === "GET") {
    if (url.searchParams.get("ref") !== "main") return send(res, 404, { message: "No commit found for the ref" });
    if (files.has(path)) return send(res, 200, fileJson(path, files.get(path)));
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
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return send(res, 400, { message: "Problems parsing JSON" }); }
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
        commit: { sha: crypto.randomBytes(20).toString("hex"), message: body.message },
      });
    });
    return;
  }
  send(res, 405, { message: "Method not allowed" });
}).listen(port, "127.0.0.1");
