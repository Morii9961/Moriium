// Runs the quarterly database restore drill from a supplied off-site copy.
//
// This command is deliberately incapable of replacing MORIIUM_DATABASE_PATH.
// It works in a new temporary directory, first proves a corrupted control is
// rejected, then verifies a persistent read/write cycle and prints measured
// elapsed time (ADR 0002 section 11.4).
//
//   node scripts/drill-database-restore.mjs --backup /mnt/offsite/admin.db
//   node scripts/drill-database-restore.mjs --backup ./admin.db --keep

import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { describeForLog } from '../src/server/errors.ts';
import { drillDatabaseRestore } from '../src/server/backup/restore-drill.ts';

export function parseRestoreDrillCommand(args) {
  let backup = '';
  let parent;
  let keepWorkspace = false;

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--keep') {
      keepWorkspace = true;
      continue;
    }
    if (flag !== '--backup' && flag !== '--parent') {
      throw new Error('Usage: node scripts/drill-database-restore.mjs --backup <file> [--parent <directory>] [--keep]');
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${flag} needs a value.`);
    if (flag === '--backup') backup = value;
    else parent = value;
    index += 1;
  }

  if (!backup) throw new Error('--backup is required.');
  return { backup, parent, keepWorkspace };
}

export async function main(args = process.argv.slice(2)) {
  const command = parseRestoreDrillCommand(args);
  const result = await drillDatabaseRestore(command);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (entryUrl === import.meta.url) {
  try {
    await main();
  } catch (error) {
    console.error(describeForLog(error));
    process.exitCode = 1;
  }
}
