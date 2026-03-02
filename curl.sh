#!/bin/sh
# Smoke test the build worker — verifies it can compile a Caddy binary.
curl -f -u caddy:caddyworkerbuilddemo1165 \
    -X POST \
    -H "Content-Type: application/json" \
    -d '{"os":"linux","arch":"amd64"}' \
    --max-time 600 \
    -o /dev/null \
    -w "status: %{http_code}\nsize: %{size_download} bytes\ntime: %{time_total}s\n" \
    https://worker-0.infra.caddyserver.com/
