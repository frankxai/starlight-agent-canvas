'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ContinuityAttention, ContinuityReadResult, ContinuityWork } from '@starlight-agent-canvas/core';

type GuidedWork = ContinuityWork & { guidance: { attention: ContinuityAttention; nextStep: string; unknowns: string[] } };
type Payload =
  | (Extract<ContinuityReadResult, { state: 'ready' }> & { status: { works: GuidedWork[] } })
  | Extract<ContinuityReadResult, { state: 'unavailable' }>;

const ATTENTION: Record<ContinuityAttention, { label: string; tone: string }> = {
  'needs-owner': { label: 'Needs owner', tone: 'border-[var(--gold)] text-[var(--gold)]' },
  'awaiting-admission': { label: 'Awaiting admission', tone: 'border-[var(--accent)] text-[var(--accent)]' },
  'in-progress': { label: 'Admitted', tone: 'border-[var(--accent-2)] text-[var(--accent-2)]' },
  blocked: { label: 'Blocked', tone: 'border-[var(--muted)] text-[var(--muted)]' },
  done: { label: 'Delivered', tone: 'border-[var(--mint)] text-[var(--mint)]' },
};

const formatTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Unknown');

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

function WorkCard({ work }: { work: GuidedWork }) {
  const attention = ATTENTION[work.guidance.attention];
  const headingId = `work-${work.workId.replace(/[^a-z0-9]/gi, '-')}`;
  return (
    <li>
      <article aria-labelledby={headingId} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 id={headingId} className="min-w-0 break-all font-mono text-sm text-[var(--ink)]">{work.workId}</h2>
          <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs ${attention.tone}`}>{attention.label}</span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[var(--ink)]">{work.guidance.nextStep}</p>
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <Field label="Owner">{work.ownerActorId ?? <Unknown />}</Field>
          <Field label="Reported state">
            {work.reportedState ? <>{work.reportedState.value} <span className="text-[var(--muted)]">(operator-supplied)</span></> : <Unknown />}
          </Field>
          <Field label="Checkout">
            {work.checkout ? (
              <>
                <span className="break-all">{work.checkout.branch}</span>{' '}
                <span className="font-mono text-[var(--muted)]">{work.checkout.head.slice(0, 12)}</span>
                {work.checkout.dirty ? <span className="block text-[var(--gold)]">Has uncommitted work; preserve it</span> : null}
              </>
            ) : <Unknown />}
          </Field>
          <Field label="Captured intent">
            {work.intent.distinctRequests} request{work.intent.distinctRequests === 1 ? '' : 's'}, seen {work.intent.observations}×
            {work.intent.harnesses.length ? ` via ${work.intent.harnesses.join(', ')}` : ''}
          </Field>
          <Field label="Admission">{work.admission.admitted ? `Admitted by ${work.admission.byActorId ?? 'unknown'}` : 'Not admitted'}</Field>
          <Field label="Delivery proof">
            {work.delivery.completed ? 'Complete'
              : work.admission.admitted ? (work.delivery.missingProofs.length ? `Missing ${work.delivery.missingProofs.join(', ')}` : 'All required proof present')
              : 'Not started'}
          </Field>
          <Field label="Last observed">{formatTime(work.intent.lastObservedAt)}</Field>
          {work.quarantined ? <Field label="Quarantined">{work.quarantined} untrusted event{work.quarantined === 1 ? '' : 's'}</Field> : null}
        </dl>
        {work.guidance.unknowns.length ? (
          <p className="mt-4 text-xs text-[var(--muted)]">Partial record. Unknown: {work.guidance.unknowns.join(', ')}.</p>
        ) : null}
      </article>
    </li>
  );
}

export function ContinuityClient() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const inFlight = useRef<AbortController | null>(null);

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
      setAnnouncement(next.state === 'ready' ? `Updated. ${next.status.works.length} recovered work item${next.status.works.length === 1 ? '' : 's'}.` : 'Session continuity is unavailable.');
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

  const works = payload?.state === 'ready' ? payload.status.works : [];

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
          {payload.state === 'ready' ? ` · ${payload.status.imports} import${payload.status.imports === 1 ? '' : 's'}` : ''}
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

      {works.length ? <ul className="mt-6 grid gap-4" aria-label="Recovered work">{works.map((work) => <WorkCard key={work.workId} work={work} />)}</ul> : null}

      {payload?.state === 'ready' && (payload.status.unattributedQuarantine || payload.status.issues.length) ? (
        <p className="mt-6 text-xs text-[var(--muted)]">
          {payload.status.unattributedQuarantine} quarantined event(s) for unregistered work; {payload.status.issues.length} Work Graph issue(s). Inspect with <code className="font-mono">starlight-continuity status</code>.
        </p>
      ) : null}
    </main>
  );
}
