import { link, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
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
    const owner = JSON.parse(raw) as { pid?: unknown; hostname?: unknown; platform?: unknown };
    if (owner.hostname !== hostname() || owner.platform !== process.platform) return false;
    if (typeof owner.pid !== 'number' || !Number.isSafeInteger(owner.pid) || owner.pid <= 0) return false;
    try { process.kill(owner.pid, 0); return false; }
    catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH'; }
  } catch { return false; }
}

function newOwnerRecord(): string {
  return JSON.stringify({ pid: process.pid, ownerId: randomUUID(), hostname: hostname(), platform: process.platform, createdAt: new Date().toISOString() });
}

// A fully written private token is linked into place atomically. A process crash
// between creation and writing can never expose an empty lock to another writer.
async function createExclusiveLock(lockPath: string, ownerRecord: string): Promise<string> {
  const token = `${lockPath}.${randomUUID()}.tmp`;
  try {
    await writeFile(token, ownerRecord, { flag: 'wx' });
    await link(token, lockPath);
    return token;
  } catch (error) {
    await removeLockWithRetry(token);
    throw error;
  }
}

// Recovery contenders serialize separately and re-read the owner under that gate.
// Ordinary writers still acquire the original exclusive lock. No age-based deletion.
async function recoverDeadOwner(lockPath: string, depth = 0): Promise<void> {
  if (depth >= 8) return; // Preserve unusually deep crash evidence for reconciliation.
  const initial = await readFile(lockPath, 'utf8').catch(() => undefined);
  if (!initial || !ownerIsDead(initial)) return;
  const recoveryPath = `${lockPath}.recovery`;
  const gateRecord = newOwnerRecord();
  let gateToken: string;
  try { gateToken = await createExclusiveLock(recoveryPath, gateRecord); }
  catch (error) {
    if (isLockContention((error as NodeJS.ErrnoException).code)) {
      await recoverDeadOwner(recoveryPath, depth + 1);
      return;
    }
    throw error;
  }
  try {
    const current = await readFile(lockPath, 'utf8').catch(() => undefined);
    if (current === initial && ownerIsDead(current)) await removeLockWithRetry(lockPath, current);
  } finally {
    await removeLockWithRetry(recoveryPath, gateRecord);
    await removeLockWithRetry(gateToken, gateRecord);
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
  const ownerRecord = newOwnerRecord();
  let ownerToken = '';

  await mkdir(path.dirname(lockPath), { recursive: true });

  while (true) {
    try {
      ownerToken = await createExclusiveLock(lockPath, ownerRecord);
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!isLockContention(code)) throw error;

      await recoverDeadOwner(lockPath);

      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`Timed out waiting for canvas lock: ${path.basename(lockPath)}`);
      }
      await sleep(retryMs);
    }
  }

  try {
    return await work();
  } finally {
    await removeLockWithRetry(lockPath, ownerRecord);
    await removeLockWithRetry(ownerToken, ownerRecord);
  }
}
