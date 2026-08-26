import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

test('CLI governance verifies naming and source-of-truth ownership', () => {
  const governance = JSON.parse(run('governance', '--json'));
  assert.equal(governance.state, 'ready');
  assert.ok(governance.checks.every((entry) => entry.ok));
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

test('CLI render receipt and review command close the perceptual-review loop', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'turtlepen-review-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const document = join(root, 'review.turtlepen.json');
  const svg = join(root, 'review.svg');
  await writeFile(document, await readFile(fixture));
  const rendered = JSON.parse(run('render', document, '--format', 'svg', '--out', svg, '--force', '--json'));
  assert.match(rendered.renderHash, /^[0-9a-f]{16}$/);
  const reviewed = JSON.parse(run('review', document, '--render-hash', rendered.renderHash, '--reviewer', 'test/cli', '--note', 'looked at the rendered fixture'));
  assert.equal(reviewed.perceptual.reviewed, true);
  assert.equal(reviewed.perceptual.stale, false);
  const status = JSON.parse(run('review', document, '--status', '--json'));
  assert.equal(status.perceptual.reviewed, true);
  assert.equal(status.perceptual.stale, false);
});

test('CLI creates an architecture documentation bundle', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'turtlepen-bundle-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const receipt = JSON.parse(run('bundle', fixture, '--out', root));
  assert.ok(receipt.files.includes('README.md'));
  assert.match(await readFile(join(root, 'model.md'), 'utf8'), /# Model/);
});
