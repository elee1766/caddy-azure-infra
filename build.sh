#!/bin/sh
set -e

tmpfile=$(mktemp)
trap 'rm -f "$tmpfile"' EXIT

curl -f -u caddy:caddyworkerbuilddemo1165 \
    -X POST \
    -H "Content-Type: application/json" \
    -d '{"os":"linux","arch":"amd64"}' \
    --max-time 600 \
    -o "$tmpfile" \
    https://worker-0.infra.caddyserver.com/

# The response is multipart/form-data. The binary starts after the
# first blank line following the "artifact" part header, and ends
# before the final boundary line. Just strip the first 4 lines
# (boundary, content-disposition, content-type, blank) and the
# last 2 lines (boundary close).
head -n -2 "$tmpfile" | tail -n +5 > caddy
chmod +x caddy

echo "Build complete:"
ls -lh caddy
./caddy version
