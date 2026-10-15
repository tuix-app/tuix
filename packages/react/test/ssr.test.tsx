// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { Tuix } from '../src/index.js';
const load = vi.hoisted(() => vi.fn());
vi.mock('../src/runtime.js', () => ({ loadWidget: load }));

it('renders safely on the server without evaluating the widget or exposing identity in HTML', () => {
  expect(renderToString(<Tuix config={{ project: 'public-project' }}
    user={{ id: 'alice', name: 'Alice', hash: 'a'.repeat(64) }} />)).toBe('');
  expect(load).not.toHaveBeenCalled();
});
