# Codex token collection reference

This reference separates the public account series from local token components.
Use [activity operations](activity.md) to refresh data and the
[Runtime handoff](handoff-2026-10-18-token-collection-to-enouia-runtime.md) to plan adoption.

## Sources and coverage

| Source | Data | Date boundary | Role |
| --- | --- | --- | --- |
| Codex `account/usage/read` | `dailyUsageBuckets[{startDate,tokens}]`, optional lifetime summary | Provider dates; public label `Codex` | Existing public calendar |
| Local Codex rollouts | `event_msg` / `token_count` / `info` counters | Event timestamp, audit buckets in UTC | Offline component audit |
| Claude Code / local Cowork | Pinned ccusage daily report | `Asia/Shanghai` | Existing Claude public calendar |

The account response exposes no input/output/cache split. Its lifetime checksum
checks internal consistency, not cache inclusion, retention or device coverage.
On 2026-10-18 its total was 3,725,297,924 tokens. A separate local audit observed
3,399,567,995 tokens, including 3,230,672,140 cached input tokens. These scopes and
cutoff times differ. Their scale is consistent with account totals including cached
work; it provides no basis for adding cached tokens to the account series.

Local records cover retained history in the selected `CODEX_HOME`. They may omit
cloud work, other machines, deleted sessions or calls that did not record usage.
The home may contain history from multiple signed-in accounts; this audit does not
read identity or authentication files to assign records to the current profile.
Neither source is a bill or a quota counter. Missing usage remains unknown.

The full local audit covers valid events from 2026-06-03 through 2026-10-18, across
77 recorded UTC dates. It has no one-week or rolling-window filter. The preserved
account series starts on 2026-05-12. A separate sum of deduplicated last-call counters
gave 3,399,324,505 tokens; the 243,490-token difference comes from a cumulative gap on
2026-07-22. Cached reads are approximately 95.03% of the local cumulative-delta total.
These measurements came from the scan started at 2026-10-18T14:10:31.770Z; the latest
observed event was at 14:10:41.179Z. Active history continues to grow after this snapshot.

## Token formulas

For supported local Codex records:

```text
total_tokens = input_tokens + output_tokens
cached_input_tokens and cache_write_input_tokens are components of input_tokens
reasoning_output_tokens is a component of output_tokens
uncached input = input_tokens - cached_input_tokens - cache_write_input_tokens
```

The audit requires nonnegative safe integers, reconciles totals and rejects counters
whose cache components exceed input or whose reasoning exceeds output. Missing
legacy cache-write/reasoning fields default to zero; invalid records are counted in
diagnostics. This is the supported local format, not a guarantee for future versions.
OpenAI's [usage documentation](https://developers.openai.com/api/docs/guides/agents-api/observability)
also describes cached input and reasoning as subsets, but does not define the
account endpoint's daily metric.

Claude's pinned report uses a different normalization:

```text
totalTokens = inputTokens + cacheReadTokens + cacheCreationTokens + outputTokens
```

Here `inputTokens` is non-cached input. Reasoning is already part of output.
Adding Claude-style cache components to Codex's inclusive input would double count.

## Local audit procedure

Run `pnpm activity:codex-local` with Node 24 supporting
[`createZstdDecompress`](https://nodejs.org/api/zlib.html#zlibcreatezstddecompressoptions)
(verified here on Node 24.15.0). No dependency is added.

1. Resolve `CODEX_HOME`, or `~/.codex`, and scan only `sessions/` and
   `archived_sessions/`. Read `.jsonl` and stream-decompress `.jsonl.zst` in memory.
   If both extensions exist for the same path, prefer the plain file.
2. Retain only session identity/creation metadata and token counters in memory.
   Ignore conversation bodies, tool arguments, credentials and unrelated databases.
3. Group resumed files by `session_meta.payload.id` and sort usage events by timestamp.
   Exclude a child's inherited events dated before its creation. Remove duplicate
   events and consecutive repeated cumulative counters.
4. Count the first explicitly reported `last_token_usage`. If the first cumulative
   total is larger, report an initial gap rather than assigning old usage to that day.
5. For later events, use a valid nonnegative difference of cumulative counters.
   Report a gap if that total differs from the last-call total. If counters decrease
   or their difference is inconsistent, count only `last_token_usage`, report the
   rollback and establish the new baseline. Do not sum lifetime totals per event.
6. Group increments by UTC date and write only allowlisted counters and diagnostics
   to `.cache/activity-codex-local.json`. No session IDs, account IDs, filenames,
   paths, titles, models, prompts or raw responses enter the report.

The report includes the earliest/latest counted events and a full-history
`crossCheck` of deduplicated last-call totals against cumulative deltas. A difference
is visible rather than silently choosing whichever method produces a larger figure.

The report's `basis` is `codex-local-observed-v1`, with coverage
`local-retained-history`. It is deliberately **not** ActivityData v1. The report
does not modify the public snapshot or participate in hourly collection/upload.

## Incomplete history and failures

Malformed JSON and invalid token events are counted and skipped. Unreadable
directories, stream/decompression errors, unsafe aggregate sums and an absence of
usable events fail the audit with a path-free message. A failed run leaves the
previous report in place; inspect its collection timestamp before reuse.

The 2026-10-18 audit read 254 plain and 564 compressed files and reported 15 malformed
lines, 262 invalid events, 41 counter rollbacks, one counter gap and two initial gaps.
Inspected invalid examples had a last-call placeholder whose `total_tokens` was nonzero
while all its component counters were zero; the audit does not invent a cache split
for those placeholders.
The audit is therefore partial. Counter rollback fallback cannot reconstruct lost
calls; inherited history without usable provenance and same-timestamp divergent
events can remain ambiguous. Node's streaming decoder can accept some truncated
prefixes, and active logs can change during a scan. A successful command does not
prove complete history or a coherent instant across files.

Preserve these limitations in downstream reports. Runtime should eventually retain
validated per-event evidence privately and track parser version, provenance,
deduplication and completeness separately from public daily values. Such a ledger
is future work, not implemented by this audit.

## Public refresh and verification

`pnpm activity:refresh codex` still reads the account series through the installed
CLI. `MORIIUM_CODEX_CLI` selects a compatible executable; never pin a workstation's
versioned application path in source. The CLI owns authentication. The buckets must
sum safely and reconcile with any valid lifetime summary before import.

`pnpm activity:refresh claude` reads the pinned ccusage report and discovered local
Cowork stores. Retain higher archived Claude day totals if transcripts were pruned.
For either source, preserve previous data on failure and retain earlier dates.

Keep account and local Codex histories separate. Replacing the public source needs
an explicit basis/timezone migration and coordinated Runtime/Moriium validation;
adding the two totals, choosing daily maxima, or relabelling UTC dates `Codex` is
invalid. Public v1 continues to expose only the existing three sources and daily
`{date,value}` aggregates. Activity remains outside Memory, Context and Vault.
