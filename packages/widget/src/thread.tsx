import { Fragment, type ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { MentionField, CommentText, type Mention, type EscapeRef } from './mentions';
import type { Api } from './api';
import { turnLine, sentLine, eventLine, type translations } from './i18n';
import type { Issue } from './types';
import type { TextBuffer } from './text-buffer';
import { myTurn, type TurnChoice } from './states';

/** Pieces of a report's thread that the side panel and the anchored chat window share, so the two cannot drift apart. */
type T = ReturnType<typeof translations>;

export const CloseIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>;

/** Times without seconds: "Nov 22, 3:18 PM". */
const stamp: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' };
/** Everything said so far, in time order: the replies, and the small lines for takes, passes without a reply, urgent changes and decisions. Text nodes only; mentions are chips. */
export function ThreadComments({ comments, timeline = [], older = false, lang, t }: { comments: NonNullable<Issue['comments']>; timeline?: Issue['timeline']; older?: boolean; lang?: string; t: T }) {
  // With earlier replies still on the server, events before the oldest reply on screen belong to that earlier page.
  const first = older && comments.length ? Date.parse(comments[0].inserted_at) : -Infinity;
  const items: { at: number; node: ComponentChildren; key: string }[] = comments.map(comment => ({ at: Date.parse(comment.inserted_at), key: comment.id, node: <Message comment={comment} lang={lang} t={t}/> }));
  for (const event of timeline) {
    const text = eventLine(event, lang), at = Date.parse(event.at);
    if (text && at >= first) items.push({ at, key: 'e' + event.id, node: <p class="event-line">{text}<time dateTime={event.at}>{new Date(event.at).toLocaleString(lang, stamp)}</time></p> });
  }
  // Replies keep the server's order among themselves; a stable sort slots events between them by time.
  items.sort((a, b) => a.at - b.at);
  return <>{items.map(item => <Fragment key={item.key}>{item.node}</Fragment>)}</>;
}

function Message({ comment, lang, t }: { comment: NonNullable<Issue['comments']>[number]; lang?: string; t: T }) {
  const sent = sentLine(comment, lang);
  return <article class="comment"><div class="issue-meta"><strong>{comment.author.name}</strong>{comment.pending && <span role="status">{t.sending}</span>}{comment.team && <span class="role">{t.team}</span>}{sent && <span class="sent">{sent}</span>}<time>{new Date(comment.inserted_at).toLocaleString(lang, stamp)}</time></div><p><CommentText comment={comment}/></p></article>;
}

/** The one turn line: a small peach dot when it is the viewer's turn, then the words. Nothing for a server that sends no turn. */
export function TurnLine({ issue, lang }: { issue: Parameters<typeof turnLine>[0]; lang?: string }) {
  const text = turnLine(issue, lang);
  return text ? <p class="turn-line">{myTurn(issue) && <span class="turn-dot" aria-hidden="true"/>}<span class="turn">{text}</span></p> : null;
}

/** The only links the Design row opens: the server validates them too, but the widget may talk to any server version. */
export const figmaHref = (url: unknown): string | null => typeof url === 'string' && /^https:\/\/(www\.)?figma\.com\//.test(url) ? url : null;

/** A quiet "Design" row with the component name and a link to its Figma node; nothing without a valid `design_link`. Display only. */
export function DesignRow({ link, t }: { link: Issue['design_link']; t: T }) {
  const href = figmaHref(link?.url);
  if (!href) return null;
  return <p class="design-row muted"><span>{t.design}</span><a href={href} target="_blank" rel="noopener noreferrer">{t.openInFigma}</a>{typeof link?.component === 'string' && link.component && <code>{link.component}</code>}</p>;
}

interface ReplyProps {
  api: Pick<Api, 'request'>; thread: Pick<Issue, 'id' | 'can_mention' | 'turn_options' | 'default_turn'>; t: T; buffer: TextBuffer; busy: boolean;
  picks: Mention[]; onPick: (mention: Mention) => void; escape: EscapeRef; onSubmit: (turn?: TurnChoice) => void;
  /** Send is the view's one primary button; false when another action (Works, Reopen) is. */
  primary?: boolean;
}
/**
 * The reply form: the mention-aware textarea and Send. A signed team session (the server sent `turn_options`) also gets Send to: the
 * people the turn may go to, preselected by the server's default, ending with Keep with me. One Send button. Everyone else sends no turn.
 * Sending, the pending comment and the restore on failure stay with the owner of the thread.
 */
export function ReplyForm({ api, thread, t, buffer, busy, picks, onPick, escape, onSubmit, primary = true }: ReplyProps) {
  const options = thread.turn_options ?? [];
  const choosing = options.length > 0;
  const preset = thread.default_turn && options.some(option => option.value === thread.default_turn) ? thread.default_turn : '';
  const [chosen, setChosen] = useState<string | null>(null);
  // A new thread, or a new default after a reply, starts from the server's choice again.
  useEffect(() => setChosen(null), [thread.id, preset]);
  const value = chosen ?? preset;
  return <form onSubmit={event => { event.preventDefault(); onSubmit(choosing && value ? value : undefined); }}>
    <MentionField key={thread.id} api={api} issue={thread.id} enabled={!!thread.can_mention} label={t.replyLabel} t={t} buffer={buffer}
      picks={picks} onPick={onPick} escape={escape}/>{choosing
      ? <div class="reply-actions"><label class="send-to">{t.sendTo}<select data-send-to value={value} disabled={busy} onChange={event => setChosen(event.currentTarget.value)}>{!preset && <option value="">{t.sendDefault}</option>}{options.map(option => <option key={option.value} value={option.value}>{option.reporter ? `${option.name} (${t.reporterTag})` : option.name}</option>)}<option value="keep">{t.keepWithMe}</option></select></label><button type="submit" class={primary ? 'primary' : undefined} disabled={busy}>{t.sendReply}</button></div>
      : <button type="submit" class={primary ? 'primary' : undefined} disabled={busy}>{t.sendReply}</button>}</form>;
}

interface VerifyProps {
  t: T; thread: Pick<Issue, 'fixed_note'>; busy: boolean; reviewing: boolean; capturing?: boolean; note: string;
  /** Which decisions the caller may take (the server's allowed states). */
  works: boolean; broken: boolean;
  /** Content before the developer's note (the panel's title and hints) and inside the Still broken form (the panel's new screenshot). */
  head?: ComponentChildren; evidence?: ComponentChildren;
  onNote: (value: string) => void; onWorks: () => void; onBroken: () => void; onCancel: () => void; onSend: () => void;
}
/** The reporter's decision on a report in review: Done, or Still broken with the note it needs. */
export function VerifyTools({ t, thread, busy, reviewing, capturing = false, note, works, broken, head, evidence, onNote, onWorks, onBroken, onCancel, onSend }: VerifyProps) {
  return <div class="verify-tools">
    {head}
    {thread.fixed_note && <div class="fix-note"><strong>{t.developerNote} · {thread.fixed_note.author.name}</strong><p><CommentText comment={thread.fixed_note}/></p></div>}
    {!reviewing ? <div class="verification-actions">{works && <button class="primary" data-state-action="works" disabled={busy} onClick={onWorks}>{t.actionWorks}</button>}{broken && <button data-state-action="still_broken" disabled={busy} onClick={onBroken}>{t.stillBroken}</button>}</div> : <form onSubmit={event => { event.preventDefault(); onSend(); }}>
      <label>{t.reviewNote}<textarea value={note} onInput={event => onNote(event.currentTarget.value)} required maxLength={2000} disabled={busy}/></label>
      {evidence}
      <div class="verification-actions"><button type="button" disabled={busy} onClick={onCancel}>{t.cancel}</button><button type="submit" class="primary" disabled={busy || capturing || !note.trim()}>{busy ? t.sending : t.stillBroken}</button></div>
    </form>}
  </div>;
}

export interface ActionProps {
  t: T; busy: boolean;
  /** The server's `actions` (or what an older server's `allowed_states` allow). */
  available: string[];
  /** Mark fixed replaces Fix ready in a local environment (it has its own form); the reporter's Works / Still broken sit in the verify block. */
  local: boolean; verifying: boolean; closed: boolean; take: boolean;
  /** An action waiting for its note (Still broken needs one, Reopen may carry one) and the note typed. */
  pending: string | null; note: string; onNote: (value: string) => void;
  /** The urgent toggle, a text button at the end of the row; null when the server does not allow it or the conversation is closed. */
  urgent: { on: boolean; toggle: () => void } | null;
  onAction: (action: string) => void; onPending: (action: string | null) => void; onSend: () => void; onTake: () => void;
}
const quiet = ['fix_ready', 'works', 'still_broken', 'close'] as const;
/** What the caller may do besides replying, all quiet: Fix ready, Works for someone else's report, Take it, Close; on a closed conversation the one primary button, Reopen, and the line that says why there is no reply box. */
export function ThreadActions({ t, busy, available, local, verifying, closed, take, pending, note, onNote, urgent, onAction, onPending, onSend, onTake }: ActionProps) {
  const may = (action: string) => available.includes(action);
  const label: Record<string, string> = { fix_ready: t.actionFixReady, works: t.actionWorks, still_broken: t.stillBroken, close: t.actionClose, reopen: t.actionReopen };
  if (pending) {
    const reopening = pending === 'reopen';
    return <form class="state-note" onSubmit={event => { event.preventDefault(); if (reopening || note.trim()) onSend(); }}>
      <label>{reopening ? t.reopenNote : t.reviewNote}<textarea value={note} onInput={event => onNote(event.currentTarget.value)} required={!reopening} maxLength={2000} disabled={busy}/></label>
      <div class="verification-actions"><button type="button" disabled={busy} onClick={() => onPending(null)}>{t.cancel}</button><button type="submit" class="primary" disabled={busy || (!reopening && !note.trim())}>{label[pending]}</button></div>
    </form>;
  }
  if (closed) return <div class="closed-note"><p>{may('reopen') ? t.closedNoReply : t.closedOnly}</p>{may('reopen') && <div class="thread-actions"><button type="button" class="primary" data-state-action="reopen" disabled={busy} onClick={() => onAction('reopen')}>{t.actionReopen}</button><button type="button" class="text-button" data-action="reopen-note" disabled={busy} onClick={() => onPending('reopen')}>{t.reopenWithNote}</button></div>}</div>;
  const shown = quiet.filter(action => may(action) && !(verifying && (action === 'works' || action === 'still_broken')) && !(local && action === 'fix_ready'));
  if (!shown.length && !take && !urgent) return null;
  return <div class="thread-actions">
    {shown.map(action => <button type="button" key={action} data-state-action={action} disabled={busy} onClick={() => action === 'still_broken' ? onPending(action) : onAction(action)}>{label[action]}</button>)}
    {take && <button type="button" data-action="assign" disabled={busy} onClick={onTake}>{t.takeIt}</button>}
    {urgent && <button type="button" class="text-button" data-action="urgent" disabled={busy} onClick={urgent.toggle}>{urgent.on ? t.clearUrgent : t.markUrgent}</button>}
  </div>;
}
