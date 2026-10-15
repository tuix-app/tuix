import { afterEach, expect, it, vi } from 'vitest';
import { locatorTelemetry } from '../src/telemetry';

afterEach(() => vi.restoreAllMocks());
const observation = { issue: { id: 'issue-id', status: 'open', name: 'Private name' }, resolution: { element: null, method: 'geometry', orphaned: true } };

it('omits optimistic reports without consuming the sending window', () => {
  const request = vi.fn().mockResolvedValue({});
  const report = locatorTelemetry({ request });
  vi.spyOn(performance, 'now').mockReturnValue(0);
  const pending = { ...observation, issue: { id: 'temporary', status: 'sending' } };
  report(true, [pending]); expect(request).not.toHaveBeenCalled();
  report(true, [pending, observation]);
  expect(request).toHaveBeenCalledExactlyOnceWith('/telemetry/locators', 'POST', {
    resolutions: [{ issue_id: 'issue-id', method: 'geometry' }],
  });
});

it('does no work while opted out and sends only bounded outcome fields', () => {
  const request = vi.fn().mockResolvedValue({});
  const report = locatorTelemetry({ request });
  vi.spyOn(performance, 'now').mockReturnValue(0);
  report(false, [observation]); report(true, []);
  expect(request).not.toHaveBeenCalled();
  report(true, Array(201).fill(observation));
  expect(request).toHaveBeenCalledExactlyOnceWith('/telemetry/locators', 'POST', {
    resolutions: Array(200).fill({ issue_id: 'issue-id', method: 'geometry' }),
  });
});

it('limits repeated resolution passes to one attempt per minute without retrying failures', async () => {
  const request = vi.fn().mockRejectedValue(new Error('offline'));
  const report = locatorTelemetry({ request });
  const now = vi.spyOn(performance, 'now').mockReturnValue(0);
  report(true, [observation]); await Promise.resolve();
  now.mockReturnValue(59999); report(true, [observation]);
  expect(request).toHaveBeenCalledTimes(1);
  now.mockReturnValue(60000); report(true, [observation]); await Promise.resolve();
  expect(request).toHaveBeenCalledTimes(2);
});

it('includes a bounded host release label without passing arbitrary fields', () => {
  const request = vi.fn().mockResolvedValue({});
  const report = locatorTelemetry({ request });
  report(true, [observation], 'r'.repeat(250));
  expect(request.mock.calls[0][2].release).toBe('r'.repeat(200));
});

import { runtimeTelemetry } from '../src/telemetry';

it('waits for current project policy and reports one load without any idle activity', () => {
  const request = vi.fn().mockResolvedValue({});
  const report = runtimeTelemetry({ request });
  report.loaded(42); report.error('list');
  expect(request).not.toHaveBeenCalled();
  report.active(true); report.loaded(42.4); report.error('list');
  expect(request).not.toHaveBeenCalled();
  report.allowed(true);
  expect(request).toHaveBeenCalledExactlyOnceWith('/telemetry/runtime', 'POST', { kind: 'load', duration_ms: 42 });
  report.loaded(99); report.active(false); report.error('list');
  expect(request).toHaveBeenCalledTimes(1);
  report.active(true); report.error('list');
  expect(request).toHaveBeenCalledTimes(1);
});

it('drops opted-out loads and rate-limits error categories without recursive reporting', async () => {
  const request = vi.fn().mockRejectedValue(new Error('Private error must not leave browser'));
  const report = runtimeTelemetry({ request });
  const now = vi.spyOn(performance, 'now').mockReturnValue(0);
  report.active(true); report.allowed(false); report.loaded(30); report.error('submit');
  expect(request).not.toHaveBeenCalled();
  report.allowed(true); report.loaded(40);
  expect(request).not.toHaveBeenCalled();
  report.error('submit'); report.error('submit'); report.error('screenshot');
  await Promise.resolve();
  expect(request.mock.calls.map(call => call[2])).toEqual([{ kind: 'error', category: 'submit' }, { kind: 'error', category: 'screenshot' }]);
  now.mockReturnValue(60000); report.error('submit'); await Promise.resolve();
  expect(request).toHaveBeenCalledTimes(3);
  report.active(false); report.error('list'); expect(request).toHaveBeenCalledTimes(3);
});

it('bounds durations and ignores invalid timings', () => {
  const request = vi.fn().mockResolvedValue({});
  const report = runtimeTelemetry({ request });
  report.active(true); report.allowed(true); report.loaded(NaN); report.loaded(Infinity);
  expect(request).not.toHaveBeenCalled();
  report.loaded(150000);
  expect(request.mock.calls[0][2]).toEqual({kind: 'load', duration_ms: 120000});
});

it('discards interrupted measurements while waiting for policy and samples the next opening', () => {
  const request = vi.fn().mockResolvedValue({});
  const report = runtimeTelemetry({ request });
  report.active(true); report.loaded(900); report.active(false); report.allowed(true);
  expect(request).not.toHaveBeenCalled();
  report.active(true); report.allowed(true);
  expect(request).not.toHaveBeenCalled();
  report.loaded(30);
  expect(request).toHaveBeenCalledExactlyOnceWith('/telemetry/runtime', 'POST', {kind: 'load', duration_ms: 30});
});

it('samples only the first successful submission per opening under current policy', () => {
  const request = vi.fn().mockResolvedValue({});
  const report = runtimeTelemetry({ request });
  report.submitted(10);
  report.active(true); report.submitted(10);
  report.allowed(false); report.submitted(10);
  report.allowed(true); report.submitted(20);
  expect(request).not.toHaveBeenCalled();
  report.active(false); report.active(true); report.allowed(true);
  report.submitted(NaN); report.submitted(-1);
  report.submitted(29_123.6); report.submitted(40_000);
  expect(request).toHaveBeenCalledExactlyOnceWith('/telemetry/runtime', 'POST', {kind: 'submission', duration_ms: 29124});
  report.active(false); report.submitted(50_000);
  expect(request).toHaveBeenCalledTimes(1);
  report.active(true); report.allowed(true); report.submitted(90_000_000);
  expect(request.mock.calls[1][2]).toEqual({kind: 'submission', duration_ms: 86400000});
});

it('queues a fast submission until policy arrives and discards it on close', () => {
  const request = vi.fn().mockResolvedValue({});
  const report = runtimeTelemetry({ request });
  report.active(true); report.submitted(25);
  expect(request).not.toHaveBeenCalled();
  report.allowed(true);
  expect(request).toHaveBeenCalledExactlyOnceWith('/telemetry/runtime', 'POST', {kind:'submission',duration_ms:25});
  report.active(false); report.active(true); report.submitted(40); report.active(false); report.allowed(true);
  expect(request).toHaveBeenCalledTimes(1);
});
