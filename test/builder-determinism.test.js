import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const projectRoot = resolve('.');
const builders = ['build-flowchart.js', 'build-swimlane.js'];
const outputs = [
  'flowchart-important-process.turtlepen.json', 'flowchart-important-process.svg',
  'swimlane-order-handling.turtlepen.json', 'swimlane-order-handling.svg',
];

test('canonical root builders are byte-identical on a second isolated run', async (t) => {
  const outputRoot = await mkdtemp(join(tmpdir(), 'turtlepen-builders-'));
  t.after(() => rm(outputRoot, { recursive: true, force: true }));
  const run = (builder) => execFileSync(process.execPath, [resolve(builder)], {
    cwd: projectRoot,
    env: { ...process.env, TURTLEPEN_OUTPUT_DIR: outputRoot },
    stdio: 'pipe',
    windowsHide: true,
  });

  for (const builder of builders) run(builder);
  const first = new Map(await Promise.all(outputs.map(async (name) => [name, await readFile(join(outputRoot, name))])));
  for (const builder of builders) run(builder);
  for (const name of outputs) {
    assert.deepEqual(await readFile(join(outputRoot, name)), first.get(name), `${name} drifted on rebuild`);
  }
});
