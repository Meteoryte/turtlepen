import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import * as core from '../src/core/index.js';
import { atomicWriteFile, stageAtomicWrite } from '../src/io.js';
import { createSession, createTools } from '../src/mcp/tools.js';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'turtlepen-atomic-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, path: join(root, 'drawing.turtlepen.json') };
}

test('an interrupted staged write leaves the destination byte-identical', async (t) => {
  const { path } = await fixture(t);
  await writeFile(path, 'original');
  const temp = await stageAtomicWrite(path, 'replacement');
  assert.equal(await readFile(path, 'utf8'), 'original');
  await rm(temp);
});

test('an atomic checkpoint preserves the prior version as a recoverable backup', async (t) => {
  const { path } = await fixture(t);
  const first = await atomicWriteFile(path, 'one');
  const receipt = await atomicWriteFile(path, 'two', { expectedHash: first.hash, backup: true });
  assert.equal(await readFile(path, 'utf8'), 'two');
  assert.equal(await readFile(`${path}.bak`, 'utf8'), 'one');
  assert.equal(receipt.backupPath, `${path}.bak`);
});

test('two sessions cannot silently overwrite each other', async (t) => {
  const { root, path } = await fixture(t);
  const first = createSession({ cwd: root, createdAt: '2026-08-26T00:00:00.000Z' });
  const firstTools = new Map(createTools(first).map((tool) => [tool.name, tool]));
  await firstTools.get('new_diagram').handler({ name: 'shared', path });

  const second = createSession({ cwd: root });
  const secondTools = new Map(createTools(second).map((tool) => [tool.name, tool]));
  await secondTools.get('open_diagram').handler({ path });
  const beforeSecond = core.serialize(second.doc);

  await firstTools.get('place_box').handler({ id: 'first', at: 'A1', span: '4x3' });
  await assert.rejects(
    secondTools.get('place_box').handler({ id: 'second', at: 'J1', span: '4x3' }),
    (error) => error.code === 'E_TURTLEPEN_CONFLICT' && error.retrySafe === true,
  );

  assert.equal(core.serialize(second.doc), beforeSecond);
  const disk = await core.loadDocument(path);
  assert.ok(core.findElement(disk, 'first'));
  assert.equal(core.findElement(disk, 'second'), null);
});

test('save-as refuses to replace an existing target without an explicit new-diagram workflow', async (t) => {
  const { root, path } = await fixture(t);
  const target = join(root, 'existing.turtlepen.json');
  await writeFile(target, 'owned by someone else');
  const session = createSession({ cwd: root });
  const tools = new Map(createTools(session).map((tool) => [tool.name, tool]));
  await tools.get('new_diagram').handler({ name: 'source', path });
  await assert.rejects(
    tools.get('save').handler({ path: target, force: true }),
    (error) => error.code === 'E_TURTLEPEN_CONFLICT',
  );
  assert.equal(await readFile(target, 'utf8'), 'owned by someone else');
});
