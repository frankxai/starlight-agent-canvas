'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { checkWebsiteMedia, WEBSITE_MEDIA_MAX_BYTES, WEBSITE_MEDIA_RECORD_MAX_BYTES } from '@starlight-agent-canvas/core/website';
import type { WebsiteMediaReport, WebsitePlan } from '@starlight-agent-canvas/core';

type Asset = WebsitePlan['assets'][number];
type Part = 'media' | 'sidecar' | 'generationRecord' | 'tasteRecord';
const parts: Array<{ key: Part; label: string; accept: string }> = [
  { key: 'media', label: 'Existing image or video', accept: '.png,.jpg,.jpeg,.gif,.webp,.mp4,.webm' },
  { key: 'sidecar', label: 'Provenance sidecar', accept: '.json' },
  { key: 'generationRecord', label: 'One generation-ledger record', accept: '.json,.jsonl' },
  { key: 'tasteRecord', label: 'One taste-ledger record', accept: '.json,.jsonl' },
];
const messages: Record<string, string> = {
  media_provenance_missing: 'Add the three provenance references to this placement before checking its files.',
  media_input_bounds: 'Choose media under 25 MiB and individual evidence records under 128 KiB. Empty files cannot be checked.',
  media_reference_unresolved: 'This placement needs a file reference ending in the chosen file name.',
  media_file_name_mismatch: 'The chosen media name must match the placement reference.',
  media_sidecar_unreadable: 'The sidecar needs its asset hash, media type, name, generation details and agent session.',
  media_generation_unreadable: 'Choose one generation record with its record ID, asset, generation and agent details. A whole JSONL ledger is not accepted.',
  media_taste_unreadable: 'Choose one taste record with its matching record ID and image hash.',
  media_format_unsupported: 'Choose PNG, JPEG, GIF or WebP for an image; MP4 or WebM for video. This check reads the file signature, without playing media.',
  media_sidecar_mismatch: 'The file does not match the sidecar hash, name or media type. Inspect the original file and sidecar.',
  media_generation_mismatch: 'The generation record does not match this sidecar. Inspect the original matching record.',
  media_taste_mismatch: 'The taste record needs the same record ID and media hash as the generation record.',
  media_hash_unavailable: 'File hashing is unavailable in this browser. Keep the plan and try the supported local workspace.',
};

function readFile(file: File, signal: AbortSignal): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('media_read_cancelled')); return; }
    const reader = new FileReader();
    const cancel = () => reader.abort();
    const cleanup = () => signal.removeEventListener('abort', cancel);
    reader.onload = () => {
      cleanup();
      if (!(reader.result instanceof ArrayBuffer) || reader.result.byteLength !== file.size) reject(new Error('media_read_failed'));
      else resolve(new Uint8Array(reader.result));
    };
    reader.onerror = () => { cleanup(); reject(new Error('media_read_failed')); };
    reader.onabort = () => { cleanup(); reject(new Error('media_read_cancelled')); };
    signal.addEventListener('abort', cancel, { once: true });
    try { reader.readAsArrayBuffer(file); }
    catch { cleanup(); reject(new Error('media_read_failed')); }
  });
}

