import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTINUITY_STATUS_SCHEMA, describeContinuityWork, parseContinuityStatus, type ContinuityWork } from '../continuity.js';
import {
  RECONCILE_CLI,
  buildContinuityView,
  buildReconcileCommand,
  continuityGroupOf,
  normalizeReconcileReason,
  quoteShellArg,
  type ReconcileShell,
} from '../continuity-view.js';

const proofs = { artifact: [], change: [], checks: [], deployment: [], verification: [] };

function work(input: Partial<ContinuityWork> = {}): ContinuityWork {
  return {
    workId: 'work:continuity',
    projectId: 'project:sis',
    ownerActorId: 'actor:frank',
    state: 'input-required',
    intent: {
      distinctRequests: 1, observations: 2, harnesses: ['codex'],
      firstObservedAt: '2026-10-04T12:00:00.000Z', lastObservedAt: '2026-10-04T13:00:00.000Z',
      captureCompleteness: ['complete'], goalAuthority: ['explicit-user-directive'],
    },
    reportedState: { value: 'paused', verification: 'operator-supplied' },
    checkout: { origin: 'https://github.com/frankxai/agentic-ops.git', branch: 'agent/codex/lane', head: 'a'.repeat(40), dirty: true },
    admission: { admitted: false, byActorId: null, requirements: null },
    delivery: { proofEventIds: proofs, missingProofs: [], readyToComplete: false, completed: false },
    quarantined: 0,
    mayAutomaticallyResume: false,
    ...input,
  };
}

const guided = (w: ContinuityWork) => ({ ...w, guidance: describeContinuityWork(w) });

describe('reconcile command builder', () => {
  it('builds the exact owner command and acknowledges the paused state only when admitting input-required work', () => {
    const admit = buildReconcileCommand({ work: work(), decision: 'admit', reason: 'Checked the checkout', shell: 'posix' });
    expect(admit).toEqual({
      ok: true,
      acknowledgesReportedState: true,
      command: "node dist/continuity-cli.js reconcile --work work:continuity --actor actor:frank --decision admit --reason 'Checked the checkout' --acknowledge-paused",
    });
    const block = buildReconcileCommand({ work: work(), decision: 'block', reason: 'Superseded', shell: 'posix' });
    expect(block.ok && block.command).toBe(`${RECONCILE_CLI} reconcile --work work:continuity --actor actor:frank --decision block --reason Superseded`);
    const submitted = buildReconcileCommand({ work: work({ state: 'submitted', reportedState: null }), decision: 'admit', reason: 'Go', shell: 'powershell' });
    expect(submitted.ok && submitted.command).not.toContain('--acknowledge-paused');
  });

  it('uses the registered owner and refuses what SIS would refuse', () => {
    const owner = buildReconcileCommand({ work: work({ ownerActorId: 'actor:sam' }), decision: 'block', reason: 'x', shell: 'posix' });
    expect(owner.ok && owner.command).toContain('--actor actor:sam ');
    expect(buildReconcileCommand({ work: work({ ownerActorId: null }), decision: 'admit', reason: 'x', shell: 'posix' }))
      .toEqual({ ok: false, problem: 'No owner is registered for this work, so nobody can reconcile it yet.' });
    for (const state of ['working', 'blocked', 'completed'] as const) {
      expect(buildReconcileCommand({ work: work({ state }), decision: 'admit', reason: 'x', shell: 'posix' }).ok).toBe(false);
    }
    expect(buildReconcileCommand({ work: work(), decision: 'admit', reason: ' \n\t ', shell: 'posix' })).toEqual({ ok: false, problem: 'Add a reason first.' });
    expect(buildReconcileCommand({ work: work(), decision: 'admit', reason: '--decision admit', shell: 'posix' }).ok).toBe(false);
    expect(buildReconcileCommand({ work: work({ workId: '--actor' }), decision: 'admit', reason: 'x', shell: 'posix' }).ok).toBe(false);
    expect(buildReconcileCommand({ work: work({ workId: 'work:a\u0007b' }), decision: 'admit', reason: 'x', shell: 'posix' }).ok).toBe(false);
    expect(buildReconcileCommand({ work: work(), decision: 'admit', reason: 'x'.repeat(501), shell: 'posix' }).ok).toBe(false);
  });

  it('quotes for POSIX shells and PowerShell, including typographic quotes', () => {
    expect(quoteShellArg('work:plain-id_1.2', 'posix')).toBe('work:plain-id_1.2');
    expect(quoteShellArg("it's $HOME", 'posix')).toBe(`'it'\\''s $HOME'`);
    expect(quoteShellArg("it's $HOME", 'powershell')).toBe(`'it''s $HOME'`);
    expect(quoteShellArg('a\u2019b', 'powershell')).toBe(`'a\u2019\u2019b'`);
    expect(quoteShellArg('-x', 'posix')).toBe(`'-x'`);
    expect(normalizeReconcileReason('  line one\r\n  line\ttwo  ')).toBe('line one line two');
  });

  const hostile = {
    workId: `work:frank's "notes" $(touch pwned) ; & | \u2018curly\u2019 \`tick\` %PATH% *`,
    reason: 'Checked "dirty" files;\nkept $env:PATH and $(whoami) \u2019as is\u2019',
  };

  function argvScript(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconcile-argv-'));
    const file = path.join(dir, 'argv.mjs');
    fs.writeFileSync(file, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));');
    return file;
  }

  function runThrough(shell: ReconcileShell): string[] | null {
    const built = buildReconcileCommand({ work: work({ workId: hostile.workId }), decision: 'admit', reason: hostile.reason, shell });
    if (!built.ok) throw new Error(built.problem);
    const script = argvScript();
    const prefix = shell === 'powershell'
      ? `& ${quoteShellArg(process.execPath, shell)} ${quoteShellArg(script, shell)}`
      : `${quoteShellArg(process.execPath, shell)} ${quoteShellArg(script, shell)}`;
    const command = built.command.replace(RECONCILE_CLI, prefix);
    const result = shell === 'powershell'
      ? spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], { encoding: 'utf8' })
      : spawnSync('sh', ['-c', command], { encoding: 'utf8' });
    if (result.error) return null;
    expect(result.status, result.stderr).toBe(0);
    return JSON.parse(result.stdout) as string[];
  }

  const expected = ['reconcile', '--work', hostile.workId, '--actor', 'actor:frank', '--decision', 'admit', '--reason', normalizeReconcileReason(hostile.reason), '--acknowledge-paused'];
  const has = (bin: string) => !spawnSync(bin, bin === 'sh' ? ['-c', 'exit 0'] : ['-NoProfile', '-Command', 'exit 0']).error;

  it.skipIf(!has('sh'))('passes hostile values through a POSIX shell unchanged', () => {
    expect(runThrough('posix')).toEqual(expected);
  });

  it.skipIf(!has('pwsh'))('passes hostile values through PowerShell unchanged', () => {
    expect(runThrough('powershell')).toEqual(expected);
  }, 30_000);
});

