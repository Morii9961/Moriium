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
archive="${MORIIUM_DEPLOY_ARCHIVE:-/tmp/moriium-${sha}.tar.gz}"

[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || die 'the release id must be a full lowercase Git commit SHA'
case "$root" in
  /var/www/*) ;;
  *) die 'the release root must be a non-root path below /var/www/' ;;
esac
[[ "$root" =~ ^/var/www/[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || die 'the release root must be one direct directory below /var/www'
[[ "$public_probe" == https://* ]] || die 'the public probe must use HTTPS'
[[ "$admin_probe" == https://* ]] || die 'the admin probe must use HTTPS'

for command in cat cp curl dirname flock ln mv node pnpm readlink sha256sum sudo systemctl tar; do
  command -v "$command" >/dev/null || die "required command is missing: ${command}"
done
[[ -s "$archive" ]] || die "source archive is missing: ${archive}"
[[ ! -L "$archive" ]] || die 'the source archive cannot be a symbolic link'

mkdir -p "$root" "$root/releases"
[[ "$(readlink -f "$root")" == "$root" ]] || die 'the release root cannot contain symbolic link components'
exec 9>"$root/release.lock"
flock -n 9 || die 'another code or content release is already running'

workspace="$root/workspace"
staging="$root/.workspace-${sha}.next"
previous="$root/.workspace-${sha}.previous"
failed="$root/.workspace-${sha}.failed"
previous_public="$(readlink -f "$root/current" || true)"
case "$previous_public" in
  "$root/releases/"*|'') ;;
  *) die 'current must select a release inside this site root' ;;
esac

# Every recursive removal below is one of these three exact paths, all derived
# only after the release root has passed the /var/www/* boundary check.
rm -rf -- "$staging" "$previous" "$failed"
mkdir -p "$staging"
tar -xzf "$archive" -C "$staging"
[[ -s "$staging/package.json" ]] || die 'the source archive has no package.json'
[[ -s "$staging/pnpm-lock.yaml" ]] || die 'the source archive has no pnpm-lock.yaml'
[[ -s "$staging/scripts/release-site.mjs" ]] || die 'the source archive has no release command'

reused_dependencies=0
dependency_key() {
  local directory="$1"
  {
    node --version
    pnpm --version
    for file in package.json pnpm-lock.yaml .npmrc .nvmrc; do
      if [[ -f "$directory/$file" ]]; then
        sha256sum "$directory/$file" | cut -d' ' -f1
      fi
    done
  } | sha256sum | cut -d' ' -f1
}
if [[ -d "$workspace/node_modules" ]] && [[ -s "$workspace/pnpm-lock.yaml" ]]; then
  old_lock="$(dependency_key "$workspace")"
  new_lock="$(dependency_key "$staging")"
  if [[ "$old_lock" == "$new_lock" ]]; then
    reused_dependencies=1
  fi
fi
# Reuse only owned public metadata/content caches, never credentials or sessions.
for file in .cache/github.json .astro/data-store.json; do
  if [[ -f "$workspace/$file" ]]; then
    mkdir -p "$staging/$(dirname "$file")"
    cp "$workspace/$file" "$staging/$file"
  fi
done

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
  status="${1:-$?}"
  trap - ERR
  if [[ "$static_released" -eq 0 ]] && [[ -L "$root/current" ]]; then
    selected="$(readlink -f "$root/current" || true)"
    expected="$(readlink -f "$root/releases/$sha" || true)"
    if [[ -n "$selected" ]] && [[ "$selected" == "$expected" ]]; then
      if [[ -f "$root/.release-ready" ]] && [[ "$(cat "$root/.release-ready")" == "$sha" ]]; then
        static_released=1
        failure_context='the verified public release is live; its workspace was kept for diagnosis'
      elif [[ -n "$previous_public" ]]; then
        rm -f -- "$root/current.rollback-deploy"
        ln -s "$previous_public" "$root/current.rollback-deploy"
        mv -Tf "$root/current.rollback-deploy" "$root/current"
      fi
    fi
  fi
  if [[ "$static_released" -eq 0 ]]; then
    # A readiness failure may have started the candidate runtime. Stop it before
    # restoring the previous source and dependencies.
    if [[ "$service_stopped" -eq 1 ]]; then
      sudo -n systemctl stop "$service" || true
    fi
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
on_interrupt() { trap - TERM INT; on_error 130; }
trap on_interrupt TERM INT

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
pnpm --dir "$workspace" site:release --id "$sha" --root "$root" --url "$public_probe" --admin-url "$admin_probe"
static_released=1

failure_context='the static release is live, but the admin service did not start; public routes remain available'
sudo -n systemctl start "$service"
service_stopped=0

failure_context='the static release is live, but the admin probe failed; inspect the service before changing current'
# systemctl start reports process creation before the HTTP listener is ready.
curl --fail --silent --show-error --retry 8 --retry-delay 1 --retry-connrefused --retry-max-time 30 --max-time 12 "$admin_probe" >/dev/null

failure_context='the release passed, but post-release cleanup failed'
rm -rf -- "$previous" "$failed"
rm -f -- "$archive"
trap - ERR
trap - TERM INT
printf 'Moriium deploy: %s is live and the admin probe passed.\n' "$sha"
