#!/usr/bin/env bash
# End-to-end test of every endpoint against a local `npx wrangler dev`.
#
# It starts its own wrangler dev (fresh, throw-away KV state), a mock GitHub
# Contents API and a mock Notion API, with a random one-off admin password and dummy
# GitHub and Notion tokens that
# exist only for the length of the run. Nothing real is touched; nothing is written
# into the repository. Exit code is the number of failed checks (0 = all passed).
#
#   ./test.sh            # PORT=8787 GH_PORT=8788 by default
set -uo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-8787}"
GH_PORT="${GH_PORT:-8788}"
BASE="http://127.0.0.1:$PORT"
GH="http://127.0.0.1:$GH_PORT"
NOTION_PORT=$((PORT + 3))   # mock Notion
NW_PORT=$((PORT + 5))       # the Worker with Notion switched on
NOTION="http://127.0.0.1:$NOTION_PORT"
ORIGIN="https://dev.siteboosty.com"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/dh-api-test.XXXXXX")"
PIDS=()
cleanup() {
  for p in "${PIDS[@]:-}"; do [[ -n "$p" ]] && kill "$p" 2>/dev/null; done
  wait 2>/dev/null
  pkill -f "wrangler dev --port $PORT " 2>/dev/null
  pkill -f "wrangler dev --port $((PORT + 7)) " 2>/dev/null
  pkill -f "wrangler dev --port $NW_PORT " 2>/dev/null
  [[ -n "${KEEP_TMP:-}" ]] && echo "kept $TMP" || rm -rf "$TMP"
}
trap cleanup EXIT

# ---- one-off credentials, never stored anywhere but $TMP --------------------------
PW="$(openssl rand -hex 16)"
PW_HASH="$(printf %s "$PW" | shasum -a 256 | cut -d' ' -f1)"
GH_TOKEN_DUMMY="test-$(openssl rand -hex 8)"
NOTION_TOKEN_DUMMY="ntn_test$(openssl rand -hex 12)"
NOTION_DB_ID="$(openssl rand -hex 16)"
# The main Worker has a Notion database id but no Notion token: Notion is off, no call may be made.
cat > "$TMP/test.env" <<EOF
ADMIN_PASSWORD_HASH=$PW_HASH
GITHUB_TOKEN=$GH_TOKEN_DUMMY
GITHUB_API_BASE=$GH
NOTION_DB=$NOTION_DB_ID
NOTION_API_BASE=$NOTION
EOF

node test/mock-github.mjs "$GH_PORT" "$GH_TOKEN_DUMMY" & PIDS+=($!)
node test/mock-notion.mjs "$NOTION_PORT" "$NOTION_TOKEN_DUMMY" "$NOTION_DB_ID" & PIDS+=($!)
npx wrangler dev --port "$PORT" --ip 127.0.0.1 --persist-to "$TMP/state" --env-file "$TMP/test.env" \
  --show-interactive-dev-session=false > "$TMP/wrangler.log" 2>&1 & PIDS+=($!)

for _ in $(seq 1 60); do curl -s -m 1 "$BASE/health" >/dev/null 2>&1 && break; sleep 0.5; done
if ! curl -s -m 2 "$BASE/health" >/dev/null; then echo "wrangler dev did not start:"; tail -30 "$TMP/wrangler.log"; exit 99; fi

# ---- tiny assertion kit ------------------------------------------------------------
PASS=0; FAIL=0
mask() { sed -E 's/[0-9a-f]{64}/<token>/g; s/[0-9a-f]{40}/<sha>/g' | tr -d '\r\357\273\277' | tr '\n' ' ' | cut -c1-110; }
report() { # report OK|FAIL name status detail
  if [[ "$1" == OK ]]; then PASS=$((PASS+1)); printf 'PASS  [%s] %s  %s\n' "$3" "$2" "$4"
  else FAIL=$((FAIL+1)); printf 'FAIL  [%s] %s  %s\n' "$3" "$2" "$4"; fi
}
# check "name" expected_status "expected substring or empty" curl-args...
check() {
  local name="$1" want="$2" needle="$3"; shift 3
  STATUS="$(curl -s -o "$TMP/body" -D "$TMP/headers" -w '%{http_code}' --max-time 60 "$@")"
  local shown; shown="$(head -c 400 "$TMP/body" | LC_ALL=C tr -c '[:print:]\n' '?' | mask)"
  if [[ "$STATUS" != "$want" ]]; then report FAIL "$name" "$STATUS" "expected $want — $shown"
  elif [[ -n "$needle" ]] && ! grep -qF -- "$needle" "$TMP/body"; then report FAIL "$name" "$STATUS" "missing '$needle' — $shown"
  else report OK "$name" "$STATUS" "$shown"; fi
}
# assert "name" <command...>  (passes when the command succeeds)
assert() { local name="$1"; shift; if "$@" >/dev/null 2>&1; then report OK "$name" "--" ""; else report FAIL "$name" "--" "assertion failed"; fi; }
has_header() { grep -qiF -- "$1" "$TMP/headers"; }
jget() { node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=process.argv[2].split(".").reduce((o,k)=>o==null?o:o[k],j);console.log(typeof v==="object"?JSON.stringify(v):v)' "$TMP/body" "$1"; }
ip() { echo "CF-Connecting-IP: 198.51.100.$1"; }
JSON='Content-Type: application/json'
NOW_MS=$(( $(date +%s) * 1000 ))
TS=$(( NOW_MS - 90000 ))   # form opened 90 seconds ago
TODAY="$(date -u +%Y-%m-%d)"
YESTERDAY="$(node -e 'console.log(new Date(Date.now()-864e5).toISOString().slice(0,10))')"
# Requests the mock Notion has received (for the "Notion is off" checks).
notion_count() { curl -s "$NOTION/__calls" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).length))'; }

