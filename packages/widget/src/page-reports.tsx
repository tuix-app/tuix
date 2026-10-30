import { useEffect, useRef, useState, useId } from 'preact/hooks';
import type { Api } from './api';
import type { Issue } from './types';
import { translations, statusLabel } from './i18n';
import { showQuery, type Show, type Involving } from './preferences';
import { stateOf } from './states';

export function pageLink(raw?: string, issueId?: string) {
  try {
    const url = new URL(raw ?? '');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const label = url.pathname + url.search;
    if (issueId) url.searchParams.set('tuix', issueId);
    return { href: url.href, label, origin: url.host };
  } catch { return null; }
}

/** Involving: reports the caller sent or fixes, or everyone's. */
export function InvolvingFilter({ involving, onChange, lang }: {
  involving: Involving; onChange: (value: Involving) => void; lang?: 'en' | 'pl';
}) {
  const t = translations(lang);
  return <fieldset class="report-filter segmented" data-filter="involving">
    <legend>{t.involving}</legend>
    <button type="button" data-value="me" aria-pressed={involving === 'me'} onClick={() => onChange('me')}>{t.mine}</button>
    <button type="button" data-value="everyone" aria-pressed={involving === 'everyone'} onClick={() => onChange('everyone')}>{t.everyone}</button>
  </fieldset>;
}

/** A single status choice: All reports always includes finished reports. */
export function ReportFilter({ show, onChange, lang }: {
  show: Show; onChange: (value: Show) => void; lang?: 'en' | 'pl';
}) {
  const t = translations(lang), id = useId();
  const help = show === 'finished' ? t.finishedHelp : show === 'unresolved' ? t.unresolvedHelp : '';
  return <div class="report-filter report-status" data-filter="show">
    <label for={id}>{t.status}</label>
    <select id={id} value={show} aria-describedby={help ? id + '-help' : undefined} onChange={event => onChange(event.currentTarget.value as Show)}>
      {([['unresolved', t.statusUnresolved], ['open', t.statusActive], ['verify', t.statusReady], ['finished', t.statusFinished], ['all', t.statusEverything]] as const).map(([value, label]) =>
        <option key={value} value={value}>{label}</option>)}
    </select>
    {help && <p id={id + '-help'} class="filter-help">{help}</p>}
  </div>;
}

export function PageReports({ api, environments, lang, route, pageUrl, show, onShowChange, onScopeChange, involving = 'everyone', onInvolvingChange, onOpen, refreshKey }: {
  api: Pick<Api, 'request'>; environments: string; lang?: 'en' | 'pl';
  route?: string; pageUrl?: string; show: Show; onShowChange: (value: Show) => void;
  onScopeChange?: (value: 'page' | 'all') => void;
  involving?: Involving; onInvolvingChange?: (value: Involving) => void;
  onOpen?: (issue: Issue) => void; refreshKey?: unknown;
}) {
  const t = translations(lang);
  const [issues, setIssues] = useState<Issue[]>([]), [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState(false);
  const generation = useRef(0), pending = useRef(false);
  const selection = useRef<unknown[]>([]);
  async function load(before?: number, background = false) {
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
      const result = await api.request<{ issues: Issue[]; next_before: number | null }>('/issues?' + query);
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
      {onInvolvingChange && <InvolvingFilter involving={involving} onChange={onInvolvingChange} lang={lang}/>}
    </div>
    {loading && <p role="status">{t.loading}</p>}
    {error && <p role="alert">{t.loadError} <button onClick={() => void load(next ?? undefined)}>{t.retry}</button></p>}
    {!loading && !error && !issues.length && <p>{involving === 'me' ? t.noOwnReports : t.noPageReports}</p>}
    {route !== undefined && onOpen ? <ol class="issue-list">{issues.map(issue => <li key={issue.id}>
      <button type="button" class="issue-item" disabled={issue.status === 'sending'} onClick={() => onOpen(issue)}>
        <strong>{issue.title}</strong>
        <span class="report-kind">{t[issue.type as 'bug'] ?? issue.type}{issue.severity ? ` · ${t[issue.severity as 'major'] ?? issue.severity}` : ''}</span>
        <span class="issue-meta"><span>#{issue.number}</span><span>{issue.author.name}</span><span>{new Date(issue.inserted_at).toLocaleDateString(lang)}</span><span class="status" data-status={stateOf(issue)}>{statusLabel(stateOf(issue), lang)}</span></span>
      </button>
    </li>)}</ol> : [...pages].map(([url, reports]) => {
      const page = pageLink(url);
      return <section class="page-report-group" key={url}>
        <h3>{page ? <a href={page.href} rel="noreferrer">{page.label}</a> : reports[0].route_key}</h3>
        {page && <p class="muted">{page.origin}</p>}
        <ul>{reports.map(issue => {
          const link = pageLink(issue.url, issue.id);
          return <li key={issue.id}>{link ? <a href={link.href} rel="noreferrer">#{issue.number} · {issue.title}</a> : issue.title}<span class="status" data-status={stateOf(issue)}>{statusLabel(stateOf(issue), lang)}</span></li>;
        })}</ul>
      </section>;
    })}
    {next && !error && <button type="button" data-action="more-reports" disabled={loading} onClick={() => void load(next)}>{t.moreReports}</button>}
  </div>;
}
