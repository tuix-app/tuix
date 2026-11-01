#!/bin/sh
# Copies the Tuix panel into Herdr and checks it. Run again to update.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
home=${HERDR_APP_HOME:-$HOME/.config/herdr-app}

mkdir -p "$home/mods" "$home/layouts"
rsync -a --delete --exclude .cache "$here/mods/tuix/" "$home/mods/tuix/"
rsync -a --delete --exclude .cache "$here/mods/tuix-tabs/" "$home/mods/tuix-tabs/"
cp "$here/layouts/tuix.json" "$home/layouts/tuix.json"

status=0
for mod in tuix tuix-tabs; do
  herdr-app check "$home/mods/$mod" || status=1
done
[ "$status" -eq 0 ] || { echo "herdr-app check failed" >&2; exit 1; }
echo "Installed. Now run: herdr-app do layout.switch '{\"name\":\"tuix\"}'"