export default function WebsiteMediaEvidence({ asset, disabled, begin, end, attach }: {
  asset: Asset; disabled: boolean; begin: (token: string) => boolean; end: (token: string) => void;
  attach: (report: WebsiteMediaReport) => boolean;
}) {
  const fieldId = useId();
  const [files, setFiles] = useState<Partial<Record<Part, File>>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const operation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const latestAttach = useRef(attach);
  latestAttach.current = attach;
  const binding = JSON.stringify([asset.kind, asset.reference, asset.provenance]);
  const priorBinding = useRef(binding);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; operation.current += 1; controller.current?.abort(); };
  }, []);
  useEffect(() => {
    if (priorBinding.current === binding) return;
    priorBinding.current = binding;
    operation.current += 1; controller.current?.abort();
    setBusy(false); setFiles({}); setError('');
    setStatus('Placement references changed. Choose the files again to compare the updated placement.');
  }, [binding]);

  async function check() {
    if (busy || disabled) return;
    if (parts.some((part) => !files[part.key])) { setError('Choose the media, sidecar and one matching record from each ledger. Your previous report is retained.'); return; }
    if (parts.some((part) => !files[part.key]!.size || files[part.key]!.size > (part.key === 'media' ? WEBSITE_MEDIA_MAX_BYTES : WEBSITE_MEDIA_RECORD_MAX_BYTES))) { setError(messages.media_input_bounds!); return; }
    const run = operation.current + 1, token = `${fieldId}:${run}`;
    if (!begin(token)) { setError('Another media check is finishing. Keep these files selected and try again.'); return; }
    operation.current = run;
    const abort = new AbortController(); controller.current = abort;
    let timedOut = false;
    const deadline = window.setTimeout(() => { timedOut = true; abort.abort(); }, 15_000);
    setBusy(true); setError(''); setStatus('Comparing selected bytes and records in this browser…');
    try {
      const selected = {} as Record<Part, Uint8Array>;
      for (const part of parts) selected[part.key] = await readFile(files[part.key]!, abort.signal);
      const report = await checkWebsiteMedia({ asset, fileName: files.media!.name, ...selected });
      if (!mounted.current || run !== operation.current) return;
      if (abort.signal.aborted) throw new Error('media_read_cancelled');
      if (!latestAttach.current(report)) throw new Error('media_placement_changed');
      setStatus('Local file matches the supplied sidecar and ledger records. Save the report with your plan.');
    } catch (problem) {
      if (mounted.current && run === operation.current) {
        const code = problem instanceof Error ? problem.message : '';
        setError(timedOut ? 'The local read timed out. Your previous report is retained; choose the files again when available.'
          : code === 'media_read_cancelled' ? 'Check cancelled. Your previous report and plan are retained.'
          : code === 'media_placement_changed' ? 'The placement changed while checking. Your current plan is retained; check the new placement.'
          : messages[code] ?? 'These files could not be checked. Your previous report and plan are retained.');
        setStatus('');
      }
    } finally {
      window.clearTimeout(deadline); end(token);
      if (controller.current === abort) controller.current = null;
      if (mounted.current && run === operation.current) setBusy(false);
    }
  }

  return <div className="mt-4 border-t border-starlight-border pt-4">
    {asset.mediaCheckReport && <div className="mb-4 space-y-2 border-l-2 border-starlight-mint pl-3" data-testid="local-media-report">
      <p className="font-medium text-starlight-mint">Recorded local file match</p>
      <p className="break-words text-xs text-starlight-muted">Reported {asset.mediaCheckReport.checkedAt} · {asset.mediaCheckReport.fileName} · {asset.mediaCheckReport.mediaType}</p>
      <p className="break-all font-mono text-xs text-starlight-muted">SHA256 {asset.mediaCheckReport.assetSha256}</p>
      <p className="text-xs text-starlight-muted">{asset.mediaCheckReport.boundary}</p>
    </div>}
    <details>
      <summary className="min-h-11 cursor-pointer text-sm font-medium text-starlight-accent">Check local media evidence</summary>
      <p className="mt-2 text-xs leading-6 text-starlight-muted">Choose the existing media and one matching record from each ledger. Files stay in this browser; only the hash report is saved with your plan. A recorded match remains a local declaration.</p>
      <fieldset key={binding} className="mt-4 space-y-4" disabled={busy || disabled}>
        <legend className="sr-only">Evidence files for {asset.reference}</legend>
        {parts.map((part) => <label key={part.key} htmlFor={`${fieldId}-${part.key}`} className="block space-y-2 text-xs text-starlight-muted">{part.label}
          <input id={`${fieldId}-${part.key}`} type="file" accept={part.accept} className="block min-h-11 w-full min-w-0 rounded-md border border-starlight-border bg-starlight-bg px-2 py-2 text-xs text-starlight-ink file:mr-2 file:rounded file:border-0 file:bg-starlight-panel file:px-2 file:py-1 file:text-starlight-ink" onChange={(event) => { const file = event.target.files?.[0]; setFiles((current) => ({ ...current, [part.key]: file })); setStatus(''); setError(''); }} />
        </label>)}
      </fieldset>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" className="min-h-11 rounded-md border border-starlight-accent/50 px-3 py-2 text-sm text-starlight-accent hover:border-starlight-accent aria-disabled:opacity-40" aria-disabled={busy || disabled} onClick={() => void check()}>Check selected files</button>
        {busy && <button type="button" className="min-h-11 rounded-md border border-starlight-border px-3 py-2 text-sm" onClick={() => controller.current?.abort()}>Cancel check</button>}
      </div>
      <p role="status" aria-live="polite" className="mt-3 text-xs leading-6 text-starlight-mint">{status}</p>
      {error && <p role="alert" className="mt-3 border-l-2 border-starlight-gold pl-3 text-xs leading-6 text-starlight-ink">{error}</p>}
    </details>
  </div>;
}
