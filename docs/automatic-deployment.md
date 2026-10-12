# Automatic incremental deployment

Production activation was authorized and performed on 2026-10-12. The
receiver, path unit, minute reconciliation timer, asset pool, and Nginx
snippet are installed. GitHub uses `DEPLOY_MODE=pull` and the fixed repository
webhook subscribes to `push` and `workflow_run`.

The activation bootstrap made verified commit `f156912` live in 44.69 s,
including Admin readiness and the formal-host version probe. This was an
explicit activation retry, not a timing claim for its historical push.
At activation, GitHub's first two ping attempts failed with a connection EOF
before reaching Nginx. A locally signed request through the formal hostname
returned 202 with its receipt persisted; unsigned requests returned 401.
The minute Git/API reconciliation remains active when remote notifications
cannot be delivered. The first ordinary push (`d295bcc`) passed its exact CI
run and updated all three real About totals without operator intervention in
203.17 s from local push start (including upload), below the five-minute
limit. Two 30 s Git-fetch timeouts preceded the third successful automatic
attempt. Public content and Admin both answered 200 before diagnostic changes.
The cache repository subsequently adopted `http.version=HTTP/1.1`; this is a
protocol preference, not evidence that HTTP/2 caused those transient failures.

## What a push does

A signed `push` notification records the requested commit. A signed
`workflow_run` notification records the result of `.github/workflows/ci.yml`.
Both wake a VPS worker. The worker fetches the fixed repository's current
`main` and releases only that SHA after its successful full verification.
PR verification cannot authorize deployment. A minute timer reconciles missed
notifications through Git and the public workflow-runs API.
With `DEPLOY_MODE=pull`, a new push cancels obsolete Actions verification so
the newest commit does not wait for an older build. The legacy upload mode
keeps its non-interrupting deployment behavior.

Source objects stay in `/var/lib/moriium-deploy/repository.git`. Subsequent
fetches negotiate existing objects. The worker creates a local source archive
for the existing driver; this archive never crosses the network. The driver
reuses compatible dependencies and their Astro cache. Unchanged article pages
reuse Astro's incremental output, while unkeyed aggregate pages rebuild.
Unchanged release files share immutable inodes with the previous release.

Article cache keys include body, metadata, translation/navigation/taxonomy
metadata, dynamic GitHub/media metadata and the footer year. Unknown data
dependencies must invalidate pages conservatively. The build cache is
experimental and tied to the pinned Astro 7.2.4 version. `pnpm verify` retains
its forced clean build; `pnpm build` uses incremental rendering.

The shared public asset pool retains hash-addressed `_astro` and media files
so old open pages can still fetch their assets. Objects are created atomically
and cannot be overwritten with different bytes. Only public output gets
0755 directories and 0644 files; private deployment state and author data keep
their restricted permissions.

This first rollout keeps the existing driver's Admin stop during the build.
The receiver remains independent and public static pages keep serving. A
separate running/building Admin slot is an improvement proposed in the
[design plan](deployment-automation-plan.md), not part of this rollout.
Automatic author-content triggers and Enouia deployment are also separate:
Enouia-only changes are recorded as `unaffected-main`.

## Release and recovery rules

The source head is rechecked before invoking the driver and immediately before
the public switch. A newer head makes the old candidate ineligible. Code and
manual content releases retain the existing `release.lock`; a separate worker
lock prevents concurrent reconciliations.

Before recording live article versions, the release must answer its public
probe, start Admin, pass Admin readiness, and serve the expected
`release-version.json` over the formal hostname. Activation failure restores
the old public link; the driver restores its old workspace and dependencies.
Signal handling restores an unverified selection too. A fully probed release
has a private `.release-ready` checkpoint and is retained for diagnosis if
later bookkeeping or cleanup fails. An interrupted bookkeeping pass may leave
an article conservatively pending; it must not claim an unserved version live.

Database code/schema changes pause as `manual-migration`. They require the
existing compatible migration/backup procedure; code rollback does not undo a
database migration. An unknown deployed baseline pauses as `manual-baseline`.
Neither condition is an invitation to deploy without verification.

The five-minute deadline counts notification/CI/queue wait, source preparation,
build, activation, and probes. GitHub's workflow creation time recovers part of
that interval if a push notification is missed. It is not the exact moment
GitHub accepted a push: end-to-end acceptance must measure that separately.
The worker reserves ten seconds for termination recovery. A failed deadline
is recorded as a failure, not a successful five-minute deployment.

Failed jobs do not rebuild on every timer tick. Inspect
`/var/lib/moriium-deploy/status.json`, the SHA's result file and the service
journal. An explicit retry removes only that SHA's result record and replaces
its pending record with `{ "sha": "<full-sha>", "receivedAt": <current-unix-ms>,
"retry": true }`; keep valid CI evidence. A retry gets its own timing interval,
not a claim that the original push met the deadline.

The asset pool is append-only in this version. It does not have an automatic
garbage collector. Monitor disk usage; reclamation needs retained-release
reference checks and an old-page grace period. Keep six static releases as
before. Bulk new media, cold dependency downloads, and network outages remain
outside any unmeasured successful-latency guarantee.

## Activate on the VPS

Complete local/isolated verification and obtain explicit production activation
authorization. Use the configured VPS account; resolve Node, pnpm, `flock`,
and `systemctl` paths instead of assuming the unit examples match the host.

1. Confirm GitHub `main` contains the reviewed implementation and that its
   exact SHA passed the CI workflow. Set repository variable `DEPLOY_MODE` to
   `pull`; the four legacy source-upload/deploy steps then stay disabled even
   if their old `DEPLOY_ENABLED` variable is true. Verification remains enabled.
