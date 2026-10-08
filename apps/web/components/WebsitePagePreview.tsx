'use client';

import { useState } from 'react';
import type { WebsitePlan } from '@starlight-agent-canvas/core';
import { pageLayouts, pageLayoutNames, pagePreview, pagePreviewHtml, pagePreviewStyles } from '../lib/website-page-preview';

const button = 'inline-flex min-h-11 items-center justify-center rounded-md border border-starlight-border px-3 py-2 text-sm hover:border-starlight-accent aria-pressed:border-starlight-accent aria-pressed:bg-starlight-accent/10';

export function DirectionThumbnail({ option, index }: { option: WebsitePlan['options'][number]; index: number }) {
  return <div className="page-study mb-5 overflow-hidden rounded-md" data-layout={pageLayouts[index % pageLayouts.length]} aria-hidden="true"><div className="study-thumbnail-content"><p className="study-headline">{option.headline}</p><p className="study-body">{option.body}</p></div></div>;
}

export default function WebsitePagePreview({ plan, optionId, view, editSection }: { plan: WebsitePlan; optionId: string; view: (id: string) => void; editSection: (id: string) => void }) {
  const [size, setSize] = useState<'wide' | 'narrow'>('wide');
  const index = plan.options.findIndex((option) => option.id === optionId);
  const layout = pageLayouts[Math.max(0, index) % pageLayouts.length]!;
  const { option, sections } = pagePreview(plan, optionId, layout);
  function download() {
    const objectUrl = URL.createObjectURL(new Blob([pagePreviewHtml(plan, option.id, layout)], { type: 'text/html;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = objectUrl; anchor.download = `${plan.id}.${option.id}.page-study.html`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
  return <section className="mt-7 min-w-0" aria-labelledby="preview-heading" data-testid="website-page-preview">
    <style>{pagePreviewStyles}</style>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h2 id="preview-heading" className="text-xl font-semibold">See the page you are shaping</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-starlight-muted">{pageLayoutNames[layout]} layout study. Viewing a direction keeps your saved choice unchanged.</p></div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Page preview width"><button type="button" className={button} aria-pressed={size === 'wide'} onClick={() => setSize('wide')}>Wide view</button><button type="button" className={button} aria-pressed={size === 'narrow'} onClick={() => setSize('narrow')}>Narrow view</button><button type="button" className={button} onClick={download}>Download page study HTML</button></div>
    </div>
    <div className="mt-4 grid gap-5 xl:grid-cols-[210px_minmax(0,1fr)_210px]">
      <div className="grid min-w-0 grid-cols-3 gap-2 xl:flex xl:flex-col" role="group" aria-label="Preview a page direction">{plan.options.map((item, optionIndex) => <button key={item.id} type="button" className="min-h-11 min-w-0 rounded-lg border border-starlight-border bg-starlight-surface p-3 text-left aria-pressed:border-starlight-accent aria-pressed:bg-starlight-panel" aria-pressed={item.id === option.id} onClick={() => view(item.id)}><span className="mb-2 hidden text-xs text-starlight-muted sm:block">{String(optionIndex + 1).padStart(2, '0')} · {pageLayoutNames[pageLayouts[optionIndex % pageLayouts.length]!]}</span><span className="block break-words text-sm font-medium">Preview {item.title}</span></button>)}</div>
      <div className="min-w-0 rounded-lg border border-starlight-border bg-starlight-panel p-2 sm:p-4">
        <p className="mb-3 text-xs text-starlight-muted">{option.title} · Current draft · Actions shown as proposed labels</p>
        <article className={`page-study mx-auto overflow-hidden rounded-md ${size === 'narrow' ? 'max-w-[375px]' : 'w-full'}`} data-layout={layout} data-size={size} aria-label={`${option.title} page study`}>
          <header className="study-masthead"><strong>{plan.title}</strong><span>Page study</span></header>
          <div className="study-hero"><p className="study-kicker">{option.title}</p><h3 className="study-headline">{option.headline}</h3><p className="study-body">{option.body}</p><span className="study-action">{option.action}</span></div>
          <div className="study-content">{sections.map((section, sectionIndex) => <section key={section.id} className="study-section"><div className="study-section-head"><span className="study-number">{String(sectionIndex + 1).padStart(2, '0')}</span><h3>{section.label}</h3></div><p className="study-copy">{section.copy}</p><p className="study-section-action">{section.action}</p><button type="button" className="study-edit" onClick={() => editSection(section.id)}>Edit section: {section.label}</button></section>)}</div>
        </article>
      </div>
      <aside className="min-w-0 space-y-5 xl:border-l xl:border-starlight-border xl:pl-4" aria-label="Preview source context"><div><h3 className="text-sm font-medium">Why this direction</h3><p className="mt-2 text-sm leading-6 text-starlight-muted">{option.premise}</p><p className="mt-3 text-sm leading-6 text-starlight-gold">Tradeoff: {option.tradeoff}</p></div><div><h3 className="text-sm font-medium">Retained source</h3>{option.sourceQuotes?.length ? option.sourceQuotes.map((quote, quoteIndex) => <blockquote key={quoteIndex} className="mt-3 border-l border-starlight-border pl-3 text-sm leading-6 text-starlight-muted">{quote}</blockquote>) : <p className="mt-2 text-sm leading-6 text-starlight-muted">Read the source observations below. This direction has no retained quotations.</p>}</div><p className="text-xs leading-6 text-starlight-muted">Layout is a fixed studio study. Media remains a reference until checked. The implementation packet carries the source, copy, routes and constraints.</p></aside>
    </div>
  </section>;
}
