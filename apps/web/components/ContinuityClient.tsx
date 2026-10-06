'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ContinuityAttention, ContinuityReadResult, ContinuityWork } from '@starlight-agent-canvas/core';
import {
  ATTENTION_ORDER,
  buildContinuityView,
  buildReconcileCommand,
  type ContinuityGroupBy,
  type ContinuitySort,
  type ReconcileDecision,
} from '@starlight-agent-canvas/core/continuity-view';

type GuidedWork = ContinuityWork & { guidance: { attention: ContinuityAttention; nextStep: string; unknowns: string[] } };
type Ready = Extract<ContinuityReadResult, { state: 'ready' }>;
type Payload =
  | (Omit<Ready, 'status'> & { status: Omit<Ready['status'], 'works'> & { works: GuidedWork[] } })
  | Extract<ContinuityReadResult, { state: 'unavailable' }>;
type AttentionFilter = ContinuityAttention | 'all';

const ATTENTION: Record<ContinuityAttention, { label: string; tone: string }> = {
  'needs-owner': { label: 'Needs owner', tone: 'border-[var(--gold)] text-[var(--gold)]' },
  'awaiting-admission': { label: 'Awaiting admission', tone: 'border-[var(--accent)] text-[var(--accent)]' },
  'in-progress': { label: 'Admitted', tone: 'border-[var(--accent-2)] text-[var(--accent-2)]' },
  blocked: { label: 'Blocked', tone: 'border-[var(--muted)] text-[var(--muted)]' },
  done: { label: 'Delivered', tone: 'border-[var(--mint)] text-[var(--mint)]' },
};

const FILTERS: { value: AttentionFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  ...ATTENTION_ORDER.map((value) => ({ value, label: ATTENTION[value].label })),
];
const GROUPS: { value: ContinuityGroupBy; label: string }[] = [
  { value: 'none', label: 'No grouping' },
  { value: 'project', label: 'Project' },
  { value: 'checkout', label: 'Checkout' },
];
const SORTS: { value: ContinuitySort; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const formatTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Unknown');
const pick = <T extends string>(value: string | null, options: { value: T }[], fallback: T): T =>
  options.some((o) => o.value === value) ? (value as T) : fallback;

const controlClass = 'min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--ink)]';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--muted)]">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-[var(--ink)]">{children}</dd>
    </div>
  );
}

function Unknown() {
  return <span className="text-[var(--muted)]">Unknown</span>;
}

