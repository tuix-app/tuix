// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sanitizeClone } from '../src/screenshot';
describe('screenshot clone privacy', () => {
  it('replaces form values, masks, editable content and frames without changing the host', () => {
    document.body.innerHTML = '<main><div data-tuix-mask style="width:120px;height:30px"><span>private customer</span></div><input value="private input"><textarea>private note</textarea><select><option selected>private choice</option></select><p contenteditable>private editable</p><iframe srcdoc="private frame"></iframe><button onclick="alert(1)">Public button</button><tuix-widget>Feedback UI</tuix-widget></main>';
    const copy = document.querySelector('main')!.cloneNode(true) as Element;
    sanitizeClone(copy);
    expect(copy.textContent).toBe('Public button');
    expect(copy.innerHTML).not.toContain('private');
    expect(copy.querySelector('input,textarea,select,iframe,[contenteditable],[data-tuix-mask],tuix-widget,[onclick]')).toBeNull();
    expect(copy.querySelector('div')!.style.width).toBe('120px');
    expect(document.querySelector('input')!.value).toBe('private input');
    expect(document.querySelector('[data-tuix-mask]')!.textContent).toBe('private customer');
  });
});
