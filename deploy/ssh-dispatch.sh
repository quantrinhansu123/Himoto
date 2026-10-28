#!/bin/sh
set -eu
case "${SSH_ORIGINAL_COMMAND:-}" in
  deploy\ *)
    release=${SSH_ORIGINAL_COMMAND#deploy }
    if ! printf '%s' "$release" | /usr/bin/grep -Eq '^[a-f0-9]{40}$'; then exit 64; fi
    exec /usr/bin/sudo -n /usr/local/sbin/himoto-web-release "$release"
    ;;
  *) exit 64 ;;
esac
