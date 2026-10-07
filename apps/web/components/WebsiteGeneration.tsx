'use client';

import { useEffect, useRef, useState } from 'react';
import type { WebsitePlan } from '@starlight-agent-canvas/core';
import { parseWebsitePlan, websiteGenerationInput } from '@starlight-agent-canvas/core/website';

type Configuration = { enabled: boolean; provider: string | null; model: string | null; boundary: string };
type Proposal = { plan: WebsitePlan; base: string };
const button = 'inline-flex min-h-11 items-center justify-center rounded-md border border-starlight-border px-4 py-2 text-sm font-medium hover:border-starlight-accent disabled:opacity-40';

export default function WebsiteGeneration({ canvasId, draft, disabled, apply }: { canvasId: string; draft: WebsitePlan; disabled: boolean; apply: (plan: WebsitePlan, base: string) => boolean }) {
  const url = `/api/canvases/${encodeURIComponent(canvasId)}/website/generate`;
  const key = `starlight.website.proposal.v1:${canvasId}`;
  const operation = useRef<AbortController | null>(null);
  const serial = useRef(0); const alive = useRef(true); const storageHeld = useRef(false);
  const [configuration, setConfiguration] = useState<Configuration>();
  const [proposal, setProposal] = useState<Proposal>();
  const [running, setRunning] = useState(false); const [message, setMessage] = useState('');
  useEffect(() => {
    alive.current = true; const controller = new AbortController();
    const setupTimeout = setTimeout(() => controller.abort(), 15_000);
    void fetch(url, { cache: 'no-store', signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error();
      const result = await response.json() as Configuration;
      if (alive.current) setConfiguration(result);
    }).catch(() => { if (alive.current) setMessage('Generation setup could not be read. Your draft remains available.'); }).finally(() => clearTimeout(setupTimeout));
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        if (raw.length > 220_000) throw new Error();
        const recovered = JSON.parse(raw) as Proposal;
        if (typeof recovered.base !== 'string' || recovered.base.length > 100_000) throw new Error();
        const plan = parseWebsitePlan(recovered.plan); parseWebsitePlan(JSON.parse(recovered.base));
        if (!plan.generation) throw new Error();
        setProposal({ plan, base: recovered.base }); setMessage('Recovered a generated proposal from this tab. Compare it before using it.');
      }
    } catch { storageHeld.current = true; setMessage('Previous proposal storage needs inspection. It is retained; editing and downloads remain available.'); }
    return () => { alive.current = false; serial.current += 1; clearTimeout(setupTimeout); controller.abort(); operation.current?.abort(); operation.current = null; };
  }, [url, key]);

  async function generate() {
    if (disabled || !configuration?.enabled || operation.current || proposal || storageHeld.current) return;
    let current: WebsitePlan;
    try { current = parseWebsitePlan(draft); websiteGenerationInput(current); }
    catch { setMessage('Complete the current draft first. Generation supports a focused plan of up to six sections and 32 KB of source text.'); return; }
    const base = JSON.stringify(current); const owner = ++serial.current;
    const controller = new AbortController(); operation.current = controller;
    const timeout = setTimeout(() => controller.abort(), 65_000);
    setRunning(true); setMessage('Creating three page directions. You can keep editing while the proposal is prepared.');
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: current }), cache: 'no-store', signal: controller.signal });
      const result = await response.json() as { plan?: unknown; error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Generation could not complete. Your draft is unchanged.');
      const next = { plan: parseWebsitePlan(result.plan), base };
      if (!next.plan.generation) throw new Error('The proposal lacks generation metadata. Your draft is unchanged.');
      if (!alive.current || owner !== serial.current) return;
      setProposal(next);
      try { sessionStorage.setItem(key, JSON.stringify(next)); setMessage('Proposal prepared and retained in this tab. Review the whole page before using it.'); }
      catch { storageHeld.current = true; setMessage('Proposal prepared. Browser recovery is unavailable; download it before leaving this page.'); }
    } catch (error) {
      if (alive.current && owner === serial.current) setMessage(controller.signal.aborted ? 'Generation stopped. Your draft is unchanged. The provider may have processed billable tokens; no retry was made.' : (error as Error).message);
    } finally { clearTimeout(timeout); if (owner === serial.current) { operation.current = null; if (alive.current) setRunning(false); } }
  }
  function download() {
    if (!proposal) return;
    const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(proposal.plan, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = objectUrl; anchor.download = `${proposal.plan.id}.generated-proposal.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
  function dismiss() {
    // Keep an unavailable/unverified recovery slot intact.
    if (storageHeld.current) { setMessage('Download the proposal and inspect browser storage before replacing its retained evidence.'); return; }
    try { sessionStorage.removeItem(key); } catch { setMessage('Browser storage could not remove the proposal. Download it before leaving.'); return; }
    setProposal(undefined); setMessage('Proposal dismissed. Your current draft is unchanged.');
  }
  const changed = proposal && JSON.stringify(draft) !== proposal.base;
  return <section className="mt-8 rounded-xl border border-starlight-accent/30 bg-starlight-panel p-5 sm:p-7" aria-labelledby="generation-heading">
    <h2 id="generation-heading" className="text-xl font-semibold">Explore three complete page directions</h2>
    <p className="mt-3 max-w-3xl text-sm leading-6 text-starlight-muted">Use your retained observations and brief to create distinct narratives, with copy for every section. Review the proposal here, then choose whether it belongs in your draft.</p>
    <p className="mt-3 break-words text-sm leading-6 text-starlight-muted">{configuration?.enabled ? `${configuration.provider} · ${configuration.model}. ${configuration.boundary}` : 'Optional generation is not configured. You can continue writing, importing, saving and exporting your plan.'}</p>
    <details className="mt-3"><summary className="min-h-11 cursor-pointer text-sm text-starlight-accent">Review the text that will be sent</summary><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs leading-6">{(() => { try { return JSON.stringify(websiteGenerationInput(draft), null, 2); } catch { return 'Complete the focused draft to preview the source payload.'; } })()}</pre></details>
    <div className="mt-4 flex flex-wrap gap-3">
      <button type="button" className={button} disabled={disabled || running || !configuration?.enabled || Boolean(proposal) || storageHeld.current} onClick={() => void generate()}>Send source and generate directions</button>
      {running && <button type="button" className={button} onClick={() => operation.current?.abort()}>Stop generation</button>}
    </div>
    {message && <p role="status" aria-live="polite" className="mt-4 text-sm leading-6 text-starlight-mint">{message}</p>}
    {proposal && <div className="mt-6 border-t border-starlight-border pt-6">
      <h3 className="text-lg font-semibold">Review the generated proposal</h3>
      <p className="mt-2 text-sm leading-6 text-starlight-muted">{proposal.plan.generation?.returnedModel} · {proposal.plan.generation?.generatedAt}. Quote matching checks source presence. Review factual claims, tone and actions yourself.</p>
      <div className="mt-5 grid gap-4 lg:grid-cols-3">{proposal.plan.options.map((option) => <article key={option.id} className="min-w-0 rounded-lg border border-starlight-border bg-starlight-surface p-5"><h4 className="text-lg font-semibold">{option.title}</h4><p className="mt-4 text-xl leading-7">{option.headline}</p><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-starlight-muted">{option.body}</p><p className="mt-3 text-sm leading-6">{option.premise}</p><p className="mt-3 text-sm leading-6 text-starlight-gold">Tradeoff: {option.tradeoff}</p><details className="mt-3"><summary className="min-h-11 cursor-pointer text-sm text-starlight-accent">Read the full page and source quotes</summary><div className="mt-3 space-y-4">{option.sectionCopy?.map((section) => <div key={section.sectionId}><p className="text-sm font-medium">{proposal.plan.sections.find((item) => item.id === section.sectionId)?.label}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-starlight-muted">{section.copy}</p><p className="mt-2 text-sm leading-6">Next action: {section.action}</p></div>)}{option.sourceQuotes?.map((quote, index) => <blockquote key={index} className="border-l border-starlight-gold pl-3 text-sm leading-6 text-starlight-muted">{quote}</blockquote>)}</div></details></article>)}</div>
      {changed && <p className="mt-4 text-sm leading-6 text-starlight-gold">Your draft changed after this request. Download the proposal and reconcile it with your newer edits; the draft will be retained.</p>}
      <div className="mt-5 flex flex-wrap gap-3"><button type="button" className={button} disabled={disabled || Boolean(changed)} onClick={() => { if (apply(proposal.plan, proposal.base)) setMessage('Generated directions added as an unsaved draft. Save, then choose the direction you reviewed. The proposal remains downloadable.'); }}>Use proposal as draft</button><button type="button" className={button} onClick={download}>Download generated plan</button><button type="button" className={button} onClick={dismiss}>Dismiss proposal</button></div>
    </div>}
  </section>;
}
