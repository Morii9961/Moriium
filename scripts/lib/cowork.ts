import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Cowork is the desktop app's local agent mode, and it runs Claude Code underneath.
 * Each task gets its own private CLAUDE_CONFIG_DIR, so its transcripts never reach
 * `~/.claude/projects` and the ordinary ccusage run cannot see a single one of them.
 * Pointing the same pinned tool at each task directory keeps deduplication, cumulative
 * deltas and the token contract in ccusage's hands rather than in a second parser here.
 */

/** The desktop app renamed this store once without migrating; both names still exist. */
const STORES = ['local-agent-mode-sessions', 'claude-code-sessions'] as const;
const MAX_DEPTH = 6;

function coworkRoots(): string[] {
  const base = process.platform === 'win32'
    ? join(process.env.APPDATA ?? join(homedir(), 'AppData/Roaming'), 'Claude')
    : process.platform === 'darwin'
      ? join(homedir(), 'Library/Application Support/Claude')
      : join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'Claude');
  return STORES.map((store) => join(base, store));
}

async function hasTranscript(projects: string): Promise<boolean> {
  for (const entry of await readdir(projects, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue;
    const files = await readdir(join(projects, entry.name)).catch(() => []);
    if (files.some((file) => file.endsWith('.jsonl'))) return true;
  }
  return false;
}

/** Config directories to pass as CLAUDE_CONFIG_DIR, one per task that actually recorded usage. */
export async function coworkConfigDirs(): Promise<string[]> {
  const found: string[] = [];
  const visit = async (dir: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH) return;
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory()) continue;
      const path = join(dir, entry.name);
      // A task's own store: claim it and never descend into its transcripts.
      if (entry.name === '.claude') {
        if (await hasTranscript(join(path, 'projects'))) found.push(path);
        continue;
      }
      await visit(path, depth + 1);
    }
  };
  for (const root of coworkRoots()) await visit(root, 0);
  return found.sort();
}
