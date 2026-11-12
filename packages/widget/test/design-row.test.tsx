// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { render } from 'preact';
import { DesignRow, figmaHref } from '../src/thread';
import { translations } from '../src/i18n';
const host = document.createElement('div');
afterEach(() => render(null, host));
const t = translations('en');
const link = (url: string, extra: Record<string, unknown> = {}) => ({ component: 'SaveButton', url, source: 'manual' as const, ...extra });

it('shows the component and an Open in Figma link that opens a new tab safely', () => {
  render(<DesignRow link={link('https://www.figma.com/design/AbC123/Checkout?node-id=12-34')} t={t}/>, host);
  const row = host.querySelector('.design-row')!;
  expect(row.textContent).toBe('DesignOpen in FigmaSaveButton');
  const a = row.querySelector('a')!;
  expect(a.getAttribute('href')).toBe('https://www.figma.com/design/AbC123/Checkout?node-id=12-34');
  expect(a.getAttribute('target')).toBe('_blank');
  expect(a.getAttribute('rel')).toBe('noopener noreferrer');
  expect(row.querySelector('code')?.textContent).toBe('SaveButton');
});

it('speaks Polish', () => {
  render(<DesignRow link={link('https://figma.com/file/KEY/Name')} t={translations('pl')}/>, host);
  expect(host.querySelector('.design-row')?.textContent).toBe('ProjektOtwórz w FigmieSaveButton');
});

it('renders nothing without a design_link', () => {
  render(<DesignRow link={undefined} t={t}/>, host);
  expect(host.innerHTML).toBe('');
});

it('renders nothing for a URL that is not a Figma link, whatever the server says', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,x', 'http://www.figma.com/design/KEY', 'https://evil.example/design/KEY', 'https://figma.com.evil.example/design/KEY',
    'https://www.figma.com.evil.example/x', 'https://evil.example/https://www.figma.com/', 'HTTPS://www.figma.com/design/KEY', ' https://www.figma.com/design/KEY', '//www.figma.com/design/KEY', '', 'https://www.figma.com']) {
    render(<DesignRow link={link(url)} t={t}/>, host);
    expect(host.innerHTML, url).toBe('');
  }
  for (const value of [null, 42, {}, ['https://www.figma.com/x']]) {
    expect(figmaHref(value)).toBeNull();
    render(<DesignRow link={{ component: 'A', url: value as unknown as string, source: 'agent' }} t={t}/>, host);
    expect(host.innerHTML).toBe('');
  }
});

it('omits the component when the server sends none, and never renders it as markup', () => {
  render(<DesignRow link={link('https://www.figma.com/design/KEY', { component: '' })} t={t}/>, host);
  expect(host.querySelector('code')).toBeNull();
  render(<DesignRow link={link('https://www.figma.com/design/KEY', { component: '<img src=x onerror=alert(1)>' })} t={t}/>, host);
  expect(host.querySelector('img')).toBeNull();
  expect(host.querySelector('code')?.textContent).toBe('<img src=x onerror=alert(1)>');
});
