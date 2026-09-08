# About-page activity calendars

The three calendars show GitHub contributions, account-side Codex activity and
Claude Code usage retained on Morii's computer, including local Cowork tasks.
Only daily aggregates enter the site. No visitor tracking, public API, database
or client framework is added.

## Refresh the data

Requirements: Node 24, npm, and GitHub CLI authenticated as Morii9961. Alternatively,
provide `GITHUB_TOKEN` or `GH_TOKEN` through the local environment. Never put a
credential in a command argument, a source file or a browser request.

From the repository root, cache the pinned tool once:

```powershell
npm exec --yes --offline=false --cache .cache/npm-activity --package=ccusage@20.0.20 -- ccusage --version
```

Then collect and build:

```powershell
pnpm activity:collect
pnpm build
```

To refresh one source, use `pnpm activity:collect github`, `codex`, or `claude`.
Claude Code is read from local logs with ccusage's offline mode. Codex is read from
its own app-server; `MORIIUM_CODEX_CLI` may point at a specific `codex` executable.
GitHub uses the official GraphQL contribution calendar and the existing GitHub CLI login.
It writes `src/data/activity.json` atomically, retaining each failed source's
previous snapshot and returning a nonzero exit status on any failure. CLI error
output is suppressed because it can contain private paths or report fragments.

If the collector fails, check that the pinned tool is cached and that
`gh auth status` succeeds. A restricted environment can prevent child processes
or network access; rerun the same collector in a permitted local terminal.
For a separately installed copy, `MORIIUM_CCUSAGE_CLI` may point to its
`ccusage/src/cli.js`; the collector verifies the package name and exact version.

Collection is deliberately separate from `build`. CI and the VPS cannot read
this computer's logs. The site builds from the last reviewed JSON snapshot even
when GitHub or the local tools are unavailable. Refreshing does not commit,
push, deploy, create a scheduled job or upload raw logs.

## Keep it current

The page is a build-time snapshot and cannot be live: two of the three sources exist
only on this computer, so no amount of server rendering would reach them. Freshness is
therefore bounded by how often this computer collects and the site is rebuilt, and each
calendar prints its own collection timestamp so the delay is visible rather than implied.

`pnpm activity:refresh [source]` is the routine. It runs the collector, prints how many
days and tokens each source gained, warns if the archive lost recorded days, and copies
the snapshot to `../Moriium_ActivityArchive/activity-<date>.json`
(`MORIIUM_ACTIVITY_ARCHIVE` moves it). That directory is the backup of the archive of
record; its `README.md` explains each file. It stays outside the repository and is never
committed.

Daily is the right cadence: the sources publish nothing finer than a day, and the
current day is always incomplete. A fixed clock alone is the wrong trigger, though,
because the machine is not always on. Register two triggers. The nightly one collects
the day that is ending; the logon one catches up whatever was missed while the computer
was off, and waits fifteen minutes first, because nothing new has been written at the
moment of logon and the boot should not compete with a collection.

The task runs with no console. `S4U` gives it a non-interactive session, so no window
appears; that is also why the run log matters, since nothing else would surface a
failure.

```powershell
$action = New-ScheduledTaskAction -Execute 'C:\Program Files\nodejs\node.exe' -Argument 'scripts\refresh-activity.mjs' -WorkingDirectory 'E:\Moriium'
$logon = New-ScheduledTaskTrigger -AtLogOn
$logon.Delay = 'PT15M'
$nightly = New-ScheduledTaskTrigger -Daily -At 23:30
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U
Register-ScheduledTask -TaskName 'Moriium activity refresh' -Action $action -Trigger @($logon, $nightly) -Settings $settings -Principal $principal
```

Verify the first run in `refresh.log` rather than assuming it worked. A non-interactive
session has no desktop and a slightly different environment, so if `gh` or `codex` cannot
authenticate there, re-register with `-LogonType Interactive` and accept a brief window.

A missed day is recoverable as long as its source still remembers it, and all three
now do: Claude Code retains transcripts for 3650 days, GitHub's calendar answers for a
year, and Codex appears to return the account's whole history rather than a window —
its earliest bucket, the earliest local session directory and `~/.codex/installation_id`
all fall on 2026-05-12. That last point is inference from three coinciding markers, not
a documented guarantee, so long silences remain the one real risk.

There is no version of this that runs without the computer. Claude Code's usage exists
only in local transcripts; no scheduler elsewhere can reach it. Codex is server-side and
could in principle be read from anywhere, but only by handing its login to that other
place, which buys a heatmap with a credential that can spend the account's quota. Do not.

Publishing stays a separate, deliberate act: `pnpm build`, then the ordinary release.
No scheduled job commits, pushes or deploys, and none may be added without Morii asking
for it.

## Meaning of the numbers

- GitHub: daily contribution counts and dates returned for Morii9961. Visibility
  depends on the authenticated account and GitHub settings; repository names and
  contribution details are never requested.