# fixtures
node -e '
const fs=require("fs"),d=process.argv[1];
fs.writeFileSync(d+"/a.png",Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==","base64"));
fs.writeFileSync(d+"/a.jpg",Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0]),Buffer.alloc(2000,7)]));
fs.writeFileSync(d+"/a.webp",Buffer.concat([Buffer.from("RIFF"),Buffer.from([0,0,0,0]),Buffer.from("WEBPVP8 "),Buffer.alloc(100,1)]));
fs.writeFileSync(d+"/a.gif",Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00;"));
fs.writeFileSync(d+"/fake.png","<?php system($_GET[1]); ?> definitely a png");
fs.writeFileSync(d+"/big.jpg",Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0]),Buffer.alloc(8*1024*1024-3,1)]));
fs.writeFileSync(d+"/jpg.json",JSON.stringify({slug:"duke",data:"data:image/jpeg;base64,"+fs.readFileSync(d+"/a.jpg").toString("base64")}));
fs.writeFileSync(d+"/lead-big.json",JSON.stringify({name:"x".repeat(5000)}));
fs.writeFileSync(d+"/put-big.json",JSON.stringify({path:"src/content/texts/big.txt",content:"y".repeat(1100000)}));
' "$TMP"

echo "== health, routing, CORS"
check "GET /health"                        200 '{"ok":true}' "$BASE/health"
check "GET unknown route"                  404 '"error"'     "$BASE/wp-login.php"
check "DELETE /health → method"            405 '"error"'     -X DELETE "$BASE/health"
check "preflight from the site"            204 ''            -X OPTIONS -H "Origin: $ORIGIN" -H 'Access-Control-Request-Method: POST' "$BASE/lead"
assert "preflight allows the site origin"  has_header "access-control-allow-origin: $ORIGIN"
assert "preflight allows DELETE"           has_header "access-control-allow-methods: GET, POST, PUT, DELETE"
check "preflight from another site"        403 'origin not allowed' -X OPTIONS -H 'Origin: https://evil.example' "$BASE/lead"
check "POST /lead from another site"       403 'origin not allowed' -H 'Origin: https://evil.example' -H "$JSON" -d '{}' "$BASE/lead"
check "GET /health from the site"          200 '' -H "Origin: $ORIGIN" "$BASE/health"
assert "CORS header on a normal response"  has_header "access-control-allow-origin: $ORIGIN"

echo "== POST /lead"
check "valid lead (contact)"               200 '' -H "Origin: $ORIGIN" -H "$(ip 10)" -H "$JSON" \
  -d "{\"name\":\"Anna First\",\"region\":\"Europe\",\"budget\":\"€60,000 – 100,000\",\"format\":\"Online purchase\",\"contact\":\"+32 470 12 34 56\",\"website\":\"\",\"ts\":$TS}" "$BASE/lead"
assert "lead reply is exactly {ok:true}"   test "$(cat "$TMP/body")" = '{"ok":true}'
sleep 1
check "valid lead (mock-up payload)"       200 '' -H "Origin: $ORIGIN" -H "$(ip 11)" -H "$JSON" \
  -d "{\"region\":\"GCC (Gulf countries)\",\"budget\":\"€100,000+\",\"format\":\"I will come to try the horse in person\",\"name\":\"Omar Second\",\"whatsapp\":\"+971 50 123 4567\",\"consent\":true,\"page\":\"https://dev.siteboosty.com/?utm_source=ig\",\"sent_at\":\"2026-11-04T10:00:00.000Z\",\"utm_source\":\"ig\",\"ts\":$TS}" "$BASE/lead"
sleep 1
check "formula-looking name is accepted"   200 '' -H "$(ip 16)" -H "$JSON" \
  -d "{\"name\":\"=HYPERLINK(1)\",\"region\":\"Asia\",\"budget\":\"€30,000 – 60,000\",\"format\":\"Online purchase\",\"contact\":\"buyer@example.com\",\"ts\":$TS}" "$BASE/lead"
check "honeypot filled → silent ok"        200 '{"ok":true}' -H "$(ip 12)" -H "$JSON" \
  -d "{\"name\":\"Bot\",\"region\":\"Asia\",\"budget\":\"x\",\"format\":\"y\",\"contact\":\"+1 555 123 4567\",\"website\":\"http://spam\",\"ts\":$TS}" "$BASE/lead"
check "filled in 0 s → silent ok"          200 '{"ok":true}' -H "$(ip 12)" -H "$JSON" \
  -d "{\"name\":\"Fast Bot\",\"region\":\"Asia\",\"budget\":\"x\",\"format\":\"y\",\"contact\":\"+1 555 123 4567\",\"ts\":$(( $(date +%s) * 1000 ))}" "$BASE/lead"
check "missing timestamp"                  400 'missing field: ts' -H "$(ip 13)" -H "$JSON" \
  -d '{"name":"No Ts","region":"Asia","budget":"x","format":"y","contact":"+1 555 123 4567"}' "$BASE/lead"
check "bad contact"                        400 'invalid field: contact' -H "$(ip 13)" -H "$JSON" \
  -d "{\"name\":\"Bad Contact\",\"region\":\"Asia\",\"budget\":\"x\",\"format\":\"y\",\"contact\":\"call me\",\"ts\":$TS}" "$BASE/lead"
check "unknown field"                      400 'unknown field' -H "$(ip 13)" -H "$JSON" \
  -d "{\"name\":\"Extra\",\"region\":\"Asia\",\"budget\":\"x\",\"format\":\"y\",\"contact\":\"+1 555 123 4567\",\"admin\":true,\"ts\":$TS}" "$BASE/lead"
check "missing name"                       400 'missing field: name' -H "$(ip 14)" -H "$JSON" \
  -d "{\"region\":\"Asia\",\"budget\":\"x\",\"format\":\"y\",\"contact\":\"+1 555 123 4567\",\"ts\":$TS}" "$BASE/lead"
