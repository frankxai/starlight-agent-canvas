import type { WebsitePlan } from '@starlight-agent-canvas/core';
import { websiteSectionsForDirection } from '@starlight-agent-canvas/core/website';

export const pageLayouts = ['workshop', 'connected', 'editorial'] as const;
export type PageLayout = typeof pageLayouts[number];
export const pageLayoutNames: Record<PageLayout, string> = { workshop: 'Open workshop', connected: 'Connected reading', editorial: 'Editorial journal' };

// Fixed presentation studies, never provider HTML. All content comes from the
// same editable plan used by the canonical save/choice/implementation export.
export function pagePreview(plan: WebsitePlan, optionId: string, layout: PageLayout) {
  if (!pageLayouts.includes(layout)) throw new Error('Choose a supported page study layout.');
  const option = plan.options.find((item) => item.id === optionId);
  if (!option) throw new Error('This direction is no longer in the current plan.');
  return { option, layout, sections: websiteSectionsForDirection(plan, option), title: plan.title };
}

export const pagePreviewStyles = `
.page-study{--study-ink:#111522;--study-paper:#F1F3F9;--study-line:#8A90A8;color:var(--study-ink);background:var(--study-paper);font-family:ui-sans-serif,system-ui,sans-serif;overflow-wrap:anywhere;line-height:1.65;color-scheme:light}
.page-study *{box-sizing:border-box}
.page-study .study-masthead{display:flex;justify-content:space-between;gap:20px;align-items:center;padding:22px 30px;border-bottom:1px solid var(--study-line);font-size:12px}
.page-study .study-masthead strong{font-weight:650;max-width:70%}
.page-study .study-hero{padding:48px 36px 40px;max-width:940px;margin:auto}
.page-study .study-kicker{font-size:12px;font-weight:600;letter-spacing:0;margin:0 0 18px}
.page-study .study-headline{font-family:Georgia,'Times New Roman',serif;font-size:42px;line-height:1.13;letter-spacing:-.025em;font-weight:400;margin:0;max-width:750px}
.page-study .study-body{max-width:640px;font-size:16px;margin:24px 0;white-space:pre-wrap}
.page-study .study-action{display:inline-block;padding:11px 18px;max-width:100%;border:1px solid var(--study-ink);border-radius:4px;background:var(--study-ink);color:var(--study-paper);font-size:13px;line-height:1.5;white-space:pre-wrap}
.page-study .study-content{padding:0 36px 32px;max-width:940px;margin:auto}
.page-study .study-section{padding:28px 0;border-top:1px solid var(--study-line)}
.page-study .study-section-head{display:flex;align-items:baseline;gap:16px;margin-bottom:16px}
.page-study .study-number{font-size:12px;font-variant-numeric:tabular-nums;flex-shrink:0}
.page-study .study-section h3,.page-study .study-section h2{font-size:18px;line-height:1.4;margin:0;font-weight:600}
.page-study .study-copy{font-size:15px;line-height:1.8;white-space:pre-wrap;max-width:720px;margin:0 0 20px}
.page-study .study-section-action{font-size:13px;font-weight:600;margin:0;white-space:pre-wrap}
.page-study .study-footnote{padding:20px 30px;border-top:1px solid var(--study-line);font-size:12px;margin:0}
.page-study[data-layout=connected]{background:#111522;color:#F1F3F9;--study-ink:#F1F3F9;--study-paper:#111522;--study-line:#8A90A8}
.page-study[data-layout=connected] .study-hero{border-left:3px solid #79E6C5;margin:36px;max-width:calc(100% - 72px);padding:8px 28px 24px}
.page-study[data-layout=connected] .study-headline{font-family:ui-sans-serif,system-ui,sans-serif;font-size:36px;font-weight:550;letter-spacing:-.02em}
.page-study[data-layout=connected] .study-section{display:grid;grid-template-columns:190px minmax(0,1fr);gap:8px 28px}
.page-study[data-layout=connected] .study-section-head{grid-row:span 2;display:block}
.page-study[data-layout=connected] .study-number{display:block;color:#79E6C5;margin-bottom:10px}
.page-study[data-layout=connected] .study-action{background:#79E6C5;color:#111522;border-color:#79E6C5}
.page-study[data-layout=editorial] .study-hero{padding-top:60px;text-align:center}
.page-study[data-layout=editorial] .study-headline{margin:auto;max-width:680px;font-size:46px}
.page-study[data-layout=editorial] .study-body{margin:26px auto;max-width:540px}
.page-study[data-layout=editorial] .study-content{max-width:740px}
.page-study[data-layout=editorial] .study-section h3,.page-study[data-layout=editorial] .study-section h2{font-family:Georgia,'Times New Roman',serif;font-size:25px;font-weight:400}
.page-study[data-size=narrow] .study-masthead{padding:18px;align-items:flex-start;flex-direction:column;gap:6px}
.page-study[data-size=narrow] .study-hero{padding:30px 20px}
.page-study[data-size=narrow] .study-headline{font-size:30px}
.page-study[data-size=narrow] .study-content{padding:0 20px 24px}
.page-study[data-size=narrow] .study-section{display:block}
.page-study[data-size=narrow] .study-footnote{padding:18px 20px}
.page-study[data-size=narrow][data-layout=connected] .study-hero{margin:24px 20px;max-width:calc(100% - 40px);padding:8px 18px 20px}
.page-study .study-edit{min-height:44px;padding:8px 12px;border:1px solid var(--study-line);background:transparent;color:var(--study-ink);border-radius:4px;font-size:12px;font-family:inherit;cursor:pointer;margin-top:16px}
.page-study .study-edit:focus-visible{outline:2px solid #6EA8FE;outline-offset:3px}
.page-study .study-thumbnail-content{padding:16px;pointer-events:none;max-height:160px;overflow:hidden}
.page-study .study-thumbnail-content .study-headline{font-size:22px!important;text-align:left}
.page-study .study-thumbnail-content .study-body{font-size:11px;line-height:1.5;margin:10px 0 0}
@media(max-width:640px){
 .page-study .study-masthead{padding:18px;align-items:flex-start;flex-direction:column;gap:6px}
 .page-study .study-hero{padding:30px 20px}
 .page-study .study-headline,.page-study[data-layout=connected] .study-headline,.page-study[data-layout=editorial] .study-headline{font-size:30px}
 .page-study .study-content{padding:0 20px 24px}
 .page-study[data-layout=connected] .study-section{display:block}
 .page-study[data-layout=connected] .study-hero{margin:24px 20px;max-width:calc(100% - 40px);padding:8px 18px 20px}
 .page-study .study-footnote{padding:18px 20px}
}
`;

