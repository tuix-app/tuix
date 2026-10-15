import { expect, it, vi } from 'vitest';
import { deploymentReporter } from '../src/deployment';

it('reports only an admitted active UAT build and sends no commit or identity payload', async () => {
  const request = vi.fn().mockResolvedValue({});
  const report = deploymentReporter({ request, environment: 'uat' }, ' build-42 ');
  await report(false, true);
  await report(true, false);
  expect(request).not.toHaveBeenCalled();
  await report(true, true);
  expect(request).toHaveBeenCalledExactlyOnceWith('/releases', 'POST', { release: 'build-42' });
  await report(false, true);
  await report(true, true);
  expect(request).toHaveBeenCalledTimes(1);
});

it('coalesces pending reports and retries failures only when invoked during a later active refresh', async () => {
  let reject!: (reason: Error) => void;
  const request = vi.fn().mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; })).mockResolvedValue({});
  const report = deploymentReporter({ request, environment: 'uat' }, 'build-42');
  const first = report(true, true);
  expect(report(true, true)).toBe(first);
  reject(new Error('offline'));
  await first;
  await report(false, true);
  await report(true, false);
  expect(request).toHaveBeenCalledTimes(1);
  await report(true, true);
  await report(true, true);
  expect(request).toHaveBeenCalledTimes(2);
});

it('omits non-UAT and invalid builds instead of truncating immutable release identities', async () => {
  const request = vi.fn().mockResolvedValue({});
  for (const environment of ['local', 'production', 'preview']) {
    await deploymentReporter({ request, environment }, 'build-42')(true, true);
  }
  for (const release of [undefined, null, false, 42, '', '   ', 'x'.repeat(201)]) {
    await deploymentReporter({ request, environment: 'uat' }, release)(true, true);
  }
  expect(request).not.toHaveBeenCalled();
});