describe('continuity view model', () => {
  const works = [
    guided(work({ workId: 'work:b', intent: { ...work().intent, lastObservedAt: '2026-10-04T10:00:00.000Z' } })),
    guided(work({ workId: 'work:a', state: 'working', projectId: 'project:canvas', intent: { ...work().intent, lastObservedAt: '2026-10-05T10:00:00.000Z' } })),
    guided(work({ workId: 'work:c', scope: 'workspace', checkout: null, workspace: { root: 'C:/Users/frank' }, intent: { ...work().intent, lastObservedAt: null } })),
    guided(work({ workId: 'work:d', state: 'completed', checkout: { ...work().checkout!, branch: 'main' } })),
  ];

  it('accepts workspace sessions without treating the missing checkout as unknown', () => {
    const workspace = work({ scope: 'workspace', checkout: null, workspace: { root: 'C:/Users/frank' } });
    const document = JSON.stringify({ schemaVersion: CONTINUITY_STATUS_SCHEMA, works: [workspace, work({ checkout: null })], unattributedQuarantine: 0, issues: [], imports: 1 });
    const parsed = parseContinuityStatus(document);
    expect(parsed?.works[0].workspace).toEqual({ root: 'C:/Users/frank' });
    expect(describeContinuityWork(parsed!.works[0]).unknowns).not.toContain('checkout');
    expect(describeContinuityWork(parsed!.works[1]).unknowns).toContain('checkout');
  });

  it('counts every attention state after search and filters by one', () => {
    const view = buildContinuityView(works, { attention: 'needs-owner', query: '', groupBy: 'none', sort: 'newest' });
    expect(view.counts).toEqual({ all: 4, 'needs-owner': 2, 'awaiting-admission': 0, 'in-progress': 1, blocked: 0, done: 1 });
    expect(view.visible).toBe(2);
    expect(view.groups[0].works.map((w) => w.workId)).toEqual(['work:b', 'work:c']);
  });

  it('searches work ID and branch case-insensitively', () => {
    expect(buildContinuityView(works, { attention: 'all', query: 'MAIN', groupBy: 'none', sort: 'newest' }).groups[0].works.map((w) => w.workId)).toEqual(['work:d']);
    const none = buildContinuityView(works, { attention: 'all', query: 'nothing-matches', groupBy: 'none', sort: 'newest' });
    expect(none.groups).toEqual([]);
    expect(none.counts.all).toBe(0);
  });

  it('sorts by last observed with unknown times last in both directions', () => {
    const ids = (sort: 'newest' | 'oldest') => buildContinuityView(works, { attention: 'all', query: '', groupBy: 'none', sort }).groups[0].works.map((w) => w.workId);
    expect(ids('newest')).toEqual(['work:a', 'work:d', 'work:b', 'work:c']);
    expect(ids('oldest')).toEqual(['work:b', 'work:d', 'work:a', 'work:c']);
  });

  it('groups by project and by checkout, with workspace sessions apart', () => {
    const byProject = buildContinuityView(works, { attention: 'all', query: '', groupBy: 'project', sort: 'newest' });
    expect(byProject.groups.map((g) => [g.label, g.works.length])).toEqual([['project:canvas', 1], ['project:sis', 3]]);
    const byCheckout = buildContinuityView(works, { attention: 'all', query: '', groupBy: 'checkout', sort: 'newest' });
    expect(byCheckout.groups.map((g) => g.label)).toEqual([
      'frankxai/agentic-ops · agent/codex/lane',
      'frankxai/agentic-ops · main',
      'Workspace · C:/Users/frank',
    ]);
    expect(continuityGroupOf(work({ checkout: null }), 'checkout').label).toBe('No checkout recorded');
    expect(continuityGroupOf(work({ checkout: { ...work().checkout!, origin: 'git@github.com:frankxai/sis.git' } }), 'checkout').label).toBe('frankxai/sis · agent/codex/lane');
  });
});
