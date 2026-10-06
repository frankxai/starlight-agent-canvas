// Browser-safe helpers for the continuity page. Type-only imports keep node:fs and
// child_process out of the client bundle.
import type { ContinuityAttention, ContinuityWork } from './continuity.js';

export type ReconcileShell = 'powershell' | 'posix';
export type ReconcileDecision = 'admit' | 'block';

export const RECONCILE_CLI = 'node dist/continuity-cli.js';
export const RECONCILE_REASON_MAX = 500;

const SAFE_BARE = /^[A-Za-z0-9][A-Za-z0-9_.\/:=+@-]*$/;
const CONTROL = /[\x00-\x1f\x7f\p{Zl}\p{Zp}]/u;
// U+2018..U+201B: PowerShell treats these typographic marks as single quotes.
const POWERSHELL_QUOTES = /['\u{2018}-\u{201b}]/gu;

/** Quotes one argument so the shell passes it to node unchanged. */
export function quoteShellArg(value: string, shell: ReconcileShell): string {
  if (SAFE_BARE.test(value)) return value;
  if (shell === 'powershell') return `'${value.replace(POWERSHELL_QUOTES, (q) => q + q)}'`;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Collapses whitespace and line breaks so a pasted command stays on one line. */
export function normalizeReconcileReason(reason: string): string {
  return reason.replace(/[\s\x00-\x1f\x7f]+/g, ' ').trim();
}

export type ReconcileCommandResult = { ok: true; command: string; acknowledgesReportedState: boolean } | { ok: false; problem: string };

/**
 * Builds the owner's `reconcile` command. The CLI still asks the owner to type the work
 * ID at an interactive terminal; copying this command admits nothing.
 */
export function buildReconcileCommand(input: {
  work: Pick<ContinuityWork, 'workId' | 'ownerActorId' | 'state'>;
  decision: ReconcileDecision;
  reason: string;
  shell: ReconcileShell;
}): ReconcileCommandResult {
  const { work, decision, shell } = input;
  if (work.state !== 'input-required' && work.state !== 'submitted') {
    return { ok: false, problem: 'Only work that is waiting for an owner decision can be reconciled.' };
  }
  if (!work.ownerActorId) return { ok: false, problem: 'No owner is registered for this work, so nobody can reconcile it yet.' };
  const reason = normalizeReconcileReason(input.reason);
  if (!reason) return { ok: false, problem: 'Add a reason first.' };
  if (reason.length > RECONCILE_REASON_MAX) return { ok: false, problem: `Keep the reason under ${RECONCILE_REASON_MAX} characters.` };
  // The SIS flag parser reads any value that starts with -- as the next flag.
  for (const [label, value] of [['Work ID', work.workId], ['Owner', work.ownerActorId], ['Reason', reason]] as const) {
    if (value.startsWith('--')) return { ok: false, problem: `${label} cannot start with --.` };
    if (CONTROL.test(value)) return { ok: false, problem: `${label} contains control characters; reconcile it from the terminal.` };
  }
  // SIS refuses to admit input-required work unless the owner acknowledges its last reported state.
  const acknowledgesReportedState = decision === 'admit' && work.state === 'input-required';
  const args = [
    'reconcile',
    '--work', quoteShellArg(work.workId, shell),
    '--actor', quoteShellArg(work.ownerActorId, shell),
    '--decision', decision,
    '--reason', quoteShellArg(reason, shell),
    ...(acknowledgesReportedState ? ['--acknowledge-paused'] : []),
  ];
  return { ok: true, command: `${RECONCILE_CLI} ${args.join(' ')}`, acknowledgesReportedState };
}

type ViewWork = ContinuityWork & { guidance: { attention: ContinuityAttention } };

export const ATTENTION_ORDER: ContinuityAttention[] = ['needs-owner', 'awaiting-admission', 'in-progress', 'blocked', 'done'];
export type ContinuityGroupBy = 'none' | 'project' | 'checkout';
export type ContinuitySort = 'newest' | 'oldest';

function repoName(origin: string): string {
  const trimmed = origin.replace(/\.git$/i, '').replace(/\/+$/, '');
  const parts = trimmed.split(/[/:]/).filter(Boolean);
  return parts.length >= 2 ? `${parts[parts.length - 2]}/${parts[parts.length - 1]}` : trimmed;
}

export function continuityGroupOf(work: ContinuityWork, groupBy: Exclude<ContinuityGroupBy, 'none'>): { key: string; label: string } {
  if (groupBy === 'project') return { key: `project:${work.projectId}`, label: work.projectId };
  if (work.checkout) {
    const repo = repoName(work.checkout.origin);
    return { key: `checkout:${work.checkout.origin}#${work.checkout.branch}`, label: `${repo} · ${work.checkout.branch}` };
  }
  if (work.workspace) return { key: `workspace:${work.workspace.root}`, label: `Workspace · ${work.workspace.root}` };
  return { key: 'checkout:none', label: 'No checkout recorded' };
}

export function matchesContinuityQuery(work: ContinuityWork, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [work.workId, work.checkout?.branch ?? ''].some((field) => field.toLowerCase().includes(needle));
}

const observedTime = (work: ContinuityWork) => {
  const time = work.intent.lastObservedAt ? Date.parse(work.intent.lastObservedAt) : NaN;
  return Number.isNaN(time) ? null : time;
};

/** Unknown observation times always sort last, whichever direction is chosen. */
export function compareByLastObserved(sort: ContinuitySort) {
  return (a: ContinuityWork, b: ContinuityWork): number => {
    const ta = observedTime(a);
    const tb = observedTime(b);
    if (ta === tb) return a.workId.localeCompare(b.workId);
    if (ta === null) return 1;
    if (tb === null) return -1;
    return sort === 'newest' ? tb - ta : ta - tb;
  };
}

export interface ContinuityViewOptions {
  attention: ContinuityAttention | 'all';
  query: string;
  groupBy: ContinuityGroupBy;
  sort: ContinuitySort;
}

export interface ContinuityView<W extends ViewWork> {
  /** Counts after search, before the attention filter, so each filter shows what it would reveal. */
  counts: Record<ContinuityAttention | 'all', number>;
  visible: number;
  groups: { key: string; label: string; works: W[] }[];
}

export function buildContinuityView<W extends ViewWork>(works: W[], options: ContinuityViewOptions): ContinuityView<W> {
  const searched = works.filter((work) => matchesContinuityQuery(work, options.query));
  const counts = Object.fromEntries([['all', searched.length], ...ATTENTION_ORDER.map((a) => [a, 0])]) as ContinuityView<W>['counts'];
  for (const work of searched) counts[work.guidance.attention] += 1;
  const shown = searched
    .filter((work) => options.attention === 'all' || work.guidance.attention === options.attention)
    .sort(compareByLastObserved(options.sort));
  if (options.groupBy === 'none') return { counts, visible: shown.length, groups: shown.length ? [{ key: 'all', label: 'All work', works: shown }] : [] };
  const groups = new Map<string, { key: string; label: string; works: W[] }>();
  for (const work of shown) {
    const { key, label } = continuityGroupOf(work, options.groupBy);
    const group = groups.get(key) ?? { key, label, works: [] };
    group.works.push(work);
    groups.set(key, group);
  }
  // Works are already sorted, so each group's first item decides the group order.
  const order = compareByLastObserved(options.sort);
  const sorted = [...groups.values()].sort((a, b) => order(a.works[0], b.works[0]) || a.label.localeCompare(b.label));
  return { counts, visible: shown.length, groups: sorted };
}
