// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { useState } from 'preact/hooks';
import { PageReports, ReportFilter, pageLink } from '../src/page-reports';
import type { Show } from '../src/preferences';
const host=document.createElement('div');
afterEach(()=>{ render(null,host); host.remove(); });
it('only links HTTP pages and encodes report deep links',()=>{
  expect(pageLink('javascript:alert(1)')).toBeNull();
  expect(pageLink('https://user:password@example.com')).toBeNull();
  expect(pageLink('https://example.com/invoices/42?view=all','report')).toMatchObject({label:'/invoices/42?view=all',href:'https://example.com/invoices/42?view=all&tuix=report'});
});
it('groups paths and loads older reports without discarding existing pages',async()=>{
  const issue=(id:string,url:string)=>({id,url,title:id,number:1,status:'open'});
  const request=vi.fn().mockResolvedValueOnce({issues:[issue('one','https://example.com/a'),issue('two','https://example.com/a')],next_before:4}).mockResolvedValueOnce({issues:[issue('three','https://example.com/b')],next_before:null});
  render(<PageReports api={{request}} environments="uat" lang="en" show="all" onShowChange={() => {}}/>,host);
  await vi.waitFor(()=>expect(host.querySelectorAll('.page-report-group')).toHaveLength(1));
  expect(host.querySelectorAll('li')).toHaveLength(2);
  expect(host.querySelectorAll('a[target]')).toHaveLength(0);
  (host.querySelector('[data-action="more-reports"]') as HTMLButtonElement).click();
  await vi.waitFor(()=>expect(host.querySelectorAll('.page-report-group')).toHaveLength(2));
  expect(request.mock.calls[1][0]).toContain('before=4');
  expect(request.mock.calls[0][0]).toContain('environments=uat');
});

it('uses the shared filter state for current-page and project-wide reports', async () => {
  const request = vi.fn().mockResolvedValue({ issues: [], next_before: null });
  const api = { request };
  function Fixture() {
    const [show, setShow] = useState<Show>('open');
    return <>
      <ReportFilter show={show} onChange={setShow} lang="en"/>
      <PageReports api={api} environments="production" route="/invoices/:param" show={show} onShowChange={setShow} lang="en"/>
    </>;
  }
  render(<Fixture/>, host);
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
  // Show: Open asks for open reports (fix ready included) from everyone by default.
  expect(request.mock.calls[0][0]).toBe('/issues?route_key=%2Finvoices%2F%3Aparam&show=active&involving=everyone&environments=production');
  const filters = host.querySelectorAll('[data-filter=show]');
  expect([...filters[1].querySelectorAll('button')].map(option => option.textContent)).toEqual(['Your turn', 'Open', 'All']);
  expect(filters[1].querySelector('legend')!.textContent).toBe('Show');
  // No helper sentence under the choices.
  expect(host.querySelector('.filter-help')).toBeNull();
  for (const value of ['all', 'turn', 'open'] as const) {
    filters[0].querySelector<HTMLButtonElement>(`[data-value=${value}]`)!.click();
    await vi.waitFor(() => expect(request.mock.calls[request.mock.calls.length - 1][0]).toContain('show=' + (value === 'open' ? 'active' : value)));
    expect(filters[1].querySelector(`[data-value=${value}]`)!.getAttribute('aria-pressed')).toBe('true');
  }
});

it('refetches when the concrete URL changes even if its normalized route stays the same', async () => {
  const request = vi.fn().mockResolvedValue({ issues: [], next_before: null });
  const api = { request };
  const draw = (pageUrl: string, route: string | undefined = '/invoices/:param') =>
    render(<PageReports api={api} environments="" route={route} pageUrl={pageUrl} show="open" onShowChange={() => {}} lang="en"/>, host);
  draw('https://example.com/invoices/123');
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
  expect(new URLSearchParams(request.mock.calls[0][0].split('?')[1]).get('page_url')).toBe('https://example.com/invoices/123');
  draw('https://example.com/invoices/456');
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(new URLSearchParams(request.mock.calls[1][0].split('?')[1]).get('page_url')).toBe('https://example.com/invoices/456');
  render(<PageReports api={api} environments="" pageUrl="https://example.com/invoices/456" show="all" onShowChange={() => {}} lang="en"/>, host);
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(3));
  expect(request.mock.calls[2][0]).toBe('/issues?scope=all&show=all&involving=everyone');
});

