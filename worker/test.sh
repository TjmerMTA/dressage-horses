#!/usr/bin/env bash
# End-to-end test of every endpoint against a local `npx wrangler dev`.
#
# It starts its own wrangler dev (fresh, throw-away KV state) and a mock GitHub
# Contents API, with a random one-off admin password and a dummy GitHub token that
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
ORIGIN="https://dev.siteboosty.com"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/dh-api-test.XXXXXX")"
PIDS=()
cleanup() {
  for p in "${PIDS[@]:-}"; do [[ -n "$p" ]] && kill "$p" 2>/dev/null; done
  wait 2>/dev/null
  pkill -f "wrangler dev --port $PORT " 2>/dev/null
  pkill -f "wrangler dev --port $((PORT + 7)) " 2>/dev/null
  rm -rf "$TMP"
}
trap cleanup EXIT

# ---- one-off credentials, never stored anywhere but $TMP --------------------------
PW="$(openssl rand -hex 16)"
PW_HASH="$(printf %s "$PW" | shasum -a 256 | cut -d' ' -f1)"
GH_TOKEN_DUMMY="test-$(openssl rand -hex 8)"
cat > "$TMP/test.env" <<EOF
ADMIN_PASSWORD_HASH=$PW_HASH
GITHUB_TOKEN=$GH_TOKEN_DUMMY
GITHUB_API_BASE=$GH
EOF

node test/mock-github.mjs "$GH_PORT" "$GH_TOKEN_DUMMY" & PIDS+=($!)
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
printf 'ADMIN_PASSWORD_HASH=%s\nGITHUB_TOKEN=\nGITHUB_API_BASE=%s\n' "$PW_HASH" "$GH" > "$TMP/notoken.env"
npx wrangler dev --port "$NT_PORT" --ip 127.0.0.1 --persist-to "$TMP/state-nt" --env-file "$TMP/notoken.env" \
  --show-interactive-dev-session=false > "$TMP/wrangler-nt.log" 2>&1 & PIDS+=($!)
for _ in $(seq 1 60); do curl -s -m 1 "http://127.0.0.1:$NT_PORT/health" >/dev/null 2>&1 && break; sleep 0.5; done
NT="http://127.0.0.1:$NT_PORT"
check "login still works without the key"  200 '"token"' -H "$(ip 40)" -H "$JSON" -d "{\"password\":\"$PW\"}" "$NT/admin/login"
NT_AUTH="Authorization: Bearer $(jget token)"
check "content says the key is missing"    503 'repository not configured' -H "$NT_AUTH" "$NT/admin/content?path=src/content/texts/home.json"
check "upload says the key is missing"     503 'repository not configured' -H "$NT_AUTH" -F slug=duke -F "file=@$TMP/a.png;type=image/png" "$NT/admin/upload"
check "leads are not affected"             200 '"leads"' -H "$NT_AUTH" "$NT/admin/leads"
pkill -f "wrangler dev --port $NT_PORT " 2>/dev/null

echo "== secrets stay out of the logs"
assert "password not in wrangler log"      bash -c "! grep -qF '$PW' '$TMP/wrangler.log'"
assert "token not in wrangler log"         bash -c "! grep -qF '$TOKEN' '$TMP/wrangler.log'"
assert "password hash not in wrangler log" bash -c "! grep -qF '$PW_HASH' '$TMP/wrangler.log'"
assert "github token not in wrangler log"  bash -c "! grep -qF '$GH_TOKEN_DUMMY' '$TMP/wrangler.log'"
assert "no unhandled errors in the log"    bash -c "! grep -q 'unhandled' '$TMP/wrangler.log'"

echo
echo "RESULT: $PASS passed, $FAIL failed"
exit "$FAIL"
