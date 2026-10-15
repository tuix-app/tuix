import { baseline, replay, type Baseline } from './locator-spike';
import { ignored } from '../src/locators';

function download(value: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function run() {
  const mode = prompt('Tuix locator spike: enter capture or replay. Reports stay in this browser until you download them.');
  if (mode !== 'capture' && mode !== 'replay') return;
  const release = prompt('Deployment/build label (record the real deployed version):')?.trim();
  if (!release || release.length > 200) return;
  if (mode === 'capture') {
    alert('Click up to 200 page elements to record them. Clicks will be intercepted. Press Escape to finish and download the baseline. Empty captures are discarded.');
    const elements: Element[] = [];
    const captured = baseline([], release);
    const documents: Document[] = [];
    const cleanup = () => {
      for (const root of documents) { root.removeEventListener('click', click, true); root.removeEventListener('keydown', key, true); }
      window.removeEventListener('pagehide', cleanup);
    };
    const finish = () => {
      cleanup();
      if (elements.length) {
        if (new Blob([JSON.stringify(captured, null, 2) + '\n']).size > 1_048_576) {
          alert('This baseline exceeds 1 MiB. Capture fewer elements in separate files.');
        } else download(captured, 'tuix-locator-baseline.json');
      }
    };
    const click = (event: MouseEvent) => {
      const target = event.target;
      if (!target || (target as Node).nodeType !== 1 || ignored(target as Element)) return;
      const element = target as Element;
      event.preventDefault(); event.stopImmediatePropagation();
      if (!elements.includes(element)) {
        try {
          const sample = baseline([element], release).samples[0];
          elements.push(element);
          captured.samples.push({ ...sample, id: elements.length });
        } catch { cleanup(); alert('Could not capture this element. Restart the capture.'); return; }
      }
      if (elements.length === 200) finish();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); finish(); }
    };
    const listen = (root: Document, depth = 0) => {
      if (documents.length >= 200) return;
      documents.push(root);
      root.addEventListener('click', click, true); root.addEventListener('keydown', key, true);
      if (depth < 10) for (const frame of root.querySelectorAll('iframe')) {
        try { if (frame.contentDocument) listen(frame.contentDocument, depth + 1); } catch { /* Cross-origin frames are not inspectable. */ }
      }
    };
    listen(document); window.addEventListener('pagehide', cleanup, { once: true });
  } else {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.addEventListener('change', async () => {
      try {
        const file = input.files?.[0];
        if (!file) return;
        if (file.size > 1_048_576) throw new Error('Baseline exceeds 1 MiB.');
        download(replay(JSON.parse(await file.text()) as Baseline, release), 'tuix-locator-observations.json');
      } catch (error) { alert(error instanceof Error ? error.message : 'Cannot read baseline.'); }
    }, { once: true });
    input.click();
  }
}
void run().catch(() => alert('Locator spike could not start. No report was uploaded.'));