check "wrong content type"                 415 'application/json' -H "$(ip 14)" -H 'Content-Type: text/plain' -d '{}' "$BASE/lead"
check "broken JSON"                        400 'invalid JSON' -H "$(ip 14)" -H "$JSON" -d '{"name":' "$BASE/lead"
check "JSON array body"                    400 'JSON object' -H "$(ip 15)" -H "$JSON" -d '[1,2]' "$BASE/lead"
check "oversized body (5 KB)"              413 'too large' -H "$(ip 15)" -H "$JSON" --data-binary "@$TMP/lead-big.json" "$BASE/lead"
for i in 1 2 3 4 5; do curl -s -o /dev/null -H "$(ip 20)" -H "$JSON" -d '{}' "$BASE/lead"; done
check "6th lead in 10 min from one IP"     429 'too many' -H "$(ip 20)" -H "$JSON" \
  -d "{\"name\":\"Real Person\",\"region\":\"Asia\",\"budget\":\"x\",\"format\":\"y\",\"contact\":\"+1 555 123 4567\",\"ts\":$TS}" "$BASE/lead"
assert "429 carries Retry-After"           has_header "retry-after:"

echo "== POST /admin/login"
check "wrong password"                     401 'wrong password' -H "$(ip 30)" -H "$JSON" -d '{"password":"guess"}' "$BASE/admin/login"
check "no password field"                  400 'password' -H "$(ip 30)" -H "$JSON" -d '{}' "$BASE/admin/login"
check "form-encoded login"                 415 'application/json' -H "$(ip 30)" -d "password=$PW" "$BASE/admin/login"
check "right password"                     200 '"token"' -H "Origin: $ORIGIN" -H "$(ip 31)" -H "$JSON" -d "{\"password\":\"$PW\"}" "$BASE/admin/login"
TOKEN="$(jget token)"
assert "token is 32 random bytes (hex)"    bash -c "[[ '$TOKEN' =~ ^[0-9a-f]{64}$ ]]"
for i in 1 2 3 4 5; do curl -s -o /dev/null -H "$(ip 32)" -H "$JSON" -d '{"password":"guess"}' "$BASE/admin/login"; done
check "6th attempt in 15 min (even right)" 429 'too many' -H "$(ip 32)" -H "$JSON" -d "{\"password\":\"$PW\"}" "$BASE/admin/login"
AUTH="Authorization: Bearer $TOKEN"

echo "== sessions and GET /admin/leads"
check "leads without session"              401 'session required' "$BASE/admin/leads"
check "leads with made-up token"           401 'session' -H "Authorization: Bearer $(openssl rand -hex 32)" "$BASE/admin/leads"
check "leads with malformed header"        401 'session required' -H 'Authorization: Basic YWRtaW46YWRtaW4=' "$BASE/admin/leads"
check "leads with session"                 200 '"count":3' -H "Origin: $ORIGIN" -H "$AUTH" "$BASE/admin/leads"
assert "newest lead first"                 test "$(jget leads.0.name)" = "=HYPERLINK(1)"
assert "oldest lead last"                  test "$(jget leads.2.name)" = "Anna First"
assert "whatsapp stored as contact"        test "$(jget leads.1.contact)" = "+971 50 123 4567"
assert "bots were not stored"              bash -c "! grep -q 'Bot' '$TMP/body'"
check "leads from=today"                   200 '"count":3' -H "$AUTH" "$BASE/admin/leads?from=$TODAY&to=$TODAY"
check "leads to=yesterday"                 200 '"count":0' -H "$AUTH" "$BASE/admin/leads?to=$YESTERDAY"
check "leads bad date"                     400 'YYYY-MM-DD' -H "$AUTH" "$BASE/admin/leads?from=2026-13-01"
check "leads from after to"                400 'after' -H "$AUTH" "$BASE/admin/leads?from=$TODAY&to=$YESTERDAY"

echo "== Notion is off: a database id but no token"
check "leads list as before"               200 '"count":3' -H "$AUTH" "$BASE/admin/leads"
assert "list says nothing about Notion"    bash -c "! grep -q 'notion' '$TMP/body'"
assert "no call to Notion was made"        test "$(notion_count)" = 0
check "resend says Notion is off"          503 'notion not configured' -H "$AUTH" -H "$JSON" -d '{}' "$BASE/admin/notion/resend"
check "resend without session"             401 'session' -H "$JSON" -d '{}' "$BASE/admin/notion/resend"

echo "== GET /admin/leads.csv"
check "csv without session"                401 'session' "$BASE/admin/leads.csv"
check "csv with session"                   200 'created_at,name,contact' -H "$AUTH" "$BASE/admin/leads.csv"
assert "csv content type"                  has_header 'content-type: text/csv'
assert "csv is a download"                 has_header 'content-disposition: attachment; filename="leads-'
assert "csv neutralises formulas"          grep -qF "\"'=HYPERLINK(1)\"" "$TMP/body"
assert "csv keeps phone numbers as typed"  grep -qF '"+32 470 12 34 56"' "$TMP/body"

echo "== GET /admin/content"
check "content without session"           401 'session' "$BASE/admin/content?path=src/content/texts/home.json"
check "read a text file"                   200 '"sha"' -H "$AUTH" "$BASE/admin/content?path=src/content/texts/home.json"
HOME_SHA="$(jget sha)"
assert "content decoded as UTF-8"          test "$(jget content)" = '{"title":"Dressage horses from Belgium"}'
check "list a directory"                   200 '"type":"dir"' -H "$AUTH" "$BASE/admin/content?path=src/content/horses/"
check "missing file"                       404 'not found' -H "$AUTH" "$BASE/admin/content?path=src/content/nope.md"
check "read ../ traversal"                 400 'invalid path' -H "$AUTH" "$BASE/admin/content?path=src/content/../../.github/workflows/deploy.yml"
check "read encoded traversal"             400 'invalid path' -H "$AUTH" "$BASE/admin/content?path=src%2Fcontent%2F%2E%2E%2Fsecret"
check "read outside allow-list"            403 'not allowed' -H "$AUTH" "$BASE/admin/content?path=astro.config.mjs"
check "read hidden file"                   400 'invalid path' -H "$AUTH" "$BASE/admin/content?path=src/content/.env"
check "read without path"                  400 'invalid path' -H "$AUTH" "$BASE/admin/content"

