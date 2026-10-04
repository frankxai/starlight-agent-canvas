// Stands in for SIS `starlight-continuity status --json` in end-to-end tests.
import { existsSync, readFileSync } from 'node:fs';

const modeFile = process.env.CONTINUITY_FIXTURE_MODE_FILE;
const mode = modeFile && existsSync(modeFile) ? readFileSync(modeFile, 'utf8').trim() : 'ready';
if (mode === 'refuse') {
  process.stderr.write('Another continuity import is in progress; retry after it finishes\n');
  process.exit(1);
}
const proofs = { artifact: [], change: [], checks: [], deployment: [], verification: [] };
const base = {
  projectId: 'project:sis', intent: { distinctRequests: 1, observations: 2, harnesses: ['claude', 'codex'],
    firstObservedAt: '2026-10-04T12:00:00.000Z', lastObservedAt: '2026-10-04T13:00:00.000Z', captureCompleteness: ['complete'], goalAuthority: ['explicit-user-directive'] },
  quarantined: 0, mayAutomaticallyResume: false,
};
process.stdout.write(JSON.stringify({
  schemaVersion: 'starlight.continuity-status.v1', unattributedQuarantine: 1, issues: [], imports: 2,
  works: [
    { ...base, workId: 'work:session-continuity', ownerActorId: 'actor:frank', state: 'input-required',
      reportedState: { value: 'paused', verification: 'operator-supplied' },
      checkout: { origin: 'https://github.com/frankxai/agentic-ops.git', branch: 'agent/codex/lane', head: 'a'.repeat(40), dirty: true },
      admission: { admitted: false, byActorId: null, requirements: null },
      delivery: { proofEventIds: proofs, missingProofs: [], readyToComplete: false, completed: false } },
    { ...base, workId: 'work:partial-capture', ownerActorId: null, state: 'working', reportedState: null, checkout: null,
      intent: { ...base.intent, captureCompleteness: ['partial'] },
      admission: { admitted: true, byActorId: 'actor:frank', requirements: { artifact: true, change: false, checks: true, deployment: false, verification: true } },
      delivery: { proofEventIds: proofs, missingProofs: ['artifact', 'checks', 'verification'], readyToComplete: false, completed: false } },
  ],
}));