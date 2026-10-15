import { expect, it } from 'vitest';
import { baseline, replay } from '../tools/locator-spike';

it('replays a baseline across builds and records observations without claiming confirmed survival', () => {
  document.body.innerHTML = '<main><button data-testid="save">Save</button><aside>Old panel</aside></main>';
  const before = baseline([...document.querySelectorAll('button,aside')], 'build-1', 'https://uat.example.test/orders/123');
  document.body.innerHTML = '<article><section><button data-testid="save">Zapisz</button></section></article>';
  const result = replay(before, 'build-2', document, 'https://uat.example.test/orders/456');
  expect(result.total).toBe(2);
  expect(result.resolved).toBe(1);
  expect(result.observations[0]).toMatchObject({ id: 1, method: 'testid', confirmedMatch: null });
  expect(result.observations[1].orphaned).toBe(true);
  expect(result.baselineRelease).toBe('build-1');
  expect(() => replay(before, 'build-2', document, 'https://uat.example.test/settings')).toThrow('baseline route');
});

it('deduplicates captured elements and caps a baseline at 200 samples', () => {
  document.body.innerHTML = '<button>Save</button>'.repeat(201);
  const elements = [...document.querySelectorAll('button')];
  expect(baseline([elements[0], elements[0]], 'one').samples).toHaveLength(1);
  expect(baseline(elements, 'one').samples).toHaveLength(200);
});
