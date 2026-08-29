/**
 * The file-access boundary.
 *
 * An agent chooses TurtlePen's path arguments, so the interesting cases are
 * the refusals. Every one of them must name the path and say how to allow it:
 * a boundary that fails silently, or that clamps a path to something the
 * caller did not ask for, would be worse than no boundary at all.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

import { createSession, createTools, pathsAreConfined, resolveInside } from '../src/mcp/tools.js';

const newDiagram = (tools, args) => tools.find((t) => t.name === 'new_diagram').handler(args);

test('a path outside the workspace root is refused by name, not clamped', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'turtlepen-root-'));
  const outside = await mkdtemp(resolve(tmpdir(), 'turtlepen-outside-'));
  try {
    const tools = createTools(createSession({ cwd: root }));
    await assert.rejects(
      () => newDiagram(tools, { name: 'escapee', path: resolve(outside, 'e.turtlepen.json') }),
      (err) => {
        assert.match(err.message, /path escapes the workspace root/);
        assert.match(err.message, /TURTLEPEN_ALLOW_ANY_PATH=1/, 'the refusal must say how to allow it');
        assert.ok(err.message.includes(outside), 'the refusal must name the path it refused');
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('a relative .. escape is refused just like an absolute one', async () => {
  const parent = await mkdtemp(resolve(tmpdir(), 'turtlepen-parent-'));
  const root = join(parent, 'project');
  await mkdir(root);
  try {
    const session = createSession({ cwd: root });
    await assert.rejects(
      () => resolveInside(session, root, join('..', 'sneaky.turtlepen.json')),
      /path escapes the workspace root/,
    );
    // The control: the same call one level in is allowed.
    assert.equal(
      await resolveInside(session, root, 'fine.turtlepen.json'),
      resolve(root, 'fine.turtlepen.json'),
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('a symlink pointing out of the root is an escape, because the real path is', async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), 'turtlepen-symroot-'));
  const outside = await mkdtemp(resolve(tmpdir(), 'turtlepen-symout-'));
  try {
    await writeFile(join(outside, 'target.turtlepen.json'), '{}');
    try {
      await symlink(join(outside, 'target.turtlepen.json'), join(root, 'link.turtlepen.json'));
    } catch {
      // Windows refuses symlink creation without privilege; the guard is still
      // exercised by the other cases, so skip rather than fail on the platform.
      return t.skip('symlink creation is not permitted here');
    }
    const session = createSession({ cwd: root });
    await assert.rejects(
      () => resolveInside(session, root, 'link.turtlepen.json'),
      /path escapes the workspace root/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('an explicitly declared extra root is inside the boundary', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'turtlepen-root-'));
  const named = await mkdtemp(resolve(tmpdir(), 'turtlepen-named-'));
  try {
    // This is the viewer's case: a human named a document outside the project
    // on the command line, which is not the same as an agent choosing a path.
    const session = createSession({ cwd: root, roots: [named] });
    assert.equal(
      await resolveInside(session, named, 'doc.turtlepen.json'),
      resolve(named, 'doc.turtlepen.json'),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(named, { recursive: true, force: true });
  }
});

test('TURTLEPEN_ALLOW_ANY_PATH=1 restores unrestricted access and says so', async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), 'turtlepen-root-'));
  const outside = await mkdtemp(resolve(tmpdir(), 'turtlepen-outside-'));
  const previous = process.env.TURTLEPEN_ALLOW_ANY_PATH;
  t.after(async () => {
    if (previous === undefined) delete process.env.TURTLEPEN_ALLOW_ANY_PATH;
    else process.env.TURTLEPEN_ALLOW_ANY_PATH = previous;
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  assert.equal(pathsAreConfined(), true, 'confinement is the default, not the opt-in');
  const confined = JSON.parse(createTools(createSession({ cwd: root })).find((x) => x.name === 'runtime_info').handler({}));
  assert.equal(confined.fileAccess, 'workspace-root');

  process.env.TURTLEPEN_ALLOW_ANY_PATH = '1';
  assert.equal(pathsAreConfined(), false);
  const session = createSession({ cwd: root });
  assert.equal(
    await resolveInside(session, root, resolve(outside, 'anywhere.turtlepen.json')),
    resolve(outside, 'anywhere.turtlepen.json'),
  );
  const open = JSON.parse(createTools(session).find((x) => x.name === 'runtime_info').handler({}));
  assert.equal(open.fileAccess, 'unrestricted', 'a client must be able to read the live boundary');
});
