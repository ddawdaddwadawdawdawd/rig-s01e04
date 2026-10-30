import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const dirs: string[] = [];
function tempRuns(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe('readNight', () => {
  it('summarizes the real fixture while counting its truncated line', () => {
    const digest = readNight('runs', '2026-10-28');
    expect(digest?.badLines).toBe(1);
    expect(digest?.rows.map((row) => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(digest?.rows.find((row) => row.job === 'fixtures/refresh')).toMatchObject({
      owner: 'rook', runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503',
      firstTime: '2026-10-29T01:30:00+01:00', lastTime: '2026-10-29T01:37:00+01:00',
    });
    expect(digest?.rows.find((row) => row.job === 'lane/sync')).toMatchObject({ runs: 8, retries: 1, lastStatus: 'ok' });
    expect(digest?.rows.find((row) => row.job === 'notes/backup')).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
    expect(digest?.rows.find((row) => row.job === 'digest/render')?.owner).toBeNull();
  });

  it('handles missing and empty nights', () => {
    const dir = tempRuns();
    expect(readNight(dir, '2026-10-28')).toBeNull();
    writeFileSync(join(dir, '2026-10-28.jsonl'), '');
    expect(readNight(dir, '2026-10-28')).toEqual({ rows: [], badLines: 0 });
    expect(readNight(dir, '../outside')).toBeNull();
  });

  it('counts malformed records and keeps later valid records', () => {
    const dir = tempRuns();
    writeFileSync(join(dir, '2026-10-28.jsonl'), [
      '{broken',
      JSON.stringify({ at: 'first+01:00', job: 'b', status: 'retry', owner: null, error: 'busy' }),
      JSON.stringify({ at: 'second+01:00', job: 'b', status: 'ok', owner: 'rook' }),
      JSON.stringify({ at: 'third+01:00', job: 'a', status: 'fail', owner: 'rook', error: 'nope' }),
      JSON.stringify({ at: 'fourth+01:00', job: 'bad', status: 'unknown', owner: 'rook' }),
      '',
    ].join('\n'));
    expect(readNight(dir, '2026-10-28')).toEqual({
      badLines: 2,
      rows: [
        { job: 'a', owner: 'rook', runs: 1, retries: 0, lastStatus: 'fail', lastError: 'nope', firstTime: 'third+01:00', lastTime: 'third+01:00' },
        { job: 'b', owner: 'rook', runs: 2, retries: 1, lastStatus: 'ok', lastError: 'busy', firstTime: 'first+01:00', lastTime: 'second+01:00' },
      ],
    });
  });
});
