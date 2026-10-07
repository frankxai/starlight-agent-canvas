'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ATLAS_CONTEXT_MAX_BYTES, ATLAS_CONTEXT_MAX_RETAINED, atlasContextEvidence, atlasContextExample, atlasContextImportError, atlasContextMarkdown, atlasContextRefSchema, parseAtlasContext, type AtlasContext } from '@starlight-agent-canvas/core/atlas-context';

const storageKey = (id: string) => `starlight.atlas.context.v1:${id}`;
const noticeKey = 'starlight.atlas.notice.v1';
type UiNotice = { kind: 'imported' | 'opened' | 'removed' | 'removed_all'; id?: string; createdAt: number };
function clearNotice() {
  try { sessionStorage.removeItem(noticeKey); } catch { /* Cosmetic receipts never gate source operations. */ }
}
function writeNotice(kind: UiNotice['kind'], id?: string) {
  try { sessionStorage.setItem(noticeKey, JSON.stringify({ kind, id, createdAt: Date.now() })); }
  catch { clearNotice(); }
}
function readNotice(): Partial<UiNotice> {
  try {
    const raw = sessionStorage.getItem(noticeKey);
    // Consume even an interrupted/stale receipt. It never becomes source data.
    sessionStorage.removeItem(noticeKey);
    if (!raw || raw.length > 256) return {};
    const parsed = JSON.parse(raw) as UiNotice;
    if (!parsed || !['imported', 'opened', 'removed', 'removed_all'].includes(parsed.kind) || !Number.isFinite(parsed.createdAt)) return {};
    const age = Date.now() - parsed.createdAt;
    if (age < 0 || age > 30_000 || (parsed.id !== undefined && !atlasContextRefSchema.safeParse(parsed.id).success)) return {};
    return parsed;
  } catch { return {}; }
}
class InventoryScanLimitError extends Error {}
function retainedRefs(): string[] {
  if (sessionStorage.length > 2000) throw new InventoryScanLimitError('Tab storage inventory exceeds the bounded scan.');
  const result: string[] = [];
  for (let index = 0; index < sessionStorage.length; index++) {
    const key = sessionStorage.key(index);
    if (key?.startsWith('starlight.atlas.context.v1:')) {
      const id = key.slice('starlight.atlas.context.v1:'.length);
      if (atlasContextRefSchema.safeParse(id).success) result.push(id);
    }
  }
  return result;
}
type RetainedContext = { id: string; packet: AtlasContext | null };
function readRetainedContexts() {
  const ids = retainedRefs().sort();
  const contexts: RetainedContext[] = [];
  // The storage cap also bounds parsing. An externally edited inventory can
  // exceed it; expose that condition without pruning or reading every payload.
  for (const id of ids.slice(0, ATLAS_CONTEXT_MAX_RETAINED)) {
    const saved = sessionStorage.getItem(storageKey(id));
    let packet: AtlasContext | null = null;
    try { if (saved !== null) packet = parseAtlasContext(saved); }
    catch { /* Keep invalid records opaque. Never render their rejected values. */ }
    contexts.push({ id, packet });
  }
  return { count: ids.length, contexts };
}
function randomReference() {
  // getRandomValues also works on an explicitly enabled HTTP LAN view.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 15) | 64; bytes[8] = (bytes[8]! & 63) | 128;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
const button = 'min-h-11 rounded-lg border border-starlight-border px-4 py-2 text-sm text-starlight-ink active:bg-starlight-accent/10 disabled:cursor-wait disabled:opacity-50';
const sourceLink = 'inline-flex min-h-11 items-center break-all text-sm text-starlight-accent underline underline-offset-4';

export default function AtlasContextView({ contextRef }: { contextRef?: string }) {
  const router = useRouter();
  const [packet, setPacket] = useState<AtlasContext | null>(null);
  const [activeRef, setActiveRef] = useState(contextRef);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openingRef, setOpeningRef] = useState<string>();
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [retainedCount, setRetainedCount] = useState<number | null>(null);
  const [retainedContexts, setRetainedContexts] = useState<RetainedContext[]>([]);
  const [inventoryFailure, setInventoryFailure] = useState<'scan_limit' | 'access' | null>(null);
  const [savedOpen, setSavedOpen] = useState(!contextRef);
  const generation = useRef(0);
  const alive = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const refreshButton = useRef<HTMLButtonElement>(null);
  const focusAfterImport = useRef(false);
  const focusAfterCancel = useRef(false);
  const initialNotice = useRef<Partial<UiNotice> | null>(null);

  useEffect(() => {
    alive.current = true;
    setOpeningRef(undefined);
    // Keyed route instances consume once. React's development effect replay
    // reuses that receipt rather than reading a second, now-empty copy.
    const notice = initialNotice.current ?? (initialNotice.current = readNotice());
    // A reload/back arrival must not replay a saved-link focus intent left by an
    // aborted navigation. SPA import/removal receipts remain their own actions.
    const openedBySelection = notice.kind === 'opened' && notice.id === contextRef && (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type === 'navigate';
    refreshRetained();
    if (contextRef) {
      try {
        if (!atlasContextRefSchema.safeParse(contextRef).success) throw new Error('Invalid reference.');
        const saved = sessionStorage.getItem(storageKey(contextRef));
        if (!saved) setError('This context is unavailable in this tab. Import its original packet to open it here.');
        else {
          try {
            const recovered = parseAtlasContext(saved);
            focusAfterImport.current = (notice.kind === 'imported' && notice.id === contextRef) || openedBySelection;
            setPacket(recovered);
            setStatus(openedBySelection ? 'Opened the saved context. Source evidence is unchanged.' : focusAfterImport.current ? 'Context retained in this tab. Only an opaque reference appears in its address.' : 'Recovered the local context. Source evidence is unchanged.');
          } catch { setError('Stored context did not pass validation. Its original record was retained; import a valid packet to continue.'); }
        }
      } catch { setError('Context storage could not be accessed safely. No existing record has been changed.'); }
    } else if (notice.kind === 'removed' || notice.kind === 'removed_all') {
      setStatus(notice.kind === 'removed_all' ? 'All retained Atlas contexts were removed from this tab.' : 'This context was removed from tab storage. Other imported contexts remain intact.');
      focusAfterImport.current = true;
    }
    setReady(true);
    const tick = window.setInterval(() => { if (document.visibilityState === 'visible') setNow(Date.now()); }, 15_000);
    const visible = () => { if (document.visibilityState === 'visible') setNow(Date.now()); };
    document.addEventListener('visibilitychange', visible);
    return () => { alive.current = false; generation.current++; window.clearInterval(tick); document.removeEventListener('visibilitychange', visible); };
  }, [contextRef]);

  useEffect(() => {
    if (ready && focusAfterImport.current) {
      (packet ? heading : pageHeading).current?.focus(); focusAfterImport.current = false;
    }
  }, [packet, ready, contextRef, activeRef, retainedCount]);
  useEffect(() => { if (!busy && focusAfterCancel.current) { fileInput.current?.focus(); focusAfterCancel.current = false; } }, [busy]);

  function refreshRetained() {
    try {
      const inventory = readRetainedContexts();
      setRetainedCount(inventory.count); setRetainedContexts(inventory.contexts);
      setInventoryFailure(null);
      return true;
    } catch (problem) {
      setRetainedCount(null); setRetainedContexts([]);
      setInventoryFailure(problem instanceof InventoryScanLimitError ? 'scan_limit' : 'access');
      return false;
    }
  }

  function openRetained(event: MouseEvent<HTMLAnchorElement>, id: string) {
    if (busy || openingRef) { event.preventDefault(); return; }
    setStatus('');
    try {
      const saved = sessionStorage.getItem(storageKey(id));
      if (saved === null) {
        event.preventDefault(); refreshRetained();
        setError('This saved context is no longer in tab storage. The current view is unchanged; import its original file to recover it.');
        return;
      }
      try { parseAtlasContext(saved); }
      catch {
        event.preventDefault(); refreshRetained();
        setError('This saved context no longer passes validation. Its record and the current view are unchanged. Import the original file, or forget only this retained copy.');
        return;
      }
      // Native links keep browser navigation/stop/back behavior and avoid
      // background prefetch. Modified clicks never write a focus receipt.
      if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        if (packet && id === activeRef && contextRef === activeRef) {
          event.preventDefault(); heading.current?.focus();
          setStatus('This context is already open. Source evidence is unchanged.');
        } else writeNotice('opened', id);
      }
      setError('');
    } catch {
      event.preventDefault(); refreshRetained();
      setError('Saved context could not be opened safely. Tab storage may be unavailable. The current view is unchanged and no source record was changed.');
    }
  }

  function accept(next: AtlasContext) {
    // Persist before replacing the visible context or navigating. Old references
    // remain intact so interrupted/back navigation can recover their evidence.
    const existing = retainedRefs();
    if (existing.length >= ATLAS_CONTEXT_MAX_RETAINED) throw new Error('Retention limit.');
    const id = randomReference();
    sessionStorage.setItem(storageKey(id), JSON.stringify(next));
    writeNotice('imported', id);
    refreshRetained();
    setOpeningRef(id); setError('');
    setStatus('Context retained. Opening its focused view; the previous context remains available until navigation finishes.');
    router.push(`/context/${id}`, { scroll: false });
  }

  async function importFile(file: File | undefined) {
    if (!file || busy || openingRef) return;
    const ownGeneration = ++generation.current;
    setBusy(true); setError('');
    try {
      if (file.size > ATLAS_CONTEXT_MAX_BYTES) throw new Error('Oversized packet.');
      const contents = await file.text();
      if (!alive.current || generation.current !== ownGeneration) return;
      let next: AtlasContext;
      try { next = parseAtlasContext(contents); }
      catch (validationError) { setError(`Import held. ${atlasContextImportError(validationError)} Your previous context is retained.`); return; }
      accept(next);
    } catch (problem) {
      if (alive.current && generation.current === ownGeneration) setError(problem instanceof InventoryScanLimitError ? 'Import held. Tab storage has more than 2000 keys, so scanning is held. Keep your original file and inspect tab storage before removing unrelated entries. The current view is unchanged.' : 'Import held. Use a packet under 64 KB and available tab storage (at most 32 retained contexts). Save the current context before clearing retained copies. Your previous context is retained.');
    } finally { if (alive.current && generation.current === ownGeneration) setBusy(false); }
  }

  function loadExample() {
    if (busy || openingRef) return;
    try { accept(parseAtlasContext(atlasContextExample)); }
    catch (problem) { setError(problem instanceof InventoryScanLimitError ? 'Tab storage has more than 2000 keys, so example import is held. Keep your original files and inspect tab storage before removing unrelated entries. The current view is unchanged.' : 'Tab storage is unavailable or its 32-context limit is reached. Save the current context before clearing retained copies. Your previous context is retained.'); }
  }

  function cancelImport() { generation.current++; focusAfterCancel.current = true; setBusy(false); setStatus('Import cancelled. The previous context is retained.'); }

  function download(format: 'json' | 'markdown') {
    if (!packet) return;
    try {
      const blob = new Blob([format === 'json' ? JSON.stringify(packet) : atlasContextMarkdown(packet)], { type: format === 'json' ? 'application/json' : 'text/markdown' });
      const url = URL.createObjectURL(blob); const link = document.createElement('a');
      link.href = url; link.download = `atlas-context.${format === 'json' ? 'json' : 'md'}`;
      document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus('Context download prepared. It contains source context; keep it local or share it only with your intended recipient.');
    } catch { setError('Context download could not be prepared. The retained context is unchanged.'); }
  }

  function forget(id = activeRef) {
    if (busy || openingRef || !id) return;
    try {
      const isCurrent = id === activeRef;
      sessionStorage.removeItem(storageKey(id));
      if (sessionStorage.getItem(storageKey(id)) !== null) throw new Error('Removal did not persist.');
      refreshRetained();
      if (!isCurrent) {
        setError(''); setStatus('Retained context removed from this tab. The current view is unchanged.');
        refreshButton.current?.focus();
        return;
      }
      writeNotice('removed', id);
      generation.current++; setPacket(null); setActiveRef(undefined); setError(''); setStatus('This context was removed from tab storage. Other imported contexts remain intact.');
      router.replace('/context');
    } catch {
      setStatus('');
      setError('Removal could not finish. Inspect tab storage before relying on erasure; the original import file is unchanged.');
    }
  }

  function forgetAll() {
    if (busy || openingRef) return;
    try {
      const refs = retainedRefs();
      if (!refs.length || !window.confirm(`Remove all ${refs.length} retained Atlas contexts from this tab? Keep their original files or downloads for later.`)) return;
      for (const id of refs) {
        sessionStorage.removeItem(storageKey(id));
        if (sessionStorage.getItem(storageKey(id)) !== null) throw new Error('Removal did not persist.');
      }
      if (contextRef) writeNotice('removed_all');
      else clearNotice();
      generation.current++; setPacket(null); setActiveRef(undefined); setRetainedCount(0); setRetainedContexts([]); setError('');
      setStatus('All retained Atlas contexts were removed from this tab.');
      focusAfterImport.current = true;
      router.replace('/context');
    } catch {
      setStatus('');
      refreshRetained();
      setError('Could not remove every context. Some records may remain; inspect tab storage before relying on erasure.');
    }
  }

  const evidence = packet ? atlasContextEvidence(packet, now) : null;
  return <main data-testid="atlas-context" className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
    <nav aria-label="Context navigation" className="mb-10 flex flex-wrap items-center justify-between gap-4 text-sm">
      <a href="/" className="inline-flex min-h-11 items-center gap-2 text-starlight-muted"><span aria-hidden="true">←</span> Return to canvas</a>
      <span className="text-starlight-mint">Atlas context · read only</span>
    </nav>
    <header className="mb-9 max-w-3xl">
      <p className="mb-3 text-sm text-starlight-gold">A thread worth keeping</p>
      <h1 ref={pageHeading} tabIndex={-1} className="text-3xl font-semibold tracking-tight text-starlight-ink outline-starlight-accent focus-visible:outline sm:text-5xl">Carry the context into your next idea.</h1>
      <p className="mt-5 max-w-2xl text-base leading-7 text-starlight-muted">Open one entity from your Atlas. Keep its sources and open questions together while you decide what to make next.</p>
    </header>
    <section aria-label="Open Atlas context" className="mb-7 rounded-xl border border-starlight-border bg-starlight-surface p-5 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="min-w-0 text-sm text-starlight-ink">Import Atlas context
          <input ref={fileInput} type="file" accept=".json,application/json" disabled={busy || Boolean(openingRef) || !ready} className="mt-2 block min-h-11 w-full max-w-full rounded-lg border border-starlight-border p-2 text-sm file:mr-3 file:min-h-9 file:rounded file:border-0 file:bg-starlight-accent/15 file:px-3 file:text-starlight-ink"
            onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void importFile(file); }} />
        </label>
        <button type="button" className={button} disabled={busy || Boolean(openingRef) || !ready} onClick={loadExample}>Open public-source example</button>
        {busy && <button type="button" className={button} onClick={cancelImport}>Cancel import</button>}
      </div>
      <p className="mt-4 text-sm leading-6 text-starlight-muted">The packet stays in tab storage. Browser duplication or session restore may retain a copy. Its address contains only an opaque reference; the address alone cannot transfer the context.</p>
      {openingRef && <a className={sourceLink} href={`/context/${openingRef}`}>Open the retained context if navigation was interrupted</a>}
      <p role="status" className="mt-3 text-sm text-starlight-mint">{busy ? 'Reading your packet…' : status || (ready ? 'Ready for a source-backed context.' : 'Opening local context…')}</p>
      {error && <p role="alert" className="mt-3 text-sm leading-6 text-starlight-gold">{error}</p>}
    </section>
    <details open={savedOpen} onToggle={(event) => setSavedOpen(event.currentTarget.open)} className="mb-7 border-y border-starlight-border py-3">
      <summary className="min-h-11 cursor-pointer rounded text-sm font-medium text-starlight-ink outline-starlight-accent focus-visible:outline">Saved in this tab <span className="ml-2 text-starlight-muted">{ready ? `Retained contexts: ${retainedCount ?? 'unavailable'}` : 'Opening saved contexts…'}</span></summary>
      <section aria-label="Saved contexts" className="pb-3 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-starlight-muted">Up to 32 contexts; no automatic pruning.</p>
          <button ref={refreshButton} type="button" className={button} disabled={busy || Boolean(openingRef) || !ready} onClick={() => {
            if (refreshRetained()) { setError(''); setStatus('Saved context list refreshed. Source evidence is unchanged.'); }
            else { setStatus(''); setError('Tab storage could not be read within its limits. The current view is unchanged; no source record was changed.'); }
          }}>Refresh saved contexts</button>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-starlight-muted">Open saved packets in this tab. Observation age comes from their producer; saving a copy does not make its evidence newer. A new tab may not have the packet.</p>
        {!ready ? <p className="mt-4 text-sm leading-6 text-starlight-muted">Checking this tab for saved contexts…</p> : retainedCount === null ? <p className="mt-4 text-sm leading-6 text-starlight-gold">{inventoryFailure === 'scan_limit' ? 'Tab storage has more than 2000 keys, so list scanning is held. Keep your original files or download the current context. Inspect tab storage before removing unrelated entries, then refresh.' : 'The saved list could not be read. The current view remains available. Allow tab storage, then refresh the list.'}</p> : retainedCount === 0 ? <p className="mt-4 text-sm leading-6 text-starlight-muted">Your imported contexts will appear here. Keep their original files or download a brief before forgetting a copy.</p> : <>
          {retainedCount > ATLAS_CONTEXT_MAX_RETAINED && <p className="mt-4 text-sm leading-6 text-starlight-gold">The inventory exceeds the 32-context limit. Only 32 records are listed; every record remains in storage. Remove a retained copy and refresh to reveal more.</p>}
          <ul className="mt-4 divide-y divide-starlight-border">
            {retainedContexts.map((item) => {
              const savedEvidence = item.packet ? atlasContextEvidence(item.packet, now) : null;
              return <li key={item.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div className="min-w-0">
                  {item.packet ? <>
                    <a href={`/context/${item.id}`} rel="noopener" referrerPolicy="no-referrer" aria-current={activeRef === item.id && packet ? 'page' : undefined} aria-disabled={busy || Boolean(openingRef)} tabIndex={busy || openingRef ? -1 : undefined} onClick={(event) => openRetained(event, item.id)} className="block min-h-11 content-center break-words rounded text-base font-medium text-starlight-accent underline underline-offset-4 aria-disabled:opacity-50">{item.packet.entity.label}</a>
                    <p className="mt-1 text-sm text-starlight-muted">{item.packet.entity.type.replaceAll('_', ' ')} · Observation {savedEvidence?.freshness}{activeRef === item.id && packet ? ' · Open now' : ''}</p>
                    {Boolean(savedEvidence?.conflictingClaimIds.length) && <p className="mt-2 text-sm text-starlight-gold">{savedEvidence?.conflictingClaimIds.length} conflicting claims retained</p>}
                    <p className="mt-2 break-all font-mono text-xs leading-5 text-starlight-muted">{item.packet.entity.id}</p>
                    <p className="mt-1 break-all text-xs leading-5 text-starlight-muted">Observed: {item.packet.observedAt || 'Unknown'}</p>
                  </> : <>
                    <p className="text-sm font-medium text-starlight-gold">Saved context unavailable</p>
                    <p className="mt-2 text-sm leading-6 text-starlight-muted">Its packet could not be validated. The original record is retained; import a valid file to recover the context.</p>
                  </>}
                  <p className="mt-2 break-all font-mono text-xs leading-5 text-starlight-muted">Tab reference: {item.id}</p>
                </div>
                <button type="button" className={button} disabled={busy || Boolean(openingRef)} aria-label={`Forget saved copy, reference ${item.id}`} onClick={() => {
                  if (window.confirm('Remove only this retained Atlas context from this tab? Keep its original file or download for later.')) forget(item.id);
                }}>Forget saved copy</button>
              </li>;
            })}
          </ul>
          <button type="button" className={`${button} mt-4`} disabled={busy || Boolean(openingRef)} onClick={forgetAll}>Forget all retained contexts</button>
        </>}
      </section>
    </details>
    {packet && evidence ? <>
      <section aria-labelledby="context-heading" className="rounded-xl border border-starlight-accent/30 bg-starlight-surface p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="mb-2 text-sm text-starlight-accent">{packet.entity.type.replaceAll('_', ' ')}</p>
            <h2 id="context-heading" ref={heading} tabIndex={-1} className="break-words text-2xl font-semibold tracking-tight outline-starlight-accent focus-visible:outline sm:text-3xl">{packet.entity.label}</h2>
            <p className="mt-3 break-all font-mono text-xs text-starlight-muted">{packet.entity.id}</p>
          </div>
          <button type="button" className={button} disabled={busy || Boolean(openingRef)} onClick={() => forget()}>Forget this context</button>
        </div>
        <div className="mt-5 flex flex-wrap gap-3"><button type="button" className={button} onClick={() => download('markdown')}>Download context brief</button><button type="button" className={button} onClick={() => download('json')}>Download context JSON</button></div>
        <div className="mt-6 grid gap-5 border-t border-starlight-border pt-5 sm:grid-cols-2">
          <div><h3 className="text-sm font-medium">Freshness: <span className="text-starlight-gold">{evidence.freshness}</span></h3>{evidence.ageSeconds !== null && <p className="mt-2 text-xs tabular-nums text-starlight-muted">Observed {evidence.ageSeconds < 60 ? `${evidence.ageSeconds} seconds` : evidence.ageSeconds < 86400 ? `${Math.floor(evidence.ageSeconds / 60)} minutes` : `${Math.floor(evidence.ageSeconds / 86400)} days`} ago</p>}<p className="mt-2 text-sm leading-6 text-starlight-muted">{evidence.reason} Freshness describes the observation age; it does not verify the claim.</p></div>
          <dl className="space-y-2 text-sm text-starlight-muted">
            <div><dt className="inline text-starlight-ink">Observed: </dt><dd className="inline break-all">{packet.observedAt || 'Unknown'}</dd></div>
            <div><dt className="inline text-starlight-ink">Verification time, producer reported: </dt><dd className="inline break-all">{packet.verifiedAt || 'Unknown'}</dd></div>
            <div><dt className="inline text-starlight-ink">Owner: </dt><dd className="inline break-all">{packet.owner?.id || 'Unresolved'}</dd></div>
            <div><dt className="inline text-starlight-ink">Owner freshness window: </dt><dd className="inline">{packet.owner?.ttlSeconds === undefined ? 'Unspecified' : `${packet.owner.ttlSeconds} seconds`}</dd></div>
          </dl>
        </div>
        {evidence.conflict && <p className="mt-5 rounded-lg border border-starlight-gold/35 p-4 text-sm leading-6 text-starlight-gold">Conflicting evidence is retained below. Resolve it with the source owner before relying on this context.</p>}
        {['missing', 'failed'].includes(packet.evidence) && <p className="mt-5 text-sm text-starlight-gold">Producer evidence is {packet.evidence}. This observation cannot establish a current result.</p>}
        <div className="mt-6 border-t border-starlight-border pt-5">
          <h3 className="font-medium">Where the context came from</h3>
          <p className="mt-2 break-all text-sm leading-6 text-starlight-muted">{packet.source.system} · revision {packet.source.revision || 'unreported'} · producer evidence: {packet.evidence.replaceAll('_', ' ')}</p>
          {evidence.missingSources ? <p className="mt-3 text-sm text-starlight-gold">No source references were supplied. The entity remains unresolved.</p> : <ul className="mt-3 space-y-1">{packet.sources.map((url, index) => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className={sourceLink}>Source {index + 1}: {url}<span className="sr-only"> (opens in a new tab)</span></a></li>)}</ul>}
          <p className="mt-3 text-xs leading-5 text-starlight-muted">Source links open only when you choose them. Canvas has not fetched them or verified their ownership, access, privacy or current contents.</p>
        </div>
      </section>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section aria-labelledby="claims-heading" className="min-w-0 rounded-xl border border-starlight-border bg-starlight-surface p-5 sm:p-6">
          <h2 id="claims-heading" className="text-lg font-semibold">Claims to carry carefully</h2>
          <p className="mt-2 text-sm leading-6 text-starlight-muted">Producer reports remain separate. A timestamp or imported label grants no approval.</p>
          {packet.claims.length === 0 ? <p className="mt-5 text-sm text-starlight-muted">No claims supplied.</p> : <ul className="mt-5 space-y-4">{packet.claims.map((claim) => <li key={claim.id} className="rounded-lg border border-starlight-border p-4">
            <h3 className="text-sm font-medium">{claim.property.replaceAll('_', ' ')}</h3>
            <p className="mt-2 break-words text-sm leading-6">{claim.value}</p>
            <p className="mt-3 text-xs text-starlight-gold">{evidence.conflictingClaimIds.includes(claim.id) ? 'Conflicting claim · producer evidence: ' : 'Producer evidence: '}{claim.evidence.replaceAll('_', ' ')}</p>
            <p className="mt-2 break-all font-mono text-xs text-starlight-muted">{claim.id}</p>
            {claim.sourceUrl && <a href={claim.sourceUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" aria-label={`Claim source for ${claim.property} claim ${claim.id} (opens in a new tab)`} className={sourceLink}>Claim source <span aria-hidden="true">↗</span></a>}
          </li>)}</ul>}
        </section>
        <section aria-labelledby="relationships-heading" className="min-w-0 rounded-xl border border-starlight-border bg-starlight-surface p-5 sm:p-6">
          <h2 id="relationships-heading" className="text-lg font-semibold">Connected work</h2>
          <p className="mt-2 text-sm leading-6 text-starlight-muted">Relationship IDs preserve the source graph. Targets have not been loaded or merged into Canvas.</p>
          {packet.relationships.length === 0 ? <p className="mt-5 text-sm text-starlight-muted">No relationships supplied.</p> : <ul className="mt-5 space-y-4">{packet.relationships.map((edge) => <li key={edge.id} className="rounded-lg border border-starlight-border p-4">
            <h3 className="text-sm font-medium">{edge.relation.replaceAll('_', ' ')}</h3><p className="mt-2 break-all font-mono text-sm">{edge.targetId}</p>
            <p className="mt-3 text-xs leading-5 text-starlight-gold">{edge.evidence === 'source' ? 'Source-reported relationship' : edge.evidence === 'proposed' ? 'Proposed relationship' : 'Conflicting relationship'} · target unresolved</p>
            {edge.sourceUrl && <a href={edge.sourceUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" aria-label={`Relationship source for ${edge.relation} relationship ${edge.id} (opens in a new tab)`} className={sourceLink}>Relationship source <span aria-hidden="true">↗</span></a>}
          </li>)}</ul>}
        </section>
      </div>
    </> : ready && <section className="rounded-xl border border-dashed border-starlight-border p-6 sm:p-8"><h2 className="text-lg font-semibold">Start with one meaningful connection.</h2><p className="mt-3 max-w-2xl text-sm leading-7 text-starlight-muted">Import an exported entity packet, or explore the public-source example. Keep the product, its evidence and its next open decision close enough to understand together.</p></section>}
    <footer className="mt-8 border-t border-starlight-border pt-5 text-xs leading-6 text-starlight-muted">This receiving-side pilot keeps a disposable context view. Atlas, SIS and your source documents retain their authority. A verified one-click Atlas export and return link are still pending.</footer>
  </main>;
}