- Every AI figure on the page is a cache-inclusive total: non-cached input + cache read
  + cache creation + output. Non-cached-only totals are one to two orders of magnitude
  smaller, so the two units must never share a chart. Neither is quota use or a bill.
- Codex: the account's own token activity, read from the Codex app-server's
  `account/usage/read`. It is server-side, so the iOS app, Codex Cloud and every other
  surface count, not just this computer. The buckets carry the server's day boundaries,
  recorded as the `Codex` timezone rather than relabelled `Asia/Shanghai`, and the source
  offers no input/output/cache split. The importer refuses a page whose buckets do not
  add up to the reported lifetime total. The request goes through the app-server so the
  CLI keeps its own credentials; this repository never handles a bearer token.
- Claude Code: the pinned ccusage daily reports in `Asia/Shanghai`. Reasoning output is
  already part of output and is not added again. Local logs only, so anything run on
  another device is invisible.
- Claude Code covers Cowork as well. Cowork is the desktop app's local agent mode and
  runs Claude Code under a private `CLAUDE_CONFIG_DIR` per task, so its transcripts
  never reach `~/.claude/projects`. `scripts/lib/cowork.ts` finds those task stores and
  the collector runs the same pinned tool once per store, summing the days. The stores
  hold disjoint conversations, so ccusage's per-run deduplication is enough; it matters,
  because the raw rows trebled the total in a hand check. Remote Cowork sessions run in
  Anthropic's cloud, leave nothing on this computer and are therefore never counted.
- Explicit source zeroes use the zero-value fill. Missing records have dotted
  outlines and never become zeroes. Future dates and cross-year padding have faint
  solid outlines without date interaction. Previously collected values survive
  later log cleanup.
- `src/data/activity.json` is the archive of record, not a cache of the last year.
  Collected days are kept from 2026-01-01 onward and none is ever dropped for age.
  Every source deletes its own logs eventually, so a day discarded here cannot be
  collected a second time. GitHub's required one-year query currently reaches before
  that floor, so those retrievable pre-2026 rows may remain in the snapshot but are
  not presented. The one-year window otherwise survives only at that query boundary.
- The page renders complete natural years from 2026 through the build year. Every
  calendar runs from January 1 through December 31; dates later in the current year
  are present as zero. Each source shows its own collection
  timestamp; retained historical days may come from earlier successful snapshots.

The adapter rejects unexpected report shapes, duplicate dates and inconsistent
totals. ccusage owns raw-log deduplication, cumulative-token deltas and inherited
subagent-history handling. An upstream format change requires a fixture review
before changing the pin; do not blindly upgrade the parser.

## Presentation and checks

`AboutActivity.astro` loads validated data at build time. `ActivityHeatmap.astro`
renders one complete natural-year calendar per source and year. A native year selector is
revealed only when its small page-scoped script can switch the view; without
JavaScript every year and every static daily table remains available. The same
script adds date selection, pointer inspection and arrow-key navigation. Mobile
splits each calendar at a week boundary into two consecutive halves. Both AI
sources use the same numeric scale.

Run `node --test tests/activity.test.mjs`, `pnpm check`, `pnpm test`, `pnpm build`,
`pnpm links`, and `pnpm split`. Check all three languages, both themes and widths
375, 390, 768, 1024 and 1440. Serve the static client output with the Node app
stopped to verify the public route has no runtime dependency on the admin.

## Statistics and date boundaries

The current year adds recorded active days in the inclusive 30-day interval ending
on the build date in Asia/Shanghai. This interval may cross New Year; historical
year panels omit it. The disclosure prints the interval and build date alongside
the source collection timestamp. Source day buckets retain their original zones.
A static page keeps these dates until rebuilt; it does not imply live collection.

Year totals and active-day counts include only explicit records on or before the
build date. The active-day average divides that total by days with positive values.
The peak shows the earliest date when multiple days share the maximum. No active
days means no average or peak; no records means a dash rather than an inferred zero.
The current day can be incomplete. These are usage records, not productivity scores.
Keyboard entry starts at the latest recorded day; missing days remain inspectable
as “Not recorded”, while future and padding cells are excluded from selection.

## Sources and reuse

- [Codex app-server](https://developers.openai.com/codex/app-server); run
  `codex app-server generate-json-schema --out <dir>` for the exact request contract
- [ccusage JSON output](https://ccusage.com/guide/json-output)
- [ccusage Codex source](https://ccusage.com/guide/codex/)
- [GitHub contribution calendar schema](https://docs.github.com/en/graphql/reference/users#contributioncalendar)
- [Astro scripts](https://docs.astro.build/en/guides/client-side-scripts/)

ccusage 20.0.20 is used as an external local tool under its MIT license. No upstream
source, UI or stylesheet is copied into Moriium. Its npm cache remains ignored.
