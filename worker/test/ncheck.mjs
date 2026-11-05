// Assertions on what the mock Notion received. Only for test.sh.
//
//   node test/ncheck.mjs <mock-url> <card title or ""> '<JavaScript expression>'
//
// The expression sees:
//   all     every request          pages  every POST /v1/pages      reads  every GET /v1/databases/…
//   cs      the page calls whose title is <card title>              c      the last of them
//   p       c's properties         lines  the text lines of c's body ("Region: Europe", …)
// Exit 0 when the expression is exactly true; otherwise its value is printed.
const [url, title, expr] = process.argv.slice(2);
const all = await (await fetch(`${url}/__calls`)).json();
const pages = all.filter((x) => x.method === "POST" && x.path === "/v1/pages");
const reads = all.filter((x) => x.method === "GET" && x.path.startsWith("/v1/databases/"));
const titleOf = (x) => Object.values(x.body?.properties || {}).find((v) => v && v.title)?.title?.[0]?.text?.content;
const cs = pages.filter((x) => titleOf(x) === title);
const c = cs[cs.length - 1];
const p = c?.body?.properties || {};
const lines = (c?.body?.children || []).map((b) => (b[b.type]?.rich_text || []).map((t) => t.text.content).join(""));
let v;
try {
  v = new Function("all", "pages", "reads", "cs", "c", "p", "lines", `return (${expr});`)(all, pages, reads, cs, c, p, lines);
} catch (e) {
  v = `threw ${e}`;
}
if (v !== true) {
  console.error("got:", JSON.stringify(v), "| props:", JSON.stringify(Object.keys(p)), "| lines:", JSON.stringify(lines));
  process.exit(1);
}
