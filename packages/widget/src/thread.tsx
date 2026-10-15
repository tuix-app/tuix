import type { ComponentChildren } from 'preact';
import { MentionField, CommentText, type Mention, type EscapeRef } from './mentions';
import type { Api } from './api';
import type { translations } from './i18n';
import type { Issue } from './types';

/** Pieces of a report's thread that the side panel and the anchored chat window share, so the two cannot drift apart. */
type T = ReturnType<typeof translations>;

export const CloseIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>;

/** Replies in the order the server sent them. Text nodes only; mentions are chips. */
export function ThreadComments({ comments, lang, t }: { comments: NonNullable<Issue['comments']>; lang?: string; t: T }) {
  return <>{comments.map(comment => <article class="comment" key={comment.id}><div class="issue-meta"><strong>{comment.author.name}</strong>{comment.pending && <span role="status">{t.sending}</span>}{comment.team && <span class="status" data-status="team">{t.team}</span>}<time>{new Date(comment.inserted_at).toLocaleString(lang)}</time></div><p><CommentText comment={comment}/></p></article>)}</>;
}

interface ReplyProps {
  api: Pick<Api, 'request'>; thread: Pick<Issue, 'id' | 'can_mention'>; t: T; value: string; onValue: (value: string) => void; busy: boolean;
  picks: Mention[]; onPick: (mention: Mention) => void; escape: EscapeRef; onSubmit: () => void;
}
/** The reply form: the mention-aware textarea and Reply. Sending, the pending comment and the restore on failure stay with the owner of the thread. */
export function ReplyForm({ api, thread, t, value, onValue, busy, picks, onPick, escape, onSubmit }: ReplyProps) {
  return <form onSubmit={event => { event.preventDefault(); onSubmit(); }}>
    <MentionField key={thread.id} api={api} issue={thread.id} enabled={!!thread.can_mention} label={t.replyLabel} t={t} value={value} onValue={onValue}
      picks={picks} onPick={onPick} escape={escape}/><button type="submit" class="primary" disabled={busy}>{t.reply}</button></form>;
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
    {!reviewing ? <div class="verification-actions">{works && <button class="primary" data-state-action="done" disabled={busy} onClick={onWorks}>{t.actionDone}</button>}{broken && <button data-state-action="open" disabled={busy} onClick={onBroken}>{t.stillBroken}</button>}</div> : <form onSubmit={event => { event.preventDefault(); onSend(); }}>
      <label>{t.reviewNote}<textarea value={note} onInput={event => onNote(event.currentTarget.value)} required maxLength={2000} disabled={busy}/></label>
      {evidence}
      <div class="verification-actions"><button type="button" disabled={busy} onClick={onCancel}>{t.cancel}</button><button type="submit" class="primary" disabled={busy || capturing || !note.trim()}>{busy ? t.sending : t.sendReview}</button></div>
    </form>}
  </div>;
}
