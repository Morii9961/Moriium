#!/usr/bin/env bash
set -Eeuo pipefail

die() {
  printf 'Moriium deploy: %s\n' "$*" >&2
  exit 1
}

[[ $# -eq 4 ]] || die 'usage: deploy-code.sh <sha> <release-root> <public-probe-url> <admin-probe-url>'

sha="$1"
root="${2%/}"
public_probe="$3"
admin_probe="$4"
service='moriium-admin.service'
archive="/tmp/moriium-${sha}.tar.gz"

[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || die 'the release id must be a full lowercase Git commit SHA'
case "$root" in
  /var/www/*) ;;
  *) die 'the release root must be a non-root path below /var/www/' ;;
esac
[[ "$public_probe" == https://* ]] || die 'the public probe must use HTTPS'
[[ "$admin_probe" == https://* ]] || die 'the admin probe must use HTTPS'

for command in curl flock pnpm readlink sha256sum sudo systemctl tar; do
  command -v "$command" >/dev/null || die "required command is missing: ${command}"
done
[[ -s "$archive" ]] || die "source archive is missing: ${archive}"

mkdir -p "$root" "$root/releases"
exec 9>"$root/release.lock"
flock -n 9 || die 'another code or content release is already running'

workspace="$root/workspace"
staging="$root/.workspace-${sha}.next"
previous="$root/.workspace-${sha}.previous"
failed="$root/.workspace-${sha}.failed"

# Every recursive removal below is one of these three exact paths, all derived
# only after the release root has passed the /var/www/* boundary check.
rm -rf -- "$staging" "$previous" "$failed"
mkdir -p "$staging"
tar -xzf "$archive" -C "$staging"
[[ -s "$staging/package.json" ]] || die 'the source archive has no package.json'
[[ -s "$staging/pnpm-lock.yaml" ]] || die 'the source archive has no pnpm-lock.yaml'
[[ -s "$staging/scripts/release-site.mjs" ]] || die 'the source archive has no release command'

reused_dependencies=0
if [[ -d "$workspace/node_modules" ]] && [[ -s "$workspace/pnpm-lock.yaml" ]]; then
  old_lock="$(sha256sum "$workspace/pnpm-lock.yaml" | cut -d' ' -f1)"
  new_lock="$(sha256sum "$staging/pnpm-lock.yaml" | cut -d' ' -f1)"
  if [[ "$old_lock" == "$new_lock" ]]; then
    reused_dependencies=1
  fi
fi

restore_previous_workspace() {
  if [[ -d "$workspace" ]]; then
    if [[ "$reused_dependencies" -eq 1 ]] && [[ -d "$workspace/node_modules" ]] && [[ -d "$previous" ]]; then
      mv "$workspace/node_modules" "$previous/node_modules"
    fi
    mv "$workspace" "$failed"
  fi
  if [[ -d "$previous" ]]; then
    mv "$previous" "$workspace"
  fi
}

service_stopped=0
workspace_swapped=0
static_released=0
failure_context='deployment preparation failed'

on_error() {
  status="$?"
  trap - ERR
  if [[ "$static_released" -eq 0 ]] && [[ -L "$root/current" ]]; then
    selected="$(readlink -f "$root/current" || true)"
    expected="$(readlink -f "$root/releases/$sha" || true)"
    if [[ -n "$selected" ]] && [[ "$selected" == "$expected" ]]; then
      static_released=1
      failure_context='the release command failed after selecting the new public release; its workspace was kept for diagnosis'
    fi
  fi
  if [[ "$static_released" -eq 0 ]]; then
    if [[ "$workspace_swapped" -eq 1 ]]; then
      restore_previous_workspace
    elif [[ "$reused_dependencies" -eq 1 ]] && [[ -d "$staging/node_modules" ]] && [[ -d "$workspace" ]]; then
      mv "$staging/node_modules" "$workspace/node_modules" || true
    fi
  fi
  if [[ "$service_stopped" -eq 1 ]]; then
    sudo -n systemctl start "$service" || true
  fi
  printf 'Moriium deploy: %s.\n' "$failure_context" >&2
  exit "$status"
}
trap on_error ERR

failure_context='the author service could not be stopped'
sudo -n systemctl stop "$service"
service_stopped=1
if [[ "$reused_dependencies" -eq 1 ]]; then
  failure_context='the unchanged dependency tree could not be moved into the staged workspace'
  mv "$workspace/node_modules" "$staging/node_modules"
fi
if [[ -d "$workspace" ]]; then
  failure_context='the previous workspace could not be moved aside'
  mv "$workspace" "$previous"
  workspace_swapped=1
fi
failure_context='the staged workspace could not be promoted'
mv "$staging" "$workspace"
workspace_swapped=1

failure_context='the VPS build or static release failed; the previous workspace and public release remain selected'
pnpm --dir "$workspace" site:release --id "$sha" --root "$root" --url "$public_probe"
static_released=1

failure_context='the static release is live, but the admin service did not start; public routes remain available'
sudo -n systemctl start "$service"
service_stopped=0

failure_context='the static release is live, but the admin probe failed; inspect the service before changing current'
curl --fail --silent --show-error --max-time 12 "$admin_probe" >/dev/null

failure_context='the release passed, but post-release cleanup failed'
rm -rf -- "$previous" "$failed"
rm -f -- "$archive"
trap - ERR
printf 'Moriium deploy: %s is live and the admin probe passed.\n' "$sha"
