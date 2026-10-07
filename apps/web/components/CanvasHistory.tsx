'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { CanvasCheckpoint, CanvasComparison, CheckpointSummary } from '@starlight-agent-canvas/core';

async function historyRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? 'History could not be loaded. Try refreshing the list.');
  return body as T;
}

const control = 'min-h-11 w-full rounded-md border border-starlight-border bg-starlight-surface px-3 py-2 text-sm text-starlight-ink disabled:opacity-50';

export default function CanvasHistory({ canvasId, disabled }: { canvasId: string; disabled: boolean }) {
  const fieldId = useId();
  const alive = useRef(true);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [checkpoints, setCheckpoints] = useState<CheckpointSummary[]>([]);
  const [before, setBefore] = useState('');
  const [after, setAfter] = useState('');
  const [comparison, setComparison] = useState<CanvasComparison>();
  const [snapshot, setSnapshot] = useState<CanvasCheckpoint>();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const base = `/api/canvases/${encodeURIComponent(canvasId)}`;

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  async function loadHistory() {
    const result = await historyRequest<{ checkpoints: CheckpointSummary[] }>(`${base}/checkpoints`);
    if (!alive.current) return;
    setCheckpoints(result.checkpoints);
    setBefore((current) => result.checkpoints.some((item) => item.id === current) ? current : result.checkpoints[0]?.id ?? '');
  }

  async function perform(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    setStatus('');
    try { await work(); }
    catch (problem) {
      if (alive.current) setError(problem instanceof Error && problem.name !== 'TimeoutError'
        ? problem.message : 'The request did not finish. Refresh history before retrying a checkpoint save.');
    } finally { if (alive.current) setBusy(false); }
  }

  return (
    <section className="mb-4 border-b border-starlight-border pb-4" aria-labelledby={`${fieldId}-heading`} data-testid="canvas-history">
      <button type="button" className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
        aria-expanded={open} aria-controls={`${fieldId}-panel`} disabled={busy}
        onClick={() => {
          setOpen(!open);
          if (!open) void perform(loadHistory);
        }}>
        <span id={`${fieldId}-heading`} className="text-sm font-semibold">History and comparison</span>
        <span className="text-xs text-starlight-muted">{open ? 'Close' : 'Open'}</span>
      </button>
      {open && <div id={`${fieldId}-panel`} className="space-y-4 pt-2">
        <p className="text-sm leading-6 text-starlight-muted">Keep a moment of your work. Compare what changed before choosing a direction or handing it to an agent.</p>
        <form className="space-y-2" onSubmit={(event) => {
          event.preventDefault();
          void perform(async () => {
            const result = await historyRequest<{ checkpoint: CheckpointSummary }>(`${base}/checkpoints`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label }),
            });
            if (!alive.current) return;
            setLabel('');
            setBefore(result.checkpoint.id);
            setComparison(undefined);
            setSnapshot(undefined);
            await loadHistory();
            if (alive.current) setStatus(`Checkpoint “${result.checkpoint.label}” saved.`);
          });
        }}>
          <label htmlFor={`${fieldId}-label`} className="block text-xs text-starlight-muted">Checkpoint name</label>
          <input id={`${fieldId}-label`} className={control} maxLength={120} required value={label}
            placeholder="A direction worth keeping" disabled={busy || disabled} onChange={(event) => setLabel(event.target.value)} />
          <button type="submit" disabled={busy || disabled || !label.trim()}
            className={`${control} border-starlight-accent/40 bg-starlight-accent/10 font-semibold text-starlight-accent`}>Save checkpoint</button>
        </form>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-starlight-muted">{checkpoints.length} local checkpoints</p>
          <button type="button" className="min-h-11 px-2 text-sm text-starlight-accent" disabled={busy} onClick={() => void perform(loadHistory)}>Refresh history</button>
        </div>
        {!checkpoints.length && !busy && <p className="text-sm leading-6 text-starlight-muted">Save your first checkpoint to keep the current sources, output, and connections together.</p>}
        {!!checkpoints.length && <>
          <label htmlFor={`${fieldId}-before`} className="block text-xs text-starlight-muted">Compare from</label>
          <select id={`${fieldId}-before`} className={control} value={before} disabled={busy}
            onChange={(event) => { setBefore(event.target.value); setComparison(undefined); setSnapshot(undefined); }}>
            {checkpoints.map((item) => <option key={item.id} value={item.id}>{item.label} ({new Date(item.createdAt).toLocaleString()})</option>)}
          </select>
          {checkpoints.find((item) => item.id === before) && <p className="text-xs leading-5 text-starlight-muted">
            {checkpoints.find((item) => item.id === before)!.counts.nodes} nodes, {checkpoints.find((item) => item.id === before)!.counts.artifacts} sources
          </p>}
          <label htmlFor={`${fieldId}-after`} className="block text-xs text-starlight-muted">Compare to</label>
          <select id={`${fieldId}-after`} className={control} value={after} disabled={busy}
            onChange={(event) => { setAfter(event.target.value); setComparison(undefined); }}>
            <option value="">Current canvas</option>
            {checkpoints.map((item) => <option key={item.id} value={item.id}>{item.label} ({new Date(item.createdAt).toLocaleString()})</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={control} disabled={busy || !before} onClick={() => void perform(async () => {
              const query = new URLSearchParams({ before });
              if (after) query.set('after', after);
              const result = await historyRequest<CanvasComparison>(`${base}/compare?${query}`);
              if (alive.current) { setComparison(result); setSnapshot(undefined); setStatus('Comparison loaded.'); }
            })}>Compare changes</button>
            <button type="button" className={control} disabled={busy || !before} onClick={() => void perform(async () => {
              const result = await historyRequest<{ checkpoint: CanvasCheckpoint }>(`${base}/checkpoints/${encodeURIComponent(before)}`);
              if (alive.current) { setSnapshot(result.checkpoint); setComparison(undefined); setStatus('Checkpoint opened for inspection.'); }
            })}>Open checkpoint</button>
          </div>
        </>}
        <p role="status" aria-live="polite" className="text-sm text-starlight-mint">{busy ? 'Loading history…' : status}</p>
        {error && <p role="alert" className="text-sm leading-6 text-starlight-ink">{error}</p>}
        {comparison && <div className="space-y-3" data-testid="checkpoint-comparison">
          <p className="text-sm font-semibold">{comparison.before.label} to {comparison.after.label}</p>
          {comparison.unchanged && <p className="text-sm text-starlight-muted">No graph or content changes.</p>}
          {!!comparison.canvasFields.length && <p className="text-sm">Canvas changed: {comparison.canvasFields.join(', ')}</p>}
          {Object.entries(comparison.collections).map(([collection, changes]) => changes.length > 0 && <div key={collection}>
            <h3 className="text-xs text-starlight-muted">{collection}: {changes.length} changes</h3>
            {changes.map((change) => <details key={change.id} className="border-b border-starlight-border py-2">
              <summary className="min-h-11 cursor-pointer text-sm leading-6">{change.title}: {change.positionOnly ? 'position changed' : change.kind}</summary>
              {!!change.fields.length && <p className="text-xs leading-5 text-starlight-muted">Changed fields: {change.fields.join(', ')}</p>}
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all pt-2 text-xs leading-5">{JSON.stringify({ before: change.before, after: change.after }, null, 2)}</pre>
            </details>)}
          </div>)}
          <details><summary className="min-h-11 cursor-pointer text-xs text-starlight-muted">Exact input hashes</summary>
            <p className="break-all text-xs leading-5">From: {comparison.before.contentHash}<br />To: {comparison.after.contentHash}</p>
          </details>
        </div>}
        {snapshot && <div className="space-y-2">
          <h3 className="text-sm font-semibold">{snapshot.label}</h3>
          <p className="break-all text-xs leading-5 text-starlight-muted">{snapshot.contentHash}</p>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs leading-5">{JSON.stringify(snapshot.snapshot, null, 2)}</pre>
        </div>}
      </div>}
    </section>
  );
}
