# Status service operations

This runbook activates the architecture in [ADR 0003](adr-0003-about-status.md).
Deployment, credentials and scheduler registration are separate from a local build.
Do not register either scheduler until its configuration and a manual run succeed.

## VPS layout

Use Node 24. Copy the approved `scripts/`, `src/lib/` and `src/data/` trees into
`/opt/moriium-status`; the publisher and receiver need no npm dependencies. Keep
that code root-owned and read-only for the service account. Do not copy private
posts, CLI logs, authentication files or the repository checkout's ignored files.

Create an unprivileged `moriium-status` account. Both the timer and restricted SSH
receiver run as this account. Keep `/var/lib/moriium-status` mode `0711`, with
private `inbox` mode `0700` and `public` / `public/activity` mode `0750`. Let the
actual Nginx worker account traverse/read only the public directories, using its
group or directory ACLs; private state and locks must remain inaccessible.
Snapshot files use mode `0640`. Verify these permissions as the Nginx worker.

Copy `deploy/status/sites.json` to `/etc/moriium/status-sites.json`. Configure final
HTTPS entry URLs and stable HTML markers for Moriium and Gallery. Enouia uses
the single Enouia Runtime heartbeat entry; there is no separate website probe. `null` disables an unconfigured site;
do not replace it with a guessed address. Keep `runtimeEnabled: false` until the
heartbeat producer exists. Run `node /opt/moriium-status/scripts/status-publish.mjs`
manually as the service account. Repeat after five minutes to confirm a successful
site state. Inspect `public/current.json` and the service exit code.

Install the provided `moriium-status.service` and `.timer` units. They run a oneshot
publisher every minute (site probes remain five minutes apart) without introducing a resident reader backend. After
manual acceptance, enable the timer and inspect `systemctl status` and
`journalctl -u moriium-status.service`. A timeout or disk failure must not be called
a successful refresh. Schedule cadence is not a guarantee of data freshness.

## Restricted SSH receiver

Use a dedicated upload key on the workstation. Add its public key to this service
account's authorized keys with these options (substitute the actual key material):

```text
restrict,command="/usr/bin/node /opt/moriium-status/scripts/status-receive.mjs" <public key>
```

The receiver accepts stdin, never interprets `SSH_ORIGINAL_COMMAND`, and writes
only the inbox. Disable password login for this dedicated account. Configure an
SSH alias named `moriium-activity-upload` on Windows with its specific identity,
`IdentitiesOnly yes`, and a verified host key. The sync client requires strict host
key checking and batch mode. Do not reuse an unrestricted deployment identity.

## Nginx

The added locations in `deploy/nginx/moriium.conf` map only `current.json` and
hexadecimal SHA-256 activity filenames. Other `/status-data/` paths return 404.
The current file expires immediately and supports revalidation; activity objects
have a one-year lifetime. Security headers continue to inherit from the server.
Run `nginx -t` before reloading. Verify public JSON can be read but `state.json`,
`runtime.json`, inbox files, locks and traversal paths cannot.

The public output remains independent of the author Node process. In a test
environment, stop that process and verify all three About routes plus JSON return
200 through Nginx. Stop the publisher too: after fifteen minutes, site status must
be unknown even when Nginx still returns the last JSON with status 200.

## Workstation

Prepare a persistent local data directory and a `config.json` containing:

```json
{ "sshAlias": "moriium-activity-upload" }
```

Set `MORIIUM_ACTIVITY_WORK` to that directory. Configure `MORIIUM_CODEX_CLI` with
the actual Codex executable and `MORIIUM_CCUSAGE_CLI` with the locally cached
`ccusage@20.0.20` CLI. The collector verifies that exact package version. Keep
GitHub CLI and Codex signed in within this workstation's interactive session.

Run `pnpm activity:sync` manually. It creates a local activity archive, a monotonic
sequence and a pending upload. A partial collector failure remains publishable
only if a complete per-source result report was produced. On transport failure,
the exact pending batch is retried first next time. Raw CLI error output is not
included in public files or sync logs.

Verify the received batch appears in the next published manifest, and that the
referenced activity hash and per-source timestamps agree. Only then run
`deploy/windows/register-activity-sync.ps1` with `-Repository`, `-DataDirectory`,
`-CodexExecutable` and `-CcusageCli`. It requires PowerShell 7, runs hidden in the
logged-in user's session, waits fifteen minutes after logon, repeats hourly and
ignores overlapping runs. It does not overwrite an existing task automatically.
The wrapper appends sanitized results to `sync.log`; collection archives keep
their own `refresh.log`.

The manual `activity:refresh` command still updates the checked-in snapshot. Its
`MORIIUM_ACTIVITY_OUTPUT` override is for the unattended workflow. Never configure
both writers against the same data file.

## Recovery and retention

- Keep the workstation's sequence, activity snapshot and archive together. Never
  reset its counter to zero while the server retains higher accepted sequences.
- Receiver and publisher locks fail closed. After a crash, stop the relevant
  scheduler, verify its PID is no longer a writer, then remove only its abandoned
  lock. Do not routinely delete or automatically steal locks.
- The publisher retains roughly ninety days of private observations and events.
  Immutable public activity objects are retained for cached-reader compatibility;
  back them up and monitor storage. V1 does not automatically garbage-collect them.
- A refused archive regression requires inspecting the local archive. Do not
  bypass it by deleting server state. Preserve the last public version while
  recovering the missing days or correcting clock/configuration errors.
- Restoring code does not restore data. Back up the service data directory and the
  workstation archive separately; keep private backup data outside public roots.
- To pause automation, disable the Windows task and stop the VPS timer. Retain
  files so the page can show the last snapshot and its expired timestamp.

## Future Runtime adapter

The Runtime process will atomically replace private
`/var/lib/moriium-status/runtime.json`, for example:

```json
{ "version": 1, "observedAt": "2026-09-13T00:00:00.000Z", "state": "waiting" }
```

Use an actual current UTC time on every heartbeat. Allowed states are `waiting`,
`running`, `paused`, `degraded`. Heartbeats should arrive every minute and expire
after three minutes. Extra fields are never copied to public output. Set file ACLs
so the Runtime can write this one report without writing the publisher's state or
public files. The Runtime itself is outside this implementation.
