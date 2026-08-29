/**
 * The quickstart, executed.
 *
 * Documentation that nobody runs drifts from the code and then quietly lies to
 * the next newcomer. This runs the exact sequence `docs/QUICKSTART.md` tells a
 * stranger to run, so the promise and the behaviour cannot diverge.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createSession, createTools } from '../src/mcp/tools.js';

const call = (tools, name, args = {}) => tools.find((t) => t.name === name).handler(args);

test('the quickstart sequence works exactly as written', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-quickstart-'));
  const tools = createTools(createSession({ cwd }));

  // Step 2: the loop, in the documented order.
  const help = call(tools, 'turtlepen_help');
  assert.ok((typeof help === 'string' ? help : help.text).length > 0);
  const measured = JSON.parse(await call(tools, 'measure', { text: 'Do the thing', maxWidthCells: 20 }));
  assert.ok(measured.cellsWide > 0);

  // Step 3: the first drawing, copied from the document.
  await call(tools, 'new_diagram', { name: 'first', path: path.join(cwd, 'first.turtlepen.json'), cols: 60, rows: 30 });
  await call(tools, 'place_box', { id: 'start', at: 'D4', span: '20x6', label: 'Start', shape: 'terminator' });
  await call(tools, 'place_box', { id: 'work', at: 'D14', span: '20x6', label: 'Do the thing' });
  await call(tools, 'pen', { id: 'e1', program: 'pen from start.S\ndown line to work.N arrow' });

  const log = await call(tools, 'validate', {});
  assert.doesNotMatch(log, /CRITICAL|ERROR/, `the quickstart drawing must validate clean:\n${log}`);

  const rendered = await call(tools, 'render', { path: path.join(cwd, 'first.svg') });
  assert.match(rendered, /renderHash: [0-9a-f]{16}/, 'render must report the hash the quickstart mentions');
  assert.ok(fs.existsSync(path.join(cwd, 'first.svg')), 'and must actually write the file');
});

test('every tool the quickstart points at exists', () => {
  const names = new Set(createTools(createSession()).map((t) => t.name));
  for (const t of ['turtlepen_help', 'measure', 'new_diagram', 'place_box', 'pen', 'validate',
    'render', 'perceptual_review', 'repair', 'route', 'import_mermaid', 'ascii', 'free_space',
    'accept_finding', 'set_canvas', 'add_page']) {
    assert.ok(names.has(t), `QUICKSTART names "${t}", which does not exist`);
  }
});

test('the quickstart file itself is present and links to what it claims', () => {
  const doc = fs.readFileSync(new URL('../docs/QUICKSTART.md', import.meta.url), 'utf8');
  for (const ref of ['src/mcp/server.js', 'turtlepen_help', 'perceptual_review', 'repair', 'route']) {
    assert.ok(doc.includes(ref), `QUICKSTART should mention ${ref}`);
  }
  // Relative links must resolve from docs/.
  for (const rel of ['../README.md', '../llm.md', '../status.md']) {
    assert.ok(fs.existsSync(new URL(`../docs/${rel}`, import.meta.url)), `broken link: ${rel}`);
  }
});

test('package metadata makes the server runnable by a stranger', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(pkg.bin?.['turtlepen-mcp'], 'a bin entry so it can be run without knowing the layout');
  assert.ok(fs.existsSync(new URL(`../${pkg.bin['turtlepen-mcp']}`, import.meta.url)), 'bin target must exist');
  assert.equal(pkg.exports['.'], './src/core/index.js');
  for (const f of pkg.files) {
    assert.ok(fs.existsSync(new URL(`../${f}`, import.meta.url)), `files lists "${f}", which is missing`);
  }
});

test('package metadata excludes repository backup and transient artifact state', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  for (const required of [
    'artifacts/artifact-catalog.json', 'artifacts/manifest.json',
    'benchmark/README.md', 'benchmark/corpus-v1.json',
  ]) assert.ok(pkg.files.includes(required), `package must include ${required}`);
  for (const broadDirectory of ['artifacts', 'benchmark', 'docs/adr']) {
    assert.ok(!pkg.files.includes(broadDirectory), `package must not broadly include ${broadDirectory}`);
  }
  assert.ok(pkg.files.every((entry) => !/\.(?:bak|log)$|\.history\.json$/i.test(entry)),
    'package allowlist must not name backup, log, or history state');
});
