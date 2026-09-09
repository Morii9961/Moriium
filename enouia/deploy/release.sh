#!/usr/bin/env bash
# Publish a prebuilt Enouia tree. No service restart and no source build here.
set -euo pipefail
source_dir="${1:?Usage: release.sh DIST RELEASE_ID}"
release_id="${2:?Usage: release.sh DIST RELEASE_ID}"
release_root=/var/www/enouia
[[ "$release_id" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$ ]] || { echo 'Invalid release ID' >&2; exit 1; }
[[ -s "$source_dir/index.html" && -d "$source_dir/_astro" ]] || { echo 'Missing static build' >&2; exit 1; }
[[ -d "$release_root/releases" ]] || { echo 'Bootstrap /var/www/enouia/releases first' >&2; exit 1; }
exec 9>"$release_root/release.lock"
flock -n 9 || { echo 'Another Enouia release is running' >&2; exit 1; }
destination="$release_root/releases/$release_id"
[[ ! -e "$destination" && ! -L "$destination" ]] || { echo 'Release already exists; use a new ID' >&2; exit 1; }
mkdir "$destination"
cp -R -- "$source_dir/." "$destination/"
# Preserve the previous symlink target in output for explicit rollback.
printf 'Previous release: %s\n' "$(readlink "$release_root/current" || true)"
temporary="$release_root/.current-$release_id"
ln -s "releases/$release_id" "$temporary"
mv -Tf -- "$temporary" "$release_root/current"
printf 'Selected Enouia release: %s\n' "$release_id"
