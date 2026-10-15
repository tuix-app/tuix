// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { useState } from 'preact/hooks';
import { PageReports, ReportFilter, pageLink } from '../src/page-reports';
import type { Show, Involving } from '../src/preferences';
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
  // Show: Open asks for active work (open and in progress) from everyone by default.
  expect(request.mock.calls[0][0]).toBe('/issues?route_key=%2Finvoices%2F%3Aparam&show=active&involving=everyone&environments=production');
  const filters = host.querySelectorAll('fieldset');
  expect([...filters[1].querySelectorAll('button')].map(button => button.textContent)).toEqual(['Open', 'To verify', 'All']);
  // All is every unresolved report while Hide closed is on, which it is unless turned off.
  filters[0].querySelector<HTMLButtonElement>('[data-value=all]')!.click();
  await vi.waitFor(() => expect(request.mock.calls[request.mock.calls.length - 1][0]).toContain('show=unresolved'));
  expect([...host.querySelectorAll('fieldset button[aria-pressed="true"]')].map(button => button.textContent)).toHaveLength(2);
  expect(filters[1].querySelector('[data-value=all]')!.getAttribute('aria-pressed')).toBe('true');
  filters[1].querySelector<HTMLButtonElement>('[data-value=verify]')!.click();
  await vi.waitFor(() => expect(request.mock.calls[request.mock.calls.length - 1][0]).toContain('show=verify'));
  filters[1].querySelector<HTMLButtonElement>('[data-value=open]')!.click();
  await vi.waitFor(() => expect(request.mock.calls[request.mock.calls.length - 1][0]).toContain('show=active'));
  expect(filters[0].querySelector('[data-value=open]')!.getAttribute('aria-pressed')).toBe('true');
});

it('opens current-page reports in place and sends the visibility choice on every page', async () => {
  const issue = { id: 'closed', title: 'Resolved report', number: 10, type: 'bug', status: 'resolved',
    author: { name: 'Anna' }, inserted_at: '2026-09-22T12:00:00Z' };
  const request = vi.fn().mockResolvedValueOnce({ issues: [issue], next_before: 10 })
    .mockResolvedValueOnce({ issues: [], next_before: null });
  const open = vi.fn();
  render(<PageReports api={{ request }} environments="" route="/" show="all" onShowChange={() => {}} hideClosed={false} onOpen={open} lang="en"/>, host);
  await vi.waitFor(() => expect(host.querySelector('.issue-item')).not.toBeNull());
  host.querySelector<HTMLButtonElement>('.issue-item')!.click();
  expect(open).toHaveBeenCalledWith(issue);
  host.querySelector<HTMLButtonElement>('[data-action="more-reports"]')!.click();
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(request.mock.calls[1][0]).toBe('/issues?route_key=%2F&show=all&involving=everyone&before=10');
  // A legacy-only payload still gets a new-vocabulary label.
  expect(host.querySelector('.status')!.textContent).toBe('Done');
  expect(host.querySelector('.status')!.getAttribute('data-status')).toBe('done');
});

it('discards old filter responses and resets pagination when scope changes', async () => {
  let release!: (value: object) => void;
  const request = vi.fn().mockImplementationOnce(() => new Promise(resolve => { release = resolve; }))
    .mockResolvedValueOnce({ issues: [{ id: 'new', title: 'Current scope', number: 2, status: 'open', url: 'https://example.com/new' }], next_before: null });
  const api = { request };
  render(<PageReports api={api} environments="" route="/" show="all" onShowChange={() => {}} lang="en"/>, host);
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
  render(<PageReports api={api} environments="" show="open" onShowChange={() => {}} lang="en"/>, host);
  await vi.waitFor(() => expect(host.textContent).toContain('Current scope'));
  release({ issues: [{ id: 'old', title: 'Stale scope', number: 1, status: 'resolved', url: 'https://example.com/old' }], next_before: 1 });
  await vi.waitFor(() => expect(host.querySelectorAll('.page-report-group')).toHaveLength(1));
  expect(host.textContent).not.toContain('Stale scope');
  expect(host.querySelector('[data-action="more-reports"]')).toBeNull();
  expect(request.mock.calls[1][0]).toBe('/issues?scope=all&show=active&involving=everyone');
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
  expect(request.mock.calls[2][0]).toBe('/issues?scope=all&show=unresolved&involving=everyone');
});

it('keeps a focused report mounted and layout unchanged during a background refresh', async () => {
  document.body.append(host);
  const issue = { id: 'one', title: 'Current report', number: 1, status: 'open', type: 'bug',
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
  const report = (id: string, extra: object) => ({ id, title: id, number: 1, type: 'bug', author: { name: 'Anna' }, inserted_at: '2026-09-22T12:00:00Z', status: 'open', ...extra });
  const request = vi.fn().mockResolvedValueOnce({ issues: [
    report('review', { status: 'awaiting_verification', state: 'in_review' }),
    report('legacy', { status: 'acknowledged' }),
    report('closed', { status: 'resolved', state: 'closed' }),
  ], next_before: null }).mockResolvedValue({ issues: [], next_before: null });
  function Fixture() {
    const [show, setShow] = useState<Show>('verify'), [involving, setInvolving] = useState<Involving>('everyone');
    return <PageReports api={{ request }} environments="" route="/" show={show} onShowChange={setShow} involving={involving} onInvolvingChange={setInvolving} onOpen={() => {}} lang="en"/>;
  }
  render(<Fixture/>, host);
  await vi.waitFor(() => expect(host.querySelectorAll('.issue-item')).toHaveLength(3));
  expect(request.mock.calls[0][0]).toBe('/issues?route_key=%2F&show=verify&involving=everyone');
  expect([...host.querySelectorAll('.issue-item .status')].map(chip => [chip.getAttribute('data-status'), chip.textContent])).toEqual([
    ['in_review', 'In review'], ['in_progress', 'In progress'], ['closed', 'Closed']]);
  const involving = host.querySelector('[data-filter=involving]')!;
  expect(involving.querySelector('legend')!.textContent).toBe('Involving');
  expect(involving.querySelector('[data-value=everyone]')!.getAttribute('aria-pressed')).toBe('true');
  involving.querySelector<HTMLButtonElement>('[data-value=me]')!.click();
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(request.mock.calls[1][0]).toBe('/issues?route_key=%2F&show=verify&involving=me');
  await vi.waitFor(() => expect(host.textContent).toContain('Nothing that involves you matches these filters.'));
});
