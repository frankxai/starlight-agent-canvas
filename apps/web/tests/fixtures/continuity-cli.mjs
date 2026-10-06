// Stands in for SIS `starlight-continuity status --json` in end-to-end tests.
// The 74 works mirror the shape of Frank's real store: mostly input-required, many with
// uncommitted work, and a share of workspace sessions that ran outside any checkout.
import { existsSync, readFileSync } from 'node:fs';

const modeFile = process.env.CONTINUITY_FIXTURE_MODE_FILE;
const mode = modeFile && existsSync(modeFile) ? readFileSync(modeFile, 'utf8').trim() : 'ready';
if (mode === 'refuse') {
  process.stderr.write('Another continuity import is in progress; retry after it finishes\n');
  process.exit(1);
}
const proofs = { artifact: [], change: [], checks: [], deployment: [], verification: [] };
const base = {
  projectId: 'project:sis', scope: 'checkout', workspace: null,
  intent: { distinctRequests: 1, observations: 2, harnesses: ['claude', 'codex'],
    firstObservedAt: '2026-10-04T12:00:00.000Z', lastObservedAt: '2026-10-04T13:00:00.000Z', captureCompleteness: ['complete'], goalAuthority: ['explicit-user-directive'] },
  quarantined: 0, mayAutomaticallyResume: false,
};
const notAdmitted = { admitted: false, byActorId: null, requirements: null };
const admitted = { admitted: true, byActorId: 'actor:frank', requirements: { artifact: true, change: true, checks: true, deployment: false, verification: true } };
const delivery = (missingProofs, completed = false) => ({ proofEventIds: proofs, missingProofs, readyToComplete: completed, completed });

const fixed = [
  { ...base, workId: 'work:session-continuity', ownerActorId: 'actor:frank', state: 'input-required',
    reportedState: { value: 'paused', verification: 'operator-supplied' },
    checkout: { origin: 'https://github.com/frankxai/agentic-ops.git', branch: 'agent/codex/lane', head: 'a'.repeat(40), dirty: true },
    admission: notAdmitted, delivery: delivery([]) },
  { ...base, workId: 'work:partial-capture', ownerActorId: null, state: 'working', reportedState: null, checkout: null, scope: null,
    intent: { ...base.intent, captureCompleteness: ['partial'] },
    admission: { admitted: true, byActorId: 'actor:frank', requirements: { artifact: true, change: false, checks: true, deployment: false, verification: true } },
    delivery: delivery(['artifact', 'checks', 'verification']) },
  { ...base, workId: 'work:home-workspace', ownerActorId: 'actor:frank', state: 'input-required', scope: 'workspace',
    reportedState: { value: 'blocked', verification: 'native-goal-store' }, checkout: null, workspace: { root: 'C:/Users/frank' },
    admission: notAdmitted, delivery: delivery([]),
    intent: { ...base.intent, lastObservedAt: '2026-10-05T09:30:00.000Z' } },
  // An ID with a shell-unsafe character proves the page refuses to build a command for it.
  { ...base, workId: "work:frank's-notes", ownerActorId: 'actor:frank', state: 'input-required',
    reportedState: { value: 'paused', verification: 'native-goal-store' },
    checkout: { origin: 'https://github.com/frankxai/starlight-agent-canvas.git', branch: 'agent/claude/notes', head: 'b'.repeat(40), dirty: true },
    admission: notAdmitted, delivery: delivery([]),
    intent: { ...base.intent, lastObservedAt: '2026-10-05T11:00:00.000Z' } },
];

const projects = ['project:sis', 'project:agentic-ops', 'project:canvas', 'project:frankx'];
const repos = ['Starlight-Intelligence-System', 'agentic-ops', 'starlight-agent-canvas', 'frankx.ai-vercel-website'];
const branches = ['agent/codex/goal-sweep', 'agent/claude/continuity-scale', 'agent/grok/review', 'main'];
// 70 generated works: 38 input-required, 12 submitted, 9 working, 6 blocked, 5 completed.
const plan = [
  ...Array(38).fill('input-required'), ...Array(12).fill('submitted'), ...Array(9).fill('working'),
  ...Array(6).fill('blocked'), ...Array(5).fill('completed'),
];
const reported = ['paused', 'active', 'blocked', 'unknown'];

const generated = plan.map((state, i) => {
  const n = String(i + 1).padStart(2, '0');
  const p = i % projects.length;
  const workspaceSession = state === 'input-required' && i % 3 === 2;
  const observed = new Date(Date.UTC(2026, 9, 3, 8, 0) + i * 37 * 60_000).toISOString();
  return {
    ...base,
    workId: `work:goal-${n}`,
    projectId: projects[p],
    ownerActorId: i === 7 || i === 41 ? null : 'actor:frank',
    state,
    scope: workspaceSession ? 'workspace' : 'checkout',
    reportedState: state === 'submitted' ? null : { value: reported[i % reported.length], verification: i % 2 ? 'native-goal-store' : 'operator-supplied' },
    checkout: workspaceSession ? null : {
      origin: `https://github.com/frankxai/${repos[p]}.git`, branch: branches[i % branches.length], head: i.toString(16).padStart(40, 'c'), dirty: i % 5 !== 0,
    },
    workspace: workspaceSession ? { root: i % 2 ? 'C:/Users/frank' : 'C:/Users/frank/starlight' } : null,
    intent: { ...base.intent, harnesses: [i % 2 ? 'codex' : 'claude'], lastObservedAt: observed },
    admission: state === 'working' || state === 'completed' ? admitted : notAdmitted,
    delivery: state === 'completed' ? delivery([], true) : state === 'working' ? delivery(i % 2 ? ['verification'] : []) : delivery([]),
  };
});

process.stdout.write(JSON.stringify({
  schemaVersion: 'starlight.continuity-status.v1', unattributedQuarantine: 1, issues: [], imports: 2,
  works: [...fixed, ...generated],
}));