const escapeText = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

export function pagePreviewHtml(plan: WebsitePlan, optionId: string, layout: PageLayout): string {
  const { option, sections, title } = pagePreview(plan, optionId, layout);
  // No scripts, links, embedded media, fonts, or third-party requests. Asset
  // references remain in the implementation packet for separate verification.
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escapeText(option.title)} — Page study</title><style>html,body{margin:0}body{background:#05060A}${pagePreviewStyles}</style></head><body><main class="page-study" data-layout="${layout}"><header class="study-masthead"><strong>${escapeText(title)}</strong><span>Page study · ${escapeText(pageLayoutNames[layout])}</span></header><div class="study-hero"><p class="study-kicker">${escapeText(option.title)}</p><h1 class="study-headline">${escapeText(option.headline)}</h1><p class="study-body">${escapeText(option.body)}</p><span class="study-action">${escapeText(option.action)}</span></div><div class="study-content">${sections.map((section, index) => `<section class="study-section"><div class="study-section-head"><span class="study-number">${String(index + 1).padStart(2, '0')}</span><h2>${escapeText(section.label)}</h2></div><p class="study-copy">${escapeText(section.copy)}</p><p class="study-section-action">${escapeText(section.action)}</p></section>`).join('')}</div><p class="study-footnote">Static design study. Actions are proposed labels. Sources, media references, routes and implementation constraints remain in the plan and implementation packet. This file does not execute, publish or approve the proposed site.</p></main></body></html>`;
}
