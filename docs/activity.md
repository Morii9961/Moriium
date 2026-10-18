# About-page activity calendars

The three calendars show GitHub contributions, account-side Codex activity and
Claude Code usage retained on Morii's computer, including local Cowork tasks.
Codex also has a separate offline audit of retained local token counters. It
exposes cache components without changing the public calendar's source or dates.
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

To inspect Codex's local cache breakdown, run `pnpm activity:codex-local`. This
reads `.jsonl` and `.jsonl.zst` under `CODEX_HOME` (default `~/.codex`), including
archived sessions. It writes only aggregate counters and diagnostics to the ignored
`.cache/activity-codex-local.json`; it does not update or upload the public snapshot.
See [the token collection reference](codex-token-collection.md) for formulas,
deduplication, coverage limits and the Runtime migration contract.

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

The initial page is a build-time snapshot. The optional workflow in
[ADR 0003](adr-0003-about-status.md) collects on this computer and uploads only
daily aggregates to the static status publisher. When that workflow is deployed,
the About page refreshes the calendars from a versioned JSON file without a site
rebuild. Without JavaScript or a valid public update, the build snapshot remains
readable. Each calendar retains its own collection timestamp.

`pnpm activity:refresh [source]` is the routine. It runs the collector, prints how many
days and tokens each source gained, warns if the archive lost recorded days, and copies
the snapshot to `../Moriium_ActivityArchive/activity-<date>.json`
(`MORIIUM_ACTIVITY_ARCHIVE` moves it). That directory is the backup of the archive of
record; its `README.md` explains each file. It stays outside the repository and is never
committed.

The approved unattended workflow collects hourly while the workstation is logged
in, with a delayed logon catch-up. It uses a separate data directory, archive and
sequence, and a hidden PowerShell wrapper. The registration script and acceptance
steps are in [status operations](status-operations.md). Do not also schedule the
manual collector against that same data file. A scheduled task's existence does
not prove that its credentials or upload work: inspect its first run.

A missed day is recoverable while its source retains the necessary records.
GitHub's query covers one year; local transcript retention and the account endpoint's
history may change. Compressed Codex rollouts remain usable without unpacking them
onto disk. Preserve successful aggregates even when upstream history shrinks.

Claude Code collection and the Codex local audit need access to this computer's
retained logs. Keep collection on the workstation and upload only approved daily
aggregates. Account-side Codex collection delegates authentication to the installed
CLI; deployment and CI must never receive its login files.

Manual publishing remains `pnpm build`, followed by the ordinary release. Morii has
approved implementing a separate hourly aggregate upload and a one-minute status
publisher with five-minute site probes. Their deployment and scheduler registration are still separate steps;
see [status operations](status-operations.md). Neither workflow commits or pushes
code, and the automated uploader does not deploy the site.

## Meaning of the numbers

- GitHub: daily contribution counts and dates returned for Morii9961. Visibility
  depends on the authenticated account and GitHub settings; repository names and
  contribution details are never requested.
- Token counts, quota percentages and bills are distinct measures. Claude's cache
  fields are separate components; Codex local cache fields are subsets of input.
  Their formulas cannot be interchanged. Account-side Codex buckets have no component
  breakdown; do not label their cache semantics as an API guarantee.
- Codex: the account's own token activity, read from the Codex app-server's
  `account/usage/read`. It can cover work beyond locally retained logs, but complete
  cross-device coverage is not established by this response. The buckets carry the server's day boundaries,
  recorded as the `Codex` timezone rather than relabelled `Asia/Shanghai`, and the source
  offers no input/output/cache split. The importer refuses a page whose buckets do not
  add up to the reported lifetime total. The request goes through the app-server so the
  CLI keeps its own credentials; this repository never handles a bearer token.
  The 2026-10-18 local comparison does not support a missing-cache correction:
  cached input dominates local usage, and account totals are of the same scale as
  local cache-inclusive totals. This is evidence from this installation, not a
  documented definition of `dailyUsageBuckets.tokens`. Never add local cache counts
  to account totals or take a per-day maximum across their different day boundaries.
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
  On Windows, the Microsoft Store build may keep these stores under
  `%LOCALAPPDATA%\Packages\Claude_<package-id>\LocalCache\Roaming\Claude` instead of
  `%APPDATA%\Claude`; the collector searches both. If older transcripts are pruned,
  the highest previously archived Claude daily total is retained.
