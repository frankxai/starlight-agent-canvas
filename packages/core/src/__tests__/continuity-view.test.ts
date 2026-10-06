import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTINUITY_STATUS_SCHEMA, describeContinuityWork, parseContinuityStatus, type ContinuityWork } from '../continuity.js';
import {
  RECONCILE_CLI,
  RECONCILE_UNSAFE_ID,
  buildContinuityView,
  buildReconcileCommand,
  continuityGroupOf,
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

const REAL_ID = 'work:codex-goal:2309e8b0-b509-4e86-a9d6-e0e86e721c0b';

describe('reconcile command builder', () => {
  it('builds the exact owner command with a reason placeholder and the ack flag only for an input-required admit', () => {
    expect(buildReconcileCommand({ work: work({ workId: REAL_ID }), decision: 'admit' })).toEqual({
      ok: true,
      acknowledgesReportedState: true,
      command: `node dist/continuity-cli.js reconcile --work "${REAL_ID}" --actor "actor:frank" --decision admit --reason "<your reason>" --acknowledge-paused`,
    });
    const block = buildReconcileCommand({ work: work(), decision: 'block' });
    expect(block.ok && block.command).toBe(`${RECONCILE_CLI} reconcile --work "work:continuity" --actor "actor:frank" --decision block --reason "<your reason>"`);
    const submitted = buildReconcileCommand({ work: work({ state: 'submitted', reportedState: null }), decision: 'admit' });
    expect(submitted.ok && submitted.command).not.toContain('--acknowledge-paused');
  });

  it('uses the registered owner and refuses what SIS would refuse', () => {
    const owner = buildReconcileCommand({ work: work({ ownerActorId: 'actor:sam@host/team.lead_1' }), decision: 'block' });
    expect(owner.ok && owner.command).toContain('--actor "actor:sam@host/team.lead_1" ');
    expect(buildReconcileCommand({ work: work({ ownerActorId: null }), decision: 'admit' }))
      .toEqual({ ok: false, problem: 'No owner is registered for this work, so nobody can reconcile it yet.' });
    for (const state of ['working', 'blocked', 'completed'] as const) {
      expect(buildReconcileCommand({ work: work({ state }), decision: 'admit' }).ok).toBe(false);
    }
    expect(buildReconcileCommand({ work: work(), decision: 'admit; rm -rf /' as 'admit' }).ok).toBe(false);
  });

  const unsafe = [
    'work:a;b', 'work:a&b', 'work:a|b', 'work:a`b', 'work:$(whoami)', 'work:a(b)', "work:frank's", 'work:a"b', 'work:a\nb',
    'work:%PATH%', 'work:a^b', 'work:a b', 'work:a b', 'work:аdmin', 'work:a’b', 'work:a\\b', 'work:a!b', 'work:a<b>', 'work:a*b',
    '', '-x', '--decision', '--acknowledge-paused', '--actor', '--work', '--reason', '/work', ':work', 'w'.repeat(201),
  ];

  it.each(unsafe)('builds no command for the unsafe ID %j, as work or as actor', (value) => {
    expect(buildReconcileCommand({ work: work({ workId: value }), decision: 'admit' })).toEqual({ ok: false, problem: RECONCILE_UNSAFE_ID });
    const asActor = buildReconcileCommand({ work: work({ ownerActorId: value }), decision: 'admit' });
    expect(asActor.ok).toBe(false);
  });

  function argvScript(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconcile-argv-'));
    const file = path.join(dir, 'argv.mjs');
    fs.writeFileSync(file, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));');
    return file;
  }

  type Shell = 'sh' | 'pwsh' | 'cmd';
  function runThrough(shell: Shell): string[] {
    const built = buildReconcileCommand({ work: work({ workId: REAL_ID, ownerActorId: 'actor:sam@host/team.lead_1' }), decision: 'admit' });
    if (!built.ok) throw new Error(built.problem);
    const prefix = `"${process.execPath}" "${argvScript()}"`;
    const command = built.command.replace(RECONCILE_CLI, shell === 'pwsh' ? `& ${prefix}` : prefix);
    const result = shell === 'pwsh'
      ? spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], { encoding: 'utf8' })
      : shell === 'cmd'
        ? spawnSync('cmd.exe', ['/d', '/s', '/c', `"${command}"`], { encoding: 'utf8', windowsVerbatimArguments: true })
        : spawnSync('sh', ['-c', command], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    return JSON.parse(result.stdout) as string[];
  }

  const expected = ['reconcile', '--work', REAL_ID, '--actor', 'actor:sam@host/team.lead_1', '--decision', 'admit', '--reason', '<your reason>', '--acknowledge-paused'];
  const has = (shell: Shell) => {
    if (shell === 'cmd') return process.platform === 'win32';
    return !spawnSync(shell, shell === 'sh' ? ['-c', 'exit 0'] : ['-NoProfile', '-Command', 'exit 0']).error;
  };

  for (const shell of ['sh', 'pwsh', 'cmd'] as const) {
    it.skipIf(!has(shell))(`reaches node with the exact argv through ${shell}`, () => {
      expect(runThrough(shell)).toEqual(expected);
    }, 30_000);
  }
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
