import { afterEach, expect, it } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { createTextBuffer, ReportText } from '../src/text-buffer';

afterEach(() => { render(null, document.body); document.body.replaceChildren(); });

it('keeps typing local to the field, preserves mid-text edits and exposes the latest input before a render', async () => {
  const buffer = createTextBuffer();
  let ownerRenders = 0;
  function Owner() { ownerRenders++; return <ReportText buffer={buffer} disabled={false}/>; }
  await act(() => render(<Owner/>, document.body));
  const field = document.querySelector('textarea')!;
  field.focus();
  for (const letter of 'Keep every letter') {
    await act(() => {
      field.setRangeText(letter, field.selectionStart, field.selectionEnd, 'end');
      field.dispatchEvent(new Event('input', { bubbles: true }));
      expect(buffer.current).toBe(field.value);
    });
  }
  await act(() => {
    field.setSelectionRange(5, 5);
    field.setRangeText('single ', 5, 5, 'end');
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(field.value).toBe('Keep single every letter');
  expect(field.selectionStart).toBe(12);
  expect(document.activeElement).toBe(field);
  expect(ownerRenders).toBe(1);
  // A background update must use the latest text, not the owner's old render.
  await act(() => render(<Owner/>, document.body));
  expect(field.value).toBe(buffer.current);
  expect(field.selectionStart).toBe(12);
});

it('clears after sending, restores failures without overwriting new input, and survives remounting', async () => {
  const buffer = createTextBuffer();
  buffer.set('First reply');
  await act(() => render(<ReportText buffer={buffer} disabled={false}/>, document.body));
  await act(() => buffer.set(''));
  expect(document.querySelector('textarea')!.value).toBe('');
  await act(() => buffer.set(buffer.current || 'First reply'));
  expect(document.querySelector('textarea')!.value).toBe('First reply');
  await act(() => buffer.set('New reply'));
  await act(() => buffer.set(buffer.current || 'Failed reply'));
  expect(document.querySelector('textarea')!.value).toBe('New reply');
  await act(() => render(null, document.body));
  buffer.set('While hidden');
  await act(() => render(<ReportText buffer={buffer} disabled={false}/>, document.body));
  expect(document.querySelector('textarea')!.value).toBe('While hidden');
});

it('does not overwrite browser edits during a background render before input is delivered', async () => {
  const buffer = createTextBuffer();
  buffer.set('Report ');
  await act(() => render(<ReportText buffer={buffer} disabled={false}/>, document.body));
  const field = document.querySelector('textarea')!;
  field.focus();
  field.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  field.setRangeText('żółć', 7, 7, 'end');
  // Native editing/composition and a background widget update need not arrive
  // in the same render. Preact must not restore the older buffered value.
  await act(() => render(<ReportText buffer={buffer} disabled={false}/>, document.body));
  expect(field.value).toBe('Report żółć');
  expect(field.selectionStart).toBe(11);
  field.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'żółć' }));
  field.dispatchEvent(new Event('input', { bubbles: true }));
  expect(buffer.current).toBe('Report żółć');
});
