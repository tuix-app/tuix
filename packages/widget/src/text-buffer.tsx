import { useLayoutEffect, useRef } from 'preact/hooks';

export interface TextBuffer {
  current: string;
  set(value: string): void;
  /** Each draft has one editor: the report field, or the reply in the panel/chat. */
  notify?: (value: string) => void;
}

/**
 * Keep unfinished text outside the widget's render state. Input updates are
 * synchronous for submission. The browser owns the editing value and caret;
 * typing must not wait for a render or be overwritten by a background render.
 */
export function createTextBuffer(): TextBuffer {
  return {
    current: '',
    set(value: string) {
      this.current = value;
      this.notify?.(value);
    },
  };
}

export function useBufferedText(buffer: TextBuffer) {
  const field = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = field.current!;
    buffer.notify = (value: string) => {
      if (element.value !== value) element.value = value;
    };
    buffer.notify(buffer.current);
    return () => { buffer.notify = undefined; };
  }, [buffer]);
  return field;
}

export function ReportText({ buffer, disabled }: { buffer: TextBuffer; disabled: boolean }) {
  return <textarea ref={useBufferedText(buffer)} onInput={event => buffer.set(event.currentTarget.value)} required maxLength={2000} disabled={disabled}/>;
}
