import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest, RunStatus } from './types.js';

type RunEvent = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

function parseEvent(line: string): RunEvent | null {
  try {
    const value: unknown = JSON.parse(line);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    const event = value as Record<string, unknown>;
    if (typeof event.at !== 'string' || !event.at ||
        typeof event.job !== 'string' || !event.job ||
        (event.status !== 'ok' && event.status !== 'retry' && event.status !== 'fail') ||
        (event.owner !== null && typeof event.owner !== 'string') ||
        (event.error !== undefined && typeof event.error !== 'string')) return null;
    return event as RunEvent;
  } catch {
    return null;
  }
}

/** Reads one night's JSONL file, retaining valid jobs even when some lines are bad. */
export function readNight(runsDir: string, night: string): NightDigest | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;
  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }

  const byJob = new Map<string, DigestRow>();
  let badLines = 0;
  for (const line of contents.split(/\r?\n/)) {
    if (!line) continue;
    const event = parseEvent(line);
    if (!event) {
      badLines++;
      continue;
    }
    const row = byJob.get(event.job);
    if (row) {
      row.runs++;
      if (event.status === 'retry') row.retries++;
      row.lastStatus = event.status;
      row.lastTime = event.at;
      row.owner = event.owner;
      if (event.error !== undefined) row.lastError = event.error;
    } else {
      byJob.set(event.job, {
        job: event.job,
        owner: event.owner,
        runs: 1,
        retries: event.status === 'retry' ? 1 : 0,
        lastStatus: event.status,
        lastError: event.error ?? null,
        firstTime: event.at,
        lastTime: event.at,
      });
    }
  }
  return { rows: [...byJob.values()].sort((a, b) => a.job.localeCompare(b.job)), badLines };
}
