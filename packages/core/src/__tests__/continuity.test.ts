import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONTINUITY_STATUS_SCHEMA,
  describeContinuityWork,
  parseContinuityStatus,
  readContinuityStatus,
  type ContinuityWork,
} from '../continuity.js';

const proofs = { artifact: [], change: [], checks: [], deployment: [], verification: [] };

function work(input: Partial<ContinuityWork> = {}): ContinuityWork {
  return {
    workId: 'work:continuity',
    projectId: 'project:sis',
    ownerActorId: 'actor:frank',
    state: 'input-required',
    intent: {
      distinctRequests: 1, observations: 2, harnesses: ['claude', 'codex'],
      firstObservedAt: '2026-10-04T12:00:00.000Z', lastObservedAt: '2026-10-04T13:00:00.000Z',
      captureCompleteness: ['complete'], goalAuthority: ['explicit-user-directive'],
    },
    reportedState: { value: 'paused', verification: 'operator-supplied' },
    checkout: { origin: 'https://github.com/frankxai/example.git', branch: 'agent/codex/lane', head: 'a'.repeat(40), dirty: true },
    admission: { admitted: false, byActorId: null, requirements: null },
    delivery: { proofEventIds: proofs, missingProofs: [], readyToComplete: false, completed: false },
    quarantined: 0,
    mayAutomaticallyResume: false,
    ...input,
  };
}

const document = (works = [work()]) => JSON.stringify({ schemaVersion: CONTINUITY_STATUS_SCHEMA, works, unattributedQuarantine: 0, issues: [], imports: 2 });

function fakeCli(): string {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'continuity-cli-')), 'continuity-cli.js');
  fs.writeFileSync(file, '');
  return file;
}

const now = () => new Date('2026-10-04T18:00:00.000Z');

describe('continuity status consumer', () => {
  it('validates the versioned SIS status contract and rejects other shapes', () => {
    expect(parseContinuityStatus(document())?.works[0].state).toBe('input-required');
    expect(parseContinuityStatus(document().replace(CONTINUITY_STATUS_SCHEMA, 'starlight.continuity-status.v0'))).toBeNull();
    expect(parseContinuityStatus(JSON.stringify({ ...JSON.parse(document()), works: [{ ...work(), mayAutomaticallyResume: true }] }))).toBeNull();
    expect(parseContinuityStatus('not json')).toBeNull();
    const native = work({ reportedState: { value: 'blocked', verification: 'native-goal-store' } });
    expect(parseContinuityStatus(document([native]))?.works[0].reportedState?.verification).toBe('native-goal-store');
    expect(describeContinuityWork(native).nextStep).toContain('Last reported blocked.');
    expect(describeContinuityWork(work({ reportedState: null })).nextStep).toContain('Reported state is unknown.');
  });

  it('runs the SIS CLI through node with a fixed argv and reports its source', async () => {
    const cli = fakeCli();
    const calls: string[][] = [];
    const result = await readContinuityStatus({
      cli, now,
      exec: (file, args, _options, callback) => { calls.push([file, ...args]); callback(null, document(), ''); },
    });
    expect(calls).toEqual([[process.execPath, cli, 'status', '--json']]);
    expect(result.state).toBe('ready');
    expect(result.source).toEqual({ system: 'sis', command: 'starlight-continuity status --json', observedAt: '2026-10-04T18:00:00.000Z' });
  });

  it('turns every failure into a visible, recoverable unavailable state', async () => {
    const cli = fakeCli();
    const run = (error: Error & { killed?: boolean } | null, stdout = '', stderr = '') =>
      readContinuityStatus({ cli, now, exec: (_f, _a, _o, callback) => callback(error, stdout, stderr) });
    const cases = [
      [await readContinuityStatus({ cli: '', now }), 'not-configured'],
      [await readContinuityStatus({ cli: path.join(os.tmpdir(), 'missing-continuity-cli.js'), now }), 'cli-missing'],
      [await run(Object.assign(new Error('x'), { killed: true })), 'timeout'],
      [await run(new Error('x'), '', "ENOENT: no such file or directory, open 'C:\\Users\\x\\trust-policy.json'"), 'policy-missing'],
      [await run(new Error('x'), '', 'Another continuity import is in progress'), 'refused'],
      [await run(null, '{"schemaVersion":"other"}'), 'malformed'],
    ] as const;
    for (const [result, reason] of cases) {
      expect(result.state).toBe('unavailable');
      if (result.state === 'unavailable') {
        expect(result.reason).toBe(reason);
        expect(result.recovery.length).toBeGreaterThan(20);
        expect(result.detail).not.toMatch(/C:\\Users/);
      }
    }
  });

  it('describes each state with an owner-centred next step and surfaces unknowns', () => {
    expect(describeContinuityWork(work()).attention).toBe('needs-owner');
    expect(describeContinuityWork(work({ state: 'submitted' })).attention).toBe('awaiting-admission');
    const working = describeContinuityWork(work({ state: 'working', delivery: { proofEventIds: proofs, missingProofs: ['checks', 'verification'], readyToComplete: false, completed: false } }));
    expect(working.nextStep).toBe('Admitted. Still missing proof: checks, verification.');
    expect(describeContinuityWork(work({ state: 'blocked' })).attention).toBe('blocked');
    expect(describeContinuityWork(work({ state: 'completed' })).attention).toBe('done');
    const partial = describeContinuityWork(work({ ownerActorId: null, checkout: null, reportedState: null, intent: { ...work().intent, captureCompleteness: ['partial'] } }));
    expect(partial.unknowns).toEqual(['owner', 'checkout', 'reported state', 'capture completeness']);
    for (const state of ['submitted', 'input-required', 'working', 'blocked', 'completed'] as const) {
      expect(describeContinuityWork(work({ state })).nextStep).not.toMatch(/\bresum/i);
    }
  });
});
