import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Api } from './api';
import type { translations } from './i18n';
import type { Person, Segment } from './types';

/** A person picked in the composer: the id the server takes and the label inserted after "@". */
export interface Mention { id: string; label: string }
/** The panel's and the chat window's Escape handlers ask this first: true when it closed an open suggestion list. */
export type EscapeRef = { current: (() => boolean) | null };
/** Characters that cannot come right before a mention's "@" and that cannot follow its label. */
const BEFORE = /[\p{L}\p{M}\p{N}_@.]$/u, AFTER = /[\p{L}\p{M}\p{N}_]/u;
/** True when the code point just before `index` (not a lone UTF-16 unit, as the server reads it) cannot precede a mention's "@". */
const blocked = (text: string, index: number) => BEFORE.test(text.slice(0, index));
// Lookups wait 300 ms: the server limits each person to about 30 a minute (429 beyond that).
const LIMIT = 10, QUERY = 30, MAXLENGTH = 2000, DEBOUNCE = 300, ANNOUNCE = 400;

/** The "@query" being typed before the caret, as the matching rule allows it to start; null when there is none. */
export function mentionAt(text: string, caret: number): { at: number; query: string } | null {
  const before = text.slice(0, caret), at = before.lastIndexOf('@'), query = before.slice(at + 1);
  return at < 0 || [...query].length > QUERY || /[\r\n]/.test(query) || blocked(before, at) ? null : { at, query };
}

/** Of `labels`, those the body mentions by the server's matching rule (§5): the longest label wins at each "@". */
export function mentioned(body: string, labels: string[]): Set<string> {
  const sorted = [...new Set(labels)].filter(Boolean).sort((a, b) => b.length - a.length), found = new Set<string>();
  for (let index = 0; index < body.length; index++) {
    if (body[index] !== '@' || blocked(body, index)) continue;
    const label = sorted.find(label => body.startsWith(label, index + 1) && !AFTER.test(String.fromCodePoint(body.codePointAt(index + 1 + label.length) ?? 32)));
    if (label) { found.add(label); index += label.length; }
  }
  return found;
}

/** The ids to send with a reply: picked people whose "@Label" is still in the body, once each. */
export function mentionIds(body: string, picks: Mention[]): string[] {
  const present = mentioned(body, picks.map(pick => pick.label));
  return [...new Set(picks.filter(pick => present.has(pick.label)).map(pick => pick.id))];
}

/** People a signed session may mention in the report's thread (`GET /v1/issues/:id/people`). */
export const searchPeople = (api: Pick<Api, 'request'>, issue: string, query: string) =>
  api.request<{ people: Person[] }>('/issues/' + encodeURIComponent(issue) + '/people?q=' + encodeURIComponent(query));

/** A comment's text with its mentions as chips. Text nodes only: segments never become HTML. */
export function CommentText({ comment }: { comment: { body: string; segments?: Segment[] } }) {
  if (!Array.isArray(comment.segments)) return <>{comment.body}</>;
  return <>{comment.segments.map(segment => typeof (segment as { mention?: unknown }).mention === 'string'
    ? <span class="mention">@{(segment as { mention: string }).mention}</span>
    : String((segment as { text?: unknown }).text ?? ''))}</>;
}

interface FieldProps {
  api: Pick<Api, 'request'>; issue: string; enabled: boolean; label: string; t: ReturnType<typeof translations>;
  value: string; onValue: (value: string) => void; picks: Mention[]; onPick: (mention: Mention) => void; escape: EscapeRef;
}

/**
 * The thread reply textarea with @-mention suggestions: typing "@" at a boundary asks the server
 * for people (debounced, stale answers dropped, each query once per thread) and lists them under the textarea. Without
 * `enabled` it is a plain textarea; a failed lookup only hides the list.
 */
