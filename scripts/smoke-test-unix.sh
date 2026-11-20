#!/usr/bin/env bash
set -euo pipefail

platform="${1:?Pass mac or linux}"
if [[ "$platform" == "mac" ]]; then
  bundle="$(find release -maxdepth 3 -type d -name 'TG IPTV.app' -print -quit)"
  [[ -n "$bundle" ]] || { echo "Packaged macOS app bundle not found"; exit 1; }
  executable="$(find "$bundle/Contents/MacOS" -maxdepth 1 -type f -perm -111 -print -quit)"
else
  executable="release/linux-unpacked/tg-iptv-cinema"
  if [[ ! -x "$executable" ]]; then
    executable="$(find release/linux-unpacked -maxdepth 1 -type f -perm -111 ! -name 'chrome-sandbox' ! -name 'chrome_crashpad_handler' ! -name 'chrome' -print -quit)"
  fi
fi
[[ -n "$executable" && -x "$executable" ]] || { echo "Packaged application executable not found"; exit 1; }

tmpdir="${TMPDIR:-/tmp}"
"$executable" --smoke-test --disable-gpu &
pid=$!
marker="$tmpdir/tg-iptv-smoke-$pid.txt"
deadline=$((SECONDS + 35))
while (( SECONDS < deadline )); do
  [[ -f "$marker" ]] && break
  kill -0 "$pid" 2>/dev/null || break
  sleep 0.5
done

if [[ ! -f "$marker" ]]; then
  kill "$pid" 2>/dev/null || true
  echo "Packaged $platform app did not write its startup marker within 35 seconds."
  exit 1
fi
detail="$(cat "$marker")"
rm -f "$marker"
if [[ "$detail" != "ok" ]]; then
  echo "Packaged $platform app startup failed: $detail"
  exit 1
fi
status=0
wait "$pid" || status=$?
[[ "$status" -eq 0 ]] || { echo "Packaged $platform app exited with status $status"; exit "$status"; }
echo "Packaged $platform app started; renderer and preload are ready."
