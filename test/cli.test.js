import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const CLI = resolve('src/cli.js');
const fixture = resolve('diagrams/example.turtlepen.json');
const run = (...args) => execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8', windowsHide: true });

test('CLI doctor and searchable help expose the live registry', () => {
  const doctor = JSON.parse(run('doctor', '--json'));
  assert.equal(doctor.state, 'ready');
  assert.ok(doctor.toolCount >= 60);
  assert.match(run('help', 'dynamic', 'view'), /define_view/);
});

test('CLI renders deterministic native PNG and PDF', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'turtlepen-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const png = join(root, 'example.png');
  const pdf = join(root, 'example.pdf');
  run('render', fixture, '--format', 'png', '--out', png, '--force', '--no-grid');
  run('render', fixture, '--format', 'pdf', '--out', pdf, '--force', '--no-grid');
  assert.equal((await readFile(png))[0], 0x89);
  assert.equal((await readFile(pdf)).subarray(0, 8).toString('ascii'), '%PDF-1.4');
});

test('CLI creates an architecture documentation bundle', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'turtlepen-bundle-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const receipt = JSON.parse(run('bundle', fixture, '--out', root));
  assert.ok(receipt.files.includes('README.md'));
  assert.match(await readFile(join(root, 'model.md'), 'utf8'), /# Model/);
});
