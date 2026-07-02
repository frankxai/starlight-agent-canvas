import { mkdir, open, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

export interface FileLockOptions {
  timeoutMs?: number;
  staleMs?: number;
  retryMs?: number;
}

const DEFAULT_LOCK_TIMEOUT_MS = 10_000;
const DEFAULT_STALE_LOCK_MS = 30_000;
const DEFAULT_RETRY_MS = 35;

function isLockContention(code: string | undefined): boolean {
  return code === 'EEXIST' || code === 'EPERM' || code === 'EACCES';
}

async function isStaleLock(lockPath: string, staleMs: number): Promise<boolean> {
  try {
    const lock = await stat(lockPath);
    return Date.now() - lock.mtimeMs > staleMs;
  } catch {
    return false;
  }
}

export async function withFileLock<T>(
  lockPath: string,
  work: () => Promise<T>,
  options: FileLockOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  const staleMs = options.staleMs ?? DEFAULT_STALE_LOCK_MS;
  const retryMs = options.retryMs ?? DEFAULT_RETRY_MS;
  const startedAt = Date.now();

  await mkdir(path.dirname(lockPath), { recursive: true });

  while (true) {
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(lockPath, 'wx');
      await handle.writeFile(JSON.stringify({
        pid: process.pid,
        createdAt: new Date().toISOString(),
      }));
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!isLockContention(code)) throw error;

      if (await isStaleLock(lockPath, staleMs)) {
        await rm(lockPath, { force: true }).catch(() => undefined);
        continue;
      }

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
    await rm(lockPath, { force: true }).catch(() => undefined);
  }
}
