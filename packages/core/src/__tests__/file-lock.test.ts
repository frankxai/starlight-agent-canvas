import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';

const faults = vi.hoisted(() => ({ writePath: '', removePath: '', removalFailures: 0, unsupportedLinks: false, fallbackWritePath: '' }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    link: async (...args: Parameters<typeof actual.link>) => {
      if (faults.unsupportedLinks) throw Object.assign(new Error('Hard links unavailable'), { code: 'EPERM' });
      return actual.link(...args);
    },
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args);
      if (args[0] !== faults.fallbackWritePath) return handle;
      return new Proxy(handle, { get(target, key) {
        if (key === 'writeFile') return async () => { throw Object.assign(new Error('Disk full during fallback owner write'), { code: 'ENOSPC' }); };
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
    },
    writeFile: async (...args: Parameters<typeof actual.writeFile>) => {
      if (faults.writePath && String(args[0]).startsWith(`${faults.writePath}.`)) {
        await actual.writeFile(args[0], '{partial', args[2]);
        throw Object.assign(new Error('Disk full during owner write'), { code: 'ENOSPC' });
      }
      return actual.writeFile(...args);
    },
    rm: async (...args: Parameters<typeof actual.rm>) => {
      if (args[0] === faults.removePath && faults.removalFailures > 0) {
        faults.removalFailures -= 1;
        throw Object.assign(new Error('Busy file'), { code: 'EBUSY' });
      }
      return actual.rm(...args);
    },
  };
});
import { withFileLock } from '../file-lock.js';

const homes: string[] = [];
async function filename() {
  const home = await mkdtemp(path.join(os.tmpdir(), 'canvas-lock-faults-'));
  homes.push(home);
  return path.join(home, 'canvas.lock');
}
afterEach(async () => {
  faults.writePath = ''; faults.removePath = ''; faults.removalFailures = 0;
  faults.unsupportedLinks = false; faults.fallbackWritePath = '';
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

it('removes its newly acquired lock if writing the owner record fails', async () => {
  const lock = await filename();
  faults.writePath = lock;
  await expect(withFileLock(lock, async () => undefined)).rejects.toThrow('Disk full');
  await expect(readFile(lock)).rejects.toMatchObject({ code: 'ENOENT' });
  faults.writePath = '';
  expect(await withFileLock(lock, async () => 'Recovered')).toBe('Recovered');
});

it('retries transient Windows file-busy errors when releasing its own lock', async () => {
  const lock = await filename();
  faults.removePath = lock; faults.removalFailures = 2;
  expect(await withFileLock(lock, async () => 'Finished')).toBe('Finished');
  expect(faults.removalFailures).toBe(0);
  await expect(readFile(lock)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('serializes two clients recovering a confirmed dead local owner', async () => {
  const lock = await filename();
  const child = spawnSync(process.execPath, ['-e', 'console.log(process.pid)'], { encoding: 'utf8', timeout: 5_000 });
  expect(child.status).toBe(0);
  const pid = Number(child.stdout.trim());
  expect(pid).toBeGreaterThan(0);
  await writeFile(lock, JSON.stringify({ pid, hostname: os.hostname(), platform: process.platform, createdAt: '2000-01-01T00:00:00.000Z' }));
  let running = 0;
  let peak = 0;
  const work = async () => { running += 1; peak = Math.max(peak, running); await sleep(20); running -= 1; };
  await Promise.all([withFileLock(lock, work), withFileLock(lock, work)]);
  expect(peak).toBe(1);
  await expect(readFile(lock)).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(readFile(`${lock}.recovery`)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('recovers a crashed recovery gate by checking its local owner, without deleting by age', async () => {
  const lock = await filename();
  const child = spawnSync(process.execPath, ['-e', 'console.log(process.pid)'], { encoding: 'utf8', timeout: 5_000 });
  expect(child.status).toBe(0);
  const raw = JSON.stringify({ pid: Number(child.stdout.trim()), hostname: os.hostname(), platform: process.platform });
  await writeFile(lock, raw);
  await writeFile(`${lock}.recovery`, raw);
  expect(await withFileLock(lock, async () => 'Recovered gate')).toBe('Recovered gate');
  await expect(readFile(`${lock}.recovery`)).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(readFile(`${lock}.recovery.recovery`)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('holds a lock from another host rather than interpreting its PID locally', async () => {
  const lock = await filename();
  const raw = JSON.stringify({ pid: 999_999_999, hostname: 'another-host', platform: process.platform });
  await writeFile(lock, raw);
  await expect(withFileLock(lock, async () => undefined, { timeoutMs: 30, retryMs: 5 })).rejects.toThrow('Timed out');
  expect(await readFile(lock, 'utf8')).toBe(raw);
});

it('preserves normal v0.1 writes and mutual exclusion when hard links are unavailable', async () => {
  const lock = await filename();
  faults.unsupportedLinks = true;
  let running = 0; let peak = 0;
  const work = async () => { running += 1; peak = Math.max(peak, running); await sleep(20); running -= 1; };
  await Promise.all([withFileLock(lock, work), withFileLock(lock, work)]);
  expect(peak).toBe(1);
  await expect(readFile(lock)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('cleans a failed fallback owner write without deleting another writer', async () => {
  const lock = await filename();
  faults.unsupportedLinks = true; faults.fallbackWritePath = lock;
  await expect(withFileLock(lock, async () => undefined)).rejects.toThrow('Disk full during fallback');
  await expect(readFile(lock)).rejects.toMatchObject({ code: 'ENOENT' });
  faults.fallbackWritePath = '';
  expect(await withFileLock(lock, async () => 'Writable')).toBe('Writable');
});

it('preserves malformed owner evidence for reconciliation rather than guessing', async () => {
  const lock = await filename();
  await writeFile(lock, '{unknown owner');
  await expect(withFileLock(lock, async () => undefined, { timeoutMs: 30, retryMs: 5, staleMs: 1 })).rejects.toThrow('Timed out');
  expect(await readFile(lock, 'utf8')).toBe('{unknown owner');
});
