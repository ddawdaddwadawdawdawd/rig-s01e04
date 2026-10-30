import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const dirs: string[] = [];
function appWithRuns(lines: string | null) {
  const runsDir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
  dirs.push(runsDir);
  if (lines !== null) writeFileSync(join(runsDir, '2026-10-28.jsonl'), lines);
  return createApp({ adapter: 'shim', installed: 'test', beatEverySeconds: 60, runsDir });
}
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe('digest routes', () => {
  it('shows the same jobs in the same order in HTML and JSON', async () => {
    const app = appWithRuns([
      JSON.stringify({ at: 'later+01:00', job: 'z-job', status: 'retry', owner: null, error: 'busy' }),
      JSON.stringify({ at: 'earlier+01:00', job: 'a-job', status: 'fail', owner: 'rook', error: 'full' }),
      JSON.stringify({ at: 'last+01:00', job: 'z-job', status: 'ok', owner: null }),
      '{broken',
    ].join('\n'));
    const page = await app.request('/digest/2026-10-28');
    const json = await app.request('/api/digest/2026-10-28');
    const html = await page.text();
    const rows = await json.json() as { job: string }[];

    expect(page.status).toBe(200);
    expect(json.status).toBe(200);
    expect(rows.map((row) => row.job)).toEqual(['a-job', 'z-job']);
    expect(html.indexOf('<td>a-job</td>')).toBeLessThan(html.indexOf('<td>z-job</td>'));
    expect(html).toContain('1 malformed line skipped');
    expect(html).toContain('<td>—</td>');
  });

  it('returns 404 for a missing night and renders an empty night', async () => {
    const app = appWithRuns('');
    expect((await app.request('/digest/2026-10-27')).status).toBe(404);
    expect((await app.request('/api/digest/2026-10-27')).status).toBe(404);
    const empty = await app.request('/digest/2026-10-28');
    expect(empty.status).toBe(200);
    expect(await empty.text()).toContain('nothing ran');
    const json = await app.request('/api/digest/2026-10-28');
    expect(json.status).toBe(200);
    expect(await json.json()).toEqual([]);
  });
});
