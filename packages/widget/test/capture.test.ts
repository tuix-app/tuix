// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanUrl, startCapture } from '../src/capture';
let stop: (() => void) | undefined;
afterEach(() => { stop?.(); stop = undefined; vi.restoreAllMocks(); });
describe('capture privacy and host behavior', () => {
  it('removes query, fragment and credentials from network URLs', () => {
    expect(cleanUrl('https://user:password@example.test/api?a=secret#private')).toBe('https://example.test/api');
    expect(cleanUrl('data:text/plain,secret')).toBe('');
  });
  it('keeps a bounded ring without enumerating objects and restores original console', () => {
    const original = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const capture = startCapture({ network: false }); stop = capture.stop;
    let accessed = false;
    console.warn({ get secret() { accessed = true; return 'private'; } });
    expect(capture.snapshot().console_log[0].msg).toBe('[object]');
    expect(accessed).toBe(false);
    for (let i = 0; i < 55; i++) console.warn('entry ' + i + 'x'.repeat(600));
    const logs = capture.snapshot().console_log;
    expect(logs).toHaveLength(50);
    expect(logs[0].msg.startsWith('entry 5')).toBe(true);
    expect(logs.every(entry => entry.msg.length <= 500)).toBe(true);
    expect(original).toHaveBeenCalledTimes(56);
    capture.stop(); stop = undefined;
    expect(console.warn).toBe(original);
  });
  it('preserves fetch responses/rejections and reads no body or headers', async () => {
    const failure = new Error('offline');
    const response = { status: 503, get body() { throw new Error('body read'); }, get headers() { throw new Error('headers read'); } };
    const original = vi.fn().mockResolvedValueOnce(response).mockRejectedValueOnce(failure).mockResolvedValueOnce({ status: 200 });
    const prior = window.fetch; window.fetch = original;
    const capture = startCapture({ console: false }); stop = () => { capture.stop(); window.fetch = prior; };
    expect(await window.fetch('https://example.test/api?token=private')).toBe(response);
    await expect(window.fetch('https://example.test/offline')).rejects.toBe(failure);
    await window.fetch('https://example.test/ok');
    expect(capture.snapshot().network_log.map(entry => [entry.url, entry.status])).toEqual([
      ['https://example.test/api', 503], ['https://example.test/offline', 0],
    ]);
    capture.stop(); expect(window.fetch).toBe(original);
  });
  it('honors network allow and deny rules', async () => {
    const prior = window.fetch; window.fetch = vi.fn().mockResolvedValue({ status: 400 });
    const capture = startCapture({ console: false, network_allow: ['https://example.test/*'], network_deny: ['*/private*', '*secret'] });
    stop = () => { capture.stop(); window.fetch = prior; };
    for (const url of ['https://example.test/visible', 'https://example.test/private', 'https://other.test/api', 'https://example.test/secret/secret']) await window.fetch(url);
    expect(capture.snapshot().network_log.map(entry => entry.url)).toEqual(['https://example.test/visible']);
  });
});