2. Install `deploy/automation/{state,receiver,worker}.mjs` and the reviewed
   `deploy/bin/deploy-code.sh` under root-owned `/usr/local/lib/moriium-deploy`.
   The controller deliberately never imports those files from fetched source.
   Future controller/driver changes require an explicit installed-file update.
3. Create the system user/group `moriium-hook`, with membership in the existing
   `moriium` group. It is a service identity, not another author account.
   Create `/var/lib/moriium-deploy` owned by `moriium:moriium`, mode 0750.
   Create its `pending`, `verified`, and `deliveries` directories owned by
   `moriium-hook:moriium`, mode 2770. The worker owns other state directories.
4. Create `/etc/moriium/deploy-receiver.env` from its example, owned by
   `root:moriium-hook`, mode 0640. Generate a fresh random webhook secret of
   at least 32 characters directly into this private file. Never print it,
   commit it, or reuse an author password. The Admin account must not be able
   to read this file. Create `deploy-worker.env` from its example, owned by
   `root:moriium`, mode 0640; it contains no webhook secret. Both examples
   start disabled. Ensure the receiver can traverse the parent directory.
5. Preserve the existing precise sudoers permission for starting/stopping only
   `moriium-admin.service`. Install and validate the two service units, path
   unit, and timer from `deploy/systemd/`. The worker's pnpm store is writable
   under its state directory. Warm dependencies during activation; do not
   spend the first ordinary push downloading them.
   pnpm 11 requires `pnpm_config_store_dir`; it ignores the former
   `npm_config_*` prefix ([pnpm configuration](https://pnpm.io/11.x/configuring)).
   The current host's retained Git repository uses `http.version=HTTP/1.1`.
   Preserve that setting when restoring or recreating the cache; Git documents
   this option in [its HTTP configuration](https://git-scm.com/docs/git-config/2.43.0).
6. Seed `/var/www/moriium/assets/_astro/` and, if present, `assets/media/` from
   the verified current public release. Normalize those public directories and
   files for Nginx readability. Back up the installed Nginx configuration and
   include `deploy/nginx/moriium-deploy.conf` in the existing HTTPS server block.
   Apply the main configuration's revalidation policy for extensionless HTML
   and unhashed mutable files. Run `nginx -t` before reloading. Keep existing
   security headers; the snippet intentionally defines no overriding
   `add_header` directives.
7. Set `MORIIUM_DEPLOY_ENABLED=true` in both private service env files and
   start the receiver, path unit, and timer. The receiver binds only to
   `127.0.0.1:4322`; do not open a new firewall port.
8. Configure a GitHub repository webhook for
   `https://morii9961.top/api/deploy-hook/`, JSON content, TLS verification
   enabled, the same secret, and only `push` and `workflow_run` events.
   Verify a signed delivery is durably acknowledged and a bad signature is
   rejected. The worker can make the current verified implementation live
   immediately, so starting it is a production deployment action.
9. Measure a real ordinary push from acceptance through the formal-host
   version marker and changed content. Check the public site with Node stopped
   only in the isolated acceptance instance. Keep the prior installed
   controller, source workspace and public release for recovery.

For immediate suspension, stop the deployment path/timer and receiver and set
both env flags to false. Do not interrupt an active switch casually; inspect
its checkpoint first. Public Nginx serving is independent. Static rollback
and database recovery remain in [the deployment runbook](deployment.md).

## Validation tools and evidence

- `node --test tests/incremental-deployment.test.mjs tests/admin-release.test.mjs
  tests/deployment-contract.test.mjs` covers signatures, durable delivery,
  exact-main verification, latest workflow attempts, supersession, deadlines,
  failures, immutable file reuse, permissions and content cache dependencies.
- `node scripts/check-incremental-build.mjs 2` performs clean/cached/clean
  builds and compares every static file. It requires actual cache-hit logs.
- `scripts/accept-incremental-linux.mjs` refuses to run outside an owned
  `/tmp/moriium-incremental-acceptance-*` Linux source copy. It compares content
  edits, metadata edits, addition and removal with clean output, then checks
  independent Nginx after stopping only its own Node child.
- `scripts/check-deploy-driver-linux.mjs` runs the real Bash driver in an
  owned `/var/www/moriium-driver-acceptance-*` fixture with synthetic content
  and service/network shims. Build failure, unverified switch, successful
  activation, failure after readiness, and process-group termination all
  passed. No production service is stopped by this fixture.
- The first isolated VPS run completed 20 unchanged warm samples: 676 static
  files matched clean output, all three article routes were restored, and
  warm build p95 was 7.36 s. Its clean build was 8.03 s. Twelve public routes
  remained 200 with the isolated Node stopped. These are build/isolation
  measurements, not push-to-production acceptance.
- Content-body edits, title edits, article addition and removal also produced
  identical cached and forced-clean static output in the isolated VPS copy.
  Final local `pnpm verify` passed: 421 tests, 416 passed, no failures,
  four skipped and one todo. The final Linux deployment subset passed 46 of
  47 tests with one skip. Public-tree and history privacy audits, links and
  Public/Admin isolation checks passed locally.
- The earlier backlog/usage commit `405a9f8` passed GitHub CI in approximately
  45 s ([run 38207729636](https://github.com/Morii9961/Moriium/actions/runs/38207729636)).
  This is evidence for that commit only, not the later automation code.

Upstream contracts: [signed delivery validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries),
[asynchronous webhook handling](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks),
[workflow run metadata](https://docs.github.com/en/rest/actions/workflow-runs), and
[Astro incremental builds](https://docs.astro.build/en/reference/experimental-flags/incremental-build/).
The conditional CI cancellation uses GitHub's supported
[concurrency expressions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
and [workflow contexts](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts).
