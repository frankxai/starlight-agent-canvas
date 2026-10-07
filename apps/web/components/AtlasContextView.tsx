'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ATLAS_CONTEXT_MAX_BYTES, atlasContextEvidence, atlasContextExample, atlasContextRefSchema, parseAtlasContext, type AtlasContext } from '@starlight-agent-canvas/core/atlas-context';

const storageKey = (id: string) => `starlight.atlas.context.v1:${id}`;
const button = 'min-h-11 rounded-lg border border-starlight-border px-4 py-2 text-sm text-starlight-ink active:bg-starlight-accent/10 disabled:cursor-wait disabled:opacity-50';
const sourceLink = 'inline-flex min-h-11 items-center break-all text-sm text-starlight-accent underline underline-offset-4';

export default function AtlasContextView({ contextRef }: { contextRef?: string }) {
  const router = useRouter();
  const [packet, setPacket] = useState<AtlasContext | null>(null);
  const [activeRef, setActiveRef] = useState(contextRef);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const generation = useRef(0);
  const alive = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusAfterImport = useRef(false);

  useEffect(() => {
    alive.current = true;
    if (contextRef) {
      try {
        if (!atlasContextRefSchema.safeParse(contextRef).success) throw new Error('Invalid reference.');
        const saved = sessionStorage.getItem(storageKey(contextRef));
        if (!saved) setError('This context is unavailable in this tab. Import its original packet to open it here.');
        else { const recovered = parseAtlasContext(saved); focusAfterImport.current = true; setPacket(recovered); setStatus('Recovered the local context. Source evidence is unchanged.'); }
      } catch { setError('This context could not be read safely. Its stored record was retained; import a valid packet to continue.'); }
    }
    setReady(true);
    const tick = window.setInterval(() => { if (document.visibilityState === 'visible') setNow(Date.now()); }, 15_000);
    const visible = () => { if (document.visibilityState === 'visible') setNow(Date.now()); };
    document.addEventListener('visibilitychange', visible);
    return () => { alive.current = false; generation.current++; window.clearInterval(tick); document.removeEventListener('visibilitychange', visible); };
  }, [contextRef]);

  useEffect(() => {
    if (packet && focusAfterImport.current) { heading.current?.focus(); focusAfterImport.current = false; }
  }, [packet]);

  function accept(next: AtlasContext) {
    // Persist before replacing the visible context or navigating. Old references
    // remain intact so interrupted/back navigation can recover their evidence.
    const id = crypto.randomUUID();
    sessionStorage.setItem(storageKey(id), JSON.stringify(next));
    setPacket(next); setActiveRef(id); setNow(Date.now()); setError('');
    setStatus('Context retained in this tab. Only an opaque reference appears in its address.');
    focusAfterImport.current = true;
    router.push(`/context/${id}`, { scroll: false });
  }

  async function importFile(file: File | undefined) {
    if (!file || busy) return;
    const ownGeneration = ++generation.current;
    setBusy(true); setError('');
    try {
      if (file.size > ATLAS_CONTEXT_MAX_BYTES) throw new Error('Oversized packet.');
      const contents = await file.text();
      if (!alive.current || generation.current !== ownGeneration) return;
      const next = parseAtlasContext(contents);
      accept(next);
    } catch {
      if (alive.current && generation.current === ownGeneration) setError('Import held. Use a valid Atlas context under 64 KB with supported fields and safe source references; check that tab storage is available. Your previous context is retained.');
    } finally { if (alive.current && generation.current === ownGeneration) setBusy(false); }
  }

  function loadExample() {
    if (busy) return;
    try { accept(parseAtlasContext(atlasContextExample)); }
    catch { setError('Tab storage is unavailable. The previous context is retained.'); }
  }

  function forget() {
    if (busy || !activeRef) return;
    try {
      sessionStorage.removeItem(storageKey(activeRef));
      generation.current++; setPacket(null); setActiveRef(undefined); setError(''); setStatus('This context was removed from tab storage. Other imported contexts remain intact.');
      router.replace('/context');
    } catch { setError('Could not remove this context. It remains in tab storage.'); }
  }

  const evidence = packet ? atlasContextEvidence(packet, now) : null;
  return <main data-testid="atlas-context" className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
    <nav aria-label="Context navigation" className="mb-10 flex flex-wrap items-center justify-between gap-4 text-sm">
      <a href="/" className="inline-flex min-h-11 items-center gap-2 text-starlight-muted"><span aria-hidden="true">←</span> Return to canvas</a>
      <span className="text-starlight-mint">Atlas context · read only</span>
    </nav>
    <header className="mb-9 max-w-3xl">
      <p className="mb-3 text-sm text-starlight-gold">A thread worth keeping</p>
      <h1 className="text-3xl font-semibold tracking-tight text-starlight-ink sm:text-5xl">Carry the context into your next idea.</h1>
      <p className="mt-5 max-w-2xl text-base leading-7 text-starlight-muted">Open one entity from your Atlas. Keep its sources and open questions together while you decide what to make next.</p>
    </header>
    <section aria-label="Open Atlas context" className="mb-7 rounded-xl border border-starlight-border bg-starlight-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-end gap-4">
        <label className="min-w-0 flex-1 text-sm text-starlight-ink">Import Atlas context
          <input type="file" accept=".json,application/json" disabled={busy || !ready} className="mt-2 block min-h-11 w-full max-w-full rounded-lg border border-starlight-border p-2 text-sm file:mr-3 file:min-h-9 file:rounded file:border-0 file:bg-starlight-accent/15 file:px-3 file:text-starlight-ink"
            onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void importFile(file); }} />
        </label>
        <button type="button" className={button} disabled={busy || !ready} onClick={loadExample}>Open public-source example</button>
      </div>
      <p className="mt-4 text-sm leading-6 text-starlight-muted">The packet stays in tab storage. Browser duplication or session restore may retain a copy. Its address contains only an opaque reference; the address alone cannot transfer the context.</p>
      <p role="status" className="mt-3 text-sm text-starlight-mint">{busy ? 'Reading your packet…' : status || (ready ? 'Ready for a source-backed context.' : 'Opening local context…')}</p>
      {error && <p role="alert" className="mt-3 text-sm leading-6 text-starlight-gold">{error}</p>}
    </section>
    {packet && evidence ? <>
      <section aria-labelledby="context-heading" className="rounded-xl border border-starlight-accent/30 bg-starlight-surface p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="mb-2 text-sm text-starlight-accent">{packet.entity.type.replaceAll('_', ' ')}</p>
            <h2 id="context-heading" ref={heading} tabIndex={-1} className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">{packet.entity.label}</h2>
            <p className="mt-3 break-all font-mono text-xs text-starlight-muted">{packet.entity.id}</p>
          </div>
          <button type="button" className={button} onClick={forget}>Forget this context</button>
        </div>
        <div className="mt-6 grid gap-5 border-t border-starlight-border pt-5 sm:grid-cols-2">
          <div><h3 className="text-sm font-medium">Freshness: <span className="text-starlight-gold">{evidence.freshness}</span></h3><p className="mt-2 text-sm leading-6 text-starlight-muted">{evidence.reason} Freshness describes the observation age; it does not verify the claim.</p></div>
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
          {evidence.missingSources ? <p className="mt-3 text-sm text-starlight-gold">No source references were supplied. The entity remains unresolved.</p> : <ul className="mt-3 space-y-1">{packet.sources.map((url, index) => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className={sourceLink}>Source {index + 1}: {url}</a></li>)}</ul>}
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
            <p className="mt-3 text-xs text-starlight-gold">{evidence.conflictingClaimIds.includes(claim.id) ? 'Conflicting claim' : `Producer evidence: ${claim.evidence.replaceAll('_', ' ')}`}</p>
            <p className="mt-2 break-all font-mono text-xs text-starlight-muted">{claim.id}</p>
            {claim.sourceUrl && <a href={claim.sourceUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className={sourceLink}>Claim source</a>}
          </li>)}</ul>}
        </section>
        <section aria-labelledby="relationships-heading" className="min-w-0 rounded-xl border border-starlight-border bg-starlight-surface p-5 sm:p-6">
          <h2 id="relationships-heading" className="text-lg font-semibold">Connected work</h2>
          <p className="mt-2 text-sm leading-6 text-starlight-muted">Relationship IDs preserve the source graph. Targets have not been loaded or merged into Canvas.</p>
          {packet.relationships.length === 0 ? <p className="mt-5 text-sm text-starlight-muted">No relationships supplied.</p> : <ul className="mt-5 space-y-4">{packet.relationships.map((edge) => <li key={edge.id} className="rounded-lg border border-starlight-border p-4">
            <h3 className="text-sm font-medium">{edge.relation.replaceAll('_', ' ')}</h3><p className="mt-2 break-all font-mono text-sm">{edge.targetId}</p>
            <p className="mt-3 text-xs leading-5 text-starlight-gold">{edge.evidence === 'source' ? 'Source-reported relationship' : edge.evidence === 'proposed' ? 'Proposed relationship' : 'Conflicting relationship'} · target unresolved</p>
            {edge.sourceUrl && <a href={edge.sourceUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className={sourceLink}>Relationship source</a>}
          </li>)}</ul>}
        </section>
      </div>
    </> : ready && <section className="rounded-xl border border-dashed border-starlight-border p-6 sm:p-8"><h2 className="text-lg font-semibold">Start with one meaningful connection.</h2><p className="mt-3 max-w-2xl text-sm leading-7 text-starlight-muted">Import an exported entity packet, or explore the public-source example. Keep the product, its evidence and its next open decision close enough to understand together.</p></section>}
    <footer className="mt-8 border-t border-starlight-border pt-5 text-xs leading-6 text-starlight-muted">This receiving-side pilot keeps a disposable context view. Atlas, SIS and your source documents retain their authority. A verified one-click Atlas export and return link are still pending.</footer>
  </main>;
}
