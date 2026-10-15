import { useEffect, useState } from 'preact/hooks';
import { MAX_SCREENSHOT_BYTES, type Evidence } from './types';
import { translations } from './i18n';

export function EvidencePreview({ item, label, unavailable, retry, onRetry }: {
  item: Evidence; label: string; unavailable: string; retry?: string; onRetry?: () => void;
}) {
  const [state, setState] = useState('loading');
  const [source, setSource] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    let local = '';
    setState('loading'); setSource('');
    // Host CSP already permits storage connections and blob image previews.
    // Rendering local bytes avoids requiring another remote img-src exception.
    void fetch(item.url, { signal: abort.signal, credentials: 'omit' }).then(async response => {
      if (!response.ok) throw new Error('Screenshot unavailable');
      const blob = await response.blob();
      if (abort.signal.aborted) return;
      if (blob.size > MAX_SCREENSHOT_BYTES || blob.type !== 'image/png') throw new Error('Invalid screenshot');
      local = URL.createObjectURL(blob); setSource(local);
    }).catch(() => { if (!abort.signal.aborted) setState('error'); });
    return () => { abort.abort(); if (local) URL.revokeObjectURL(local); };
  }, [item.url, attempt]);
  return <div class="evidence-container"><a class="evidence-preview" href={item.url} target="_blank" rel="noopener noreferrer" aria-label={label}>
    {state === 'loading' && <span class="evidence-unavailable" role="status">{label}…</span>}
    {state === 'error' ? <span class="evidence-unavailable">{unavailable}</span> : source && <img
      src={source} alt={label} width={item.width} height={item.height} decoding="async"
      hidden={state !== 'ready'} onLoad={() => setState('ready')} onError={() => setState('error')}/>}
  </a>{state === 'error' && <button type="button" onClick={() => {
    setState('loading'); setSource(''); setAttempt(value => value + 1); onRetry?.();
  }}>{retry ?? translations().retry}</button>}</div>;
}
