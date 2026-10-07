'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { WebsiteMediaReport, WebsitePlan, WebsiteSelection } from '@starlight-agent-canvas/core';
import { parseWebsitePlan, parseWebsiteDraft, websiteMediaReportMatches, websiteSectionsForDirection } from '@starlight-agent-canvas/core/website';
import WebsiteMediaEvidence from './WebsiteMediaEvidence';
import WebsiteGeneration from './WebsiteGeneration';

type PlanRecord = { plan: WebsitePlan; planHash: string; nodeId: string; selection?: WebsiteSelection; selectionVerified: boolean; gaps: string[] };
type PlanState = { record: PlanRecord | null; unavailable?: { canvasHash: string; reason: string } | null };
const control = 'min-h-11 w-full rounded-md border border-starlight-border bg-starlight-bg px-3 py-2 text-sm text-starlight-ink';
const button = 'inline-flex min-h-11 items-center justify-center rounded-md border border-starlight-border px-4 py-2 text-sm font-medium text-starlight-ink hover:border-starlight-accent disabled:opacity-40 aria-disabled:opacity-40 aria-disabled:cursor-not-allowed';
const accents = ['border-starlight-gold/40 text-starlight-gold', 'border-starlight-violet/40 text-starlight-violet', 'border-starlight-mint/40 text-starlight-mint'];

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  const result = await response.json().catch(() => ({ error: 'The workspace returned an unreadable response. Keep your draft and refresh the saved version.' }));
  if (!response.ok) throw new Error(result.error ?? 'The plan request could not be completed.');
  return result as T;
}

function downloadDraft(plan: WebsitePlan) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${plan.id}.draft.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Field({ label, value, onChange, multiline = false, maxLength = 4000 }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean; maxLength?: number }) {
  const fieldId = useId();
  return <label className="block space-y-2 text-sm text-starlight-muted" htmlFor={fieldId}>{label}
    {multiline ? <textarea id={fieldId} className={`${control} min-h-24 resize-y leading-6`} value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} /> : <input id={fieldId} className={control} value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} />}
  </label>;
}

