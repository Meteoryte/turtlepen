#!/usr/bin/env node
/** A committed-edit recovery session over TurtlePen's real stdio MCP. */

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { createMcpClient } from './mcp-client.js';

const quiet = process.argv.includes('--quiet');
const cwd = await mkdtemp(resolve(tmpdir(), 'turtlepen-rework-'));
const mcp = createMcpClient({ cwd, createdAt: '2026-08-17T18:00:00.000Z' });

async function call(name, args = {}) {
  const result = await mcp.call(name, args);
  if (result.isError) throw new Error(`${name}: ${result.text ?? result.error}`);
  return result.text;
}

try {
  await mcp.init();
  const help = await call('turtlepen_help', { section: 'all' });
  assert.match(help, /HISTORY AND RECOVERY/);

  await call('new_diagram', {
    name: 'recoverable rework', path: 'rework.turtlepen.json', cols: 40, rows: 20,
  });
  await call('plan', {
    commit: true,
    operations: [
      { op: 'place_box', id: 'supply', at: 'C4.tl', span: { w: 6, h: 3 } },
      { op: 'place_box', id: 'return', at: 'M4.tl', span: { w: 6, h: 3 } },
    ],
  });

  await call('move', { id: 'return', cellsX: -10 });
  const collided = JSON.parse(await call('validate', { format: 'json' }));
  assert.ok(collided.open.some((finding) => finding.rule === 'L001'));

  await call('history', { action: 'undo' });
  const recovered = JSON.parse(await call('validate', { format: 'json' }));
  assert.ok(!recovered.open.some((finding) => finding.rule === 'L001'));

  await call('history', { action: 'redo' });
  assert.ok(JSON.parse(await call('validate', { format: 'json' })).open.some((finding) => finding.rule === 'L001'));
  await call('history', { action: 'undo' });

  const rejected = await mcp.call('move', { id: 'missing', cellsX: 1 });
  assert.equal(rejected.isError, true);
  const beforeOpen = JSON.parse(await call('history', { action: 'status' }));
  assert.equal(beforeOpen.redo_available, 1, 'a rejected command preserves redo');

  const saved = JSON.parse(await readFile(resolve(cwd, 'rework.turtlepen.json'), 'utf8'));
  assert.equal(saved.elements.base.find((element) => element.id === 'return').rect.x, 24);

  await call('open_diagram', { path: 'rework.turtlepen.json' });
  const afterOpen = JSON.parse(await call('history', { action: 'status' }));
  assert.deepEqual({ undo: afterOpen.undo_available, redo: afterOpen.redo_available }, { undo: 1, redo: 1 });
  assert.match(afterOpen.persistence, /restored 1 undo and 1 redo/);

  await call('history', { action: 'redo' });
  const reopenedRedo = JSON.parse(await call('validate', { format: 'json' }));
  assert.ok(reopenedRedo.open.some((finding) => finding.rule === 'L001'));

  if (!quiet) {
    console.log('committed collision: detected');
    console.log('undo -> redo -> undo: geometry and autosave agree');
    console.log('rejected edit: redo preserved');
    console.log('reopen: durable redo restored and applied');
  }
  console.log('rework session passed');
} finally {
  await mcp.close();
  await rm(cwd, { recursive: true, force: true });
}
