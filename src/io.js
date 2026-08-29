/** Atomic local-file persistence with optimistic conflict detection. */

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export const hashBytes = (value) => createHash('sha256').update(value).digest('hex');

export class FileConflictError extends Error {
  constructor(path, expectedHash, actualHash) {
    super(
      `write conflict for ${path}: expected ${expectedHash ?? '(missing file)'}, `
      + `but disk is ${actualHash ?? '(missing file)'}; reload before retrying`,
    );
    this.name = 'FileConflictError';
    this.code = 'E_TURTLEPEN_CONFLICT';
    this.path = path;
    this.expectedHash = expectedHash ?? null;
    this.actualHash = actualHash ?? null;
    this.retrySafe = true;
  }
}

export async function readFileRecord(path, encoding = null) {
  try {
    const bytes = await readFile(path);
    return {
      exists: true,
      bytes,
      text: encoding ? bytes.toString(encoding) : null,
      hash: hashBytes(bytes),
    };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { exists: false, bytes: null, text: null, hash: null };
  }
}

async function writeTemp(target, bytes) {
  const temp = join(dirname(target), `.${basename(target)}.${process.pid}.${randomUUID()}.tmp`);
  const handle = await open(temp, 'wx');
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => {});
    await unlink(temp).catch(() => {});
    throw error;
  }
  await handle.close();
  return temp;
}

const TRANSIENT_RENAME_CODES = new Set(['EBUSY', 'EEXIST', 'ENOTEMPTY', 'EPERM']);

async function renameWithRetry(from, to) {
  let lastError;
  for (const waitMs of [0, 10, 30, 75]) {
    if (waitMs) await delay(waitMs);
    try {
      await rename(from, to);
      return;
    } catch (error) {
      lastError = error;
      if (!TRANSIENT_RENAME_CODES.has(error.code)) throw error;
    }
  }
  throw lastError;
}

/**
 * Install a durable temporary file. Some Windows filesystems refuse rename-over
 * when the destination exists; in that case preserve the old destination under
 * a same-directory recovery name until the new file is in place.
 */
async function replaceFromTemp(temp, target, destinationExists) {
  try {
    await renameWithRetry(temp, target);
    return;
  } catch (initialError) {
    if (!destinationExists || !TRANSIENT_RENAME_CODES.has(initialError.code)) throw initialError;

    const displaced = join(dirname(target), `.${basename(target)}.${process.pid}.${randomUUID()}.recovery`);
    await renameWithRetry(target, displaced);
    try {
      await renameWithRetry(temp, target);
      await unlink(displaced).catch(() => {});
    } catch (installError) {
      try {
        await renameWithRetry(displaced, target);
      } catch (restoreError) {
        installError.recoveryPath = displaced;
        installError.restoreError = restoreError;
      }
      throw installError;
    }
  }
}

/**
 * Write bytes in the target directory and rename them over the destination.
 * `expectedHash: undefined` means no concurrency precondition; `null` means
 * the caller expects the destination not to exist.
 */
export async function atomicWriteFile(target, value, {
  expectedHash = undefined,
  backup = false,
} = {}) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  await mkdir(dirname(target), { recursive: true });
  const before = await readFileRecord(target);
  if (expectedHash !== undefined && before.hash !== expectedHash) {
    throw new FileConflictError(target, expectedHash, before.hash);
  }

  let backupPath = null;
  if (backup && before.exists) {
    backupPath = `${target}.bak`;
    const priorBackup = await readFileRecord(backupPath);
    const backupTemp = await writeTemp(backupPath, before.bytes);
    try {
      await replaceFromTemp(backupTemp, backupPath, priorBackup.exists);
    } catch (error) {
      await unlink(backupTemp).catch(() => {});
      throw error;
    }
  }

  const temp = await writeTemp(target, bytes);
  try {
    // Close the gap between the first optimistic read and the durable commit.
    if (expectedHash !== undefined) {
      const current = await readFileRecord(target);
      if (current.hash !== expectedHash) throw new FileConflictError(target, expectedHash, current.hash);
    }
    await replaceFromTemp(temp, target, before.exists);
  } catch (error) {
    await unlink(temp).catch(() => {});
    throw error;
  }
  return { path: target, previousHash: before.hash, hash: hashBytes(bytes), backupPath };
}

/** Test hook for simulating an interruption after a temporary file is durable. */
export async function stageAtomicWrite(target, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  await mkdir(dirname(target), { recursive: true });
  return writeTemp(target, bytes);
}