echo "== PUT /admin/content"
check "write without session"              401 'session' -X PUT -H "$JSON" -d '{}' "$BASE/admin/content"
check "update with current sha"            200 '"commit"' -X PUT -H "$AUTH" -H "$JSON" \
  -d "{\"path\":\"src/content/texts/home.json\",\"content\":\"{\\\"title\\\":\\\"Dressage horses — new\\\"}\\n\",\"sha\":\"$HOME_SHA\",\"message\":\"Change title\"}" "$BASE/admin/content"
check "read back the change"               200 'new' -H "$AUTH" "$BASE/admin/content?path=src/content/texts/home.json"
check "update with stale sha"              409 'conflict' -X PUT -H "$AUTH" -H "$JSON" \
  -d "{\"path\":\"src/content/texts/home.json\",\"content\":\"{}\",\"sha\":\"$HOME_SHA\"}" "$BASE/admin/content"
check "create a new file (no sha)"         200 '"path":"src/content/horses/bella.md"' -X PUT -H "$AUTH" -H "$JSON" \
  -d '{"path":"src/content/horses/bella.md","content":"---\nname: Bella\n---\n"}' "$BASE/admin/content"
check "write the deploy workflow"          400 'invalid path' -X PUT -H "$AUTH" -H "$JSON" \
  -d '{"path":".github/workflows/deploy.yml","content":"x"}' "$BASE/admin/content"
check "write outside allow-list"           403 'not allowed' -X PUT -H "$AUTH" -H "$JSON" \
  -d '{"path":"package.json","content":"{}"}' "$BASE/admin/content"
check "write with ../"                     400 'invalid path' -X PUT -H "$AUTH" -H "$JSON" \
  -d '{"path":"src/content/../../package.json","content":"{}"}' "$BASE/admin/content"
check "write with leading slash"           400 'invalid path' -X PUT -H "$AUTH" -H "$JSON" \
  -d '{"path":"/src/content/x.md","content":"x"}' "$BASE/admin/content"
check "write public/CNAME"                 403 'not allowed' -X PUT -H "$AUTH" -H "$JSON" \
  -d '{"path":"public/CNAME","content":"evil.example"}' "$BASE/admin/content"
check "write a script file"                403 'file type' -X PUT -H "$AUTH" -H "$JSON" \
  -d '{"path":"public/x.js","content":"alert(1)"}' "$BASE/admin/content"
check "write text into image folder"       403 'upload' -X PUT -H "$AUTH" -H "$JSON" \
  -d '{"path":"src/assets/horses/x.md","content":"x"}' "$BASE/admin/content"
check "write broken JSON to .json"         400 'not valid JSON' -X PUT -H "$AUTH" -H "$JSON" \
  -d '{"path":"src/content/texts/home.json","content":"{oops"}' "$BASE/admin/content"
check "write body over 1 MB"               413 'too large' -X PUT -H "$AUTH" -H "$JSON" --data-binary "@$TMP/put-big.json" "$BASE/admin/content"

echo "== POST /admin/upload"
check "upload without session"             401 'session' -F slug=duke -F "file=@$TMP/a.png;type=image/png" "$BASE/admin/upload"
check "upload PNG (multipart)"             200 '"path":"src/assets/horses/duke-2.png"' -H "$AUTH" -F slug=duke -F "file=@$TMP/a.png;type=image/png" "$BASE/admin/upload"
curl -s -o "$TMP/stored.png" "$GH/__raw?path=src/assets/horses/duke-2.png"
assert "committed bytes equal the upload"  cmp -s "$TMP/a.png" "$TMP/stored.png"
check "upload JPEG (base64 JSON)"          200 '"path":"src/assets/horses/duke-3.jpg"' -H "$AUTH" -H "$JSON" --data-binary "@$TMP/jpg.json" "$BASE/admin/upload"
check "upload WebP, new slug"              200 '"path":"src/assets/horses/bella-1.webp"' -H "$AUTH" -F slug=bella -F "file=@$TMP/a.webp;type=image/webp" "$BASE/admin/upload"
check "text file claiming image/png"       415 'JPEG, PNG or WebP' -H "$AUTH" -F slug=duke -F "file=@$TMP/fake.png;type=image/png" "$BASE/admin/upload"
check "GIF is refused"                     415 'JPEG, PNG or WebP' -H "$AUTH" -F slug=duke -F "file=@$TMP/a.gif;type=image/gif" "$BASE/admin/upload"
check "image over 8 MB"                    413 '' -H "$AUTH" -F slug=duke -F "file=@$TMP/big.jpg;type=image/jpeg" "$BASE/admin/upload"
check "slug with ../"                      400 'slug' -H "$AUTH" -F 'slug=../../x' -F "file=@$TMP/a.png;type=image/png" "$BASE/admin/upload"
check "no file part"                       400 'file' -H "$AUTH" -F slug=duke "$BASE/admin/upload"
check "raw body upload"                    415 'multipart' -H "$AUTH" -H 'Content-Type: image/png' --data-binary "@$TMP/a.png" "$BASE/admin/upload"

echo "== DELETE /admin/content"
check "delete without session"             401 'session' -X DELETE -H "$JSON" -d '{}' "$BASE/admin/content"
check "read the file to delete"            200 '"sha"' -H "$AUTH" "$BASE/admin/content?path=src/content/horses/bella.md"
BELLA_SHA="$(jget sha)"
check "delete with stale sha"              409 'conflict' -X DELETE -H "$AUTH" -H "$JSON" \
  -d "{\"path\":\"src/content/horses/bella.md\",\"sha\":\"$HOME_SHA\"}" "$BASE/admin/content"
check "delete without sha"                 400 'sha' -X DELETE -H "$AUTH" -H "$JSON" \
  -d '{"path":"src/content/horses/bella.md"}' "$BASE/admin/content"
check "delete an image through content"    403 'upload' -X DELETE -H "$AUTH" -H "$JSON" \
  -d "{\"path\":\"src/assets/horses/duke-2.png\",\"sha\":\"$BELLA_SHA\"}" "$BASE/admin/content"
