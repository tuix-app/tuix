import { useEffect, useRef, useState } from 'preact/hooks';
import type { Api } from './api';
import type { Issue } from './types';
import { translations, statusLabel } from './i18n';
import { showQuery, type Show, type Involving } from './preferences';
import { stateOf, myTurn } from './states';

export function pageLink(raw?: string, issueId?: string) {
  try {
    const url = new URL(raw ?? '');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const label = url.pathname + url.search;
    if (issueId) url.searchParams.set('tuix', issueId);
    return { href: url.href, label, origin: url.host };
  } catch { return null; }
}

/** Show: Your turn, Open (fix ready included) or All (closed too), three short choices like Pages. */
export function ReportFilter({ show, onChange, lang }: {
  show: Show; onChange: (value: Show) => void; lang?: 'en' | 'pl';
}) {
  const t = translations(lang);
  return <fieldset class="report-filter segmented" data-filter="show">
    <legend>{t.show}</legend>
    {([['turn', t.showTurn], ['open', t.showOpen], ['all', t.showAll]] as const).map(([value, label]) =>
      <button type="button" key={value} data-value={value} aria-pressed={show === value} onClick={() => onChange(value)}>{label}</button>)}
  </fieldset>;
}

export function PageReports({ api, environments, lang, route, pageUrl, show, onShowChange, onScopeChange, involving = 'everyone', onOpen, refreshKey }: {
  api: Pick<Api, 'request'>; environments: string; lang?: 'en' | 'pl';
  route?: string; pageUrl?: string; show: Show; onShowChange: (value: Show) => void;
  onScopeChange?: (value: 'page' | 'all') => void;
  /** Only a host's or the capsule's session filter sets this; there is no control for it. */
  involving?: Involving;
  onOpen?: (issue: Issue) => void; refreshKey?: unknown;
}) {
  const t = translations(lang);
  /** The quiet word after a title: only a conversation that is past Open has one (Fix ready, Fixed, Closed). */
  const word = (issue: Issue) => stateOf(issue) === 'open' || stateOf(issue) === 'sending' ? '' : statusLabel(stateOf(issue), lang);
  /** One line of the newest message ("Anna: …"), else the start of the report. */
  const message = (issue: Issue) => issue.latest_comment ? `${issue.latest_comment.author.name}: ${issue.latest_comment.body}` : (issue.excerpt ?? '').replace(/\s+/g, ' ').trim();
  const [issues, setIssues] = useState<Issue[]>([]), [next, setNext] = useState<number | string | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState(false);
  const generation = useRef(0), pending = useRef(false);
  const selection = useRef<unknown[]>([]);
  async function load(before?: number | string, background = false) {
    if (pending.current) return;
    pending.current = true; if (!background) setLoading(true); setError(false);
    const current = generation.current;
    try {
      // The server applies the filters so paging stays complete and consistent.
      const query = new URLSearchParams({
        ...(route === undefined ? { scope: 'all' } : { route_key: route }),
        ...(route !== undefined && pageUrl ? { page_url: pageUrl } : {}),
        show: showQuery(show), involving, ...(environments ? { environments } : {}),
        ...(before ? { before: String(before) } : {}),
      });
      let result: { issues: Issue[]; next_before: number | string | null };
      try { result = await api.request('/issues?' + query); }
      catch (failure) {
        // A server before Your turn does not know `show=turn`: ask for the open reports and keep the ones the caller holds.
        if (show !== 'turn') throw failure;
        query.set('show', 'unresolved');
        result = await api.request('/issues?' + query);
        result = { ...result, issues: result.issues.filter(issue => issue.turn_holder?.me) };
      }
      if (current !== generation.current) return;
      setIssues(previous => before ? [...new Map([...previous, ...result.issues].map(issue => [issue.id, issue])).values()] : result.issues);
      setNext(result.next_before);
    } catch { if (current === generation.current) setError(true); }
    finally { if (current === generation.current) { pending.current = false; setLoading(false); } }
  }
  useEffect(() => {
    const current = [api, environments, route, pageUrl, show, involving];
    const sameSelection = current.every((value, index) => value === selection.current[index]);
    selection.current = current;
    generation.current++; pending.current = false;
    // Refresh existing rows in place. Clearing them (or inserting a spinner above
    // them) invalidates focus and in-progress pointer clicks for no data change.
    if (!sameSelection) { setIssues([]); setNext(null); }
    void load(undefined, sameSelection && issues.length > 0);
    return () => { generation.current++; };
  }, [api, environments, route, pageUrl, show, involving, refreshKey]);
  const pages = new Map<string, Issue[]>();
  for (const issue of issues) {
    const key = issue.url ?? issue.route_key ?? '';
    pages.set(key, [...(pages.get(key) ?? []), issue]);
  }
  return <div class="page-reports">
    <div class="report-filters">
      {onScopeChange && <fieldset class="report-filter segmented" data-filter="scope">
        <legend>{t.pages}</legend>
        <button type="button" data-value="page" aria-pressed={route !== undefined} onClick={() => onScopeChange('page')}>{t.thisPage}</button>
        <button type="button" data-value="all" aria-pressed={route === undefined} onClick={() => onScopeChange('all')}>{t.allPages}</button>
      </fieldset>}
      <ReportFilter show={show} onChange={onShowChange} lang={lang}/>
    </div>
    {loading && <p role="status">{t.loading}</p>}
    {error && <p role="alert">{t.loadError} <button onClick={() => void load(next ?? undefined)}>{t.retry}</button></p>}
    {!loading && !error && !issues.length && <p>{t.noPageReports}</p>}
    {route !== undefined && onOpen ? <ol class="issue-list">{issues.map(issue => <li key={issue.id}>
      <button type="button" class="issue-item" disabled={issue.status === 'sending'} onClick={() => onOpen(issue)}>
        <span class="row-title">{myTurn(issue) && <span class="turn-dot" role="img" aria-label={t.yourTurn}/>}{issue.urgent && <span class="urgent-mark">{t.urgent}</span>}<span class="issue-number">#{issue.number}</span><strong>{issue.title}</strong>{word(issue) && <span class="row-word">{word(issue)}</span>}</span>
        {message(issue) && <span class="row-message">{message(issue)}</span>}
      </button>
    </li>)}</ol> : [...pages].map(([url, reports]) => {
      const page = pageLink(url);
      return <section class="page-report-group" key={url}>
        <h3>{page ? <a href={page.href} rel="noreferrer">{page.label}</a> : reports[0].route_key}</h3>
        {page && <p class="muted">{page.origin}</p>}
        <ul>{reports.map(issue => {
          const link = pageLink(issue.url, issue.id);
          return <li key={issue.id}>{link ? <a href={link.href} rel="noreferrer">#{issue.number} · {issue.title}</a> : issue.title}{word(issue) && <span class="row-word">{word(issue)}</span>}</li>;
        })}</ul>
      </section>;
    })}
    {next && !error && <button type="button" data-action="more-reports" disabled={loading} onClick={() => void load(next)}>{t.moreReports}</button>}
  </div>;
}
