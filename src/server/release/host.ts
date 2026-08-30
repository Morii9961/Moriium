// The three effects a release needs that a unit test must not perform:
// running a command, replacing the `current` symlink, and asking the live site
// whether it is actually serving.
//
// They are behind one small interface so src/server/release/release.ts can be
// tested for failure ordering with a fake -- which is the part of this block
// the acceptance criteria are about. What is left here is deliberately thin:
// every branch worth testing lives in the state machine, not in this file.

import { spawnSync } from 'node:child_process';
import { lstatSync, readlinkSync, renameSync, rmSync, symlinkSync } from 'node:fs';
import { AdminError } from '../errors.ts';

export type ReleaseHost = {
  /** Runs a command and throws unless it exits zero. */
  run(command: string, args: readonly string[], cwd: string): void;
  /** What `current` points at, or null when it does not exist yet. */
  linkTarget(link: string): string | null;
  /** Replaces `current` with a link to `target` in one step. */
  switchLink(link: string, target: string): void;
  /** Throws unless the URL answers with a 2xx. */
  probe(url: string): Promise<void>;
};

export const PROBE_TIMEOUT_MS = 12_000;

export function nodeReleaseHost(): ReleaseHost {
  return {
    run(command, args, cwd) {
      // shell: false. Nothing in a release comes from an author, but a release
      // script that interpolates into a shell is one bad path away from being
      // the most privileged injection point on the machine.
      //
      // The cost is that `pnpm` is not spawnable this way on Windows, where it
      // exists as pnpm.cmd. Releases run on Linux (ADR 0002 section 15), and
      // adding a shim for a platform this never runs on would trade a real
      // security property for a convenience nobody needs.
      const result = spawnSync(command, [...args], { cwd, encoding: 'utf8', shell: false });
      if (result.error) {
        throw new AdminError('release-failed', `${command} could not be started.`, {
          cause: result.error,
        });
      }
      if (result.status !== 0) {
        const detail = (result.stderr || result.stdout || '').trim().split('\n').slice(-5).join('\n');
        throw new AdminError(
          'release-failed',
          `${command} ${args.join(' ')} exited ${result.status ?? 'on a signal'}.${detail ? `\n${detail}` : ''}`,
        );
      }
    },

    linkTarget(link) {
      try {
        if (!lstatSync(link).isSymbolicLink()) {
          throw new AdminError('release-failed', 'The current path is not a symbolic link.');
        }
        return readlinkSync(link);
      } catch (cause) {
        if (cause instanceof AdminError) throw cause;
        return null;
      }
    },

    /**
     * Replaces the link by renaming a second link over it.
     *
     * POSIX rename is atomic, so a reader's request resolves either to the old
     * release or the new one and never to a missing path. Removing and
     * recreating the link would open a window where the site is a 404, which is
     * the one outcome a release must not produce.
     */
    switchLink(link, target) {
      const staged = `${link}.next`;
      rmSync(staged, { force: true });
      symlinkSync(target, staged);
      renameSync(staged, link);
    },

    async probe(url) {
      const response = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new AdminError('release-failed', `${url} answered ${response.status}.`);
      }
      // The body is read and discarded so the connection closes cleanly rather
      // than being aborted mid-response.
      await response.arrayBuffer();
    },
  };
}
