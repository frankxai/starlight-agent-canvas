import { mkdir, open, readFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

export interface FileLockOptions {
  timeoutMs?: number;
  /** Deprecated: elapsed time never establishes that a writer lock is safe to remove. */
  staleMs?: number;
  retryMs?: number;
}

const DEFAULT_LOCK_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_MS = 35;

function isLockContention(code: string | undefined): boolean {
  return code === 'EEXIST' || code === 'EPERM' || code === 'EACCES';
}

async function removeLockWithRetry(lockPath: string, expectedRecord?: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      if (expectedRecord !== undefined) {
        const current = await readFile(lockPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return undefined;
          throw error;
        });
        if (current === undefined) return;
        if (current !== expectedRecord) throw new Error(`Canvas lock ownership changed: ${path.basename(lockPath)}`);
      }
      await rm(lockPath, { force: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!['EBUSY', 'EPERM', 'EACCES'].includes(code ?? '') || attempt >= 5) throw error;
      await sleep(50 * (attempt + 1));
    }
  }
}

function ownerIsDead(raw: string): boolean {
  try {
    const owner = JSON.parse(raw) as { pid?: unknown };
    if (typeof owner.pid !== 'number' || !Number.isSafeInteger(owner.pid) || owner.pid <= 0) return false;
    try { process.kill(owner.pid, 0); return false; }
    catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH'; }
  } catch { return false; }
}

// Recovery contenders serialize separately and re-read the owner under that gate.
// Ordinary writers still acquire the original exclusive lock. No age-based deletion.
async function recoverDeadOwner(lockPath: string): Promise<void> {
  const initial = await readFile(lockPath, 'utf8').catch(() => undefined);
  if (!initial || !ownerIsDead(initial)) return;
  const recoveryPath = `${lockPath}.recovery`;
  let gate: Awaited<ReturnType<typeof open>>;
  try { gate = await open(recoveryPath, 'wx'); }
  catch (error) {
    if (isLockContention((error as NodeJS.ErrnoException).code)) return;
    throw error;
  }
  const gateRecord = JSON.stringify({ pid: process.pid, ownerId: randomUUID(), createdAt: new Date().toISOString() });
  try {
    await gate.writeFile(gateRecord);
    await gate.close();
    const current = await readFile(lockPath, 'utf8').catch(() => undefined);
    if (current === initial && ownerIsDead(current)) await removeLockWithRetry(lockPath, current);
  } finally {
    await gate.close().catch(() => undefined);
    // Only this exclusive creator can own an unwritten recovery record.
    await removeLockWithRetry(recoveryPath);
  }
}

export async function withFileLock<T>(
  lockPath: string,
  work: () => Promise<T>,
  options: FileLockOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  const retryMs = options.retryMs ?? DEFAULT_RETRY_MS;
  const startedAt = Date.now();
  const ownerRecord = JSON.stringify({ pid: process.pid, ownerId: randomUUID(), createdAt: new Date().toISOString() });

  await mkdir(path.dirname(lockPath), { recursive: true });

  while (true) {
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(lockPath, 'wx');
      await handle.writeFile(ownerRecord);
      break;
    } catch (error) {
      if (handle) {
        await handle.close().catch(() => undefined);
        await removeLockWithRetry(lockPath);
        throw error;
      }
      const code = (error as NodeJS.ErrnoException).code;
      if (!isLockContention(code)) throw error;

      await recoverDeadOwner(lockPath);

      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`Timed out waiting for canvas lock: ${path.basename(lockPath)}`);
      }
      await sleep(retryMs);
    } finally {
      await handle?.close().catch(() => undefined);
    }
  }

  try {
    return await work();
  } finally {
    await removeLockWithRetry(lockPath, ownerRecord);
  }
}