it('keeps a focused report mounted and layout unchanged during a background refresh', async () => {
  document.body.append(host);
  const issue = { id: 'one', title: 'Current report', number: 1, status: 'open', 
    author: { name: 'Anna' }, inserted_at: '2026-09-22T12:00:00Z' };
  let release!: (value: object) => void;
  const result = { issues: [issue], next_before: null };
  const request = vi.fn().mockResolvedValueOnce(result)
    .mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const api = { request }, onOpen = vi.fn();
  const draw = (refreshKey: number) => render(<PageReports api={api} environments="" route="/"
    show="open" onShowChange={() => {}} onOpen={onOpen} refreshKey={refreshKey} lang="en"/>, host);
  draw(1);
  await vi.waitFor(() => expect(host.querySelector('.issue-item')).not.toBeNull());
  const button = host.querySelector<HTMLButtonElement>('.issue-item')!;
  button.focus();
  const markup = host.innerHTML;
  draw(2);
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(host.querySelector('.issue-item')).toBe(button);
  expect(document.activeElement).toBe(button);
  expect(host.innerHTML).toBe(markup);
  button.click(); expect(onOpen).toHaveBeenCalledWith(issue);
  release(result);
  await vi.waitFor(() => expect(host.querySelector('.issue-item')).toBe(button));
});

it('filters by involvement, labels the new states and explains an empty personal list', async () => {
  const report = (id: string, extra: object) => ({ id, title: id, number: 1, author: { name: 'Anna' }, inserted_at: '2026-09-22T12:00:00Z', status: 'open', ...extra });
  const request = vi.fn().mockResolvedValueOnce({ issues: [
    report('review', { status: 'awaiting_verification', state: 'in_review' }),
    report('legacy', { status: 'acknowledged' }),
    report('closed', { status: 'resolved', state: 'closed' }),
  ], next_before: null }).mockResolvedValue({ issues: [], next_before: null });
  function Fixture() {
    const [show, setShow] = useState<Show>('turn');
    return <PageReports api={{ request }} environments="" route="/" show={show} onShowChange={setShow} onOpen={() => {}} lang="en"/>;
  }
  render(<Fixture/>, host);
  await vi.waitFor(() => expect(host.querySelectorAll('.issue-item')).toHaveLength(3));
  expect(request.mock.calls[0][0]).toBe('/issues?route_key=%2F&show=turn&involving=everyone');
  // A quiet word after the title: nothing for Open, no chips.
  expect([...host.querySelectorAll('.issue-item')].map(row => row.querySelector('.row-word')?.textContent ?? null)).toEqual(['Fix ready', null, 'Closed']);
  expect(host.querySelector('.status')).toBeNull();
  // Show and Pages are the only filters; an empty list says so plainly.
  expect(host.querySelector('[data-filter=involving]')).toBeNull();
});

it('keeps page scope beside Show and refetches when it changes', async () => {
  const request = vi.fn().mockResolvedValue({ issues: [], next_before: null }), api = { request };
  function Fixture() {
    const [scope, setScope] = useState<'page' | 'all'>('page');
    return <PageReports api={api} environments="" route={scope === 'page' ? '/' : undefined} show="open" onShowChange={() => {}} onScopeChange={setScope} lang="en"/>;
  }
  render(<Fixture/>, host);
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
  expect([...host.querySelectorAll('[data-filter]')].map(el => el.getAttribute('data-filter'))).toEqual(['scope', 'show']);
  host.querySelector<HTMLButtonElement>('[data-filter=scope] [data-value=all]')!.click();
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(request.mock.calls[1][0]).toBe('/issues?scope=all&show=active&involving=everyone');
});

it('asks for show=turn, and against a server that does not know it lists the open reports the caller holds', async () => {
  const mine = { id: 'a', title: 'Mine', number: 1, status: 'open', turn_holder: { name: 'Me', me: true, reporter: false } };
  const theirs = { id: 'b', title: 'Theirs', number: 2, status: 'open', turn_holder: { name: 'Bo', me: false, reporter: false } };
  const request = vi.fn(async (path: string) => { if (path.includes('show=turn')) throw new Error('400'); return { issues: [mine, theirs], next_before: null }; });
  render(<PageReports api={{ request } as never} environments="" route="/" show="turn" onShowChange={() => {}} lang="en"/>, host);
  await vi.waitFor(() => expect(host.textContent).toContain('Mine'));
  expect(host.textContent).not.toContain('Theirs');
  expect(request.mock.calls.map(call => call[0])).toEqual(['/issues?route_key=%2F&show=turn&involving=everyone', '/issues?route_key=%2F&show=unresolved&involving=everyone']);
});