check "delete public/CNAME"                403 'not allowed' -X DELETE -H "$AUTH" -H "$JSON" \
  -d "{\"path\":\"public/CNAME\",\"sha\":\"$BELLA_SHA\"}" "$BASE/admin/content"
check "delete with current sha"            200 '"commit"' -X DELETE -H "$AUTH" -H "$JSON" \
  -d "{\"path\":\"src/content/horses/bella.md\",\"sha\":\"$BELLA_SHA\",\"message\":\"Remove Bella\"}" "$BASE/admin/content"
LAST_COMMIT="$(jget commit)"
check "deleted file is gone"               404 'not found' -H "$AUTH" "$BASE/admin/content?path=src/content/horses/bella.md"

echo "== GET /admin/raw"
check "raw without session"                401 'session' "$BASE/admin/raw?path=src/assets/horses/duke-2.png"
check "raw image"                          200 '' -H "$AUTH" "$BASE/admin/raw?path=src/assets/horses/duke-2.png"
assert "raw bytes equal the upload"        cmp -s "$TMP/a.png" "$TMP/body"
assert "raw content type from the bytes"   has_header 'content-type: image/png'
check "raw on a text file"                 403 'not allowed' -H "$AUTH" "$BASE/admin/raw?path=src/content/horses/duke.md"
check "raw with ../"                       400 'invalid path' -H "$AUTH" "$BASE/admin/raw?path=src/assets/horses/../../../package.json"
check "raw on a missing image"             404 'not found' -H "$AUTH" "$BASE/admin/raw?path=src/assets/horses/nope-1.jpg"

echo "== GET /admin/deploy-status"
check "status without session"             401 'session' "$BASE/admin/deploy-status?sha=$LAST_COMMIT"
check "status with a bad sha"              400 'invalid sha' -H "$AUTH" "$BASE/admin/deploy-status?sha=main"
check "status of the last commit"          200 '"available":true' -H "$AUTH" "$BASE/admin/deploy-status?sha=$LAST_COMMIT"
assert "run belongs to that commit"        test "$(jget run.headSha)" = "$LAST_COMMIT"
assert "latest run on main is reported"    test "$(jget latest.headSha)" = "$LAST_COMMIT"

echo "== POST /admin/logout"
check "logout"                             200 '{"ok":true}' -X POST -H "$AUTH" "$BASE/admin/logout"
check "token dead after logout"            401 'session' -H "$AUTH" "$BASE/admin/leads"
check "logout again"                       401 'session' -X POST -H "$AUTH" "$BASE/admin/logout"

echo "== a Worker whose GITHUB_TOKEN secret is empty (wrangler secret put with no input)"
NT_PORT=$((PORT + 7))
# This one has a Notion token but no database id: Notion is off here too.
printf 'ADMIN_PASSWORD_HASH=%s\nGITHUB_TOKEN=\nGITHUB_API_BASE=%s\nNOTION_TOKEN=%s\nNOTION_API_BASE=%s\n' \
  "$PW_HASH" "$GH" "$NOTION_TOKEN_DUMMY" "$NOTION" > "$TMP/notoken.env"
npx wrangler dev --port "$NT_PORT" --ip 127.0.0.1 --persist-to "$TMP/state-nt" --env-file "$TMP/notoken.env" \
  --show-interactive-dev-session=false > "$TMP/wrangler-nt.log" 2>&1 & PIDS+=($!)
for _ in $(seq 1 60); do curl -s -m 1 "http://127.0.0.1:$NT_PORT/health" >/dev/null 2>&1 && break; sleep 0.5; done
NT="http://127.0.0.1:$NT_PORT"
check "login still works without the key"  200 '"token"' -H "$(ip 40)" -H "$JSON" -d "{\"password\":\"$PW\"}" "$NT/admin/login"
NT_AUTH="Authorization: Bearer $(jget token)"
check "content says the key is missing"    503 'repository not configured' -H "$NT_AUTH" "$NT/admin/content?path=src/content/texts/home.json"
check "upload says the key is missing"     503 'repository not configured' -H "$NT_AUTH" -F slug=duke -F "file=@$TMP/a.png;type=image/png" "$NT/admin/upload"
check "leads are not affected"             200 '"leads"' -H "$NT_AUTH" "$NT/admin/leads"
check "a lead with a token but no db id"   200 '{"ok":true}' -H "$(ip 41)" -H "$JSON" \
  -d "{\"name\":\"Token Only\",\"region\":\"Asia\",\"budget\":\"x\",\"format\":\"y\",\"contact\":\"+1 555 123 4567\",\"ts\":$TS}" "$NT/lead"
sleep 2
assert "still no call to Notion"           test "$(notion_count)" = 0
pkill -f "wrangler dev --port $NT_PORT " 2>/dev/null

echo "== Notion switched on: a card in his database"
# The main Worker stops; this one opens the same stored data, so its three leads are
# "leads that arrived before Notion was connected". The phase / comment property names and
# the phase option are not set here: the defaults in wrangler.toml are what is tested.
pkill -f "wrangler dev --port $PORT " 2>/dev/null
sleep 1
NW="http://127.0.0.1:$NW_PORT"
cat > "$TMP/notion.env" <<EOF
ADMIN_PASSWORD_HASH=$PW_HASH
GITHUB_TOKEN=$GH_TOKEN_DUMMY
GITHUB_API_BASE=$GH
NOTION_TOKEN=$NOTION_TOKEN_DUMMY
NOTION_DB="https://www.notion.so/team/Clients-Selection-$NOTION_DB_ID?v=$(openssl rand -hex 16)"
NOTION_API_BASE=$NOTION
EOF
npx wrangler dev --port "$NW_PORT" --ip 127.0.0.1 --persist-to "$TMP/state" --env-file "$TMP/notion.env" \
  --show-interactive-dev-session=false > "$TMP/wrangler-nw.log" 2>&1 & PIDS+=($!)