- [Claude Design](https://support.claude.com/en/articles/14604416-get-started-with-claude-design)
  shares Claude's usage limit. Work done through Claude Code's `/design`
  can contribute to the Claude Code calendar, but this local transcript total cannot
  identify Design as a separate product. The standalone `claude.ai/design` browser or
  desktop cache is not a verified source of daily token totals for this calendar.
- Elapsed dates without source records display and count as zero. Cross-year
  padding follows its adjacent region: zero fill at the start, and faint outlines
  at the end while the year is still in progress. Future dates retain faint solid
  outlines and cannot be selected. Neither state adds a legend label. Previously collected values
  survive later log cleanup.
- `src/data/activity.json` is the manual archive and build fallback, not a cache of the last year.
  Unattended collection retains a separate persistent archive; preserve both and
  initialize any replacement from the latest complete archive.
  Collected days are kept from 2026-01-01 onward and none is ever dropped for age.
  Every source deletes its own logs eventually, so a day discarded here cannot be
  collected a second time. GitHub's required one-year query currently reaches before
  that floor, so those retrievable pre-2026 rows may remain in the snapshot but are
  not presented. The one-year window otherwise survives only at that query boundary.
- The page renders complete natural years from 2026 through the build year. Every
  calendar runs from January 1 through December 31; dates later in the current year
  are present as zero. Each source shows its own collection
  timestamp; retained historical days may come from earlier successful snapshots.

The public adapters reject unexpected report shapes, duplicate dates and inconsistent
totals. ccusage owns Claude raw-log deduplication. The separate Codex audit reports
malformed rows, invalid counters, repeated events, counter rollbacks and gaps; it is
a best-effort observation of retained history. An upstream format change requires
a fixture review before changing the parser or tool pin.

## Presentation and checks

`AboutActivity.astro` loads validated data at build time. `ActivityHeatmap.astro`
renders one complete natural-year calendar per source and year. A native year selector is
revealed only when its small page-scoped script can switch the view; without
JavaScript every year and every static daily table remains available. The same
script adds date selection, pointer inspection and arrow-key navigation. Mobile
splits each calendar at a week boundary into two consecutive halves. Both AI
sources use the same numeric scale.

For collector changes, run the affected tests, including
`node --test --test-isolation=none tests/activity.test.mjs tests/codex-local-usage.test.mjs`,
and check the public allowlist. Shared rendering or release acceptance uses `pnpm verify`.
UI changes additionally check all three languages, both themes and widths 375, 390,
768, 1024 and 1440. Release acceptance proves the public routes work with the author
Node process stopped in an isolated instance; never stop a shared production process.

## Statistics and date boundaries

The current year adds recorded active days in the inclusive 30-day interval ending
on the build date in Asia/Shanghai. This interval may cross New Year; historical
year panels omit it. The disclosure prints the interval and build date alongside
the source collection timestamp. Source day buckets retain their original zones.
A static page keeps these dates until rebuilt; it does not imply live collection.

Year totals and active-day counts cover elapsed dates through the build date;
absent records are treated as zero. The active-day average divides that total by days with positive values.
The peak shows the earliest date when multiple days share the maximum. No active
days means no average or peak; absent records contribute zero.
The current day can be incomplete. These are usage records, not productivity scores.
Keyboard entry starts at the latest recorded day; missing elapsed days remain
inspectable as zero, while future and padding cells are excluded from selection.

## Sources and reuse

- [Codex app-server](https://developers.openai.com/codex/app-server); run
  `codex app-server generate-json-schema --out <dir>` for the exact request contract
- [Codex token collection reference](codex-token-collection.md)
- [Runtime token collection handoff](handoff-2026-10-18-token-collection-to-enouia-runtime.md)
- [ccusage JSON output](https://ccusage.com/guide/json-output)
- [ccusage Codex source](https://ccusage.com/guide/codex/)
- [GitHub contribution calendar schema](https://docs.github.com/en/graphql/reference/users#contributioncalendar)
- [Astro scripts](https://docs.astro.build/en/guides/client-side-scripts/)

ccusage 20.0.20 is used as an external local tool under its MIT license. No upstream
source, UI or stylesheet is copied into Moriium. Its npm cache remains ignored.