function ReconcilePanel({ work, announce }: { work: GuidedWork; announce: (message: string) => void }) {
  const id = useId();
  const [decision, setDecision] = useState<ReconcileDecision>('admit');
  const [copied, setCopied] = useState(false);
  const commandRef = useRef<HTMLElement>(null);
  const built = buildReconcileCommand({ work, decision });

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2_500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!work.ownerActorId) {
    return (
      <p className="mt-4 border-t border-[var(--border)] pt-4 text-sm text-[var(--muted)]">
        No owner is registered for this work, so nobody can reconcile it yet. Add the owner to the SIS trust policy, then refresh.
      </p>
    );
  }

  const copy = async () => {
    if (!built.ok) return;
    try {
      await navigator.clipboard.writeText(built.command);
      setCopied(true);
      announce(`Copied the reconcile command for ${work.workId}. Replace <your reason> before you press Enter in your SIS checkout.`);
    } catch {
      const node = commandRef.current;
      if (node) window.getSelection()?.selectAllChildren(node);
      announce('Copy was blocked by the browser. The command is selected; copy it with your keyboard.');
    }
  };

  return (
    <div className="mt-4 border-t border-[var(--border)] pt-4">
      <p className="text-sm font-medium text-[var(--ink)]">Reconcile from your terminal</p>
      <fieldset className="mt-3 min-w-0">
        <legend className="text-xs text-[var(--muted)]">Decision</legend>
        <div className="mt-1 flex gap-2">
          {(['admit', 'block'] as const).map((value) => (
            <label
              key={value}
              className={`continuity-choice flex min-h-11 min-w-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm ${decision === value ? 'border-[var(--accent)] text-[var(--ink)]' : 'border-[var(--border)] text-[var(--muted)]'}`}
            >
              <input type="radio" name={`${id}-decision`} value={value} checked={decision === value} onChange={() => setDecision(value)} className="accent-[var(--accent)]" />
              {value === 'admit' ? 'Admit' : 'Block'}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void copy()}
          disabled={!built.ok}
          aria-describedby={built.ok ? undefined : `${id}-unavailable`}
          className="continuity-refresh min-h-11 rounded-md border border-[var(--border)] bg-[var(--bg)] px-4 text-sm text-[var(--ink)] disabled:cursor-not-allowed disabled:text-[var(--muted)]"
        >
          {copied ? 'Copied' : 'Copy reconcile command'}
        </button>
        {built.ok && built.acknowledgesReportedState ? (
          <span className="text-xs text-[var(--muted)]">Includes --acknowledge-paused: you accept the last reported state ({work.reportedState?.value ?? 'unknown'}).</span>
        ) : null}
      </div>
      {built.ok ? (
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-xs text-[var(--ink)]">
          <code ref={commandRef} aria-label={`Reconcile command for ${work.workId}`}>{built.command}</code>
        </pre>
      ) : (
        <p id={`${id}-unavailable`} className="mt-2 text-sm text-[var(--gold)]">{built.problem}</p>
      )}
      <p className="mt-2 text-xs text-[var(--muted)]">
        Run it from your SIS checkout after replacing &lt;your reason&gt;. The CLI asks you to type the work ID before it records anything; this page never admits or starts work.
      </p>
    </div>
  );
}

function WorkCard({ work, headingLevel, announce }: { work: GuidedWork; headingLevel: 2 | 3; announce: (message: string) => void }) {
  const headingId = useId();
  const attention = ATTENTION[work.guidance.attention];
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <li>
      <article aria-labelledby={headingId} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Heading id={headingId} className="min-w-0 break-all font-mono text-sm text-[var(--ink)]">{work.workId}</Heading>
          <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs ${attention.tone}`}>{attention.label}</span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[var(--ink)]">{work.guidance.nextStep}</p>
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <Field label="Owner">{work.ownerActorId ?? <Unknown />}</Field>
          <Field label="Reported state">
            {work.reportedState ? <>{work.reportedState.value} <span className="text-[var(--muted)]">({work.reportedState.verification})</span></> : <Unknown />}
          </Field>
          <Field label="Checkout">
            {work.checkout ? (
              <>
                <span className="break-all">{work.checkout.branch}</span>{' '}
                <span className="font-mono text-[var(--muted)]">{work.checkout.head.slice(0, 12)}</span>
                {work.checkout.dirty ? <span className="block text-[var(--gold)]">Has uncommitted work; preserve it</span> : null}
              </>
            ) : work.workspace ? (
              <>No checkout <span className="text-[var(--muted)]">(workspace session in <span className="break-all">{work.workspace.root}</span>)</span></>
            ) : <Unknown />}
          </Field>
          <Field label="Captured intent">
            {plural(work.intent.distinctRequests, 'request')}, seen {work.intent.observations}×
            {work.intent.harnesses.length ? ` via ${work.intent.harnesses.join(', ')}` : ''}
          </Field>
          <Field label="Admission">{work.admission.admitted ? `Admitted by ${work.admission.byActorId ?? 'unknown'}` : 'Not admitted'}</Field>
          <Field label="Delivery proof">
            {work.delivery.completed ? 'Complete'
              : work.admission.admitted ? (work.delivery.missingProofs.length ? `Missing ${work.delivery.missingProofs.join(', ')}` : 'All required proof present')
              : 'Not started'}
          </Field>
          <Field label="Project">{work.projectId}</Field>
          <Field label="Last observed">{formatTime(work.intent.lastObservedAt)}</Field>
          {work.quarantined ? <Field label="Quarantined">{plural(work.quarantined, 'untrusted event')}</Field> : null}
        </dl>
        {work.guidance.unknowns.length ? (
          <p className="mt-4 text-xs text-[var(--muted)]">Partial record. Unknown: {work.guidance.unknowns.join(', ')}.</p>
        ) : null}
        {work.guidance.attention === 'needs-owner' ? <ReconcilePanel work={work} announce={announce} /> : null}
      </article>
    </li>
  );
}

function SelectControl<T extends string>({ id, label, value, options, onChange }: {
  id: string; label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="text-xs text-[var(--muted)]">{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value as T)} className={`${controlClass} mt-1`}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}

export function ContinuityClient() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [attention, setAttention] = useState<AttentionFilter>('all');
  const [query, setQuery] = useState('');
  const [groupBy, setGroupBy] = useState<ContinuityGroupBy>('none');
  const [sort, setSort] = useState<ContinuitySort>('newest');
  const [restored, setRestored] = useState(false);
  const inFlight = useRef<AbortController | null>(null);
  const searchSettled = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    // A newer refresh or leaving the page cancels the older request; its result is discarded.
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setLoading(true);
    try {
      const response = await fetch('/api/continuity', { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const next = (await response.json()) as Payload;
      setPayload(next);
      setFailure(null);
      setAnnouncement(next.state === 'ready' ? `Updated. ${plural(next.status.works.length, 'recovered work item')}.` : 'Session continuity is unavailable.');
    } catch {
      if (controller.signal.aborted) return;
      setFailure('Canvas could not reach its continuity endpoint. Earlier results, if any, are still shown.');
      setAnnouncement('Refresh failed.');
    } finally {
      if (inFlight.current === controller) {
        inFlight.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => inFlight.current?.abort();
  }, [refresh]);

  // View settings live in the URL so a reload or a shared link reopens the same view.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setAttention(pick(params.get('show'), FILTERS, 'all'));
    setQuery(params.get('q') ?? '');
    setGroupBy(pick(params.get('group'), GROUPS, 'none'));
    setSort(pick(params.get('sort'), SORTS, 'newest'));
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    const params = new URLSearchParams();
    if (attention !== 'all') params.set('show', attention);
    if (query) params.set('q', query);
    if (groupBy !== 'none') params.set('group', groupBy);
    if (sort !== 'newest') params.set('sort', sort);
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  }, [restored, attention, query, groupBy, sort]);

  const works = payload?.state === 'ready' ? payload.status.works : [];
  const view = useMemo(() => buildContinuityView(works, { attention, query, groupBy, sort }), [works, attention, query, groupBy, sort]);
  const summary = `Showing ${view.visible} of ${plural(works.length, 'work item')}`;

  // Search announces once typing pauses; the other controls announce immediately.
  useEffect(() => {
    if (searchSettled.current === null) {
      searchSettled.current = query;
      return;
    }
    if (searchSettled.current === query) return;
    const timer = window.setTimeout(() => {
      searchSettled.current = query;
      setAnnouncement(`${summary}.`);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [query, summary]);

  const announceView = (next: Partial<{ attention: AttentionFilter; groupBy: ContinuityGroupBy; sort: ContinuitySort }>) => {
    const preview = buildContinuityView(works, { attention, query, groupBy, sort, ...next });
    setAnnouncement(`Showing ${preview.visible} of ${plural(works.length, 'work item')}.`);
  };

  const clearFilters = () => {
    setAttention('all');
    setQuery('');
    searchSettled.current = '';
    setAnnouncement(`Filters cleared. Showing ${plural(works.length, 'work item')}.`);
  };

  const headingLevel = groupBy === 'none' ? 2 : 3;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12" aria-busy={loading}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <a href="/" className="text-sm text-[var(--muted)] underline-offset-4 hover:underline">Back to canvas</a>
          <h1 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Session continuity</h1>
          <p className="mt-1 max-w-prose text-sm text-[var(--muted)]">
            Work recovered from interrupted agent sessions, read from Starlight Intelligence System. Nothing here resumes work.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="continuity-refresh min-h-11 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 text-sm text-[var(--ink)]"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>

      {payload ? (
        <p className="mt-6 text-xs text-[var(--muted)]">
          Source: SIS · <code className="font-mono">{payload.source.command}</code> · observed {formatTime(payload.source.observedAt)}
          {payload.state === 'ready' ? ` · ${plural(payload.status.imports, 'import')}` : ''}
        </p>
      ) : null}

      {failure ? (
        <div role="alert" className="mt-6 rounded-lg border border-[var(--gold)] p-4 text-sm text-[var(--ink)]">{failure}</div>
      ) : null}

      {payload?.state === 'unavailable' ? (
        <section aria-labelledby="unavailable-heading" className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 id="unavailable-heading" className="text-base font-medium text-[var(--ink)]">Continuity is not available yet</h2>
          <p className="mt-2 text-sm text-[var(--ink)]">{payload.detail}</p>
          <p className="mt-2 text-sm text-[var(--muted)]">{payload.recovery}</p>
        </section>
      ) : null}

      {payload?.state === 'ready' && works.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-[var(--border)] p-5 text-sm text-[var(--muted)]">
          No recovered work yet. Import a verified continuity bundle into SIS, then refresh.
        </p>
      ) : null}

      {works.length ? (
        <section aria-label="View controls" className="mt-6 grid gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <div role="group" aria-label="Filter by attention" className="flex flex-wrap gap-2">
            {FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                aria-pressed={attention === filter.value}
                onClick={() => { setAttention(filter.value); announceView({ attention: filter.value }); }}
                className={`continuity-choice inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm ${attention === filter.value ? 'border-[var(--accent)] bg-[var(--bg)] text-[var(--ink)]' : 'border-[var(--border)] text-[var(--muted)]'}`}
              >
                {filter.label}
                <span className="font-mono text-xs tabular-nums">{view.counts[filter.value]}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="min-w-0">
              <label htmlFor="continuity-search" className="text-xs text-[var(--muted)]">Search work ID or branch</label>
              <input id="continuity-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} className={`${controlClass} mt-1`} />
            </div>
            <SelectControl id="continuity-group" label="Group by" value={groupBy} options={GROUPS} onChange={(value) => { setGroupBy(value); announceView({ groupBy: value }); }} />
            <SelectControl id="continuity-sort" label="Sort by last observed" value={sort} options={SORTS} onChange={(value) => { setSort(value); announceView({ sort: value }); }} />
          </div>
          <p className="text-sm text-[var(--muted)]">{summary}</p>
        </section>
      ) : null}

      {works.length && view.visible === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-[var(--border)] p-5 text-sm text-[var(--muted)]">
          <p>No work matches these filters.</p>
          <button type="button" onClick={clearFilters} className="mt-3 min-h-11 rounded-md border border-[var(--border)] px-4 text-[var(--ink)]">Clear filters</button>
        </div>
      ) : null}

      {view.groups.length ? (
        groupBy === 'none' ? (
          <ul className="mt-6 grid gap-4" aria-label="Recovered work">
            {view.groups[0].works.map((work) => <WorkCard key={work.workId} work={work} headingLevel={headingLevel} announce={setAnnouncement} />)}
          </ul>
        ) : (
          <div className="mt-6 grid gap-8">
            {view.groups.map((group) => (
              <GroupSection key={group.key} label={group.label} count={group.works.length}>
                {group.works.map((work) => <WorkCard key={work.workId} work={work} headingLevel={headingLevel} announce={setAnnouncement} />)}
              </GroupSection>
            ))}
          </div>
        )
      ) : null}

      {payload?.state === 'ready' && (payload.status.unattributedQuarantine || payload.status.issues.length) ? (
        <p className="mt-6 text-xs text-[var(--muted)]">
          {payload.status.unattributedQuarantine} quarantined event(s) for unregistered work; {payload.status.issues.length} Work Graph issue(s). Inspect with <code className="font-mono">starlight-continuity status</code>.
        </p>
      ) : null}
    </main>
  );
}

function GroupSection({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="flex flex-wrap items-baseline gap-x-2 break-all text-base font-medium text-[var(--ink)]">
        {label} <span className="text-sm font-normal text-[var(--muted)]">{plural(count, 'item')}</span>
      </h2>
      <ul className="mt-3 grid gap-4" aria-label={label}>{children}</ul>
    </section>
  );
}
