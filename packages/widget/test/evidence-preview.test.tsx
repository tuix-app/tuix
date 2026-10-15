// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { EvidencePreview } from '../src/evidence-preview';
const host = document.createElement('div');
afterEach(() => { render(null, host); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const item = { id:'shot',url:'https://storage.example/signed',width:1600,height:900 };
it('renders a bounded blob preview and releases it when the thread closes', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok:true,blob:async()=>new Blob(['png'],{type:'image/png'})}));
  const revoke=vi.fn();
  vi.stubGlobal('URL', {createObjectURL:()=> 'blob:preview',revokeObjectURL:revoke});
  render(<EvidencePreview item={item} label="Screenshot" unavailable="Preview unavailable"/>,host);
  await vi.waitFor(()=>expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:preview'));
  host.querySelector('img')!.dispatchEvent(new Event('load'));
  await vi.waitFor(()=>expect(host.querySelector('img')!.hidden).toBe(false));
  render(null,host);
  expect(revoke).toHaveBeenCalledWith('blob:preview');
});
it('shows a readable fallback rather than a broken image or signed URL', async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false}));
  render(<EvidencePreview item={item} label="Screenshot" unavailable="Preview unavailable"/>,host);
  await vi.waitFor(()=>expect(host.textContent).toContain('Preview unavailable'));
  expect(host.querySelector('img')).toBeNull();
  expect(host.textContent).not.toContain('https:');
  expect(host.querySelector('a')!.getAttribute('target')).toBe('_blank');
  expect(host.querySelector('a')!.getAttribute('rel')).toContain('noopener');
  expect(host.querySelector('button')!.textContent).toBe('Retry');
});

it('retries a failed preview without navigating and can refresh its signed URL', async () => {
  const fetch = vi.fn().mockResolvedValueOnce({ ok: false })
    .mockResolvedValue({ ok: true, blob: async () => new Blob(['png'], { type: 'image/png' }) });
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:retried', revokeObjectURL: vi.fn() });
  const refresh = vi.fn();
  render(<EvidencePreview item={item} label="Screenshot" unavailable="Preview unavailable" retry="Try again" onRetry={refresh}/>, host);
  await vi.waitFor(() => expect(host.querySelector('button')).not.toBeNull());
  host.querySelector('button')!.click();
  await vi.waitFor(() => expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:retried'));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(refresh).toHaveBeenCalledOnce();
  expect(host.querySelector('button')).toBeNull();
});