export default function SiteDirectionWorkbench({ canvasId }: { canvasId: string }) {
  const base = `/api/canvases/${encodeURIComponent(canvasId)}/website`;
  const draftKey = `starlight.website.draft.v1:${canvasId}`;
  const alive = useRef(true);
  const draftVersion = useRef(0);
  const backupStoreUnreadable = useRef(false);
  const draftStoreHeld = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [record, setRecord] = useState<PlanRecord | null>(null);
  const [draft, setDraftState] = useState<WebsitePlan>();
  const latestDraft = useRef<WebsitePlan | undefined>(undefined);
  const mediaCheckOwner = useRef<string | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  // File checks finish asynchronously; always attach to the latest edited plan.
  function setDraft(value: WebsitePlan | undefined) { latestDraft.current = value; setDraftState(value); }
  const [backups, setBackups] = useState<WebsitePlan[]>([]);
  const [unavailable, setUnavailable] = useState<PlanState['unavailable']>();
  const [expectedHash, setExpectedHash] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Opening your saved work…');
  const [storageWarning, setStorageWarning] = useState('');
  const [expanded, setExpanded] = useState<string>();
  const directionSelectId = useId();

  useEffect(() => {
    let cancelled = false;
    alive.current = true;
    void (async () => {
      try {
        const { record: saved, unavailable: unreadable } = await request<PlanState>(base);
        if (!alive.current || cancelled) return;
        setUnavailable(unreadable);
        setRecord(saved); setDraft(saved?.plan); setExpectedHash(saved?.planHash);
        let recoveryRaw: string | null = null;
        try {
          const prior = sessionStorage.getItem(`${draftKey}:backups`);
          if (prior) {
            try { setBackups((JSON.parse(prior) as unknown[]).map(parseWebsiteDraft)); }
            catch { backupStoreUnreadable.current = true; setStorageWarning('Previous draft backups need inspection in browser storage. Current draft recovery is still available.'); }
          }
          const raw = sessionStorage.getItem(draftKey); recoveryRaw = raw;
          if (raw && raw.length > 120_000) throw new Error('Browser draft is oversized.');
          if (raw && raw.length <= 120_000) {
            const recovered = JSON.parse(raw) as { plan: WebsitePlan; expectedHash?: string };
            if (recovered.plan) {
              setDraft(parseWebsiteDraft(recovered.plan)); setExpectedHash(recovered.expectedHash && /^[a-f0-9]{64}$/.test(recovered.expectedHash) ? recovered.expectedHash : undefined); setDirty(true);
              setStatus('Recovered an unsaved draft from this browser tab. Compare it with the saved version before saving.'); return;
            }
          }
        } catch {
          if (recoveryRaw) {
            try {
              const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(recoveryRaw));
              const fingerprint = [...new Uint8Array(hash)].map((part) => part.toString(16).padStart(2, '0')).join('');
              const key = `${draftKey}:unverified:${fingerprint}`;
              if (sessionStorage.getItem(key) !== recoveryRaw) sessionStorage.setItem(key, recoveryRaw);
            }
            catch { draftStoreHeld.current = true; }
          }
          setStorageWarning('Unverified browser draft evidence is retained in session storage. Download current edits before navigating away.');
        }
        setStatus(saved ? 'Your saved plan is ready to edit.' : 'Bring a source and shape a direction. The authored example is available below.');
      } catch (problem) { if (alive.current && !cancelled) setError((problem as Error).message); }
      finally { if (alive.current && !cancelled) setBusy(false); }
    })();
    return () => { cancelled = true; alive.current = false; };
  }, [base, draftKey]);

  useEffect(() => {
    if (!dirty || !draft || draftStoreHeld.current) return;
    try { sessionStorage.setItem(draftKey, JSON.stringify({ plan: draft, expectedHash })); }
    catch { setStorageWarning('Browser draft recovery is unavailable. Download your draft before navigating away.'); }
  }, [draft, dirty, draftKey, expectedHash]);

  function edit(change: (next: WebsitePlan) => void) {
    if (!draft) return;
    const next = structuredClone(draft); change(next); if (next.origin === 'authored_example') next.origin = 'edited_authored_example'; if (next.origin === 'model_generated') next.origin = 'edited_model_generated'; draftVersion.current += 1; setDraft(next); setDirty(true); setError('');
  }
  function beginMediaCheck(token: string): boolean {
    if (mediaCheckOwner.current !== null) return false;
    mediaCheckOwner.current = token; setMediaBusy(true); return true;
  }
  function endMediaCheck(token: string) {
    if (mediaCheckOwner.current === token) { mediaCheckOwner.current = null; setMediaBusy(false); }
  }
  function attachMediaReport(report: WebsiteMediaReport): boolean {
    const current = latestDraft.current;
    const asset = current?.assets.find((item) => item.id === report.assetId);
    if (!alive.current || !current || !asset || !websiteMediaReportMatches(asset, report)) return false;
    const next = structuredClone(current);
    if (next.origin === 'authored_example') next.origin = 'edited_authored_example';
    if (next.origin === 'model_generated') next.origin = 'edited_model_generated';
    next.assets.find((item) => item.id === report.assetId)!.mediaCheckReport = report;
    draftVersion.current += 1; setDraft(next); setDirty(true); setError('');
    setStatus('Local media match added to the draft. Save and choose the updated plan before exporting.');
    return true;
  }
  async function perform(work: () => Promise<void>) {
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setBusy(true); setError('');
    try { await work(); }
    catch (problem) { if (alive.current) setError((problem as Error).name === 'TimeoutError' ? 'The request timed out. Keep your draft and inspect the saved version before retrying; a save may have completed.' : (problem as Error).message); }
    finally { if (alive.current) { setBusy(false); requestAnimationFrame(() => { if (alive.current && focused?.isConnected && (document.activeElement === document.body || document.activeElement === focused)) focused.focus(); }); } }
  }
  function acceptSaved(saved: PlanRecord) {
    setRecord(saved); setDraft(saved.plan); setExpectedHash(saved.planHash); setDirty(false);
    if (!draftStoreHeld.current) try { sessionStorage.removeItem(draftKey); } catch { /* Durable local store succeeded. */ }
  }
  async function save() {
    if (busy || !dirty) return;
    let submitted: WebsitePlan;
    try { submitted = parseWebsitePlan(draft); }
    catch (problem) {
      const issues = (problem as { issues?: Array<{ path: Array<string | number>; message: string }> }).issues;
      setError(issues?.slice(0, 4).map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(' · ') ?? (problem as Error).message); return;
    }
    const version = draftVersion.current;
    await perform(async () => {
      const input = unavailable ? { plan: submitted, expectedCanvasHash: unavailable.canvasHash } : { plan: submitted, expectedHash };
      const result = await request<{ record: PlanRecord }>(base, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      if (alive.current) {
        setUnavailable(null);
        if (draftVersion.current === version) { acceptSaved(result.record); setStatus('Plan saved locally. Choose a direction to preserve its exact source state.'); }
        else { setRecord(result.record); setExpectedHash(result.record.planHash); setStatus('Submitted version saved locally. Your newer edits remain in the unsaved draft.'); }
      }
    });
  }
  async function choose(optionId: string) {
    if (busy || dirty || !record) return;
    const version = draftVersion.current;
    await perform(async () => {
      const result = await request<{ record: PlanRecord }>(`${base}/select`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ optionId, expectedHash: record.planHash }) });
      if (alive.current) {
        if (draftVersion.current === version) { acceptSaved(result.record); setExpanded(optionId); setStatus('Direction selected. Its checkpoint is preserved; the implementation brief is ready to export.'); }
        else { setRecord(result.record); setExpectedHash(result.record.planHash); setStatus('Saved direction selected. Your newer edits remain unsaved and need a new choice after saving.'); }
      }
    });
  }

  function preserveDraftBeforeReplacement(): boolean {
    if (!draft || !dirty) return true;
    if (backupStoreUnreadable.current) { setError('Previous draft backups need owner inspection before another backup can be written. Download your current draft; the unverified browser evidence remains intact.'); return false; }
    const nextBackups = [...backups, draft];
    try { sessionStorage.setItem(`${draftKey}:backups`, JSON.stringify(nextBackups)); }
    catch { setError('The browser could not preserve this draft backup. Download it before replacement. Your current draft is retained.'); return false; }
    setBackups(nextBackups); return true;
  }
  function useSaved() {
    if (busy || !record || !preserveDraftBeforeReplacement()) return;
    draftVersion.current += 1; acceptSaved(record); setStatus('Saved version opened. Your previous drafts remain available for download in this browser tab.');
  }

  async function exportPacket(format: 'markdown' | 'json') {
    if (busy) return;
    await perform(async () => {
      const response = await fetch(`${base}/export${format === 'markdown' ? '?format=markdown' : ''}`, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
      if (!response.ok) { const result = await response.json().catch(() => null); throw new Error(result?.error ?? 'The brief could not be exported. Inspect the saved choice before retrying.'); }
      const blob = await response.blob(); if (!alive.current) return;
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${canvasId}.website.${format === 'markdown' ? 'md' : 'json'}`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus('Implementation packet downloaded. Unresolved evidence remains in the brief.');
    });
  }

  const pageOption = draft?.options.find((option) => option.id === expanded) ?? draft?.options.find((option) => option.id === record?.selection?.optionId) ?? draft?.options[0];
  const pageSections = draft && pageOption ? websiteSectionsForDirection(draft, pageOption) : draft?.sections ?? [];
  return <main className="mx-auto max-w-[1440px] px-5 py-6 sm:px-8 sm:py-10" data-testid="site-directions">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-starlight-border pb-6">
      <a href={`/?canvas=${encodeURIComponent(canvasId)}`} className={`${button} gap-2`}>← Return to canvas</a>
      <p className="text-sm text-starlight-muted">Starlight Agent Canvas <span className="text-starlight-gold">/ Website directions</span></p>
    </header>
    <div className="mt-10 max-w-3xl">
      <p className="text-sm font-medium text-starlight-gold">The work between an idea and a build</p>
      <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">Give the next version<br className="hidden sm:block" /> a direction worth building.</h1>
      <p className="mt-5 max-w-2xl text-base leading-7 text-starlight-muted">Keep the source in view. Explore the promise, the page and the tradeoffs. Choose a direction you can carry into the build with its evidence attached.</p>
    </div>
    <div className="mt-8 flex flex-wrap gap-3">
      <button type="button" className={button} disabled={busy} onClick={() => void perform(async () => { const version = draftVersion.current; const result = await request<{ plan: WebsitePlan }>(`${base}/demo`); if (alive.current && version === draftVersion.current) { if (!preserveDraftBeforeReplacement()) return; draftVersion.current += 1; setDraft(result.plan); setDirty(true); setStatus('Authored example loaded as a draft. No model was called, no site was captured and no direction is selected.'); } else if (alive.current) setStatus('Example loading finished while you edited. Your newer draft is retained.'); })}>Load authored example</button>
      <button type="button" className={button} disabled={busy} onClick={() => fileRef.current?.click()}>Import plan JSON</button>
      <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Import website plan" onChange={(event) => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (!file) return;
        void perform(async () => {
          const version = draftVersion.current;
          if (file.size > 100_000) throw new Error('Keep the imported plan under 100 KB.');
          let plan: WebsitePlan;
          try { plan = parseWebsitePlan(JSON.parse(await file.text())); }
          catch { throw new Error('This file is not a valid website plan. Check source, IDs, target, placements and provenance; the current draft is retained.'); }
          if (alive.current && version === draftVersion.current) { if (!preserveDraftBeforeReplacement()) return; draftVersion.current += 1; setDraft(plan); setDirty(true); setStatus('Imported draft. Inspect its sources and fields before saving.'); }
          else if (alive.current) setStatus('Import finished while you were editing. Your newer draft is retained; import again when ready.');
        });
      }} />
      {draft && <button type="button" className={button} onClick={() => downloadDraft(draft)}>Download draft JSON</button>}
      <button type="button" className={button} disabled={busy} onClick={() => void perform(async () => { const version = draftVersion.current; const result = await request<PlanState>(base); if (alive.current) { setRecord(result.record); setUnavailable(result.unavailable); if (!dirty && version === draftVersion.current) { setDraft(result.record?.plan); setExpectedHash(result.record?.planHash); } setStatus('Saved version refreshed. Your unsaved draft is retained.'); } })}>Inspect saved version</button>
    </div>
    <p role="status" aria-live="polite" className="mt-5 text-sm leading-6 text-starlight-mint">{busy ? 'Working with your local plan…' : status}</p>
    {error && <p role="alert" className="mt-3 border-l-2 border-starlight-gold pl-4 text-sm leading-6">{error}</p>}
    {storageWarning && <p className="mt-3 text-sm leading-6 text-starlight-gold">{storageWarning}</p>}
    {unavailable && <section className="mt-5 border-l-2 border-starlight-gold pl-5"><h2 className="text-lg font-semibold">Keep the original evidence</h2><p className="mt-3 text-sm leading-6 text-starlight-muted">{unavailable.reason}</p><a href={`/api/canvases/${encodeURIComponent(canvasId)}/export?format=json`} className={`${button} mt-4`}>Download original canvas</a><p className="mt-3 text-sm leading-6 text-starlight-muted">Load or import a valid draft. Saving it will retain the unverified nodes and establish one current plan.</p></section>}
    {dirty && record && <details className="mt-5 rounded-lg border border-starlight-border p-4"><summary className="min-h-11 cursor-pointer text-sm">Compare with the saved plan</summary>
      <p className="my-3 whitespace-pre-wrap text-sm leading-6">{record.plan.title}: {record.plan.brief.job}</p>
      <button type="button" className={`${button} mb-4`} onClick={() => downloadDraft(record.plan)}>Download saved plan JSON</button>
      <button type="button" className={button} disabled={busy} onClick={useSaved}>Use saved version</button>
    </details>}
    {!!backups.length && <details className="mt-4"><summary className="min-h-11 cursor-pointer text-sm text-starlight-gold">Previous drafts retained in this tab ({backups.length})</summary><div className="mt-2 flex flex-wrap gap-3">{backups.map((item, index) => <button key={index} type="button" className={button} onClick={() => downloadDraft(item)}>Download draft {index + 1}: {item.title}</button>)}</div></details>}
    {draft && <>
      <section className="mt-10 grid gap-8 border-y border-starlight-border py-7 lg:grid-cols-[1fr_1.15fr]" aria-labelledby="source-heading">
        <div>
          <h2 id="source-heading" className="text-xl font-semibold">Start with what is real</h2>
          <p className="mt-3 text-sm leading-6 text-starlight-muted">{draft.snapshot.notes}</p>
          <p className="mt-4 break-all text-sm leading-6 text-starlight-accent">{draft.snapshot.source.kind === 'public_url' ? draft.snapshot.source.url : `${draft.snapshot.source.repository} · ${draft.snapshot.source.branch}`}</p>
          <p className="mt-2 text-xs leading-5 text-starlight-muted">Observed {draft.snapshot.observedAt} · {draft.snapshot.method.replaceAll('_', ' ')}</p>
          <ul className="mt-4 space-y-3">{draft.snapshot.views.map((view) => <li key={view.viewport} className="border-l border-starlight-border pl-3 text-sm leading-6"><span className="font-medium">{view.viewport} · {view.width} × {view.height} · {view.status.replaceAll('_', ' ')}</span><p className="text-starlight-muted">{view.notes}</p>{view.reference && <p className="break-all text-starlight-accent">{view.reference}</p>}</li>)}</ul>
        </div>
        <div className="space-y-5">
          <Field label="Plan title" value={draft.title} onChange={(value) => edit((next) => { next.title = value; })} />
          <Field label="Who is this for?" value={draft.brief.audience} onChange={(value) => edit((next) => { next.brief.audience = value; })} />
          <Field label="The job this page should do" multiline value={draft.brief.job} onChange={(value) => edit((next) => { next.brief.job = value; })} />
          <Field label="A useful outcome" value={draft.brief.outcome} onChange={(value) => edit((next) => { next.brief.outcome = value; })} />
          <details><summary className="min-h-11 cursor-pointer text-sm text-starlight-muted">Copy, accessibility and product constraints</summary><div className="mt-3 space-y-5">{(['copyConstraints', 'accessibilityConstraints', 'productConstraints'] as const).map((key) => <Field key={key} label={key.replace('Constraints', ' constraints')} multiline value={draft.brief[key]} onChange={(value) => edit((next) => { next.brief[key] = value; })} />)}</div></details>
        </div>
      </section>
      <WebsiteGeneration canvasId={canvasId} draft={draft} disabled={busy || mediaBusy} apply={(proposal, baseState) => {
        if (busy || mediaBusy || !latestDraft.current || JSON.stringify(latestDraft.current) !== baseState || !preserveDraftBeforeReplacement()) return false;
        draftVersion.current += 1; setDraft(proposal); setDirty(true); setError('');
        setStatus('Generated directions added as a draft. The previous draft is retained; save and choose after reviewing.'); return true;
      }} />
      <section className="mt-10" aria-labelledby="directions-heading">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="directions-heading" className="text-2xl font-semibold">Ways the story could begin</h2><p className="mt-2 text-sm leading-6 text-starlight-muted">These are editable concepts. Make a choice after saving the version you reviewed.</p></div><p className="text-xs text-starlight-muted">{dirty ? 'Unsaved changes' : 'Saved locally'}</p></div>
        <div className="mt-6 grid gap-5 lg:grid-cols-3" data-testid="direction-options">{draft.options.map((option, index) => <article key={option.id} className={`flex min-w-0 flex-col rounded-xl border bg-starlight-surface p-6 ${accents[index % accents.length]}`}>
          <p className="text-sm font-medium">0{index + 1} · {option.title}</p>
          <h3 className="mt-7 text-2xl font-semibold leading-snug tracking-tight text-starlight-ink">{option.headline}</h3>
          <p className="mt-4 text-sm leading-7 text-starlight-muted">{option.body}</p>
          <p className="mt-6 border-t border-starlight-border pt-4 text-sm font-medium">{option.action} →</p>
          <p className="mt-5 text-sm leading-6 text-starlight-muted">{option.premise}</p>
          <p className="mt-4 text-xs leading-6 text-starlight-muted">Tradeoff: {option.tradeoff}</p>
          <div className="mt-auto flex flex-wrap gap-2 pt-6">
            <button type="button" className={button} aria-expanded={expanded === option.id} onClick={() => setExpanded(expanded === option.id ? undefined : option.id)}>Edit {option.title}</button>
            <button type="button" className={`${button} border-current`} aria-disabled={busy || dirty || !record} aria-pressed={!dirty && record?.selectionVerified && record?.selection?.optionId === option.id || false} onClick={() => void choose(option.id)}>Choose {option.title}</button>
          </div>
          {!dirty && record?.selectionVerified && record.selection?.optionId === option.id && <p className="mt-3 text-sm text-starlight-mint">Selected direction</p>}
          {expanded === option.id && <div className="mt-5 space-y-4 border-t border-starlight-border pt-5">{(['title', 'headline', 'body', 'action', 'premise', 'tradeoff'] as const).map((key) => <Field key={key} label={`${option.title}: ${key}`} multiline={['body', 'premise', 'tradeoff'].includes(key)} value={option[key]} onChange={(value) => edit((next) => { next.options[index]![key] = value; })} />)}
            {option.sectionCopy?.map((section, sectionIndex) => <div key={section.sectionId} className="space-y-3 border-t border-starlight-border pt-4"><p className="text-sm font-medium">{draft.sections.find((item) => item.id === section.sectionId)?.label}</p>{(['copy', 'action'] as const).map((key) => <Field key={key} label={`${option.title}: ${section.sectionId} ${key}`} multiline value={section[key]} onChange={(value) => edit((next) => { next.options[index]!.sectionCopy![sectionIndex]![key] = value; })} />)}</div>)}
            {option.sourceQuotes?.map((quote, quoteIndex) => <blockquote key={quoteIndex} className="border-l border-starlight-border pl-3 text-xs leading-6 text-starlight-muted">Retained source: {quote}</blockquote>)}
          </div>}
        </article>)}</div>
      </section>
      <section className="mt-12 grid gap-8 lg:grid-cols-[1.35fr_1fr]" aria-labelledby="page-heading">
        <div><h2 id="page-heading" className="text-2xl font-semibold">Give each section a purpose</h2><p className="mt-2 text-sm leading-6 text-starlight-muted">Review the page for the direction below. Copy and actions belong to that direction; routes and implementation constraints are shared.</p>
          {pageOption && <div className="mt-4 space-y-2"><label htmlFor={directionSelectId} className="block text-sm text-starlight-muted">Page direction</label><select id={directionSelectId} className={control} value={pageOption.id} onChange={(event) => setExpanded(event.target.value)}>{draft.options.map((option) => <option key={option.id} value={option.id}>{option.title}</option>)}</select></div>}
          <ol className="mt-6 space-y-4" data-testid="direction-page-sections">{pageSections.map((section) => <li key={section.id} className="rounded-lg border border-starlight-border bg-starlight-surface p-5"><div className="flex flex-wrap items-baseline justify-between gap-3"><h3 className="text-lg font-medium">{section.label}</h3><span className="text-sm text-starlight-accent">{section.route}</span></div><p className="mt-3 whitespace-pre-wrap text-sm leading-7">{section.copy}</p><p className="mt-3 text-sm leading-6 text-starlight-muted">Next action: {section.action}</p><p className="mt-2 text-sm leading-6 text-starlight-muted">{section.why}</p>
            <details className="mt-4"><summary className="min-h-11 cursor-pointer text-sm text-starlight-gold">Edit copy and implementation details</summary><div className="mt-3 space-y-4">{(['copy', 'action', 'why', 'responsive', 'route'] as const).map((key) => <Field key={key} label={`${section.label}: ${key}`} multiline={key !== 'route'} value={section[key]} onChange={(value) => edit((next) => {
              const optionCopy = next.options.find((option) => option.id === pageOption?.id)?.sectionCopy?.find((item) => item.sectionId === section.id);
              if (optionCopy && (key === 'copy' || key === 'action')) optionCopy[key] = value;
              else next.sections.find((item) => item.id === section.id)![key] = value;
            })} />)}<p className="break-all text-xs leading-6 text-starlight-muted">Proposed files: {section.files.join(', ') || 'Unresolved'}</p><ul className="space-y-2 text-xs leading-6 text-starlight-muted">{[...section.acceptance, ...section.accessibility].map((item, itemIndex) => <li key={itemIndex}>• {item}</li>)}</ul></div></details>
          </li>)}</ol>
        </div>
        <div className="space-y-6">
          <section className="rounded-lg border border-starlight-border bg-starlight-panel/70 p-6"><h2 className="text-lg font-semibold">The implementation belongs here</h2><div className="mt-5 space-y-4"><Field label="Owning repository" value={draft.target.repository ?? ''} onChange={(value) => edit((next) => { next.target.repository = value || undefined; next.target.status = value ? 'resolved' : 'unresolved'; })} /><Field label="Source issue" value={draft.target.issueUrl ?? ''} onChange={(value) => edit((next) => { next.target.issueUrl = value || undefined; })} /></div></section>
          <section className="rounded-lg border border-starlight-border p-6"><h2 className="text-lg font-semibold">Media with a reason to be here</h2>{draft.assets.length ? <ul className="mt-4 space-y-5">{draft.assets.map((asset) => <li key={asset.id} className="text-sm leading-6"><p className="break-all font-medium">{asset.reference} · {asset.status === 'ready' ? 'Declared ready' : 'Reference only'}</p><p className="text-starlight-muted">{asset.why}</p><p className="text-starlight-muted">{asset.responsive}</p><p className="text-starlight-muted">{asset.kind === 'image' ? `Alt: ${asset.alt ?? 'Missing'}` : `Transcript: ${asset.transcript ?? 'Missing'}`}</p><p className="break-all text-xs text-starlight-muted">Provenance: {asset.provenance?.sidecar ?? 'Not verified'}</p><details className="mt-4"><summary className="min-h-11 cursor-pointer text-sm text-starlight-gold">Edit placement text and references</summary><div className="mt-3 space-y-4">
            {(['reference', 'why', 'responsive', asset.kind === 'image' ? 'alt' : 'transcript'] as const).map((key) => <Field key={key} label={`${asset.id}: ${key === 'reference' ? 'media reference' : key === 'alt' ? 'image alternative' : key}`} multiline={key !== 'reference'} maxLength={key === 'reference' ? 512 : 4000} value={asset[key] ?? ''} onChange={(value) => edit((next) => { const changed = next.assets.find((item) => item.id === asset.id)!; changed[key] = value; if (key === 'reference') delete changed.mediaCheckReport; })} />)}
            {(['sidecar', 'generationLedger', 'tasteLedger'] as const).map((key) => <Field key={key} label={`${asset.id}: ${key === 'sidecar' ? 'sidecar reference' : key === 'generationLedger' ? 'generation ledger reference' : 'taste ledger reference'}`} maxLength={512} value={asset.provenance?.[key] ?? ''} onChange={(value) => edit((next) => { const changed = next.assets.find((item) => item.id === asset.id)!; changed.provenance ??= { sidecar: '', generationLedger: '', tasteLedger: '' }; changed.provenance[key] = value; delete changed.mediaCheckReport; })} />)}
          </div></details><WebsiteMediaEvidence key={JSON.stringify([draft.id, asset.id, asset.kind])} asset={asset} disabled={busy || mediaBusy} begin={beginMediaCheck} end={endMediaCheck} attach={attachMediaReport} /></li>)}</ul> : <p className="mt-3 text-sm leading-6 text-starlight-muted">No media proposed. Add approved references through a plan import or your agent; keep files in their existing asset home.</p>}</section>
          {!!record?.gaps.length && <section className="border-l-2 border-starlight-gold pl-5"><h2 className="text-lg font-semibold">Evidence still needed</h2><ul className="mt-3 space-y-3 text-sm leading-6 text-starlight-muted">{record.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul></section>}
          {record?.selection && record.selectionVerified && !dirty && <section className="rounded-lg border border-starlight-mint/30 bg-starlight-mint/5 p-6" data-testid="selected-website-direction"><h2 className="text-lg font-semibold">A decision you can carry forward</h2><p className="mt-3 text-sm leading-6">{record.plan.options.find((option) => option.id === record.selection?.optionId)?.title}</p><p className="mt-2 break-all text-xs leading-6 text-starlight-muted">Checkpoint {record.selection.checkpointId}</p><p className="mt-3 text-sm leading-6 text-starlight-muted">This records your local choice. Implementation and release still need their own checks.</p><div className="mt-5 flex flex-wrap gap-2"><button type="button" className={button} disabled={busy} onClick={() => void exportPacket('markdown')}>Download implementation brief</button><button type="button" className={button} disabled={busy} onClick={() => void exportPacket('json')}>Download packet JSON</button></div></section>}
        </div>
      </section>
      <footer className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-starlight-border py-6"><p className="max-w-xl text-sm leading-6 text-starlight-muted">Save keeps the editable plan in your canvas. Changes to the plan clear its earlier selection so the next build cites what you actually reviewed.</p><button type="button" className={`${button} border-starlight-gold/50 bg-starlight-gold/10 text-starlight-gold`} aria-disabled={busy || !dirty} onClick={() => void save()}>{unavailable ? 'Replace invalid plan with draft' : 'Save website plan'}</button></footer>
    </>}
  </main>;
}