export function MentionField({ api, issue, enabled, label, t, value, onValue, picks, onPick, escape }: FieldProps) {
  const [people, setPeople] = useState<Person[]>([]), [active, setActive] = useState(0), [live, setLive] = useState(''), [off, setOff] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null), list = useRef<HTMLUListElement>(null);
  const trigger = useRef<{ at: number; query: string } | null>(null), dismissed = useRef(-1), sequence = useRef(0);
  // The person a finger is on in the list: a tap (like any click, a screen reader's too) picks on click, and the list outlives the textarea's blur until then.
  const touched = useRef<{ timer?: ReturnType<typeof setTimeout> } | null>(null);
  const release = () => { clearTimeout(touched.current?.timer); touched.current = null; };
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(), liveTimer = useRef<ReturnType<typeof setTimeout>>();
  // Answers by query for this thread (the field is keyed by the report), as the server reads the query: trimmed, any case.
  const answers = useRef(new Map<string, Person[]>());
  const on = enabled && !off, open = on && people.length > 0;
  const say = (text: string) => { clearTimeout(liveTimer.current); liveTimer.current = setTimeout(() => setLive(text), ANNOUNCE); };
  function close(dismiss = false) {
    if (dismiss && trigger.current) dismissed.current = trigger.current.at;
    trigger.current = null; sequence.current++; clearTimeout(searchTimer.current); clearTimeout(liveTimer.current);
    setPeople([]); setLive('');
  }
  function update() {
    const field = area.current;
    const found = on && field && field.selectionStart === field.selectionEnd ? mentionAt(field.value, field.selectionStart) : null;
    if (!found) { dismissed.current = -1; if (trigger.current) close(); return; }
    if (found.at === dismissed.current || (found.at === trigger.current?.at && found.query === trigger.current.query)) return;
    if (found.at !== trigger.current?.at && mentioned(field!.value, picks.map(pick => pick.label)).size >= LIMIT) {
      close(); dismissed.current = found.at; say(t.mentionLimit); return;
    }
    trigger.current = found; const sequenceNow = ++sequence.current, key = found.query.trim().toLowerCase();
    clearTimeout(searchTimer.current);
    const show = (matches: Person[]) => {
      if (sequenceNow !== sequence.current) return;
      if (!matches.length && /\s$/.test(found.query)) { close(true); return; }
      setPeople(matches); setActive(0); say(matches.length ? t.mentionCount.replace('{count}', String(matches.length)) : t.mentionNone);
    };
    const known = answers.current.get(key);
    if (known) { show(known); return; }
    searchTimer.current = setTimeout(() => searchPeople(api, issue, found.query).then(result => {
      const matches = Array.isArray(result?.people) ? result.people.slice(0, 8) : [];
      answers.current.set(key, matches); show(matches);
    }).catch(failure => {
      // Any failure (a 429 too) only hides the list; a session that may not mention gets no composer for this thread.
      if (sequenceNow === sequence.current) { close(true); if ((failure as { status?: number } | null)?.status === 403) setOff(true); }
    }), DEBOUNCE);
  }
  function pick(person: Person) {
    const field = area.current, found = trigger.current;
    if (!field || !found) return;
    // One space after the name, unless one follows the caret already: the caret then goes past it.
    const rest = field.value.slice(found.at + 1 + found.query.length), space = /^\s/.test(rest) ? '' : ' ';
    const insert = '@' + person.name + space, text = field.value.slice(0, found.at) + insert + rest;
    // The value is set from code, which maxlength does not check: a pick that would not fit inserts nothing.
    if (text.length > MAXLENGTH) { close(true); return; }
    field.value = text; const caret = found.at + insert.length + (space ? 0 : 1); field.setSelectionRange(caret, caret); field.focus();
    close(true); onValue(text); onPick({ id: person.id, label: person.name });
  }
  function keydown(event: KeyboardEvent) {
    if (!open || event.isComposing) return;
    const plain = !(event.shiftKey || event.altKey || event.ctrlKey || event.metaKey);
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !(event.shiftKey || event.altKey || event.ctrlKey || event.metaKey)) { event.preventDefault(); setActive((active + (event.key === 'ArrowDown' ? 1 : people.length - 1)) % people.length); }
    else if ((event.key === 'Enter' || event.key === 'Tab') && plain) { event.preventDefault(); pick(people[active]); }
    else if (event.key === 'Escape') { event.preventDefault(); close(true); }
  }
  // The panel's and the chat window's Escape handlers run first: an open list takes Escape and the panel or window stays.
  useLayoutEffect(() => { escape.current = open ? () => { close(true); return true; } : null; return () => { escape.current = null; }; }, [open]);
  // A new list scrolls into view whole; then the active option stays in view as it moves.
  useEffect(() => { list.current?.scrollIntoView?.({ block: 'nearest' }); }, [people]);
  useEffect(() => { list.current?.children[active]?.scrollIntoView?.({ block: 'nearest' }); }, [active]);
  useEffect(() => () => { release(); sequence.current++; clearTimeout(searchTimer.current); clearTimeout(liveTimer.current); }, []);
  return <div class="mention-field">
    <label>{label}<textarea ref={area} value={value} required maxLength={MAXLENGTH}
      onInput={event => { onValue(event.currentTarget.value); update(); }} onKeyDown={keydown} onBlur={() => { if (trigger.current && !touched.current) close(); }}
      onClick={() => { if (trigger.current) update(); }} onKeyUp={event => { if (trigger.current && /^(Arrow(Left|Right)|Home|End)$/.test(event.key)) update(); }}
      aria-autocomplete={on ? 'list' : undefined} aria-controls={open ? 'tuix-mention-list' : undefined}
      aria-activedescendant={open ? 'tuix-mention-' + active : undefined} aria-describedby={on ? 'tuix-mention-hint' : undefined}/></label>
    {open && <ul ref={list} id="tuix-mention-list" class="mention-list" role="listbox" aria-label={t.mentionList} onMouseDown={event => event.preventDefault()}
      onPointerCancel={release} onPointerUp={() => { if (touched.current) touched.current.timer = setTimeout(release, 500); }}>
      {people.map((person, index) => <li key={person.id} id={'tuix-mention-' + index} role="option" aria-selected={index === active ? 'true' : 'false'}
        onPointerDown={event => {
          // A finger picks on click (a tap), so touching the list to scroll it picks no one; a mouse or pen picks as it goes down.
          if ((event as PointerEvent).pointerType === 'touch') { release(); touched.current = {}; return; }
          event.preventDefault(); pick(person);
        }} onClick={() => { release(); pick(person); }}><span>{person.name}</span>{person.team && <span class="status" data-status="team">{t.team}</span>}</li>)}
    </ul>}
    {on && <p id="tuix-mention-hint" class="muted">{t.mentionHint}</p>}
    {on && <p class="visually-hidden" role="status">{live}</p>}
  </div>;
}