for _ in $(seq 1 60); do curl -s -m 1 "$NW/health" >/dev/null 2>&1 && break; sleep 0.5; done

nc() { node test/ncheck.mjs "$NOTION" "$@"; }   # nc "<card title>" '<expression>'  (see test/ncheck.mjs)
leads_now() { curl -s -o "$TMP/leads.json" -H "$NW_AUTH" "$NW/admin/leads"; }
lget() { node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const l=(j.leads||[]).find(l=>l.name===process.argv[2]);const v=l?l[process.argv[3]]:undefined;console.log(v===undefined?"":v)' "$TMP/leads.json" "$1" "$2"; }
mark_of() { # waits up to 15 s for the lead called $1 to get a Notion mark, then prints it
  local m=""; for _ in $(seq 1 30); do leads_now; m="$(lget "$1" notion)"; [[ -n "$m" ]] && break; sleep 0.5; done; echo "$m"; }
nlead() { # nlead <ip> <name> [extra JSON fields, starting with a comma]
  check "lead: $2" 200 '{"ok":true}' -H "$(ip "$1")" -H "$JSON" \
    -d "{\"name\":\"$2\",\"region\":\"Europe\",\"budget\":\"€60,000 – 100,000\",\"format\":\"Online purchase\",\"contact\":\"+32 470 99 88 77\",\"ts\":$TS${3:-}}" "$NW/lead"; }
utc() { node -e 'const c=process.argv[1];console.log(c.slice(0,10)+" "+c.slice(11,16)+" UTC")' "$1"; }
HORSE_URL='https://dev.siteboosty.com/?utm_source=ig#quiz?horse=donatello-b'
TEXT='(p) => Object.values(p).find(v => v.rich_text) ? Object.values(p).find(v => v.rich_text).rich_text.map(t => t.text.content).join("") : null'

check "login (Notion Worker)"              200 '"token"' -H "$(ip 50)" -H "$JSON" -d "{\"password\":\"$PW\"}" "$NW/admin/login"
NW_AUTH="Authorization: Bearer $(jget token)"
check "leads list says Notion is on"       200 '"notion":true' -H "$NW_AUTH" "$NW/admin/leads"
assert "older leads carry no mark yet"     bash -c "! grep -q '\"notion\":\"' '$TMP/body'"

echo "== Notion: \"phase\" is a status, the title is not called Name"
nlead 51 "Full Lead" ",\"consent\":true,\"page\":\"$HORSE_URL\""
assert "reply is exactly {ok:true}"        test "$(cat "$TMP/body")" = '{"ok":true}'
assert "full lead reached Notion"          test "$(mark_of 'Full Lead')" = sent
EXPECT="$(printf '%s\n' 'Region: Europe' 'Budget: €60,000 – 100,000' 'Buying: Online purchase' 'Horse: Donatello B' \
  'Contact: +32 470 99 88 77' 'Consent: yes' "Page: $HORSE_URL" "Received: $(utc "$(lget 'Full Lead' createdAt)")")"
export EXPECT
assert "one card created"                  nc "Full Lead" 'cs.length === 1'
assert "token and Notion-Version sent"     nc "Full Lead" "c.auth === 'Bearer $NOTION_TOKEN_DUMMY' && c.version === '2022-06-28'"
assert "db id from the address, not ?v="   nc "Full Lead" "c.body.parent.database_id === '$NOTION_DB_ID'"
assert "name in his title property"        nc "Full Lead" "p['Клієнт'].title[0].text.content === 'Full Lead'"
assert "phase (status) set to Лід"         nc "Full Lead" "p['Phase'].status.name === 'Лід'"
assert "all answers in comment on phase"   nc "Full Lead" "($TEXT)(p) === process.env.EXPECT"
assert "exactly three properties"          nc "Full Lead" "Object.keys(p).sort().join('|') === ['Comment on phase', 'Phase', 'Клієнт'].sort().join('|')"
assert "no page text on a complete card"   nc "Full Lead" '!c.body.children'
nlead 52 "Min Lead"
assert "lead without optional answers sent" test "$(mark_of 'Min Lead')" = sent
EXPECT="$(printf '%s\n' 'Region: Europe' 'Budget: €60,000 – 100,000' 'Buying: Online purchase' \
  'Contact: +32 470 99 88 77' "Received: $(utc "$(lget 'Min Lead' createdAt)")")"
assert "no line for a missing answer"      nc "Min Lead" "($TEXT)(p) === process.env.EXPECT"
assert "no empty string anywhere"          nc "Min Lead" '!JSON.stringify(c.body).includes(String.fromCharCode(34, 34))'
assert "schema read once, then cached"     nc "" 'reads.length === 1'

echo "== Notion: failures, retries and the mark"
nlead 54 "Notion401 Lead"
assert "401 → reply still {ok:true}"       test "$(cat "$TMP/body")" = '{"ok":true}'
assert "401 → marked failed"               test "$(mark_of 'Notion401 Lead')" = failed
assert "401 → reason recorded"             test "$(lget 'Notion401 Lead' notionError)" = "401 unauthorized"
assert "401 → not retried"                 nc "Notion401 Lead" 'cs.length === 1'
nlead 55 "Notion429 Lead"
assert "429 → marked failed"               test "$(mark_of 'Notion429 Lead')" = failed
assert "429 → reason recorded"             test "$(lget 'Notion429 Lead' notionError)" = "429 rate_limited"
assert "429 → tried 3 times"               nc "Notion429 Lead" 'cs.length === 3'
assert "429 → waited Retry-After"          nc "Notion429 Lead" 'cs[1].at - cs[0].at >= 900'
nlead 56 "Notion500 Lead"
assert "500 → marked failed"               test "$(mark_of 'Notion500 Lead')" = failed
assert "500 → reason recorded"             test "$(lget 'Notion500 Lead' notionError)" = "500 internal_server_error"
assert "500 → tried 3 times"               nc "Notion500 Lead" 'cs.length === 3'
nlead 57 "Flaky Lead"
assert "500 then 200 → sent"               test "$(mark_of 'Flaky Lead')" = sent
assert "the retry made the 2nd call"       nc "Flaky Lead" 'cs.length === 2'
assert "the retry waited (backoff)"        nc "Flaky Lead" 'cs[1].at - cs[0].at >= 400'
T0="$(node -e 'console.log(Date.now())')"
nlead 58 "Slow Lead"
T1="$(node -e 'console.log(Date.now())')"
assert "reply does not wait for Notion (4 s)" test $((T1 - T0)) -lt 2000
assert "slow Notion → still sent"          test "$(mark_of 'Slow Lead')" = sent
assert "failure log holds no lead data"    bash -c "! grep -v 'CF-KV-Metadata' '$TMP/wrangler-nw.log' | grep -qE 'Notion401|Notion429|Notion500|470 99 88 77'"

echo "== POST /admin/notion/resend"
check "resend without session"             401 'session' -H "$JSON" -d '{}' "$NW/admin/notion/resend"
check "resend with an unknown field"       400 'unknown field' -H "$NW_AUTH" -H "$JSON" -d '{"all":true}' "$NW/admin/notion/resend"
check "resend with a bad id"               400 'invalid field: id' -H "$NW_AUTH" -H "$JSON" -d '{"id":"../x"}' "$NW/admin/notion/resend"
check "resend an unknown id"               404 'lead not found' -H "$NW_AUTH" -H "$JSON" -d '{"id":"00000000-0000-4000-8000-000000000000"}' "$NW/admin/notion/resend"
check "resend an id and dates"             400 'not both' -H "$NW_AUTH" -H "$JSON" -d "{\"id\":\"00000000-0000-4000-8000-000000000000\",\"from\":\"$TODAY\"}" "$NW/admin/notion/resend"
check "resend a bad date"                  400 'YYYY-MM-DD' -H "$NW_AUTH" -H "$JSON" -d '{"from":"2026-13-01"}' "$NW/admin/notion/resend"
check "resend from after to"               400 'after' -H "$NW_AUTH" -H "$JSON" -d "{\"from\":\"$TODAY\",\"to\":\"$YESTERDAY\"}" "$NW/admin/notion/resend"
# The three leads from before Notion was connected count as "maybe on their way" for a minute.
leads_now
WAIT_S="$(node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const t=Math.max(...j.leads.filter(l=>!l.notion).map(l=>Date.parse(l.createdAt)));console.log(Math.max(0,Math.ceil((t+61000-Date.now())/1000)))' "$TMP/leads.json")"
if [[ "$WAIT_S" -gt 0 ]]; then echo "   (waiting ${WAIT_S}s until the older leads are a minute old)"; sleep "$WAIT_S"; fi
nlead 59 "Slow Pending"
check "resend every lead"                  200 '"ok":true' -H "$NW_AUTH" -H "$JSON" -d '{}' "$NW/admin/notion/resend"
assert "older leads sent, oldest first"    test "$(jget sent)" = 3
assert "stops at the first 401"            test "$(jget failed)|$(jget stopped)" = "1|401 unauthorized"
assert "the rest is left for next time"    test "$(jget remaining)" = 2
assert "a lead still on its way is skipped" test "$(jget pending)" = 1
assert "sent ones are skipped"             test "$(jget alreadySent)" = 4
leads_now
assert "older leads now marked sent"       test "$(lget 'Anna First' notion)|$(lget 'Omar Second' notion)|$(lget '=HYPERLINK(1)' notion)" = "sent|sent|sent"
assert "older lead's card is complete"     nc "Omar Second" "p['Phase'].status.name === 'Лід' && ($TEXT)(p).includes('Contact: +971 50 123 4567\nConsent: yes\nPage: https://dev.siteboosty.com/?utm_source=ig')"
assert "the pending lead got its own send" test "$(mark_of 'Slow Pending')" = sent
assert "...and only one card"              nc "Slow Pending" 'cs.length === 1'
curl -s -o /dev/null -X POST "$NOTION/__mode?m=ok"   # Notion is healthy again
check "resend one lead by id"              200 '"sent":1' -H "$NW_AUTH" -H "$JSON" -d "{\"id\":\"$(lget 'Notion401 Lead' id)\"}" "$NW/admin/notion/resend"
leads_now
assert "that lead is now marked sent"      test "$(lget 'Notion401 Lead' notion)|$(lget 'Notion401 Lead' notionError)" = "sent|"
check "resend today's leads"               200 '"sent":2' -H "$NW_AUTH" -H "$JSON" -d "{\"from\":\"$TODAY\",\"to\":\"$TODAY\"}" "$NW/admin/notion/resend"
assert "nothing failed, nothing left"      test "$(jget failed)|$(jget remaining)" = "0|0"
check "resend again: nothing to do"        200 '"sent":0' -H "$NW_AUTH" -H "$JSON" -d '{}' "$NW/admin/notion/resend"
assert "all 11 already sent"               test "$(jget alreadySent)" = 11
assert "a sent lead is never sent twice"   nc "" "['Full Lead','Min Lead','Flaky Lead','Slow Lead','Anna First'].every(t => pages.filter(x => Object.values(x.body.properties).find(v => v.title).title[0].text.content === t).length === (t === 'Flaky Lead' ? 2 : 1))"

echo "== Notion: \"phase\" is a select"
curl -s -o /dev/null -X POST "$NOTION/__schema?s=select"
nlead 60 "Select Lead"
assert "sent after his schema changed"     test "$(mark_of 'Select Lead')" = sent
assert "schema re-read after the 400"      nc "" 'reads.length === 2'
assert "phase (select) set to Лід"         nc "Select Lead" "p['PHASE'].select.name === 'Лід' && !('Phase' in p)"
assert "two-language title property used" nc "Select Lead" "p['Клієнт / Client'].title[0].text.content === 'Select Lead'"
assert "answers in comment on phase"       nc "Select Lead" "($TEXT)(p).startsWith('Region: Europe\nBudget: €60,000 – 100,000\nBuying: Online purchase\nContact: ')"

echo "== Notion: a property is missing → a partial card"
curl -s -o /dev/null -X POST "$NOTION/__schema?s=nocomment"
nlead 61 "No Comment Lead" ",\"page\":\"$HORSE_URL\""
assert "card created, marked partial"      test "$(mark_of 'No Comment Lead')" = partial
assert "reason: no comment on phase"       test "$(lget 'No Comment Lead' notionError)" = 'no column "comment on phase"'
assert "phase still set"                   nc "No Comment Lead" "p['Phase'].status.name === 'Лід'"
assert "nothing guessed into Notes"        nc "No Comment Lead" "Object.keys(p).sort().join('|') === ['Phase', 'Клієнт'].sort().join('|')"
assert "every answer in the page text"     nc "No Comment Lead" "lines.join('|') === ['Region: Europe', 'Budget: €60,000 – 100,000', 'Buying: Online purchase', 'Horse: Donatello B', 'Contact: +32 470 99 88 77', 'Page: $HORSE_URL', 'Received: $(utc "$(lget 'No Comment Lead' createdAt)")'].join('|')"
curl -s -o /dev/null -X POST "$NOTION/__schema?s=nophase"
nlead 62 "No Phase Lead"
assert "no phase → marked partial"         test "$(mark_of 'No Phase Lead')" = partial
assert "reason: no phase"                  test "$(lget 'No Phase Lead' notionError)" = 'no column "phase"'
assert "no other column taken as phase"    nc "No Phase Lead" "!('Stage' in p) && p['Клієнт'].title[0].text.content === 'No Phase Lead'"
assert "answers in the page text"          nc "No Phase Lead" "lines[0] === 'Region: Europe' && lines.some(l => l.startsWith('Received: '))"
curl -s -o /dev/null -X POST "$NOTION/__schema?s=nooption"
nlead 63 "No Option Lead"
assert "no Лід option → marked partial"    test "$(mark_of 'No Option Lead')" = partial
assert "reason: no such option"            test "$(lget 'No Option Lead' notionError)" = '"Phase" has no option "Лід"'
assert "no option is invented"             nc "No Option Lead" "!('Phase' in p) && lines.length > 0"
export PAGES_BEFORE="$(curl -s "$NOTION/__calls" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).filter(x=>x.path==="/v1/pages").length))')"
check "resend skips partial cards"         200 '"sent":0' -H "$NW_AUTH" -H "$JSON" -d '{}' "$NW/admin/notion/resend"
assert "partial cards count as delivered"  test "$(jget alreadySent)" = 15
assert "no new card for a partial lead"    nc "" 'pages.length === Number(process.env.PAGES_BEFORE)'

echo "== Notion: a long set of answers"
curl -s -o /dev/null -X POST "$NOTION/__schema?s=status"
node -e '
const fs=require("fs"),[d,ts]=process.argv.slice(1);
const fill=(w,n)=>(w.repeat(Math.ceil(n/w.length))).slice(0,n).trim();
const slug="very-long-horse-name-"+"ab-".repeat(20).slice(0,59);
const page="https://dev.siteboosty.com/?q="+"x".repeat(500-60-slug.length)+"#quiz?horse="+slug;
const lead={name:"Long Answers",region:fill("Europe and the Gulf ",100),budget:fill("€100,000+ and flexible ",100),
  format:fill("I will come to try the horse in person ",100),contact:"a".repeat(180)+"@example.com",consent:true,page,ts:Number(ts)};
fs.writeFileSync(d+"/long.json",JSON.stringify(lead));' "$TMP" "$TS"
export LONGJ="$(cat "$TMP/long.json")"
check "lead: Long Answers"                 200 '{"ok":true}' -H "$(ip 64)" -H "$JSON" --data-binary "@$TMP/long.json" "$NW/lead"
assert "long lead sent"                    test "$(mark_of 'Long Answers')" = sent
assert "every long answer whole in the text" nc "Long Answers" "(() => { const t = ($TEXT)(p), l = JSON.parse(process.env.LONGJ); return t.split('\n').length === 8 && [l.region, l.budget, l.format, l.contact, l.page].every(v => t.includes(v)); })()"
assert "each text piece within Notion's 2000" nc "Long Answers" "p['Comment on phase'].rich_text.every(t => t.text.content.length <= 2000) && ($TEXT)(p).length > 1000"
pkill -f "wrangler dev --port $NW_PORT " 2>/dev/null

echo "== secrets stay out of the logs"
assert "password not in wrangler log"      bash -c "! grep -qF '$PW' '$TMP/wrangler.log'"
assert "token not in wrangler log"         bash -c "! grep -qF '$TOKEN' '$TMP/wrangler.log'"
assert "password hash not in wrangler log" bash -c "! grep -qF '$PW_HASH' '$TMP/wrangler.log'"
assert "github token not in wrangler log"  bash -c "! grep -qF '$GH_TOKEN_DUMMY' '$TMP/wrangler.log'"
assert "no unhandled errors in the log"    bash -c "! grep -q 'unhandled' '$TMP/wrangler.log'"
assert "notion token not in any log"       bash -c "! grep -qF '$NOTION_TOKEN_DUMMY' '$TMP'/wrangler*.log"
# Local wrangler dev (not Cloudflare) prints a "CF-KV-Metadata contains non-ASCII" warning, with
# the stored lead in it, whenever a lead with a € in it is read back with KV.get. That line is the
# local KV simulator's, not ours; everything else in the log must hold no lead data.
assert "no lead data in the Notion log"    bash -c "! grep -v 'CF-KV-Metadata' '$TMP/wrangler-nw.log' | grep -qE 'Full Lead|Mail Lead|mail.lead@|470 99 88 77|Donatello|Anna First'"
assert "no unhandled errors, Notion Worker" bash -c "! grep -qE 'unhandled|notion sync' '$TMP/wrangler-nw.log'"

echo
echo "RESULT: $PASS passed, $FAIL failed"
exit "$FAIL"
